// 합친 원안지의 일관성 점검: 글자 모양(글꼴·크기) 분포, 글자·그림·표·수식 개수, 글자 번호 문단 수, 구조 검증.
// 사용: npx tsx scripts/check-merged.ts out/merged.hwpx [...]
import fs from "node:fs";
import "./node-env";
import { descendants } from "../src/engine/dom";
import { HeaderIndex } from "../src/engine/header";
import { HwpxPackage } from "../src/engine/pkg";
import { itemsOf, ownText } from "../src/engine/text";
import { validateHwpx } from "./validate";

for (const file of process.argv.slice(2)) {
  const bytes = new Uint8Array(fs.readFileSync(file));
  const pkg = HwpxPackage.fromBytes(bytes);
  const h = new HeaderIndex(pkg);
  const tops = pkg.topParagraphs();
  const all = tops.flatMap((p) => [p, ...descendants(p, "p")]);
  const faceOf = (cpId: string) => {
    const cp = h.charPr(cpId);
    if (!cp) return "?";
    return `${h.charFace(cpId) ?? "?"} ${Number(cp.getAttribute("height")) / 100}pt`;
  };
  const dist = new Map<string, number>();
  let chars = 0;
  for (const p of all) {
    for (const it of itemsOf(p)) {
      if (it.kind !== "ch" || !it.ch.trim()) continue;
      chars++;
      const k = faceOf(it.cp.split("|")[0]);
      dist.set(k, (dist.get(k) ?? 0) + 1);
    }
  }
  const count = (name: string) => tops.reduce((a, p) => a + descendants(p, name).length, 0);
  const literalHeads = tops.filter((p) => /^\d{1,2}\.\s/.test(ownText(p))).length;
  const top = [...dist].sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`== ${file}`);
  console.log(`  문단 ${tops.length}(표 안 포함 ${all.length}) · 글자 ${chars}자 · 그림 ${count("pic")} · 표 ${count("tbl")} · 수식 ${count("equation")} · '1. ' 글자 번호 문단 ${literalHeads}`);
  console.log(`  글자 모양 분포: ${top.map(([k, n]) => `${k} ${((n / chars) * 100).toFixed(1)}%`).join(" · ")}`);
  const problems = validateHwpx(bytes);
  console.log(`  구조 검증: ${problems.length ? problems.join("; ") : "이상 없음"}`);
}
