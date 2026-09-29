// 양식 사본 위에 문항들을 배치해 결과 원안지(HWPX)를 만듭니다.
import { descendants, hp, kid, kids, removeEl, walk } from "./dom";
import { Importer, OutputHeader } from "./header";
import { buildQuestion } from "./normalize";
import { hasPageCtrl, pageCtrlKinds, splitPageControls } from "./pagectl";
import { HwpxPackage } from "./pkg";
import { deepText } from "./text";
import type { Change, FormatSpec, Issue, Question, SourceAnalysis, TemplateAnalysis } from "./types";
import { strToU8Bytes } from "./zip";

export interface AssembleInput {
  template: TemplateAnalysis;
  sources: SourceAnalysis[];
  /** 최종 순서(선택형 → 논술형으로 다시 묶어 배치) */
  order: Question[];
  spec: FormatSpec;
}

export interface AssembleResult {
  /** 내려받기용(줄 배치 캐시 없음) */
  hwpx: Uint8Array;
  /** HWP 변환용(원본 줄 배치 캐시 유지) */
  forRhwp: Uint8Array;
  /** 미리보기용(개체 없는 본문 문단의 낡은 캐시만 지움) */
  forPreview: Uint8Array;
  changes: Change[];
  /** 조립하면서 찾은 확인 사항(자동으로 줄이지 못한 개체 등) */
  issues: Issue[];
  numbers: Map<string, number>;
  mcqCount: number;
  essayCount: number;
  /** 미리보기(rhwp)에서 번호가 보이지 않을 수 있는 문항(머리 문단이 어울림 개체로 시작) */
  previewNoNumber: string[];
}

const OBJECT_TAGS = new Set(["tbl", "pic", "equation", "rect", "ellipse", "arc", "polygon", "curve", "line", "connectLine", "container", "ole", "textart", "chart", "video"]);

function blank(doc: Document, spec: FormatSpec): Element {
  const p = hp(doc, "p");
  p.setAttribute("id", "0");
  p.setAttribute("paraPrIDRef", spec.bodyParaPrId);
  p.setAttribute("styleIDRef", "0");
  p.setAttribute("pageBreak", "0");
  p.setAttribute("columnBreak", "0");
  p.setAttribute("merged", "0");
  const r = hp(doc, "run");
  r.setAttribute("charPrIDRef", spec.bodyCharPrId);
  r.appendChild(hp(doc, "t"));
  p.appendChild(r);
  return p;
}

export function assemble(input: AssembleInput): AssembleResult {
  const { template, sources, order, spec } = input;
  const out = HwpxPackage.fromBytes(template.bytes);
  const header = new OutputHeader(out);
  const secDoc = out.sections[0];
  const root = secDoc.documentElement;
  const tops = kids(root).filter((e) => e.localName === "p");
  const zoneOf = (i: number) => template.zones[i] ?? "gap";
  const changes: Change[] = [];

  const importers = new Map<number, Importer>();
  const importerFor = (fileIdx: number) => {
    let im = importers.get(fileIdx);
    if (!im) {
      const src = sources[fileIdx];
      im = new Importer(src.pkg, header, spec, { tabScale: src.columnWidthHU ? spec.columnWidthHU / src.columnWidthHU : 1 });
      importers.set(fileIdx, im);
    }
    return im;
  };

  // 머리: "head" 문단은 그대로, "headQ"(학력평가형 첫 문단)는 쪽 모양 부분만 번호 없는 문단으로.
  let headEls: Element[] = [];
  tops.forEach((p, i) => {
    if (zoneOf(i) === "head") headEls.push(p);
    else if (zoneOf(i) === "headQ") {
      const c = splitPageControls(p).controls;
      if (c) {
        c.setAttribute("paraPrIDRef", spec.bodyParaPrId);
        headEls.push(c);
      }
    }
  });
  // 지우는 예시 문항 사이에 둔 머리말·꼬리말(쪽 번호 상자 등): 머리에 없는 종류만 첫 것을 살립니다.
  const known = new Set(headEls.flatMap(pageCtrlKinds));
  const extra: Element[] = [];
  tops.forEach((p, i) => {
    if (["head", "headQ", "tail", "essayIntro"].includes(zoneOf(i)) || !hasPageCtrl(p)) return;
    for (const r of kids(p)) {
      if (r.localName !== "run") continue;
      for (const c of kids(r)) {
        if (c.localName !== "ctrl") continue;
        const hf = kids(c).find((x) => x.localName === "header" || x.localName === "footer");
        if (!hf) continue;
        const k = `${hf.localName}:${hf.getAttribute("applyPageType") ?? "BOTH"}`;
        if (known.has(k)) continue;
        known.add(k);
        extra.push(c);
      }
    }
  });
  const introEls = tops.filter((_, i) => zoneOf(i) === "essayIntro");
  const tailEls = tops.filter((_, i) => zoneOf(i) === "tail");

  if (typeof spec.headerFrom === "number" && sources[spec.headerFrom]?.headParas.length) {
    const src = sources[spec.headerFrom];
    const im = importerFor(src.fileIdx);
    headEls = src.headParas.map((p) => {
      const c = secDoc.importNode(p, true) as Element;
      im.importTree(c, "raw");
      return c;
    });
    changes.push({ questionId: null, kind: "머리 표", detail: `「${src.name}」의 머리 표·쪽 정보를 사용` });
  } else if (extra.length) {
    // 쪽 모양이 든 머리 문단(없으면 새 빈 문단)에 꼬리말 정의를 옮겨 둡니다.
    let holder = [...headEls].reverse().find(hasPageCtrl);
    if (!holder) {
      holder = blank(secDoc, spec);
      headEls.push(holder);
    }
    const run = kid(holder, "run")!;
    const t = kid(run, "t");
    for (const c of extra) run.insertBefore(c.cloneNode(true), t);
    changes.push({ questionId: null, kind: "머리말·꼬리말", detail: `예시 문항 사이에 있던 머리말·꼬리말 ${extra.length}개를 첫 쪽부터 적용` });
  }

  for (const p of tops) root.removeChild(p);
  const append = (el: Element) => root.appendChild(el);
  const gap = (n: number) => {
    for (let i = 0; i < n; i++) append(blank(secDoc, spec));
  };

  headEls.forEach(append);
  const numberSizeHU = Math.round((template.numberSizePt ?? spec.sizePt + 1) * 100);
  const mcqs = order.filter((q) => q.kind === "mcq");
  const essays = order.filter((q) => q.kind === "essay");
  const numbers = new Map<string, number>();
  const issues: Issue[] = [];
  const previewNoNumber: string[] = [];

  mcqs.forEach((q, i) => {
    if (i > 0) gap(spec.gapLines);
    const r = buildQuestion(q, i + 1, importerFor(q.fileIdx), spec, numberSizeHU);
    r.paras.forEach(append);
    changes.push(...r.changes);
    issues.push(...r.issues);
    numbers.set(q.id, i + 1);
    // rhwp 미리보기는 어울림(떠 있는) 개체로 시작하는 번호 문단의 번호를 그리지 않습니다(한글에서는 보입니다).
    const first = kids(r.head).find((x) => x.localName === "run");
    const obj = first && kids(first)[0];
    if (obj && kid(obj, "pos")?.getAttribute("treatAsChar") === "0") previewNoNumber.push(q.id);
  });

  if (essays.length) {
    gap(spec.gapLines);
    introEls.forEach(append);
    if (introEls.length) gap(1);
    essays.forEach((q, i) => {
      if (i > 0) gap(1);
      const r = buildQuestion(q, i + 1, importerFor(q.fileIdx), spec, numberSizeHU);
      r.paras.forEach(append);
      changes.push(...r.changes);
      issues.push(...r.issues);
      numbers.set(q.id, i + 1);
    });
  }

  if (tailEls.length) {
    gap(spec.gapLines);
    tailEls.forEach(append);
  }

  // 문단·개체 ID를 겹치지 않게 다시 매기고, 오래된 줄 배치 캐시를 지웁니다(한글이 열 때 다시 계산).
  let pid = 0;
  let oid = 1000000001;
  walk(root, (e) => {
    if (e.localName === "p") e.setAttribute("id", String(pid++));
    else if (OBJECT_TAGS.has(e.localName)) {
      if (e.hasAttribute("id")) e.setAttribute("id", String(oid++));
      if (e.hasAttribute("instid")) e.setAttribute("instid", String(oid++));
    }
  });
  header.finalize();

  const preview = deepText(root).replace(/\s+/g, " ").slice(0, 1000);
  out.files.set("Preview/PrvText.txt", strToU8Bytes(preview));

  // 줄 배치 캐시(linesegarray)
  // - rhwp(미리보기·HWP 변환)는 캐시가 없으면 그림이 든 문단·떠 있는 개체를 잘못 배치하므로 원본 캐시를 둔 사본을 씁니다.
  // - 내려받는 HWPX는 캐시를 모두 지워, 한글이 열 때 바뀐 서식으로 줄 배치를 새로 계산하게 합니다.
  const forRhwp = out.toBytes();
  // 미리보기 사본: 개체 없는 본문 문단은 글꼴·단 폭이 바뀌어 캐시가 낡았으므로 지워 rhwp가 다시 계산하게 합니다
  // (표·그림이 든 문단과 표 안 문단은 rhwp가 캐시 없이는 잘못 그리므로 둡니다).
  // 단, 떠 있는 개체(위아래·어울림 배치) 바로 뒤 문단은 rhwp가 캐시 위치로 개체 아래에 놓으므로 남깁니다.
  let sinceFloat = 99;
  for (const p of kids(root)) {
    if (p.localName !== "p") continue;
    const objs = kids(p).filter((r) => r.localName === "run").flatMap((r) => kids(r).filter((c) => c.localName !== "t"));
    if (objs.some((o) => kid(o, "pos")?.getAttribute("treatAsChar") === "0")) sinceFloat = 0;
    else sinceFloat++;
    const arr = kid(p, "linesegarray");
    if (!objs.length && arr && sinceFloat > 3) removeEl(arr);
  }
  const forPreview = out.toBytes();
  for (const ls of descendants(root, "linesegarray")) removeEl(ls);
  const hwpx = out.toBytes();
  return { hwpx, forRhwp, forPreview, changes, issues, numbers, mcqCount: mcqs.length, essayCount: essays.length, previewNoNumber };
}

/** 기본 순서: 선택형 번호순 → 논술형 번호순, 같은 번호는 파일 순서. */
export function defaultOrder(sources: SourceAnalysis[]): Question[] {
  const all = sources.flatMap((s) => s.questions);
  const key = (q: Question) => [q.kind === "mcq" ? 0 : 1, q.srcNumber ?? 999, q.fileIdx];
  return all.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  });
}
