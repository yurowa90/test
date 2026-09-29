// 기호 일관성: 〈보기〉 표시, 발문 속 〈보기〉, 〈보기〉 항목 기호, 불릿, 물결표, 가운뎃점, 전각 괄호, 밑줄 기호.
// 기호는 문항의 뜻과 맞물려 있어(예: ㉠과 ⓐ를 구별해 쓰는 문항) 자동으로 바꾸지 않습니다.
// 양식 예시 문항의 기호를 기준으로(양식에 없으면 출제 파일 다수 기준) 다른 곳을 찾아 화면과 검수 보고서에 알립니다.
import { descendants } from "./dom";
import type { HeaderIndex } from "./header";
import { isBogiBox } from "./objects";
import { deepText } from "./text";

/** 기호 종류별 변형 사용 횟수 */
export type SymbolProfile = Record<string, Record<string, number>>;

export const SYMBOL_LABEL: Record<string, string> = {
  bogiLabel: "〈보기〉 상자 표시",
  bogiRef: "발문 속 〈보기〉",
  bogiItem: "〈보기〉 항목 기호",
  bullet: "불릿(줄머리 기호)",
  tilde: "물결표",
  middot: "가운뎃점",
  paren: "괄호",
  mark: "밑줄 기호",
};

/** 종류별로, 여러 변형이 함께 쓰여도 되는 것(불릿은 여러 종류를 섞어 쓸 수 있음) */
const SET_FAMILY = new Set(["bullet"]);

function add(prof: SymbolProfile, fam: string, v: string, n = 1) {
  const f = (prof[fam] ??= {});
  f[v] = (f[v] ?? 0) + n;
}

/** 문단들(문항 한 개 또는 양식 예시 전체)에서 기호 사용을 셉니다. */
export function collectSymbols(paras: Element[], index?: HeaderIndex): SymbolProfile {
  const prof: SymbolProfile = {};
  const boxes = new Set<Element>();
  for (const p of paras) for (const t of descendants(p, "tbl")) if (isBogiBox(t)) boxes.add(t);
  for (const box of boxes) {
    const lines = deepText(box).split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines[0]) add(prof, "bogiLabel", lines[0].replace(/\s+/g, " "));
    for (const l of lines) {
      const m = /^([ㄱ-ㅎ])\s*([.．)）])/.exec(l);
      if (m) add(prof, "bogiItem", `ㄱ${m[2]}`);
    }
  }
  for (const p of paras) {
    const text = deepText(p);
    for (const m of text.matchAll(/([<〈＜《[［])\s*보\s*기\s*([>〉＞》\]］])/g)) {
      // 상자 첫 줄(표시)은 따로 셉니다. 발문(물음) 안의 것만.
      const line = text.slice(Math.max(0, text.lastIndexOf("\n", m.index!) + 1), text.indexOf("\n", m.index!) < 0 ? undefined : text.indexOf("\n", m.index!));
      if (/고른|에서|를\s*참고|의\s*내용/.test(line)) add(prof, "bogiRef", `${m[1]}보기${m[2]}`);
    }
    for (const line of text.split("\n")) {
      const b = /^\s*([◦∘•○●▪■□◆◇※▶▷➀\-–])\s/.exec(line);
      if (b) add(prof, "bullet", b[1]);
    }
    for (const m of text.matchAll(/[~∼～〜]/g)) add(prof, "tilde", m[0]);
    for (const m of text.matchAll(/(?<=[가-힣A-Za-z0-9)\]])\s?([·ㆍ∙])\s?(?=[가-힣A-Za-z0-9(])/g)) add(prof, "middot", m[1]);
    for (const m of text.matchAll(/[（）]/g)) add(prof, "paren", m[0] === "（" ? "전각 （ ）" : "전각 （ ）");
    if (/[()]/.test(text)) add(prof, "paren", "반각 ( )", (text.match(/[()]/g) ?? []).length);
    for (const m of text.matchAll(/[㉠-㉭]|[ⓐ-ⓩ]|[㈀-㈍]|[Ⓐ-Ⓩ]/g)) {
      const c = m[0].codePointAt(0)!;
      add(prof, "mark", c >= 0x3260 && c <= 0x326d ? "㉠형" : c >= 0x24d0 && c <= 0x24e9 ? "ⓐ형" : c >= 0x3200 && c <= 0x320d ? "㈀형" : "Ⓐ형");
    }
    // 문단 불릿(한글 문단 모양의 글머리표)
    if (index) {
      for (const q of [p, ...descendants(p, "p")]) {
        const pp = index.paraPr(q.getAttribute("paraPrIDRef") ?? "");
        const h = pp && [...(pp.childNodes as unknown as Node[])].find((n) => n.nodeType === 1 && (n as Element).localName === "heading") as Element | undefined;
        if (h?.getAttribute("type") === "BULLET") {
          const ch = index.byId.bullets.get(h.getAttribute("idRef") ?? "")?.getAttribute("char");
          if (ch) add(prof, "bullet", `문단 글머리표 ${ch}`);
        }
      }
    }
  }
  return prof;
}

export function mergeProfiles(list: SymbolProfile[]): SymbolProfile {
  const out: SymbolProfile = {};
  for (const p of list) for (const [fam, vs] of Object.entries(p)) for (const [v, n] of Object.entries(vs)) add(out, fam, v, n);
  return out;
}

const top = (vs: Record<string, number>) => Object.entries(vs).sort((a, b) => b[1] - a[1])[0]?.[0];

/**
 * 기준(양식, 없으면 출제 파일 전체 다수)과 다른 기호. 반환: [종류, 쓴 기호, 기준 기호, 기준 출처]
 */
export function symbolMismatches(q: SymbolProfile, tpl: SymbolProfile, all: SymbolProfile): { fam: string; used: string; want: string; basis: "양식" | "다수" }[] {
  const out: { fam: string; used: string; want: string; basis: "양식" | "다수" }[] = [];
  for (const [fam, vs] of Object.entries(q)) {
    const ref = tpl[fam] && Object.keys(tpl[fam]).length ? tpl[fam] : all[fam];
    if (!ref) continue;
    const basis = tpl[fam] && Object.keys(tpl[fam]).length ? "양식" : "다수";
    // 괄호: 반각이 기준이면 전각만 문제
    if (fam === "paren") {
      if (vs["전각 （ ）"] && !ref["전각 （ ）"]) out.push({ fam, used: "전각 （ ）", want: "반각 ( )", basis });
      continue;
    }
    if (fam === "mark") continue; // 밑줄 기호 종류는 문항마다 뜻이 달라 비교하지 않습니다(한 문항 안 섞임만 아래에서 봄).
    if (SET_FAMILY.has(fam)) {
      for (const v of Object.keys(vs)) if (!ref[v]) out.push({ fam, used: v, want: Object.keys(ref).join(" "), basis });
      continue;
    }
    const want = top(ref);
    for (const v of Object.keys(vs)) if (want && v !== want) out.push({ fam, used: v, want, basis });
  }
  return out;
}
