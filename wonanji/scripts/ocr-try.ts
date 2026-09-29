// 이미지 출제 파일 하나를 HWPX로 옮겨 보고(문항 수·메모), out/에 저장합니다.
// 사용: npx tsx scripts/ocr-try.ts 그림.png [--debug]  (--debug: 찾은 선·동그라미·그림·글자 위치를 겹친 그림도 저장)
import fs from "node:fs";
import path from "node:path";
import "./node-env";
import "./ocr-node";
import { imageToHwpx, type OcrDebug } from "../src/engine/ocr/index";
import { buildLines, lineText, bodySize } from "../src/engine/pdf/lines";

const file = process.argv[2];
const wantDebug = process.argv.includes("--debug");
const t0 = Date.now();
let dbg: OcrDebug | null = null;
const r = await imageToHwpx(path.basename(file), new Uint8Array(fs.readFileSync(file)), wantDebug ? (d) => (dbg = d) : undefined).catch((e) => {
  console.error("실패:", e.message);
  return null;
});
fs.mkdirSync("out", { recursive: true });
const base = path.join("out", path.basename(file).replace(/\.\w+$/, ""));
if (r) {
  fs.writeFileSync(base + "_ocr.hwpx", r.hwpx);
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`, "문항", r.numbers.join(","), "→", base + "_ocr.hwpx");
  for (const n of r.notes) console.log(" -", n);
}
if (dbg) {
  const d = dbg as OcrDebug;
  const { Canvas } = await import("@napi-rs/canvas");
  const c = new Canvas(d.work.width, d.work.height);
  const ctx = c.getContext("2d");
  const id = ctx.createImageData(d.work.width, d.work.height);
  for (let i = 0, j = 0; i < d.work.data.length; i++, j += 4) {
    id.data[j] = id.data[j + 1] = id.data[j + 2] = 128 + d.work.data[i] / 2;
    id.data[j + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,160,0,0.9)";
  for (const s of d.segs) ctx.strokeRect(s.x0, s.y0 - 1, Math.max(2, s.x1 - s.x0), Math.max(2, s.y1 - s.y0 + 2));
  ctx.strokeStyle = "rgba(200,0,200,0.9)";
  for (const f of d.figs) ctx.strokeRect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0);
  ctx.font = `${Math.round(d.em * 0.8)}px sans-serif`;
  for (const g of d.circles) {
    ctx.strokeStyle = g.unsure ? "red" : "blue";
    ctx.strokeRect(g.box.x0, g.box.y0, g.box.x1 - g.box.x0, g.box.y1 - g.box.y0);
    ctx.fillStyle = g.unsure ? "red" : "blue";
    ctx.fillText(g.ch, g.box.x0, g.box.y0 - 2);
  }
  for (const t of d.texts) {
    ctx.strokeStyle = t.uncertain ? "rgba(255,0,0,0.8)" : "rgba(255,140,0,0.5)";
    ctx.strokeRect(t.x / d.pt, t.bbox.y0 / d.pt, t.w / d.pt, (t.bbox.y1 - t.bbox.y0) / d.pt);
  }
  fs.writeFileSync(base + "_debug.png", c.toBuffer("image/png"));
  const body = bodySize(d.texts);
  const lines = buildLines(d.texts, body);
  fs.writeFileSync(base + "_lines.txt", lines.map((l) => `${l.y.toFixed(0)} ${l.x0.toFixed(0)} | ${lineText(l)}`).join("\n"));
  console.log("debug →", base + "_debug.png", `em=${d.em.toFixed(1)} body=${body}`);
}
