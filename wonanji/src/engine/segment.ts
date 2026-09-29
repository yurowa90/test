// 출제 파일 하나를 문항 단위로 나눕니다.
// 문항 머리: 개요 번호(파일에서 문항 번호로 쓴 수준), 숫자 문단 번호, 직접 입력한 "1." 번호, 【문항n-논술형】.
// 번호가 전혀 없는 파일이나 머리를 놓친 경우를 위해, 선지 ⑤까지 끝난 뒤 나오는 새 글 문단도 다음 문항의 시작으로 봅니다.
// 빈 개요 번호 문단 = 다른 선생님 몫의 자리(번호만 셈), 양식과 같은 문단(머리·유의사항·꼬리) = 제외.
// 구역 정의·머리말·꼬리말·쪽 기준 개체(쪽 모양)는 문항에서 떼어 머리로 보냅니다(학력평가형 문서).
import {
  circledIndex, essayNumber, headLevelOf, inTable, isChoiceLine, isQuestionHead, isScoreLine, paraInfos, pinfoOf, RX, similarity, type PInfo,
} from "./classify";
import { descendants, kids } from "./dom";
import { HeaderIndex } from "./header";
import type { LoadedDoc } from "./load";
import { hasPageCtrl, splitPageControls } from "./pagectl";
import { pageOf } from "./template";
import { deepText, itemsOf, ownText } from "./text";
import type { ChoiceInfo, Question, SourceAnalysis, TemplateAnalysis } from "./types";

interface Draft {
  kind: "mcq" | "essay";
  num: number | null;
  src: Question["numberSource"];
  paras: PInfo[];
  /** 지금까지 나온 가장 큰 선지 번호(0~4, 없으면 -1) */
  maxChoice: number;
  /** 머리 문단 위치(앞에 붙은 공통 지문·그림 문단 수) */
  headIdx: number;
}

function tailSimilar(tpl: TemplateAnalysis, norm: string, threshold = 0.6): boolean {
  if (norm.length < 6) return false;
  if (tpl.boilerplate.has(norm)) return true;
  for (const b of tpl.boilerplate) if (b.length > 20 && norm.length > 20 && similarity(b, norm) > threshold) return true;
  return false;
}

/** 머리 표·결재 표처럼 보이는 문단(번호 없는 파일에서 첫 문항 시작을 찾을 때 건너뜀) */
function headerLike(p: PInfo): boolean {
  return p.hasSection || (p.objs.some((o) => o.localName === "tbl") && /학년도|교시|출제|성명|수험|과목|결재|학기/.test(p.deep) && !/[①-⑤]/.test(p.deep));
}

interface Piece {
  info: PInfo;
  /** 쪽 모양만 든 문단(구역 정의·꼬리말·쪽 번호 상자) */
  pageOnly: boolean;
}

/** 쪽 모양 요소를 떼어 낸 문단 목록 */
function pieces(infos: PInfo[], index: HeaderIndex): Piece[] {
  const out: Piece[] = [];
  // 쪽 모양만 남긴 문단에는 번호 없는 문단 모양을 씁니다(머리 표를 이 파일에서 가져올 때 빈 번호가 생기지 않게).
  const plain = [...index.byId.paraProperties.entries()].find(([, e]) => kids(e).find((x) => x.localName === "heading")?.getAttribute("type") === "NONE")?.[0];
  for (const p of infos) {
    if (!hasPageCtrl(p.el)) {
      out.push({ info: p, pageOnly: false });
      continue;
    }
    const { controls, content } = splitPageControls(p.el);
    const c = pinfoOf(content, p.idx, index);
    if (c.blank) {
      out.push({ info: p, pageOnly: true });
      continue;
    }
    if (controls) {
      if (plain != null) controls.setAttribute("paraPrIDRef", plain);
      out.push({ info: pinfoOf(controls, p.idx, index), pageOnly: true });
    }
    out.push({ info: c, pageOnly: false });
  }
  return out;
}

export function analyzeSource(fileIdx: number, doc: LoadedDoc, tpl: TemplateAnalysis): SourceAnalysis {
  const index = new HeaderIndex(doc.pkg);
  const all = pieces(paraInfos(doc.pkg, index), index);
  const level = headLevelOf(all.filter((x) => !x.pageOnly).map((x) => x.info));
  const drafts: Draft[] = [];
  const head: PInfo[] = [];
  const placeholders: number[] = [];
  const notes = [...doc.notes];
  const how = new Map<string, number>();
  const count = (k: string) => how.set(k, (how.get(k) ?? 0) + 1);
  let dropped = 0;
  let outline = 0;
  let lastNum = 0;
  let started = false;
  let cur: Draft | null = null;
  let pending: PInfo[] = [];

  const autoHead = (p: PInfo) => isQuestionHead(p, level);
  const anyHead = all.some(({ info: p, pageOnly }) => !pageOnly && (autoHead(p) || essayNumber(p.text) != null || (RX.literalNum.test(p.text) && !p.blank)));

  const open = (d: Omit<Draft, "maxChoice" | "headIdx">) => {
    if (cur) drafts.push(cur);
    const headIdx = pending.length;
    d.paras.unshift(...pending);
    pending = [];
    cur = { ...d, maxChoice: -1, headIdx };
    if (d.num != null && d.kind === "mcq") lastNum = d.num;
  };
  const close = () => {
    if (cur) drafts.push(cur);
    cur = null;
  };
  const push = (p: PInfo) => {
    const d = cur as Draft | null;
    if (!d) {
      if (!p.blank) pending.push(p);
      return;
    }
    d.paras.push(p);
    if (isChoiceLine(p.text)) for (const ch of p.text) d.maxChoice = Math.max(d.maxChoice, circledIndex(ch));
  };
  /** 선지 ⑤까지 끝난 선택형 문항 뒤에 나온 새 글·그림 문단이면 다음 문항의 시작 */
  const startsAfterChoices = (p: PInfo) => {
    const d = cur as Draft | null;
    if (!d || d.kind !== "mcq" || d.maxChoice < 4 || p.blank) return false;
    if (isChoiceLine(p.text) || isScoreLine(p.text) || RX.tailWords.test(p.norm)) return false;
    // 오른쪽으로 밀어 둔 짧은 줄(출처·부분 점수 안내 등)은 앞 문항에 둡니다.
    if (/^[\s ]{8,}/.test(p.text) && p.text.trim().length <= 30) return false;
    return p.norm.length >= 4 || p.objs.length > 0;
  };

  const isHeadPiece = (x: Piece) =>
    !x.pageOnly && !x.info.blank && (!!autoHead(x.info) || essayNumber(x.info.text) != null || RX.literalNum.test(x.info.text));
  /** i 다음의 첫 내용 문단이 번호 달린 문항 머리인지(사이의 빈 줄·쪽 모양 문단은 건너뜀) */
  const headFollows = (i: number) => {
    for (let k = i + 1; k < all.length; k++) {
      const x = all[k];
      if (x.pageOnly || x.info.blank) continue;
      return isHeadPiece(x);
    }
    return false;
  };

  for (let i = 0; i < all.length; i++) {
    const { info: p, pageOnly } = all[i];
    // 쪽 모양만 든 문단: 첫 문항 앞이면 머리로, 그 뒤면(쪽마다 새로 둔 꼬리말·쪽 번호 상자) 뺍니다.
    if (pageOnly) {
      if (!started) head.push(p);
      else dropped++;
      continue;
    }
    const lit = RX.literalNum.exec(p.text);
    const auto = autoHead(p);
    const headLike = !!auto || essayNumber(p.text) != null || (!!lit && !p.blank && Number(lit[1]) <= 2);
    if (!started) {
      // 번호가 전혀 없는 파일: 머리 표 뒤 첫 글 문단부터 문항으로 봅니다(선지 뒤에서 다음 문항을 나눔).
      const firstPlain = !anyHead && !p.blank && !headerLike(p) && !tailSimilar(tpl, p.norm);
      if (!headLike && !firstPlain) {
        head.push(p);
        continue;
      }
      if (firstPlain) {
        started = true;
        count("번호 없음(선지 뒤 문단으로 나눔)");
        open({ kind: "mcq", num: lastNum + 1, src: "none", paras: [p] });
        continue;
      }
    }
    if (tailSimilar(tpl, p.norm) || RX.essayIntro.test(p.text)) {
      close();
      dropped++;
      continue;
    }
    if (auto) {
      outline++;
      started = true;
      if (p.blank) {
        close();
        placeholders.push(outline);
        continue;
      }
      count(auto === "outline" ? `개요 번호 ${level + 1}수준` : "문단 번호");
      open({ kind: "mcq", num: outline, src: "outline", paras: [p] });
      continue;
    }
    const en = essayNumber(p.text);
    if (en != null) {
      started = true;
      open({ kind: "essay", num: en, src: "essay", paras: [p] });
      continue;
    }
    if (lit && !p.blank && (!cur || Number(lit[1]) === lastNum + 1) && (started || Number(lit[1]) <= 2)) {
      started = true;
      count("직접 입력한 번호");
      open({ kind: "mcq", num: Number(lit[1]), src: "literal", paras: [p] });
      continue;
    }
    if (startsAfterChoices(p)) {
      // 곧바로 번호 달린 문항이 이어지면: 그 문항의 공통 지문·그림 상자(학력평가형은 다음 문항 그림을 앞 문단에 걸어 둠)
      if (headFollows(i)) {
        close();
        pending.push(p);
        continue;
      }
      count("번호 없음(선지 뒤 문단으로 나눔)");
      open({ kind: "mcq", num: lastNum + 1, src: "none", paras: [p] });
      continue;
    }
    push(p);
  }
  close();
  if (pending.some((p) => !p.blank)) notes.push(`어느 문항에도 속하지 않은 문단 ${pending.filter((p) => !p.blank).length}개를 뺐습니다.`);

  // 마지막 문항 뒤에 붙은 꼬리(확인 사항 상자 등): 그 문단부터 잘라 냅니다.
  const last = drafts[drafts.length - 1];
  if (last) {
    for (let i = 1; i < last.paras.length; i++) {
      const p = last.paras[i];
      if (p.blank) continue;
      if (RX.tailWords.test(p.norm) || tailSimilar(tpl, p.norm, 0.45)) {
        dropped += last.paras.length - i;
        last.paras = last.paras.slice(0, i);
        break;
      }
    }
  }

  const questions: Question[] = [];
  drafts.forEach((d, k) => {
    // 뒤쪽 빈 줄 제거
    while (d.paras.length > 1 && d.paras[d.paras.length - 1].blank) d.paras.pop();
    // 양식 예시 논술형 그대로 남은 것(".....시오. [ 점]")은 빈 자리로 봅니다.
    const body = d.paras.slice(1).map((p) => p.text).join("");
    if (d.kind === "essay" && /^\s*\.{3,}\s*시오\.?\s*[[［]\s*점\s*[\]］]\s*$/.test(body)) {
      dropped += d.paras.length;
      return;
    }
    questions.push(buildQuestion(`${fileIdx}-${k}`, fileIdx, doc.name, d, index));
  });

  const headStyle = [...how.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "문항 머리를 찾지 못함";
  if (how.has("번호 없음(선지 뒤 문단으로 나눔)")) notes.push("번호가 없는 문항을 선지 ⑤ 다음 문단에서 나눴습니다. 문항 경계를 확인해 주세요.");

  return {
    fileIdx,
    name: doc.name,
    pkg: doc.pkg,
    headParas: head.map((p) => p.el),
    headText: head.map((p) => p.deep).join("\n"),
    questions,
    placeholders,
    dropped,
    highlights: doc.highlights,
    loss: doc.loss,
    notes,
    columnWidthHU: pageOf(doc.pkg).colW,
    headStyle,
  };
}

function countObjects(els: Element[]) {
  const o = { tbl: 0, pic: 0, equation: 0, shape: 0, other: 0 };
  for (const el of els) {
    const walkCount = (name: string) => descendants(el, name).length;
    o.tbl += walkCount("tbl");
    o.pic += walkCount("pic");
    o.equation += walkCount("equation");
    o.shape += ["rect", "ellipse", "arc", "polygon", "curve", "line", "connectLine", "container"].reduce((a, n) => a + walkCount(n), 0);
    o.other += ["ole", "chart", "textart", "video"].reduce((a, n) => a + walkCount(n), 0);
  }
  return o;
}

export function parseChoices(paras: Element[]): ChoiceInfo | null {
  const texts: string[] = [];
  const paraIdx: number[] = [];
  const order: number[] = [];
  paras.forEach((p, i) => {
    if (inTable(p)) return;
    const t = ownText(p);
    if (!RX.circled.test(t)) return;
    // 선지 문단: 원문자로 시작(앞 공백 허용)하는 문단만
    if (!isChoiceLine(t)) return;
    paraIdx.push(i);
    let curIdx = -1;
    let buf = "";
    for (const ch of t) {
      const ci = circledIndex(ch);
      if (ci >= 0) {
        if (curIdx >= 0) texts[curIdx] = buf.trim();
        curIdx = ci;
        order.push(ci);
        buf = ch;
      } else buf += ch;
    }
    if (curIdx >= 0) texts[curIdx] = buf.trim();
  });
  if (!order.length) return null;
  const ordered = order.every((v, i) => v === i);
  return { count: order.length, ordered, texts, paraIdx };
}

/** 음영(형광)이 칠해진 선지 번호. 선지가 표 안에 있어도 찾습니다. */
function detectAnswers(paras: Element[], index: HeaderIndex): number[] {
  const hits = new Set<number>();
  const all = paras.flatMap((p) => [p, ...descendants(p, "p")]);
  for (const p of all) {
    let curChoice = -1;
    for (const it of itemsOf(p)) {
      if (it.kind === "ch") {
        const ci = circledIndex(it.ch);
        if (ci >= 0) curChoice = ci;
      }
      if (it.kind === "obj" || it.kind === "mark") continue;
      if (curChoice >= 0 && it.ch.trim() && index.shadeOf(it.cp)) hits.add(curChoice + 1);
    }
  }
  return [...hits].sort((a, b) => a - b);
}

function buildQuestion(id: string, fileIdx: number, fileName: string, d: Draft, index: HeaderIndex): Question {
  const els = d.paras.map((p) => p.el);
  const choices = d.kind === "mcq" ? parseChoices(els) : null;
  const firstChoice = choices?.paraIdx[0] ?? els.length;
  const stemParas = els.slice(0, firstChoice);
  const stem = stemParas.map((p) => ownText(p)).join("\n").replace(/￼/g, "").trim();
  const ownAll = els.map((p) => ownText(p)).join("\n");
  let score: number | null = null;
  let scoreRaw: string | null = null;
  for (const m of ownAll.matchAll(RX.score)) {
    score = Number(m[1]);
    scoreRaw = m[0];
  }
  const text = els.map((p) => deepText(p)).join("\n");
  // 요약은 머리 문단부터(앞에 붙은 공통 지문·그림 문단 제외)
  const headStem = els.slice(d.headIdx, Math.max(d.headIdx + 1, firstChoice)).map((p) => ownText(p)).join("\n").replace(/￼/g, "").trim();
  const firstLine = headStem.replace(RX.literalNum, "").replace(/\s+/g, " ").trim();
  return {
    id,
    fileIdx,
    fileName,
    kind: d.kind,
    srcNumber: d.num,
    numberSource: d.src,
    paras: els,
    headIdx: d.headIdx,
    text,
    stem,
    score,
    scoreRaw,
    answers: d.kind === "mcq" ? detectAnswers(els, index) : [],
    choices,
    objects: countObjects(els),
    summary: firstLine.slice(0, 70) || (kids(els[d.headIdx]).length ? "(그림·표로 시작)" : ""),
  };
}
