// 문단(<hp:p>)의 글자·탭·개체를 순서대로 편 "항목(item)" 모델.
// 글자 모양을 바꾸거나(부정어 강조, 정답 음영), 글자를 바꾸거나(배점 표기), 선지를 다시 짤 때
// 모두 이 항목 목록을 기준으로 삼습니다. 원래 문단의 run 경계는 필요한 곳에서만 쪼갭니다.
import { hp, isEl, kids, TEXT_NODE, walk } from "./dom";

export type ItemKind = "ch" | "tab" | "space" | "br" | "hyphen" | "obj" | "mark";

export interface Item {
  kind: ItemKind;
  /** 표시 문자: 글자 그대로, 탭 \t, 공백류 ' ', 줄바꿈 \n, 하이픈 -, 개체 ￼, 표지 '' */
  ch: string;
  run: Element;
  node: Node;
  off: number;
  cp: string;
}

const SPACE_EL = new Set(["fwSpace", "nbSpace"]);
export const OBJ = "￼";

export function runsOf(p: Element): Element[] {
  return kids(p).filter((e) => e.localName === "run");
}

export function itemsOf(p: Element): Item[] {
  const out: Item[] = [];
  for (const run of runsOf(p)) {
    const cp = run.getAttribute("charPrIDRef") ?? "0";
    for (const c of kids(run)) {
      if (c.localName !== "t") {
        out.push({ kind: "obj", ch: OBJ, run, node: c, off: 0, cp });
        continue;
      }
      for (let n = c.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === TEXT_NODE) {
          const s = n.nodeValue ?? "";
          let i = 0;
          for (const chr of s) {
            out.push({ kind: "ch", ch: chr, run, node: n, off: i, cp });
            i += chr.length;
          }
        } else if (isEl(n)) {
          const name = n.localName;
          if (name === "tab") out.push({ kind: "tab", ch: "\t", run, node: n, off: 0, cp });
          else if (SPACE_EL.has(name)) out.push({ kind: "space", ch: " ", run, node: n, off: 0, cp });
          else if (name === "lineBreak") out.push({ kind: "br", ch: "\n", run, node: n, off: 0, cp });
          else if (name === "hyphen") out.push({ kind: "hyphen", ch: "-", run, node: n, off: 0, cp });
          else out.push({ kind: "mark", ch: "", run, node: n, off: 0, cp });
        }
      }
    }
  }
  return out;
}

export function textOf(items: Item[]): string {
  return items.map((i) => i.ch).join("");
}

/** 글자열 위치 ↔ 항목 번호 대응표(표지 항목은 폭 0, 확장 한자 등은 폭 2). */
export function indexText(items: Item[]) {
  let text = "";
  const itemAt: number[] = [];
  items.forEach((it, i) => {
    for (let k = 0; k < it.ch.length; k++) itemAt.push(i);
    text += it.ch;
  });
  return {
    text,
    /** 글자열 [s, e) → 항목 [a, b) */
    range(s: number, e: number): [number, number] {
      const a = s < itemAt.length ? itemAt[s] : items.length;
      const b = e > 0 ? itemAt[e - 1] + 1 : 0;
      return [a, Math.max(a, b)];
    },
  };
}

export function ownText(p: Element): string {
  return textOf(itemsOf(p));
}

/** 형광펜 정렬용 "보이는 항목" 문자열(글자·탭·공백류·줄바꿈·하이픈). */
export function visibleItems(items: Item[]): Item[] {
  return items.filter((i) => i.kind !== "obj" && i.kind !== "mark");
}

/** 요소 아래 모든 글자(표·글상자 안 포함). 문단 사이는 줄바꿈. */
export function deepText(el: Element): string {
  const parts: string[] = [];
  walk(el, (e) => {
    if (e.localName === "p" && e !== el && parts.length) parts.push("\n");
    if (e.localName === "t") {
      for (let n = e.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === TEXT_NODE) parts.push(n.nodeValue ?? "");
        else if (isEl(n)) {
          if (n.localName === "tab") parts.push("\t");
          else if (SPACE_EL.has(n.localName)) parts.push(" ");
          else if (n.localName === "lineBreak") parts.push("\n");
        }
      }
      return false;
    }
  });
  return parts.join("");
}

// ── 글자 모양 수정자 ─────────────────────────────────────────────
// 처리 중 run의 charPrIDRef는 "원본ID|수정자|수정자" 형태로 둡니다.
// 실제 글자 모양 생성·ID 재배정은 header.ts의 가져오기 단계에서 한 번에 합니다.

export function splitCp(cp: string): { base: string; mods: string[] } {
  const [base, ...mods] = cp.split("|");
  return { base, mods };
}

export function addMod(cp: string, mod: string): string {
  const { base, mods } = splitCp(cp);
  const key = mod.split("=")[0];
  const rest = mods.filter((m) => m.split("=")[0] !== key);
  return [base, ...rest, mod].join("|");
}

export function modValue(cp: string, key: string): string | null {
  for (const m of splitCp(cp).mods) {
    const [k, v] = m.split("=");
    if (k === key) return v ?? "";
  }
  return null;
}

/**
 * 항목별 수정자를 적용하며 run을 필요한 만큼 쪼갭니다.
 * modFor가 null을 돌려주면 그 항목은 원래 글자 모양을 유지합니다.
 * dropMarks가 참이면 형광펜 시작/끝 같은 표지 요소를 없앱니다.
 */
export function restyle(
  p: Element,
  modFor: (item: Item, index: number) => string | null,
  opts: { dropMarks?: (item: Item) => boolean } = {},
): boolean {
  const doc = p.ownerDocument!;
  const items = itemsOf(p);
  const byRun = new Map<Element, { item: Item; idx: number }[]>();
  items.forEach((item, idx) => {
    const arr = byRun.get(item.run) ?? [];
    arr.push({ item, idx });
    byRun.set(item.run, arr);
  });
  let changed = false;
  for (const run of runsOf(p)) {
    const list = byRun.get(run) ?? [];
    const mods = list.map(({ item, idx }) => (item.kind === "obj" ? null : modFor(item, idx)));
    const drops = list.map(({ item }) => item.kind === "mark" && !!opts.dropMarks?.(item));
    if (!mods.some((m) => m) && !drops.some(Boolean)) continue;
    changed = true;
    const baseCp = run.getAttribute("charPrIDRef") ?? "0";
    const out: Element[] = [];
    let cur: Element | null = null;
    let curKey: string | null | undefined = undefined;
    let curT: Element | null = null;
    list.forEach(({ item }, i) => {
      if (drops[i]) return;
      const m = mods[i];
      const key = m ? addMod(baseCp, m) : baseCp;
      if (!cur || key !== curKey) {
        cur = run.cloneNode(false) as Element;
        cur.setAttribute("charPrIDRef", key);
        out.push(cur);
        curKey = key;
        curT = null;
      }
      if (item.kind === "obj") {
        cur.appendChild(item.node);
        curT = null;
        return;
      }
      if (!curT) {
        curT = hp(doc, "t");
        cur.appendChild(curT);
      }
      if (item.kind === "ch") {
        const last = curT.lastChild;
        if (last && last.nodeType === TEXT_NODE) last.nodeValue = (last.nodeValue ?? "") + item.ch;
        else curT.appendChild(doc.createTextNode(item.ch));
      } else {
        curT.appendChild(item.node);
      }
    });
    if (!out.length) {
      const empty = run.cloneNode(false) as Element;
      empty.appendChild(hp(doc, "t"));
      out.push(empty);
    }
    for (const r of out) p.insertBefore(r, run);
    p.removeChild(run);
  }
  return changed;
}

/** items[start, end) 범위를 새 글자열로 바꿉니다(첫 항목의 글자 모양을 따름). */
export function replaceItems(items: Item[], start: number, end: number, text: string) {
  if (start >= end && !text) return;
  const range = items.slice(start, end);
  const first = range[0] ?? items[start - 1];
  if (!first) return;
  const doc = first.run.ownerDocument!;
  // 삽입 지점 확보
  let insertNode: Text | null = null;
  let insertOff = 0;
  if (first.kind === "ch" && range.length) {
    insertNode = first.node as Text;
    insertOff = first.off;
  } else if (range.length) {
    insertNode = doc.createTextNode("");
    first.node.parentNode!.insertBefore(insertNode, first.node);
  } else {
    // 빈 범위(삽입): 앞 항목 뒤에 붙입니다.
    if (first.kind === "ch") {
      insertNode = first.node as Text;
      insertOff = first.off + first.ch.length;
    } else {
      insertNode = doc.createTextNode("");
      first.node.parentNode!.insertBefore(insertNode, first.node.nextSibling);
    }
  }
  // 뒤에서부터 지우기(같은 텍스트 노드 안의 오프셋이 흔들리지 않게)
  for (let i = range.length - 1; i >= 0; i--) {
    const it = range[i];
    if (it.kind === "ch") {
      const n = it.node as Text;
      const v = n.nodeValue ?? "";
      n.nodeValue = v.slice(0, it.off) + v.slice(it.off + it.ch.length);
    } else if (it.kind !== "obj") {
      it.node.parentNode?.removeChild(it.node);
    }
  }
  const v = insertNode.nodeValue ?? "";
  insertNode.nodeValue = v.slice(0, insertOff) + text + v.slice(insertOff);
}

/** 문단 맨 앞(첫 개체 이전)의 공백·탭을 지웁니다. */
export function trimLeading(p: Element): boolean {
  const items = itemsOf(p);
  const idxs: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.kind === "mark") continue;
    if (it.kind === "space" || it.kind === "tab" || (it.kind === "ch" && /\s/.test(it.ch))) idxs.push(i);
    else break;
  }
  // 같은 텍스트 노드 안의 오프셋이 흔들리지 않도록 뒤에서부터 지웁니다.
  for (let k = idxs.length - 1; k >= 0; k--) replaceItems(items, idxs[k], idxs[k] + 1, "");
  return idxs.length > 0;
}

export function trimTrailing(p: Element): boolean {
  const items = itemsOf(p);
  let n = items.length;
  while (n > 0 && (items[n - 1].kind === "space" || (items[n - 1].kind === "ch" && /\s/.test(items[n - 1].ch)))) n--;
  if (n === items.length) return false;
  replaceItems(items, n, items.length, "");
  return true;
}

/** 본문 흐름에 보이는 개체(표·그림·수식·도형 등). secPr·ctrl(단 정의, 머리말, 필드 표지)은 제외. */
export const CONTENT_OBJECTS = new Set([
  "tbl", "pic", "equation", "rect", "ellipse", "arc", "polygon", "curve", "line", "connectLine",
  "container", "ole", "textart", "chart", "video", "compose", "dutmal", "switch",
]);

export function contentObjects(p: Element): Element[] {
  return itemsOf(p).filter((i) => i.kind === "obj" && CONTENT_OBJECTS.has((i.node as Element).localName)).map((i) => i.node as Element);
}

export function isBlank(p: Element): boolean {
  return itemsOf(p).every(
    (i) => i.kind === "mark" || (i.kind === "obj" ? !CONTENT_OBJECTS.has((i.node as Element).localName) : /^\s*$/.test(i.ch)),
  );
}
