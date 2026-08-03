import type { CapturedImage } from "../types";

/** 시 생성에는 긴 변 1280px이면 충분 — 전송량·비용 절약 */
const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.85;

export class ImageError extends Error {}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageError("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new ImageError(
          "이 이미지 형식을 읽지 못했습니다. JPG나 PNG로 다시 시도해 주세요.",
        ),
      );
    img.src = src;
  });
}

/** 파일 → 리사이즈·JPEG 압축된 CapturedImage */
export async function fileToCaptured(file: File): Promise<CapturedImage> {
  const original = await readAsDataURL(file);
  const img = await loadImage(original);

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) throw new ImageError("이미지 크기를 확인하지 못했습니다.");

  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("캔버스를 사용할 수 없는 브라우저입니다.");
  ctx.drawImage(img, 0, 0, outW, outH);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new ImageError("이미지 변환에 실패했습니다.");

  return { dataUrl, base64, mimeType: "image/jpeg" };
}
