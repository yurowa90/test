import type { TeacherInput, WizardStep } from "../types";
import { DESIGN_LESSONS, DESIGN_SCOPE_NOTE, DESIGN_SOURCES, formatDesignCitation, selectDesignLessons } from "../lib/design-references";
import type { DesignLesson } from "../lib/design-references";

function Lesson({ lesson }: { lesson: DesignLesson }) {
  return <details className="reference-lesson">
    <summary><span>{lesson.subject} · {lesson.kind}</span><strong>{lesson.title}</strong></summary>
    <dl>
      <div><dt>발견한 문제</dt><dd>{lesson.problem}</dd></div>
      <div><dt>개선 방법</dt><dd>{lesson.change}</dd></div>
      <div><dt>이렇게 바꾸는 이유</dt><dd>{lesson.reason}</dd></div>
    </dl>
    <p className="reference-question">교사 질문: {lesson.question}</p>
    <ul className="pedagogy-reference">{lesson.citations.map((citation, i) => <li key={i}>{formatDesignCitation(citation)}</li>)}</ul>
  </details>;
}

export default function ReferenceCoach({ input, step }: { input: TeacherInput; step: WizardStep }) {
  const lessons = selectDesignLessons(input, step);
  const others = DESIGN_LESSONS.filter(lesson => !lessons.some(selected => selected.id === lesson.id));
  return <details className="reference-coach">
    <summary>자료에서 배우는 문항 개선 <span>현재 설계 참고 {lessons.length}개</span></summary>
    <p className="reference-intro">선택한 과목·성취기준에 따라 안내합니다. 사례를 읽고 현재 문항에서 바꿀 점과 그 이유를 성장 노트에 남겨 보세요.</p>
    {lessons.map(lesson => <Lesson key={lesson.id} lesson={lesson} />)}
    <details className="reference-library"><summary>다른 과목·주제의 개선 사례 보기</summary>
      {others.map(lesson => <Lesson key={lesson.id} lesson={lesson} />)}
    </details>
    <details className="reference-library"><summary>참고한 7개 자료와 분석 범위</summary>
      <p>{DESIGN_SCOPE_NOTE}</p>
      <p>기출의 구조 분석은 앱의 해석입니다. 원문 전체나 문제·정답을 배포하지 않으며, 쪽수는 첨부 PDF의 첫 장을 1쪽으로 셉니다.</p>
      <ul>{Object.entries(DESIGN_SOURCES).map(([id, source]) => <li key={id}><strong>{source.title} ({source.pages}쪽)</strong><p>{source.coverage}</p></li>)}</ul>
    </details>
  </details>;
}
