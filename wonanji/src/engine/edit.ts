// 교사가 화면에서 문항 글자를 직접 고치는 기능(주로 사진 인식 결과 교정).
// 앱이 스스로 글자를 바꾸지는 않습니다. 교사가 원본 사진과 대조해 고친 글만 그대로 넣고, 고친 문단은 검정 글자가 됩니다.
// 고치기 전 문단은 기억해 두었다가 ‘원래대로’로 되돌릴 수 있습니다(페이지 메모리 안에서만).
import { descendants, hp, kids } from "./dom";
import type { HeaderIndex } from "./header";
import { itemsOf } from "./text";
import type { Question } from "./types";
import { UNSURE_COLOR } from "./unsure";

/** 고칠 수 있는 문단: 글자가 있고, 그림·표·수식 같은 개체가 없는 문단(표 칸 안 문단 포함). 구역 정의·머리말은 그대로 둡니다. */
const STRUCTURAL = new Set(["secPr", "ctrl"]);

function runChildren(p: Element): Element[] {
  return kids(p)
    .filter((r) => r.localName === "run")
    .flatMap((r) => kids(r));
}

export function isEditable(p: Element): boolean {
  const children = runChildren(p);
  if (children.some((c) => c.localName !== "t" && !STRUCTURAL.has(c.localName))) return false;
  return itemsOf(p).some((it) => it.kind === "ch" && it.ch.trim());
}

/** 문항 안에서 고칠 수 있는 문단(문서 순서, 표 칸 안 포함). */
export function editableParas(q: Question): Element[] {
  return q.paras.flatMap((p) => [p, ...descendants(p, "p")]).filter(isEditable);
}

export interface Seg {
  text: string;
  unsure: boolean;
}

const isUnsure = (index: HeaderIndex, cp: string) => (index.charPr(cp.split("|")[0])?.getAttribute("textColor") ?? "").toUpperCase() === UNSURE_COLOR;

/** 화면 표시용: 문단 글자를 불확실(빨간) 구간과 나머지로 나눕니다. */
export function paraSegments(p: Element, index: HeaderIndex): Seg[] {
  const out: Seg[] = [];
  for (const it of itemsOf(p)) {
    if (it.kind === "obj" || it.kind === "mark") continue;
    const u = it.kind === "ch" && isUnsure(index, it.cp);
    const last = out[out.length - 1];
    if (last && last.unsure === u) last.text += it.ch;
    else out.push({ text: it.ch, unsure: u });
  }
  return out;
}

export function paraText(p: Element): string {
  return itemsOf(p)
    .filter((it) => it.kind !== "obj" && it.kind !== "mark")
    .map((it) => it.ch)
    .join("");
}

export function unsureCount(p: Element, index: HeaderIndex): number {
  return itemsOf(p).filter((it) => it.kind === "ch" && it.ch.trim() && isUnsure(index, it.cp)).length;
}

const originals = new WeakMap<Element, Element>();

export function isEdited(p: Element): boolean {
  return originals.has(p);
}

/** 검정 글자 모양: 문단(없으면 문항·문서)에서 빨갛지 않은 글자 모양 중 가장 많이 쓴 것. */
function blackCharPr(p: Element, index: HeaderIndex): string {
  const count = new Map<string, number>();
  const scan = (root: Element) => {
    for (const r of [root, ...descendants(root, "p")].flatMap((x) => kids(x).filter((e) => e.localName === "run"))) {
      const cp = (r.getAttribute("charPrIDRef") ?? "0").split("|")[0];
      if (isUnsure(index, cp)) continue;
      count.set(cp, (count.get(cp) ?? 0) + 1);
    }
  };
  scan(p);
  if (!count.size) {
    let top: Element = p;
    while (top.parentNode && (top.parentNode as Element).localName !== "sec") top = top.parentNode as Element;
    scan(top.parentNode ? (top.parentNode as Element) : top);
  }
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (best) return best;
  for (const [id, cp] of index.byId.charProperties) if ((cp.getAttribute("textColor") ?? "").toUpperCase() !== UNSURE_COLOR) return id;
  return "0";
}

/**
 * 문단 글자를 교사가 고친 글로 바꿉니다. 구역 정의·머리말 같은 구조 요소는 그대로 두고 글자(run 안의 t)만 갈아 끼우며,
 * 줄 배치 캐시는 지웁니다(한글·미리보기가 새로 계산). 탭은 탭으로 넣습니다.
 */
export function setParaText(p: Element, text: string, index: HeaderIndex): void {
  if (!originals.has(p)) originals.set(p, p.cloneNode(true) as Element);
  const doc = p.ownerDocument!;
  const cp = blackCharPr(p, index);
  const runs = kids(p).filter((r) => r.localName === "run");
  for (const r of runs) for (const t of kids(r).filter((c) => c.localName === "t")) r.removeChild(t);
  // 구조 요소만 남은 run은 그대로 두고, 글자는 새 run 하나에 담습니다.
  for (const r of runs) if (!kids(r).length) p.removeChild(r);
  const run = hp(doc, "run");
  run.setAttribute("charPrIDRef", cp);
  const t = hp(doc, "t");
  text.split("\t").forEach((part, i) => {
    if (i > 0) {
      const tab = hp(doc, "tab");
      tab.setAttribute("width", "4000");
      tab.setAttribute("leader", "0");
      tab.setAttribute("type", "1");
      t.appendChild(tab);
    }
    if (part) t.appendChild(doc.createTextNode(part));
  });
  run.appendChild(t);
  const ls = kids(p).find((c) => c.localName === "linesegarray");
  p.insertBefore(run, ls ?? null);
  if (ls) p.removeChild(ls);
}

/** 고치기 전으로 되돌립니다. 되돌린 문단이 있으면 참. */
export function restorePara(p: Element): boolean {
  const o = originals.get(p);
  if (!o) return false;
  while (p.firstChild) p.removeChild(p.firstChild);
  for (const c of [...(o.childNodes as unknown as Node[])]) p.appendChild(c.cloneNode(true));
  originals.delete(p);
  return true;
}
