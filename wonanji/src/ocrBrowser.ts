// 브라우저용 이미지 글자 인식: tesseract.js는 이미지를 처음 올릴 때만 불러옵니다.
// 시험 보안: 인식 엔진·한국어/영어 자료를 모두 이 사이트(vendor/ocr)에서 받고, 이미지는 브라우저 밖으로 보내지 않습니다.
import { setOcrDeps, tesseractLines, type OcrLang } from "./engine/ocr/deps";
import type { Gray, RGBA } from "./engine/ocr/raster";

setOcrDeps(async () => {
  const T = await import("tesseract.js");
  // 작업자 안에서 쓰는 경로는 작업자 파일 기준으로 풀리므로 절대 주소로 줍니다.
  const base = new URL(`${import.meta.env.BASE_URL}vendor/ocr/`, location.href).href;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workers = new Map<string, Promise<any>>();
  const worker = (lang: OcrLang) => {
    const key = lang === "eng" ? "eng" : "kor";
    if (!workers.has(key)) {
      workers.set(
        key,
        T.createWorker(key, 1, {
          workerPath: `${base}worker.min.js`,
          corePath: `${base}core`,
          langPath: `${base}lang`,
          gzip: true,
          workerBlobURL: false,
        }),
      );
    }
    return workers.get(key)!;
  };
  const toCanvas = (w: number, h: number) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };
  const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("그림을 만들지 못했습니다."))), "image/png"));
  // 같은 그림을 단마다 여러 번 인식하므로 PNG로 한 번만 바꿔 둡니다.
  const blobs = new WeakMap<Gray, Promise<Blob>>();
  const grayBlob = (g: Gray) => {
    let b = blobs.get(g);
    if (!b) {
      const c = toCanvas(g.width, g.height);
      const ctx = c.getContext("2d")!;
      const id = ctx.createImageData(g.width, g.height);
      for (let i = 0, j = 0; i < g.data.length; i++, j += 4) {
        id.data[j] = id.data[j + 1] = id.data[j + 2] = g.data[i];
        id.data[j + 3] = 255;
      }
      ctx.putImageData(id, 0, 0);
      b = toBlob(c);
      blobs.set(g, b);
    }
    return b;
  };
  return {
    async decode(bytes) {
      // 휴대전화 사진의 회전 정보(EXIF)는 createImageBitmap이 반영합니다.
      const bmp = await createImageBitmap(new Blob([bytes.slice()]));
      const c = toCanvas(bmp.width, bmp.height);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      const d = ctx.getImageData(0, 0, c.width, c.height);
      return { width: d.width, height: d.height, data: d.data };
    },
    async recognize(img, lang, psm, rect) {
      const w = await worker(lang);
      await w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: "1", user_defined_dpi: "300" });
      const rectangle = rect ? { left: Math.round(rect.x0), top: Math.round(rect.y0), width: Math.round(rect.x1 - rect.x0), height: Math.round(rect.y1 - rect.y0) } : undefined;
      const r = await w.recognize(await grayBlob(img), rectangle ? { rectangle } : {}, { blocks: true, text: false });
      return tesseractLines(r.data);
    },
    async encodePng(img: RGBA) {
      const c = toCanvas(img.width, img.height);
      const ctx = c.getContext("2d")!;
      const id = ctx.createImageData(img.width, img.height);
      id.data.set(img.data);
      ctx.putImageData(id, 0, 0);
      return new Uint8Array(await (await toBlob(c)).arrayBuffer());
    },
    async release() {
      for (const w of workers.values()) await (await w).terminate();
      workers.clear();
    },
  };
});
