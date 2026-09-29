// 화면에서 쓰는 처리 흐름: 파일 읽기 → 분석 → 조립 → HWP 변환 → 미리보기·검수.
import { assemble } from "./engine/assemble";
import { stripHwpLineSegs } from "./engine/hwp5";
import { loadDocument, type LoadedDoc } from "./engine/load";
import { lint } from "./engine/lint";
import { hwpxToHwp, renderPages, type LossReport } from "./engine/rhwp";
import { analyzeSource } from "./engine/segment";
import { analyzeTemplate } from "./engine/template";
import type { Change, FormatSpec, Issue, Question, SourceAnalysis, TemplateAnalysis } from "./engine/types";

const tick = () => new Promise((r) => setTimeout(r, 0));

export async function readFile(file: File): Promise<LoadedDoc> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  await tick();
  return loadDocument(file.name, bytes);
}

export function readTemplate(doc: LoadedDoc): TemplateAnalysis {
  return analyzeTemplate(doc);
}

export function readSource(fileIdx: number, doc: LoadedDoc, tpl: TemplateAnalysis): SourceAnalysis {
  return analyzeSource(fileIdx, doc, tpl);
}

export interface BuildOutput {
  hwp: Uint8Array;
  hwpx: Uint8Array;
  svgs: string[];
  pages: number;
  loss: LossReport;
  changes: Change[];
  issues: Issue[];
  numbers: Map<string, number>;
}

export async function build(tpl: TemplateAnalysis, sources: SourceAnalysis[], order: Question[], spec: FormatSpec): Promise<BuildOutput> {
  await tick();
  const res = assemble({ template: tpl, sources, order, spec });
  await tick();
  const out = await hwpxToHwp(res.forRhwp);
  await tick();
  const svgs = await renderPages(res.forRhwp);
  const hwp = stripHwpLineSegs(out.hwp);
  const issues = lint(tpl, sources, order, spec, res.numbers);
  return { hwp, hwpx: res.hwpx, svgs, pages: out.pages, loss: out.loss, changes: res.changes, issues, numbers: res.numbers };
}

export function download(bytes: Uint8Array | string, name: string, type = "application/octet-stream") {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
