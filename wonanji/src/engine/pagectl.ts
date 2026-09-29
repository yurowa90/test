// 구역 정의·단 정의·머리말·꼬리말·쪽 번호, 쪽(종이) 기준으로 고정된 개체처럼 "쪽 모양"에 속하는 요소를
// 문항 내용과 떼어 냅니다. 학력평가·수능형 문서는 첫 문단 하나에 구역 정의·머리말·제목 상자와
// 1번 문항 발문이 함께 들어 있고, 쪽마다 꼬리말(쪽 번호 상자)을 문항 사이 빈 문단에 새로 둡니다.
import { isEl, kid, kids, TEXT_NODE } from "./dom";
import { CONTENT_OBJECTS } from "./text";

/** ctrl 안에 이것이 있으면 쪽 모양 요소입니다(각주·필드·책갈피 등은 문항 내용). */
const PAGE_CTRL = new Set(["colPr", "header", "footer", "pageNum", "pageHiding", "pageNumCtrl", "newNum"]);

/** 쪽이나 종이를 기준으로 세로 위치가 고정된 떠 있는 개체(제목 상자, 옆 과목 표시 등). */
export function isPageAnchored(obj: Element): boolean {
  if (!CONTENT_OBJECTS.has(obj.localName)) return false;
  const pos = kid(obj, "pos");
  if (!pos || pos.getAttribute("treatAsChar") === "1") return false;
  const v = pos.getAttribute("vertRelTo");
  return v === "PAPER" || v === "PAGE";
}

function isPageCtrl(el: Element): boolean {
  if (el.localName === "secPr") return true;
  if (el.localName === "ctrl") return kids(el).some((c) => PAGE_CTRL.has(c.localName));
  return isPageAnchored(el);
}

/** 문단에 쪽 모양 요소가 있는지. */
export function hasPageCtrl(p: Element): boolean {
  return kids(p).some((r) => r.localName === "run" && kids(r).some(isPageCtrl));
}

/** 머리말·꼬리말 정의의 종류(같은 종류가 다시 나오면 앞의 것을 대체합니다). */
export function pageCtrlKinds(p: Element): string[] {
  const out: string[] = [];
  for (const r of kids(p)) {
    if (r.localName !== "run") continue;
    for (const c of kids(r)) {
      if (c.localName !== "ctrl") continue;
      for (const x of kids(c)) if (x.localName === "header" || x.localName === "footer") out.push(`${x.localName}:${x.getAttribute("applyPageType") ?? "BOTH"}`);
    }
  }
  return out;
}

/** HWP 글자 위치 단위(WCHAR)로 본 항목 폭: 글자는 UTF-16 길이, 줄바꿈·공백류는 1, 탭·개체·조판 부호는 8. */
function widthOf(n: Node): number {
  if (n.nodeType === TEXT_NODE) return (n.nodeValue ?? "").length;
  if (!isEl(n)) return 0;
  if (n.localName === "lineBreak" || n.localName === "fwSpace" || n.localName === "nbSpace" || n.localName === "hyphen") return 1;
  return 8;
}

/** 지운 요소 폭만큼 줄 배치 캐시의 글자 위치를 당깁니다(rhwp 미리보기가 쓰는 캐시). */
function shiftLinesegs(p: Element, removedAt: { pos: number; w: number }[]) {
  const arr = kid(p, "linesegarray");
  if (!arr || !removedAt.length) return;
  for (const seg of kids(arr)) {
    const t = Number(seg.getAttribute("textpos") ?? 0);
    let d = 0;
    for (const r of removedAt) if (r.pos < t) d += r.w;
    if (d) seg.setAttribute("textpos", String(Math.max(0, t - d)));
  }
}

/** 문단 안 각 텍스트 노드·개체의 HWP 글자 위치(줄 배치 캐시 textpos와 같은 단위) */
export function charPositions(p: Element): Map<Node, number> {
  return positions(p);
}

function positions(p: Element): Map<Node, number> {
  const at = new Map<Node, number>();
  let pos = 0;
  for (const r of kids(p)) {
    if (r.localName !== "run") continue;
    for (let c = r.firstChild; c; c = c.nextSibling) {
      if (isEl(c) && c.localName === "t") {
        for (let n = c.firstChild; n; n = n.nextSibling) {
          at.set(n, pos);
          pos += widthOf(n);
        }
      } else if (isEl(c)) {
        at.set(c, pos);
        pos += 8;
      }
    }
  }
  return at;
}

/**
 * 문단을 쪽 모양 부분과 내용 부분으로 나눕니다(둘 다 새 복제본, 원본은 그대로).
 * - controls: 구역·단 정의, 머리말·꼬리말, 쪽 기준 개체만 남긴 빈 문단(없으면 null)
 * - content: 그것들을 뺀 문단(글자·표·그림 등)
 */
export function splitPageControls(p: Element): { controls: Element | null; content: Element } {
  const content = p.cloneNode(true) as Element;
  const at = positions(content);
  const removed: { pos: number; w: number }[] = [];
  let any = false;
  for (const r of kids(content)) {
    if (r.localName !== "run") continue;
    for (const c of kids(r)) {
      if (isPageCtrl(c)) {
        removed.push({ pos: at.get(c) ?? 0, w: 8 });
        r.removeChild(c);
        any = true;
      }
    }
  }
  shiftLinesegs(content, removed);
  if (!any) return { controls: null, content };

  const controls = p.cloneNode(true) as Element;
  for (const r of kids(controls)) {
    if (r.localName !== "run") continue;
    for (const c of kids(r)) if (!isPageCtrl(c)) r.removeChild(c);
    if (!kids(r).length) controls.removeChild(r);
  }
  // 줄 배치 캐시는 첫 줄만 남깁니다(글자가 없는 문단).
  const arr = kid(controls, "linesegarray");
  if (arr) {
    const segs = kids(arr);
    segs.slice(1).forEach((s) => arr.removeChild(s));
    segs[0]?.setAttribute("textpos", "0");
  }
  return { controls, content };
}
