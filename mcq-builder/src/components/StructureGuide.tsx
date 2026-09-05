import type { AnalysisResult, Assembly, Stimulus, TeacherInput } from "../types";
import type { BankDraft } from "../lib/workspace";
import { pickLabel } from "../lib/assemble";

export default function StructureGuide({ input, analysis, assembly, stimulus, notes = {} }: { input: TeacherInput; analysis?: AnalysisResult | null; assembly: Assembly; stimulus: Stimulus; notes?: BankDraft["notes"] }) {
  return <section className="growth-panel">
    <h2>이 문항의 구조와 개선 질문</h2>
    <p className="growth-help">아래는 문항 구성과 교사 기록을 연결한 안내입니다. 자동으로 내용 타당성을 판정한 결과가 아닙니다.</p>
    <dl className="structure-map">
      <dt>성취기준</dt><dd>{input.standard}</dd>
      {analysis && <><dt>평가 요소</dt><dd>{analysis.assessmentElement}</dd><dt>필요한 학생 응답 증거</dt><dd>{analysis.evidenceGoal || "미기록 — 어떤 비교·추론을 해야 이해했다고 판단할 수 있나요?"}</dd></>}
      <dt>자료 출처 연결</dt><dd>{input.sourceMode === "synthetic" ? "교육용 합성 자료" : stimulus.sourceIds.map(id => input.sources.find(s => s.id === id)?.title || `${id} 연결 확인 필요`).join(" / ")}</dd>
      <dt>발문의 응답 방식</dt><dd>{assembly.directStem}</dd>
    </dl>
    {assembly.picks.map((p,i) => <details key={p.id}>
      <summary>{pickLabel(assembly.format,i)}. {p.text}</summary>
      <p>자료 연결: {notes[p.id]?.evidence || "아직 기록하지 않았습니다. 판단에 필요한 자료값·조건을 지정해 보세요."}</p>
      <p>현재 판단 근거: {p.explanation}</p>
      <p>구조 점검: 이 명제는 ‘{p.behavior}’로 분류되어 있습니다. 자료를 가려도 풀리는지, 이 행동을 실제로 요구하는지 확인하세요.</p>
      {analysis && p.behavior !== analysis.behaviorDomain && <p className="growth-feedback">목표 행동 영역 ‘{analysis.behaviorDomain}’과 명제 분류가 다릅니다. 보조 역할인지, 목표에 맞게 수정할 대상인지 판단하세요.</p>}
      <p>수정 대안: 판단에 필요한 비교 대상·단위·조건을 명시하고, 다른 명제의 진위에 기대지 않도록 문장을 독립시켜 보세요.</p>
      {notes[p.id]?.revisionReason && <p>교사의 수정 이유: {notes[p.id].revisionReason}</p>}
    </details>)}
    <p className="growth-help">오답 선택은 특정 오개념의 확정 진단이 아닙니다. 특히 합답형은 선택 이유나 풀이 과정도 함께 확인하세요.</p>
  </section>;
}
