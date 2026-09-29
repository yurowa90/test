// 브라우저용 PDF 읽기: pdf.js는 PDF를 처음 올릴 때만 불러옵니다(작업자·글꼴·문자표 모두 이 사이트에서 제공).
// 학교 PC의 조금 오래된 브라우저에서도 돌도록 legacy 빌드를 씁니다(기본 빌드는 최신 JS 기능이 필요).
import { setPdfDeps } from "./engine/pdf/deps";

setPdfDeps(async () => {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const base = `${import.meta.env.BASE_URL}vendor/pdfjs/`;
  // 고해상도로 그린 쪽은 메모리를 많이 쓰므로 마지막 한 쪽만 기억합니다.
  let last: { page: unknown; scale: number; canvas: HTMLCanvasElement } | null = null;
  return {
    OPS: pdfjs.OPS as unknown as Record<string, number>,
    async open(bytes) {
      // pdf.js 6의 작업자는 글꼴 프로그램을 eval·new Function으로 실행하지 않습니다(자체 해석기만 씀).
      const params = { data: bytes.slice(), cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/` };
      return pdfjs.getDocument(params as Parameters<typeof pdfjs.getDocument>[0]).promise;
    },
    async cropPng(page, scale, px) {
      if (!last || last.page !== page || last.scale !== scale) {
        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, canvas, viewport: vp }).promise;
        last = { page, scale, canvas };
      }
      const out = document.createElement("canvas");
      out.width = Math.max(1, px.w);
      out.height = Math.max(1, px.h);
      const octx = out.getContext("2d")!;
      octx.fillStyle = "#fff";
      octx.fillRect(0, 0, out.width, out.height);
      octx.drawImage(last.canvas, px.x, px.y, px.w, px.h, 0, 0, px.w, px.h);
      const blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("그림을 저장하지 못했습니다."))), "image/png"));
      return new Uint8Array(await blob.arrayBuffer());
    },
  };
});
