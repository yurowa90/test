/** 2022 개정 과학과 성취수준 (5수준 A~E 또는 3수준 A~C) */
export interface AchievementLevels {
  /** 5 = A~E, 3 = A~C(과학탐구실험 등 수행 중심 과목) */
  system: 3 | 5;
  A: string;
  B: string;
  C: string;
  D: string;
  E: string;
}

/** 공식 과학 성취기준 한 건 (science_standards.json) */
export interface ScienceStandard {
  level: string;
  type: string;
  subject: string;
  domain: string;
  code: string;
  text: string;
  levels?: AchievementLevels;
}

/** 과학과 행동 영역 6개 (경기도교육청 2024, Ⅲ장 '나. 행동 영역') */
export const BEHAVIOR_DOMAINS = [
  "이해",
  "적용",
  "문제 인식 및 가설 설정",
  "탐구 설계 및 수행",
  "자료 분석 및 해석",
  "결론 도출 및 평가",
] as const;
export type BehaviorDomain = (typeof BEHAVIOR_DOMAINS)[number];

/** 문항 유형 (Ⅰ장 '3. 평가 문항의 유형') — 합답형·정답형·부정형 */
export type ItemFormat = "hapdab" | "jeongdap" | "bujeong";
export const FORMAT_LABELS: Record<ItemFormat, string> = {
  hapdab: "합답형",
  jeongdap: "정답형",
  bujeong: "부정형",
};

export type InquiryContext = "순수과학" | "실생활";
export type TargetDifficulty = "상" | "중" | "하";

export const STIMULUS_TYPES = ["그림", "그래프", "표", "실험", "제시문", "대화"] as const;
export type StimulusType = (typeof STIMULUS_TYPES)[number];

/** 성취수준 라벨 = 판별점 기준 (그 명제를 옳게 판단하는 데 필요한 최소 수준) */
export const LEVEL_LABELS = ["A", "B", "C", "D", "E"] as const;
export type LevelLabel = (typeof LEVEL_LABELS)[number];

export interface ItemOptions {
  format: ItemFormat;
  /** 합답형 〈보기〉 항목 수 */
  bogiCount: 3 | 4;
  behavior: BehaviorDomain | "auto";
  difficulty: TargetDifficulty;
  inquiryContext: InquiryContext;
  stimulusHint: StimulusType | "auto";
}

export interface TeacherInput {
  subject: string;
  grade: string;
  standard: string;
  /** 수업·출제 맥락 메모 (선택) */
  context: string;
  standardCode?: string;
  domain?: string;
  achievementLevels?: AchievementLevels;
  options: ItemOptions;
}

/* ── Pass 1: 교육과정 분석 → 평가 요소·평가 목표·문제 장면 후보 ── */

export interface Scenario {
  title: string;
  stimulusType: StimulusType;
  /** 문제 상황 설정 + 자료 제시 계획 */
  description: string;
  /** 자료가 반드시 담아야 할 단서 */
  cues: string[];
  inquiryContext: InquiryContext;
}

export interface AnalysisResult {
  /** 필수 학습 요소 (교육과정 내용 요소) */
  contentElements: string[];
  /** 평가 요소 — 한 문항에 반드시 하나 */
  assessmentElement: string;
  /** 평가 목표 — "~할 수 있는지를 평가한다." */
  assessmentGoal: string;
  behaviorDomain: BehaviorDomain;
  behaviorRationale: string;
  scenarios: Scenario[];
}

/* ── Pass 2a: 자료 + 참·거짓 명제 풀 ── */

export interface Stimulus {
  /** 간접 발문: "그림은 ~를 나타낸 것이다." */
  indirectStem: string;
  /** 자료 본문 (표는 Markdown 표, 실험은 (가)(나)(다) 과정, 그림·그래프는 묘사) */
  body: string;
  /** 그림·그래프 제작 지시 (출제자용) */
  figureSpec: string;
  /** 단서 조항 — "(단, …)" 안에 들어갈 문장들 */
  conditions: string[];
  /** 직접 발문 앞부분: "이에 대한 설명으로" */
  stemPrefix: string;
  /** 자료 복잡도 0 단순 / 1 보통 / 2 복잡 */
  complexity: 0 | 1 | 2;
}

export interface Proposition {
  id: string;
  text: string;
  isTrue: boolean;
  level: LevelLabel;
  behavior: BehaviorDomain;
  /** 참: 판단 근거 / 거짓: 오개념 + 교정 */
  explanation: string;
}

export interface ItemBank {
  stimulus: Stimulus;
  propositions: Proposition[];
}

/* ── 앱이 결정론적으로 계산하는 조립 결과 ── */

export interface DifficultyEstimate {
  /** 7등급: D, C, C+, B, B+, A, A+ */
  tier: string;
  score: number;
  base: number;
  answerWeight: number;
  contextWeight: number;
}

export interface AssemblyContext {
  dataComplexity: 0 | 1 | 2;
  fusion: boolean;
}

export interface Assembly {
  format: ItemFormat;
  /** 합답형: ㄱ, ㄴ, ㄷ(, ㄹ) 순 / 정답형·부정형: ①~⑤ 순 */
  picks: Proposition[];
  /** 선택지 항목 수가 모두 같은가 (발문 분기 근거) */
  uniform: boolean;
  /** 직접 발문 꼬리 — 앱이 확정 */
  directStem: string;
  /** 합답형에서 가능한 표준 배열 목록 */
  arrayOptions: string[][][];
  arrayIndex: number;
  /** ①~⑤에 표시할 문자열 */
  choices: string[];
  /** 0-based, -1이면 정답 없음 */
  answerIndex: number;
  warnings: string[];
  difficulty: DifficultyEstimate;
  /** 난이도 맥락(자료 복잡도·융합) — 되돌아왔을 때 복원용 */
  context: AssemblyContext;
}

/* ── Pass 2b: 윤문·해설·문항정보표·검토 ── */

export interface Explanation {
  label: string;
  verdict: string;
  text: string;
}

export interface ItemInfo {
  subject: string;
  contentArea: string;
  contentElement: string;
  behaviorDomain: string;
  standardCode: string;
  assessmentElement: string;
  assessmentGoal: string;
  inquiryContext: string;
  difficultyTier: string;
  answer: string;
  intent: string;
}

export interface ReviewCheck {
  item: string;
  pass: boolean;
  note: string;
}

export interface FinalItem {
  indirectStem: string;
  body: string;
  figureSpec: string;
  conditions: string[];
  /** 윤문된 〈보기〉(합답형) 또는 선택지 진술(정답형·부정형) — 순서·진위 불변 */
  statements: string[];
  explanations: Explanation[];
  solution: string;
  info: ItemInfo;
  review: ReviewCheck[];
}

export type WizardStep = "input" | "analysis" | "bank" | "result";
