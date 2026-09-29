// 최상위 문단을 분류하는 공통 도구(양식 분석과 출제 파일 분석이 함께 씁니다).
import { hasAncestor, kid, kids } from "./dom";
import type { HeaderIndex } from "./header";
import type { HwpxPackage } from "./pkg";
import { contentObjects, deepText, isBlank, ownText } from "./text";

export interface PInfo {
  el: Element;
  idx: number;
  text: string;
  deep: string;
  norm: string;
  /** 문단 머리(개요·문단 번호). numFormat은 문단 번호일 때 그 수준의 번호 형식(DIGIT 등) */
  heading: { type: string; level: number; idRef: string; numFormat: string | null };
  blank: boolean;
  objs: Element[];
  hasSection: boolean;
}

export const RX = {
  literalNum: /^\s*(\d{1,2})\s*\.\s*(?=\S)/,
  essayHead: /【\s*(?:문항\s*)?(\d+)\s*[-–―~]?\s*(?:논술|서술|서답)형\s*】|[[［]\s*(?:논술|서술|서답)형\s*(\d+)\s*[\]］]|^\s*(?:논술|서술|서답)형\s*(\d+)/,
  essayIntro: /다음\s*문항부터는?\s*.{0,6}(논술|서술|서답)형|(서술형|논술형)\s*답란/,
  score: /[[［(（]\s*(\d+(?:\.\d+)?)\s*점\s*[\]］)）]/g,
  emptyScore: /[[［]\s*점\s*[\]］]/,
  noticeStart: /유의\s*사항/,
  tailWords: /확인\s*사항|저작권|시험이\s*끝|다음\s*면에\s*계속|수고하셨습니다/,
  circled: /[①-⑤]/,
};

export function normText(s: string): string {
  return s.replace(/[\s 　]+/g, "").replace(/￼/g, "");
}

export function pinfoOf(el: Element, idx: number, index: HeaderIndex): PInfo {
  const pp = index.paraPr(el.getAttribute("paraPrIDRef") ?? "");
  const head = pp ? kid(pp, "heading") : null;
  const deep = deepText(el);
  const type = head?.getAttribute("type") ?? "NONE";
  const level = Number(head?.getAttribute("level") ?? 0);
  const idRef = head?.getAttribute("idRef") ?? "0";
  let numFormat: string | null = null;
  if (type === "NUMBER") {
    const nb = index.byId.numberings.get(idRef);
    const ph = nb ? kids(nb).find((e) => e.localName === "paraHead" && e.getAttribute("level") === String(level + 1)) : null;
    numFormat = ph?.getAttribute("numFormat") ?? null;
  }
  return {
    el,
    idx,
    text: ownText(el),
    deep,
    norm: normText(deep),
    heading: { type, level, idRef, numFormat },
    blank: isBlank(el),
    objs: contentObjects(el),
    hasSection: kids(el).some((r) => r.localName === "run" && kids(r).some((c) => c.localName === "secPr")),
  };
}

export function paraInfos(pkg: HwpxPackage, index: HeaderIndex): PInfo[] {
  return pkg.topParagraphs().map((el, idx) => pinfoOf(el, idx, index));
}

/** 문항 문단처럼 보이는 글(선지·발문·〈보기〉). 양식 상용구로 삼으면 안 됩니다. */
export function looksLikeItem(text: string): boolean {
  return /[①-⑤]/.test(text) || /\?\s*(\[[^\]]*\])?\s*$/.test(text.trim()) || /[<〈]\s*보\s*기\s*[>〉]/.test(text);
}

export function isOutlineHead(p: PInfo): boolean {
  return p.heading.type === "OUTLINE" && p.heading.level === 0;
}

/**
 * 문서에서 문항 번호로 쓰인 머리 수준. 개요 1수준이 있으면 0, 없으면 가장 낮은 개요 수준
 * (개요 2수준으로 문항 번호를 단 파일도 있습니다).
 */
export function headLevelOf(infos: PInfo[]): number {
  const levels = infos.filter((p) => p.heading.type === "OUTLINE").map((p) => p.heading.level);
  return levels.length ? Math.min(...levels) : 0;
}

/** 자동 번호가 달린 문항 머리: 개요 번호(문서의 문항 수준) 또는 숫자 문단 번호(1수준). */
export function isQuestionHead(p: PInfo, level = 0): "outline" | "number" | null {
  if (p.heading.type === "OUTLINE" && p.heading.level === level) return "outline";
  if (p.heading.type === "NUMBER" && p.heading.level === 0 && p.heading.numFormat === "DIGIT") return "number";
  return null;
}

/** 선지로 시작하는 문단 */
export function isChoiceLine(text: string): boolean {
  return /^[\s ]*[①-⑤]/.test(text);
}

/** 배점만 있는 줄 */
export function isScoreLine(text: string): boolean {
  return /^\s*[[［(（]\s*\d+(?:\.\d+)?\s*점[^\]］)）]{0,16}[\]］)）]\s*$/.test(text);
}

export function essayNumber(text: string): number | null {
  const m = RX.essayHead.exec(text);
  if (!m) return null;
  return Number(m[1] ?? m[2] ?? m[3]);
}

/** 문자 bigram 자카드 유사도(0~1). */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const grams = (s: string) => {
    const g = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
    return g;
  };
  const A = grams(a);
  const B = grams(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

export function inTable(el: Element): boolean {
  return hasAncestor(el, ["tc"]);
}

export const CIRCLED = ["①", "②", "③", "④", "⑤"];

export function circledIndex(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 0x2460 && c <= 0x2464 ? c - 0x2460 : -1;
}
