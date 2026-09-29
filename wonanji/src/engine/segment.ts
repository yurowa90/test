// 출제 파일 하나를 문항 단위로 나눕니다.
// 규칙: 개요 번호(1수준) 문단 = 선택형 문항 머리, 【문항n-논술형】 = 논술형 머리,
// 빈 개요 번호 문단 = 다른 선생님 몫의 자리(번호만 셈), 양식과 같은 문단(머리·유의사항·꼬리) = 제외.
import { circledIndex, essayNumber, inTable, isOutlineHead, paraInfos, RX, similarity, type PInfo } from "./classify";
import { descendants, kids } from "./dom";
import { HeaderIndex } from "./header";
import type { LoadedDoc } from "./load";
import { deepText, itemsOf, ownText } from "./text";
import type { ChoiceInfo, Question, SourceAnalysis, TemplateAnalysis } from "./types";

interface Draft {
  kind: "mcq" | "essay";
  num: number | null;
  src: Question["numberSource"];
  paras: PInfo[];
}

function tailSimilar(tpl: TemplateAnalysis, norm: string, threshold = 0.6): boolean {
  if (norm.length < 6) return false;
  if (tpl.boilerplate.has(norm)) return true;
  for (const b of tpl.boilerplate) if (b.length > 20 && norm.length > 20 && similarity(b, norm) > threshold) return true;
  return false;
}

export function analyzeSource(fileIdx: number, doc: LoadedDoc, tpl: TemplateAnalysis): SourceAnalysis {
  const index = new HeaderIndex(doc.pkg);
  const infos = paraInfos(doc.pkg, index);
  const drafts: Draft[] = [];
  const head: PInfo[] = [];
  const placeholders: number[] = [];
  const notes = [...doc.notes];
  let dropped = 0;
  let outline = 0;
  let lastNum = 0;
  let started = false;
  let cur: Draft | null = null;
  let pending: PInfo[] = [];

  const open = (d: Draft) => {
    if (cur) drafts.push(cur);
    d.paras.unshift(...pending);
    pending = [];
    cur = d;
    if (d.num != null && d.kind === "mcq") lastNum = d.num;
  };
  const close = () => {
    if (cur) drafts.push(cur);
    cur = null;
  };

  for (const p of infos) {
    // 첫 문항 앞은 머리(결재 표·안내 상자)로 그대로 모읍니다. 양식과 같은 문구라도 걸러내지 않습니다
    // (머리 표를 이 파일에서 가져오는 옵션에 필요).
    const lit = RX.literalNum.exec(p.text);
    const headLike = isOutlineHead(p) || essayNumber(p.text) != null || (!!lit && !p.blank && Number(lit[1]) <= 2);
    if (!started && (p.hasSection || !headLike)) {
      head.push(p);
      continue;
    }
    if (tailSimilar(tpl, p.norm) || RX.essayIntro.test(p.text)) {
      close();
      dropped++;
      continue;
    }
    if (isOutlineHead(p)) {
      outline++;
      started = true;
      if (p.blank) {
        close();
        placeholders.push(outline);
        continue;
      }
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
      open({ kind: "mcq", num: Number(lit[1]), src: "literal", paras: [p] });
      continue;
    }
    if (!started) {
      head.push(p);
      continue;
    }
    if (cur) (cur as Draft).paras.push(p);
    else if (!p.blank) pending.push(p);
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
    if (!/^[\s ]*[①-⑤]/.test(t)) return;
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
  const firstLine = stem.replace(RX.literalNum, "").replace(/\s+/g, " ").trim();
  return {
    id,
    fileIdx,
    fileName,
    kind: d.kind,
    srcNumber: d.num,
    numberSource: d.src,
    paras: els,
    text,
    stem,
    score,
    scoreRaw,
    answers: d.kind === "mcq" ? detectAnswers(els, index) : [],
    choices,
    objects: countObjects(els),
    summary: firstLine.slice(0, 70) || (kids(els[0]).length ? "(그림·표로 시작)" : ""),
  };
}
