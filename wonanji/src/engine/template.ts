// 학교 원안지 양식 분석: 구역(머리·유의사항·예시 문항·논술형 안내·꼬리)과 편집 규격을 뽑습니다.
import { essayNumber, isOutlineHead, paraInfos, RX, type PInfo } from "./classify";
import { find, kid, kids } from "./dom";
import { getLineSpacing, getMargin, HeaderIndex } from "./header";
import type { LoadedDoc } from "./load";
import { itemsOf } from "./text";
import type { ExplicitRule, FormatSpec, TemplateAnalysis, Zone } from "./types";

function isHead(p: PInfo): boolean {
  return isOutlineHead(p) || essayNumber(p.text) != null || (RX.literalNum.test(p.text) && !p.blank);
}

export function computeZones(infos: PInfo[]): Zone[] {
  const zones: Zone[] = infos.map(() => "gap");
  const q0 = infos.findIndex((p) => !p.hasSection && isHead(p));
  const n0 = infos.findIndex((p, i) => (q0 < 0 || i < q0) && RX.noticeStart.test(p.text) && !p.hasSection);
  const headEnd = n0 >= 0 ? n0 : q0 >= 0 ? q0 : infos.length;
  for (let i = 0; i < headEnd; i++) zones[i] = "head";
  if (n0 >= 0) {
    let i = n0;
    while (i < infos.length && (q0 < 0 || i < q0) && !infos[i].blank) zones[i++] = "notice";
  }
  if (q0 < 0) return zones;

  // 마지막 문항 머리 이후, 빈 줄 2개 뒤에 나오는 내용은 꼬리(확인 사항 상자 등)로 봅니다.
  let lastHead = q0;
  infos.forEach((p, i) => {
    if (i >= q0 && isHead(p)) lastHead = i;
  });
  let tailStart = infos.length;
  for (let i = lastHead + 1; i < infos.length; i++) {
    if (!infos[i].blank && i >= 2 && infos[i - 1].blank && infos[i - 2].blank) {
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
    else if (isOutlineHead(p)) mode = "sample";
    if (mode === "essayIntro") {
      // "→ 위 멘트는 … 변형 가능" 같은 작성 안내는 뺍니다.
      zones[i] = p.blank ? "gap" : /^\s*→|변형\s*가능|삭제\s*요망/.test(p.text) ? "gap" : "essayIntro";
    } else zones[i] = mode;
  }
  return zones;
}

function pageOf(pkg: LoadedDoc["pkg"]) {
  const sec = pkg.sections[0].documentElement;
  const secPr = find(sec, "secPr");
  const pagePr = secPr && kid(secPr, "pagePr");
  const margin = pagePr && kid(pagePr, "margin");
  const w = Number(pagePr?.getAttribute("width") ?? 59528);
  const h = Number(pagePr?.getAttribute("height") ?? 84188);
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

export function analyzeTemplate(doc: LoadedDoc): TemplateAnalysis {
  const index = new HeaderIndex(doc.pkg);
  const infos = paraInfos(doc.pkg, index);
  const zones = computeZones(infos);
  const notes: string[] = [];
  const page = pageOf(doc.pkg);

  const sampleIdx = infos.filter((_, i) => zones[i] === "sample");
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

  const headP = sampleIdx.find(isOutlineHead);
  const headParaPrId = headP?.el.getAttribute("paraPrIDRef") ?? "0";
  if (!headP) notes.push("예시 문항에서 문항 번호(개요 번호) 문단을 찾지 못했습니다. 번호가 자동으로 붙지 않을 수 있습니다.");

  const ppCount = new Map<string, number>();
  for (const p of sampleIdx) {
    if (isOutlineHead(p)) continue;
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
    if (!/^\s*[①-⑤]/.test(p.text)) continue;
    const pp = index.paraPr(p.el.getAttribute("paraPrIDRef") ?? "");
    const v = pp ? getMargin(pp, "intent") : 0;
    if (v < 0) hangHU = Math.max(hangHU, -v);
  }

  const essayHead = essayIdx.find((p) => essayNumber(p.text) != null);
  const essayHeadCharPrId = essayHead ? itemsOf(essayHead.el).find((i) => i.kind === "ch")?.cp ?? null : null;

  // 문항 사이 빈 줄 수: 첫 두 예시 문항 사이
  let gapLines = 2;
  const heads = infos.map((p, i) => (zones[i] === "sample" && isOutlineHead(p) ? i : -1)).filter((i) => i >= 0);
  if (heads.length >= 2) {
    let n = 0;
    for (let i = heads[1] - 1; i > heads[0] && infos[i].blank; i--) n++;
    if (n >= 1 && n <= 4) gapLines = n;
  }

  // 번호 글자 크기: 구역의 개요 번호 모양(numbering) 1수준의 글자 모양
  let numberSizePt: number | null = null;
  const secPr = find(doc.pkg.sections[0].documentElement, "secPr");
  const outlineId = secPr?.getAttribute("outlineShapeIDRef");
  const numbering = outlineId ? index.byId.numberings.get(outlineId) : null;
  const lvl1 = numbering ? kids(numbering).find((e) => e.localName === "paraHead" && e.getAttribute("level") === "1") : null;
  const numCp = lvl1?.getAttribute("charPrIDRef");
  if (numCp && numCp !== "4294967295") numberSizePt = (index.charHeight(numCp) ?? 0) / 100 || null;

  const noticeLines = infos.filter((_, i) => zones[i] === "notice").map((p) => p.text);
  const rules = parseRules(noticeLines);

  const bodyCp = index.charPr(bodyCharPrId);
  const observedFont = index.charFace(bodyCharPrId) ?? "";
  const observedSize = (Number(bodyCp?.getAttribute("height") ?? 1100) || 1100) / 100;
  const bodyPp = index.paraPr(bodyParaPrId);
  const observedLs = bodyPp ? getLineSpacing(bodyPp).value : 160;

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
    resetSpacing: false,
    keepColors: true,
    cellMode: "normalize",
    keepTogether: true,
    normalizeEquationSize: true,
    headerFrom: "template",
  };

  const boilerplate = new Set<string>();
  infos.forEach((p, i) => {
    if (["head", "notice", "essayIntro", "tail"].includes(zones[i]) && p.norm.length >= 6) boilerplate.add(p.norm);
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
  };
}
