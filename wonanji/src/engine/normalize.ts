// 문항 한 개를 양식 문서로 옮기면서 편집 규격을 입힙니다.
// 글자를 새로 쓰는 일은 배점 표기·번호·공백 정리처럼 형식에 한정하고, 문항 내용은 바꾸지 않습니다.
import { circledIndex, inTable, RX } from "./classify";
import { descendants, hp, kid, kids } from "./dom";
import { getMargin, type Importer } from "./header";
import { floatRight, isInline, objKind, objWidth, setObjWidth, shrinkFloatOffset, topObjects } from "./objects";
import { charPositions } from "./pagectl";
import { indexText, isBlank, itemsOf, replaceItems, restyle, shiftLinesegs, textOf, trimLeading, trimTrailing, type Item } from "./text";
import type { Change, FormatSpec, Issue, Question, SymbolFix } from "./types";

/** 배점 숫자 표기: 소수점 한 자리(4 → 4.0) 또는 정수 그대로(4 → 4) */
export function formatScore(n: number, decimal = true): string {
  if (!decimal) return String(Number(n.toFixed(2)));
  return Number.isInteger(n) ? n.toFixed(1) : String(Number(n.toFixed(2)));
}

const NEG_WORDS = /(않은|않는|아닌|없는|틀린|다른|못한)/g;

/** 발문(물음표로 끝나는 문장) 끝부분의 부정어 위치. */
export function negationSpans(text: string): { start: number; end: number; word: string }[] {
  const q = text.lastIndexOf("?");
  if (q < 0) return [];
  const sentStart = Math.max(text.lastIndexOf(". ", q - 1), text.lastIndexOf("\n", q - 1), -1) + 1;
  const from = Math.max(sentStart, q - 24);
  const win = text.slice(from, q);
  const out: { start: number; end: number; word: string }[] = [];
  for (const m of win.matchAll(NEG_WORDS)) out.push({ start: from + m.index!, end: from + m.index! + m[0].length, word: m[0] });
  return out;
}

// ── 선지 배열 ───────────────────────────────────────────────
function charEm(ch: string): number {
  if (ch === " " || ch === " ") return 0.5;
  if (/[.,:;'"`!|]/.test(ch)) return 0.35;
  if (/[()[\]{}]/.test(ch)) return 0.4;
  const c = ch.codePointAt(0) ?? 0;
  if (c < 0x80) return /[A-Z]/.test(ch) ? 0.7 : 0.55;
  return 1;
}

interface Seg {
  digit: Item;
  body: Item[];
  width: number;
}

function segWidth(seg: Seg, sizeHU: number): number {
  let w = 1 + 0.5;
  for (const it of seg.body) {
    if (it.kind === "obj") {
      const sz = kid(it.node as Element, "sz");
      w += Number(sz?.getAttribute("width") ?? sizeHU) / sizeHU;
    } else w += charEm(it.ch);
  }
  return w;
}

/**
 * 선지 문단들을 한 줄 N개(5·3·2·1) 배열로 다시 짭니다. 실패하면 이유 문자열.
 * 규칙: 양식 유의사항 "선지가 1~3행인 경우 Tab을 사용하여 간격을 일정하게",
 * 학교 출제 유의사항 "답안 번호는 문항 번호보다 1칸 들어간 곳에서 시작".
 */
export function relayoutChoices(
  paras: Element[],
  spec: FormatSpec,
  shaded: (cp: string) => boolean = () => false,
): { paras: Element[]; perLine: number } | string {
  const doc = paras[0].ownerDocument!;
  const items: Item[] = [];
  for (const p of paras) items.push(...itemsOf(p));
  const segs: Seg[] = [];
  for (const it of items) {
    if (it.kind === "mark") continue;
    if (it.kind === "obj") {
      const n = it.node as Element;
      const inline = n.localName === "equation" && kid(n, "pos")?.getAttribute("treatAsChar") === "1";
      if (!inline) return "그림·표가 들어 있는 선지";
      if (!segs.length) return "선지 번호 앞에 개체가 있음";
      segs[segs.length - 1].body.push(it);
      continue;
    }
    if (it.kind === "ch" && circledIndex(it.ch) >= 0) {
      segs.push({ digit: it, body: [], width: 0 });
      continue;
    }
    if (!segs.length) {
      if (it.ch.trim()) return "선지 번호 앞에 글자가 있음";
      continue;
    }
    segs[segs.length - 1].body.push(it);
  }
  const count = segs.length;
  if (count < 4 || count > 5) return `선지 개수 ${count}개`;
  if (!segs.every((s, i) => circledIndex(s.digit.ch) === i)) return "선지 번호 순서가 어긋남";
  for (const s of segs) {
    while (s.body.length && (s.body[0].kind !== "obj" && !s.body[0].ch.trim())) s.body.shift();
    while (s.body.length && (s.body[s.body.length - 1].kind !== "obj" && !s.body[s.body.length - 1].ch.trim())) s.body.pop();
    const t = textOf(s.body);
    if (/\t/.test(t) || / {3,}/.test(t) || /\n/.test(t)) return "탭·공백으로 칸을 맞춘 표 형식 선지";
    s.width = segWidth(s, spec.sizePt * 100);
  }
  const em = spec.sizePt * 100;
  const usable = spec.columnWidthHU - spec.choiceIndentHU;
  const options = count === 5 ? [5, 3, 2, 1] : [4, 2, 1];
  const maxW = Math.max(...segs.map((s) => s.width));
  let perLine = 1;
  for (const n of options) {
    if (n === 1 || (maxW + 1) * em <= usable / n) {
      perLine = n;
      break;
    }
  }

  const makeP = () => {
    const p = hp(doc, "p");
    p.setAttribute("id", "0");
    p.setAttribute("paraPrIDRef", `@choice:${perLine}`);
    p.setAttribute("styleIDRef", "0");
    p.setAttribute("pageBreak", "0");
    p.setAttribute("columnBreak", "0");
    p.setAttribute("merged", "0");
    return p;
  };
  const out: Element[] = [];
  for (let i = 0; i < count; i += perLine) {
    const p = makeP();
    let run: Element | null = null;
    let t: Element | null = null;
    let runCp = "";
    const ensure = (cp: string) => {
      if (!run || cp !== runCp) {
        run = hp(doc, "run");
        run.setAttribute("charPrIDRef", cp);
        p.appendChild(run);
        runCp = cp;
        t = null;
      }
      return run;
    };
    const text = (cp: string, s: string) => {
      const r = ensure(cp);
      if (!t) {
        t = hp(doc, "t");
        r.appendChild(t);
      }
      const last = t.lastChild;
      if (last && last.nodeType === 3) last.nodeValue = (last.nodeValue ?? "") + s;
      else t.appendChild(doc.createTextNode(s));
    };
    const line = segs.slice(i, i + perLine);
    // 탭·원문자 뒤 공백은 정답 음영이 번지지 않도록 칠해지지 않은 글자 모양으로
    const plainCp =
      line.flatMap((s) => [s.digit, ...s.body]).find((it) => it.kind !== "obj" && !shaded(it.cp))?.cp ??
      line[0].digit.cp.split("|").filter((m) => !m.startsWith("shade=")).join("|");
    line.forEach((s, k) => {
      if (k > 0) {
        const r = ensure(plainCp);
        if (!t) {
          t = hp(doc, "t");
          r.appendChild(t);
        }
        const tab = hp(doc, "tab");
        tab.setAttribute("width", String(Math.max(600, Math.round(usable / perLine - line[k - 1].width * em))));
        tab.setAttribute("leader", "0");
        tab.setAttribute("type", "1");
        t.appendChild(tab);
      }
      text(s.digit.cp, s.digit.ch);
      const first = s.body.find((it) => it.kind !== "obj");
      text(first && shaded(first.cp) && shaded(s.digit.cp) ? s.digit.cp : plainCp, " ");
      for (const it of s.body) {
        if (it.kind === "obj") {
          ensure(it.cp).appendChild(it.node);
          t = null;
        } else if (it.kind === "ch") text(it.cp, it.ch);
        else if (it.kind === "space") text(it.cp, " ");
        else if (it.kind === "br") text(it.cp, " ");
        else {
          ensure(it.cp);
          if (!t) {
            t = hp(doc, "t");
            run!.appendChild(t);
          }
          t.appendChild(it.node);
        }
      }
    });
    out.push(p);
  }
  return { paras: out, perLine };
}

// ── 문항 조립 ───────────────────────────────────────────────

export interface BuildResult {
  paras: Element[];
  /** 번호가 달린 머리 문단 */
  head: Element;
  changes: Change[];
  issues: Issue[];
}

const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`;

/**
 * 〈보기〉·표·그림 크기를 결과 단에 맞춥니다.
 * - 〈보기〉 상자: 양식 예시의 〈보기〉 폭으로(늘리거나 줄임). 양식에 예시가 없으면 단을 넘을 때만 줄임
 * - 자료 표·그림(그림 배치 표 포함): 단(문단 여백 제외)을 넘으면 비율대로 줄임. 늘리지는 않습니다(화질·글자 크기 보존)
 * - 떠 있는 개체(어울림 그림 상자 등): 가로 위치와 폭을 같은 비율로 줄여, 옆에 흐르는 글과의 비율을 지킴
 */
function fitObjects(
  p: Element,
  avail: number,
  spec: FormatSpec,
  log: (kind: string, detail: string) => void,
  warn: (msg: string) => void,
  srcFontHU?: (tbl: Element) => number | null,
) {
  const label = (kind: string) => (kind === "box" ? "〈보기〉 상자" : kind === "table" ? "표" : "그림");
  for (const o of topObjects(p)) {
    const kind = objKind(o);
    if (kind === "equation" || kind === "other") continue;
    const inline = isInline(o);
    const pos = kid(o, "pos");
    // 쪽·종이 기준 개체는 문항에서 이미 뗐고, 여기서는 문단·단 기준 개체만 다룹니다.
    if (!inline && /PAPER|PAGE/.test(pos?.getAttribute("horzRelTo") ?? "")) continue;
    const out = kid(o, "outMargin");
    const room = avail - Number(out?.getAttribute("left") ?? 0) - Number(out?.getAttribute("right") ?? 0);
    const w = objWidth(o);
    if (!w || room <= 0) continue;
    if (!inline) {
      const right = floatRight(o);
      if (right <= room) continue;
      const k = room / right;
      const off = Number(pos?.getAttribute("horzOffset") ?? 0);
      if (setObjWidth(o, Math.round(w * k))) {
        if ((pos?.getAttribute("horzAlign") ?? "LEFT") === "LEFT") pos?.setAttribute("horzOffset", String(Math.round(off * k)));
        log("개체 크기", `떠 있는 ${label(kind)}의 위치·폭을 단에 맞게 ${Math.round(k * 100)}%로`);
      } else {
        shrinkFloatOffset(o, room);
        if (floatRight(o) > room + 100) warn(`떠 있는 ${label(kind)}가 단 오른쪽 밖으로 나갑니다(선·도형이 들어 있어 자동으로 줄이지 못함). 한글에서 위치·크기를 확인해 주세요.`);
      }
      continue;
    }
    let target = w;
    if (kind === "box" && spec.boxWidthHU) target = Math.min(spec.boxWidthHU, room);
    else if (w > room) target = room;
    else if (kind === "table" && spec.cellMode === "normalize" && srcFontHU) {
      // 표 글자를 본문 크기로 키우면 좁은 칸에서 줄이 넘어가므로, 글자가 커진 비율만큼 표를 넓힙니다(단 폭 안에서).
      const h = srcFontHU(o);
      const ratio = h ? (spec.sizePt * 100) / h : 1;
      if (ratio > 1.05) target = Math.min(room, Math.round(w * ratio));
    }
    if (Math.abs(target - w) >= 100) {
      if (setObjWidth(o, target)) log("개체 크기", `${label(kind)} 폭 ${pct(w, spec.columnWidthHU)} → ${pct(target, spec.columnWidthHU)}(단 폭 대비)`);
      else if (w > room) warn(`${label(kind)} 폭이 단의 ${pct(w, spec.columnWidthHU)}인데, 선·도형으로 그린 개체가 들어 있어 자동으로 줄이지 못했습니다. 한글에서 크기를 줄여 주세요.`);
    }
  }
}

/**
 * 글자처럼 취급한 표·그림 뒤에 같은 문단의 글이 이어지고, 원본에서는 그 글이 개체 아래 새 줄에서 시작했다면
 * (원본 줄 배치 캐시로 확인) 개체 뒤에서 문단을 둘로 나눕니다. 결과 단이 원본보다 넓으면 글이 개체 옆으로 붙기 때문입니다.
 * 글자는 그대로이고 문단 경계만 생깁니다. p는 개체까지 남기고, 뒤 글은 새 문단으로 돌려줍니다.
 */
function splitAfterWideObject(p: Element): Element | null {
  const arr = kid(p, "linesegarray");
  if (!arr) return null;
  const starts = kids(arr).map((s) => Number(s.getAttribute("textpos") ?? -1));
  const at = charPositions(p);
  const items = itemsOf(p);
  const posOf = (it: Item) => (at.get(it.node) ?? NaN) + (it.kind === "ch" ? it.off : 0);
  for (let i = 0; i < items.length - 1; i++) {
    const it = items[i];
    if (it.kind !== "obj") continue;
    const o = it.node as Element;
    if (!isInline(o) || objKind(o) === "equation") continue;
    // 개체 뒤 공백을 건너뛴 첫 글자
    let j = i + 1;
    while (j < items.length && (items[j].kind === "space" || items[j].kind === "mark" || (items[j].kind === "ch" && !items[j].ch.trim()))) j++;
    const next = items[j];
    if (!next || next.kind !== "ch") continue;
    const objEnd = posOf(it) + 8;
    const pos = posOf(next);
    // 원본에서 개체 끝과 그 글자 사이에서 새 줄이 시작했는지(공백이 줄 끝에 걸린 경우 포함)
    if (!starts.some((s) => s >= objEnd && s <= pos)) continue;
    // 뒤쪽에 다른 개체가 있으면 rhwp 미리보기가 캐시 없이 그리지 못하므로 나누지 않습니다.
    if (items.slice(j).some((x) => x.kind === "obj")) return null;

    const tail = p.cloneNode(true) as Element;
    // 앞 문단: 개체까지(같은 run의 뒤 형제와 뒤 run 삭제), 캐시는 개체 줄까지만
    const run = o.parentNode as Element;
    while (o.nextSibling) run.removeChild(o.nextSibling);
    let r = run.nextSibling;
    while (r) {
      const nx = r.nextSibling;
      if ((r as Element).localName === "run") p.removeChild(r);
      r = nx;
    }
    for (const seg of kids(arr)) if (Number(seg.getAttribute("textpos")) >= objEnd) arr.removeChild(seg);
    // 뒤 문단: 그 글자부터(앞 run·앞 글자 삭제), 캐시는 지워 한글·rhwp가 다시 계산
    const tItems = itemsOf(tail);
    const tNext = tItems[j];
    const tNode = tNext.node as Text;
    tNode.nodeValue = (tNode.nodeValue ?? "").slice(tNext.off);
    let prev: Node | null = tNode.previousSibling;
    while (prev) {
      const pv = prev.previousSibling;
      prev.parentNode!.removeChild(prev);
      prev = pv;
    }
    const tRun = tNode.parentNode!.parentNode as Element; // t → run
    let pr = tRun.previousSibling;
    while (pr) {
      const pv = pr.previousSibling;
      if ((pr as Element).localName === "run") tail.removeChild(pr);
      pr = pv;
    }
    // t 앞에 있던 같은 run 안 형제(개체 등) 삭제
    let rs = (tNode.parentNode as Element).previousSibling;
    while (rs) {
      const pv = rs.previousSibling;
      tRun.removeChild(rs);
      rs = pv;
    }
    const tArr = kid(tail, "linesegarray");
    if (tArr) tail.removeChild(tArr);
    return tail;
  }
  return null;
}

/** 표 안에서 가장 많이 쓰인 글자 크기(원본 글자 모양 기준, HWPUNIT) */
function tableFontHU(tbl: Element, importer: Importer): number | null {
  const count = new Map<number, number>();
  for (const q of descendants(tbl, "p")) {
    for (const it of itemsOf(q)) {
      if (it.kind !== "ch" || !it.ch.trim()) continue;
      const h = importer.src.charHeight(it.cp.split("|")[0]);
      if (h) count.set(h, (count.get(h) ?? 0) + 1);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** 문단 맨 앞 떠 있는 개체(어울림 그림 상자 등) 뒤의 공백도 지웁니다(글줄에는 공백이 맨 앞에 옵니다). */
function trimAfterFloats(p: Element): boolean {
  const items = itemsOf(p);
  const idxs: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.kind === "mark" || (it.kind === "obj" && !isInline(it.node as Element))) continue;
    if (it.kind === "space" || it.kind === "tab" || (it.kind === "ch" && /\s/.test(it.ch))) idxs.push(i);
    else break;
  }
  if (!idxs.length) return false;
  const first = items[idxs[0]];
  const from = (charPositions(p).get(first.node) ?? 0) + (first.kind === "ch" ? first.off : 0);
  for (let k = idxs.length - 1; k >= 0; k--) replaceItems(items, idxs[k], idxs[k] + 1, "");
  shiftLinesegs(p, from, idxs.reduce((a, i) => a + (items[i].kind === "tab" ? 8 : items[i].ch.length), 0));
  return true;
}

/** 문단 앞에 번호 뒤 공백(양식 관례)을 넣습니다. 이미 공백이면 그대로. */
function insertLead(p: Element, lead: string) {
  if (!lead) return;
  const first = itemsOf(p).find((it) => it.kind !== "obj" && it.kind !== "mark");
  if (!first || first.kind !== "ch" || /\s/.test(first.ch)) return;
  const n = first.node as Text;
  const v = n.nodeValue ?? "";
  n.nodeValue = v.slice(0, first.off) + lead + v.slice(first.off);
}

/** 직접 입력 방식 양식: 머리 문단 맨 앞에 "n." 번호 글자를 넣습니다(양식의 번호 글자 모양). */
function insertLiteralNumber(p: Element, n: number, spec: FormatSpec) {
  const doc = p.ownerDocument!;
  const run = hp(doc, "run");
  run.setAttribute("charPrIDRef", (spec.numbering.charPrId ?? spec.bodyCharPrId) + "|tpl");
  const t = hp(doc, "t");
  t.appendChild(doc.createTextNode(`${n}${spec.numbering.suffix || ". "}`));
  run.appendChild(t);
  p.insertBefore(run, kids(p).find((c) => c.localName === "run") ?? null);
}

/** 배점만 있는 줄(부분 점수 안내 포함) 또는 공백으로 오른쪽에 밀어 둔 짧은 줄(출처 등). */
function isRightLine(p: Element): boolean {
  const t = textOf(itemsOf(p));
  if (/^\s*[[［(（]\s*\d+(?:\.\d+)?\s*점[^\]］)）]{0,16}[\]］)）]\s*$/.test(t)) return true;
  const lead = /^[\s\u00a0]*/.exec(t)![0].length;
  return lead >= 8 && t.trim().length > 0 && t.trim().length <= 30 && !t.includes("\uFFFC");
}

/** 문단 안 배점 표기를 [x.x점](또는 [x점])으로, 물음표와 배점 사이를 한 칸으로. */
function fixScores(p: Element, decimal: boolean): string[] {
  const log: string[] = [];
  for (let guard = 0; guard < 6; guard++) {
    const items = itemsOf(p);
    const ix = indexText(items);
    const text = ix.text;
    let changed = false;
    for (const m of text.matchAll(RX.score)) {
      const want = `[${formatScore(Number(m[1]), decimal)}점]`;
      const [start, end] = ix.range(m.index!, m.index! + m[0].length);
      if (items.slice(start, end).some((i) => i.kind === "obj" || i.kind === "mark")) continue;
      if (m[0] !== want) {
        replaceItems(items, start, end, want);
        log.push(`${m[0]} → ${want}`);
        changed = true;
        break;
      }
      // 물음표 뒤 공백 한 칸
      const before = text.slice(0, start);
      const q = /\?([\s ]*)$/.exec(before);
      if (q && q[1] !== " ") {
        const s = start - q[1].length;
        if (!items.slice(s, start).some((i) => i.kind === "obj")) {
          replaceItems(items, s, start, " ");
          log.push("물음표와 배점 사이 한 칸");
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
  return log;
}

function stripLiteralNumber(p: Element): boolean {
  const items = itemsOf(p);
  const ix = indexText(items);
  const m = RX.literalNum.exec(ix.text);
  if (!m) return false;
  const [a, b] = ix.range(m.index, m.index + m[0].length);
  if (items.slice(a, b).some((i) => i.kind === "obj")) return false;
  replaceItems(items, a, b, "");
  return true;
}

function renumberEssay(p: Element, n: number, numberSizeHU: number): boolean {
  const items = itemsOf(p);
  const ix = indexText(items);
  const m = /【\s*(?:문항\s*)?(\d+)\s*[-–―~]?\s*((?:논술|서술|서답)형)\s*】/.exec(ix.text);
  if (!m) return false;
  const want = `【문항${n}-${m[2]}】`;
  const [a, b] = ix.range(m.index, m.index + m[0].length);
  if (m[0] !== want) replaceItems(items, a, b, want);
  const ix2 = indexText(itemsOf(p));
  const pos = ix2.text.indexOf(want);
  const [s2, e2] = ix2.range(pos, pos + want.length);
  restyle(p, (_it, i) => (i >= s2 && i < e2 ? `bold|size=${numberSizeHU}` : null));
  return m[0] !== want;
}

const BOGI_REF = /([<〈＜《[［])\s*보\s*기\s*([>〉＞》\]］])/g;

/**
 * 교사가 확인하고 고른 기호 바꾸기. 한 글자 기호(물결표·가운뎃점)와 전각 괄호는 표 안까지,
 * 발문 속 〈보기〉는 표 밖 문단에서만 바꿉니다(상자 표시는 상자 틀이 정함). 바꾼 개수를 돌려줍니다.
 */
export function applySymbolFixes(paras: Element[], fixes: SymbolFix[]): number {
  let n = 0;
  const all = paras.flatMap((p) => [p, ...descendants(p, "p")]);
  for (const f of fixes) {
    if (f.fam === "bogiRef") {
      for (const p of paras) {
        for (let guard = 0; guard < 8; guard++) {
          const items = itemsOf(p);
          const ix = indexText(items);
          const m = [...ix.text.matchAll(BOGI_REF)].find((x) => `${x[1]}보기${x[2]}` === f.from);
          if (!m) break;
          const [a, b] = ix.range(m.index!, m.index! + m[0].length);
          if (items.slice(a, b).some((i) => i.kind === "obj")) break;
          replaceItems(items, a, b, f.to);
          n++;
        }
      }
      continue;
    }
    const pairs: [string, string][] = f.fam === "paren" ? [["（", "("], ["）", ")"]] : [[f.from, f.to]];
    for (const p of all) {
      for (const t of descendants(p, "t")) {
        for (let c = t.firstChild; c; c = c.nextSibling) {
          if (c.nodeType !== 3) continue;
          let v = c.nodeValue ?? "";
          for (const [a, b] of pairs) {
            const k = v.split(a).length - 1;
            if (k) {
              n += k;
              v = v.split(a).join(b);
            }
          }
          c.nodeValue = v;
        }
      }
    }
  }
  return n;
}

/**
 * 교사가 화면에서 정한 배점을 결과에 씁니다. 배점 표기가 있으면 그 숫자를, 없으면 발문의 마지막 물음표 뒤
 * (없으면 발문 끝)에 [x점]을 넣습니다. 선지 문단에는 넣지 않습니다.
 */
export function applyScoreOverride(paras: Element[], firstChoice: number, score: number, decimal: boolean): string | null {
  const want = `[${formatScore(score, decimal)}점]`;
  for (let i = paras.length - 1; i >= 0; i--) {
    const items = itemsOf(paras[i]);
    const ix = indexText(items);
    const ms = [...ix.text.matchAll(RX.score)];
    const m = ms[ms.length - 1];
    if (!m) continue;
    const [a, b] = ix.range(m.index!, m.index! + m[0].length);
    if (items.slice(a, b).some((it) => it.kind === "obj" || it.kind === "mark")) return null;
    if (m[0] === want) return null;
    replaceItems(items, a, b, want);
    return `${m[0]} → ${want}(화면에서 지정)`;
  }
  const stemEnd = Math.max(1, Math.min(paras.length, firstChoice));
  for (let i = stemEnd - 1; i >= 0; i--) {
    const items = itemsOf(paras[i]);
    const ix = indexText(items);
    const q = ix.text.lastIndexOf("?");
    if (q < 0) continue;
    const [, b] = ix.range(q, q + 1);
    replaceItems(items, b, b, ` ${want}`);
    return `배점 표기가 없어 물음표 뒤에 ${want}을 넣음(화면에서 지정)`;
  }
  for (let i = stemEnd - 1; i >= 0; i--) {
    const items = itemsOf(paras[i]);
    const last = items.map((it, k) => (it.kind === "ch" ? k : -1)).filter((k) => k >= 0).pop();
    if (last == null) continue;
    replaceItems(items, last + 1, last + 1, ` ${want}`);
    return `배점 표기가 없어 발문 끝에 ${want}을 넣음(화면에서 지정)`;
  }
  return null;
}

export function buildQuestion(
  q: Question,
  finalNumber: number,
  importer: Importer,
  spec: FormatSpec,
  numberSizeHU: number,
): BuildResult {
  const doc = importer.out.doc;
  const changes: Change[] = [];
  const issues: Issue[] = [];
  const log = (kind: string, detail: string) => changes.push({ questionId: q.id, kind, detail });
  const warn = (message: string) =>
    issues.push({ severity: "warn", rule: "개체 크기", message, source: "양식 배치 규격(단 폭) — 결과 원안지", questionId: q.id });
  let paras = q.paras.map((p) => doc.importNode(p, true) as Element);


  // 1) 머리 문단
  const head = paras[Math.min(q.headIdx ?? 0, paras.length - 1)];
  if (q.kind === "mcq") {
    if (q.numberSource === "literal" && stripLiteralNumber(head)) log("번호", "직접 입력한 번호를 지우고 양식의 번호 방식으로 바꿈");
    else if (q.numberSource === "none") log("번호", "번호 없이 쓴 문항에 양식의 번호를 붙임");
    head.setAttribute("paraPrIDRef", "@head");
  } else if (renumberEssay(head, finalNumber, numberSizeHU)) {
    log("번호", `논술형 번호를 ${finalNumber}번으로 다시 매김`);
  }

  // 0) 교사가 화면에서 고른 기호 바꾸기와 배점(교사가 단추·입력으로 정한 것만)
  if (q.symbolFixes?.length) {
    const n = applySymbolFixes(paras, q.symbolFixes);
    if (n) log("기호 바꿈", `${q.symbolFixes.map((f) => `‘${f.from}’ → ‘${f.to}’`).join(", ")} ${n}곳(교사 확인)`);
  }
  if (q.scoreOverride != null) {
    const d = applyScoreOverride(paras, q.choices?.paraIdx[0] ?? paras.length, q.scoreOverride, spec.scoreDecimal);
    if (d) log("배점", d);
  }

  // 1-1) 교사가 화면에서 지정한 정답: 선지 번호(①~⑤)에 정답 음영, 다른 번호의 음영은 지움(글자는 그대로)
  if (q.kind === "mcq" && q.answerOverride) {
    const want = new Set(q.answerOverride);
    for (const p of paras.flatMap((x) => [x, ...descendants(x, "p")])) {
      restyle(p, (it) => {
        if (it.kind !== "ch") return null;
        const ci = circledIndex(it.ch);
        if (ci < 0) return null;
        if (want.has(ci + 1)) return "shade=#FFFF00";
        return importer.src.shadeOf(it.cp) ? "shade=none" : null;
      });
    }
    log("정답", `화면에서 지정한 정답 ${[...want].map((a) => "①②③④⑤"[a - 1]).join("")}에 음영 표시`);
  }

  // 2) 선지 다시 짜기
  const choiceIdx = q.choices?.paraIdx ?? [];
  if (q.kind === "mcq" && spec.choiceLayout === "auto" && choiceIdx.length && q.choices?.ordered) {
    const contiguous = choiceIdx.every((v, i) => i === 0 || v === choiceIdx[i - 1] + 1);
    const target = choiceIdx.map((i) => paras[i]);
    const r = contiguous ? relayoutChoices(target, spec, (cp) => !!importer.src.shadeOf(cp)) : "선지 문단이 떨어져 있음";
    if (typeof r === "string") log("선지 배열 유지", r);
    else {
      paras = [...paras.slice(0, choiceIdx[0]), ...r.paras, ...paras.slice(choiceIdx[choiceIdx.length - 1] + 1)];
      log("선지 배열", r.perLine === 1 ? "한 줄에 하나(내어쓰기)" : `한 줄에 ${r.perLine}개(탭 간격)`);
    }
  }

  // 3) 문단별 형식 정리(표 안 제외)
  const isChoiceP = (p: Element) => (p.getAttribute("paraPrIDRef") ?? "").startsWith("@choice");
  for (const p of paras) {
    if (inTable(p) || isChoiceP(p)) continue;
    if (spec.normalizeScore) for (const d of fixScores(p, spec.scoreDecimal)) log("배점", d);
    if (isRightLine(p)) {
      trimLeading(p);
      p.setAttribute("paraPrIDRef", "@score");
      continue;
    }
    if (trimLeading(p) && p !== head) log("공백", "문단 앞 공백 정리");
    trimTrailing(p);
  }

  // 3-0) 표·그림 뒤 글이 원본에서 새 줄로 시작했으면 문단을 나눠 고정(결과 단이 넓어도 개체 옆에 붙지 않게).
  //      앞 단계에서 지운 공백만큼 캐시 위치를 맞춰 두었으므로 원본 줄 위치로 판단할 수 있습니다.
  {
    const out: Element[] = [];
    for (const p of paras) {
      out.push(p);
      if (inTable(p) || isChoiceP(p)) continue;
      let cur = p;
      for (let guard = 0; guard < 4; guard++) {
        const rest = splitAfterWideObject(cur);
        if (!rest) break;
        const tok = cur.getAttribute("paraPrIDRef") ?? "";
        if (tok === "@head") rest.setAttribute("paraPrIDRef", "@gap");
        out.push(rest);
        log("문단 나눔", "표·그림 뒤 글이 원본처럼 다음 줄에서 시작하도록 문단을 나눔(글자는 그대로)");
        cur = rest;
      }
    }
    paras = out;
  }

  // 3-1) 번호: 양식이 번호를 글자로 쓰면 "n." 글자를 넣고, 자동 번호면 번호 뒤 공백 관례를 따릅니다.
  if (q.kind === "mcq") {
    trimAfterFloats(head);
    if (spec.numbering.method === "literal") insertLiteralNumber(head, finalNumber, spec);
    else insertLead(head, spec.headLead);
  }

  // 3-2) 〈보기〉·표·그림 크기를 결과 단에 맞춤
  if (spec.fitObjects) {
    const em = spec.sizePt * 100;
    for (const p of paras) {
      const tok = p.getAttribute("paraPrIDRef") ?? "";
      let left = 0;
      let right = 0;
      let intent = 0;
      const pp = tok === "@head" ? importer.out.paraPr(spec.headParaPrId) : tok.startsWith("@") ? null : importer.src.paraPr(tok);
      if (pp) {
        left = getMargin(pp, "left");
        right = getMargin(pp, "right");
        intent = getMargin(pp, "intent");
      }
      if (tok.startsWith("@choice")) left = spec.choiceIndentHU;
      // 머리 문단 첫 줄에는 번호가 들어가므로 두 글자 폭을 남깁니다.
      const numberRoom = tok === "@head" ? 2 * em : 0;
      const avail = spec.columnWidthHU - Math.max(0, left) - Math.max(0, right) - Math.max(0, intent) - numberRoom - 60;
      fitObjects(p, avail, spec, log, warn, (tbl) => tableFontHU(tbl, importer));
    }
  }


  // 4) 부정어 강조(발문)
  if (q.kind === "mcq" && spec.negation === "auto") {
    const firstChoice = paras.findIndex(isChoiceP);
    const stemParas = paras.slice(0, firstChoice < 0 ? paras.length : firstChoice);
    for (const p of stemParas) {
      const ix = indexText(itemsOf(p));
      const spans = negationSpans(ix.text);
      if (!spans.length) continue;
      const set = new Set<number>();
      for (const s of spans) {
        const [a, b] = ix.range(s.start, s.end);
        for (let i = a; i < b; i++) set.add(i);
      }
      restyle(p, (_it, i) => (set.has(i) ? "neg" : null));
      log("부정어", spans.map((s) => `'${s.word}'`).join(", ") + " 강조");
    }
  }

  // 5) 빈 줄 정리: 문항 안 빈 문단은 없애고, 〈보기〉 상자 바로 뒤 선지 앞에만 한 줄.
  //    단, 떠 있는(어울림·글 뒤로 등) 그림·표가 있는 문항은 빈 줄이 그 개체의 자리를 잡아 주므로 그대로 둡니다
  //    (지우면 뒤 문단이 그림 옆으로 말려 올라가 겹칩니다).
  const hasFloat = paras.some((p) => topObjects(p).some((o) => !isInline(o)));
  if (hasFloat && paras.some((p, i) => i > 0 && isBlank(p))) log("빈 줄 유지", "떠 있는 그림·표의 자리를 잡는 빈 줄이라 지우지 않음");
  const kept: Element[] = [];
  for (const p of paras) {
    if (p !== head && isBlank(p) && !hasFloat) continue;
    if (isChoiceP(p) && kept.length && !isChoiceP(kept[kept.length - 1])) {
      const prev = kept[kept.length - 1];
      if (itemsOf(prev).some((i) => i.kind === "obj" && (i.node as Element).localName === "tbl")) {
        const b = hp(doc, "p");
        b.setAttribute("id", "0");
        b.setAttribute("paraPrIDRef", "@gap");
        b.setAttribute("styleIDRef", "0");
        b.setAttribute("pageBreak", "0");
        b.setAttribute("columnBreak", "0");
        b.setAttribute("merged", "0");
        const r = hp(doc, "run");
        r.setAttribute("charPrIDRef", spec.bodyCharPrId + "|tpl");
        r.appendChild(hp(doc, "t"));
        b.appendChild(r);
        kept.push(b);
      }
    }
    kept.push(p);
  }
  const removed = paras.length - kept.filter((p) => p.getAttribute("paraPrIDRef") !== "@gap").length;
  if (removed > 0) log("빈 줄", `문항 안 빈 줄 ${removed}개 정리`);
  paras = kept;

  // 6) ID 재배정 + 규격 적용
  const last = paras[paras.length - 1];
  for (const p of paras) {
    const keep = spec.keepTogether && p !== last;
    importer.importTree(p, "norm", (x) => x === p && keep);
  }
  return { paras, head, changes, issues };
}
