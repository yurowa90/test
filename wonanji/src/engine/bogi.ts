// 〈보기〉 상자 규격 통일: 양식 예시 상자의 틀(격자·테두리·여백·이름표·항목 문단 모양)에 문항의 항목 글을 옮겨 담습니다.
// 항목 글자·기호(ㄱ. ㄴ. ㄷ.)는 그대로이고, 상자의 틀만 양식 것이 됩니다. PDF·사진에서 만든 1칸 상자, 학력평가형 상자,
// 선생님마다 조금씩 다른 여백의 상자가 모두 같은 모양이 됩니다.
import { descendants, kid, kids } from "./dom";
import { getMargin, HeaderIndex, OutputHeader, setLineSpacing, setMargin } from "./header";
import { isBogiBox, objWidth, setObjWidth } from "./objects";
import { deepText, isBlank, ownText } from "./text";
import type { FormatSpec } from "./types";

const LABEL_RE = /^[<〈(［[《＜]?\s*보\s*기\s*[>〉)］\]》＞]?$/;
const ITEM_RE = /^\s*[ㄱ-ㅎ]\s*[.．)）]/;

export interface BoxProto {
  /** 양식 예시 상자(표). 결과 문서에 복제해 씁니다. */
  tbl: Element;
  /** 항목(ㄱ.) 문단 모양 ID(양식 header 기준 = 결과 header) */
  itemParaPrId: string;
  /** 이름표 글(예: 〈 보 기 〉) */
  label: string;
  /** 이름표가 항목과 같은 칸에 든 상자(1칸 상자) */
  labelInBody: boolean;
  cells: number;
}

interface CellInfo {
  tc: Element;
  sub: Element;
  paras: Element[];
  label: boolean;
  body: boolean;
  blank: boolean;
}

function cellsOf(tbl: Element): CellInfo[] {
  const out: CellInfo[] = [];
  for (const tr of kids(tbl)) {
    if (tr.localName !== "tr") continue;
    for (const tc of kids(tr)) {
      if (tc.localName !== "tc") continue;
      const sub = kid(tc, "subList");
      if (!sub) continue;
      const paras = kids(sub).filter((e) => e.localName === "p");
      const text = deepText(tc).trim();
      const label = LABEL_RE.test(text) || paras.some((p) => LABEL_RE.test(ownText(p).trim()));
      const body = paras.some((p) => ITEM_RE.test(ownText(p)));
      out.push({ tc, sub, paras, label, body, blank: paras.every(isBlank) });
    }
  }
  return out;
}

/** 양식 예시 상자에서 틀을 읽습니다. 이름표 칸 하나·항목 칸 하나(같은 칸이어도 됨)·나머지는 빈 칸이어야 합니다. */
export function analyzeBoxProto(tbl: Element, index: HeaderIndex): BoxProto | null {
  if (!isBogiBox(tbl)) return null;
  const cells = cellsOf(tbl);
  const labels = cells.filter((c) => c.label);
  const bodies = cells.filter((c) => c.body);
  if (labels.length !== 1 || bodies.length !== 1) return null;
  if (cells.some((c) => !c.label && !c.body && !c.blank)) return null;
  const item = bodies[0].paras.find((p) => ITEM_RE.test(ownText(p)));
  const ppId = item?.getAttribute("paraPrIDRef");
  if (!ppId || !index.paraPr(ppId)) return null;
  const labelP = labels[0].paras.find((p) => LABEL_RE.test(ownText(p).trim()));
  return { tbl, itemParaPrId: ppId, label: (labelP ? ownText(labelP) : deepText(labels[0].tc)).trim(), labelInBody: labels[0] === bodies[0], cells: cells.length };
}

/** 항목 문단 모양: 결과 본문 문단 모양에 양식 항목의 정렬·여백(내어쓰기)·탭을 얹고, 줄간격은 규격대로 */
function itemParaPr(header: OutputHeader, proto: BoxProto, spec: FormatSpec): string {
  const tpl = header.paraPr(proto.itemParaPrId);
  const base = header.paraPr(spec.bodyParaPrId) ?? tpl;
  if (!tpl || !base) return proto.itemParaPrId;
  const c = base.cloneNode(true) as Element;
  const al = kid(tpl, "align")?.getAttribute("horizontal");
  if (al) kid(c, "align")?.setAttribute("horizontal", al);
  for (const m of ["intent", "left", "right"] as const) setMargin(c, m, getMargin(tpl, m));
  setMargin(c, "prev", 0);
  setMargin(c, "next", 0);
  c.setAttribute("tabPrIDRef", tpl.getAttribute("tabPrIDRef") ?? "0");
  setLineSpacing(c, "PERCENT", spec.lineSpacing);
  const bs = kid(c, "breakSetting");
  if (bs) bs.setAttribute("keepWithNext", "0");
  return header.add("paraProperties", c);
}

/** 문항 상자에서 옮길 글: 이름표 문단을 뺀 모든 칸의 문단(칸 순서대로), 앞뒤 빈 문단은 뺌 */
function bodyParas(old: Element): Element[] {
  const out: Element[] = [];
  for (const c of cellsOf(old)) {
    for (const p of c.paras) {
      if (LABEL_RE.test(ownText(p).trim()) && !ITEM_RE.test(ownText(p))) continue;
      out.push(p);
    }
  }
  while (out.length && isBlank(out[0])) out.shift();
  while (out.length && isBlank(out[out.length - 1])) out.pop();
  return out;
}

function isInside(el: Element, anc: Element): boolean {
  for (let n = el.parentNode; n; n = n.parentNode) if (n === anc) return true;
  return false;
}

function rowHeights(tbl: Element): number {
  let total = 0;
  for (const tr of kids(tbl)) {
    if (tr.localName !== "tr") continue;
    let h = 0;
    for (const tc of kids(tr)) {
      if (tc.localName !== "tc") continue;
      if ((kid(tc, "cellSpan")?.getAttribute("rowSpan") ?? "1") !== "1") continue;
      h = Math.max(h, Number(kid(tc, "cellSz")?.getAttribute("height") ?? 0));
    }
    total += h;
  }
  return total;
}

/**
 * 상자 하나를 양식 틀로 다시 짭니다. 돌려주는 값은 새 표(이미 옛 표 자리에 들어감). 옮길 글이 없으면 null.
 * 폭은 옛 상자(이미 단 폭에 맞춘 것)와 같게, 항목 칸 높이는 최소 높이(한글·미리보기가 글에 맞춰 늘림).
 */
export function rebuildBox(old: Element, proto: BoxProto, header: OutputHeader, spec: FormatSpec): Element | null {
  const doc = old.ownerDocument;
  if (!doc || !old.parentNode) return null;
  const moving = bodyParas(old);
  if (!moving.length) return null;
  const nt = doc.importNode(proto.tbl, true) as Element;
  for (const seg of descendants(nt, "linesegarray")) seg.parentNode?.removeChild(seg);
  const cells = cellsOf(nt);
  const body = cells.find((c) => c.body);
  const label = cells.find((c) => c.label);
  if (!body || !label) return null;
  const labelP = proto.labelInBody ? label.paras.find((p) => LABEL_RE.test(ownText(p).trim()))?.cloneNode(true) : null;
  for (const p of body.paras) body.sub.removeChild(p);
  if (labelP) body.sub.appendChild(labelP);
  const ppId = itemParaPr(header, proto, spec);
  for (const p of moving) {
    if (ITEM_RE.test(ownText(p))) p.setAttribute("paraPrIDRef", ppId);
    body.sub.appendChild(p);
  }
  // 항목 칸 높이는 한 줄 + 여백만 두고, 표 높이는 행 높이 합으로 (한글이 글에 맞춰 늘림)
  const cm = kid(body.tc, "cellMargin");
  const minH = Math.round((spec.sizePt * 100 * spec.lineSpacing) / 100) + Number(cm?.getAttribute("top") ?? 0) + Number(cm?.getAttribute("bottom") ?? 0);
  const cs = kid(body.tc, "cellSz");
  if (cs && (kid(body.tc, "cellSpan")?.getAttribute("rowSpan") ?? "1") === "1") cs.setAttribute("height", String(minH));
  kid(nt, "sz")?.setAttribute("height", String(Math.max(minH, rowHeights(nt))));
  const target = objWidth(old);
  old.parentNode.replaceChild(nt, old);
  if (target && Math.abs(objWidth(nt) - target) >= 50) setObjWidth(nt, target);
  return nt;
}

/** 문항의 모든 〈보기〉 상자를 양식 틀로. 바꾼 상자 수와, 원래 이름표가 양식과 달랐던 수를 돌려줍니다. */
export function rebuildBoxes(paras: Element[], proto: BoxProto, header: OutputHeader, spec: FormatSpec): { count: number; relabeled: string[] } {
  let count = 0;
  const relabeled: string[] = [];
  for (const p of paras) {
    const boxes = descendants(p, "tbl").filter((t) => isBogiBox(t) && t.parentNode);
    for (const old of boxes) {
      // 다른 상자 안에 든 상자는 바깥 상자와 함께 옮겨지므로 건너뜁니다.
      if (boxes.some((o) => o !== old && isInside(old, o))) continue;
      const labelBefore = cellsOf(old)
        .flatMap((c) => c.paras)
        .map((x) => ownText(x).trim())
        .find((t) => LABEL_RE.test(t));
      if (rebuildBox(old, proto, header, spec)) {
        count++;
        if (labelBefore && labelBefore.replace(/\s+/g, "") !== proto.label.replace(/\s+/g, "")) relabeled.push(labelBefore);
      }
    }
  }
  return { count, relabeled };
}
