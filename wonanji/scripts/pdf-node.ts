// Node에서 PDF 읽기: pdf.js(legacy) + @napi-rs/canvas로 쪽 그리기.
import path from "node:path";
import { createRequire } from "node:module";
import { setPdfDeps, type PdfDeps } from "../src/engine/pdf";

const require = createRequire(import.meta.url);

setPdfDeps(async (): Promise<PdfDeps> => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { Canvas } = await import("@napi-rs/canvas");
  const root = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const rendered = new WeakMap<object, Map<number, InstanceType<typeof Canvas>>>();
  return {
    OPS: pdfjs.OPS as unknown as Record<string, number>,
    async open(bytes) {
      // 신뢰할 수 없는 PDF의 글꼴 코드를 eval로 실행하지 않도록 isEvalSupported: false
      const params = {
        data: bytes.slice(),
        cMapUrl: path.join(root, "cmaps") + "/",
        cMapPacked: true,
        standardFontDataUrl: path.join(root, "standard_fonts") + "/",
        isEvalSupported: false,
      };
      return pdfjs.getDocument(params as Parameters<typeof pdfjs.getDocument>[0]).promise;
    },
    async cropPng(page, scale, px) {
      let byScale = rendered.get(page);
      if (!byScale) rendered.set(page, (byScale = new Map()));
      let canvas = byScale.get(scale);
      if (!canvas) {
        const vp = page.getViewport({ scale });
        canvas = new Canvas(Math.ceil(vp.width), Math.ceil(vp.height));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, canvas, viewport: vp }).promise;
        byScale.set(scale, canvas);
      }
      const out = new Canvas(Math.max(1, px.w), Math.max(1, px.h));
      const octx = out.getContext("2d");
      octx.fillStyle = "#fff";
      octx.fillRect(0, 0, out.width, out.height);
      octx.drawImage(canvas, px.x, px.y, px.w, px.h, 0, 0, px.w, px.h);
      return new Uint8Array(out.toBuffer("image/png"));
    },
  };
});
