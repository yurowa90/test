/** 시 형식 — "필름"처럼 골라 끼운다 */
export type PoemForm = "free" | "sijo" | "haiku" | "dongsi";

/** Gemini가 지어 주는 시 */
export interface Poem {
  /** 8자 내외의 짧은 제목 */
  title: string;
  /** 한 원소가 시 한 행. 빈 문자열("")은 연 구분 */
  lines: string[];
}

/** 완성된 결과물 — 시와 찍은 시각 */
export interface PoemResult {
  poem: Poem;
  form: PoemForm;
  takenAt: Date;
}

/** 업로드/촬영한 사진 (리사이즈·JPEG 압축 후) */
export interface CapturedImage {
  /** 화면 미리보기용 data URL */
  dataUrl: string;
  /** Gemini 전송용 base64 (헤더 제거) */
  base64: string;
  mimeType: string;
}

/**
 * 시스템 인쇄 대상.
 * a4 = 일반 프린터(A4 가운데, 절취선 테두리) / 58·80 = 감열 프린터 용지 폭(mm)
 */
export type PrintTarget = "a4" | "58" | "80";
