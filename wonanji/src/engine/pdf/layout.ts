// PDF 쪽 → 단 → 영역(〈보기〉·자료 상자, 표, 그림) → 글줄·문단 → 문항.
// 학력평가·수능 문제지처럼 2단 구분선이 있는 문서를 기준으로 하되, 구분선이 없으면 글줄 위치로 단을 나눕니다.
import type { PBox, PdfPageData, PSeg, PText } from "./extract";
import { bodySize, buildLines, findFractions, inside, lineRuns, lineText, type Box, type Fraction, type Line, type Run } from "./lines";

export interface ParaBlock {
  type: "para";
  runs: Run[];
  align: "left" | "center" | "right" | "justify";
  /** 단(또는 칸) 왼쪽에서 들여쓴 폭(pt): 둘째 줄부터의 왼쪽 여백과 첫 줄 들여쓰기(음수면 내어쓰기) */
  left: number;
  intent: number;
  text: string;
  /** 첫 줄·끝 줄 기준선(쪽 좌표) — 블록 순서 정하기용 */
  y: number;
  yEnd: number;
}
export interface BoxBlock {
  type: "box";
  bbox: Box;
  label: string | null;
  blocks: Block[];
}
export interface Cell {
  r: number;
  c: number;
  rs: number;
  cs: number;
  bbox: Box;
  blocks: ParaBlock[];
  borders: { l: boolean; r: boolean; t: boolean; b: boolean };
}
export interface TableBlock {
  type: "table";
  bbox: Box;
  colW: number[];
  rowH: number[];
  cells: Cell[];
  /** 표 아래 범례 "(○: 있음, ×: 없음)" — 표 다음 오른쪽 정렬 문단 */
  legend?: ParaBlock;
  /** 표 안 글자 크기(pt) */
  fontSize: number;
}
export interface FigureBlock {
  type: "figure";
  page: number;
  bbox: Box;
}
export type Block = ParaBlock | BoxBlock | TableBlock | FigureBlock;

export interface PdfQuestion {
  number: number;
  blocks: Block[];
  page: number;
}

export interface PdfLayout {
  questions: PdfQuestion[];
  columnWidth: number;
  bodySize: number;
  pageSize: { width: number; height: number };
  notes: string[];
}

interface Region extends Box {
  kind: "box" | "table" | "figure";
  segs: PSeg[];
  boxes: PBox[];
  /** 표 아래 범례 글자 */
  legend?: PText[];
}

const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const union = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const touches = (a: Box, b: Box, pad: number) => a.x0 - pad <= b.x1 && b.x0 - pad <= a.x1 && a.y0 - pad <= b.y1 && b.y0 - pad <= a.y1;
const contains = (outer: Box, inner: Box, pad = 1) => inner.x0 >= outer.x0 - pad && inner.x1 <= outer.x1 + pad && inner.y0 >= outer.y0 - pad && inner.y1 <= outer.y1 + pad;
const textBox = (t: PText): Box => t.bbox;

// ── 쪽 틀: 단 구분, 본문 위·아래 경계 ─────────────────────────────
interface Frame {
  cols: Box[];
}

function pageFrame(p: PdfPageData, body: number): Frame {
  const { width: W, height: H } = p;
  const vlines = p.segs.filter((s) => s.dir === "v" && s.y1 - s.y0 > H * 0.4 && s.x0 > W * 0.3 && s.x0 < W * 0.7);
  const divider = vlines.sort((a, b) => b.y1 - b.y0 - (a.y1 - a.y0))[0];
  const rules = p.segs.filter((s) => s.dir === "h" && s.x1 - s.x0 > W * 0.55);
  const texts = p.texts.filter((t) => !t.rot);
  let top = divider ? divider.y0 : 0;
  let bottom = divider ? divider.y1 : H;
  // 머리 제목 아래 긴 가로줄(쪽 위쪽 1/3 안)
  for (const r of rules) if (r.y0 < H * 0.35 && r.y0 > top - 1) top = r.y0;
  if (!divider) {
    // 구분선이 없으면: 아래쪽 긴 가로줄 위까지, 저작권·쪽 번호 줄은 제외
    const low = rules.filter((r) => r.y0 > H * 0.8).map((r) => r.y0);
    if (low.length) bottom = Math.min(...low);
  }
  const fullRule = rules.find((r) => Math.abs(r.y0 - top) < 2) ?? rules[0];
  const inBody = texts.filter((t) => t.y > top + 2 && t.y < bottom - 1);
  let left = fullRule ? fullRule.x0 : Math.min(...inBody.map((t) => t.x));
  let right = fullRule ? fullRule.x1 : Math.max(...inBody.map((t) => t.x + t.w));
  if (!isFinite(left)) left = 0;
  if (!isFinite(right)) right = W;
  let split = divider ? (divider.x0 + divider.x1) / 2 : null;
  if (split == null) {
    // 글줄 시작 위치가 두 무리로 갈리면 2단
    const starts = inBody.map((t) => t.x).sort((a, b) => a - b);
    const mid = (left + right) / 2;
    const leftSide = starts.filter((x) => x < mid - body * 2).length;
    const rightSide = starts.filter((x) => x > mid + body).length;
    if (leftSide > 20 && rightSide > 20) {
      const crossing = inBody.filter((t) => t.x < mid - body && t.x + t.w > mid + body).length;
      if (crossing < inBody.length * 0.05) split = mid;
    }
  }
  const cols = split == null ? [{ x0: left, x1: right, y0: top, y1: bottom }] : [
    { x0: left, x1: split, y0: top, y1: bottom },
    { x0: split, x1: right, y0: top, y1: bottom },
  ];
  return { cols };
}

// ── 영역 찾기 ─────────────────────────────────────────
function edgesCovered(segs: PSeg[], b: Box) {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const cov = (dir: "h" | "v", at: number) => {
    const on = segs.filter((s) => s.dir === dir && Math.abs((dir === "h" ? s.y0 : s.x0) - at) < 1.2);
    return on.reduce((a, s) => a + (dir === "h" ? s.x1 - s.x0 : s.y1 - s.y0), 0) / (dir === "h" ? w : h);
  };
  return { top: cov("h", b.y0), bottom: cov("h", b.y1), left: cov("v", b.x0), right: cov("v", b.x1) };
}

function classify(segs: PSeg[], boxes: PBox[], b: Box): Region["kind"] {
  if (boxes.some((x) => x.kind === "image" || x.kind === "curve")) return "figure";
  if (segs.some((s) => s.dir === "d")) return "figure";
  const e = edgesCovered(segs, b);
  const outline = e.top > 0.55 && e.bottom > 0.9 && e.left > 0.9 && e.right > 0.9;
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const interiorH = segs.filter((s) => s.dir === "h" && s.y0 > b.y0 + 1.5 && s.y0 < b.y1 - 1.5 && s.x1 - s.x0 > w * 0.25);
  const interiorV = segs.filter((s) => s.dir === "v" && s.x0 > b.x0 + 1.5 && s.x0 < b.x1 - 1.5 && s.y1 - s.y0 > Math.min(h * 0.25, 8));
  const fills = boxes.filter((x) => x.kind === "fill" && (x.color ?? "").toLowerCase() !== "#ffffff");
  if (outline && !interiorH.length && !interiorV.length && !fills.length) return "box";
  // 표: 가로줄 2개 이상이 폭을 가로지르고 세로줄이 있음(바깥 세로선이 없는 열린 표 포함)
  const fullH = segs.filter((s) => s.dir === "h" && s.x1 - s.x0 > w * 0.6);
  if (fullH.length >= 2 && (interiorV.length || e.left > 0.9) && fills.length <= 2) return "table";
  return "figure";
}

/** 글자 조각을 대략의 글줄로 묶고 큰 틈에서 나눈 조각(그림 라벨·본문 구별용) */
function textPieces(texts: PText[], body: number): { box: Box; len: number; rot: boolean; size: number }[] {
  const out: { box: Box; len: number; rot: boolean; size: number }[] = [];
  const rows: PText[][] = [];
  for (const t of [...texts].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (t.rot) {
      out.push({ box: textBox(t), len: t.str.length, rot: true, size: t.size });
      continue;
    }
    const row = rows.find((r) => Math.abs(r[0].y - t.y) < Math.max(1.2, 0.3 * t.size));
    if (row) row.push(t);
    else rows.push([t]);
  }
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let cur: PText[] = [];
    const flush = () => {
      if (!cur.length) return;
      const box = cur.map(textBox).reduce(union);
      out.push({ box, len: cur.map((t) => t.str.trim()).join("").length, rot: false, size: Math.max(...cur.map((t) => t.size)) });
      cur = [];
    };
    for (const t of row) {
      const last = cur[cur.length - 1];
      if (last && t.x - (last.x + last.w) > Math.max(body, t.size) * 1.2) flush();
      cur.push(t);
    }
    flush();
  }
  return out;
}

function findRegions(col: Box, segs: PSeg[], boxes: PBox[], texts: PText[], body: number): { regions: Region[]; underlines: PSeg[]; fractions: Fraction[] } {
  const fractions = findFractions(texts, segs, body);
  const fracBars = new Set(fractions.map((f) => f.bar));
  // 밑줄: 짧은 가로선 바로 위에 같은 폭의 글자가 있는 것
  const near = (a: number, b: number) => Math.abs(a - b) <= 1.5;
  const underlines = segs.filter((s) => {
    if (s.dir !== "h" || fracBars.has(s) || s.x1 - s.x0 > (col.x1 - col.x0) * 0.8 || s.lw > 1.2) return false;
    // 표의 선: 끝이 세로선에 닿거나, 비슷한 길이의 가로선이 위아래로 나란히 있음
    const touching = segs.some((o) => o !== s && o.dir === "v" && o.x0 >= s.x0 - 1.5 && o.x0 <= s.x1 + 1.5 && o.y0 <= s.y0 + 1.5 && o.y1 >= s.y0 - 1.5);
    const len = s.x1 - s.x0;
    const parallel = segs.some((o) => o !== s && o.dir === "h" && Math.abs(o.y0 - s.y0) > 1 && Math.abs(o.y0 - s.y0) < body * 3 && Math.abs(o.x1 - o.x0 - len) < len * 0.1 && near(o.x0, s.x0));
    if (touching || parallel) return false;
    return texts.some((t) => !t.rot && t.y <= s.y0 + 0.3 && t.y >= s.y0 - body * 0.5 && t.x < s.x1 && t.x + t.w > s.x0);
  });
  const skip = new Set<PSeg>([...fracBars, ...underlines]);
  const prims: { b: Box; seg?: PSeg; box?: PBox }[] = [];
  for (const s of segs) if (!skip.has(s)) prims.push({ b: { x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1 }, seg: s });
  for (const x of boxes) {
    const b = { x0: x.x0, y0: x.y0, x1: x.x1, y1: x.y1 };
    if (x.kind === "fill" && ((x.color ?? "").toLowerCase() === "#ffffff" || area(b) > area(col) * 0.5)) continue;
    prims.push({ b, box: x });
  }
  // 맞닿은 것끼리 묶기
  const parent = prims.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < prims.length; i++) for (let j = i + 1; j < prims.length; j++) if (touches(prims[i].b, prims[j].b, 1.5)) parent[find(i)] = find(j);
  const groups = new Map<number, typeof prims>();
  prims.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), p]));
  let regions: Region[] = [];
  for (const g of groups.values()) {
    const b = g.map((p) => p.b).reduce(union);
    if (b.x1 - b.x0 < 3 && b.y1 - b.y0 < 3) continue;
    const gs = g.flatMap((p) => (p.seg ? [p.seg] : []));
    const gb = g.flatMap((p) => (p.box ? [p.box] : []));
    // 외톨이 선(글 사이 구분선 등)은 영역이 아닙니다.
    if (!gb.length && gs.length === 1) continue;
    regions.push({ ...b, kind: classify(gs, gb, b), segs: gs, boxes: gb });
  }
  // 그림: 둘레의 짧은 글 조각(축 이름·범례·기호, 회전 글자)을 끌어들입니다. 긴 글줄(발문)은 끌어들이지 않습니다.
  const pieces = textPieces(texts, body);
  for (const r of regions.filter((x) => x.kind === "figure")) {
    for (let pass = 0; pass < 4; pass++) {
      let grew = false;
      for (const pc of pieces) {
        if (contains(r, pc.box, 0.5)) continue;
        if (regions.some((o) => o !== r && o.kind !== "figure" && contains(o, pc.box, 1.5))) continue;
        // 라벨로 볼 조각: 회전 글자, 본문보다 작은 글씨, 그림에 바짝 붙은 세 글자 이하 조각
        const label = pc.rot || pc.size < body * 0.93 || (pc.len <= 3 && touches(r, pc.box, body * 0.5));
        if (label && touches(r, pc.box, body * 0.9)) {
          Object.assign(r, union(r, pc.box));
          grew = true;
        }
      }
      if (!grew) break;
    }
  }
  const figs = regions.filter((x) => x.kind === "figure");
  for (let i = 0; i < figs.length; i++) {
    for (let j = i + 1; j < figs.length; j++) {
      const a = figs[i];
      const c = figs[j];
      if (!a.segs || !c.segs) continue;
      const vOverlap = Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0);
      if (touches(a, c, body * 2.5) && vOverlap > Math.min(a.y1 - a.y0, c.y1 - c.y0) * 0.3) {
        Object.assign(a, union(a, c));
        a.segs.push(...c.segs);
        a.boxes.push(...c.boxes);
        c.segs = null as unknown as PSeg[];
      }
    }
  }
  regions = regions.filter((r) => r.segs);
  // 표 아래 범례 "(○: 있음, ×: 없음)": 표 블록 뒤 오른쪽 정렬 문단으로
  for (const r of regions.filter((x) => x.kind === "table")) {
    for (const pc of textPieces(texts.filter((t) => !contains(r, textBox(t), 0.5)), body)) {
      const b = pc.box;
      if (b.y0 >= r.y1 - 2 && b.y0 <= r.y1 + body * 1.6 && b.x0 >= r.x0 - 3 && b.x1 <= r.x1 + 3 && pc.len <= 30) {
        const ts = texts.filter((t) => contains(b, textBox(t), 0.5));
        if (/^\(.*[:：].*\)$/.test(ts.map((t) => t.str).join("").trim())) r.legend = [...(r.legend ?? []), ...ts];
      }
    }
  }
  // 그림 아래 붙은 캡션 "(가)" "(나)"와 범례 "(○: 있음, ×: 없음)"도 그림에 넣습니다.
  for (const r of regions.filter((x) => x.kind === "figure")) {
    for (const pc of textPieces(texts.filter((t) => !contains(r, textBox(t), 0.5)), body)) {
      const b = pc.box;
      const below = b.y0 >= r.y1 - 2 && b.y0 <= r.y1 + body * 1.6 && b.x0 >= r.x0 - 3 && b.x1 <= r.x1 + 3;
      if (below && pc.len <= 30) {
        const str = texts.filter((t) => contains(b, textBox(t), 0.5)).map((t) => t.str).join("").trim();
        if (/^\(?[가-하]\)$/.test(str) || /^\(.*[:：].*\)$/.test(str)) Object.assign(r, union(r, b));
      }
    }
  }
  if ((globalThis as { __DEBUG_REGIONS?: boolean }).__DEBUG_REGIONS) {
    for (const r of regions) console.log("REGION", r.kind, r.x0.toFixed(0), r.y0.toFixed(0), r.x1.toFixed(0), r.y1.toFixed(0), "segs", r.segs.length, "boxes", r.boxes.map((b) => b.kind).join(","));
  }
  return { regions, underlines, fractions };
}

// ── 표: 격자 복원 ───────────────────────────────────────
function uniq(vals: number[], tol = 1.5): number[] {
  const s = [...vals].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of s) if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  return out;
}

function buildTable(r: Region, texts: PText[], pageBody: number, underlines: PSeg[], fractions: Fraction[]): TableBlock | null {
  // 표 글씨는 본문보다 작은 경우가 많아, 표 안 글자 크기를 기준으로 줄·첨자를 판단합니다.
  const body = texts.length ? bodySize(texts) : pageBody;
  const hs = r.segs.filter((s) => s.dir === "h");
  const vs = r.segs.filter((s) => s.dir === "v");
  const ys = uniq([r.y0, r.y1, ...hs.map((s) => s.y0)]);
  const xs = uniq([r.x0, r.x1, ...vs.map((s) => s.x0)]);
  if (ys.length < 2 || xs.length < 2 || ys.length > 40 || xs.length > 20) return null;
  const R = ys.length - 1;
  const C = xs.length - 1;
  const hasV = (x: number, ya: number, yb: number) => vs.filter((s) => Math.abs(s.x0 - x) < 1.2 && s.y0 <= ya + 1 && s.y1 >= yb - 1).length > 0 ||
    vs.filter((s) => Math.abs(s.x0 - x) < 1.2).reduce((a, s) => a + Math.max(0, Math.min(s.y1, yb) - Math.max(s.y0, ya)), 0) > (yb - ya) * 0.6;
  const hasH = (y: number, xa: number, xb: number) =>
    hs.filter((s) => Math.abs(s.y0 - y) < 1.2).reduce((a, s) => a + Math.max(0, Math.min(s.x1, xb) - Math.max(s.x0, xa)), 0) > (xb - xa) * 0.6;
  // 칸 경계가 없는 이웃 칸끼리 합쳐 병합 칸을 만듭니다.
  const id = (i: number, j: number) => i * C + j;
  const par = Array.from({ length: R * C }, (_, k) => k);
  const f = (k: number): number => (par[k] === k ? k : (par[k] = f(par[k])));
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < C; j++) {
      if (j + 1 < C && !hasV(xs[j + 1], ys[i], ys[i + 1])) par[f(id(i, j))] = f(id(i, j + 1));
      if (i + 1 < R && !hasH(ys[i + 1], xs[j], xs[j + 1])) par[f(id(i, j))] = f(id(i + 1, j));
    }
  }
  const groups = new Map<number, [number, number][]>();
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) groups.set(f(id(i, j)), [...(groups.get(f(id(i, j))) ?? []), [i, j]]);
  const cells: Cell[] = [];
  for (const g of groups.values()) {
    const i0 = Math.min(...g.map((x) => x[0]));
    const i1 = Math.max(...g.map((x) => x[0]));
    const j0 = Math.min(...g.map((x) => x[1]));
    const j1 = Math.max(...g.map((x) => x[1]));
    if (g.length !== (i1 - i0 + 1) * (j1 - j0 + 1)) return null; // 직사각형이 아닌 병합 → 그림으로
    const bbox = { x0: xs[j0], x1: xs[j1 + 1], y0: ys[i0], y1: ys[i1 + 1] };
    const own = texts.filter((t) => inside(bbox, t.x + (t.w || t.size) / 2, t.y - t.size * 0.3));
    const lines = buildLines(own, body, underlines, fractions.filter((fr) => inside(bbox, fr.bar.x0, fr.bar.y0)));
    const inner = { x0: bbox.x0 + 1.5, x1: bbox.x1 - 1.5, y0: bbox.y0, y1: bbox.y1 };
    const blocks = toParas(lines, inner, body, lines.length ? Math.min(...lines.map((l) => l.x0)) : inner.x0).map((p) => {
      const ls = lines.filter((l) => l.y >= p.y - 0.1 && l.y <= p.yEnd + 0.1);
      const mid = ls.length ? (Math.min(...ls.map((l) => l.x0)) + Math.max(...ls.map((l) => l.x1))) / 2 : 0;
      const centered = Math.abs(mid - (bbox.x0 + bbox.x1) / 2) < Math.max(3, (bbox.x1 - bbox.x0) * 0.08);
      return { ...p, align: centered ? ("center" as const) : ("left" as const), left: centered ? 0 : p.left, intent: centered ? 0 : p.intent };
    });
    cells.push({
      r: i0, c: j0, rs: i1 - i0 + 1, cs: j1 - j0 + 1, bbox, blocks,
      borders: { l: hasV(xs[j0], bbox.y0, bbox.y1), r: hasV(xs[j1 + 1], bbox.y0, bbox.y1), t: hasH(ys[i0], bbox.x0, bbox.x1), b: hasH(ys[i1 + 1], bbox.x0, bbox.x1) },
    });
  }
  // 글이 칸 경계에 걸치면(격자를 잘못 읽음) 그림으로 돌립니다.
  const fracTexts = new Set(fractions.flatMap((fr) => [...fr.num, ...fr.den]));
  const inTable = texts.filter((t) => contains(r, textBox(t), 1) && !fracTexts.has(t));
  const placed = cells.reduce((a, c) => a + c.blocks.reduce((b, p) => b + p.text.replace(/\s|￼/g, "").length, 0), 0);
  const total = inTable.reduce((a, t) => a + t.str.replace(/\s/g, "").length, 0);
  if (total && placed < total * 0.9) return null;
  return { type: "table", bbox: { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 }, colW: xs.slice(1).map((x, j) => x - xs[j]), rowH: ys.slice(1).map((y, i) => y - ys[i]), cells: cells.sort((a, b) => a.r - b.r || a.c - b.c), fontSize: body };
}

// ── 글줄 → 문단 ───────────────────────────────────────
const MARKER = /^(\(?[가-하]\)|[ㄱ-ㅎ]\s*[.．]|[①-⑳]|[○◦•※▶□■◆◇]|\[|〔|［|\d{1,2}\s*[.)])/;

/**
 * 글줄을 문단으로. base는 들여쓰기 기준 x(문항 글 시작점 또는 상자 안쪽 왼쪽).
 * 새 문단: 앞 줄이 오른쪽 끝까지 차지 않았고 내어쓰기 정렬도 아닐 때, 줄 간격이 벌어졌을 때, 줄머리 기호로 시작할 때.
 */
function toParas(lines: Line[], area: Box, body: number, base = area.x0, obstacles: Box[] = []): ParaBlock[] {
  // 줄마다 오른쪽 끝: 옆에 떠 있는 그림·표가 있으면 그 왼쪽까지
  const limitOf = (l: Line) => {
    let lim = area.x1;
    for (const o of obstacles) if (o.x0 > l.x0 + body && o.y0 - 2 < l.y && o.y1 + 2 > l.y - l.size) lim = Math.min(lim, o.x0 - 1);
    return lim;
  };
  const out: ParaBlock[] = [];
  const width = area.x1 - area.x0;
  const center = (area.x0 + area.x1) / 2;
  let cur: Line[] = [];
  const flush = () => {
    if (!cur.length) return;
    const ls = cur;
    const first = ls[0];
    const runs: Run[] = [];
    ls.forEach((l, i) => {
      if (i > 0) {
        const prevCh = runs[runs.length - 1]?.text.slice(-1) ?? "";
        if (prevCh && prevCh !== " ") runs.push({ text: " " });
      }
      runs.push(...lineRuns(l));
    });
    const merged: Run[] = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && !last.eq && !last.crop && !r.eq && !r.crop && !!last.sub === !!r.sub && !!last.sup === !!r.sup && !!last.underline === !!r.underline) last.text += r.text;
      else merged.push({ ...r });
    }
    const w = first.x1 - first.x0;
    const centered = ls.length === 1 && w < width * 0.6 && Math.abs((first.x0 + first.x1) / 2 - center) < body * 1.2 && first.x0 - area.x0 > body * 2;
    const rightAligned = !centered && ls.length === 1 && first.x1 > area.x1 - body * 0.8 && first.x0 - area.x0 > width * 0.35;
    let left = 0;
    let intent = 0;
    if (!centered && !rightAligned) {
      const markerM = MARKER.exec(lineText(first));
      if (ls.length > 1) {
        left = Math.max(0, ls[1].x0 - base);
        intent = first.x0 - base - left;
      } else if (markerM) {
        // 한 줄짜리 기호 문단도 기호 뒤 글 시작점에 맞춰 내어쓰기(결과 단에서 줄이 넘어가도 정렬되게)
        let k = [...markerM[0]].length;
        while (k < first.glyphs.length && !first.glyphs[k].ch.trim()) k++;
        const textX = first.glyphs[k]?.x ?? first.x0;
        left = Math.max(0, textX - base);
        intent = first.x0 - base - left;
      } else intent = Math.max(0, first.x0 - base);
      if (Math.abs(intent) < body * 0.7) intent = 0;
      if (left < body * 0.7) left = 0;
    }
    out.push({
      type: "para",
      runs: merged,
      align: centered ? "center" : rightAligned ? "right" : "justify",
      left,
      intent,
      text: merged.map((r) => (r.eq || r.crop ? "\uFFFC" : r.text)).join(""),
      y: first.y,
      yEnd: ls[ls.length - 1].y,
    });
    cur = [];
  };
  let prev: Line | null = null;
  const pitch = body * 1.45;
  for (const l of lines) {
    const t = lineText(l);
    let cont = false;
    // 분수가 든 줄은 두 줄 높이라 줄 간격 허용치를 늘립니다.
    const tall = prev ? prev.glyphs.some((g) => g.eq) || l.glyphs.some((g) => g.eq) : false;
    if (prev && cur.length && l.y - prev.y < pitch * (tall ? 2.6 : 1.45)) {
      const prevFull = prev.x1 > limitOf(prev) - body * 1.6;
      // 내어쓰기: 줄머리 기호((가)·ㄱ.·◦ 등)로 시작한 문단의 둘째 줄 이하는 기호 뒤에 맞춰 들어가 있음.
      // 그런 줄은 "(나)"처럼 기호 모양으로 시작해도 이어지는 줄입니다.
      const marked = MARKER.test(lineText(cur[0]));
      const hanging = marked && prevFull && (cur.length === 1 ? l.x0 > cur[0].x0 + body * 0.5 : Math.abs(l.x0 - cur[1].x0) < body * 0.4);
      // 앞 줄이 가득 찼으면 이어짐. 단, 첫 줄 들여쓰기로 시작하는 새 문단(앞 줄보다 한 글자 이상 들어감)은 제외
      const indentedNew = !marked && cur.length > 1 && l.x0 > cur[1].x0 + body * 0.6;
      cont = hanging || (!MARKER.test(t) && prevFull && !indentedNew);
    }
    if (!cont) flush();
    cur.push(l);
    prev = l;
  }
  flush();
  return out;
}

// ── 한 단의 블록 ───────────────────────────────────────
interface Placed {
  block: Block;
  y: number;
  /** 단 안에서 이 블록 옆에 글이 흐르는지(그림·표가 오른쪽에 떠 있음) */
  side: boolean;
  x0: number;
  box: Box;
}

/** 옆에 떠 있던 블록은 옆 글이 끝나는 문단 뒤에: 블록 아래끝보다 위에서 시작하는 마지막 문단 다음 */
function insertSide(paras: ParaBlock[], sides: Placed[]): Block[] {
  const out: Block[] = [...paras];
  for (const sd of [...sides].sort((a, b) => a.box.y0 - b.box.y0)) {
    let idx = -1;
    out.forEach((b, i) => {
      if (b.type === "para" && b.y < sd.box.y1) idx = i;
      else if (b.type !== "para" && (b as FigureBlock | TableBlock).bbox && (b as FigureBlock).bbox.y0 < sd.box.y1) idx = i;
    });
    out.splice(idx + 1, 0, sd.block);
  }
  return out;
}

function columnBlocks(page: PdfPageData, col: Box, body: number): { placed: Placed[]; lines: Line[] } {
  const texts = page.texts.filter((t) => inside(col, t.x + Math.min(t.w, t.size) / 2, t.y - t.size * 0.3, 0.5));
  const segs = page.segs.filter((s) => contains(col, s, 1) && !(s.dir === "v" && s.y1 - s.y0 > (col.y1 - col.y0) * 0.8));
  const boxes = page.boxes.filter((b) => contains(col, b, 1));
  const { regions, underlines, fractions } = findRegions(col, segs, boxes, texts, body);

  // 상자 안 영역과 글을 먼저 정리(상자 = 윤곽만 있는 영역)
  const boxRegions = regions.filter((r) => r.kind === "box");
  const others = regions.filter((r) => r.kind !== "box");
  const usedText = new Set<PText>();
  const usedFr = new Set<Fraction>();
  const placed: Placed[] = [];
  const regionBlock = (r: Region): Block | null => {
    const own = texts.filter((t) => !usedText.has(t) && contains(r, textBox(t), 1.5));
    if (r.kind === "table") {
      const tFr = fractions.filter((f) => !usedFr.has(f) && inside(r, f.bar.x0, f.bar.y0, 1));
      const tb = buildTable(r, own, body, underlines, tFr);
      if (tb) {
        own.forEach((t) => usedText.add(t));
        tFr.forEach((f) => usedFr.add(f));
        if (r.legend?.length) {
          r.legend.forEach((t) => usedText.add(t));
          const ls = buildLines(r.legend, bodySize(r.legend));
          const text = ls.map(lineText).join(" ");
          tb.legend = { type: "para", runs: ls.flatMap((l, i) => (i ? [{ text: " " }, ...lineRuns(l)] : lineRuns(l))), align: "right", left: 0, intent: 0, text, y: ls[0]?.y ?? r.y1, yEnd: ls[ls.length - 1]?.y ?? r.y1 };
        }
        return tb;
      }
    }
    own.forEach((t) => usedText.add(t));
    fractions.filter((f) => inside(r, f.bar.x0, f.bar.y0, 1)).forEach((f) => usedFr.add(f));
    return { type: "figure", page: page.index, bbox: { x0: r.x0 - 1.5, y0: r.y0 - 1.5, x1: r.x1 + 1.5, y1: r.y1 + 1.5 } };
  };

  const blocksIn = (_area: Box, inner: Region[], lines: Line[]): Placed[] => {
    const res: Placed[] = [];
    for (const r of inner) {
      const b = regionBlock(r);
      if (!b) continue;
      // 옆에 흐르는 글이 있는지
      const side = lines.some((l) => l.y > r.y0 && l.y - l.size < r.y1 && (l.x1 < r.x0 - 2 || l.x0 > r.x1 + 2));
      res.push({ block: b, y: r.y0, side, x0: r.x0, box: { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 } });
    }
    return res;
  };

  for (const br of boxRegions.sort((a, b) => a.y0 - b.y0)) {
    const inner = others.filter((r) => contains(br, r, 2));
    // 윗선에 걸친 이름표("<보 기>")까지 상자 글로 봅니다.
    const labelZone: Box = { x0: br.x0, x1: br.x1, y0: br.y0 - body * 1.1, y1: br.y1 };
    const inRegion = (t: PText, rs: Region[]) => rs.some((r) => contains(r, textBox(t), 1.5) || r.legend?.includes(t));
    const own = texts.filter((t) => !usedText.has(t) && contains(labelZone, textBox(t), 3) && !inRegion(t, inner));
    own.forEach((t) => usedText.add(t));
    const boxFr = fractions.filter((f) => !usedFr.has(f) && inside(br, f.bar.x0, f.bar.y0) && !inner.some((r) => inside(r, f.bar.x0, f.bar.y0, 1)));
    boxFr.forEach((f) => usedFr.add(f));
    const lines = buildLines(own, body, underlines, boxFr);
    // 〈보기〉 이름표: 윗선에 걸친 짧은 줄 "<보 기>"
    const lab = lines.find((l) => l.y < br.y0 + body * 1.2 && /^[<〈(［[]?\s*보\s*기\s*[>〉)］\]]?$/.test(lineText(l).trim()));
    const bodyLines = lines.filter((l) => l !== lab);
    const innerPlaced = blocksIn(br, inner, bodyLines);
    const boxBase = bodyLines.length ? Math.min(...bodyLines.map((l) => l.x0)) : br.x0;
    const sides = innerPlaced.filter((p) => p.side);
    const paras = toParas(bodyLines, { x0: br.x0 + 2, x1: br.x1 - 2, y0: br.y0, y1: br.y1 }, body, boxBase, sides.map((p) => p.box));
    // 옆에 흐르는 글이 없는 영역은 세로 위치 순서로, 옆 영역은 그 글 문단 뒤에
    const flow = [...paras.map((p) => ({ block: p as Block, y: p.y })), ...innerPlaced.filter((p) => !p.side)].sort((a, b) => a.y - b.y).map((p) => p.block);
    const blocks = insertSide(flow as ParaBlock[], sides);
    placed.push({ block: { type: "box", bbox: br, label: lab ? lineText(lab).trim() : null, blocks }, y: br.y0, side: false, x0: br.x0, box: br });
    for (const r of inner) others.splice(others.indexOf(r), 1);
  }
  const rest = texts.filter((t) => !usedText.has(t));
  const regionsLeft = others.filter((r) => r.kind !== "box");
  // 영역 안 글은 영역 블록에 속하므로 줄 만들기 전에 뺍니다.
  const colFr = fractions.filter((f) => !usedFr.has(f) && !regionsLeft.some((r) => inside(r, f.bar.x0, f.bar.y0)));
  const preLines = buildLines(rest.filter((t) => !regionsLeft.some((r) => contains(r, textBox(t), 1.5) || r.legend?.includes(t))), body, underlines, colFr);
  placed.push(...blocksIn(col, regionsLeft, preLines));
  return { placed, lines: preLines.filter((l) => l.glyphs.length) };
}

// ── 전체 ───────────────────────────────────────────
const QNUM = /^(\d{1,2})\s*\.\s*/;

export function analyzePdf(pages: PdfPageData[]): PdfLayout {
  const allTexts = pages.flatMap((p) => p.texts);
  const body = bodySize(allTexts);
  const notes: string[] = [];
  const questions: PdfQuestion[] = [];
  let cur: PdfQuestion | null = null;
  let qBase = 0;
  let colW = 0;
  for (const page of pages) {
    const frame = pageFrame(page, body);
    for (const col of frame.cols) {
      colW = Math.max(colW, col.x1 - col.x0);
      const { placed, lines } = columnBlocks(page, col, body);
      // 문항 번호 줄: 단 왼쪽 끝에서 "N."으로 시작하고 본문보다 크거나 같은 글자
      const colLeft = Math.min(...lines.map((l) => l.x0), col.x1);
      type Item = { y: number; kind: "line"; line: Line } | { y: number; kind: "block"; placed: Placed };
      const items: Item[] = [...lines.map((l) => ({ y: l.y, kind: "line" as const, line: l })), ...placed.map((p) => ({ y: p.side ? p.box.y1 : p.y, kind: "block" as const, placed: p }))].sort((a, b) => a.y - b.y);
      let buf: Line[] = [];
      let pendingSide: Placed[] = [];
      const obstacles = placed.filter((p) => p.side).map((p) => p.box);
      const flushLines = () => {
        if (!cur) {
          buf = [];
          pendingSide = [];
          return;
        }
        // 단이 바뀌면 기준점도 그 단 기준으로(문항 글 시작점 = 단 왼쪽 + 번호 폭)
        const base = qBase >= col.x0 && qBase <= col.x1 ? qBase : colLeft + (qBase ? body * 1.6 : 0);
        const paras = buf.length ? toParas(buf, { x0: colLeft, x1: col.x1 - 2, y0: col.y0, y1: col.y1 }, body, base, obstacles) : [];
        cur.blocks.push(...insertSide(paras, pendingSide));
        buf = [];
        pendingSide = [];
      };
      for (const it of items) {
        if (it.kind === "line") {
          const t = lineText(it.line);
          const m = QNUM.exec(t);
          if (m && it.line.x0 - colLeft < body * 0.8 && it.line.size >= body * 0.98) {
            flushLines();
            cur = { number: Number(m[1]), blocks: [], page: page.index };
            questions.push(cur);
            // 번호를 떼고 발문만 남깁니다(번호는 양식 방식으로 다시 붙임).
            const g = it.line.glyphs;
            let k = 0;
            let seen = "";
            while (k < g.length && (seen + g[k].ch).length <= m[0].length) seen += g[k++].ch;
            const rest = g.slice(k);
            while (rest.length && !rest[0].ch.trim() && !rest[0].eq) rest.shift();
            qBase = rest.length ? rest[0].x : colLeft + body * 1.6;
            if (rest.length) buf.push({ ...it.line, glyphs: rest, x0: rest[0].x });
            continue;
          }
          if (cur) buf.push(it.line);
        } else if (it.placed.side) {
          // 옆에 글이 흐르는 그림·표: 그 글 문단이 끝난 뒤에 둡니다.
          if (cur) pendingSide.push(it.placed);
        } else {
          flushLines();
          if (cur) cur.blocks.push(it.placed.block);
        }
      }
      flushLines();
    }
  }
  if (!questions.length) notes.push("문항 번호(1. 2. …)를 찾지 못했습니다. 글자가 그림으로 된 PDF(스캔본)는 이미지 입력을 써 주세요.");
  return { questions, columnWidth: colW, bodySize: body, pageSize: { width: pages[0]?.width ?? 595, height: pages[0]?.height ?? 842 }, notes };
}
