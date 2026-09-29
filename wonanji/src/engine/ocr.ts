// 이미지(사진·캡처) 출제 파일 → HWPX. 글자 인식(OCR)은 브라우저 안에서만 합니다.
export interface OcrLoad {
  hwpx: Uint8Array;
  numbers: number[];
  notes: string[];
  columnWidthHU: number;
}

export async function imageToHwpx(name: string, _bytes: Uint8Array): Promise<OcrLoad> {
  throw new Error(`${name}: 이미지 입력은 준비 중입니다.`);
}
