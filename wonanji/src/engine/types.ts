import type { BoxProto } from "./bogi";
import type { HwpxPackage } from "./pkg";
import type { LossReport } from "./rhwp";

/** 결과 원안지에 적용할 편집 규격. 양식에서 자동으로 채우고 사용자가 고칠 수 있습니다. */
export interface FormatSpec {
  /** 양식 header 안의 기준 글자 모양·문단 모양 ID */
  bodyCharPrId: string;
  bodyParaPrId: string;
  headParaPrId: string;
  essayHeadCharPrId: string | null;
  /** 보여 주기용 글꼴 이름(양식 기준 글자 모양의 한글 글꼴) */
  fontFace: string;
  sizePt: number;
  lineSpacing: number;
  /** 문항 사이 빈 줄 수 */
  gapLines: number;
  columnWidthHU: number;
  /** 선지 들여쓰기(문항 번호와 같은 열에 오지 않도록, 약 1칸) */
  choiceIndentHU: number;
  /** 한 줄에 선지 하나일 때 내어쓰기 폭 */
  hangHU: number;
  choiceLayout: "auto" | "keep";
  negation: "auto" | "off";
  negationStyle: "underline-bold" | "underline";
  normalizeScore: boolean;
  resetSpacing: boolean;
  keepColors: boolean;
  /** 표·글상자 안 글자: 본문과 같이 통일 / 원본 크기·줄간격 유지 */
  cellMode: "normalize" | "keep";
  keepTogether: boolean;
  normalizeEquationSize: boolean;
  /** 머리 표를 가져올 곳: 양식 원본 또는 문항 파일 번호 */
  headerFrom: "template" | number;
  /** 배점을 [3.0점]처럼 소수점 한 자리로(아니면 [3점]) */
  scoreDecimal: boolean;
  /** 배점 표기가 없는 문항의 배점(학력평가·수능은 2점 문항을 표기하지 않음). null이면 표기 누락으로 봅니다. */
  unmarkedScore: number | null;
  /** 문항 번호 뒤, 발문 앞에 둘 공백(번호 모양에 공백이 없는 양식) */
  headLead: string;
  /** 문항 번호를 다는 방식(양식을 따름) */
  numbering: NumberingStyle;
  /** 〈보기〉 상자 폭(양식 예시에서 읽음, 없으면 null → 단 폭에 맞춤) */
  boxWidthHU: number | null;
  /** 표·그림을 단 폭에 맞게 줄이기 */
  fitObjects: boolean;
  /** 어절 단위 줄바꿈(단어 안에서 끊지 않음)과 외톨이줄 보호(문단 첫·끝 줄이 쪽·단 끝에 홀로 남지 않게) */
  wordWrap: boolean;
  /** 고아 줄 줄이기: 마지막 줄에 두세 글자만 남는 문단의 자간을 조금 줄여 앞 줄로 끌어올림 */
  tracking: boolean;
  /** balanced: 단마다 문항을 균등 배치(처음 문항은 위, 마지막 문항은 아래, 사이 간격 고르게), fixed: 문항 사이 빈 줄 고정 */
  layout: "balanced" | "fixed";
  /** template: 모든 〈보기〉 상자를 양식 예시 상자의 틀(격자·여백·이름표·항목 내어쓰기)로 다시 짬, keep: 원본 상자 유지(폭만 맞춤) */
  boxStyle: "template" | "keep";
}

/** 양식의 문항 번호 방식 */
export interface NumberingStyle {
  /** outline: 개요 번호, number: 문단 번호, literal: 글자로 직접 입력 */
  method: "outline" | "number" | "literal";
  /** literal일 때 번호 뒤 글자(예: ". ") */
  suffix: string;
  /** literal일 때 번호 글자 모양(양식 header의 ID) */
  charPrId: string | null;
  /** 화면 표시용 설명 */
  label: string;
}

export type Zone = "head" | "headQ" | "notice" | "sample" | "essayIntro" | "essaySample" | "gap" | "tail";

export interface ExplicitRule {
  key: "font" | "size" | "numberSize" | "lineSpacing" | "negation" | "score" | "paper" | "choiceTab" | "other";
  text: string;
  value?: string;
}

export interface TemplateAnalysis {
  name: string;
  pkg: HwpxPackage;
  bytes: Uint8Array;
  zones: Zone[];
  paraPreview: string[];
  spec: FormatSpec;
  rules: ExplicitRule[];
  /** 규칙 문구와 예시 서식이 다른 곳 */
  conflicts: string[];
  paper: { widthMm: number; heightMm: number; columns: number; name: string };
  numberSizePt: number | null;
  boilerplate: Set<string>;
  notes: string[];
  /** 양식에서 읽은 배치 규격(화면 표시·검수용) */
  layout: TemplateLayout;
  /** 양식 예시 문항의 기호 사용(기호 일관성 검수 기준) */
  symbols: Record<string, Record<string, number>>;
  /** 양식 예시의 〈보기〉 상자 틀(있으면 문항의 상자를 이 틀로 다시 짤 수 있음) */
  boxProto: BoxProto | null;
}

export interface TemplateLayout {
  columnWidthHU: number;
  /** 본문 자간(%)·장평(%) */
  charSpacing: number;
  charRatio: number;
  /** 〈보기〉 상자: 폭, 단 폭 대비 비율, 문단 정렬, 틀로 쓸 수 있는지(이름표 칸·항목 칸이 분명한 표) */
  box: { widthHU: number; ratio: number; align: string; count: number; frame: boolean } | null;
  /** 자료 표: 가장 넓은 폭의 단 폭 대비 비율, 가운데 정렬 비율 */
  table: { maxRatio: number; centered: number; count: number } | null;
  /** 그림: 가장 넓은 폭의 단 폭 대비 비율, 가운데 정렬 비율, 어울림(떠 있음) 개수 */
  figure: { maxRatio: number; centered: number; floating: number; count: number } | null;
  /** 선지: 한 줄 개수별 빈도 */
  choicesPerLine: Record<string, number>;
}

export interface ChoiceInfo {
  count: number;
  ordered: boolean;
  /** 각 선지의 글자(원문자 포함) */
  texts: string[];
  /** 선지가 들어 있는 최상위 문단 위치(질문 문단 배열 기준) */
  paraIdx: number[];
}

export interface Question {
  id: string;
  fileIdx: number;
  fileName: string;
  kind: "mcq" | "essay";
  srcNumber: number | null;
  numberSource: "outline" | "literal" | "essay" | "none";
  paras: Element[];
  /** 번호가 달릴 머리 문단의 위치(앞에 공통 지문·그림 상자 문단이 붙으면 0보다 큼) */
  headIdx: number;
  text: string;
  stem: string;
  score: number | null;
  scoreRaw: string | null;
  answers: number[];
  /** 화면에서 교사가 지정한 정답(있으면 형광펜 대신 이것을 결과에 음영으로 표시) */
  answerOverride?: number[];
  choices: ChoiceInfo | null;
  objects: { tbl: number; pic: number; equation: number; shape: number; other: number };
  summary: string;
}

export interface SourceAnalysis {
  fileIdx: number;
  name: string;
  pkg: HwpxPackage;
  headParas: Element[];
  headText: string;
  questions: Question[];
  placeholders: number[];
  dropped: number;
  highlights: number;
  loss: LossReport;
  notes: string[];
  /** 문항 파일의 단 폭(개체 크기 비율 계산용) */
  columnWidthHU: number;
  /** 문항 머리를 어떻게 알아냈는지(화면 표시용) */
  headStyle: string;
}

export type Severity = "error" | "warn" | "info";

export interface Issue {
  severity: Severity;
  rule: string;
  message: string;
  /** 근거 문서와 위치 */
  source: string;
  questionId?: string;
}

export interface Change {
  questionId: string | null;
  kind: string;
  detail: string;
}
