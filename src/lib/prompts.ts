import type {
  AchievementLevels,
  GraspsSelection,
  Stage1Result,
  TeacherInput,
} from "../types";
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

const candidateArray = {
  type: "array",
  items: { type: "string" },
  minItems: 2,
  maxItems: 3,
};

/** Pass 2a — 요소별 후보(각 2~3개) */
export const GRASPS_CANDIDATES_SCHEMA = {
  type: "object",
  properties: {
    goal: candidateArray,
    role: candidateArray,
    audience: candidateArray,
    situation: candidateArray,
    performanceProduct: candidateArray,
    standards: candidateArray,
  },
  required: [
    "goal",
    "role",
    "audience",
    "situation",
    "performanceProduct",
    "standards",
  ],
  propertyOrdering: [
    "goal",
    "role",
    "audience",
    "situation",
    "performanceProduct",
    "standards",
  ],
};

/** Pass 2b — 확정된 6요소에 정렬된 안내문·루브릭 */
export const GRASPS_FINAL_SCHEMA = {
  type: "object",
  properties: {
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
            minItems: 3,
            maxItems: 5,
          },
        },
        required: ["criterion", "alignedUnderstandingIndex", "levels"],
        propertyOrdering: ["criterion", "alignedUnderstandingIndex", "levels"],
      },
    },
  },
  required: ["studentPrompt", "rubric"],
  propertyOrdering: ["studentPrompt", "productOptions", "rubric"],
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

function stage1Block(stage1: Stage1Result): string {
  const understandings = stage1.understandings
    .map((u, i) => `  [${i}] ${u}`)
    .join("\n");
  const questions = stage1.essentialQuestions
    .map((q, i) => `  ${i + 1}. ${q}`)
    .join("\n");
  return `전이 목표:
  ${stage1.transferGoal}

영속적 이해 (rubric의 alignedUnderstandingIndex는 이 인덱스를 사용):
${understandings}

본질적 질문:
${questions}`;
}

/* ── Pass 2a: 요소별 후보 생성 ──────────────────────────── */

export function buildCandidatesSystem(): string {
  return `${SHARED_ROLE}

당신의 임무는 **교사가 확정한 Stage 1 요소**를 평가할 GRASPS 수행과제를 위해, 6요소(goal·role·audience·situation·performanceProduct·standards) 각각에 대해 **서로 뚜렷이 다른 후보 문장 2~3개**를 제안하는 것입니다. 아직 학생용 안내문이나 루브릭은 만들지 마십시오 — 교사가 요소별로 하나를 고른 뒤 다음 단계에서 생성됩니다.

다음 지식을 근거로 삼으십시오. 특히 grasps.md의 Figure 7.7 문장 틀을 요소별로 활용하십시오.

<knowledge name="grasps">
${grasps}
</knowledge>

<knowledge name="six_facets">
${sixFacets}
</knowledge>

제약:
- 각 요소마다 후보 2~3개. 후보끼리는 **표현만 바꾼 동어반복이 아니라 실제로 다른 선택지**여야 합니다(다른 역할·청중·상황·산출물 형태 등).
- 모든 후보가 성취기준이 아니라 **Stage 1의 전이 목표·영속적 이해**에서 도출되어야 합니다.
- role·audience는 학생의 실제 수행을 바꾸는 진짜성 있는 것으로. 장식용 역할("당신은 장관입니다")을 금지합니다.
- standards 후보는 이후 루브릭 준거의 씨앗입니다. 겨냥한 이해에 적절한 '이해의 여섯 측면'을 반영하되, performanceProduct·situation에서 역추적 가능한 성공 기준으로 진술합니다.
- 각 후보는 한국어 완전한 문장으로, 교사가 그대로 고르거나 살짝 손봐 쓸 수 있는 수준으로 작성합니다.`;
}

export function buildCandidatesUser(
  input: TeacherInput,
  stage1: Stage1Result,
): string {
  return `교과: ${input.subject || "(미지정)"} / 학년: ${input.grade || "(미지정)"}
${input.context ? `수업 맥락: ${input.context}\n` : ""}
=== 교사가 확정한 Stage 1 ===

${stage1Block(stage1)}

위 이해를 드러내는 GRASPS 수행과제를 위해, 6요소 각각의 후보 문장을 생성하십시오.`;
}

/* ── Pass 2b: 확정된 6요소 → 안내문·루브릭 ──────────────── */

export function buildFinalSystem(
  includeUdlOptions: boolean,
  levels?: AchievementLevels,
): string {
  const labels = levels
    ? levels.system === 3
      ? "A, B, C (3수준)"
      : "A, B, C, D, E (5수준)"
    : null;
  const rubricLevelRule = labels
    ? `- 이 성취기준에는 2022 개정 교육과정 공식 성취수준이 있습니다. 각 준거의 levels는 정확히 이 체계(${labels})를 따르고, label은 "${levels!.system === 3 ? "A/B/C" : "A/B/C/D/E"}"로 답니다. 각 수준 서술어는 아래 <official_levels>의 해당 수준 서술을 이 GRASPS 과제 맥락으로 구체화한 것이어야 합니다(원문 복사가 아니라 과제에 맞춘 재서술, 그러나 성취 눈금은 공식 수준에 맞출 것).`
    : `- 각 준거의 levels는 정확히 4개 수준이며, "잘함/보통" 같은 공허한 등급이 아니라 관찰 가능한 수행 차이로 서술합니다.`;
  return `${SHARED_ROLE}

당신의 임무는 **교사가 요소별로 확정한 GRASPS 6요소**를 입력으로 받아, 그 6요소를 자연스럽게 통합한 학생용 과제 안내문과, Stage 1의 이해에 정렬된 루브릭을 생성하는 것입니다. **6요소 자체는 이미 확정되었으니 바꾸지 마십시오.**

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
${rubricLevelRule}
- 겨냥한 이해에 적절한 '이해의 여섯 측면'(설명·해석·적용·관점·공감·자기지식)을 골라 루브릭 준거로 번역합니다. 모든 측면을 억지로 넣지 않습니다.
- 각 루브릭 준거는 확정된 performanceProduct 또는 situation 진술의 어떤 구절에서 도출되었는지 역추적 가능해야 합니다(W&M 2005 Fig 7.7의 1:1 대응). 과제 진술에 근거가 없는 준거는 만들지 않습니다.
- studentPrompt는 확정된 6요소를 자연스럽게 통합해 학생에게 그대로 제시할 수 있는 안내문으로 작성합니다.
${includeUdlOptions ? "- productOptions에 UDL 기반 산출물 대안 3개를 넣습니다. 모든 옵션은 같은 영속적 이해를 증거로 요구하고 같은 루브릭으로 채점 가능해야 합니다." : "- productOptions는 생략합니다(빈 배열 또는 필드 없음)."}

출력 전에 quality_checklist로 스스로 대조하고, 정렬이 깨진 부분이 있으면 그 부분만 수정한 뒤 최종본을 내십시오.`;
}

const ELEMENT_LABELS: Record<keyof GraspsSelection, string> = {
  goal: "G 목표",
  role: "R 역할",
  audience: "A 청중",
  situation: "S 상황",
  performanceProduct: "P 수행·산출물",
  standards: "S 성공기준",
};

export function buildFinalUser(
  input: TeacherInput,
  stage1: Stage1Result,
  selection: GraspsSelection,
): string {
  const elements = (Object.keys(ELEMENT_LABELS) as (keyof GraspsSelection)[])
    .map((k) => `- ${ELEMENT_LABELS[k]}: ${selection[k]}`)
    .join("\n");

  const lv = input.achievementLevels;
  const officialBlock = lv
    ? `

=== 공식 성취수준 (${lv.system === 3 ? "A~C" : "A~E"}) — 루브릭 눈금의 근거 ===
<official_levels>
A: ${lv.A}
B: ${lv.B}
C: ${lv.C}${lv.system === 5 ? `\nD: ${lv.D}\nE: ${lv.E}` : ""}
</official_levels>`
    : "";

  return `교과: ${input.subject || "(미지정)"} / 학년: ${input.grade || "(미지정)"}
${input.context ? `수업 맥락: ${input.context}\n` : ""}
=== 교사가 확정한 Stage 1 ===

${stage1Block(stage1)}

=== 교사가 확정한 GRASPS 6요소 (그대로 사용) ===

${elements}${officialBlock}

위 6요소를 통합한 학생용 안내문과, 위 이해에 정렬된 루브릭을 생성하십시오.`;
}
