import test from "node:test";
import assert from "node:assert/strict";
import { chartFromTable, figureIssue, figureSvg, missingFigureValues } from "./figure.ts";
import type { ItemFigure } from "./figure.ts";
import { exampleWorkspace } from "./example.ts";
import { assemble } from "./assemble.ts";
import { changeStimulus, editBank, readSaved, restoreRevision } from "./workspace.ts";
import { renderItemText, toStudentHtml, toStudentMarkdown, toTeacherMarkdown } from "./export.ts";

const chart: ItemFigure = { kind: "bar", title: "측정값 비교", xLabel: "시료", yLabel: "질량(g)", categories: ["A", "B", "C"], xValues: [], series: [{ name: "질량", values: [20, 30, 40] }], steps: [], caption: "교육용 합성 자료", evidence: "본문 표의 질량 열" };

test("그래프는 누락·잘못된 수치·중복 x값을 보완하거나 0으로 바꾸지 않는다", () => {
  assert.throws(() => chartFromTable("시료\t질량\nA\t20\nB\t", chart));
  assert.throws(() => chartFromTable("시료\t질량\nA\t20g\nB\t30", chart));
  assert.ok(figureIssue({ ...chart, series: [{ name: "값", values: [20, NaN, 30] }] }));
  assert.ok(figureIssue({ ...chart, series: [{ name: "값", values: [20, 30] }] }));
  assert.ok(figureIssue({ ...chart, kind: "line", categories: [], xValues: [0, 0, 10] }));
  assert.equal(figureIssue(chartFromTable("시료\t질량\nA\t20\nB\t30\nC\t40", chart)), null);
});

test("꺾은선의 x좌표는 실제 간격을 보존하며 음수 막대도 유효한 높이로 표시한다", () => {
  const svg = figureSvg({ ...chart, kind: "line", categories: [], xValues: [0, 1, 10] });
  const xs = /<polyline points="([^"]+)"/.exec(svg)![1].split(" ").map(p => Number(p.split(",")[0]));
  assert.ok(Math.abs((xs[2] - xs[1]) / (xs[1] - xs[0]) - 9) < 1e-6);
  for (const values of [[-10, 0, 30], [0, 0, 0], [-20, -10, -5]]) {
    const bars = figureSvg({ ...chart, series: [{ name: "변화량", values }] });
    assert.doesNotMatch(bars, /NaN|Infinity|height="-/);
  }
});

test("정량 그래프의 새로운 값을 감지하며 정성 설명에 가상의 비율을 붙이지 않는다", () => {
  assert.deepEqual(missingFigureValues(chart, "질량은 A 20, B 30, C 40 g이다."), []);
  assert.deepEqual(missingFigureValues(chart, "비율이 증가하였다."), [20, 30, 40]);
  const process = { ...chart, kind: "process" as const, categories: [], series: [], steps: [{ title: "살포 전", lines: ["A와 B가 함께 존재"] }, { title: "살포 후", lines: ["A 감소, B의 비율 증가"] }] };
  assert.equal(figureIssue(process), null);
  const svg = figureSvg(process);
  assert.match(svg, /개체 수·비율을 나타내지 않음/);
  assert.doesNotMatch(svg, /20%|30%|<polyline/);
});

test("입력 문구를 SVG·HTML 실행 코드로 해석하지 않고 교사용 근거를 학생용에서 제외한다", () => {
  const figure = { ...chart, title: '<script>alert("x")</script>', evidence: "교사전용_비밀근거" };
  const svg = figureSvg(figure, '출처 <img src=x onerror="x">');
  assert.doesNotMatch(svg, /<script>|<img |교사전용_비밀근거/);
  assert.match(svg, /&lt;script&gt;/);
  const w = exampleWorkspace();
  const asm = assemble("hapdab", w.bank.propositions.slice(0, 3), w.bankDraft.context, 0);
  const stimulus = { ...w.bank.stimulus, figure };
  const final = { ...stimulus, body: '<img src=x onerror="x">', figureSpec: "교사전용_제작지시", statements: asm.picks.map(p => p.text), explanations: [], solution: "교사전용_정답풀이", review: [], info: {} as never };
  const html = toStudentHtml(w.input, stimulus, asm, final);
  assert.match(html, /<svg /);
  assert.doesNotMatch(html, /<script>|<img |교사전용_/);
  const args = [w.input, w.analysis, w.analysis.scenarios[0], stimulus, asm, final] as const;
  const student = toStudentMarkdown(...args), teacher = toTeacherMarkdown(...args);
  assert.match(student, /data:image\/svg\+xml/);
  assert.doesNotMatch(student, /교사전용_/);
  assert.match(teacher, /교사전용_비밀근거/);
  assert.match(renderItemText(stimulus, asm, final.statements, stimulus), /확정된 그림 데이터/);
});

test("그림 변경은 명제 확인·최종 승인을 해제하고 원문 변경은 오래된 그림을 제거한다", () => {
  const w = exampleWorkspace();
  const before = { ...w.bankDraft, reviewedIds: ["demo-a"], judgments: { "demo-a": { verdict: "true" as const, reason: "확인", revealed: true } } };
  const draft = changeStimulus(before, { figure: chart });
  assert.deepEqual(draft.reviewedIds, []); assert.deepEqual(draft.judgments, {});
  assert.equal(draft.bank.stimulus.body, w.bank.stimulus.body);
  const changed = editBank({ ...w, teacherChecks: [true, true, true, true] }, draft);
  assert.deepEqual(changed.teacherChecks, [false, false, false, false]);
  assert.equal(changed.final, null);
  assert.equal(changeStimulus(draft, { body: "새로운 값" }).bank.stimulus.figure, undefined);
  const saved = readSaved(JSON.stringify({ version: 3, current: changed, revisions: [] }), w.input);
  assert.deepEqual(saved.current.bankDraft?.bank.stimulus.figure, chart);
  assert.deepEqual(restoreRevision({ id: "test", at: "", label: "그림 보관", snapshot: changed }).bankDraft?.bank.stimulus.figure, chart);
});
