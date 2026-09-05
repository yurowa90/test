import { useState } from "react";
import { figureDataUrl, figureSvg, figureTable, validFigure } from "../lib/figure";
import type { ItemFigure } from "../lib/figure";
import { downloadText } from "../lib/export";

export default function ScientificFigure({ figure, source = "", controls = false }: { figure?: ItemFigure; source?: string; controls?: boolean }) {
  const [error, setError] = useState("");
  if (!validFigure(figure)) return null;
  const src = figureDataUrl(figure, source);
  async function png() {
    try {
      setError("");
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth * 2; canvas.height = img.naturalHeight * 2;
      const context = canvas.getContext("2d");
      if (!context) throw new Error();
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error();
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = "문항_그림.png"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError("PNG 저장에 실패했습니다. SVG로 저장하거나 다시 시도하세요."); }
  }
  return <figure className="scientific-figure">
    <img src={src} alt={figure.title} />
    {controls && <div className="figure-tools">
      <div className="growth-actions">
        <button type="button" onClick={() => downloadText("문항_그림.svg", figureSvg(figure, source), "image/svg+xml;charset=utf-8")}>그림 SVG 저장</button>
        <button type="button" onClick={() => void png()}>그림 PNG 저장</button>
      </div>
      <details><summary>그림의 값·근거 대조</summary><p>{figure.evidence}</p><pre>{figureTable(figure)}</pre></details>
      {error && <p role="alert">{error}</p>}
    </div>}
  </figure>;
}
