export interface TeacherInput {
  /** 교과명 (예: 통합과학, 생명과학Ⅰ) */
  subject: string;
  /** 학년 (예: 고등학교 1학년) */
  grade: string;
  /** 성취기준 원문 (붙여넣기) */
  standard: string;
  /** 수업 맥락 메모 (선택) — 단원, 학생 특성, 가용 시수 등 */
  context: string;
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

/** Pass 2 산출물 — Stage 2 GRASPS 수행과제 */
export interface GraspsTask {
  goal: string;
  role: string;
  audience: string;
  situation: string;
  product: string;
  standards: string;
  /** 학생에게 그대로 제시할 수 있는 통합 서술형 과제 안내문 */
  studentPrompt: string;
  /** UDL 행동·표현 다양화: P의 복수 옵션 (선택 생성) */
  productOptions?: ProductOption[];
  rubric: RubricCriterion[];
}

export type WizardStep = "input" | "stage1" | "result";
