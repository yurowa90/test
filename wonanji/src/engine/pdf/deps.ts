// pdf.js 불러오기와 쪽 그리기는 브라우저·Node가 달라 주입받습니다.
// 이 파일은 작게 두어, 첫 화면 번들에 PDF 해석 코드가 딸려 들어가지 않게 합니다.
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

export function getDeps(): Promise<PdfDeps> {
  if (!deps) throw new Error("PDF 읽기 모듈이 준비되지 않았습니다.");
  if (!loaded) loaded = deps();
  return loaded;
}

