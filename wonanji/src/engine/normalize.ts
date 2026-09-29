// 문항 한 개를 양식 문서로 옮기면서 편집 규격을 입힙니다.
// 글자를 새로 쓰는 일은 배점 표기·번호·공백 정리처럼 형식에 한정하고, 문항 내용은 바꾸지 않습니다.
import { circledIndex, inTable, RX } from "./classify";
import { hp, kid } from "./dom";
import type { Importer } from "./header";
import { indexText, isBlank, itemsOf, replaceItems, restyle, textOf, trimLeading, trimTrailing, type Item } from "./text";
import type { Change, FormatSpec, Question } from "./types";

export function formatScore(n: number): string {
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
  changes: Change[];
}

/** 배점만 있는 줄(부분 점수 안내 포함) 또는 공백으로 오른쪽에 밀어 둔 짧은 줄(출처 등). */
function isRightLine(p: Element): boolean {
  const t = textOf(itemsOf(p));
  if (/^\s*[[［(（]\s*\d+(?:\.\d+)?\s*점[^\]］)）]{0,16}[\]］)）]\s*$/.test(t)) return true;
  const lead = /^[\s\u00a0]*/.exec(t)![0].length;
  return lead >= 8 && t.trim().length > 0 && t.trim().length <= 30 && !t.includes("\uFFFC");
}

/** 문단 안 배점 표기를 [x.x점]으로, 물음표와 배점 사이를 한 칸으로. */
function fixScores(p: Element): string[] {
  const log: string[] = [];
  for (let guard = 0; guard < 6; guard++) {
    const items = itemsOf(p);
    const ix = indexText(items);
    const text = ix.text;
    let changed = false;
    for (const m of text.matchAll(RX.score)) {
      const want = `[${formatScore(Number(m[1]))}점]`;
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

export function buildQuestion(
  q: Question,
  finalNumber: number,
  importer: Importer,
  spec: FormatSpec,
  numberSizeHU: number,
): BuildResult {
  const doc = importer.out.doc;
  const changes: Change[] = [];
  const log = (kind: string, detail: string) => changes.push({ questionId: q.id, kind, detail });
  let paras = q.paras.map((p) => doc.importNode(p, true) as Element);

  // 1) 머리 문단
  const head = paras[0];
  if (q.kind === "mcq") {
    if (q.numberSource === "literal" && stripLiteralNumber(head)) log("번호", "직접 입력한 번호를 지우고 자동 번호로 바꿈");
    head.setAttribute("paraPrIDRef", "@head");
  } else if (renumberEssay(head, finalNumber, numberSizeHU)) {
    log("번호", `논술형 번호를 ${finalNumber}번으로 다시 매김`);
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
    if (spec.normalizeScore) for (const d of fixScores(p)) log("배점", d);
    if (isRightLine(p)) {
      trimLeading(p);
      p.setAttribute("paraPrIDRef", "@score");
      continue;
    }
    if (trimLeading(p)) log("공백", "문단 앞 공백 정리");
    trimTrailing(p);
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

  // 5) 빈 줄 정리: 문항 안 빈 문단은 없애고, 〈보기〉 상자 바로 뒤 선지 앞에만 한 줄
  const kept: Element[] = [];
  for (const p of paras) {
    if (p !== paras[0] && isBlank(p)) continue;
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
  return { paras, changes };
}
