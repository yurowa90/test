import type { Stage1Result, TeacherInput } from "../types";
import grasps from "../knowledge/grasps.md?raw";
import ubdStage1 from "../knowledge/ubd_stage1.md?raw";
import sixFacets from "../knowledge/six_facets.md?raw";
import udl from "../knowledge/udl.md?raw";
import qualityChecklist from "../knowledge/quality_checklist.md?raw";

/** Gemini responseSchema — 파싱 에러 방지를 위한 JSON 강제 출력 스키마 */

export const STAGE1_SCHEMA = {
  type: "object",
  properties: {
    transferGoal: { type: "string" },
    understandings: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 2,
    },
    essentialQuestions: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 2,
    },
  },
  required: ["transferGoal", "understandings", "essentialQuestions"],
  propertyOrdering: ["transferGoal", "understandings", "essentialQuestions"],
};

export const GRASPS_SCHEMA = {
  type: "object",
  properties: {
    goal: { type: "string" },
    role: { type: "string" },
    audience: { type: "string" },
    situation: { type: "string" },
    product: { type: "string" },
    standards: { type: "string" },
    studentPrompt: { type: "string" },
    productOptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          format: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["format", "rationale"],
        propertyOrdering: ["format", "rationale"],
      },
    },
    rubric: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterion: { type: "string" },
          alignedUnderstandingIndex: { type: "integer" },
          levels: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                descriptor: { type: "string" },
              },
              required: ["label", "descriptor"],
              propertyOrdering: ["label", "descriptor"],
            },
            minItems: 4,
            maxItems: 4,
          },
        },
        required: ["criterion", "alignedUnderstandingIndex", "levels"],
        propertyOrdering: ["criterion", "alignedUnderstandingIndex", "levels"],
      },
    },
  },
  required: [
    "goal",
    "role",
    "audience",
    "situation",
    "product",
    "standards",
    "studentPrompt",
    "rubric",
  ],
  propertyOrdering: [
    "goal",
    "role",
    "audience",
    "situation",
    "product",
    "standards",
    "studentPrompt",
    "productOptions",
    "rubric",
  ],
};

const SHARED_ROLE = `당신은 백워드 설계(Understanding by Design)와 UDL에 정통한 교육과정 설계 전문가입니다. 대한민국 중등 과학 교사를 돕습니다. 모든 출력은 한국어로, 현직 교사가 즉시 쓸 수 있는 구체적 문장으로 작성합니다. 반드시 지정된 JSON 스키마에 맞춰 응답합니다.`;

export function buildStage1System(): string {
  return `${SHARED_ROLE}

당신의 임무는 성취기준을 백워드 설계 Stage 1 요소(전이 목표·영속적 이해·본질적 질문)로 **번역**하는 것입니다. 아직 수행과제(GRASPS)를 만들지 마십시오 — 그것은 다음 단계이며, 교사가 이 Stage 1을 검토·확정한 뒤에 진행됩니다.

다음 지식을 근거로 삼으십시오.

<knowledge>
${ubdStage1}
</knowledge>

제약:
- transferGoal 1개, understandings 2개, essentialQuestions 2개.
- 영속적 이해는 주제어가 아니라 완전한 문장(통찰)으로.
- 본질적 질문은 하나의 사실로 닫히지 않는 개방형으로.
- 세 요소가 같은 큰 개념을 가리키며 서로 정렬되도록.`;
}

export function buildStage1User(input: TeacherInput): string {
  return `아래 정보로 Stage 1 요소를 생성하십시오.

교과: ${input.subject || "(미지정)"}
학년: ${input.grade || "(미지정)"}
성취기준:
${input.standard}
${input.context ? `\n수업 맥락 메모:\n${input.context}` : ""}`;
}

export function buildGraspsSystem(includeUdlOptions: boolean): string {
  return `${SHARED_ROLE}

당신의 임무는 **교사가 확정한 Stage 1 요소**를 입력으로 받아, 그 이해를 평가하는 진짜성 있는 GRASPS 수행과제와 루브릭을 설계하는 것입니다. 과제는 성취기준이 아니라 **Stage 1의 이해에서** 도출되어야 합니다.

다음 지식을 근거로 삼으십시오.

<knowledge name="grasps">
${grasps}
</knowledge>

<knowledge name="six_facets">
${sixFacets}
</knowledge>

<knowledge name="udl">
${udl}
</knowledge>

<knowledge name="quality_checklist">
${qualityChecklist}
</knowledge>

절대 제약(정렬이 이 도구의 존재 이유입니다):
- rubric의 각 준거는 반드시 하나의 영속적 이해에 대응하며, alignedUnderstandingIndex에 그 이해의 0-기반 인덱스를 정확히 넣습니다.
- 영속적 이해가 2개이므로 rubric 준거도 최소 2개(각 이해당 1개 이상)를 만들고, 모든 이해가 최소 1개 준거로 평가되게 합니다.
- 각 준거의 levels는 정확히 4개 수준이며, "잘함/보통" 같은 공허한 등급이 아니라 관찰 가능한 수행 차이로 서술합니다.
- 겨냥한 이해에 적절한 '이해의 여섯 측면'(설명·해석·적용·관점·공감·자기지식)을 골라 과제 요구와 루브릭 준거로 번역합니다. 모든 측면을 억지로 넣지 않습니다.
- 역할(role)·청중(audience)이 학생의 실제 수행을 바꾸도록 설계합니다. 장식용 역할("당신은 장관입니다")을 금지합니다.
- studentPrompt는 6요소를 자연스럽게 통합해 학생에게 그대로 제시할 수 있는 안내문으로 작성합니다.
${includeUdlOptions ? "- productOptions에 UDL 기반 산출물 대안 3개를 넣습니다. 모든 옵션은 같은 영속적 이해를 증거로 요구하고 같은 루브릭으로 채점 가능해야 합니다." : "- productOptions는 생략합니다(빈 배열 또는 필드 없음)."}

출력 전에 quality_checklist로 스스로 대조하고, 정렬이 깨진 부분이 있으면 그 부분만 수정한 뒤 최종본을 내십시오.`;
}

export function buildGraspsUser(
  input: TeacherInput,
  stage1: Stage1Result,
): string {
  const understandings = stage1.understandings
    .map((u, i) => `  [${i}] ${u}`)
    .join("\n");
  const questions = stage1.essentialQuestions
    .map((q, i) => `  ${i + 1}. ${q}`)
    .join("\n");

  return `교과: ${input.subject || "(미지정)"} / 학년: ${input.grade || "(미지정)"}
${input.context ? `수업 맥락: ${input.context}\n` : ""}
=== 교사가 확정한 Stage 1 (이것을 평가할 과제를 만드십시오) ===

전이 목표:
  ${stage1.transferGoal}

영속적 이해 (rubric의 alignedUnderstandingIndex는 이 인덱스를 사용):
${understandings}

본질적 질문:
${questions}

위 이해를 드러내는 증거가 되도록 GRASPS 과제와 루브릭을 생성하십시오.`;
}
