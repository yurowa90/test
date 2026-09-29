// Node에서 이미지 글자 인식: tesseract.js(Node 작업자) + @napi-rs/canvas로 그림 읽기·쓰기.
// 한국어·영어 인식 자료는 public/vendor/ocr/lang(npm run dev·build 때 복사됨)에서 읽습니다.
import path from "node:path";
import { setOcrDeps, tesseractLines, type OcrDeps, type OcrLang } from "../src/engine/ocr/deps";
import type { Gray } from "../src/engine/ocr/raster";

/* eslint-disable @typescript-eslint/no-explicit-any */
setOcrDeps(async (): Promise<OcrDeps> => {
  const T = await import("tesseract.js");
  const { Canvas, loadImage } = await import("@napi-rs/canvas");
  const langPath = path.resolve("public/vendor/ocr/lang");
  const workers = new Map<string, Promise<any>>();
  const worker = (lang: OcrLang) => {
    const key = lang === "eng" ? "eng" : "kor";
    if (!workers.has(key)) workers.set(key, T.createWorker(key, 1, { langPath, gzip: true, cacheMethod: "none" }));
    return workers.get(key)!;
  };
  const pngCache = new WeakMap<Gray, Buffer>();
  const grayPng = (g: Gray) => {
    const hit = pngCache.get(g);
    if (hit) return hit;
    const c = new Canvas(g.width, g.height);
    const ctx = c.getContext("2d");
    const id = ctx.createImageData(g.width, g.height);
    for (let i = 0, j = 0; i < g.data.length; i++, j += 4) {
      id.data[j] = id.data[j + 1] = id.data[j + 2] = g.data[i];
      id.data[j + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    const buf = c.toBuffer("image/png");
    pngCache.set(g, buf);
    return buf;
  };
  return {
    async decode(bytes) {
      const im = await loadImage(Buffer.from(bytes));
      const c = new Canvas(im.width, im.height);
      const ctx = c.getContext("2d");
      ctx.drawImage(im, 0, 0);
      const d = ctx.getImageData(0, 0, im.width, im.height);
      return { width: d.width, height: d.height, data: d.data };
    },
    async recognize(img, lang, psm, rect) {
      const w = await worker(lang);
      await w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: "1", user_defined_dpi: "300" });
      const rectangle = rect ? { left: Math.round(rect.x0), top: Math.round(rect.y0), width: Math.round(rect.x1 - rect.x0), height: Math.round(rect.y1 - rect.y0) } : undefined;
      const r = await w.recognize(grayPng(img), rectangle ? { rectangle } : {}, { blocks: true, text: false });
      return tesseractLines(r.data);
    },
    async encodePng(img) {
      const c = new Canvas(img.width, img.height);
      const ctx = c.getContext("2d");
      const id = ctx.createImageData(img.width, img.height);
      id.data.set(img.data);
      ctx.putImageData(id, 0, 0);
      return new Uint8Array(c.toBuffer("image/png"));
    },
    async release() {
      for (const w of workers.values()) await (await w).terminate();
      workers.clear();
    },
  };
});
