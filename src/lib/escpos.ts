/**
 * 캔버스 → ESC/POS 바이트 열.
 * 텍스트 명령 대신 래스터 비트 이미지(GS v 0)만 쓴다.
 * 저가형 감열 프린터는 한글 코드페이지가 없는 경우가 대부분이라,
 * 이미지로 보내면 어떤 프린터에서든 같은 모양으로 찍힌다.
 */

/** 이 밝기(0~255)보다 어두운 픽셀을 검정으로 찍는다 */
const BLACK_THRESHOLD = 160;

/** GS v 0 한 번에 보낼 최대 세로 줄 수 — 버퍼가 작은 프린터 대비 */
const BAND_ROWS = 192;

const ESC_INIT = [0x1b, 0x40]; // ESC @  프린터 초기화
const ESC_FEED = (n: number) => [0x1b, 0x64, n]; // ESC d n  n줄 급지

export function canvasToEscpos(
  canvas: HTMLCanvasElement,
  { feedLines = 4 }: { feedLines?: number } = {},
): Uint8Array {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 사용할 수 없는 브라우저입니다.");
  const { data } = ctx.getImageData(0, 0, width, height);

  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = new Uint8Array(bytesPerRow * height);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      const a = data[i + 3];
      const lum =
        a < 128
          ? 255 // 투명은 종이색(흰색) 취급
          : data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (lum < BLACK_THRESHOLD) {
        bitmap[py * bytesPerRow + (px >> 3)] |= 0x80 >> (px & 7);
      }
    }
  }

  const parts: number[] = [...ESC_INIT];
  for (let y = 0; y < height; y += BAND_ROWS) {
    const rows = Math.min(BAND_ROWS, height - y);
    // GS v 0 m=0: xL xH(가로 바이트 수) yL yH(세로 줄 수)
    parts.push(
      0x1d,
      0x76,
      0x30,
      0x00,
      bytesPerRow & 0xff,
      (bytesPerRow >> 8) & 0xff,
      rows & 0xff,
      (rows >> 8) & 0xff,
    );
    const band = bitmap.subarray(y * bytesPerRow, (y + rows) * bytesPerRow);
    for (let i = 0; i < band.length; i++) parts.push(band[i]);
  }
  parts.push(...ESC_FEED(feedLines));

  return new Uint8Array(parts);
}
