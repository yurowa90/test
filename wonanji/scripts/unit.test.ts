// 합성 문서로 엔진 전체를 점검합니다(실제 출제 파일 없이 실행). 사용: npm test
import assert from "node:assert/strict";
import "./node-env";
import { assemble, defaultOrder } from "../src/engine/assemble";
import { descendants, kid } from "../src/engine/dom";
import { getLineSpacing, HeaderIndex } from "../src/engine/header";
const getLineSpacingOf = (h: HeaderIndex, p: Element) => getLineSpacing(h.paraPr(p.getAttribute("paraPrIDRef") ?? "0")!);
import type { LoadedDoc } from "../src/engine/load";
import { lint } from "../src/engine/lint";
import { formatScore, negationSpans } from "../src/engine/normalize";
import { HwpxPackage } from "../src/engine/pkg";
import { analyzeSource } from "../src/engine/segment";
import { analyzeTemplate } from "../src/engine/template";
import { deepText as deepTextOf, itemsOf, ownText, restyle } from "../src/engine/text";
import { BOX_SOURCE, BOX_TEMPLATE, HAKPYEONG, LEVEL2, LITERAL_TEMPLATE, makeHwpx, TEACHER1, TEACHER2, TEMPLATE, UNNUMBERED } from "./fixtures";
import { kids } from "../src/engine/dom";
import { isBogiBox, objWidth } from "../src/engine/objects";
import { getMargin } from "../src/engine/header";
import { validateHwpx } from "./validate";
import { classifyJamo, findCircles } from "../src/engine/ocr/detect";
import { columnSplit, components } from "../src/engine/ocr/raster";
import { layoutInfo, layoutPositions, lineStarts } from "../src/engine/rhwp";
import { balanceColumns } from "../src/engine/balance";
import { tightenOrphans } from "../src/engine/tracking";

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

console.log("학력평가형 양식·여러 번호 방식");
const hpDoc = doc("학평.hwpx", makeHwpx(HAKPYEONG, ["한컴바탕", "휴먼명조"], { mergeFirst: true }));
const hp = analyzeTemplate(hpDoc);
await test("첫 문단(구역 정의 + 1번 발문)은 쪽 모양만 머리로", () => {
  assert.equal(hp.zones[0], "headQ");
  assert.ok(!hp.zones.includes("head"));
  assert.equal(hp.zones[hp.zones.length - 1], "tail", "확인 사항은 꼬리");
});
await test("번호 뒤 공백·[3점] 정수 표기·2점 표기 생략 관례·〈보기〉 폭을 읽는다", () => {
  assert.equal(hp.spec.headLead, " ");
  assert.equal(hp.spec.scoreDecimal, false);
  assert.equal(hp.spec.unmarkedScore, 2);
  assert.equal(hp.spec.boxWidthHU, 26000);
  assert.equal(hp.spec.numbering.method, "outline");
});
await test("발문·선지는 양식 상용구로 쓰지 않는다(출제 파일의 같은 발문을 자르지 않음)", () => {
  for (const b of hp.boilerplate) assert.ok(!/고른것은|①/.test(b), b);
});

const lv2 = analyzeSource(0, doc("개요2수준.hwpx", makeHwpx(LEVEL2)), hp);
const unn = analyzeSource(1, doc("번호없음.hwpx", makeHwpx(UNNUMBERED)), hp);
await test("개요 2수준 번호, 번호 없는 문항(선지 뒤 문단)도 문항으로 나눈다", () => {
  assert.equal(lv2.questions.length, 2);
  assert.match(lv2.headStyle, /개요 번호 2수준/);
  assert.equal(unn.questions.length, 2);
  assert.deepEqual(unn.questions.map((q) => q.answers), [[1], [2]]);
  assert.ok(!unn.questions[0].text.includes("출제 교사"), "머리 표는 문항이 아님");
});
const hpOrder = defaultOrder([lv2, unn]);
const hpRes = assemble({ template: hp, sources: [lv2, unn], order: hpOrder, spec: hp.spec });
const hpOut = HwpxPackage.fromBytes(hpRes.hwpx);
const hpTops = hpOut.topParagraphs();
const hpHead = new HeaderIndex(hpOut);
await test("결과: 첫 문단은 구역 정의만(1번 예시 발문·번호 없음), 구조 검증 통과", () => {
  assert.deepEqual(validateHwpx(hpRes.hwpx), []);
  const first = hpTops[0];
  assert.ok(kids(first).some((r) => kids(r).some((c) => c.localName === "secPr")));
  assert.equal(ownText(first).replace(/￼/g, "").trim(), "");
  const pp = hpHead.paraPr(first.getAttribute("paraPrIDRef")!)!;
  assert.equal(kid(pp, "heading")?.getAttribute("type"), "NONE");
  assert.ok(!hpTops.map((p) => ownText(p)).join("").includes("그림은 어느 지역의 지층"), "양식의 1번 예시는 빠짐");
});
await test("결과: 문항 머리는 양식 번호(개요) + 발문 앞 공백, 배점은 [3점]", () => {
  const heads = hpTops.filter((p) => kid(hpHead.paraPr(p.getAttribute("paraPrIDRef")!)!, "heading")?.getAttribute("type") === "OUTLINE");
  assert.equal(heads.length, 4);
  for (const h of heads) assert.match(ownText(h), /^ \S/);
  assert.ok(hpTops.some((p) => ownText(p).includes("? [3점]")));
});
await test("결과: 〈보기〉 상자 폭을 양식 폭(26000)으로, 표시 기호는 원문 그대로", () => {
  const boxes = descendants(hpOut.sections[0].documentElement, "tbl").filter((t) => deepTextOf(t).startsWith("< 보 기 >"));
  assert.equal(boxes.length, 1);
  assert.equal(objWidth(boxes[0]), 26000);
});
await test("검수: 〈보기〉 표시가 양식과 다르면 알리되 바꾸지 않음, 2점 표기 생략은 정보로", () => {
  const issues = lint(hp, [lv2, unn], hpOrder, hp.spec, hpRes.numbers);
  const sym = issues.find((i) => i.rule === "기호 불일치");
  assert.ok(sym && sym.message.includes("< 보 기 >") && sym.message.includes("바꾸지 않았습니다"));
  assert.ok(!issues.some((i) => i.rule === "배점 없음"));
});

console.log("〈보기〉 상자 틀 통일");
const boxTpl = analyzeTemplate(doc("상자양식.hwpx", makeHwpx(BOX_TEMPLATE)));
await test("양식 예시의 〈보기〉 상자(이름표 칸 + 항목 칸)를 틀로 읽는다", () => {
  assert.ok(boxTpl.boxProto, "boxProto");
  assert.equal(boxTpl.boxProto!.label, "〈 보 기 〉");
  assert.equal(boxTpl.boxProto!.labelInBody, false);
  assert.equal(boxTpl.spec.boxStyle, "template");
  assert.equal(tpl.boxProto, null, "예시 상자가 없는 양식은 틀 없음");
  assert.equal(hp.boxProto, null, "항목이 칸마다 나뉜 상자는 틀로 쓰지 않음");
});
const boxSrc = analyzeSource(0, doc("상자문항.hwpx", makeHwpx(BOX_SOURCE)), boxTpl);
const boxOrder = defaultOrder([boxSrc]);
const boxRes = assemble({ template: boxTpl, sources: [boxSrc], order: boxOrder, spec: boxTpl.spec });
await test("결과: 1칸 상자가 양식 틀(2행)이 되고, 이름표는 양식 것, 항목 글자는 그대로, 항목 문단은 양식 내어쓰기", () => {
  assert.deepEqual(validateHwpx(boxRes.hwpx), []);
  const out = HwpxPackage.fromBytes(boxRes.hwpx);
  const h = new HeaderIndex(out);
  const boxes = descendants(out.sections[0].documentElement, "tbl").filter(isBogiBox);
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].getAttribute("rowCnt"), "2");
  const lines = deepTextOf(boxes[0]).split("\n").map((l) => l.trim()).filter(Boolean);
  assert.deepEqual(lines, ["〈 보 기 〉", "ㄱ. 핵이 있다.", "ㄴ. 막이 있다.", "ㄷ. 리보솜이 있다."]);
  const items = descendants(boxes[0], "p").filter((p) => /^[ㄱㄴㄷ]\./.test(ownText(p)));
  assert.equal(items.length, 3);
  for (const p of items) {
    const pp = h.paraPr(p.getAttribute("paraPrIDRef")!)!;
    assert.equal(getMargin(pp, "left"), 0, "첫 줄은 칸 여백에서 시작");
    assert.equal(getMargin(pp, "intent"), -1500, "둘째 줄부터 양식만큼 내어쓰기");
    assert.equal(getLineSpacing(pp).value, boxTpl.spec.lineSpacing);
  }
  assert.ok(boxRes.changes.some((c) => c.kind === "〈보기〉 상자" && c.detail.includes("< 보 기 >") && c.detail.includes("〈 보 기 〉")));
});
await test("검수: 틀로 바꾼 상자의 표시는 ‘기호 불일치’로 알리지 않음, 원본 유지 옵션이면 알림", () => {
  const issues = lint(boxTpl, [boxSrc], boxOrder, boxTpl.spec, boxRes.numbers);
  assert.ok(!issues.some((i) => i.rule === "기호 불일치" && i.message.includes("상자 표시")), issues.map((i) => i.message).join("\n"));
  const keep = { ...boxTpl.spec, boxStyle: "keep" as const };
  const kept = assemble({ template: boxTpl, sources: [boxSrc], order: boxOrder, spec: keep });
  const box = descendants(HwpxPackage.fromBytes(kept.hwpx).sections[0].documentElement, "tbl").filter(isBogiBox)[0];
  assert.equal(box.getAttribute("rowCnt"), "1", "원본 상자 유지");
  assert.ok(lint(boxTpl, [boxSrc], boxOrder, keep, kept.numbers).some((i) => i.rule === "기호 불일치" && i.message.includes("상자 표시")));
});

const litTpl = analyzeTemplate(doc("직접번호.hwpx", makeHwpx(LITERAL_TEMPLATE)));
await test("번호를 글자로 쓰는 양식: 결과 문항 앞에 '1. ' 글자 번호", () => {
  assert.equal(litTpl.spec.numbering.method, "literal");
  const r = assemble({ template: litTpl, sources: [s1, s2], order, spec: litTpl.spec });
  const t = HwpxPackage.fromBytes(r.hwpx).topParagraphs().map((p) => ownText(p));
  assert.ok(t.some((x) => x.startsWith("1. 지구 역사에서")), t.join(" | "));
  assert.ok(t.some((x) => x.startsWith("3. 다음 중 광합성")));
  assert.deepEqual(validateHwpx(r.hwpx), []);
});

// ── 이미지 글자 인식 보조(합성 그림) ──
/** 흰 바탕 W×H에 칠할 픽셀을 받아 흑백 배열을 만듭니다. */
function bitmap(W: number, H: number, on: (x: number, y: number) => boolean) {
  const b = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) b[y * W + x] = 1;
  return b;
}
await test("선지 자모 모양 판별: ㄱ·ㄴ·ㄷ", () => {
  const W = 30;
  const H = 24;
  const box = { x0: 2, y0: 2, x1: 26, y1: 20 };
  const t = 3;
  const inB = (x: number, y: number) => x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;
  const top = (x: number, y: number) => inB(x, y) && y < box.y0 + t;
  const bottom = (x: number, y: number) => inB(x, y) && y >= box.y1 - t;
  const left = (x: number, y: number) => inB(x, y) && x < box.x0 + t;
  const right = (x: number, y: number) => inB(x, y) && x >= box.x1 - t;
  assert.equal(classifyJamo(bitmap(W, H, (x, y) => top(x, y) || right(x, y)), W, box), "ㄱ");
  assert.equal(classifyJamo(bitmap(W, H, (x, y) => left(x, y) || bottom(x, y)), W, box), "ㄴ");
  assert.equal(classifyJamo(bitmap(W, H, (x, y) => top(x, y) || left(x, y) || bottom(x, y)), W, box), "ㄷ");
  assert.equal(classifyJamo(bitmap(W, H, (x, y) => inB(x, y)), W, box), null);
});
await test("동그라미 기호 찾기: 안 글자가 고리에 닿아도 찾고 '닿음'으로 표시", () => {
  const W = 120;
  const H = 50;
  const em = 36;
  const ring = (cx: number, cy: number, r: number) => (x: number, y: number) => Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r) < 1.4;
  const a = ring(25, 25, 16);
  const b = ring(80, 25, 16);
  // 두 번째 고리 안에 고리에 닿는 가로획(②의 밑획처럼)
  const touch = (x: number, y: number) => y >= 33 && y < 36 && x >= 70 && x < 95 && Math.hypot(x - 80, y - 25) < 16;
  const bin = bitmap(W, H, (x, y) => a(x, y) || b(x, y) || touch(x, y));
  const { comps, labels } = components(bin, W, H);
  const cs = findCircles(comps, labels, W, em);
  assert.equal(cs.length, 2);
  assert.ok(cs.some((c) => c.touching));
});
await test("2단 나누기: 가운데 세로 구분선", () => {
  const W = 400;
  const H = 400;
  const bin = bitmap(W, H, (x, y) => (x === 201 && y > 40 && y < 380) || ((y % 20) < 8 && (x % 12) < 7 && (x < 190 || x > 212) && y > 60 && y < 360));
  assert.ok(Math.abs((columnSplit(bin, W, H, 10) ?? 0) - 201) <= 1);
});

await test("줄바꿈: 결과 문단 모양은 어절 단위·외톨이줄 보호", () => {
  const r = assemble({ template: tpl, sources: [s1, s2], order, spec: tpl.spec });
  const h = new HeaderIndex(HwpxPackage.fromBytes(r.hwpx));
  const ids = new Set(HwpxPackage.fromBytes(r.hwpx).topParagraphs().map((p) => p.getAttribute("paraPrIDRef") ?? "0"));
  assert.ok(ids.size > 1);
  for (const id of ids) {
    const bs = kid(h.paraPr(id)!, "breakSetting")!;
    assert.equal(bs.getAttribute("breakNonLatinWord"), "KEEP_WORD", `paraPr ${id}`);
    assert.equal(bs.getAttribute("widowOrphan"), "1", `paraPr ${id}`);
  }
});
await test("자간 트래킹: rhwp 줄 배치를 문단마다 읽고, 고친 뒤에도 구조가 유효", async () => {
  const r = assemble({ template: tpl, sources: [s1, s2], order, spec: tpl.spec });
  const segs = await lineStarts(r.forPreview);
  assert.equal(segs.length, kids(r.root).filter((e) => e.localName === "p").length);
  assert.ok(segs.some((s) => s.length >= 1));
  const tr = await tightenOrphans(r, tpl.spec, lineStarts);
  assert.ok(tr.changes.every((c) => c.kind === "자간 트래킹"));
  assert.deepEqual(validateHwpx(r.hwpx), []);
  // 캐시는 forRhwp에 남고 내려받기 HWPX에는 없어야
  assert.ok(!HwpxPackage.fromBytes(r.hwpx).topParagraphs().some((p) => kid(p, "linesegarray")));
});

await test("문항 배치: 균등 배치 뒤에도 문항 수·구조가 유지되고 빈 줄은 고정 높이 문단 하나로", async () => {
  const r = assemble({ template: tpl, sources: [s1, s2], order, spec: tpl.spec });
  const before = HwpxPackage.fromBytes(r.hwpx).topParagraphs().length;
  const b = await balanceColumns(r, tpl.spec, { info: layoutInfo, positions: layoutPositions });
  const after = HwpxPackage.fromBytes(r.hwpx).topParagraphs();
  assert.ok(after.length <= before, `${after.length} <= ${before}`);
  assert.deepEqual(validateHwpx(r.hwpx), []);
  const h = new HeaderIndex(HwpxPackage.fromBytes(r.hwpx));
  const fixed = after.filter((p) => kid(h.paraPr(p.getAttribute("paraPrIDRef") ?? "0")!, "switch") && getLineSpacingOf(h, p).type === "FIXED");
  assert.ok(b.changes.length === 0 || fixed.length + after.filter((p) => p.getAttribute("columnBreak") === "1").length >= 1);
});

console.log(failed ? `\n${failed}개 실패` : "\n모두 통과");
process.exitCode = failed ? 1 : 0;
