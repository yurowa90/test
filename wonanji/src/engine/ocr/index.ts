// 이미지(사진·캡처) 문항 파일 → HWPX. 글자 인식(OCR)은 브라우저 안에서만 합니다.
//
// 흐름: 기울기 바로잡기 → 글자 크기에 맞춰 크기 조정 → 한국어 인식 → 선·동그라미·그림 찾기
//      → 동그라미 안 글자와 의심스러운 로마자만 다시 인식 → PDF와 같은 좌표 자료로 바꿔
//      PDF 해석기(표 복원·그림 자르기·문항 나누기)에 넘깁니다.
// 인식이 불확실한 글자는 결과에 빨간색으로 남겨 선생님이 한글에서 대조하게 합니다(내용을 추측해 채우지 않음).
import type { PBox, PdfPageData, PSeg, PText } from "../pdf/extract";
import { analyzePdf } from "../pdf/layout";
import { synthesizeHwpx, type CropResult } from "../pdf/synth";
import type { Box } from "../pdf/lines";
import { classifyJamo, findCircles, findFigures, findSegments, type Circle } from "./detect";
import { getOcrDeps, type OcrDeps, type OcrLine, type OcrSymbol, type OcrWord } from "./deps";
import { binarize, columnSplit, components, cropGray, cropRGBA, estimateSkew, lineHeight, rotateRGBA, scaleGray, scaleRGBA, toGray, type Gray, type RGBA, type Rect } from "./raster";

export { setOcrDeps, type OcrDeps } from "./deps";

export interface OcrLoad {
  hwpx: Uint8Array;
  numbers: number[];
  notes: string[];
  columnWidthHU: number;
}

/** 인식에 알맞은 글자 높이(px) */
const TARGET_EM = 36;
/** 좌표를 pt로 바꿀 때 본문 글자 높이를 10pt로 */
const BODY_PT = 10;

const HANGUL = /[가-힣]/;
const JAMO = /^[ㄱ-ㅎ]$/;
const NORMAL = /^[가-힣ㄱ-ㅎㅏ-ㅣ0-9A-Za-z.,?!()[\]<>〈〉「」『』:;~\-+=%'"‘’“”·…/×]+$/;

interface Sym extends OcrSymbol {
  unsure?: boolean;
  /** 문항 번호로 다시 읽어 넣은 글자 */
  qnum?: boolean;
}
interface CircleGlyph {
  c: Circle;
  ch: string;
  unsure: boolean;
}
interface Word {
  syms: Sym[];
  bbox: Rect;
  conf: number;
  line: OcrLine;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const overlapX = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
const overlapY = (a: Rect, b: Rect) => Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const areaOf = (r: Rect) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);

/** 시험·조정용: 중간 결과를 들여다봅니다. */
export interface OcrDebug {
  work: Gray;
  em: number;
  lines: OcrLine[];
  circles: { box: Rect; ch: string; unsure: boolean }[];
  segs: Rect[];
  figs: (Rect & { kind: string })[];
  texts: PText[];
  pt: number;
}

export async function imageToHwpx(name: string, bytes: Uint8Array, debug?: (d: OcrDebug) => void): Promise<OcrLoad> {
  const d = await getOcrDeps();
  try {
    return await run(name, bytes, d, debug);
  } finally {
    await d.release?.();
  }
}

async function run(name: string, bytes: Uint8Array, d: OcrDeps, debug?: (d: OcrDebug) => void): Promise<OcrLoad> {
  const notes: string[] = [];
  let img = await d.decode(bytes);
  const side = Math.max(img.width, img.height);
  if (side > 6000) img = scaleRGBA(img, 6000 / side);

  // 1) 기울기
  {
    const g = toGray(img);
    const s = Math.min(1, 1400 / g.width);
    const small = s < 1 ? scaleGray(g, s) : g;
    const bin = binarize(small, Math.max(15, Math.round(small.width / 40)));
    const angle = estimateSkew(bin, small.width, small.height);
    if (Math.abs(angle) > (0.15 * Math.PI) / 180) {
      img = rotateRGBA(img, -angle);
      notes.push(`기울어진 이미지를 ${((angle * 180) / Math.PI).toFixed(1)}° 바로잡았습니다.`);
    }
  }

  // 2) 글자 크기를 어림해 인식하기 좋은 크기로
  const gray = toGray(img);
  const s0 = Math.min(1, 1600 / gray.width);
  const probe = s0 < 1 ? scaleGray(gray, s0) : gray;
  const emOrig = lineHeight(binarize(probe, Math.max(15, Math.round(probe.width / 40))), probe.width, probe.height) / s0;
  const k = Math.min(3, Math.max(0.35, TARGET_EM / Math.max(4, emOrig)));
  const work = Math.abs(k - 1) > 0.05 ? scaleGray(gray, k) : gray;
  if (emOrig < 16) notes.push(`글자가 작게 찍힌 이미지입니다(글줄 높이 약 ${Math.round(emOrig)}픽셀). 더 가깝게·밝게 찍거나 해상도를 높이면 정확해집니다.`);

  // 3) 한국어 인식. 2단이면 단마다 따로(한꺼번에 읽으면 양쪽 글줄을 한 줄로 합치는 일이 있음)
  const pre = binarize(work, Math.round(TARGET_EM * 2.5) | 1, 0.15, 210);
  const split = columnSplit(pre, work.width, work.height, TARGET_EM);
  const rects: Rect[] =
    split == null
      ? [{ x0: 0, y0: 0, x1: work.width, y1: work.height }]
      : [
          { x0: 0, y0: 0, x1: split - 2, y1: work.height },
          { x0: split + 2, y0: 0, x1: work.width, y1: work.height },
        ];
  const lines: OcrLine[] = [];
  for (const r of rects) lines.push(...(await d.recognize(work, "kor", "3", r)).filter((l) => l.words.length));
  if (!lines.length) throw new Error(`${name}: 글자를 찾지 못했습니다. 문제지가 또렷하게 보이는 이미지를 올려 주세요.`);
  const em = median(lines.filter((l) => l.words.length >= 3).map((l) => l.bbox.y1 - l.bbox.y0)) || TARGET_EM;

  // 4) 선·동그라미·그림
  const W = work.width;
  const H = work.height;
  const bin = binarize(work, Math.round(em * 2.5) | 1, 0.15, 210);
  const { labels, comps } = components(bin, W, H);
  const found = findSegments(bin, W, H, em);
  const onSeg = found.onSeg;
  // 글줄 한가운데를 지나는 가로선은 글자 획이 이어져 보인 것(진짜 선·밑줄은 글자 위아래에 있음)
  const allWords = lines.flatMap((l) => l.words);
  const segs = found.segs.filter((s) => {
    if (s.dir !== "h") return true;
    const len = s.x1 - s.x0;
    let covered = 0;
    for (const w of allWords) {
      const h = w.bbox.y1 - w.bbox.y0;
      if (s.y0 > w.bbox.y0 + h * 0.18 && s.y0 < w.bbox.y1 - h * 0.18) covered += overlapX(s, w.bbox);
    }
    return covered < len * 0.5;
  });
  const figs = findFigures(comps, labels, onSeg, work, em, allWords.filter((w) => w.conf >= 40).map((w) => w.bbox));
  const inImage = (x: number, y: number) => figs.some((f) => f.kind === "image" && x > f.x0 && x < f.x1 && y > f.y0 && y < f.y1);
  const circles = findCircles(comps, labels, W, em).filter((c) => !inImage((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2));

  // 5) 동그라미: 속이 빈 것은 ○(글자 획의 ㅇ이 아니도록 사방이 떨어져 있어야), 안에 글자가 있으면 그 글자만 따로 인식
  const neighbors = (c: Circle) =>
    comps.some((o) => {
      if (o === c.ring || c.inner.includes(o)) return false;
      const near = em * 0.14;
      const vOver = Math.min(o.y1, c.y1) - Math.max(o.y0, c.y0) > 0;
      const hOver = Math.min(o.x1, c.x1) - Math.max(o.x0, c.x0) > 0;
      return (vOver && ((o.x0 >= c.x1 && o.x0 - c.x1 < near) || (o.x1 <= c.x0 && c.x0 - o.x1 < near))) || (hOver && ((o.y0 >= c.y1 && o.y0 - c.y1 < near) || (o.y1 <= c.y0 && c.y0 - o.y1 < near)));
    });
  const circleGlyphs: CircleGlyph[] = [];
  const withInner = circles.filter((c) => c.inner.length || c.touching);
  for (const c of circles) if (!c.inner.length && !c.touching && !neighbors(c)) circleGlyphs.push({ c, ch: "○", unsure: false });
  if (withInner.length) {
    const res = await stripOcr(d, withInner.map((c) => innerCrop(work, bin, c)), "kor");
    withInner.forEach((c, i) => {
      const m = circled(res[i].text);
      circleGlyphs.push({ c, ch: m.ch, unsure: m.unsure || res[i].conf < 60 });
    });
    fixChoiceOrder(circleGlyphs, em, split);
  }
  const onCircle = (r: Rect) => {
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    return circleGlyphs.some(({ c }) => {
      const pad = (c.x1 - c.x0) * 0.08;
      return (cx > c.x0 - pad && cx < c.x1 + pad && cy > c.y0 - pad && cy < c.y1 + pad) || overlapX(c, r) * overlapY(c, r) > areaOf(r) * 0.45;
    });
  };

  // 6) 낱말 → 글자 목록(동그라미 자리의 엉뚱한 글자는 뺌).
  // 상자 테두리 근처에서 같은 글줄을 두 번 내놓는 일이 있어, 크게 겹치는 낱말은 확신이 높은 쪽만 둡니다.
  const flat = lines.flatMap((l) => l.words.map((w) => ({ l, w })));
  const dropped = new Set<OcrWord>();
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i];
      const b = flat[j];
      if (a.l === b.l || dropped.has(a.w) || dropped.has(b.w)) continue;
      const inter = overlapX(a.w.bbox, b.w.bbox) * overlapY(a.w.bbox, b.w.bbox);
      if (inter > Math.min(areaOf(a.w.bbox), areaOf(b.w.bbox)) * 0.5) dropped.add(a.w.conf >= b.w.conf ? b.w : a.w);
    }
  }
  // 단 구분선·표 선 위에서 선을 글자(|, ㅣ, -, ㅡ)로 읽은 것
  const onRule = (x: OcrSymbol) => {
    if (!/^[|ㅣlI1![\]ㅡ\-—_~'`.,:;]+$/.test(x.text)) return false;
    const cx = (x.bbox.x0 + x.bbox.x1) / 2;
    const cy = (x.bbox.y0 + x.bbox.y1) / 2;
    const tol = Math.max(3, em * 0.12);
    return segs.some((g) =>
      g.dir === "v" ? Math.abs(cx - g.x0) < tol + g.lw && cy >= g.y0 - tol && cy <= g.y1 + tol : Math.abs(cy - g.y0) < tol + g.lw && cx >= g.x0 - tol && cx <= g.x1 + tol,
    );
  };
  let words: Word[] = [];
  for (const line of lines) {
    // 그림 가장자리에서 세로로 길게 묶인 가짜 글줄: 키 큰 낱말은 그림 조각으로 보고 버립니다.
    const tall = line.bbox.y1 - line.bbox.y0 > em * 1.8;
    for (const w of line.words) {
      if (dropped.has(w)) continue;
      if (tall && w.bbox.y1 - w.bbox.y0 > em * 1.5 && w.conf < 80) continue;
      // 글자 상자가 낱말 상자 밖을 가리키는 일이 있어 낱말 상자 안으로 잘라 맞춥니다.
      const clamp = (r: Rect): Rect => {
        const c = { x0: Math.max(r.x0, w.bbox.x0), y0: Math.max(r.y0, w.bbox.y0), x1: Math.min(r.x1, w.bbox.x1), y1: Math.min(r.y1, w.bbox.y1) };
        return c.x1 > c.x0 && c.y1 > c.y0 ? c : { ...w.bbox };
      };
      const syms: Sym[] = (w.symbols.length ? w.symbols : [{ text: w.text, conf: w.conf, bbox: w.bbox }])
        .filter((x) => x.text.trim())
        .map((x) => ({ ...x, bbox: clamp(x.bbox) }))
        .filter((x) => !onRule(x));
      const kept = syms.filter((s) => !onCircle(s.bbox));
      if (!kept.length) continue;
      words.push({ syms: kept, bbox: kept.length === syms.length ? w.bbox : bboxOf(kept.map((s) => s.bbox)), conf: w.conf, line });
    }
  }

  // 7) 선지 줄(① ㄱ ② ㄴ, ㄷ …): 동그라미 사이가 짧은 자모뿐이면 줄 인식 대신 덩어리 하나씩 다시 읽습니다.
  {
    const numbered = circleGlyphs.filter((g) => /[\u2460-\u2473]/.test(g.ch)).sort((a, b) => a.c.y0 - b.c.y0 || a.c.x0 - b.c.x0);
    const rows: CircleGlyph[][] = [];
    for (const g of numbered) {
      const row = rows.find((r) => Math.abs(r[0].c.y0 - g.c.y0) < em * 0.5 && (split == null || r[0].c.x0 < split === g.c.x0 < split));
      if (row) row.push(g);
      else rows.push([g]);
    }
    const ringIds = new Set(circles.flatMap((c) => [c.ring.id, ...c.inner.map((o) => o.id)]));
    type Cl = { box: Rect; row: number };
    const plans: { row: CircleGlyph[]; band: Rect; inRow: Word[]; clusters: Cl[]; marks: Rect[] }[] = [];
    for (const row of rows.filter((r) => r.length >= 3)) {
      row.sort((a, b) => a.c.x0 - b.c.x0);
      const right = split != null && row[0].c.x0 < split ? split : W;
      const band: Rect = { x0: row[0].c.x0, x1: right, y0: Math.min(...row.map((g) => g.c.y0)) - em * 0.15, y1: Math.max(...row.map((g) => g.c.y1)) + em * 0.15 };
      const inRow = words.filter((w) => {
        const cx = (w.bbox.x0 + w.bbox.x1) / 2;
        const cy = (w.bbox.y0 + w.bbox.y1) / 2;
        return cx > band.x0 && cx < band.x1 && cy > band.y0 && cy < band.y1;
      });
      const txt = inRow.map((w) => w.syms.map((x) => x.text).join("")).join("");
      if ((txt.match(/[가-힣]/g) ?? []).length > row.length) continue; // 문장 선지는 줄 인식 그대로
      const cs = comps.filter(
        (o) => !ringIds.has(o.id) && o.x0 >= band.x0 && o.x1 <= band.x1 && o.y0 >= band.y0 - em * 0.1 && o.y1 <= band.y1 + em * 0.2 && !row.some((g) => o.x0 >= g.c.x0 - 1 && o.x1 <= g.c.x1 + 1),
      );
      const small = (o: Rect) => o.y1 - o.y0 < em * 0.35 && o.x1 - o.x0 < em * 0.35;
      const glyphs = cs.filter((o) => !small(o)).sort((a, b) => a.x0 - b.x0);
      const clusters: Cl[] = [];
      for (const o of glyphs) {
        const last = clusters[clusters.length - 1];
        if (last && o.x0 - last.box.x1 < em * 0.12) last.box = bboxOf([last.box, o]);
        else clusters.push({ box: { x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1 }, row: plans.length });
      }
      const marks = cs.filter((o) => small(o) && o.n > 4 && o.y0 > (band.y0 + band.y1) / 2 - em * 0.1);
      plans.push({ row, band, inRow, clusters, marks });
    }
    for (const p of plans) {
      const shapes = p.clusters.map((c) => classifyJamo(bin, W, c.box));
      // 자모로 가려지는 덩어리가 과반일 때만 자모 줄로 봅니다(숫자·로마자 선지는 줄 인식 그대로).
      if (shapes.filter(Boolean).length * 2 <= p.clusters.length) continue;
      words = words.filter((w) => !p.inRow.includes(w));
      const base = median(p.clusters.map((c) => c.box.y1));
      const line: OcrLine = { bbox: p.band, baseline: { x0: p.band.x0, x1: p.band.x1, y0: base, y1: base }, words: [] };
      lines.push(line);
      p.clusters.forEach((c, i) => {
        const syms: Sym[] = [{ text: shapes[i] ?? "?", conf: shapes[i] ? 90 : 0, bbox: c.box, unsure: !shapes[i] }];
        const next = p.clusters[i + 1]?.box.x0 ?? p.band.x1;
        for (const m of p.marks) if (m.x0 >= c.box.x1 - 1 && m.x1 <= next) syms.push({ text: ",", conf: 90, bbox: { x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 } });
        words.push({ syms, bbox: bboxOf(syms.map((x) => x.bbox)), conf: 90, line });
      });
    }
  }

  // 8) 로마자 다시 보기: 이상한 기호, 너무 넓은 한글(앞에 로마자나 빠진 음절이 붙음), 짧은 로마자·숫자 낱말, 확신이 낮은 낱말의 첫 글자
  type Item = { kind: "replace" | "prefix" | "word" | "first" | "qnum"; w: Word; s?: Sym; rect: Rect };
  const items: Item[] = [];
  // 문항 번호 자리(단의 가장 왼쪽에서 시작하는 줄의 첫 글자)가 숫자로 읽히지 않았으면 영어(숫자)로 다시 봅니다.
  const colLeftOf = new Map<number, number>();
  for (const side of split == null ? [0] : [0, 1]) {
    const starts = lines
      .filter((l) => l.words.length >= 3 && (split == null || (l.bbox.x0 >= split) === (side === 1)))
      .map((l) => l.words[0].bbox.x0)
      .sort((a, b) => a - b);
    if (starts.length) colLeftOf.set(side, starts[Math.floor(starts.length * 0.05)]);
  }
  const qnumWords = new Set<Word>();
  const sameRow = (a: Rect, b: Rect) => overlapY(a, b) > Math.min(a.y1 - a.y0, b.y1 - b.y0) * 0.5;
  for (const w of words) {
    const side = split != null && w.bbox.x0 >= split ? 1 : 0;
    const left = colLeftOf.get(side);
    if (left == null || w.bbox.x0 > left + em * 0.4) continue;
    // 같은 높이에서 가장 왼쪽 낱말이고, 오른쪽에 글이 이어지는 줄(번호만 따로 한 줄로 읽힌 경우 포함)
    const row = words.filter((x) => x !== w && sameRow(x.bbox, w.bbox) && (split == null || (x.bbox.x0 >= split) === (side === 1)));
    if (row.some((x) => x.bbox.x0 < w.bbox.x0) || !row.some((x) => x.bbox.x0 > w.bbox.x1 && x.bbox.x0 - w.bbox.x1 < em * 1.5)) continue;
    const t = w.syms.map((x) => x.text).join("");
    if (/^\d{1,2}\.$/.test(t) || /^\d{1,2}\./.test(t)) continue;
    const s0 = w.syms[0];
    items.push({ kind: "qnum", w, s: s0, rect: { x0: w.bbox.x0, x1: Math.min(Math.max(s0.bbox.x1, w.bbox.x0 + em * 0.8), w.bbox.x0 + em * 1.6), y0: w.line.bbox.y0, y1: w.line.bbox.y1 } });
    qnumWords.add(w);
  }
  // 글자 폭은 이웃 글자와 겹친 부분을 빼고 잽니다(Tesseract 글자 상자는 옆 글자로 번지곤 함).
  const effW = new Map<Sym, number>();
  for (const l of new Set(words.map((w) => w.line))) {
    const syms = words.filter((w) => w.line === l).flatMap((w) => w.syms).sort((a, b) => a.bbox.x0 - b.bbox.x0);
    syms.forEach((x, i) => {
      const left = i > 0 ? Math.max(x.bbox.x0, Math.min(x.bbox.x1, syms[i - 1].bbox.x1)) : x.bbox.x0;
      const right = i + 1 < syms.length ? Math.min(x.bbox.x1, Math.max(x.bbox.x0, syms[i + 1].bbox.x0)) : x.bbox.x1;
      effW.set(x, Math.max(0, right - left));
    });
  }
  for (const w of words) {
    if (qnumWords.has(w)) continue;
    const lineSyms = words.filter((x) => x.line === w.line).flatMap((x) => x.syms);
    const mw = median(lineSyms.filter((x) => HANGUL.test(x.text)).map((x) => effW.get(x) ?? x.bbox.x1 - x.bbox.x0)) || em * 0.9;
    const y0 = w.line.bbox.y0;
    const y1 = w.line.bbox.y1;
    const text = w.syms.map((x) => x.text).join("");
    if (/^[0-9A-Za-z]{1,5}$/.test(text)) {
      items.push({ kind: "word", w, rect: { x0: w.bbox.x0, x1: w.bbox.x1, y0, y1 } });
      continue;
    }
    for (const x of w.syms) {
      if (!NORMAL.test(x.text)) items.push({ kind: "replace", w, s: x, rect: { x0: x.bbox.x0, x1: x.bbox.x1, y0, y1 } });
      else if (HANGUL.test(x.text) && (effW.get(x) ?? 0) > mw * 1.45) items.push({ kind: "prefix", w, s: x, rect: { x0: x.bbox.x0, x1: x.bbox.x1 - mw * 1.02, y0, y1 } });
    }
    const first = w.syms[0];
    if (w.conf < 45 && HANGUL.test(first.text) && !items.some((it) => it.s === first)) items.push({ kind: "first", w, s: first, rect: { x0: first.bbox.x0, x1: first.bbox.x1, y0, y1 } });
  }
  let latinFixed = 0;
  let recovered = 0;
  if (items.length) {
    const crop = (it: Item) => cropGray(work, { x0: it.rect.x0 - 2, x1: it.rect.x1 + 2, y0: it.rect.y0 - 2, y1: it.rect.y1 + 2 });
    const res = await stripOcr(d, items.map(crop), "eng");
    const prefixMiss: Item[] = [];
    items.forEach((it, i) => {
      const r = res[i];
      const t = r.text.replace(/\s+/g, "");
      const ok = r.conf >= 60;
      if (it.kind === "word") {
        const cur = it.w.syms.map((x) => x.text).join("");
        if (ok && /^[0-9A-Za-z]+$/.test(t) && Math.abs(t.length - cur.length) <= 1 && t !== cur) {
          it.w.syms = [{ text: t, conf: r.conf, bbox: it.w.bbox, unsure: r.conf < 85 }];
          latinFixed++;
        }
      } else if (it.kind === "replace" && it.s) {
        if (ok && /^[A-Za-z0-9]{1,3}$/.test(t)) {
          it.s.text = t;
          it.s.unsure = r.conf < 85;
          latinFixed++;
        } else it.s.unsure = true;
      } else if (it.kind === "prefix" && it.s) {
        if (ok && /^[A-Z][a-z]?$/.test(t)) {
          insertBefore(it.w, it.s, t, it.rect.x1, r.conf);
          latinFixed++;
        } else prefixMiss.push(it);
      } else if (it.kind === "qnum" && it.s) {
        const m = /^(\d{1,2})[.,]?$/.exec(t);
        const done = words.some((o) => o.syms.some((x) => x.qnum && overlapX(x.bbox, it.rect) > 0 && overlapY(x.bbox, it.rect) > 0));
        if (m && r.conf >= 45 && !done) {
          // 번호 자리에 걸친 글자들을 "N."으로 바꿉니다.
          const cut = it.rect.x1;
          const zone: Rect = { x0: it.rect.x0 - 2, x1: cut, y0: it.w.bbox.y0, y1: it.w.bbox.y1 };
          const inZone = (x: Sym) => (x.bbox.x0 + x.bbox.x1) / 2 < cut && overlapY(x.bbox, zone) > 0;
          const keep = it.w.syms.filter((x) => !inZone(x));
          it.w.syms = [{ text: `${m[1]}.`, conf: r.conf, bbox: { x0: it.rect.x0, x1: cut, y0: it.s.bbox.y0, y1: it.s.bbox.y1 }, unsure: r.conf < 80, qnum: true }, ...keep];
          it.w.bbox = bboxOf(it.w.syms.map((x) => x.bbox));
          // 같은 자리를 다른 낱말로도 읽었으면 그 글자는 뺍니다.
          for (const o of words) {
            if (o === it.w) continue;
            const before = o.syms.length;
            o.syms = o.syms.filter((x) => x.qnum || !(inZone(x) && x.bbox.x0 >= zone.x0));
            if (o.syms.length !== before && o.syms.length) o.bbox = bboxOf(o.syms.map((x) => x.bbox));
          }
          latinFixed++;
        }
      } else if (it.kind === "first" && it.s) {
        if (r.conf >= 75 && /^[A-Z][a-z]?$/.test(t)) {
          it.s.text = t;
          it.s.unsure = true;
          latinFixed++;
        }
      }
    });
    // 로마자가 아니면 빠진 한글 음절일 수 있어 한국어로 다시 읽습니다(쑥독새 → '독' 하나로 읽힌 경우).
    // 넓은 글자 영역 전체를 다시 읽어 '앞 음절 + 원래 글자'로 나올 때만 앞 음절을 살립니다.
    if (prefixMiss.length) {
      const whole = (it: Item) => cropGray(work, { x0: it.s!.bbox.x0 - 2, x1: it.s!.bbox.x1 + 2, y0: it.rect.y0 - 2, y1: it.rect.y1 + 2 });
      const res2 = await stripOcr(d, prefixMiss.map(whole), "kor");
      prefixMiss.forEach((it, i) => {
        const t = res2[i].text.replace(/\s+/g, "");
        const s0 = it.s!;
        if (/^[가-힣]{2}$/.test(t) && t[1] === s0.text && res2[i].conf >= 40) {
          insertBefore(it.w, s0, t[0], it.rect.x1, res2[i].conf);
          recovered++;
        } else s0.unsure = true;
      });
    }
  }
  words = words.filter((w) => w.syms.length);
  // 확신이 낮은 낱말은 통째로 표시
  for (const w of words) if (w.conf < 50) for (const s of w.syms) s.unsure = true;

  // 9) pt 좌표 자료로.
  // 낱말의 픽셀 상자가 세로로 겹치는 것끼리(같은 단 안에서) 한 행으로 묶고, 행마다 기준선·글자 크기를 하나로 정합니다.
  // (Tesseract 글줄은 그림 조각을 끌어안거나 한 줄을 둘로 내놓기도 해서 그대로 쓰지 않습니다.)
  const pt = BODY_PT / em;
  type Piece = { str: string; r: Rect; unsure: boolean; hangul: boolean; circle: boolean };
  const pieces: Piece[] = [];
  let unsureCount = 0;
  for (const w of words) {
    // 확신 여부가 바뀌는 곳에서 조각을 나눕니다.
    let i = 0;
    while (i < w.syms.length) {
      let j = i;
      const u = !!w.syms[i].unsure;
      while (j + 1 < w.syms.length && !!w.syms[j + 1].unsure === u) j++;
      const part = w.syms.slice(i, j + 1);
      const r = {
        x0: i === 0 ? Math.min(w.bbox.x0, part[0].bbox.x0) : part[0].bbox.x0,
        x1: j === w.syms.length - 1 ? Math.max(w.bbox.x1, part[part.length - 1].bbox.x1) : part[part.length - 1].bbox.x1,
        y0: w.bbox.y0,
        y1: w.bbox.y1,
      };
      const str = part.map((x) => x.text).join("");
      pieces.push({ str, r, unsure: u, hangul: HANGUL.test(str), circle: false });
      if (u) unsureCount++;
      i = j + 1;
    }
  }
  for (const g of circleGlyphs) {
    pieces.push({ str: g.ch, r: g.c, unsure: g.unsure, hangul: false, circle: true });
    if (g.unsure) unsureCount++;
  }
  // 행 묶기: 위에서부터, 행의 대표 높이 띠와 절반 넘게 겹치면 같은 행
  type Row = { side: number; y0: number; y1: number; items: Piece[] };
  const rowsP: Row[] = [];
  const sideOf = (r: Rect) => (split != null && (r.x0 + r.x1) / 2 >= split ? 1 : 0);
  for (const pc of [...pieces].sort((a, b) => (a.r.y0 + a.r.y1) / 2 - (b.r.y0 + b.r.y1) / 2)) {
    const h = pc.r.y1 - pc.r.y0;
    const sd = sideOf(pc.r);
    const row = rowsP.find((rw) => rw.side === sd && Math.min(rw.y1, pc.r.y1) - Math.max(rw.y0, pc.r.y0) > Math.min(h, rw.y1 - rw.y0) * 0.5);
    if (row) {
      row.items.push(pc);
      // 대표 띠는 한글 낱말(없으면 전체)의 중앙값으로 갱신 — 키 큰 조각 하나에 끌려가지 않게
      const ref = row.items.filter((x) => x.hangul || x.circle);
      const use = ref.length ? ref : row.items;
      row.y0 = median(use.map((x) => x.r.y0));
      row.y1 = median(use.map((x) => x.r.y1));
    } else rowsP.push({ side: sd, y0: pc.r.y0, y1: pc.r.y1, items: [pc] });
  }
  // 띄어쓰기: 낱말 상자 사이 틈은 '글자 사이'와 '낱말 사이' 두 무리로 갈립니다. 두 무리를 가르는 값보다 좁은 틈은 붙여 씁니다.
  const gapsEm: number[] = [];
  for (const row of rowsP) {
    const xs = row.items.filter((x) => !x.circle).sort((a, b) => a.r.x0 - b.r.x0);
    for (let i = 1; i < xs.length; i++) {
      const g = (xs[i].r.x0 - xs[i - 1].r.x1) / em;
      if (g >= 0 && g < 1) gapsEm.push(g);
    }
  }
  const joinGap = gapValley(gapsEm);
  const texts: PText[] = [];
  for (const row of rowsP) {
    row.items.sort((a, b) => a.r.x0 - b.r.x0);
    for (let i = 0; i + 1 < row.items.length; i++) {
      const a = row.items[i];
      const b = row.items[i + 1];
      const g = (b.r.x0 - a.r.x1) / em;
      if (!a.circle && !b.circle && g > 0 && g < joinGap) a.r = { ...a.r, x1: b.r.x0 };
    }
    const hs = row.items.filter((x) => x.hangul).map((x) => x.r.y1 - x.r.y0).sort((a, b) => a - b);
    const ref = hs.length ? hs[Math.floor((hs.length - 1) * 0.25)] : row.y1 - row.y0;
    const r = ref / em;
    const size = r >= (hs.length ? 0.8 : 0.55) && r <= (hs.length ? 1.22 : 1.35) ? BODY_PT : Math.max(4, Math.min(3 * BODY_PT, r * BODY_PT));
    const bottoms = row.items.filter((x) => x.hangul).map((x) => x.r.y1);
    const base = (bottoms.length ? median(bottoms) : median(row.items.map((x) => x.r.y1))) * pt;
    for (const pc of row.items) {
      texts.push({
        str: pc.str,
        x: pc.r.x0 * pt,
        y: base,
        w: Math.max(0.5, (pc.r.x1 - pc.r.x0) * pt),
        size,
        font: "ocr",
        rot: false,
        page: 0,
        uncertain: pc.unsure || undefined,
        bbox: { x0: pc.r.x0 * pt, y0: base - size * 0.9, x1: pc.r.x1 * pt, y1: base + size * 0.2 },
      });
    }
  }
  // 2단 구분선이 잡티로 끊겨 있으면 이어 붙입니다(레이아웃이 이 선으로 단을 나눔).
  if (split != null) {
    const near = segs.filter((x) => x.dir === "v" && Math.abs(x.x0 - split) < em * 0.8);
    const total = near.reduce((a, x) => a + (x.y1 - x.y0), 0);
    if (near.length > 1 && total > H * 0.3) {
      const merged = { x0: split, x1: split, y0: Math.min(...near.map((x) => x.y0)), y1: Math.max(...near.map((x) => x.y1)), lw: Math.max(...near.map((x) => x.lw)), dir: "v" as const };
      segs.splice(0, segs.length, ...segs.filter((x) => !near.includes(x)), merged);
    }
  }
  const pSegs: PSeg[] = segs.map((s) => ({ x0: s.x0 * pt, y0: s.y0 * pt, x1: s.x1 * pt, y1: s.y1 * pt, lw: s.lw * pt, dir: s.dir, dashed: false }));
  const pBoxes: PBox[] = figs.map((f) => ({ x0: f.x0 * pt, y0: f.y0 * pt, x1: f.x1 * pt, y1: f.y1 * pt, kind: f.kind, color: f.color }));
  const page: PdfPageData = { index: 0, width: W * pt, height: H * pt, texts, segs: pSegs, boxes: pBoxes };

  debug?.({ work, em, lines, circles: circleGlyphs.map((g) => ({ box: g.c, ch: g.ch, unsure: g.unsure })), segs, figs, texts, pt });
  const layout = analyzePdf([page]);
  // 굵은 문항 번호를 잘못 읽은 것(5. → 0.)을 앞뒤 번호로 바로잡습니다.
  const qs = layout.questions;
  for (let i = 0; i < qs.length; i++) {
    const prev = qs[i - 1]?.number;
    const next = qs[i + 1]?.number;
    const n = qs[i].number;
    const want = prev != null ? prev + 1 : next != null ? next - 1 : null;
    // 사이가 딱 한 칸 비었거나(앞+2=뒤), 끝 문항 번호가 앞뒤와 앞뒤가 뒤바뀐 경우만
    const between = prev != null && next != null && next === prev + 2;
    const edge = (prev == null && next != null && (n < 1 || n >= next)) || (next == null && prev != null && n <= prev);
    if (want != null && want >= 1 && n !== want && (between || edge)) {
      notes.push(`문항 번호 ‘${qs[i].number}’을(를) 앞뒤 번호에 맞춰 ${want}번으로 읽었습니다. 확인해 주세요.`);
      qs[i].number = want;
    }
  }
  if (!layout.questions.length) throw new Error(`${name}: 문항 번호(1. 2. …)를 찾지 못했습니다. 문항 번호가 보이도록 찍어 주세요.`);

  // 9) 그림은 원본 해상도에서 잘라 넣습니다.
  const toOrig = 1 / (pt * k);
  const crop = async (_page: number, box: Box): Promise<CropResult> => {
    const r = { x0: box.x0 * toOrig, y0: box.y0 * toOrig, x1: box.x1 * toOrig, y1: box.y1 * toOrig };
    const part: RGBA = cropRGBA(img, r);
    return { png: await d.encodePng(part), width: part.width, height: part.height };
  };
  const res = await synthesizeHwpx(layout, crop);
  notes.push(
    `이미지에서 글자를 인식해 입력한 글로 옮겼습니다(그림·그래프는 잘라 넣음).${unsureCount ? ` 인식이 불확실한 ${unsureCount}곳은 빨간 글자로 표시했으니 원본과 대조해 고친 뒤 검정으로 바꾸세요.` : ""}`,
  );
  const extra = [latinFixed && `로마자·숫자 ${latinFixed}곳은 영어 인식으로`, recovered && `빠진 한글 ${recovered}자는 한 글자씩`].filter(Boolean).join(", ");
  if (circleGlyphs.length) notes.push(`동그라미 기호 ${circleGlyphs.length}개(①~⑤, ㉠, ⓐ, ○ 등)는 모양으로 찾아 넣었습니다.${extra ? ` ${extra} 다시 읽었습니다.` : ""}`);
  else if (extra) notes.push(`${extra} 다시 읽었습니다.`);
  notes.push("정답 표시는 이미지에서 읽지 않습니다. 3단계에서 정답을 지정해 주세요.");
  return { hwpx: res.bytes, numbers: res.numbers, notes: [...notes, ...res.notes], columnWidthHU: res.columnWidthHU };
}

/**
 * 띄어쓰기 경계: 틈(글자 높이 단위) 분포에서 0.15~0.35 사이 가장 낮은 골짜기.
 * 글자 사이 틈(0~0.2)과 낱말 사이 틈(0.25~) 사이에 골이 생깁니다.
 */
function gapValley(gaps: number[]): number {
  if (gaps.length < 20) return 0.24;
  const bin = 0.025;
  const n = Math.ceil(1 / bin);
  const hist = new Array(n).fill(0);
  for (const g of gaps) hist[Math.min(n - 1, Math.floor(g / bin))]++;
  const smooth = hist.map((_, i) => (hist[i - 1] ?? hist[i]) + 2 * hist[i] + (hist[i + 1] ?? hist[i]));
  let best = Math.round(0.24 / bin);
  for (let i = Math.round(0.15 / bin); i <= Math.round(0.35 / bin); i++) if (smooth[i] < smooth[best]) best = i;
  return (best + 0.5) * bin;
}

function bboxOf(rs: Rect[]): Rect {
  return { x0: Math.min(...rs.map((r) => r.x0)), y0: Math.min(...rs.map((r) => r.y0)), x1: Math.max(...rs.map((r) => r.x1)), y1: Math.max(...rs.map((r) => r.y1)) };
}

/** 넓게 읽힌 글자 앞부분을 새 글자로 떼어 냅니다. */
function insertBefore(w: Word, s: Sym, text: string, cut: number, conf: number) {
  const letter: Sym = { text, conf, bbox: { ...s.bbox, x1: cut }, unsure: true };
  s.bbox = { ...s.bbox, x0: cut };
  w.syms.splice(w.syms.indexOf(s), 0, letter);
}

/** 동그라미 안쪽(고리를 뺀 타원 안)의 글자만 남긴 잘라 낸 그림 */
function innerCrop(work: Gray, bin: Uint8Array, c: Circle): Gray {
  const cx = (c.x0 + c.x1) / 2;
  const cy = (c.y0 + c.y1) / 2;
  const rx = ((c.x1 - c.x0) / 2) * 0.7;
  const ry = ((c.y1 - c.y0) / 2) * 0.7;
  const x0 = Math.max(0, Math.floor(cx - rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const x1 = Math.min(work.width, Math.ceil(cx + rx));
  const y1 = Math.min(work.height, Math.ceil(cy + ry));
  const pad = 3;
  const W = x1 - x0 + pad * 2;
  const H = y1 - y0 + pad * 2;
  const data = new Uint8Array(W * H).fill(255);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const i = y * work.width + x;
      if (bin[i]) data[(y - y0 + pad) * W + (x - x0 + pad)] = Math.min(work.data[i], 90);
    }
  }
  return { width: W, height: H, data };
}

/**
 * 작은 조각 여러 개를 한 줄씩 넉넉히 띄워 한 장에 붙여 한 번에 인식하고, 결과를 조각별로 돌려줍니다.
 */
async function stripOcr(d: OcrDeps, crops: Gray[], lang: "kor" | "eng" | "kor+eng"): Promise<{ text: string; conf: number }[]> {
  const H = 48;
  const gap = 56;
  const maxRow = 2600;
  const slots: Rect[] = [];
  const placed: { g: Gray; x: number; y: number }[] = [];
  let x = gap;
  let y = gap;
  for (const c of crops) {
    const s = H / Math.max(1, c.height);
    const g = scaleGray(c, Math.min(4, s));
    if (x + g.width + gap > maxRow && x > gap) {
      x = gap;
      y += H + gap;
    }
    placed.push({ g, x, y: y + Math.round((H - g.height) / 2) });
    slots.push({ x0: x, y0: y, x1: x + g.width, y1: y + H });
    x += g.width + gap;
  }
  const width = Math.max(...slots.map((r) => r.x1)) + gap;
  const height = y + H + gap;
  const data = new Uint8Array(width * height).fill(255);
  for (const p of placed) for (let yy = 0; yy < p.g.height; yy++) data.set(p.g.data.subarray(yy * p.g.width, (yy + 1) * p.g.width), (p.y + yy) * width + p.x);
  const lines = await d.recognize({ width, height, data }, lang, "6");
  const out = slots.map(() => ({ parts: [] as { x: number; text: string; conf: number }[] }));
  for (const l of lines) {
    for (const w of l.words as OcrWord[]) {
      // 낱말이 여러 조각에 걸치면 글자 단위로 나눠 담습니다.
      const syms = w.symbols.length ? w.symbols : [{ text: w.text, conf: w.conf, bbox: w.bbox }];
      for (const s of syms) {
        const cx = (s.bbox.x0 + s.bbox.x1) / 2;
        const cy = (s.bbox.y0 + s.bbox.y1) / 2;
        const k = slots.findIndex((r) => cx >= r.x0 - gap / 2 && cx <= r.x1 + gap / 2 && cy >= r.y0 - gap / 2 && cy <= r.y1 + gap / 2);
        if (k >= 0) out[k].parts.push({ x: s.bbox.x0, text: s.text, conf: Math.min(w.conf, s.conf) });
      }
    }
  }
  return out.map((o) => {
    const parts = o.parts.sort((a, b) => a.x - b.x);
    return { text: parts.map((p) => p.text).join(""), conf: parts.length ? Math.min(...parts.map((p) => p.conf)) : 0 };
  });
}

const CONSONANTS = "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ";
const SYLLABLES = "가나다라마바사아자차카타파하";

/** 숫자로 볼 만한 글자, 자모로 볼 만한 글자(동그라미 안에서 자주 틀리는 것) */
const DIGITISH: Record<string, string> = { l: "1", I: "1", i: "1", "|": "1", "ㅣ": "1", S: "5", s: "5", Z: "2", z: "2" };
const JAMOISH: Record<string, string> = { "7": "ㄱ", L: "ㄴ", C: "ㄷ" };

/** 동그라미 안 글자 → 동그라미 문자 */
function circled(raw: string): { ch: string; unsure: boolean } {
  let t = raw.replace(/\s+/g, "").replace(/[()[\]{}.,'"`]/g, "");
  if (!t) return { ch: "○", unsure: true };
  let guessed = false;
  if (t.length === 1 && DIGITISH[t]) {
    t = DIGITISH[t];
    guessed = true;
  } else if (t.length === 1 && JAMOISH[t]) {
    t = JAMOISH[t];
    guessed = true;
  }
  if (/^[0-9]{1,2}$/.test(t)) {
    const n = Number(t);
    if (n >= 1 && n <= 20) return { ch: String.fromCodePoint(0x2460 + n - 1), unsure: guessed };
  }
  if (JAMO.test(t)) {
    const i = CONSONANTS.indexOf(t);
    if (i >= 0) return { ch: String.fromCodePoint(0x3260 + i), unsure: guessed };
  }
  if (t.length === 1 && SYLLABLES.includes(t)) return { ch: String.fromCodePoint(0x326e + SYLLABLES.indexOf(t)), unsure: guessed };
  if (/^[a-z]$/.test(t)) return { ch: String.fromCodePoint(0x24d0 + t.charCodeAt(0) - 97), unsure: guessed };
  if (/^[A-Z]$/.test(t)) return { ch: String.fromCodePoint(0x24b6 + t.charCodeAt(0) - 65), unsure: guessed };
  return { ch: "○", unsure: true };
}

/**
 * 선지 번호 순서 맞추기: 같은 줄의 선지 동그라미(①~⑤)는 번호가 하나씩 늘어나므로,
 * 숫자로 읽히지 않았거나 순서가 어긋난 것만 앞(없으면 뒤) 번호에 맞춰 채우고 빨간색으로 표시합니다.
 */
function fixChoiceOrder(gs: CircleGlyph[], em: number, split: number | null) {
  const num = (ch: string) => {
    const c = ch.codePointAt(0)! - 0x2460;
    return c >= 0 && c < 20 ? c + 1 : null;
  };
  const sorted = [...gs].sort((a, b) => a.c.y0 - b.c.y0 || a.c.x0 - b.c.x0);
  const rows: (typeof gs)[] = [];
  const side = (g: CircleGlyph) => (split != null && g.c.x0 >= split ? 1 : 0);
  for (const g of sorted) {
    const row = rows.find((r) => Math.abs(r[0].c.y0 - g.c.y0) < em * 0.5 && side(r[0]) === side(g));
    if (row) row.push(g);
    else rows.push([g]);
  }
  for (const r of rows) {
    r.sort((a, b) => a.c.x0 - b.c.x0);
    const ns = r.map((g) => num(g.ch));
    if (r.length < 2 || ns.filter((n) => n != null).length * 2 < r.length) continue;
    // 앞뒤와 맞는 숫자만 믿습니다.
    const ok = ns.map((n, i) => n != null && ((i > 0 && ns[i - 1] === n - 1) || (i + 1 < ns.length && ns[i + 1] === n + 1)));
    if (!ok.some(Boolean)) continue;
    // 앞뒤 번호와 맞게 읽힌 것은 확실한 것으로 봅니다.
    r.forEach((g, i) => {
      if (ok[i]) g.unsure = false;
    });
    // 믿을 만한 이웃과의 거리를 선지 간격으로 나눠 몇 번째인지 셉니다(빠진 동그라미가 있어도 맞게).
    const okIdx = r.map((_, i) => i).filter((i) => ok[i]);
    const gaps: number[] = [];
    for (let t = 1; t < okIdx.length; t++) {
      const a = okIdx[t - 1];
      const b = okIdx[t];
      gaps.push((r[b].c.x0 - r[a].c.x0) / (ns[b]! - ns[a]!));
    }
    const step = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null;
    for (let i = 0; i < r.length; i++) {
      if (ok[i]) continue;
      let want: number | null = null;
      let nearest = -1;
      for (const j of okIdx) if (nearest < 0 || Math.abs(j - i) < Math.abs(nearest - i)) nearest = j;
      if (nearest >= 0) want = step ? ns[nearest]! + Math.round((r[i].c.x0 - r[nearest].c.x0) / step) : ns[nearest]! + (i - nearest);
      if (want != null && want >= 1 && want <= 20 && want !== ns[i]) {
        r[i].ch = String.fromCodePoint(0x2460 + want - 1);
        r[i].unsure = true;
      }
    }
  }
}
