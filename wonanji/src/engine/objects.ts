// 문항 안 개체(〈보기〉 상자·자료 표·그림)의 종류와 크기를 다룹니다.
// 양식에서는 이 개체들의 폭·정렬을 읽고(배치 규격), 출제 문항을 옮길 때는 결과 단 폭에 맞게 크기를 고칩니다.
import { normText } from "./classify";
import { kid, kids, walk } from "./dom";
import { deepText } from "./text";

/** 폭을 줄이면 모양이 깨질 수 있는 그리기 개체(선·도형 묶음). 그림(pic)과 수식은 제외. */
const SHAPE_TAGS = new Set(["rect", "ellipse", "arc", "polygon", "curve", "line", "connectLine", "container", "textart", "ole", "chart"]);

export type ObjKind = "box" | "table" | "figure" | "equation" | "other";

/** 〈보기〉 상자: 표의 첫 글이 "〈보 기〉"류이고 ㄱ. 항목이 있는 것 */
export function isBogiBox(tbl: Element): boolean {
  const n = normText(deepText(tbl));
  return /^[<〈(［[]?보기[>〉)］\]]?/.test(n) && /ㄱ[.．]/.test(n);
}

function hasFigure(el: Element): boolean {
  let fig = false;
  walk(el, (e) => {
    if (e !== el && (e.localName === "pic" || SHAPE_TAGS.has(e.localName))) fig = true;
  });
  return fig;
}

export function objKind(o: Element): ObjKind {
  const n = o.localName;
  if (n === "equation") return "equation";
  if (n === "pic" || SHAPE_TAGS.has(n)) return "figure";
  if (n === "tbl") {
    if (isBogiBox(o)) return "box";
    // 그림을 칸에 배치한 표(그림 + 캡션)는 그림으로 봅니다.
    return hasFigure(o) ? "figure" : "table";
  }
  return "other";
}

export function objWidth(o: Element): number {
  return Number(kid(o, "sz")?.getAttribute("width") ?? 0);
}

export function isInline(o: Element): boolean {
  return kid(o, "pos")?.getAttribute("treatAsChar") === "1";
}

/** 문단의 run 바로 아래 개체(표·그림·도형·수식) */
export function topObjects(p: Element): Element[] {
  const out: Element[] = [];
  for (const r of kids(p)) if (r.localName === "run") for (const c of kids(r)) if (c.localName === "tbl" || c.localName === "pic" || c.localName === "equation" || SHAPE_TAGS.has(c.localName)) out.push(c);
  return out;
}

const mul = (el: Element | null, name: string, k: number) => {
  if (!el || !el.hasAttribute(name)) return;
  el.setAttribute(name, String(Math.max(1, Math.round(Number(el.getAttribute(name)) * k))));
};

/** 그림을 가로세로 같은 비율로 줄이거나 늘립니다. */
export function scalePic(pic: Element, k: number) {
  for (const n of ["sz", "curSz"]) {
    const e = kid(pic, n);
    mul(e, "width", k);
    mul(e, "height", k);
  }
  const sca = kid(kid(pic, "renderingInfo") ?? pic, "scaMatrix");
  if (sca) {
    for (const a of ["e1", "e5"]) if (sca.hasAttribute(a)) sca.setAttribute(a, String(Number(sca.getAttribute(a)) * k));
  }
  const rot = kid(pic, "rotationInfo");
  const cur = kid(pic, "curSz");
  if (rot && cur) {
    rot.setAttribute("centerX", String(Math.round(Number(cur.getAttribute("width")) / 2)));
    rot.setAttribute("centerY", String(Math.round(Number(cur.getAttribute("height")) / 2)));
  }
}

/**
 * 표의 폭을 k배로 바꿉니다(칸 폭 모두 같은 비율). 칸 안 그림·안쪽 표도 같은 비율로 맞춥니다.
 * 그림이 든 표는 높이도 같은 비율로 바꿉니다(글만 든 칸은 한글이 글에 맞춰 높이를 다시 잡습니다).
 * 선·도형 묶음이 들어 있으면 모양이 깨질 수 있어 바꾸지 않고 false를 돌려줍니다.
 */
export function scaleTable(tbl: Element, k: number): boolean {
  let shapes = false;
  walk(tbl, (e) => {
    if (e !== tbl && SHAPE_TAGS.has(e.localName)) shapes = true;
  });
  if (shapes) return false;
  const fig = hasFigure(tbl);
  const tables: Element[] = [];
  const pics: Element[] = [];
  walk(tbl, (e) => {
    if (e.localName === "tbl") tables.push(e);
    else if (e.localName === "pic") pics.push(e);
  });
  for (const t of tables) {
    const sz = kid(t, "sz");
    mul(sz, "width", k);
    if (fig) mul(sz, "height", k);
    for (const tr of kids(t)) {
      if (tr.localName !== "tr") continue;
      for (const tc of kids(tr)) {
        if (tc.localName !== "tc") continue;
        const cs = kid(tc, "cellSz");
        mul(cs, "width", k);
        if (fig) mul(cs, "height", k);
      }
    }
  }
  for (const p of pics) scalePic(p, k);
  return true;
}

/** 개체를 목표 폭으로(표는 칸 비율 유지, 그림은 가로세로 비율 유지). 못 바꾸면 false. */
export function setObjWidth(o: Element, target: number): boolean {
  const w = objWidth(o);
  if (!w || Math.abs(w - target) < 50) return true;
  const k = target / w;
  if (o.localName === "tbl") return scaleTable(o, k);
  if (o.localName === "pic") {
    scalePic(o, k);
    return true;
  }
  return false;
}

/** 떠 있는 개체의 가로 오른쪽 끝(문단·단 기준일 때) */
export function floatRight(o: Element): number {
  const pos = kid(o, "pos");
  const off = Number(pos?.getAttribute("horzOffset") ?? 0);
  const align = pos?.getAttribute("horzAlign") ?? "LEFT";
  return align === "LEFT" ? off + objWidth(o) : objWidth(o);
}

export function shrinkFloatOffset(o: Element, avail: number) {
  const pos = kid(o, "pos");
  if (!pos || (pos.getAttribute("horzAlign") ?? "LEFT") !== "LEFT") return;
  const off = Number(pos.getAttribute("horzOffset") ?? 0);
  const w = objWidth(o);
  if (off + w > avail) pos.setAttribute("horzOffset", String(Math.max(0, avail - w)));
}
