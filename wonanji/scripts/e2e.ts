// 실제 파일로 전체 흐름을 돌려 보는 스크립트(로컬 전용 — 출제 파일은 저장소에 넣지 않습니다).
// 사용: npx tsx scripts/e2e.ts <양식.hwp> <출제1.hwp> [출제2.hwp ...] [--out out]
import fs from "node:fs";
import path from "node:path";
import { readBytes } from "./node-env";
import { loadDocument } from "../src/engine/load";
import { analyzeTemplate } from "../src/engine/template";
import { analyzeSource } from "../src/engine/segment";
import { assemble, defaultOrder } from "../src/engine/assemble";
import { getRhwp, hwpxToHwp, renderPages } from "../src/engine/rhwp";
import { stripHwpLineSegs } from "../src/engine/hwp5";
import { lint } from "../src/engine/lint";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 ? args.splice(outIdx, 2)[1] : "out";
const [tplPath, ...srcPaths] = args;
fs.mkdirSync(outDir, { recursive: true });

const tpl = analyzeTemplate(await loadDocument(path.basename(tplPath), readBytes(tplPath)));
const sources = [];
for (const [i, p] of srcPaths.entries()) sources.push(analyzeSource(i, await loadDocument(path.basename(p), readBytes(p)), tpl));
const order = defaultOrder(sources);
const res = assemble({ template: tpl, sources, order, spec: tpl.spec });
fs.writeFileSync(path.join(outDir, "merged.hwpx"), res.hwpx);
fs.writeFileSync(path.join(outDir, "merged_rhwp.hwpx"), res.forRhwp);
const hwp = await hwpxToHwp(res.forRhwp);
const finalHwp = stripHwpLineSegs(hwp.hwp);
fs.writeFileSync(path.join(outDir, "merged.hwp"), finalHwp);
console.log(`선택형 ${res.mcqCount} · 논술형 ${res.essayCount} · ${hwp.pages}쪽 · 손실 ${hwp.loss.count}`);
// 내려받기 파일이 다시 열리는지(구조 검증): 캐시를 지운 HWP·HWPX를 rhwp로 다시 읽어 봅니다.
const mod = await getRhwp();
for (const [label, bytes] of [["hwp", finalHwp], ["hwpx", res.hwpx]] as const) {
  const d = new mod.HwpDocument(bytes);
  console.log(`  재열기 ${label}: ${d.pageCount()}쪽, 문단 ${d.getParagraphCount(0)}개`);
  d.free();
}
const svgs = await renderPages(res.forPreview);
svgs.forEach((s, i) => fs.writeFileSync(path.join(outDir, `page${i + 1}.svg`), s));
const byKind = new Map<string, number>();
for (const c of res.changes) byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + 1);
console.log("변경:", Object.fromEntries(byKind));
const issues = lint(tpl, sources, order, tpl.spec, res.numbers);
for (const i of issues) console.log(`[${i.severity}] ${i.rule}: ${i.message}`);
