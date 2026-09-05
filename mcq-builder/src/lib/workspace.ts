import type { AnalysisResult, Assembly, AssemblyContext, FinalItem, ItemBank, Proposition, Stimulus, TeacherInput, WizardStep } from "../types.ts";
import { assemble } from "./assemble.ts";

export interface Judgment { verdict: "" | "true" | "false" | "uncertain"; reason: string; revealed: boolean }
export interface PropositionNote { evidence: string; revisionReason: string }
export interface BankDraft {
  bank: ItemBank;
  pickIds: string[];
  arrayIndex: number;
  context: AssemblyContext;
  reviewedIds: string[];
  practice: boolean;
  judgments: Record<string, Judgment>;
  notes: Record<string, PropositionNote>;
}
export interface Reflection { problem: string; reason: string; transfer: string }
export const EMPTY_REFLECTION: Reflection = { problem: "", reason: "", transfer: "" };
export interface Workspace {
  revisionRecord?: string;
  step: WizardStep;
  input: TeacherInput;
  analysis: AnalysisResult | null;
  scenarioIndex: number;
  bank: ItemBank | null;
  bankDraft: BankDraft | null;
  stimulus: Stimulus | null;
  assembly: Assembly | null;
  final: FinalItem | null;
  teacherChecks: boolean[];
  reflection: Reflection;
}
export interface Revision { id: string; at: string; label: string; snapshot: Workspace }
export interface SavedWorkspace { version: 3; current: Workspace; revisions: Revision[] }

export function startWorkspace(input: TeacherInput): Workspace {
  return { step: "input", input, analysis: null, scenarioIndex: 0, bank: null, bankDraft: null, stimulus: null, assembly: null, final: null, teacherChecks: [false,false,false,false], reflection: { ...EMPTY_REFLECTION } };
}
export function createBankDraft(bank: ItemBank, assembly?: Assembly | null): BankDraft {
  return { bank, pickIds: assembly?.picks.map(p => p.id) ?? [], arrayIndex: assembly?.arrayIndex ?? 0, context: assembly?.context ?? { dataComplexity: bank.stimulus.complexity, fusion: false }, reviewedIds: [], practice: false, judgments: {}, notes: {} };
}
export function changeStimulus(draft: BankDraft, patch: Partial<Stimulus>): BankDraft {
  // Any changed source text invalidates a previously drawn figure.
  const redraw = !("figure" in patch) && ["body", "figureSpec", "conditions", "sourceIds", "indirectStem"].some(key => key in patch);
  return { ...draft, bank: { ...draft.bank, stimulus: { ...draft.bank.stimulus, ...patch, ...(redraw ? { figure: undefined } : {}) } }, reviewedIds: [], judgments: {} };
}
export function changeProposition(draft: BankDraft, id: string, patch: Partial<Proposition>): BankDraft {
  const judgments = { ...draft.judgments };
  delete judgments[id];
  return { ...draft, bank: { ...draft.bank, propositions: draft.bank.propositions.map(p => p.id === id ? { ...p, ...patch, id } : p) }, reviewedIds: draft.reviewedIds.filter(x => x !== id), judgments };
}
export function editInput(work: Workspace, input: TeacherInput): Workspace {
  // A change upstream invalidates every generated dependency, never the saved revisions.
  return { ...startWorkspace(input), reflection: work.reflection };
}
export function editAnalysis(work: Workspace, analysis: AnalysisResult, scenarioIndex = work.scenarioIndex): Workspace {
  return { ...work, analysis, scenarioIndex, bank: null, bankDraft: null, stimulus: null, assembly: null, final: null, teacherChecks: [false,false,false,false] };
}
export function editBank(work: Workspace, draft: BankDraft): Workspace {
  return { ...work, bankDraft: draft, stimulus: null, assembly: null, final: null, teacherChecks: [false,false,false,false] };
}
export function restoreRevision(revision: Revision): Workspace {
  return { ...revision.snapshot, teacherChecks: [false,false,false,false] };
}
export function bankIssues(draft: BankDraft, input: TeacherInput): string[] {
  const issues: string[] = [];
  const st = draft.bank.stimulus;
  const picks = draft.pickIds.map(id => draft.bank.propositions.find(p => p.id === id));
  if (!st.body.trim() || !st.indirectStem.trim() || !st.stemPrefix.trim()) issues.push("자료 본문·간접 발문·직접 발문 앞부분을 입력하세요.");
  if (new Set(draft.pickIds).size !== draft.pickIds.length || picks.some(p => !p)) issues.push("명제 선택을 다시 확인하세요.");
  if (picks.some(p => !p?.text.trim() || !p.explanation.trim())) issues.push("선택한 명제의 본문과 판단 근거를 입력하세요.");
  if (picks.some(p => p && !draft.reviewedIds.includes(p.id))) issues.push("선택한 모든 명제의 진위를 자료와 대조해 확인하세요.");
  if (input.sourceMode === "reference" && (!st.sourceIds.length || st.sourceIds.some(id => !input.sources.some(s => s.id === id && s.verified && s.title.trim() && s.locator.trim() && s.dataExcerpt.trim())))) issues.push("교사가 원문을 확인한 출처를 자료에 연결하세요.");
  if (draft.practice) issues.push("판단 연습을 마친 뒤 편집 모드에서 조립하세요.");
  return issues;
}

/** One transition gate shared by the editor, step navigation and generation handler. */
export function bankReadiness(draft: BankDraft, input: TeacherInput) {
  const picks = draft.pickIds.map(id => draft.bank.propositions.find(p => p.id === id)).filter((p): p is Proposition => !!p);
  const required = input.options.format === "hapdab" ? input.options.bogiCount : 5;
  const assembly = assemble(input.options.format, picks, draft.context, draft.arrayIndex);
  const issues = bankIssues(draft, input);
  if (picks.length !== required) issues.unshift(`명제를 ${required}개 선택하세요. 현재 ${picks.length}개를 선택했습니다.`);
  const blockers = assembly.warnings.filter(w => /정답이 없습니다|복수 정답 위험|비표준 배열|모든 〈보기〉가 참/.test(w));
  if (picks.length === required) {
    issues.push(...blockers);
    if (assembly.answerIndex < 0 && !blockers.length) {
      issues.push(input.options.format === "jeongdap" ? "정답형은 참 1개·거짓 4개로 선택하세요." : input.options.format === "bujeong" ? "부정형은 참 4개·거짓 1개로 선택하세요." : "정답을 만들 수 있는 명제 조합을 선택하세요.");
    }
  }
  const pending = picks.filter(p => !draft.reviewedIds.includes(p.id));
  return { assembly, required, picks, pending, issues: [...new Set(issues)], ready: issues.length === 0,
    advisories: assembly.warnings.filter(w => !blockers.includes(w)) };
}

export function readSaved(raw: string | null, fallback: TeacherInput): SavedWorkspace {
  const empty: SavedWorkspace = { version: 3, current: startWorkspace(fallback), revisions: [] };
  if (!raw) return empty;
  try {
    const data = JSON.parse(raw);
    if (data.version === 3 && data.current?.input?.options && Array.isArray(data.current.input.sources) && Array.isArray(data.revisions)) return data;
    if (data.version === 2 && data.input?.options && Array.isArray(data.input.sources)) {
      const migrated = { ...startWorkspace(data.input), ...data, bankDraft: data.bank ? createBankDraft(data.bank, data.assembly) : null };
      return { ...empty, current: migrated };
    }
  } catch { /* Keep invalid raw data in its original storage key until a successful new save. */ }
  return empty;
}

export function revisionDifferences(before: Workspace, after: Workspace): { label: string; before: string; after: string }[] {
  const rows: { label: string; before: string; after: string }[] = [];
  const add = (label: string, a: unknown, b: unknown) => {
    const x = typeof a === "string" ? a : JSON.stringify(a ?? "");
    const y = typeof b === "string" ? b : JSON.stringify(b ?? "");
    if (x !== y) rows.push({ label, before: x || "(없음)", after: y || "(없음)" });
  };
  add("성취기준", before.input.standard, after.input.standard);
  add("출제 맥락", before.input.context, after.input.context);
  add("문항 조건", before.input.options, after.input.options);
  add("평가 요소", before.analysis?.assessmentElement, after.analysis?.assessmentElement);
  add("평가 목표", before.analysis?.assessmentGoal, after.analysis?.assessmentGoal);
  add("필요한 학생 응답 증거", before.analysis?.evidenceGoal, after.analysis?.evidenceGoal);
  add("행동 영역·근거", [before.analysis?.behaviorDomain,before.analysis?.behaviorRationale], [after.analysis?.behaviorDomain,after.analysis?.behaviorRationale]);
  add("선택 장면", before.analysis?.scenarios[before.scenarioIndex], after.analysis?.scenarios[after.scenarioIndex]);
  add("출처·변환 이력", before.input.sources, after.input.sources);
  const a = before.bankDraft?.bank ?? before.bank;
  const b = after.bankDraft?.bank ?? after.bank;
  add("자료", a?.stimulus, b?.stimulus);
  const ids = new Set([...(a?.propositions ?? []), ...(b?.propositions ?? [])].map(p => p.id));
  for (const id of ids) {
    add(`명제 ${id}`, a?.propositions.find(p => p.id === id), b?.propositions.find(p => p.id === id));
  }
  add("명제 선택·배열", [before.bankDraft?.pickIds,before.bankDraft?.arrayIndex], [after.bankDraft?.pickIds,after.bankDraft?.arrayIndex]);
  add("자료 연결·수정 이유", before.bankDraft?.notes, after.bankDraft?.notes);
  add("성찰 기록", before.reflection, after.reflection);
  return rows;
}
