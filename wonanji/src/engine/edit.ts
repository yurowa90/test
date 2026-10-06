// 교사가 화면에서 문항 글자를 직접 고치는 기능(주로 사진 인식 결과 교정).
// 앱이 스스로 글자를 바꾸지는 않습니다. 교사가 원본 사진과 대조해 고친 글만 그대로 넣고, 고친 문단은 검정 글자가 됩니다.
// 고치기 전 문단은 기억해 두었다가 ‘원래대로’로 되돌릴 수 있습니다(페이지 메모리 안에서만).
import { descendants, hp, kids } from "./dom";
import { OutputHeader, type HeaderIndex } from "./header";
import { itemsOf, replaceItems } from "./text";
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

/**
 * 문항 안에서 고칠 수 있는 문단(문서 순서, 표 칸 안 포함). 교사가 고친 문단은 글을 모두 비웠어도 남겨 둡니다
 * (목록 순번이 작업 저장 파일의 열쇠이므로, 원본에서 다시 읽은 목록과 순번이 같아야 합니다).
 */
export function editableParas(q: Question): Element[] {
  return q.paras.flatMap((p) => [p, ...descendants(p, "p")]).filter((p) => isEdited(p) || isEditable(p));
}

/** 빨간(불확실) 글자가 있지만 수식·그림 같은 개체가 함께 있어 화면에서 고칠 수 없는 문단(한글에서 고칠 것). */
export function lockedUnsureParas(q: Question, index: HeaderIndex): Element[] {
  return q.paras
    .flatMap((p) => [p, ...descendants(p, "p")])
    .filter((p) => !isEdited(p) && !isEditable(p) && unsureCount(p, index) > 0);
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

/** 검정 글자 모양: 문단(없으면 문항·문서)에서 빨갛지 않은 글자 모양 중 가장 많이 쓴 것. 빈 문단에 글을 새로 넣을 때만 씁니다. */
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

// 고친 글 속 탭·줄 바꿈을 잠깐 나타내는 글자(사용자 글에 나오지 않는 사용자 정의 영역)
const TAB_MARK = "\uE000";
const BR_MARK = "\uE001";

/** 글자 노드 속 TAB_MARK·BR_MARK를 hp:tab·hp:lineBreak 요소로 바꿉니다. */
function expandMarks(p: Element) {
  const doc = p.ownerDocument!;
  for (const t of descendants(p, "t")) {
    for (const node of [...(t.childNodes as unknown as Node[])]) {
      if (node.nodeType !== 3 || !/[\uE000\uE001]/.test(node.nodeValue ?? "")) continue;
      for (const part of (node.nodeValue ?? "").split(/([\uE000\uE001])/)) {
        if (!part) continue;
        if (part === TAB_MARK) {
          const tab = hp(doc, "tab");
          tab.setAttribute("width", "4000");
          tab.setAttribute("leader", "0");
          tab.setAttribute("type", "1");
          t.insertBefore(tab, node);
        } else if (part === BR_MARK) t.insertBefore(hp(doc, "lineBreak"), node);
        else t.insertBefore(doc.createTextNode(part), node);
      }
      t.removeChild(node);
    }
  }
}

/** 문단의 빨간(불확실) 글자 모양을 같은 서식의 검정판으로 바꿉니다(밑줄·첨자·굵기는 그대로). */
function blackenUnsure(p: Element, index: HeaderIndex) {
  // 화면이 들고 있는 HeaderIndex는 다른 곳에서 더한 글자 모양을 모를 수 있어, 더할 때는 문서를 새로 읽습니다(ID 겹침 방지).
  const fresh = new OutputHeader(index.pkg);
  const made = new Map<string, string>();
  for (const run of kids(p).filter((r) => r.localName === "run")) {
    const parts = (run.getAttribute("charPrIDRef") ?? "0").split("|");
    const id = parts[0] ?? "0";
    const cp = fresh.charPr(id);
    if (!cp || (cp.getAttribute("textColor") ?? "").toUpperCase() !== UNSURE_COLOR) continue;
    let nid = made.get(id);
    if (!nid) {
      const c = cp.cloneNode(true) as Element;
      c.setAttribute("textColor", "#000000");
      nid = fresh.add("charProperties", c);
      made.set(id, nid);
    }
    run.setAttribute("charPrIDRef", [nid, ...parts.slice(1)].join("|"));
  }
  if (made.size) fresh.finalize();
}

/**
 * 문단 글자를 교사가 고친 글로 바꿉니다. 고치기 전과 후의 글을 앞뒤로 맞춰 보아 **바뀐 구간만** 갈아 끼우므로,
 * 바뀌지 않은 글자의 글자 모양(밑줄·첨자·굵기)은 그대로 남습니다. 교사가 확인한 문단이므로 빨간(불확실) 글자는
 * 같은 서식의 검정으로 바꿉니다. 탭은 hp:tab, 줄 바꿈은 hp:lineBreak로 넣고, 줄 배치 캐시는 지웁니다(한글·미리보기가 새로 계산).
 * 구역 정의·머리말 같은 구조 요소는 건드리지 않습니다.
 */
export function setParaText(p: Element, text: string, index: HeaderIndex): void {
  if (!originals.has(p)) originals.set(p, p.cloneNode(true) as Element);
  const doc = p.ownerDocument!;
  const enc = (x: string) => x.replace(/\t/g, TAB_MARK).replace(/\n/g, BR_MARK);
  const items = itemsOf(p);
  const vis = items.map((it, i) => ({ it, i })).filter((x) => x.it.kind !== "obj" && x.it.kind !== "mark");
  if (!vis.length) {
    // 글자가 하나도 없는 문단(교사가 비웠던 문단)에 새로 넣기
    if (text) {
      const run = hp(doc, "run");
      run.setAttribute("charPrIDRef", blackCharPr(p, index));
      const t = hp(doc, "t");
      t.appendChild(doc.createTextNode(enc(text)));
      run.appendChild(t);
      const ls = kids(p).find((c) => c.localName === "linesegarray");
      p.insertBefore(run, ls ?? null);
    }
  } else {
    // 앞뒤로 같은 글자 항목 수
    let k = 0;
    let pos = 0;
    while (k < vis.length && text.startsWith(vis[k].it.ch, pos)) pos += vis[k++].it.ch.length;
    let m = 0;
    let end = text.length;
    while (m < vis.length - k && end - vis[vis.length - 1 - m].it.ch.length >= pos && text.endsWith(vis[vis.length - 1 - m].it.ch, end)) {
      end -= vis[vis.length - 1 - m].it.ch.length;
      m++;
    }
    let mid = enc(text.slice(pos, end));
    let a: number;
    let b: number;
    if (k < vis.length - m) {
      a = vis[k].i;
      b = vis[vis.length - 1 - m].i + 1;
    } else if (mid) {
      // 순수 삽입: 앞 글자(없으면 뒤 글자)를 함께 바꿔 그 글자의 글자 모양을 따르게 합니다.
      if (k > 0) {
        a = vis[k - 1].i;
        mid = enc(vis[k - 1].it.ch) + mid;
      } else {
        a = vis[0].i;
        mid = mid + enc(vis[0].it.ch);
      }
      b = a + 1;
    } else {
      a = b = -1;
    }
    if (a >= 0) replaceItems(items, a, b, mid);
    expandMarks(p);
  }
  blackenUnsure(p, index);
  const ls = kids(p).find((c) => c.localName === "linesegarray");
  if (ls) p.removeChild(ls);
}

/** 교사가 고친 문단의 바꾸기 전·후 글(보고서용) */
export function teacherEdits(q: Question): { before: string; after: string }[] {
  return editableParas(q)
    .filter(isEdited)
    .map((p) => ({ before: paraText(originals.get(p)!), after: paraText(p) }));
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
