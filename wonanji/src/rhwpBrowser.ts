// 브라우저용 rhwp 초기화: WASM(약 9.5MB)은 처음 파일을 열 때 한 번만 내려받습니다.
import { setRhwpLoader, type RhwpModule } from "./engine/rhwp";

let ctx: CanvasRenderingContext2D | null = null;
let lastFont = "";

// rhwp는 줄 나눔 계산에 글자 폭 측정 함수를 요구합니다(WASM 초기화 전에 등록).
(globalThis as unknown as { measureTextWidth: (font: string, text: string) => number }).measureTextWidth = (font, text) => {
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * 10;
  if (font !== lastFont) {
    ctx.font = font;
    lastFont = font;
  }
  return ctx.measureText(text).width;
};

setRhwpLoader(async () => {
  const [mod, wasm] = await Promise.all([import("@rhwp/core"), import("@rhwp/core/rhwp_bg.wasm?url")]);
  await mod.default({ module_or_path: wasm.default });
  return mod as unknown as RhwpModule;
});
