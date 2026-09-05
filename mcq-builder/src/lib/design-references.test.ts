import test from "node:test";
import assert from "node:assert/strict";
import { DESIGN_LESSONS, DESIGN_SOURCES, designReferencePrompt, selectDesignLessons } from "./design-references.ts";
import { exampleWorkspace } from "./example.ts";
import { assemble } from "./assemble.ts";
import { toStudentMarkdown, toTeacherMarkdown } from "./export.ts";

test("모든 개선 사례의 출처·PDF 쪽수가 실제 첨부 범위 안에 있다", () => {
  assert.equal(new Set(DESIGN_LESSONS.map(lesson => lesson.id)).size, DESIGN_LESSONS.length);
  const cited = new Set<string>();
  for (const lesson of DESIGN_LESSONS) {
    assert.ok(lesson.citations.length > 0, lesson.id);
    for (const citation of lesson.citations) {
      cited.add(citation.source);
      const source = DESIGN_SOURCES[citation.source];
      assert.ok(source);
      assert.ok(citation.pages.length > 0);
      citation.pages.forEach(page => assert.ok(Number.isInteger(page) && page >= 1 && page <= source.pages, lesson.id));
    }
  }
  assert.equal(cited.size, 7);
});

test("생명과학 효소 설계는 해당 기출 분석을 우선하고 무관한 지구과학 안내를 섞지 않는다", () => {
  const input = { ...exampleWorkspace().input, subject: "생명과학", domain: "물질대사", standard: "효소와 기질 농도의 관계를 그래프로 해석하고 서로 구별한다." };
  const lessons = selectDesignLessons(input, "bank");
  assert.ok(lessons.some(lesson => lesson.id === "enzyme-axes"));
  assert.ok(lessons.every(lesson => ["공통", "생명과학"].includes(lesson.subject)));
  assert.equal(lessons.length, 5);
  const prompt = designReferencePrompt(input, "bank");
  assert.match(prompt, /PDF 80쪽/);
  assert.match(prompt, /stimulus.sourceIds에 넣지/);
  assert.match(prompt, /현재 선택한 성취기준/);
  assert.ok(prompt.length < 5000);
});

test("공통 안내는 과목 미선택에서도 제공하고 결과 단계에 동료·시행 후 검토를 추가한다", () => {
  const input = { subject: "", domain: "", standard: "" };
  assert.equal(selectDesignLessons(input, "input").length, 2);
  assert.ok(selectDesignLessons(input, "result").some(lesson => lesson.id === "peer-feedback"));
  assert.ok(selectDesignLessons({ subject: "지구과학", domain: "지구 자기장", standard: "복각과 편각을 해석한다" }, "bank")
    .some(lesson => lesson.id === "earth-reference-frame"));
});

test("출제 학습 출처는 교사용에만 포함하고 학생의 자료 출처를 대체하지 않는다", () => {
  const w = exampleWorkspace();
  const assembly = assemble("hapdab", w.bank.propositions.slice(0, 3), w.bankDraft.context, 0);
  const final = { ...w.bank.stimulus, statements: assembly.picks.map(p => p.text), explanations: [], solution: "합성 자료 해설", review: [], info: {} as never };
  const args = [w.input, w.analysis, w.analysis.scenarios[0], w.bank.stimulus, assembly, final] as const;
  const teacher = toTeacherMarkdown(...args);
  const student = toStudentMarkdown(...args);
  assert.match(teacher, /출제 학습 참고자료/);
  assert.match(teacher, /평가문항 제작기법/);
  assert.doesNotMatch(student, /출제 학습 참고자료|평가문항 제작기법|마더텅/);
  assert.match(student, /교육용으로 재구성한 합성 자료/);
});
