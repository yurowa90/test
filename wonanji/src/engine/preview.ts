// 미리보기 다듬기와 학생 배부용 사본.
// 1) 미리보기 엔진(rhwp)은 두 단에 걸친 머리 표가 있는 첫 쪽에서 오른쪽 단을 쪽 맨 위부터 그려 머리 표와 겹칩니다.
//    한글은 머리 표 아래에서 오른쪽 단을 시작하므로, 미리보기용 사본에만 그만큼의 빈 칸(고정 높이 빈 문단)을 넣어
//    한글과 같은 자리에서 시작하게 합니다. 내려받는 HWP·HWPX는 건드리지 않습니다.
// 2) 문항마다 미리보기 몇 쪽에 있는지(검수 목록에서 그 쪽으로 바로 가기).
// 3) 학생 배부용: 선택형 문항의 글자 음영(정답 형광펜)만 지운 사본. 글자·배치는 같습니다.
import { serializeVariants, type AssembleResult } from "./assemble";
import { circledIndex } from "./classify";
import { descendants, hp, kid, kids } from "./dom";
import { setLineSpacing } from "./header";
import type { ParaPos } from "./rhwp";
import type { FormatSpec } from "./types";

const OBJECT_TAGS = new Set(["tbl", "pic", "equation", "rect", "ellipse", "arc", "polygon", "curve", "line", "connectLine", "container", "ole", "textart", "chart", "video"]);
const num = (el: Element | null | undefined, name: string, fallback = 0) => {
  const n = Number(el?.getAttribute(name));
  return Number.isFinite(n) && el?.getAttribute(name) != null ? n : fallback;
};

export interface PreviewLayout {
  bytes: Uint8Array;
  /** 문항 ID → 미리보기 쪽(0부터) */
  pageOf: Map<string, number>;
  /** 첫 쪽 오른쪽 단을 머리 표 아래로 내렸는지 */
  adjusted: boolean;
  /** 맞추지 못했는데 미리보기에서 첫 쪽 오른쪽 단이 머리 표와 겹쳐 보일 수 있는지(1단·머리 표 없음·이미 아래에서 시작이면 거짓) */
  overlapRisk: boolean;
}

function pageMap(res: AssembleResult, tops: Element[], pos: ParaPos[]): Map<string, number> {
  const out = new Map<string, number>();
  tops.forEach((p, i) => {
    const q = res.owners.get(p);
    if (!q || out.has(q) || !pos[i] || pos[i].page < 0) return;
    out.set(q, pos[i].page);
  });
  return out;
}

export async function previewLayout(res: AssembleResult, spec: FormatSpec, positions: (bytes: Uint8Array) => Promise<ParaPos[]>): Promise<PreviewLayout> {
  const root = res.root;
  let tops = kids(root).filter((e) => e.localName === "p");
  let pos: ParaPos[] = [];
  try {
    pos = await positions(res.forPreview);
  } catch {
    return { bytes: res.forPreview, pageOf: new Map(), adjusted: false, overlapRisk: true };
  }
  const plain = (overlapRisk = false): PreviewLayout => ({ bytes: res.forPreview, pageOf: pos.length === tops.length ? pageMap(res, tops, pos) : new Map(), adjusted: false, overlapRisk });
  if (pos.length !== tops.length) return plain(true);
  const secPr = descendants(root, "secPr")[0];
  const pagePr = secPr ? kid(secPr, "pagePr") : null;
  const margin = pagePr ? kid(pagePr, "margin") : null;
  const colCount = Math.max(1, num(descendants(root, "colPr")[0], "colCount", 1));
  if (!pagePr || !margin || colCount < 2) return plain();
  const pageW = num(pagePr, "width");
  const contentW = pageW - num(margin, "left") - num(margin, "right") - num(margin, "gutter");
  const firstOwned = tops.findIndex((p) => res.owners.has(p));
  if (firstOwned <= 0) return plain();
  // 두 단에 걸친 머리 개체(결재·출제 정보 표 등)의 아래 끝. 첫 쪽에 그려진 넓은 개체 자신의 아래 끝만 봅니다
  // (같은 문단에 매인 꼬리말·쪽 번호 표나 다른 쪽 개체의 아래 끝을 섞으면 오른쪽 단이 통째로 밀립니다).
  let spanBottom = 0;
  for (let i = 0; i < firstOwned; i++) {
    if (pos[i].page !== 0) continue;
    if (pos[i].page0Objects) {
      for (const o of pos[i].page0Objects!) if (o.wHU >= contentW * 0.85) spanBottom = Math.max(spanBottom, o.bottomHU);
      continue;
    }
    const wide = kids(tops[i])
      .filter((r) => r.localName === "run")
      .flatMap((r) => kids(r).filter((c) => OBJECT_TAGS.has(c.localName)))
      .some((o) => num(kid(o, "sz"), "width") >= contentW * 0.85);
    if (wide && pos[i].lastPage === 0) spanBottom = Math.max(spanBottom, pos[i].bottomHU);
  }
  if (!spanBottom) return plain();
  // 첫 쪽 오른쪽 단에서 처음 시작하는 문단(앞 문단이 왼쪽 단에서 넘어온 것이면 끼울 자리가 없어 그대로 둡니다)
  const i1 = tops.findIndex((_, i) => i >= firstOwned && pos[i].page === 0 && pos[i].xHU > pageW / 2);
  if (i1 < 0) return plain();
  const prev = pos[i1 - 1];
  const lift = spanBottom - pos[i1].topHU;
  if (lift < 300) return plain();
  if (prev && prev.page === 0 && (prev.lastPage !== 0 || prev.lastXHU > pageW / 2)) return plain(true);
  // 미리보기 사본에만: 단 나누기를 가진 고정 높이 빈 문단을 그 문단 앞에 넣습니다.
  const doc = root.ownerDocument!;
  const proto = res.header.paraPr(spec.bodyParaPrId);
  if (!proto) return plain(true);
  const pp = proto.cloneNode(true) as Element;
  setLineSpacing(pp, "FIXED", Math.round(lift + 300));
  const ppId = res.header.add("paraProperties", pp);
  res.header.finalize();
  const spacer = hp(doc, "p");
  for (const [k, v] of [["id", "0"], ["paraPrIDRef", ppId], ["styleIDRef", "0"], ["pageBreak", "0"], ["columnBreak", "1"], ["merged", "0"]]) spacer.setAttribute(k, v);
  const run = hp(doc, "run");
  run.setAttribute("charPrIDRef", spec.bodyCharPrId);
  run.appendChild(hp(doc, "t"));
  spacer.appendChild(run);
  const target = tops[i1];
  const hadBreak = target.getAttribute("columnBreak");
  target.setAttribute("columnBreak", "0");
  root.insertBefore(spacer, target);
  try {
    const bytes = serializeVariants(res.pkg, root).forPreview;
    tops = kids(root).filter((e) => e.localName === "p");
    let pageOf = new Map<string, number>();
    try {
      const pos2 = await positions(bytes);
      if (pos2.length === tops.length) pageOf = pageMap(res, tops, pos2);
    } catch {
      /* 쪽 번호를 못 재면 쪽 이동만 빠집니다 */
    }
    return { bytes, pageOf, adjusted: true, overlapRisk: false };
  } finally {
    root.removeChild(spacer);
    target.setAttribute("columnBreak", hadBreak ?? "0");
  }
}

/**
 * 학생 배부용 사본: 선택형 문항의 선지 구간(①~⑤ 번호부터 그 문단 끝까지, 정답 판정과 같은 범위) 글자 음영
 * (정답 형광펜·화면에서 지정한 정답)을 지운 HWPX 두 벌(내려받기용, HWP 변환용). 발문·〈보기〉·표의 내용 음영은 남깁니다.
 * 문서 DOM은 잠깐 바꿨다가 되돌립니다. 지운 글자 묶음 수도 돌려줍니다.
 */
export function studentVariant(res: AssembleResult, mcqIds: Set<string>): { hwpx: Uint8Array; forRhwp: Uint8Array; cleared: number } {
  const changed: [Element, string][] = [];
  const noShade = new Map<string, string>();
  for (const top of kids(res.root).filter((e) => e.localName === "p")) {
    const q = res.owners.get(top);
    if (!q || !mcqIds.has(q)) continue;
    for (const p of [top, ...descendants(top, "p")]) {
      let inChoice = false;
      for (const run of kids(p).filter((r) => r.localName === "run")) {
        const text = kids(run)
          .filter((c) => c.localName === "t")
          .map((t) => t.textContent ?? "")
          .join("");
        if ([...text].some((ch) => circledIndex(ch) >= 0)) inChoice = true;
        if (!inChoice) continue;
        const id = run.getAttribute("charPrIDRef") ?? "0";
        const cp = res.header.charPr(id);
        const s = cp?.getAttribute("shadeColor");
        if (!cp || !s || s === "none" || /^#?ffffff$/i.test(s)) continue;
        let nid = noShade.get(id);
        if (!nid) {
          const c = cp.cloneNode(true) as Element;
          c.setAttribute("shadeColor", "none");
          nid = res.header.add("charProperties", c);
          noShade.set(id, nid);
        }
        changed.push([run, id]);
        run.setAttribute("charPrIDRef", nid);
      }
    }
  }
  res.header.finalize();
  try {
    const v = serializeVariants(res.pkg, res.root);
    return { hwpx: v.hwpx, forRhwp: v.forRhwp, cleared: changed.length };
  } finally {
    for (const [run, id] of changed) run.setAttribute("charPrIDRef", id);
  }
}
