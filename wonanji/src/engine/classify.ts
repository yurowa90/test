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
  heading: { type: string; level: number };
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

export function paraInfos(pkg: HwpxPackage, index: HeaderIndex): PInfo[] {
  return pkg.topParagraphs().map((el, idx) => {
    const pp = index.paraPr(el.getAttribute("paraPrIDRef") ?? "");
    const head = pp ? kid(pp, "heading") : null;
    const deep = deepText(el);
    return {
      el,
      idx,
      text: ownText(el),
      deep,
      norm: normText(deep),
      heading: { type: head?.getAttribute("type") ?? "NONE", level: Number(head?.getAttribute("level") ?? 0) },
      blank: isBlank(el),
      objs: contentObjects(el),
      hasSection: kids(el).some((r) => r.localName === "run" && kids(r).some((c) => c.localName === "secPr")),
    };
  });
}

export function isOutlineHead(p: PInfo): boolean {
  return p.heading.type === "OUTLINE" && p.heading.level === 0;
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
