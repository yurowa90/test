import type { GraspsTask, Stage1Result, TeacherInput } from "../types";

/** Stage 1 + GRASPS 결과를 Markdown 문서로 직렬화 */
export function toMarkdown(
  input: TeacherInput,
  stage1: Stage1Result,
  task: GraspsTask,
): string {
  const lines: string[] = [];

  lines.push(`# GRASPS 수행과제 설계안`);
  lines.push("");
  lines.push(`- **교과**: ${input.subject || "-"}`);
  lines.push(`- **학년**: ${input.grade || "-"}`);
  if (input.context) lines.push(`- **수업 맥락**: ${input.context}`);
  lines.push("");
  lines.push(`## 성취기준`);
  lines.push("");
  lines.push(input.standard.trim() || "-");
  lines.push("");

  lines.push(`## Stage 1 — 바라는 결과`);
  lines.push("");
  lines.push(`### 전이 목표`);
  lines.push(stage1.transferGoal);
  lines.push("");
  lines.push(`### 영속적 이해`);
  stage1.understandings.forEach((u, i) => lines.push(`${i + 1}. ${u}`));
  lines.push("");
  lines.push(`### 본질적 질문`);
  stage1.essentialQuestions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
  lines.push("");

  lines.push(`## Stage 2 — GRASPS 수행과제`);
  lines.push("");
  lines.push(`| 요소 | 내용 |`);
  lines.push(`| --- | --- |`);
  lines.push(`| **G** 목표 | ${escapeCell(task.goal)} |`);
  lines.push(`| **R** 역할 | ${escapeCell(task.role)} |`);
  lines.push(`| **A** 청중 | ${escapeCell(task.audience)} |`);
  lines.push(`| **S** 상황 | ${escapeCell(task.situation)} |`);
  lines.push(`| **P** 수행·산출물 | ${escapeCell(task.performanceProduct)} |`);
  lines.push(`| **S** 성공기준 | ${escapeCell(task.standards)} |`);
  lines.push("");

  lines.push(`### 학생용 과제 안내문`);
  lines.push("");
  lines.push(task.studentPrompt);
  lines.push("");

  if (task.productOptions && task.productOptions.length > 0) {
    lines.push(`### 산출물 대안 (UDL — 행동·표현의 다양화)`);
    lines.push("");
    task.productOptions.forEach((o) =>
      lines.push(`- **${o.format}**: ${o.rationale}`),
    );
    lines.push("");
  }

  lines.push(`### 루브릭`);
  lines.push("");
  task.rubric.forEach((c, idx) => {
    const aligned = stage1.understandings[c.alignedUnderstandingIndex];
    lines.push(`#### 준거 ${idx + 1}. ${c.criterion}`);
    if (aligned) lines.push(`> 대응 이해: ${aligned}`);
    lines.push("");
    lines.push(`| 수준 | 서술 |`);
    lines.push(`| --- | --- |`);
    c.levels.forEach((l) =>
      lines.push(`| ${escapeCell(l.label)} | ${escapeCell(l.descriptor)} |`),
    );
    lines.push("");
  });

  return lines.join("\n");
}

function escapeCell(text: string): string {
  return text.replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();
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
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
