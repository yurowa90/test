// PDF 출제 파일 → HWPX 출제 파일(문항 분할·서식 통일은 HWP와 같은 흐름).
// pdf.js 불러오기와 쪽 그리기(그림 자르기)는 브라우저·Node가 달라 주입받습니다.
import { extractPage, type PdfPageData } from "./extract";
import { analyzePdf } from "./layout";
import type { Box } from "./lines";
import { synthesizeHwpx, type CropResult } from "./synth";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PdfDeps {
  /** pdf.js 문서 열기 */
  open(bytes: Uint8Array): Promise<{ numPages: number; getPage(n: number): Promise<any>; destroy?(): Promise<void> }>;
  OPS: Record<string, number>;
  /** 쪽을 scale배로 그린 뒤 영역(px)을 PNG로 */
  cropPng(page: any, scale: number, px: { x: number; y: number; w: number; h: number }): Promise<Uint8Array>;
}

let deps: (() => Promise<PdfDeps>) | null = null;
let loaded: Promise<PdfDeps> | null = null;

export function setPdfDeps(fn: () => Promise<PdfDeps>) {
  deps = fn;
  loaded = null;
}

function getDeps(): Promise<PdfDeps> {
  if (!deps) throw new Error("PDF 읽기 모듈이 준비되지 않았습니다.");
  if (!loaded) loaded = deps();
  return loaded;
}

/** 그림을 자를 때 해상도: 300 dpi 가까이(인쇄용) */
const CROP_SCALE = 4;

export interface PdfLoad {
  hwpx: Uint8Array;
  numbers: number[];
  notes: string[];
  columnWidthHU: number;
  pages: number;
}

export async function pdfToHwpx(bytes: Uint8Array): Promise<PdfLoad> {
  const d = await getDeps();
  const doc = await d.open(bytes);
  try {
    const pages: PdfPageData[] = [];
    const pageObjs: any[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      pageObjs.push(page);
      pages.push(await extractPage(page, d.OPS, i - 1));
    }
    if (!pages.some((p) => p.texts.length > 20)) {
      throw new Error("PDF에 글자 정보가 없습니다(스캔한 PDF로 보입니다). 쪽을 그림으로 저장해 이미지로 올리면 글자 인식(OCR)을 시도합니다.");
    }
    const layout = analyzePdf(pages);
    if (!layout.questions.length) throw new Error(layout.notes[0] ?? "PDF에서 문항을 찾지 못했습니다.");
    const crop = async (page: number, box: Box): Promise<CropResult> => {
      const p = pageObjs[page];
      const px = { x: Math.floor(box.x0 * CROP_SCALE), y: Math.floor(box.y0 * CROP_SCALE), w: Math.ceil((box.x1 - box.x0) * CROP_SCALE), h: Math.ceil((box.y1 - box.y0) * CROP_SCALE) };
      const png = await d.cropPng(p, CROP_SCALE, px);
      return { png, width: px.w, height: px.h };
    };
    const res = await synthesizeHwpx(layout, crop);
    return { hwpx: res.bytes, numbers: res.numbers, notes: res.notes, columnWidthHU: res.columnWidthHU, pages: doc.numPages };
  } finally {
    await doc.destroy?.();
  }
}
