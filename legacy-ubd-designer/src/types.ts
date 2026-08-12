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
  /** 학교급: 초등학교 / 중학교 / 고등학교 */
  level: string;
  /** 과목유형: 공통 / 일반선택 / 진로선택 / 융합선택 */
  type: string;
  /** 과목명 (예: 통합과학1, 생명과학) */
  subject: string;
  /** 영역 */
  domain: string;
  /** 성취기준 코드 (예: 10통과1-01-01) */
  code: string;
  /** 성취기준 원문 */
  text: string;
  /** 성취수준 A~E (없을 수 있음 — 초등 등) */
  levels?: AchievementLevels;
}

export interface TeacherInput {
  /** 교과명 (예: 통합과학, 생명과학) */
  subject: string;
  /** 학년/학교급 */
  grade: string;
  /** 성취기준 원문 (선택 또는 직접 입력) */
  standard: string;
  /** 수업 맥락 메모 (선택) — 수업 목표·핵심 활동, 단원, 가용 시수 등 */
  context: string;
  /** 공식 성취기준에서 고른 경우의 코드 */
  standardCode?: string;
  /** 공식 성취기준의 A~E 성취수준 (있으면 루브릭을 이 체계에 정렬) */
  achievementLevels?: AchievementLevels;
}

/** Pass 1 산출물 — 백워드 설계 Stage 1 요소 */
export interface Stage1Result {
  /** 전이 목표 1개: 학생이 배운 것을 새로운 맥락에 자율적으로 적용하는 장기 목표 */
  transferGoal: string;
  /** 영속적 이해 2개: 단원 종료 후에도 남아야 할 핵심 일반화 (문장형) */
  understandings: string[];
  /** 본질적 질문 2개: 탐구를 여는 개방형 질문 */
  essentialQuestions: string[];
}

/** 루브릭 준거 하나 — Stage 1 이해와 1:1 대응 */
export interface RubricCriterion {
  /** 평가 준거 이름 */
  criterion: string;
  /** 이 준거가 대응하는 영속적 이해의 인덱스 (understandings 배열 기준) */
  alignedUnderstandingIndex: number;
  /** 4개 성취수준 서술어 (상위→하위) */
  levels: { label: string; descriptor: string }[];
}

/** UDL 기반 산출물 대안 하나 */
export interface ProductOption {
  /** 산출물 형태 (예: 인포그래픽, 발표 영상, 실물 모형) */
  format: string;
  /** 이 형태가 지원하는 표현 수단 및 대상 학생 */
  rationale: string;
}

/**
 * Pass 2 산출물 — Stage 2 GRASPS 수행과제.
 * 원문(W&M 2005 제7장) 표기 주의:
 *  - P는 Product/Performance/Purpose로 혼용된다 → 내부 키를 performanceProduct
 *    하나로 통일하고 UI 라벨만 "수행·산출물"로 병기한다.
 *  - S는 Situation과 Standards 두 곳에 쓰이므로 필드를 분리해 둔다.
 */
export interface GraspsTask {
  goal: string;
  role: string;
  audience: string;
  situation: string;
  /** P — Product/Performance/Purpose (수행·산출물) */
  performanceProduct: string;
  standards: string;
  /** 학생에게 그대로 제시할 수 있는 통합 서술형 과제 안내문 */
  studentPrompt: string;
  /** UDL 행동·표현 다양화: P의 복수 옵션 (선택 생성) */
  productOptions?: ProductOption[];
  rubric: RubricCriterion[];
}

/** GRASPS 6요소 키 (P/S 표기 통일 기준) */
export type GraspsElementKey =
  | "goal"
  | "role"
  | "audience"
  | "situation"
  | "performanceProduct"
  | "standards";

/**
 * Pass 2a 산출물 — 요소별 후보 문장(각 2~3개).
 * 원문 Figure 7.7이 요소마다 복수의 문장 틀을 제공하는 설계를 반영한다
 * (W&M 2005 §3): 생성기가 후보를 내고 교사가 하나를 고른다.
 */
export type GraspsCandidates = Record<GraspsElementKey, string[]>;

/** 교사가 요소별로 확정한 6요소 */
export type GraspsSelection = Record<GraspsElementKey, string>;

/** Pass 2b 산출물 — 확정된 6요소에 정렬된 안내문·루브릭 */
export interface GraspsFinal {
  /** 학생에게 그대로 제시할 수 있는 통합 서술형 과제 안내문 */
  studentPrompt: string;
  /** UDL 행동·표현 다양화: P의 복수 옵션 (선택 생성) */
  productOptions?: ProductOption[];
  rubric: RubricCriterion[];
}

export type WizardStep = "input" | "stage1" | "candidates" | "result";
