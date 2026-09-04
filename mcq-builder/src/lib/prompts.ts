import type {
  AnalysisResult,
  Assembly,
  Scenario,
  Stimulus,
  TeacherInput,
} from "../types";
import { BEHAVIOR_DOMAINS, FORMAT_LABELS, LEVEL_LABELS, STIMULUS_TYPES } from "../types";
import { CIRCLED, pickLabel } from "./assemble";
import { renderItemText } from "./export";
import principles from "../knowledge/item_principles.md?raw";
import structure from "../knowledge/item_structure.md?raw";
import procedure from "../knowledge/item_procedure.md?raw";
import behaviorDomains from "../knowledge/behavior_domains.md?raw";
import bankRules from "../knowledge/item_bank_rules.md?raw";
import reviewChecklist from "../knowledge/review_checklist.md?raw";
import styleRules from "../knowledge/style_rules.md?raw";
import physics from "../knowledge/subject_physics.md?raw";
import chemistry from "../knowledge/subject_chemistry.md?raw";
import biology from "../knowledge/subject_biology.md?raw";
import earth from "../knowledge/subject_earth.md?raw";

/* ── Gemini responseSchema ─────────────────────────────── */

const enumString = (values: readonly string[]) => ({
  type: "string",
  format: "enum",
  enum: [...values],
});

const stringArray = (min?: number, max?: number) => ({
  type: "array",
  items: { type: "string" },
  ...(min !== undefined ? { minItems: min } : {}),
  ...(max !== undefined ? { maxItems: max } : {}),
});

export const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    contentElements: stringArray(2, 6),
    assessmentElement: { type: "string" },
    assessmentGoal: { type: "string" },
    behaviorDomain: enumString(BEHAVIOR_DOMAINS),
    behaviorRationale: { type: "string" },
    scenarios: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          stimulusType: enumString(STIMULUS_TYPES),
          description: { type: "string" },
          cues: stringArray(2, 6),
          inquiryContext: enumString(["순수과학", "실생활"]),
        },
        required: ["title", "stimulusType", "description", "cues", "inquiryContext"],
        propertyOrdering: ["title", "stimulusType", "description", "cues", "inquiryContext"],
      },
    },
  },
  required: [
    "contentElements",
    "assessmentElement",
    "assessmentGoal",
    "behaviorDomain",
    "behaviorRationale",
    "scenarios",
  ],
  propertyOrdering: [
    "contentElements",
    "assessmentElement",
    "assessmentGoal",
    "behaviorDomain",
    "behaviorRationale",
    "scenarios",
  ],
};

export const BANK_SCHEMA = {
  type: "object",
  properties: {
    stimulus: {
      type: "object",
      properties: {
        indirectStem: { type: "string" },
        body: { type: "string" },
        figureSpec: { type: "string" },
        conditions: stringArray(0, 4),
        stemPrefix: { type: "string" },
        complexity: { type: "integer" },
      },
      required: ["indirectStem", "body", "figureSpec", "conditions", "stemPrefix", "complexity"],
      propertyOrdering: ["indirectStem", "body", "figureSpec", "conditions", "stemPrefix", "complexity"],
    },
    propositions: {
      type: "array",
      minItems: 10,
      maxItems: 18,
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          isTrue: { type: "boolean" },
          level: enumString(LEVEL_LABELS),
          behavior: enumString(BEHAVIOR_DOMAINS),
          explanation: { type: "string" },
        },
        required: ["text", "isTrue", "level", "behavior", "explanation"],
        propertyOrdering: ["text", "isTrue", "level", "behavior", "explanation"],
      },
    },
  },
  required: ["stimulus", "propositions"],
  propertyOrdering: ["stimulus", "propositions"],
};

export const FINAL_SCHEMA = {
  type: "object",
  properties: {
    indirectStem: { type: "string" },
    body: { type: "string" },
    figureSpec: { type: "string" },
    conditions: stringArray(0, 4),
    statements: stringArray(3, 5),
    explanations: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          verdict: { type: "string" },
          text: { type: "string" },
        },
        required: ["label", "verdict", "text"],
        propertyOrdering: ["label", "verdict", "text"],
      },
    },
    solution: { type: "string" },
    info: {
      type: "object",
      properties: {
        subject: { type: "string" },
        contentArea: { type: "string" },
        contentElement: { type: "string" },
        behaviorDomain: { type: "string" },
        standardCode: { type: "string" },
        assessmentElement: { type: "string" },
        assessmentGoal: { type: "string" },
        inquiryContext: { type: "string" },
        difficultyTier: { type: "string" },
        answer: { type: "string" },
        intent: { type: "string" },
      },
      required: [
        "subject",
        "contentArea",
        "contentElement",
        "behaviorDomain",
        "standardCode",
        "assessmentElement",
        "assessmentGoal",
        "inquiryContext",
        "difficultyTier",
        "answer",
        "intent",
      ],
      propertyOrdering: [
        "subject",
        "contentArea",
        "contentElement",
        "behaviorDomain",
        "standardCode",
        "assessmentElement",
        "assessmentGoal",
        "inquiryContext",
        "difficultyTier",
        "answer",
        "intent",
      ],
    },
    review: {
      type: "array",
      minItems: 8,
      maxItems: 16,
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          pass: { type: "boolean" },
          note: { type: "string" },
        },
        required: ["item", "pass", "note"],
        propertyOrdering: ["item", "pass", "note"],
      },
    },
  },
  required: [
    "indirectStem",
    "body",
    "figureSpec",
    "conditions",
    "statements",
    "explanations",
    "solution",
    "info",
    "review",
  ],
  propertyOrdering: [
    "indirectStem",
    "body",
    "figureSpec",
    "conditions",
    "statements",
    "explanations",
    "solution",
    "info",
    "review",
  ],
};

/* ── 공통 역할·지식 선택 ─────────────────────────────── */

const SHARED_ROLE = `당신은 시·도교육청 전국연합학력평가 과학탐구 영역의 출제·검토 위원 수준의 평가 전문가입니다. 경기도교육청 『2024 평가문항 제작 방법』의 출제 지침을 근거로, 2022 개정 교육과정 과학과 성취기준에 맞는 선다형 문항을 만듭니다. 모든 출력은 한국어(표준어·한글 맞춤법 준수)로, 현직 교사가 그대로 시험지에 옮길 수 있는 수준으로 작성합니다. 교과서 밖 지식, 시사·논쟁 소재, 특정 집단에 대한 편견을 담지 않습니다. 반드시 지정된 JSON 스키마에 맞춰 응답합니다.`;

const SUBJECT_KEYWORDS: { text: string; words: string[] }[] = [
  {
    text: physics,
    words: ["물리", "역학", "힘", "운동", "에너지", "전기", "자기", "전자기", "파동", "빛", "열", "양자", "우주와 물질", "시공간"],
  },
  {
    text: chemistry,
    words: ["화학", "물질", "원소", "원자", "이온", "결합", "반응", "산", "염기", "산화", "환원", "몰", "용액", "주기율"],
  },
  {
    text: biology,
    words: ["생명", "세포", "유전", "생물", "진화", "생태", "광합성", "호흡", "항상성", "DNA", "단백질", "효소", "물질대사", "생식"],
  },
  {
    text: earth,
    words: ["지구", "행성", "우주", "기후", "대기", "해양", "암석", "지질", "판", "별", "은하", "태양계", "지권", "천체"],
  },
];

/** 교과·영역·성취기준 문구의 키워드로 과목별 지식 파일을 고른다 (통합과학은 관련 영역 전부) */
export function subjectKnowledge(input: TeacherInput): string {
  const hay = `${input.subject} ${input.domain ?? ""} ${input.standard}`;
  const scored = SUBJECT_KEYWORDS.map((k) => ({
    text: k.text,
    score: k.words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0),
  }));
  const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  const chosen = hits.length ? hits.slice(0, 2) : scored;
  return chosen.map((s) => s.text).join("\n\n---\n\n");
}

function optionsBlock(input: TeacherInput): string {
  const o = input.options;
  const behavior = o.behavior === "auto" ? "자동(성취기준에 가장 맞는 영역 선택)" : o.behavior;
  const stimulus = o.stimulusHint === "auto" ? "자동" : o.stimulusHint;
  return `문항 유형: ${FORMAT_LABELS[o.format]}${o.format === "hapdab" ? ` (〈보기〉 ${o.bogiCount}항)` : ""}
행동 영역: ${behavior}
목표 난이도: ${o.difficulty}
탐구 상황: ${o.inquiryContext}
선호 자료 형태: ${stimulus}`;
}

function levelsBlock(input: TeacherInput): string {
  const lv = input.achievementLevels;
  if (!lv) return "";
  const rows = [`A: ${lv.A}`, `B: ${lv.B}`, `C: ${lv.C}`];
  if (lv.system === 5) rows.push(`D: ${lv.D}`, `E: ${lv.E}`);
  return `\n<official_levels system="${lv.system === 3 ? "A~C" : "A~E"}">\n${rows.join("\n")}\n</official_levels>`;
}

function standardBlock(input: TeacherInput): string {
  return `교과: ${input.subject || "(미지정)"} / 학년: ${input.grade || "(미지정)"}${input.domain ? ` / 영역: ${input.domain}` : ""}
성취기준${input.standardCode ? ` [${input.standardCode}]` : ""}:
${input.standard.trim()}${levelsBlock(input)}${input.context ? `\n\n출제 맥락 메모:\n${input.context}` : ""}`;
}

/* ── Pass 1: 교육과정 분석 → 평가 요소·문제 장면 ───────── */

export function buildAnalysisSystem(input: TeacherInput): string {
  return `${SHARED_ROLE}

당신의 임무는 문항 제작 절차의 앞 세 단계 — **교육과정 분석 → 평가 요소 선정 → 문제 장면 설정** — 를 수행하는 것입니다. 아직 문항(발문·자료·〈보기〉·선택지)을 만들지 마십시오. 교사가 이 결과를 검토·확정한 뒤 다음 단계에서 만듭니다.

<knowledge name="principles">
${principles}
</knowledge>

<knowledge name="procedure">
${procedure}
</knowledge>

<knowledge name="behavior_domains">
${behaviorDomains}
</knowledge>

<knowledge name="subject">
${subjectKnowledge(input)}
</knowledge>

제약:
- contentElements: 성취기준의 핵심 동사와 내용 요소를 분석해 **필수 학습 요소** 2~6개를 뽑습니다. 교과서에 있어도 교육과정 내용 요소와 무관한 것은 넣지 않습니다.
- assessmentElement: **평가 요소는 정확히 하나**입니다(한 문항이 묻는 평가 요소는 하나, 발문 작성 원리 ⑤). 세목화한 요소 중 하위 요소를 포섭하는 상위 요소, 교육과정에서 중요하게 다뤄지는 요소를 고릅니다.
- assessmentGoal: "~을/를 알고 ~을/를 파악(해석·추론·설계)할 수 있는지를 평가한다." 형식의 한 문장.
- behaviorDomain: 옵션이 '자동'이면 성취기준의 수행 동사와 내용에 가장 맞는 행동 영역을 고르고, 지정되어 있으면 그 영역을 씁니다. behaviorRationale에 근거를 1~2문장으로.
- scenarios: 서로 **자료 형태가 다른** 문제 장면 2~3개. 각 장면은 교육과정 범위 안의 자료, 학생이 학습한 장면에서 추론 가능한 자료여야 하며, description에는 '문제 상황 설정'과 '자료 제시 계획'을, cues에는 자료가 반드시 담아야 할 단서(기호 체계 포함: (가)(나), A·B·C, ㉠㉡, 조건 값)를 적습니다. 선호 자료 형태가 지정되어 있으면 첫 장면은 그 형태로.
- 탐구 상황 옵션(순수과학/실생활)을 장면에 반영합니다. 실생활이면 실제 맥락에서 개념을 쓰는 장면으로.
- 공식 성취수준이 있으면 목표 난이도에 맞는 수준의 수행 동사·범위를 평가 목표에 반영합니다(상=A·B 수준, 중=B·C 수준, 하=C·D 수준).
- 평가 요소가 '몸'이면 문제 장면은 '옷'입니다. 장면이 비합리적이면 평가 효과가 반감되므로, 평가 요소가 가장 잘 드러나는 장면을 제안합니다.`;
}

export function buildAnalysisUser(input: TeacherInput): string {
  return `아래 성취기준을 분석해 필수 학습 요소, 평가 요소 1개, 평가 목표, 행동 영역, 문제 장면 후보를 생성하십시오.

${standardBlock(input)}

=== 문항 옵션 ===
${optionsBlock(input)}`;
}

/* ── Pass 2a: 자료 + 명제 풀 ───────────────────────── */

const POOL_EACH = 7;

function analysisBlock(analysis: AnalysisResult, scenario: Scenario): string {
  return `필수 학습 요소:
${analysis.contentElements.map((e) => `  - ${e}`).join("\n")}
평가 요소: ${analysis.assessmentElement}
평가 목표: ${analysis.assessmentGoal}
행동 영역: ${analysis.behaviorDomain} (${analysis.behaviorRationale})

=== 교사가 확정한 문제 장면 ===
제목: ${scenario.title}
자료 형태: ${scenario.stimulusType} / 탐구 상황: ${scenario.inquiryContext}
${scenario.description}
자료에 반드시 담을 단서:
${scenario.cues.map((c) => `  - ${c}`).join("\n")}`;
}

export function buildBankSystem(input: TeacherInput, analysis: AnalysisResult): string {
  const format = input.options.format;
  const isHapdab = format === "hapdab";
  return `${SHARED_ROLE}

당신의 임무는 교사가 확정한 **평가 요소와 문제 장면**을 구현하는 **자료(stimulus) 1개**와, 그 자료로부터 판단되는 **참 명제 ${POOL_EACH}개 + 매력적 오답(거짓) 명제 ${POOL_EACH}개**의 풀을 만드는 것입니다. 완성 문항이 아니라 교사가 ${isHapdab ? "ㄱ, ㄴ, ㄷ를 골라 조합하는" : "①~⑤ 선택지를 골라 배열하는"} 원자재입니다. 발문 꼬리·선택지 배열·정답은 앱이 규칙으로 정하므로 만들지 마십시오.

<knowledge name="structure">
${structure}
</knowledge>

<knowledge name="bank_rules">
${bankRules}
</knowledge>

<knowledge name="behavior_domains">
${behaviorDomains}
</knowledge>

<knowledge name="subject">
${subjectKnowledge(input)}
</knowledge>

자료 제약:
- indirectStem: 자료의 사전 정보를 주는 간접 발문. "그림은 ~를 나타낸 것이다." / "표는 ~을 나타낸 것이다." / "다음은 ~에 대한 실험이다." / "다음은 ~에 대한 학생 A~C의 대화이다." 형식. 그림·표·그래프를 '다음'으로 지칭하지 않습니다.
- body: 자료 본문. 표는 Markdown 표(| 구분 | … |, 공통 단위는 열 제목에 괄호)로, 실험은 "[실험 과정]" 아래 (가)(나)(다) 문장과 "[실험 결과]" 표로, 제시문·대화는 문장으로, 그림·그래프는 "〈그림〉" 아래에 학생이 보게 될 내용을 문장으로 정확히 묘사합니다. 조건 나열은 불릿 ◦. 기호는 (가)(나) / A, B, C / ㉠㉡ / Ⅰ, Ⅱ 중 네 가지 유형을 넘지 않게. 정량 자료는 값이 서로 모순되지 않게 검산합니다.
- figureSpec: 그림·그래프가 있으면 제작 지시(축 제목·단위·틱·상댓값 표기·실선/점선·표시할 기호). 없으면 빈 문자열.
- conditions: "(단, …)"에 들어갈 단서 조항. 정답 확정에 필요한 것만, 각 항목은 "~한다." 문장. 정답을 찾는 데 이용될 단서는 금지.
- stemPrefix: 직접 발문의 앞부분. "이에 대한 설명으로", "물체의 운동에 대한 설명으로", "이 자료에 대한 설명으로"처럼 **'설명으로'로 끝나야** 합니다(뒤에 "옳은 것만을 …"이 이어짐). '위 자료'는 쓰지 않습니다.
- complexity: 0(자료 1개, 정성), 1(표·그래프 1개 또는 간단한 정량), 2(자료 2개 이상 또는 복합 정량 해석).

명제 제약:
- 총 ${POOL_EACH * 2}개: 참 ${POOL_EACH}개, 거짓 ${POOL_EACH}개. isTrue를 정확히 표시합니다.
- 각 명제는 **자료에서 독립적으로 참/거짓 판정**이 가능해야 하며, 하나를 알면 다른 하나가 자동으로 결정되는 쌍은 금지합니다. 문장 끝은 "~이다." / "~한다." / "~크다."처럼 단정형, 길이는 15~45자로 비슷하게, 병렬 구조를 유지합니다. ㄱ. 같은 기호는 붙이지 않습니다.
- 거짓 명제는 빈출 오개념에 기반한 매력적 오답이어야 합니다. 관점에 따라 참이 될 여지가 있는 거짓, 예외 상황에서 뒤집히는 참, '언제나·항상·반드시·모두·~만' 같은 단서 어휘, 이중 부정은 금지합니다.
- 비교 명제는 "~는 A에서가 B에서보다 크다."처럼 대상과 방향을 고정합니다.
- level: 판별점 기준 성취수준(A=최상위만 판단 가능 … E=최하위도 판단 가능). 풀 전체가 A~E에 고루 분포하도록 합니다. 공식 성취수준이 있으면 그 수행 동사·범위를 기준으로 라벨을 정합니다.
- behavior: 확정된 행동 영역(${analysis.behaviorDomain})의 명제를 절반 이상 포함하되, 이해·적용 명제도 섞어 조합의 자유도를 높입니다.
- explanation: 참은 자료 근거(정량이면 계산 경로), 거짓은 "오개념: … / 교정: …" 형식.
${isHapdab ? "" : `- ${format === "jeongdap" ? "정답형" : "부정형"} 선택지로 쓰이므로 명제 다섯 개가 나란히 놓였을 때 문법 구조·길이가 동질적이어야 합니다.`}`;
}

export function buildBankUser(
  input: TeacherInput,
  analysis: AnalysisResult,
  scenario: Scenario,
): string {
  return `${standardBlock(input)}

=== 교사가 확정한 분석 ===
${analysisBlock(analysis, scenario)}

=== 문항 옵션 ===
${optionsBlock(input)}

위 문제 장면을 구현하는 자료 1개와 참 ${POOL_EACH}개·거짓 ${POOL_EACH}개의 명제 풀을 생성하십시오.`;
}

/* ── Pass 2b: 윤문·해설·문항정보표·검토 ───────────────── */

export function buildFinalSystem(): string {
  return `${SHARED_ROLE}

당신의 임무는 앱이 확정한 문항 골격(자료, ${"〈보기〉"} 또는 선택지 진술, 발문 꼬리, 선택지 배열, 정답)을 받아 **문항 검토(컨설팅) → 최종 문항 완성** 단계를 수행하는 것입니다: 윤문, 정답·해설 작성, 문항정보표 작성, 검토 체크리스트 자기 대조.

<knowledge name="structure">
${structure}
</knowledge>

<knowledge name="review_checklist">
${reviewChecklist}
</knowledge>

<knowledge name="style_rules">
${styleRules}
</knowledge>

절대 제약:
- 앱이 확정한 **발문 꼬리, 선택지 배열(①~⑤), 정답 번호는 변경 금지**입니다. 출력 JSON에 넣지도 않습니다.
- statements: 주어진 진술을 **같은 순서·같은 개수**로 돌려주되 진위를 바꾸지 않고 윤문만 합니다(길이 균형, 병렬 구조, 비교 대상·방향 명확화, 표기 규범). 기호(ㄱ. / ①)는 붙이지 않습니다.
- indirectStem, body, figureSpec, conditions: 과학적 내용을 바꾸지 않고 윤문합니다(정보가 많은 문장은 배경과 행위로 분리, 인과 어휘, 중복 삭제, 주술 호응, 기호 일관성, 띄어쓰기). 자료에 과학적 오류가 있으면 고치되 review의 note에 무엇을 고쳤는지 적습니다.
- explanations: 진술 순서대로 label(합답형은 ㄱ, ㄴ, ㄷ / 그 외 ①~⑤), verdict("참"/"거짓"), text(근거; 거짓은 오개념과 교정, 정량이면 계산 경로).
- solution: 정답에 이르는 종합 풀이 2~5문장.
- info: 문항정보표. subject(교과·과목), contentArea(영역), contentElement(내용 요소), behaviorDomain, standardCode(성취기준 코드, 없으면 "-"), assessmentElement, assessmentGoal, inquiryContext, difficultyTier(앱의 7등급 추천값 그대로), answer(①~⑤), intent(출제 의도·주안점 1~2문장).
- review: review_checklist의 관점(출제 전반·발문·답지·정답지·오답지)에서 핵심 8~16개 항목을 골라 순회하며 pass 여부를 판정합니다. pass가 false면 해당 부분을 고친 뒤 note에 무엇을 고쳤는지, 고칠 수 없는 것(발문 꼬리·배열·정답)이면 교사에게 알릴 내용을 적습니다. 특히 "정답은 한 개뿐이고 누가 보아도 옳은가", "자료를 읽지 않고도 풀리지 않는가", "교육과정 범위 안인가", "정답의 단서가 발문·답지에 없는가"는 반드시 포함합니다.`;
}

export function buildFinalUser(
  input: TeacherInput,
  analysis: AnalysisResult,
  scenario: Scenario,
  stimulus: Stimulus,
  assembly: Assembly,
): string {
  const statements = assembly.picks.map((p) => p.text);
  const rendered = renderItemText(stimulus, assembly, statements, stimulus);
  const truth = assembly.picks
    .map((p, i) => `${pickLabel(assembly.format, i)}: ${p.isTrue ? "참" : "거짓"} / 수준 ${p.level} / ${p.behavior} — ${p.explanation}`)
    .join("\n");
  const answer = assembly.answerIndex >= 0 ? CIRCLED[assembly.answerIndex] : "(미정)";
  const d = assembly.difficulty;
  return `${standardBlock(input)}

=== 확정된 분석 ===
${analysisBlock(analysis, scenario)}

=== 앱이 확정한 문항 골격 (발문 꼬리·선택지 배열·정답은 변경 금지) ===
${rendered}

정답: ${answer}
발문 분기 근거: ${assembly.uniform ? "선택지 항목 수 균일" : "선택지 항목 수 상이"}
난이도 추천(7등급): ${d.tier} (점수 ${d.score.toFixed(2)} = 명제 평균 ${d.base.toFixed(2)} + 정답 구조 ${d.answerWeight.toFixed(2)} + 맥락 ${d.contextWeight.toFixed(2)})
${assembly.warnings.length ? `앱 경고: ${assembly.warnings.join(" / ")}` : ""}

=== 각 진술의 진위·근거 (해설 작성용) ===
${truth}

문항 유형: ${FORMAT_LABELS[assembly.format]}

위 골격을 윤문하고 해설·문항정보표·검토 체크리스트를 작성하십시오.`;
}
