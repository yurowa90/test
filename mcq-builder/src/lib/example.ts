import type { ItemBank, TeacherInput } from "../types";
import { createBankDraft, startWorkspace } from "./workspace.ts";

/** Explicitly synthetic: no invented paper or curriculum code. Works without an API key. */
export function exampleWorkspace() {
  const input: TeacherInput = { subject: "과학 · 출제 연습 예시", grade: "", standard: "같은 조건에서 측정한 자료의 값을 비교하고 그 관계를 설명한다. (앱 체험용 목표, 공식 성취기준 아님)", context: "교육용 합성 자료로 편집과 판단 연습을 체험합니다.", sourceMode: "synthetic", sources: [], options: { format: "hapdab", bogiCount: 3, behavior: "자료 분석 및 해석", difficulty: "중", inquiryContext: "순수과학", stimulusHint: "표" } };
  const bank: ItemBank = {
    origin: "example",
    stimulus: { indirectStem: "표는 같은 조건에서 측정한 세 시료의 질량과 부피를 나타낸 것이다.", body: "| 시료 | 질량(g) | 부피(cm³) |\n| --- | --- | --- |\n| A | 20 | 10 |\n| B | 30 | 10 |\n| C | 40 | 20 |", figureSpec: "", conditions: ["밀도는 질량을 부피로 나눈 값이다.", "모든 값은 교육용 합성 자료이다."], stemPrefix: "이에 대한 설명으로", complexity: 1, sourceIds: [] },
    propositions: [
      { id: "demo-a", text: "A의 밀도는 2 g/cm³이다.", isTrue: true, level: "C", behavior: "적용", explanation: "20 g ÷ 10 cm³ = 2 g/cm³이다." },
      { id: "demo-b", text: "B의 밀도는 A보다 크다.", isTrue: true, level: "C", behavior: "자료 분석 및 해석", explanation: "B는 3 g/cm³, A는 2 g/cm³이므로 B가 크다." },
      { id: "demo-c", text: "C의 밀도는 A의 2배이다.", isTrue: false, level: "C", behavior: "자료 분석 및 해석", explanation: "C는 40÷20=2 g/cm³으로 A와 같다. 질량만 비교하는 오류를 점검한다." },
      { id: "demo-d", text: "세 시료 중 B의 부피가 가장 크다.", isTrue: false, level: "D", behavior: "이해", explanation: "표에서 C의 부피가 20 cm³으로 가장 크다." },
      { id: "demo-e", text: "A와 C의 밀도는 같다.", isTrue: true, level: "C", behavior: "자료 분석 및 해석", explanation: "두 시료의 질량과 부피의 비가 모두 2이다." },
    ],
  };
  const draft = createBankDraft(bank);
  draft.practice = true;
  return { ...startWorkspace(input), step: "bank" as const, analysis: { contentElements: ["질량", "부피", "밀도"], assessmentElement: "질량과 부피 자료를 이용한 밀도 비교", assessmentGoal: "질량과 부피의 비를 계산하고 시료의 밀도를 비교할 수 있는지 평가한다.", behaviorDomain: "자료 분석 및 해석" as const, behaviorRationale: "두 변인의 비를 계산하고 시료 간 값을 비교한다.", evidenceGoal: "질량만 비교하지 않고 질량/부피를 근거로 답한다.", scenarios: [{ title: "세 시료의 질량과 부피", stimulusType: "표" as const, description: "같은 조건에서 얻은 측정값을 비교한다.", cues: ["질량", "부피", "같은 측정 조건"], inquiryContext: "순수과학" as const, sourcePlan: "앱 체험용 합성 자료" }] }, bank, bankDraft: draft };
}
