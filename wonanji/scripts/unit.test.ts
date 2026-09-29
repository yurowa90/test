// 합성 문서로 엔진 전체를 점검합니다(실제 출제 파일 없이 실행). 사용: npm test
import assert from "node:assert/strict";
import "./node-env";
import { assemble, defaultOrder } from "../src/engine/assemble";
import { descendants, kid } from "../src/engine/dom";
import { getLineSpacing, HeaderIndex } from "../src/engine/header";
import type { LoadedDoc } from "../src/engine/load";
import { lint } from "../src/engine/lint";
import { formatScore, negationSpans } from "../src/engine/normalize";
import { HwpxPackage } from "../src/engine/pkg";
import { analyzeSource } from "../src/engine/segment";
import { analyzeTemplate } from "../src/engine/template";
import { itemsOf, ownText, restyle } from "../src/engine/text";
import { makeHwpx, TEACHER1, TEACHER2, TEMPLATE } from "./fixtures";
import { validateHwpx } from "./validate";

let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`);
  }
}

function doc(name: string, bytes: Uint8Array): LoadedDoc {
  return { name, format: "hwpx", bytes, pkg: HwpxPackage.fromBytes(bytes), loss: { count: 0, items: [] }, pages: 1, highlights: 0, notes: [] };
}

console.log("형식 도우미");
await test("배점 표기: 4 → 4.0, 3.5 → 3.5", () => {
  assert.equal(formatScore(4), "4.0");
  assert.equal(formatScore(3.5), "3.5");
  assert.equal(formatScore(2.25), "2.25");
});
await test("부정어: 발문 끝부분만 본다", () => {
  assert.deepEqual(negationSpans("다음 중 사회화에 대한 설명으로 옳지 않은 것은?").map((s) => s.word), ["않은"]);
  assert.deepEqual(negationSpans("대멸종과 가장 관련이 없는 사건은? [2.5점]").map((s) => s.word), ["없는"]);
  assert.deepEqual(negationSpans("그림은 서로 다른 두 지역의 지층이다. 이에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?"), []);
});

const tplDoc = doc("양식.hwpx", makeHwpx(TEMPLATE));
const tpl = analyzeTemplate(tplDoc);

console.log("양식 분석");
await test("구역: 머리·유의사항·예시·논술형 안내·꼬리", () => {
  const z = tpl.zones;
  assert.equal(z[0], "head");
  assert.equal(z[2], "notice");
  assert.ok(z.includes("sample"));
  assert.ok(z.includes("essayIntro"));
  assert.ok(z.includes("essaySample"));
  assert.equal(z[z.length - 1], "tail");
  const introIdx = tpl.paraPreview.findIndex((t) => t.includes("변형 가능"));
  assert.equal(z[introIdx], "gap", "작성 안내(→ …변형 가능)는 지웁니다");
});
await test("규격: 신명 중명조 11pt·160%·2단·B4, 번호 12pt, 문항 사이 2줄", () => {
  assert.equal(tpl.spec.fontFace, "신명 중명조");
  assert.equal(tpl.spec.sizePt, 11);
  assert.equal(tpl.spec.lineSpacing, 160);
  assert.equal(tpl.paper.name, "B4");
  assert.equal(tpl.paper.columns, 2);
  assert.equal(tpl.numberSizePt, 12);
  assert.equal(tpl.spec.gapLines, 2);
  assert.equal(tpl.spec.hangHU, 1500);
  assert.equal(tpl.spec.negationStyle, "underline-bold");
  assert.equal(tpl.conflicts.length, 0);
});

const s1 = analyzeSource(0, doc("선생님1.hwpx", makeHwpx(TEACHER1)), tpl);
const s2 = analyzeSource(1, doc("선생님2.hwpx", makeHwpx(TEACHER2)), tpl);

console.log("출제 파일 분할");
await test("선생님1: 1·3번, 빈 자리 2번, 꼬리 제외", () => {
  assert.deepEqual(s1.questions.map((q) => q.srcNumber), [1, 3]);
  assert.deepEqual(s1.placeholders, [2]);
  assert.ok(!s1.questions.some((q) => q.text.includes("확인 사항")));
});
await test("정답(음영)·배점·선지 읽기", () => {
  const [q1, q3] = s1.questions;
  assert.deepEqual(q1.answers, [1]);
  assert.equal(q1.score, 2.5);
  assert.equal(q1.choices?.count, 5);
  assert.deepEqual(q3.answers, [5]);
  assert.equal(q3.score, 3);
  assert.equal(s2.questions[0].srcNumber, 2);
  assert.deepEqual(s2.questions[0].answers, [3]);
  assert.equal(s2.questions[1].kind, "essay");
  assert.equal(s2.questions[1].score, 6);
});

console.log("조립·서식 통일");
const order = defaultOrder([s1, s2]);
const res = assemble({ template: tpl, sources: [s1, s2], order, spec: tpl.spec });
const out = HwpxPackage.fromBytes(res.hwpx);
const oh = new HeaderIndex(out);
const tops = out.topParagraphs();
const texts = tops.map((p) => ownText(p));

await test("순서·번호: 선택형 1,2,3 → 논술형 1", () => {
  assert.deepEqual(order.map((q) => `${q.kind}${q.srcNumber}`), ["mcq1", "mcq2", "mcq3", "essay2"]);
  assert.deepEqual([...res.numbers.values()], [1, 2, 3, 1]);
  assert.ok(texts.some((t) => t.startsWith("【문항1-논술형】")), "논술형 번호를 1로 다시 매김");
});
await test("양식 유의사항·예시 문항 삭제, 머리 표·논술형 안내·꼬리 유지", () => {
  const all = texts.join("\n");
  assert.ok(!all.includes("유의사항"));
  assert.ok(!all.includes("예시"));
  assert.ok(!all.includes("변형 가능"));
  assert.ok(all.includes("다음 문항부터는 논술형 문항입니다."));
  assert.ok(descendants(out.sections[0].documentElement, "t").some((t) => (t.textContent ?? "").includes("확인 사항")));
});
await test("구조 검증(모든 ID 참조가 header에 있음)", () => {
  assert.deepEqual(validateHwpx(res.hwpx), []);
  assert.deepEqual(validateHwpx(res.forRhwp), []);
});
await test("글꼴·크기·줄간격 통일(다른 글꼴 10pt·130% → 신명 중명조 11pt·160%)", () => {
  const p = tops.find((x) => ownText(x).includes("광합성에 대한 설명"))!;
  for (const it of itemsOf(p).filter((i) => i.kind === "ch")) {
    assert.equal(oh.charFace(it.cp), "신명 중명조");
    assert.equal(oh.charHeight(it.cp), 1100);
  }
  const pp = oh.paraPr(p.getAttribute("paraPrIDRef")!)!;
  assert.equal(getLineSpacing(pp).value, 160);
  assert.equal(kid(pp, "heading")?.getAttribute("type"), "OUTLINE", "문항 머리는 양식의 자동 번호");
});
await test("배점 [3.0점], 물음표 뒤 한 칸, 앞 공백 정리", () => {
  const t = texts.find((x) => x.includes("광합성에 대한 설명"))!;
  assert.equal(t, "다음 중 광합성에 대한 설명으로 옳지 않은 것은? [3.0점]");
});
await test("부정어 ‘않은’ 밑줄+진하게", () => {
  const p = tops.find((x) => ownText(x).includes("광합성에 대한 설명"))!;
  const neg = itemsOf(p).filter((i) => i.kind === "ch" && "않은".includes(i.ch) && ownText(p).includes("않은"));
  const cp = oh.charPr(neg.find((i) => i.ch === "않")!.cp)!;
  assert.equal(kid(cp, "underline")?.getAttribute("type"), "BOTTOM");
  assert.ok(kid(cp, "bold"));
});
await test("선지: 짧은 선지는 탭 배열, 정답 음영 유지, 원문자는 1칸 들여쓰기", () => {
  const p = tops.find((x) => ownText(x).startsWith("① 선캄브리아기"))!;
  assert.ok(ownText(p).includes("\t② 고생대"));
  const first = itemsOf(p).find((i) => i.ch === "①")!;
  assert.equal(oh.charPr(first.cp)?.getAttribute("shadeColor"), "#FFFF00");
  const tab = itemsOf(p).find((i) => i.kind === "tab")!;
  assert.equal(oh.charPr(tab.cp)?.getAttribute("shadeColor"), "none", "탭에는 음영이 번지지 않음");
  const pp = oh.paraPr(p.getAttribute("paraPrIDRef")!)!;
  const left = kid(kid(kid(pp, "switch")!, "case")!, "margin")!;
  assert.equal(kid(left, "left")?.getAttribute("value"), "550");
});
await test("긴 선지는 한 줄 하나 + 내어쓰기", () => {
  const p = tops.find((x) => ownText(x).startsWith("⑤ 동물 세포"))!;
  const pp = oh.paraPr(p.getAttribute("paraPrIDRef")!)!;
  const m = kid(kid(kid(pp, "switch")!, "case")!, "margin")!;
  assert.equal(kid(m, "intent")?.getAttribute("value"), "-1500");
});
await test("표(〈보기〉) 안 글자도 통일", () => {
  const cellP = descendants(out.sections[0].documentElement, "p").find((p) => ownText(p).startsWith("ㄱ. 빛은"))!;
  const it = itemsOf(cellP).find((i) => i.kind === "ch")!;
  assert.equal(oh.charFace(it.cp), "신명 중명조");
  assert.equal(oh.charHeight(it.cp), 1100);
});
await test("내려받기용 HWPX에는 줄 배치 캐시 없음", () => {
  assert.equal(descendants(out.sections[0].documentElement, "linesegarray").length, 0);
});

await test("머리 표를 출제 파일에서 가져오기", () => {
  const r = assemble({ template: tpl, sources: [s1, s2], order, spec: { ...tpl.spec, headerFrom: 0 } });
  assert.deepEqual(validateHwpx(r.hwpx), []);
  const all = descendants(HwpxPackage.fromBytes(r.hwpx).sections[0].documentElement, "t").map((t) => t.textContent ?? "").join("");
  assert.ok(all.includes("김선생"));
  assert.ok(!all.includes("000 (인)"));
});

console.log("편집 검수");
await test("번호 누락 없음·정답 표시·배점 합계 알림", () => {
  const issues = lint(tpl, [s1, s2], order, tpl.spec, res.numbers);
  assert.ok(!issues.some((i) => i.rule === "번호 누락"));
  assert.ok(issues.some((i) => i.rule === "배점 합계" && i.message.includes("15.5")));
  assert.ok(issues.every((i) => i.source.length > 0), "모든 알림에 근거가 붙음");
});
await test("번호 중복을 잡는다", () => {
  const dup = analyzeSource(2, doc("선생님1-사본.hwpx", makeHwpx(TEACHER1)), tpl);
  const issues = lint(tpl, [s1, s2, dup], defaultOrder([s1, s2, dup]), tpl.spec);
  assert.ok(issues.some((i) => i.rule === "번호 중복" && i.severity === "error"));
});

console.log("글자 모델");
await test("restyle은 글자를 잃지 않는다", () => {
  const p = tops.find((x) => ownText(x).includes("지구 역사"))!;
  const before = ownText(p);
  restyle(p, (_it, i) => (i % 3 === 0 ? "shade=#FFFF00" : null));
  assert.equal(ownText(p), before);
});

console.log(failed ? `\n${failed}개 실패` : "\n모두 통과");
process.exitCode = failed ? 1 : 0;
