// 화면에서 쓰는 처리 흐름: 파일 읽기 → 분석 → 조립 → HWP 변환 → 미리보기·검수.
import { assemble } from "./engine/assemble";
import { stripHwpLineSegs } from "./engine/hwp5";
import { loadDocument, type LoadedDoc } from "./engine/load";
import { lint } from "./engine/lint";
import { hwpxToHwp, layoutInfo, layoutPositions, lineStarts, renderPreview, type LossReport } from "./engine/rhwp";
import { previewLayout, studentVariant } from "./engine/preview";
import { analyzeSource } from "./engine/segment";
import { analyzeTemplate } from "./engine/template";
import { tightenOrphans } from "./engine/tracking";
import { balanceColumns } from "./engine/balance";
import type { Change, FormatSpec, Issue, Question, SourceAnalysis, TeacherEdit, TemplateAnalysis } from "./engine/types";
import { teacherEdits } from "./engine/edit";

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
  /** 미리보기에서 번호가 보이지 않을 수 있는 문항의 결과 번호(한글에서는 보임) */
  previewNoNumber: number[];
  /** 문항 ID → 미리보기 쪽(0부터) */
  pageOf: Map<string, number>;
  /** 첫 쪽 오른쪽 단을 한글처럼 머리 표 아래에서 시작하도록 미리보기를 맞췄는지 */
  previewAdjusted: boolean;
  /** 맞추지 못해 미리보기 첫 쪽 오른쪽 단이 머리 표와 겹쳐 보일 수 있음 */
  previewOverlapRisk: boolean;
  /** 학생 배부용(선택형 정답 음영을 지운) HWP·HWPX를 만듭니다(누를 때 한 번 만들고 기억). */
  student: () => Promise<{ hwp: Uint8Array; hwpx: Uint8Array; cleared: number }>;
  /** 이 결과를 만들 때의 문항(순서·정답·배점 지정 포함). 결과를 만든 뒤 화면에서 바꾼 것과 섞지 않으려고 둡니다. */
  order: Question[];
  /** 교사가 화면에서 고친 문단(바꾸기 전·후) */
  teacherEdits: TeacherEdit[];
}

export async function build(tpl: TemplateAnalysis, sources: SourceAnalysis[], order: Question[], spec: FormatSpec): Promise<BuildOutput> {
  // 만드는 동안 화면에서 글을 고쳐도 섞이지 않게, 시작할 때 읽어 둡니다.
  const edits: TeacherEdit[] = order.flatMap((q) => teacherEdits(q).map((e) => ({ questionId: q.id, ...e })));
  await tick();
  const res = assemble({ template: tpl, sources, order, spec });
  await tick();
  const tracking = await tightenOrphans(res, spec, lineStarts);
  await tick();
  const balance = await balanceColumns(res, spec, { info: layoutInfo, positions: layoutPositions });
  await tick();
  const out = await hwpxToHwp(res.forRhwp);
  await tick();
  // 미리보기 그림과 같은 배치로 재야 하므로 줄 배치를 다시 계산하지 않습니다.
  const pv = await previewLayout(res, spec, (b) => layoutPositions(b, false));
  await tick();
  const { svgs, total } = await renderPreview(pv.bytes);
  const hwp = stripHwpLineSegs(out.hwp);
  const mcqIds = new Set(order.filter((q) => q.kind === "mcq").map((q) => q.id));
  let studentMemo: Promise<{ hwp: Uint8Array; hwpx: Uint8Array; cleared: number }> | null = null;
  const student = () =>
    (studentMemo ??= (async () => {
      const v = studentVariant(res, mcqIds);
      const conv = await hwpxToHwp(v.forRhwp);
      return { hwp: stripHwpLineSegs(conv.hwp), hwpx: v.hwpx, cleared: v.cleared };
    })());
  const rank = { error: 0, warn: 1, info: 2 } as const;
  const issues = [...res.issues, ...lint(tpl, sources, order, spec, res.numbers)].sort((a, b) => rank[a.severity] - rank[b.severity]);
  return {
    hwp,
    hwpx: res.hwpx,
    svgs,
    // 미리보기를 한글처럼 맞췄으면 그 쪽 수가 한글에 더 가깝습니다.
    pages: pv.adjusted ? total : out.pages,
    loss: out.loss,
    changes: [...res.changes, ...tracking.changes, ...balance.changes],
    issues,
    numbers: res.numbers,
    previewNoNumber: res.previewNoNumber.map((id) => res.numbers.get(id) ?? 0).filter(Boolean),
    pageOf: pv.pageOf,
    previewAdjusted: pv.adjusted,
    previewOverlapRisk: pv.overlapRisk,
    order,
    teacherEdits: edits,
    student,
  };
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
