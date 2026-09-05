import type {
  AnalysisResult,
  Assembly,
  FinalItem,
  Scenario,
  SourceReference,
  Stimulus,
  TeacherInput,
} from "../types";
import { FORMAT_LABELS } from "../types.ts";
import { CIRCLED, composeStem, pickLabel } from "./assemble.ts";
import { designReferenceMarkdown } from "./design-references.ts";

function selectedSources(input: TeacherInput, stimulus: Stimulus): SourceReference[] {
  const ids = new Set(stimulus.sourceIds);
  return input.sources.filter((source) => ids.has(source.id));
}

export function formatSource(source: SourceReference): string {
  const authorYear = [source.creators.trim(), source.year.trim() ? `(${source.year.trim()})` : ""]
    .filter(Boolean)
    .join(" ");
  return [authorYear, source.title.trim(), source.locator.trim()].filter(Boolean).join(". ");
}

function sourceNote(input: TeacherInput, stimulus: Stimulus): string {
  if (input.sourceMode === "synthetic") return "자료: 교육용으로 재구성한 합성 자료";
  const sources = selectedSources(input, stimulus);
  return sources.length
    ? `자료 출처: ${sources.map((source) => formatSource(source)).join(" / ")} (출제 목적에 맞게 재구성)`
    : "자료 출처: 교사 확인 필요";
}

/** 시험지 형태의 문항 본문(발문·자료·〈보기〉·선택지)을 텍스트로 */
export function renderItemText(
  stimulus: Stimulus,
  assembly: Assembly,
  statements: string[],
  content: { indirectStem: string; body: string; figureSpec: string; conditions: string[] },
): string {
  const lines: string[] = [];
  lines.push(`1. ${content.indirectStem.trim()}`);
  lines.push("");
  lines.push(content.body.trim());
  if (content.figureSpec.trim()) {
    lines.push("");
    lines.push(`[그림·그래프 제작 지시] ${content.figureSpec.trim()}`);
  }
  lines.push("");
  lines.push(composeStem(stimulus.stemPrefix, assembly.directStem, content.conditions));
  lines.push("");
  if (assembly.format === "hapdab") {
    lines.push("〈보기〉");
    statements.forEach((s, i) => lines.push(`${pickLabel("hapdab", i)}. ${s}`));
    lines.push("");
    lines.push(assembly.choices.map((c, i) => `${CIRCLED[i]} ${c}`).join("  "));
  } else {
    statements.forEach((s, i) => lines.push(`${CIRCLED[i]} ${s}`));
  }
  return lines.join("\n");
}

/** 정답·해설·제작 지시를 제외한 학생용 문항 */
export function toStudentMarkdown(
  input: TeacherInput,
  _analysis: AnalysisResult,
  _scenario: Scenario,
  stimulus: Stimulus,
  assembly: Assembly,
  final: FinalItem,
): string {
  const L: string[] = [];
  L.push("# 과학 선다형 문항");
  L.push("");
  L.push(`**1.** ${final.indirectStem.trim()}`);
  L.push("");
  L.push(final.body.trim());
  L.push("");
  if (final.figureSpec.trim()) {
    L.push("[그림·그래프 삽입 위치]");
    L.push("");
  }
  L.push(`**${composeStem(stimulus.stemPrefix, assembly.directStem, final.conditions)}**`);
  L.push("");
  if (assembly.format === "hapdab") {
    L.push("| 보 기 |");
    L.push("| --- |");
    final.statements.forEach((s, i) =>
      L.push(`| ${pickLabel("hapdab", i)}. ${escapeCell(s)} |`),
    );
    L.push("");
    L.push(assembly.choices.map((c, i) => `${CIRCLED[i]} ${c}`).join("  "));
  } else {
    final.statements.forEach((s, i) => L.push(`${CIRCLED[i]} ${s}`));
  }
  L.push("");
  L.push(`> ${sourceNote(input, stimulus)}`);
  return L.join("\n");
}

/** 교사용 문항 + 정답·해설 + 문항정보표 + AI 사전 점검을 Markdown으로 */
export function toTeacherMarkdown(
  input: TeacherInput,
  analysis: AnalysisResult,
  scenario: Scenario,
  stimulus: Stimulus,
  assembly: Assembly,
  final: FinalItem,
): string {
  const L: string[] = [];
  const answer = assembly.answerIndex >= 0 ? CIRCLED[assembly.answerIndex] : "-";

  L.push(`# 학력평가형 문항 (${FORMAT_LABELS[assembly.format]})`);
  L.push("");
  L.push(`- **교과**: ${input.subject || "-"} / **학년**: ${input.grade || "-"}`);
  L.push(`- **성취기준**: ${input.standardCode ? `[${input.standardCode}] ` : ""}${input.standard.trim()}`);
  L.push(`- **평가 요소**: ${analysis.assessmentElement}`);
  L.push(`- **평가 목표**: ${analysis.assessmentGoal}`);
  L.push(`- **행동 영역**: ${analysis.behaviorDomain} / **탐구 상황**: ${scenario.inquiryContext} / **자료**: ${scenario.stimulusType}`);
  L.push("");

  L.push("## 문항");
  L.push("");
  L.push(`**1.** ${final.indirectStem.trim()}`);
  L.push("");
  L.push(final.body.trim());
  L.push("");
  if (final.figureSpec.trim()) {
    L.push(`> **그림·그래프 제작 지시(출제자용)**: ${final.figureSpec.trim()}`);
    L.push("");
  }
  L.push(`> ${sourceNote(input, stimulus)}`);
  L.push("");
  L.push(`**${composeStem(stimulus.stemPrefix, assembly.directStem, final.conditions)}**`);
  L.push("");
  if (assembly.format === "hapdab") {
    L.push("| 보 기 |");
    L.push("| --- |");
    final.statements.forEach((s, i) =>
      L.push(`| ${pickLabel("hapdab", i)}. ${escapeCell(s)} |`),
    );
    L.push("");
    L.push(assembly.choices.map((c, i) => `${CIRCLED[i]} ${c}`).join("  "));
  } else {
    final.statements.forEach((s, i) => L.push(`${CIRCLED[i]} ${s}`));
  }
  L.push("");

  L.push(`## 정답: ${answer}`);
  L.push("");
  L.push("### 해설");
  L.push("");
  final.explanations.forEach((e) =>
    L.push(`- **${e.label}** (${e.verdict}) ${e.text}`),
  );
  L.push("");
  L.push(final.solution.trim());
  L.push("");

  L.push("## 문항정보표");
  L.push("");
  L.push("| 항목 | 내용 |");
  L.push("| --- | --- |");
  const info = final.info;
  const rows: [string, string][] = [
    ["교과(과목)", info.subject],
    ["내용 영역", info.contentArea],
    ["내용 요소", info.contentElement],
    ["행동 영역", info.behaviorDomain],
    ["성취기준", info.standardCode],
    ["평가 요소", info.assessmentElement],
    ["평가 목표", info.assessmentGoal],
    ["탐구 상황", info.inquiryContext],
    ["사전 인지 복잡도(7등급)", info.difficultyTier || assembly.difficulty.tier],
    ["정답", answer],
    ["출제 의도·주안점", info.intent],
  ];
  rows.forEach(([k, v]) => L.push(`| ${k} | ${escapeCell(v)} |`));
  L.push("");

  L.push("## AI 사전 점검");
  L.push("");
  final.review.forEach((r) =>
    L.push(`- [${r.pass ? "x" : " "}] ${r.item}${r.note ? ` — ${r.note}` : ""}`),
  );
  L.push("");
  L.push(
    `> 조립 근거: ${assembly.uniform ? "선택지 항목 수 균일" : "선택지 항목 수 상이"} → "${assembly.directStem}" / 사전 인지 복잡도 점수 ${assembly.difficulty.score.toFixed(2)} (명제 평균 ${assembly.difficulty.base.toFixed(2)} + 정답 구조 ${assembly.difficulty.answerWeight.toFixed(2)} + 맥락 ${assembly.difficulty.contextWeight.toFixed(2)})`,
  );
  if (assembly.warnings.length) {
    L.push("");
    L.push("> 경고: " + assembly.warnings.join(" / "));
  }
  const sources = selectedSources(input, stimulus);
  L.push("");
  L.push("## 자료 출처·이용 기록");
  L.push("");
  if (input.sourceMode === "synthetic") {
    L.push("- 교육용으로 재구성한 합성 자료이며 실제 연구 결과가 아닙니다.");
  } else {
    sources.forEach((source) => {
      L.push(`- ${formatSource(source)}`);
      L.push(`  - 활용: ${source.use}`);
      L.push(`  - 이용 조건: ${source.rights || "교사 확인 필요"}`);
      L.push(`  - 원문 위치: ${source.originalLocation || source.locator}`);
      L.push(`  - 연구 조건: ${source.studyConditions || "미기록"}`);
      L.push(`  - 재구성 기록: ${source.transformations || "미기록"}`);
      L.push(`  - 해석 한계: ${source.limitations || "미기록"}`);
    });
  }
  L.push("", designReferenceMarkdown(input));
  return L.join("\n");
}

/** 기존 내부 호출과 외부 참조를 위한 호환 별칭 */
export const toMarkdown = toTeacherMarkdown;

function escapeCell(text: string): string {
  return (text ?? "").replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadMarkdown(filename: string, content: string): void {
  downloadText(filename, content, "text/markdown;charset=utf-8");
}

export function downloadText(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
