// 문항 균등 배치: 단(칼럼)마다 들어갈 문항을 정하고, 남는 세로 공간을 문항 사이에 고르게 나눕니다.
// 학교 출제 문항지의 조판 관례처럼, 단의 처음 문항은 위에서 시작하고 마지막 문항은 아래에서 끝납니다.
// 문항 높이는 rhwp의 줄 수와 개체 크기로 어림합니다. 한글의 글꼴 폭과 차이가 있을 수 있어 단마다 여유(1.5줄)를 두고,
// 단이 바뀌는 문항에는 '단 나누기'를 넣어 한글에서도 같은 자리에서 단이 바뀌게 합니다. 글자·기호는 바꾸지 않습니다.
import { serializeVariants, type AssembleResult } from "./assemble";
import { descendants, hp, kid, kids } from "./dom";
import { getLineSpacing, getMargin, HeaderIndex, setLineSpacing } from "./header";
import type { LayoutInfo, ParaPos } from "./rhwp";
import type { Change, FormatSpec } from "./types";

/** 한글과의 배치 차이에 대비해 단 아래에 남기는 여유(본문 줄 수). 크면 다음 문항 머리가 앞 단 끝에 끌려 올라올 수 있고, 작으면 넘칠 수 있습니다. */
const RESERVE_LINES = 1.5;
const OBJECT_TAGS = new Set(["tbl", "pic", "equation", "rect", "ellipse", "arc", "polygon", "curve", "line", "connectLine", "container", "ole", "textart", "chart", "video"]);

const num = (el: Element | null | undefined, name: string, fallback = 0) => {
  const v = el?.getAttribute(name);
  const n = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** 문단 run 바로 아래의 개체(머리말·꼬리말 ctrl 안은 제외). 쪽에 고정된 개체는 흐름에 높이를 더하지 않으므로 뺍니다. */
function flowObjects(p: Element): Element[] {
  return kids(p)
    .filter((r) => r.localName === "run")
    .flatMap((r) => kids(r).filter((c) => OBJECT_TAGS.has(c.localName)))
    .filter((o) => {
      const pos = kid(o, "pos");
      return !(pos && pos.getAttribute("treatAsChar") === "0" && /PAPER|PAGE/.test(pos.getAttribute("vertRelTo") ?? ""));
    });
}

interface Block {
  q: string;
  paras: number[];
  gap: Element[];
  height: number;
}

export interface BalanceResult {
  changes: Change[];
}

export interface BalanceMeasure {
  info: (hwpx: Uint8Array) => Promise<LayoutInfo>;
  positions: (hwpx: Uint8Array) => Promise<ParaPos[]>;
}

export async function balanceColumns(res: AssembleResult, spec: FormatSpec, measure: BalanceMeasure): Promise<BalanceResult> {
  const changes: Change[] = [];
  if (spec.layout !== "balanced") return { changes };
  const tops = kids(res.root).filter((e) => e.localName === "p");
  const info = await measure.info(res.forPreview);
  if (info.lines.length !== tops.length) return { changes };
  const h = new HeaderIndex(res.pkg);
  const secPr = descendants(res.root, "secPr")[0];
  const pagePr = secPr ? kid(secPr, "pagePr") : null;
  const margin = pagePr ? kid(pagePr, "margin") : null;
  if (!pagePr || !margin) return { changes };
  const colCount = Math.max(1, num(descendants(res.root, "colPr")[0], "colCount", 1));
  const pageH = num(pagePr, "height");
  const contentW = num(pagePr, "width") - num(margin, "left") - num(margin, "right") - num(margin, "gutter");
  const colH = pageH - num(margin, "top") - num(margin, "bottom") - num(margin, "header") - num(margin, "footer");
  if (colH <= 0) return { changes };
  const bodyAdv = Math.round((spec.sizePt * 100 * spec.lineSpacing) / 100);
  const ctrlBy = new Map<number, LayoutInfo["controls"]>();
  for (const c of info.controls) ctrlBy.set(c.paraIdx, [...(ctrlBy.get(c.paraIdx) ?? []), c]);

  const advanceOf = (p: Element): number => {
    const pp = h.paraPr(p.getAttribute("paraPrIDRef") ?? "0");
    const run = kids(p).find((r) => r.localName === "run");
    const cp = h.charPr(run?.getAttribute("charPrIDRef") ?? "0");
    const font = num(cp, "height", spec.sizePt * 100);
    const ls = pp ? getLineSpacing(pp) : { type: "PERCENT", value: spec.lineSpacing };
    if (ls.type === "FIXED") return ls.value;
    if (ls.type === "BETWEEN_LINES") return font + ls.value;
    if (ls.type === "AT_LEAST") return Math.max(font, ls.value);
    return Math.round((font * ls.value) / 100);
  };
  /** 문단 높이(HWPUNIT): 글줄 수 × 줄 높이 + 문단 위·아래 간격 + 개체 높이 */
  const heightOf = (i: number): number => {
    const p = tops[i];
    const pp = h.paraPr(p.getAttribute("paraPrIDRef") ?? "0");
    const adv = advanceOf(p);
    const lines = Math.max(1, info.lines[i]?.length ?? 1);
    const text = lines * adv + (pp ? getMargin(pp, "prev") + getMargin(pp, "next") : 0);
    const objs = flowObjects(p);
    if (!objs.length) return text;
    // 표는 칸이 내용에 맞게 자라므로 XML 크기 대신 rhwp가 잰 높이를 씁니다(문단 안 표 순서대로 대응).
    const tables = (ctrlBy.get(i) ?? []).filter((c) => c.type === "table").sort((a, b) => a.controlIdx - b.controlIdx);
    let tblSeen = 0;
    let objH = 0;
    let beside = false;
    let inlineBig = 0;
    for (const o of objs) {
      const pos = kid(o, "pos");
      const sz = kid(o, "sz");
      const om = kid(o, "outMargin");
      const measured = o.localName === "tbl" ? tables[tblSeen++]?.heightHU : undefined;
      const hh = (measured || num(sz, "height")) + num(om, "top") + num(om, "bottom");
      const floating = pos?.getAttribute("treatAsChar") === "0";
      if (floating && o.getAttribute("textWrap") === "SQUARE") {
        beside = true;
        objH = Math.max(objH, hh);
      } else if (!floating && hh < adv * 2) {
        // 글줄 안에 드는 작은 개체(수식·기호 그림)는 줄 높이에 이미 들어 있음
      } else {
        objH += hh;
        if (!floating) inlineBig++;
      }
    }
    if (beside) return Math.max(text, objH);
    // 글자처럼 취급되는 큰 개체는 제 줄을 차지하므로, 줄 수에 든 그 줄의 글줄 높이는 뺍니다.
    return text + objH - Math.min(inlineBig, lines) * adv;
  };

  // 블록 나누기: 머리(첫 문항 앞) / 문항 블록(문항 앞의 안내 문단 포함) / 꼬리(마지막 문항 뒤)
  const gapSet = new Set<Element>();
  for (const els of res.gapsBefore.values()) for (const e of els) gapSet.add(e);
  const head: number[] = [];
  const blocks: Block[] = [];
  let cur: Block | null = null;
  let extra: number[] = [];
  tops.forEach((p, i) => {
    if (gapSet.has(p)) return;
    const q = res.owners.get(p) ?? null;
    if (!q) {
      if (!blocks.length) head.push(i);
      else extra.push(i);
      return;
    }
    if (!cur || cur.q !== q) {
      cur = { q, paras: [...extra, i], gap: res.gapsBefore.get(q) ?? [], height: 0 };
      extra = [];
      blocks.push(cur);
    } else cur.paras.push(i);
  });
  if (blocks.length < 2) return { changes };
  for (const b of blocks) b.height = b.paras.reduce((a, i) => a + heightOf(i), 0);
  // 머리 높이: 두 단에 걸친 개체(결재·출제 정보 표)는 양쪽 단, 나머지(유의사항 등)는 첫 단만 차지
  let headSpan = 0;
  let headCol1 = 0;
  for (const i of head) {
    const spans = colCount === 1 || flowObjects(tops[i]).some((o) => num(kid(o, "sz"), "width") >= contentW * 0.85);
    if (spans) headSpan += heightOf(i);
    else headCol1 += heightOf(i);
  }
  const minGap = spec.gapLines * bodyAdv;
  const reserve = RESERVE_LINES * bodyAdv;
  let cap0 = colH - reserve - headSpan - headCol1;
  const capOf = (k: number) => (k === 0 ? cap0 : colH - reserve - (k < colCount ? headSpan : 0));

  type Col = { blocks: Block[]; cap: number };
  /** 문항 순서대로 단을 채웁니다(어림 높이 기준). */
  const fill = (): Col[] => {
    const cols: Col[] = [{ blocks: [], cap: capOf(0) }];
    let used = 0;
    for (const b of blocks) {
      let col = cols[cols.length - 1];
      const need = (col.blocks.length ? minGap : 0) + b.height;
      if (col.blocks.length && used + need > col.cap) {
        col = { blocks: [], cap: capOf(cols.length) };
        cols.push(col);
        used = 0;
      }
      used += (col.blocks.length ? minGap : 0) + b.height;
      col.blocks.push(b);
    }
    return cols;
  };
  const gapOf = new Map<Block, number>();
  const breakAt = new Set<Block>();
  const evenCols = new Set<Col>();
  /** 남는 공간을 (문항 수 − 1)로 나눠 간격을 정합니다. 마지막 단은 자연스럽게 둡니다. */
  const plan = (cols: Col[]) => {
    gapOf.clear();
    breakAt.clear();
    evenCols.clear();
    cols.forEach((c, k) => {
      if (k > 0) breakAt.add(c.blocks[0]);
      const n = c.blocks.length;
      const free = c.cap - c.blocks.reduce((a, b) => a + b.height, 0);
      const even = k < cols.length - 1 && n >= 2 && free > minGap * (n - 1);
      const g = even ? Math.round(free / (n - 1)) : minGap;
      c.blocks.forEach((b, j) => {
        if (j > 0) gapOf.set(b, g);
      });
      if (even) evenCols.add(c);
    });
  };

  // 반영: 원래 빈 줄을 빼고, 단이 바뀌는 문항은 단 나누기, 그 밖에는 정해진 높이의 빈 문단 하나
  const firstOf = (bl: Block) => tops[bl.paras[0]];
  const doc = res.root.ownerDocument!;
  const bodyPp = h.paraPr(spec.bodyParaPrId);
  const gapPr = new Map<number, string>();
  const gapParaPr = (hu: number) => {
    let id = gapPr.get(hu);
    if (id) return id;
    const c = (bodyPp ?? tops[0]).cloneNode(true) as Element;
    setLineSpacing(c, "FIXED", hu);
    id = res.header.add("paraProperties", c);
    gapPr.set(hu, id);
    return id;
  };
  for (const b of blocks) for (const e of b.gap) e.parentNode?.removeChild(e);
  const blankPara = (hu: number) => {
    const blankEl = hp(doc, "p");
    blankEl.setAttribute("id", "0");
    blankEl.setAttribute("paraPrIDRef", gapParaPr(hu));
    blankEl.setAttribute("styleIDRef", "0");
    blankEl.setAttribute("pageBreak", "0");
    blankEl.setAttribute("columnBreak", "0");
    blankEl.setAttribute("merged", "0");
    const r = hp(doc, "run");
    r.setAttribute("charPrIDRef", spec.bodyCharPrId);
    r.appendChild(hp(doc, "t"));
    blankEl.appendChild(r);
    return blankEl;
  };
  const apply = () => {
    // 문항 사이는 정해진 높이의 빈 문단 하나, 단이 바뀌는 문항은 단 나누기(한글·미리보기 모두 그 자리에서 단을 바꿈)
    for (const b of blocks) {
      const first = firstOf(b);
      first.setAttribute("columnBreak", breakAt.has(b) ? "1" : "0");
      const g = gapOf.get(b);
      if (breakAt.has(b) || !g || g <= 0) continue;
      first.parentNode?.insertBefore(blankPara(g), first);
    }
    res.header.finalize();
    Object.assign(res, serializeVariants(res.pkg, res.root));
  };

  // 첫 단 용량은 실제 첫 문항의 시작 위치로 보정합니다(머리 표·유의사항 높이는 어림이 어긋나기 쉬움).
  // 그 밖의 세로 위치는 미리보기 엔진이 떠 있는 개체를 다르게 놓을 수 있어 쓰지 않고, 줄 수·개체 크기로 어림한 높이를 씁니다.
  const limit = pageH - num(margin, "bottom") - num(margin, "footer") - reserve;
  try {
    const pos = await measure.positions(res.forPreview);
    const f0 = pos.length === tops.length ? pos[blocks[0].paras[0]] : undefined;
    if (f0 && f0.page === 0 && f0.topHU > 0 && limit - f0.topHU > bodyAdv * 6) cap0 = limit - f0.topHU;
  } catch {
    /* 위치를 못 재면 어림값 그대로 */
  }
  const cols = fill();
  plan(cols);
  apply();
  const gapLinesUsed = [...evenCols].map((c) => (gapOf.get(c.blocks[1]) ?? minGap) / bodyAdv);
  const counts = cols.map((c) => c.blocks.length).join("·");
  const range = gapLinesUsed.length ? `${Math.min(...gapLinesUsed).toFixed(1)}~${Math.max(...gapLinesUsed).toFixed(1)}줄` : `${spec.gapLines}줄`;
  changes.push({ questionId: null, kind: "문항 배치", detail: `${cols.length}개 단에 균등 배치(단마다 ${counts}문항, 문항 사이 간격 ${range})` });
  return { changes };
}
