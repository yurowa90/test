// 글자 인식 엔진(Tesseract)과 그림 읽기·쓰기는 브라우저·Node가 달라 주입받습니다.
import type { Gray, RGBA, Rect } from "./raster";

export interface OcrSymbol {
  text: string;
  conf: number;
  bbox: Rect;
}

export interface OcrWord {
  text: string;
  conf: number;
  bbox: Rect;
  symbols: OcrSymbol[];
}

export interface OcrLine {
  bbox: Rect;
  baseline: Rect;
  words: OcrWord[];
}

export type OcrLang = "kor" | "eng" | "kor+eng";

export interface OcrDeps {
  /** PNG·JPEG·WebP → 픽셀 */
  decode(bytes: Uint8Array): Promise<RGBA>;
  /** 회색조 이미지에서 글자 인식(psm: Tesseract 쪽 나누기 방식, rect: 이 영역만) */
  recognize(img: Gray, lang: OcrLang, psm: "3" | "4" | "6" | "7" | "11", rect?: Rect): Promise<OcrLine[]>;
  encodePng(img: RGBA): Promise<Uint8Array>;
  /** 작업이 끝나면 인식 엔진을 내려 메모리를 돌려줍니다. */
  release?(): Promise<void>;
}

let deps: (() => Promise<OcrDeps>) | null = null;
let loaded: Promise<OcrDeps> | null = null;

export function setOcrDeps(fn: () => Promise<OcrDeps>) {
  deps = fn;
  loaded = null;
}

export function getOcrDeps(): Promise<OcrDeps> {
  if (!deps) throw new Error("글자 인식 모듈이 준비되지 않았습니다.");
  if (!loaded) loaded = deps();
  return loaded;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** tesseract.js 결과(blocks) → 글줄 목록 */
export function tesseractLines(data: any): OcrLine[] {
  const out: OcrLine[] = [];
  for (const b of data?.blocks ?? []) {
    for (const p of b.paragraphs ?? []) {
      for (const l of p.lines ?? []) {
        out.push({
          bbox: l.bbox,
          baseline: l.baseline,
          words: (l.words ?? []).map((w: any) => ({
            text: w.text,
            conf: w.confidence,
            bbox: w.bbox,
            symbols: (w.symbols ?? []).map((s: any) => ({ text: s.text, conf: s.confidence, bbox: s.bbox })),
          })),
        });
      }
    }
  }
  return out;
}
