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
  /** 머리 표를 가져올 곳: 양식 원본 또는 출제 파일 번호 */
  headerFrom: "template" | number;
}

export type Zone = "head" | "notice" | "sample" | "essayIntro" | "essaySample" | "gap" | "tail";

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
  text: string;
  stem: string;
  score: number | null;
  scoreRaw: string | null;
  answers: number[];
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
