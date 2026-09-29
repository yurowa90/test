// 양식 사본 위에 문항들을 배치해 결과 원안지(HWPX)를 만듭니다.
import { descendants, hp, kids, removeEl, walk } from "./dom";
import { Importer, OutputHeader } from "./header";
import { buildQuestion } from "./normalize";
import { HwpxPackage } from "./pkg";
import { deepText } from "./text";
import type { Change, FormatSpec, Question, SourceAnalysis, TemplateAnalysis } from "./types";
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
  /** rhwp 미리보기·HWP 변환용(원본 줄 배치 캐시 유지) */
  forRhwp: Uint8Array;
  changes: Change[];
  numbers: Map<string, number>;
  mcqCount: number;
  essayCount: number;
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
      im = new Importer(sources[fileIdx].pkg, header, spec);
      importers.set(fileIdx, im);
    }
    return im;
  };

  let headEls = tops.filter((_, i) => zoneOf(i) === "head");
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

  mcqs.forEach((q, i) => {
    if (i > 0) gap(spec.gapLines);
    const r = buildQuestion(q, i + 1, importerFor(q.fileIdx), spec, numberSizeHU);
    r.paras.forEach(append);
    changes.push(...r.changes);
    numbers.set(q.id, i + 1);
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
  for (const ls of descendants(root, "linesegarray")) removeEl(ls);
  const hwpx = out.toBytes();
  return { hwpx, forRhwp, changes, numbers, mcqCount: mcqs.length, essayCount: essays.length };
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
