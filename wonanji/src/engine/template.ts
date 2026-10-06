// 원안지 양식 분석: 구역(머리·유의사항·예시 문항·논술형 안내·꼬리)과 편집 규격, 배치 규격을 뽑습니다.
// 학교 정기시험 양식처럼 유의사항·예시 문항이 든 양식과, 학력평가·수능 문제지처럼 문항이 가득 찬 문서를
// 모두 양식으로 쓸 수 있게 합니다. 예시 문항에서 번호 방식, 글자·문단 모양, 〈보기〉·표·그림의 폭과 정렬을 읽습니다.
import {
  essayNumber, headLevelOf, isChoiceLine, isQuestionHead, looksLikeItem, normText, paraInfos, pinfoOf, RX, type PInfo,
} from "./classify";
import { analyzeBoxProto, type BoxProto } from "./bogi";
import { find, kid, kids } from "./dom";
import { getLineSpacing, getMargin, HeaderIndex } from "./header";
import type { LoadedDoc } from "./load";
import { isInline, objKind, objWidth, topObjects } from "./objects";
import { hasPageCtrl, splitPageControls } from "./pagectl";
import { collectSymbols } from "./symbols";
import { deepText, itemsOf } from "./text";
import type { ExplicitRule, FormatSpec, NumberingStyle, TemplateAnalysis, TemplateLayout, Zone } from "./types";

const LIT = /^\s*(\d{1,2})(\s*[.)．]\s*)(?=\S)/;

function isHead(p: PInfo, level: number): boolean {
  return !!isQuestionHead(p, level) || essayNumber(p.text) != null || (LIT.test(p.text) && !p.blank);
}

/** 문항 머리(논술형 제외)인지와 그 번호 방식 */
function headMethod(p: PInfo, level: number): NumberingStyle["method"] | null {
  const auto = isQuestionHead(p, level);
  if (auto) return auto;
  if (!p.blank && LIT.test(p.text) && essayNumber(p.text) == null) return "literal";
  return null;
}

/**
 * 구역 나누기. infos는 쪽 모양 요소(구역 정의·머리말·쪽 기준 개체)를 뗀 "내용" 기준 정보이고,
 * pageCtl[i]는 원래 문단에 쪽 모양 요소가 있었는지입니다.
 * 학력평가형처럼 첫 문단에 구역 정의와 1번 발문이 함께 있으면 그 문단은 "headQ"(쪽 모양은 머리로, 내용은 예시)입니다.
 */
export function computeZones(infos: PInfo[], pageCtl: boolean[] = [], level = headLevelOf(infos)): Zone[] {
  const zones: Zone[] = infos.map(() => "gap");
  const q0 = infos.findIndex((p) => !p.hasSection && isHead(p, level));
  const n0 = infos.findIndex((p, i) => (q0 < 0 || i < q0) && RX.noticeStart.test(p.text) && !p.hasSection);
  const headEnd = n0 >= 0 ? n0 : q0 >= 0 ? q0 : infos.length;
  for (let i = 0; i < headEnd; i++) zones[i] = "head";
  if (n0 >= 0) {
    let i = n0;
    while (i < infos.length && (q0 < 0 || i < q0) && !infos[i].blank) zones[i++] = "notice";
  }
  if (q0 < 0) return zones;

  let lastHead = q0;
  infos.forEach((p, i) => {
    if (i >= q0 && isHead(p, level)) lastHead = i;
  });
  let tailStart = infos.length;
  for (let i = lastHead + 1; i < infos.length; i++) {
    const p = infos[i];
    if (p.blank) continue;
    // 빈 줄 두 개 뒤의 내용, 또는 "확인 사항" 같은 끝맺음 문구부터 꼬리
    if ((i >= 2 && infos[i - 1].blank && infos[i - 2].blank) || (RX.tailWords.test(p.norm) && !isHead(p, level))) {
      tailStart = i;
      break;
    }
  }
  for (let i = tailStart; i < infos.length; i++) zones[i] = "tail";

  let mode: Zone = "sample";
  for (let i = q0; i < tailStart; i++) {
    const p = infos[i];
    if (RX.essayIntro.test(p.text)) mode = "essayIntro";
    else if (essayNumber(p.text) != null) mode = "essaySample";
    else if (headMethod(p, level)) mode = "sample";
    if (mode === "essayIntro") {
      // "→ 위 멘트는 … 변형 가능" 같은 작성 안내는 뺍니다.
      zones[i] = p.blank ? "gap" : /^\s*→|변형\s*가능|삭제\s*요망/.test(p.text) ? "gap" : "essayIntro";
    } else zones[i] = mode;
  }
  if (pageCtl[q0] && zones[q0] === "sample") zones[q0] = "headQ";
  return zones;
}

/** 쪽 모양 요소를 뗀 내용 기준 문단 정보와, 쪽 모양 요소가 있었는지. */
export function contentViews(infos: PInfo[], index: HeaderIndex): { views: PInfo[]; pageCtl: boolean[] } {
  const pageCtl = infos.map((p) => hasPageCtrl(p.el));
  const views = infos.map((p, i) => (pageCtl[i] ? pinfoOf(splitPageControls(p.el).content, p.idx, index) : p));
  return { views, pageCtl };
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

/** 용지·단 정보. 단 폭은 첫 단 정의 기준(단 사이 간격 제외). */
export function pageOf(pkg: LoadedDoc["pkg"]) {
  const sec = pkg.sections[0].documentElement;
  const secPr = find(sec, "secPr");
  const pagePr = secPr && kid(secPr, "pagePr");
  const margin = pagePr && kid(pagePr, "margin");
  const landscape = pagePr?.getAttribute("landscape") === "NARROWLY";
  let w = Number(pagePr?.getAttribute("width") ?? 59528);
  let h = Number(pagePr?.getAttribute("height") ?? 84188);
  if (landscape) [w, h] = [h, w];
  const ml = Number(margin?.getAttribute("left") ?? 5669);
  const mr = Number(margin?.getAttribute("right") ?? 5669);
  const colPr = find(sec, "colPr");
  const cols = Number(colPr?.getAttribute("colCount") ?? 1) || 1;
  const gap = Number(colPr?.getAttribute("sameGap") ?? 0);
  const colW = Math.round((w - ml - mr - gap * (cols - 1)) / cols);
  const mm = (hu: number) => Math.round((hu / 7200) * 25.4);
  const wm = mm(w);
  const hmm = mm(h);
  const name =
    Math.abs(wm - 257) <= 2 && Math.abs(hmm - 364) <= 2 ? "B4" :
    Math.abs(wm - 210) <= 2 && Math.abs(hmm - 297) <= 2 ? "A4" :
    Math.abs(wm - 297) <= 2 && Math.abs(hmm - 420) <= 2 ? "A3" : `${wm}×${hmm}mm`;
  return { widthMm: wm, heightMm: hmm, columns: cols, name, colW };
}

function parseRules(lines: string[]): ExplicitRule[] {
  const rules: ExplicitRule[] = [];
  for (const raw of lines) {
    const t = raw.replace(/^[\s◦∘•·\-※]+/, "").trim();
    if (!t) continue;
    let m: RegExpExecArray | null;
    if ((m = /글씨체\s*[:：]\s*(.+)/.exec(t))) rules.push({ key: "font", text: t, value: m[1].trim() });
    else if ((m = /포인트\s*[:：]\s*(\d+(?:\.\d+)?)\s*p/i.exec(t))) {
      rules.push({ key: "size", text: t, value: m[1] });
      const n = /문항\s*번호[^:：]*[:：]\s*(\d+(?:\.\d+)?)\s*p/i.exec(t);
      if (n) rules.push({ key: "numberSize", text: t, value: n[1] + (/진하게|굵게/.test(t) ? " 진하게" : "") });
    } else if ((m = /줄\s*간격\s*[:：]\s*(\d+)/.exec(t))) rules.push({ key: "lineSpacing", text: t, value: m[1] });
    else if (/부정어/.test(t)) rules.push({ key: "negation", text: t, value: t.split(/[:：]/)[1]?.trim() });
    else if (/배점/.test(t) && /소수점/.test(t)) rules.push({ key: "score", text: t, value: "소수점 한 자리" });
    else if (/(B4|A4|A3)/i.test(t) && /인쇄/.test(t)) rules.push({ key: "paper", text: t, value: /(B4|A4|A3)/i.exec(t)![1].toUpperCase() });
    else if (/(Tap|Tab|탭)/i.test(t) && /선지/.test(t)) rules.push({ key: "choiceTab", text: t });
    else rules.push({ key: "other", text: t });
  }
  return rules;
}

/** 번호 모양(numbering)의 한 수준 → 글자 크기(pt) */
function numberingSize(index: HeaderIndex, numberingId: string | null | undefined, level: number): number | null {
  const nb = numberingId ? index.byId.numberings.get(numberingId) : null;
  const ph = nb ? kids(nb).find((e) => e.localName === "paraHead" && e.getAttribute("level") === String(level + 1)) : null;
  const cp = ph?.getAttribute("charPrIDRef");
  if (!cp || cp === "4294967295") return null;
  return (index.charHeight(cp) ?? 0) / 100 || null;
}

/** 예시 문항의 〈보기〉·표·그림 폭과 정렬, 선지 배열 */
function readLayout(samples: PInfo[], index: HeaderIndex, colW: number, bodyCp: Element | null): { layout: TemplateLayout; boxProto: BoxProto | null } {
  const boxes: { w: number; align: string }[] = [];
  let boxProto: BoxProto | null = null;
  const tables: { w: number; center: boolean }[] = [];
  const figs: { w: number; center: boolean; float: boolean }[] = [];
  const perLine: Record<string, number> = {};
  for (const p of samples) {
    const pp = index.paraPr(p.el.getAttribute("paraPrIDRef") ?? "");
    const pAlign = pp ? (kid(pp, "align")?.getAttribute("horizontal") ?? "JUSTIFY") : "JUSTIFY";
    for (const o of topObjects(p.el)) {
      const kind = objKind(o);
      const w = objWidth(o);
      if (!w) continue;
      const inline = isInline(o);
      const center = inline ? pAlign === "CENTER" : kid(o, "pos")?.getAttribute("horzAlign") === "CENTER";
      if (kind === "box") {
        boxes.push({ w, align: inline ? pAlign : (kid(o, "pos")?.getAttribute("horzAlign") ?? "LEFT") });
        if (!boxProto) boxProto = analyzeBoxProto(o, index);
      }
      else if (kind === "table") tables.push({ w, center });
      else if (kind === "figure") figs.push({ w, center, float: !inline });
    }
    if (isChoiceLine(p.text)) {
      const n = (p.text.match(/[①-⑤]/g) ?? []).length;
      perLine[n] = (perLine[n] ?? 0) + 1;
    }
  }
  const r = (w: number) => Math.round((w / colW) * 100) / 100;
  const bw = median(boxes.map((b) => b.w));
  const spacing = bodyCp ? kid(bodyCp, "spacing") : null;
  const ratio = bodyCp ? kid(bodyCp, "ratio") : null;
  const layout: TemplateLayout = {
    columnWidthHU: colW,
    charSpacing: Number(spacing?.getAttribute("hangul") ?? 0),
    charRatio: Number(ratio?.getAttribute("hangul") ?? 100),
    box: bw ? { widthHU: bw, ratio: r(bw), align: boxes[0].align, count: boxes.length, frame: !!boxProto } : null,
    table: tables.length ? { maxRatio: r(Math.max(...tables.map((t) => t.w))), centered: tables.filter((t) => t.center).length, count: tables.length } : null,
    figure: figs.length
      ? { maxRatio: r(Math.max(...figs.map((f) => f.w))), centered: figs.filter((f) => f.center).length, floating: figs.filter((f) => f.float).length, count: figs.length }
      : null,
    choicesPerLine: perLine,
  };
  return { layout, boxProto };
}

export function analyzeTemplate(doc: LoadedDoc): TemplateAnalysis {
  const index = new HeaderIndex(doc.pkg);
  const raw = paraInfos(doc.pkg, index);
  const { views: infos, pageCtl } = contentViews(raw, index);
  const level = headLevelOf(infos);
  const zones = computeZones(infos, pageCtl, level);
  const notes: string[] = [];
  const page = pageOf(doc.pkg);
  if (zones.includes("headQ")) notes.push("첫 문단에 쪽 모양(구역·머리말·제목 상자)과 1번 문항이 함께 있어, 쪽 모양만 머리로 쓰고 문항은 예시로 뺐습니다(학력평가형 문서).");

  const isSample = (i: number) => zones[i] === "sample" || zones[i] === "headQ";
  const sampleIdx = infos.filter((_, i) => isSample(i));
  const essayIdx = infos.filter((_, i) => zones[i] === "essaySample");

  // 본문 글자 모양: 예시 문항에서 가장 많이 쓰인(굵게·밑줄 아닌) 글자 모양
  const count = new Map<string, number>();
  for (const p of sampleIdx) {
    for (const it of itemsOf(p.el)) {
      if (it.kind !== "ch" || /\s/.test(it.ch)) continue;
      const cp = index.charPr(it.cp);
      if (!cp || kid(cp, "bold") || kid(cp, "underline")?.getAttribute("type") !== "NONE") continue;
      const h = Number(cp.getAttribute("height"));
      if (h < 800 || h > 1600) continue;
      count.set(it.cp, (count.get(it.cp) ?? 0) + 1);
    }
  }
  let bodyCharPrId = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!bodyCharPrId) {
    bodyCharPrId = kids(infos[0]?.el ?? doc.pkg.sections[0].documentElement).find((r) => r.localName === "run")?.getAttribute("charPrIDRef") ?? "0";
    notes.push("예시 문항에서 본문 글자 모양을 찾지 못해 첫 문단의 글자 모양을 썼습니다.");
  }

  // ── 문항 번호 방식 ─────────────────────────────
  const heads = infos.map((p, i) => (isSample(i) && headMethod(p, level) ? i : -1)).filter((i) => i >= 0);
  const methodCount = new Map<NumberingStyle["method"], number>();
  for (const i of heads) {
    const m = headMethod(infos[i], level)!;
    methodCount.set(m, (methodCount.get(m) ?? 0) + 1);
  }
  const method = ([...methodCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "outline") as NumberingStyle["method"];
  const headP = heads.map((i) => infos[i]).find((p) => headMethod(p, level) === method);
  const headParaPrId = headP?.el.getAttribute("paraPrIDRef") ?? "0";
  let numberSizePt: number | null = null;
  const numbering: NumberingStyle = { method, suffix: "", charPrId: null, label: "" };
  const secPr = find(doc.pkg.sections[0].documentElement, "secPr");
  if (method === "outline") {
    numberSizePt = numberingSize(index, secPr?.getAttribute("outlineShapeIDRef"), level);
    numbering.label = `개요 번호 ${level + 1}수준(자동)`;
  } else if (method === "number") {
    numberSizePt = numberingSize(index, headP?.heading.idRef, 0);
    numbering.label = "문단 번호(자동)";
  } else if (headP) {
    const m = LIT.exec(headP.text)!;
    numbering.suffix = m[2].replace(/\s+$/, "") + (/\s$/.test(m[2]) ? " " : "");
    const items = itemsOf(headP.el);
    const digit = items.find((it) => it.kind === "ch" && /\d/.test(it.ch));
    numbering.charPrId = digit?.cp ?? null;
    numberSizePt = digit ? (index.charHeight(digit.cp) ?? 0) / 100 || null : null;
    numbering.label = `직접 입력한 번호 “1${numbering.suffix.trim()}”`;
  }
  if (!headP) notes.push("예시 문항에서 문항 번호 문단을 찾지 못했습니다. 번호가 자동으로 붙지 않을 수 있습니다.");
  else if (methodCount.size > 1) notes.push(`예시 문항의 번호 방식이 섞여 있어(${[...methodCount.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}) 가장 많은 방식을 따릅니다.`);

  const ppCount = new Map<string, number>();
  for (const p of sampleIdx) {
    if (headMethod(p, level)) continue;
    const id = p.el.getAttribute("paraPrIDRef") ?? "";
    const pp = index.paraPr(id);
    if (!pp) continue;
    const al = kid(pp, "align")?.getAttribute("horizontal");
    if (al !== "JUSTIFY" && al !== "LEFT") continue;
    if (getMargin(pp, "left") || getMargin(pp, "intent")) continue;
    if (kid(pp, "heading")?.getAttribute("type") !== "NONE") continue;
    ppCount.set(id, (ppCount.get(id) ?? 0) + 1);
  }
  const bodyParaPrId = [...ppCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? headParaPrId;

  let hangHU = 0;
  for (const p of sampleIdx) {
    if (!isChoiceLine(p.text)) continue;
    const pp = index.paraPr(p.el.getAttribute("paraPrIDRef") ?? "");
    const v = pp ? getMargin(pp, "intent") : 0;
    if (v < 0) hangHU = Math.max(hangHU, -v);
  }

  const essayHead = essayIdx.find((p) => essayNumber(p.text) != null);
  const essayHeadCharPrId = essayHead ? itemsOf(essayHead.el).find((i) => i.kind === "ch")?.cp ?? null : null;

  // 문항 사이 빈 줄 수: 예시 문항 사이 빈 줄의 중앙값(단 끝을 채우려고 넣은 긴 빈칸은 빼고).
  // 꼬리말만 든 문단(쪽 번호 상자)은 세지 않습니다.
  let gapLines = 2;
  const gaps: number[] = [];
  for (let k = 1; k < heads.length; k++) {
    let n = 0;
    for (let i = heads[k] - 1; i > heads[k - 1] && infos[i].blank; i--) if (!pageCtl[i]) n++;
    if (n <= 4) gaps.push(n);
  }
  const mg = median(gaps);
  if (mg != null) gapLines = Math.min(4, Math.max(1, mg));

  // 문항 번호와 발문 사이: 학력평가형 양식은 번호 모양에 공백이 없고 발문을 공백으로 시작합니다.
  const headTexts = method === "literal" ? [] : heads.map((i) => infos[i].text.replace(/^￼+/, "")).filter((t) => t.trim());
  const leadCount = headTexts.filter((t) => /^[  　]/.test(t)).length;
  const headLead = headTexts.length && leadCount * 2 > headTexts.length ? " " : "";

  // 배점 표기 관례: [3.0점](소수점) / [3점](정수), 그리고 2점 문항은 표기하지 않는 관례(학력평가·수능)
  const perQ: { scores: string[] }[] = [];
  infos.forEach((p, i) => {
    if (!isSample(i)) return;
    if (headMethod(p, level)) perQ.push({ scores: [] });
    const cur = perQ[perQ.length - 1];
    if (cur) for (const m of p.deep.matchAll(RX.score)) cur.scores.push(m[0]);
  });
  const allScores = perQ.flatMap((q) => q.scores);
  const unscored = perQ.filter((q) => !q.scores.length).length;
  const unmarkedScore =
    perQ.length >= 4 && allScores.length > 0 && unscored * 10 >= perQ.length * 3 && allScores.every((s) => /[^\d.]3\s*점/.test(s)) ? 2 : null;
  if (unmarkedScore) notes.push(`예시 문항 ${perQ.length}개 중 ${unscored}개에 배점 표기가 없고 나머지는 [3점]이어서, 배점 없는 문항은 2점으로 보는 관례(학력평가·수능)로 읽었습니다.`);

  const noticeLines = infos.filter((_, i) => zones[i] === "notice").map((p) => p.text);
  const rules = parseRules(noticeLines);

  const bodyCp = index.charPr(bodyCharPrId);
  const observedFont = index.charFace(bodyCharPrId) ?? "";
  const observedSize = (Number(bodyCp?.getAttribute("height") ?? 1100) || 1100) / 100;
  const bodyPp = index.paraPr(bodyParaPrId);
  const observedLs = bodyPp ? getLineSpacing(bodyPp).value : 160;
  const { layout, boxProto } = readLayout(sampleIdx, index, page.colW, bodyCp);

  const conflicts: string[] = [];
  const r = (k: ExplicitRule["key"]) => rules.find((x) => x.key === k);
  const fontRule = r("font");
  if (fontRule?.value && observedFont && fontRule.value.replace(/\s/g, "") !== observedFont.replace(/\s/g, "")) {
    conflicts.push(`글씨체: 유의사항은 "${fontRule.value}", 예시 문항은 "${observedFont}"`);
  }
  const sizeRule = r("size");
  if (sizeRule?.value && Number(sizeRule.value) !== observedSize) conflicts.push(`글자 크기: 유의사항 ${sizeRule.value}pt, 예시 ${observedSize}pt`);
  const lsRule = r("lineSpacing");
  if (lsRule?.value && Number(lsRule.value) !== observedLs) conflicts.push(`줄간격: 유의사항 ${lsRule.value}%, 예시 ${observedLs}%`);
  const numRule = r("numberSize");
  if (numRule?.value && numberSizePt && parseFloat(numRule.value) !== numberSizePt) conflicts.push(`문항 번호 크기: 유의사항 ${numRule.value}, 양식 번호 모양 ${numberSizePt}pt`);

  const negRule = r("negation")?.value ?? "";
  const spec: FormatSpec = {
    bodyCharPrId,
    bodyParaPrId,
    headParaPrId,
    essayHeadCharPrId,
    fontFace: observedFont,
    sizePt: sizeRule?.value ? Number(sizeRule.value) : observedSize,
    lineSpacing: lsRule?.value ? Number(lsRule.value) : observedLs,
    gapLines,
    columnWidthHU: page.colW,
    choiceIndentHU: Math.round(observedSize * 50),
    hangHU: hangHU || Math.round(observedSize * 140),
    choiceLayout: "auto",
    negation: "auto",
    negationStyle: /진하게|굵게/.test(negRule) || !negRule ? "underline-bold" : "underline",
    normalizeScore: true,
    // 유의사항에 소수점 규칙이 있거나 예시가 [4.0점]처럼 쓰였으면 소수점, 예시가 [3점]뿐이면 정수
    scoreDecimal: !!r("score") || !allScores.length || allScores.some((s) => /\d\.\d/.test(s)),
    unmarkedScore,
    headLead,
    numbering,
    boxWidthHU: layout.box?.widthHU ?? null,
    fitObjects: true,
    resetSpacing: false,
    keepColors: true,
    cellMode: "normalize",
    keepTogether: true,
    normalizeEquationSize: true,
    headerFrom: "template",
    wordWrap: true,
    tracking: true,
    layout: "balanced",
    boxStyle: boxProto ? "template" : "keep",
    merge: "split",
  };

  // 양식 상용구(문항 파일에서 같은 문단이 나오면 뺍니다). 발문·선지·〈보기〉처럼 문항에도 흔한 글은 넣지 않습니다.
  const boilerplate = new Set<string>();
  raw.forEach((p, i) => {
    const z = zones[i];
    const norm = z === "headQ" ? normText(deepText(splitPageControls(p.el).controls!)) : p.norm;
    if (!["head", "headQ", "notice", "essayIntro", "tail"].includes(z) || norm.length < 6) return;
    if (looksLikeItem(z === "headQ" ? norm : p.text)) return;
    boilerplate.add(norm);
  });

  return {
    name: doc.name,
    pkg: doc.pkg,
    bytes: doc.pkg.toBytes(),
    zones,
    paraPreview: infos.map((p) => (p.deep || (p.objs.length ? `[개체 ${p.objs.map((o) => o.localName).join(", ")}]` : "")).slice(0, 80)),
    spec,
    rules,
    conflicts,
    paper: { widthMm: page.widthMm, heightMm: page.heightMm, columns: page.columns, name: page.name },
    numberSizePt,
    boilerplate,
    notes,
    layout,
    symbols: collectSymbols([...sampleIdx, ...essayIdx].map((p) => p.el), index),
    boxProto,
  };
}
