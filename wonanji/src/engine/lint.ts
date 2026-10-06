// 편집 검수: 합친 원안지를 학교 양식·학교 출제 지침·평가문항 제작 연수 자료에 비추어 점검합니다.
// 자동으로 고치는 규칙(서식)과 달리, 여기 규칙은 판단이 필요한 항목이라 "알림"으로만 보여 줍니다.
import { descendants } from "./dom";
import { isEditable, isEdited } from "./edit";
import { HeaderIndex } from "./header";
import { negationSpans } from "./normalize";
import { collectSymbols, mergeProfiles, SYMBOL_LABEL, symbolMismatches } from "./symbols";
import { deepText, itemsOf } from "./text";
import { UNSURE_COLOR } from "./unsure";
import type { FormatSpec, Issue, Question, SourceAnalysis, TemplateAnalysis } from "./types";

export const SOURCES = {
  tpl: "학교 원안지 양식 유의사항",
  school: "학교 「정기시험 문항 제작 및 출제 유의사항」",
  kice: "『2026학년도 전국연합학력평가 평가문항 제작 방법 직무연수(통합과학)』",
} as const;

const cite = {
  tplScore: `${SOURCES.tpl} ‘배점: 소수점으로 입력’`,
  schoolAnswerDist: `${SOURCES.school} p.11 가. ‘정답수가 한 번호로 치우치지 않도록 … 그 개수가 동일하지 않게’`,
  kiceAnswer: `${SOURCES.kice} p.91 9) 정답지 구성`,
  schoolInteger: `${SOURCES.school} p.11 라. ‘배점은 정수를 원칙(인위적 소수점 배점 지양)’`,
  schoolEssayScore: `${SOURCES.school} p.8 아. ‘선택형 개별 배점보다 높게’`,
  schoolBogi: `${SOURCES.school} p.6 3·4, p.4 차. ‘기호 수가 다르면 있는 대로 고른 것은?, 같으면 고른 것은?’`,
  schoolGajang: `${SOURCES.school} p.4 나. ‘부정 발문에서는 가장을 쓰지 않는다’`,
  schoolVague: `${SOURCES.school} p.6 1·2, p.4 라. ‘거리가 먼, 가깝지 않은 등 경계가 불분명한 표현 금지’`,
  schoolPositive: `${SOURCES.school} p.6 1 ‘맞다·적절하다·타당하다·옳다 사용, 적합하다·적당하다·올바르다 지양’`,
  schoolNegRatio: `${SOURCES.school} p.4 나. ‘부정 발문 비율 전체의 20% 정도’`,
  figOrder: `${SOURCES.kice} p.88 10) ‘그림·그래프·표는 〈보기〉 앞에’ / ${SOURCES.school} p.3 다.`,
  figInfo: `${SOURCES.kice} p.88 13) / ${SOURCES.school} p.3 다. ‘간접 발문(그림은 ~을 나타낸 것이다)’`,
  quotes: `${SOURCES.kice} p.88 17) ‘인용 문장 “ ”, 인용 어구 ‘ ’’`,
  parenNum: `${SOURCES.school} p.10 편집 9) ‘가독성을 고려하여 (1), (2) 등의 기호는 쓰지 않음’`,
  bogiSymbols: `${SOURCES.kice} p.89 3), p.90 4) / ${SOURCES.school} p.3 나. ‘〈보기〉 항목 기호 ㄱ, ㄴ, ㄷ’`,
  essayEnd: `${SOURCES.school} p.8 바. ‘발문의 종결을 ~하시오.로’`,
  essayVague: `${SOURCES.school} p.8 사., p.9 자.·차. (‘구체적’, 의문사, ‘찾아 쓰시오’ 지양)`,
  color: `${SOURCES.school} p.10 편집 7) ‘원안지는 칼라로 인쇄하지 않도록’`,
  choiceLen: `${SOURCES.school} p.5 가. / ${SOURCES.kice} p.90 3) ‘답지는 길이순(또는 논리적 순서)’`,
  merge: "원안지 수합",
  symbols: "양식 예시 문항의 기호(편집 일관성) — 원문은 바꾸지 않음",
  unmarked: "학력평가·수능 표기 관례(2점 문항은 배점 표기 생략)",
};

const CHOICE_SYMBOL = /[ㄱ-ㅎ]/g;
/** 교사가 단추로 바꿀 수 있는 기호(한 글자·짝 괄호·발문 속 〈보기〉). 상자 표시·항목 기호·불릿은 문항 구조와 맞물려 있어 원본에서 고칩니다. */
export const FIXABLE = new Set(["tilde", "middot", "paren", "bogiRef"]);

function num(q: Question, numbers: Map<string, number>): string {
  const n = numbers.get(q.id);
  return q.kind === "essay" ? `논술형 ${n ?? q.srcNumber}` : `${n ?? q.srcNumber}번`;
}

function questionSentence(stem: string): string {
  const q = stem.lastIndexOf("?");
  if (q < 0) return "";
  const s = Math.max(stem.lastIndexOf(". ", q - 1), stem.lastIndexOf("\n", q - 1), -1) + 1;
  return stem.slice(s, q + 1);
}

function isBogiTable(tbl: Element): boolean {
  return /〈\s*보\s*기\s*〉|<\s*보\s*기\s*>|＜\s*보\s*기\s*＞/.test(deepText(tbl).slice(0, 40));
}

export function lint(
  tpl: TemplateAnalysis,
  sources: SourceAnalysis[],
  order: Question[],
  spec: FormatSpec,
  numbers: Map<string, number> = new Map(),
): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Issue["severity"], rule: string, message: string, source: string, q?: Question) =>
    issues.push({ severity, rule, message, source, questionId: q?.id });

  if (!numbers.size) {
    order.filter((q) => q.kind === "mcq").forEach((q, i) => numbers.set(q.id, i + 1));
    order.filter((q) => q.kind === "essay").forEach((q, i) => numbers.set(q.id, i + 1));
  }
  const mcqs = order.filter((q) => q.kind === "mcq");
  const essays = order.filter((q) => q.kind === "essay");

  // ── 수합 ──
  // 번호 분담(split): 원래 번호가 다른 파일과 겹치면 같은 자리를 두 사람이 쓴 것이므로 확인이 필요합니다.
  // 이어 붙이기(append): 파일마다 1번부터 매기는 것이 정상이므로 같은 파일 안에서 겹칠 때만 알립니다.
  const append = spec.merge === "append";
  const dupCheck = (list: Question[], label: (n: number) => string) => {
    const byNum = new Map<number, Question[]>();
    for (const q of list) if (q.srcNumber != null) byNum.set(q.srcNumber, [...(byNum.get(q.srcNumber) ?? []), q]);
    let crossFile = 0;
    for (const [n, qs] of byNum) {
      if (qs.length < 2) continue;
      const byFile = new Map<number, Question[]>();
      for (const q of qs) byFile.set(q.fileIdx, [...(byFile.get(q.fileIdx) ?? []), q]);
      for (const same of byFile.values()) {
        if (same.length > 1) add("error", "번호 중복", `「${same[0].fileName}」 안에 ${label(n)}이 ${same.length}번 있습니다. 번호를 잘못 매겼는지, 같은 문항이 두 번 들어갔는지 원본을 확인해 주세요.`, cite.merge, same[1]);
      }
      if (byFile.size > 1) {
        crossFile++;
        if (!append) add("error", "번호 중복", `${label(n)}이 ${[...byFile.values()].map((x) => `「${x[0].fileName}」`).join(", ")}에 모두 있습니다. 번호를 나눠 맡았다면 한 파일의 ${label(n)}을 빼고, 파일마다 1번부터 매긴 것이면 3단계에서 합치는 방식을 ‘출처별로 이어 붙이기’로 바꾸세요.`, cite.merge, [...byFile.values()][1][0]);
      }
    }
    return { byNum, crossFile };
  };
  const mcqDup = dupCheck(mcqs, (n) => `원래 ${n}번`);
  const essayDup = dupCheck(essays, (n) => `원래 논술형 ${n}번`);
  const files = new Set(order.map((q) => q.fileIdx)).size;
  if (append && mcqDup.crossFile + essayDup.crossFile > 0) {
    add("info", "번호 새로 매김", `파일 ${files}개가 각각 1번부터 번호를 매겼습니다. 결과 번호는 3단계 순서대로 1번부터 새로 매깁니다(원래 번호 ${mcqDup.crossFile + essayDup.crossFile}개가 파일끼리 겹치지만 정상).`, cite.merge);
  }
  const missingIn = (qs: Question[]) => {
    const ns = [...new Set(qs.map((q) => q.srcNumber).filter((n): n is number => n != null))].sort((a, b) => a - b);
    const missing: number[] = [];
    for (let n = 1; n <= (ns[ns.length - 1] ?? 0); n++) if (!ns.includes(n)) missing.push(n);
    return missing;
  };
  if (append) {
    const byFile = new Map<number, Question[]>();
    for (const q of mcqs) byFile.set(q.fileIdx, [...(byFile.get(q.fileIdx) ?? []), q]);
    for (const qs of byFile.values()) {
      const missing = missingIn(qs);
      if (missing.length) add("warn", "번호 누락", `「${qs[0].fileName}」에 원래 ${compress(missing)}번이 없습니다. 뺀 문항이 아니라면 원본을 확인하세요. (결과는 1번부터 이어서 매깁니다)`, cite.merge);
    }
  } else {
    const missing = missingIn(mcqs);
    if (missing.length) add("warn", "번호 누락", `원래 번호 ${compress(missing)}번이 결과에 없습니다. 3단계에서 뺀 문항이 아니라면 문항 파일이 빠졌는지 확인하세요. (결과는 1번부터 이어서 매깁니다)`, cite.merge);
  }
  // 같은 문항을 두 번 올린 경우(같은 시험지의 PDF와 사진 등): 글자 두 개씩 묶은 조각이 많이 겹치면 알립니다.
  const grams = new Map<string, Set<string>>();
  const gramsOf = (q: Question) => {
    let g = grams.get(q.id);
    if (!g) {
      const t = q.text.replace(/[\[［(（]\s*\d+(?:\.\d+)?\s*점\s*[\]］)）]/g, "").replace(/[\s\d①②③④⑤.,·?<>〈〉()\[\]「」￼]/g, "");
      g = new Set<string>();
      for (let i = 0; i + 1 < t.length; i++) g.add(t.slice(i, i + 2));
      grams.set(q.id, g);
    }
    return g;
  };
  for (const list of [mcqs, essays]) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = gramsOf(list[i]);
        const b = gramsOf(list[j]);
        if (a.size < 25 || b.size < 25) continue;
        let inter = 0;
        for (const x of a) if (b.has(x)) inter++;
        // 자카드(합집합 대비)와 포함도(짧은 쪽 대비). 사진은 글이 일부만 인식되기 쉬워 포함도로도 봅니다.
        // 실제 파일 측정: 같은 문항(PDF↔사진) 포함도 0.77~0.94, 서로 다른 시험의 문항끼리는 최대 0.60.
        const jac = inter / (a.size + b.size - inter);
        const contain = inter / Math.min(a.size, b.size);
        if (jac >= 0.6 || (contain >= 0.72 && Math.min(a.size, b.size) >= 40)) {
          const src = (q: Question) => `「${q.fileName}」 원래 ${q.srcNumber ?? "?"}번`;
          add("warn", "중복 문항 의심", `${num(list[i], numbers)}과 ${num(list[j], numbers)}의 내용이 많이 겹칩니다(짧은 쪽 글의 ${Math.round(contain * 100)}%, ${src(list[i])}, ${src(list[j])}). 같은 문항을 두 파일에서 올렸다면 하나를 빼세요.`, cite.merge, list[j]);
        }
      }
    }
  }
  // 머리 표·쪽 표시의 과목명: 한 파일 안에서, 그리고 파일끼리 비교
  const subjectsByFile = sources.map((s) => ({
    name: s.name,
    subs: [...new Set([...s.headText.matchAll(/[(\[［]\s*([^()\[\]［］\n]{2,20}?)\s*[)\]］]\s*과목/g)].map((m) => m[1].trim()))],
  }));
  for (const f of subjectsByFile) {
    if (f.subs.length > 1) add("warn", "머리 표 불일치", `「${f.name}」 안에서 과목명이 ${f.subs.join(" / ")}로 서로 다릅니다(머리 표와 쪽 표시 확인).`, cite.merge);
  }
  const allSubs = new Set(subjectsByFile.flatMap((f) => f.subs));
  if (allSubs.size > 1 && subjectsByFile.every((f) => f.subs.length === 1)) {
    add("warn", "머리 표 불일치", `파일마다 과목명이 다릅니다: ${subjectsByFile.map((f) => `${f.subs[0]}(${f.name})`).join(", ")}`, cite.merge);
  }

  // ── 정답 ──
  const answers: number[] = [];
  for (const q of mcqs) {
    if (!q.answers.length) add("error", "정답 표시 없음", `${num(q, numbers)}: 형광펜·음영으로 표시한 정답을 찾지 못했습니다.`, "원안지 정답 표시", q);
    else if (q.answers.length > 1) add("warn", "정답 복수 표시", `${num(q, numbers)}: 정답 표시가 ${q.answers.map((a) => "①②③④⑤"[a - 1]).join(", ")} ${q.answers.length}곳입니다.`, "원안지 정답 표시", q);
    answers.push(q.answers.length === 1 ? q.answers[0] : 0);
  }
  const known = answers.filter(Boolean);
  if (known.length >= 5) {
    const cnt = [1, 2, 3, 4, 5].map((k) => known.filter((a) => a === k).length);
    const dist = cnt.map((c, i) => `${"①②③④⑤"[i]} ${c}`).join(" · ");
    const max = Math.max(...cnt);
    const min = Math.min(...cnt);
    if (max > Math.ceil(known.length * 0.3) || (known.length >= 10 && min === 0)) {
      add("warn", "정답 편중", `정답 분포가 치우쳤습니다 (${dist}).`, `${cite.schoolAnswerDist} / ${cite.kiceAnswer}`);
    } else if (max === min) {
      add("info", "정답 개수 동일", `모든 번호의 정답 개수가 같습니다 (${dist}). 지침은 ‘개수가 동일하지 않게’ 배분하도록 합니다.`, cite.schoolAnswerDist);
    } else add("info", "정답 분포", dist, cite.schoolAnswerDist);
    let run = 1;
    for (let i = 1; i < answers.length; i++) {
      run = answers[i] && answers[i] === answers[i - 1] ? run + 1 : 1;
      if (run === 3) add("warn", "정답 연속", `${num(mcqs[i - 2], numbers)}~${num(mcqs[i], numbers)} 정답이 모두 ${"①②③④⑤"[answers[i] - 1]}입니다.`, cite.kiceAnswer, mcqs[i]);
    }
  }

  // ── 배점 ──
  // 학력평가형 양식(2점 문항 표기 생략)이면 표기 없는 선택형은 그 점수로 셉니다.
  const unmarked = spec.unmarkedScore;
  const scoreOf = (q: Question) => q.scoreOverride ?? q.score ?? (unmarked != null && q.kind === "mcq" ? unmarked : null);
  const scored = order.filter((q) => scoreOf(q) != null);
  const noMark = order.filter((q) => q.score == null && q.scoreOverride == null && scoreOf(q) != null);
  if (noMark.length) add("info", "배점 표기 생략", `${noMark.map((q) => num(q, numbers)).join(", ")}: 배점 표기가 없어 ${unmarked}점으로 계산했습니다(양식 관례).`, cite.unmarked);
  for (const q of order) if (scoreOf(q) == null) add("error", "배점 없음", `${num(q, numbers)}: 배점 표기([x.x점])를 찾지 못했습니다.`, cite.tplScore, q);
  if (scored.length) {
    const total = scored.reduce((a, q) => a + (scoreOf(q) ?? 0), 0);
    const mcqSum = mcqs.reduce((a, q) => a + (scoreOf(q) ?? 0), 0);
    const essaySum = essays.reduce((a, q) => a + (scoreOf(q) ?? 0), 0);
    add(Math.abs(total - 100) < 0.01 ? "info" : "warn", "배점 합계", `합계 ${fmt(total)}점 (선택형 ${fmt(mcqSum)} + 논술형 ${fmt(essaySum)})${Math.abs(total - 100) < 0.01 ? "" : " — 100점이 아닙니다"}`, cite.tplScore);
    const frac = scored.filter((q) => !Number.isInteger(scoreOf(q)!));
    if (frac.length) add("info", "소수점 배점", `소수점 배점 ${frac.length}문항(${[...new Set(frac.map((q) => scoreOf(q)))].join(", ")}점). 지침은 정수 배점을 원칙으로 합니다.`, cite.schoolInteger);
    const maxMcq = Math.max(0, ...mcqs.map((q) => scoreOf(q) ?? 0));
    for (const q of essays) {
      const sc = scoreOf(q);
      if (sc != null && sc <= maxMcq) add("warn", "논술형 배점", `${num(q, numbers)} 배점(${fmt(sc)}점)이 선택형 최고 배점(${fmt(maxMcq)}점)보다 높지 않습니다.`, cite.schoolEssayScore, q);
    }
    const set = order.filter((q) => q.scoreOverride != null);
    if (set.length) add("info", "배점 지정", `${set.map((q) => `${num(q, numbers)} ${fmt(q.scoreOverride!)}점`).join(", ")}: 화면에서 지정한 배점을 결과에 표기합니다.`, "교사 지정");
  }

  // ── 발문 ──
  let negCount = 0;
  const index = new Map<number, HeaderIndex>();
  const idx = (f: number) => {
    let h = index.get(f);
    if (!h) {
      h = new HeaderIndex(sources[f].pkg);
      index.set(f, h);
    }
    return h;
  };
  for (const q of mcqs) {
    const qs = questionSentence(q.stem);
    const neg = negationSpans(q.stem).length > 0;
    if (neg) negCount++;
    if (neg && /가장/.test(qs)) add("warn", "부정 발문+가장", `${num(q, numbers)}: 부정 발문에 ‘가장’이 함께 쓰였습니다.`, cite.schoolGajang, q);
    const vague = /(거리가\s*먼|가깝지\s*않은|깊지\s*않은|관계가\s*(깊은|낮은|먼|적은))/.exec(qs);
    if (vague) add("warn", "경계 불분명 표현", `${num(q, numbers)}: ‘${vague[0]}’`, cite.schoolVague, q);
    const pos = /(적합한|적당한|적정한|올바른|올바르게|지\s*못한|잘못된)/.exec(qs);
    if (pos) add("info", "발문 어휘", `${num(q, numbers)}: ‘${pos[0]}’ 대신 적절한·옳은·타당한 등을 권장`, cite.schoolPositive, q);

    // 〈보기〉 발문과 선지 기호 수
    if (q.choices && /보\s*기/.test(qs) && /고른\s*것은/.test(qs)) {
      const counts = q.choices.texts.filter(Boolean).map((t) => (t.slice(1).match(CHOICE_SYMBOL) ?? []).length);
      if (counts.length >= 4 && counts.every((c) => c > 0)) {
        const same = counts.every((c) => c === counts[0]);
        const says = /있는\s*대로/.test(qs);
        if (same && says) add("warn", "〈보기〉 발문", `${num(q, numbers)}: 선지마다 기호 수가 같으면 ‘~만을 <보기>에서 고른 것은?’`, cite.schoolBogi, q);
        if (!same && !says) add("warn", "〈보기〉 발문", `${num(q, numbers)}: 선지마다 기호 수가 다르면 ‘~만을 <보기>에서 있는 대로 고른 것은?’`, cite.schoolBogi, q);
      }
    }
    if (q.choices && !q.choices.ordered) add("warn", "선지 번호", `${num(q, numbers)}: 선지 번호가 ①~⑤ 순서가 아닙니다.`, cite.merge, q);
    else if (q.choices && q.choices.count !== 5) add("info", "선지 개수", `${num(q, numbers)}: 선지 ${q.choices.count}개`, cite.merge, q);

    // 답지 길이순(문장형 선지만, 참고)
    if (q.choices?.ordered && q.choices.count === 5) {
      const lens = q.choices.texts.map((t) => (t ?? "").slice(1).replace(/\s/g, "").length);
      const sentence = lens.reduce((a, b) => a + b, 0) / 5 >= 10;
      const asc = lens.every((l, i) => i === 0 || l >= lens[i - 1]);
      const desc = lens.every((l, i) => i === 0 || l <= lens[i - 1]);
      if (sentence && !asc && !desc) add("info", "답지 길이순", `${num(q, numbers)}: 답지 길이 ${lens.join("·")}자. 논리적 순서가 없다면 길이순 배열을 권장합니다.`, cite.choiceLen, q);
    }

    // 〈보기〉 앞 자료, 간접 발문
    const tops = q.paras;
    const bogiAt = tops.findIndex((p) => descendants(p, "tbl").some(isBogiTable));
    const figAt = tops.map((p, i) => (descendants(p, "pic").length ? i : -1)).filter((i) => i >= 0);
    if (bogiAt >= 0 && figAt.some((i) => i > bogiAt)) add("warn", "자료 배치", `${num(q, numbers)}: 그림이 〈보기〉 뒤에 있습니다.`, cite.figOrder, q);
    if (q.objects.pic > 0 && !/(그림|그래프|표|자료|다음)/.test(q.stem.slice(0, 60))) add("info", "간접 발문", `${num(q, numbers)}: 그림이 있는데 발문 앞부분에 ‘그림은 ~을 나타낸 것이다’ 같은 사전 정보가 없습니다.`, cite.figInfo, q);

    if (/\(\s*[1-9]\s*\)/.test(q.text)) add("info", "(1),(2) 기호", `${num(q, numbers)}: (1), (2) 기호가 쓰였습니다. 표 안 항목은 (가), (나)·㉮, ㉯ 권장`, cite.parenNum, q);

    // 〈보기〉 항목 기호 순서
    for (const p of tops) {
      for (const tbl of descendants(p, "tbl").filter(isBogiTable)) {
        const marks = deepText(tbl).split("\n").map((l) => /^\s*([ㄱ-ㅎ])\s*[.．]/.exec(l)?.[1]).filter(Boolean) as string[];
        const want = "ㄱㄴㄷㄹㅁㅂ".slice(0, marks.length);
        if (marks.length >= 2 && marks.join("") !== want) add("warn", "〈보기〉 기호", `${num(q, numbers)}: 〈보기〉 항목 기호가 ${marks.join(", ")} 순서입니다.`, cite.bogiSymbols, q);
      }
    }
  }
  if (mcqs.length >= 5 && negCount / mcqs.length > 0.25) {
    add("info", "부정 발문 비율", `부정 발문 ${negCount}/${mcqs.length}문항(${Math.round((negCount / mcqs.length) * 100)}%). 권장은 20% 정도입니다.`, cite.schoolNegRatio);
  }

  // ── 논술형 ──
  for (const q of essays) {
    const body = q.text.replace(/\s+/g, " ");
    if (!/시오\s*[.。]/.test(body)) add("warn", "논술형 종결", `${num(q, numbers)}: ‘~하시오.’로 끝나는 발문을 찾지 못했습니다.`, cite.essayEnd, q);
    // 반응 지시문(‘~시오.’로 끝나는 문장) 안에서만 봅니다.
    const asks = body.split(/(?<=[.?!。])\s+/).filter((t) => /시오/.test(t)).join(" ");
    const v = /(구체적으로|찾아\s*쓰시오|무엇인지|어떤|어떠한|어떻게)/.exec(asks);
    if (v) add("info", "논술형 발문", `${num(q, numbers)}: ‘${v[0]}’ 대신 조건(【조건】)이나 평가 요소를 직접 제시하도록 권장`, cite.essayVague, q);
  }

  // ── 글자 ──
  const qSymbols = new Map(order.map((q) => [q.id, collectSymbols(q.paras, idx(q.fileIdx))]));
  const allSymbols = mergeProfiles([...qSymbols.values()]);
  for (const q of order) {
    if (/["']/.test(q.text)) add("info", "따옴표", `${num(q, numbers)}: 곧은 따옴표(" ')가 있습니다. 인용 문장은 “ ”, 어구는 ‘ ’`, cite.quotes, q);
    const h = idx(q.fileIdx);
    const colors = new Set<string>();
    let unsure = "";
    let unsureN = 0;
    let lockedN = 0;
    for (const p of q.paras.flatMap((x) => [x, ...descendants(x, "p")])) {
      let run = "";
      const locked = !isEditable(p) && !isEdited(p);
      for (const it of itemsOf(p)) {
        if (it.kind !== "ch" || !it.ch.trim()) continue;
        const c = h.charPr(it.cp.split("|")[0])?.getAttribute("textColor");
        if (c && c.toUpperCase() === UNSURE_COLOR) {
          run += it.ch;
          unsureN++;
          if (locked) lockedN++;
          continue;
        }
        if (run) unsure += (unsure ? " · " : "") + run;
        run = "";
        if (c && !/^#?000000$/i.test(c)) colors.add(c);
      }
      if (run) unsure += (unsure ? " · " : "") + run;
    }
    // 이미지에서 인식한 글자 가운데 확신이 낮아 빨갛게 둔 것: 원본과 대조해야 합니다.
    // 10자 이상이면 문장이 깨졌을 가능성이 커서 ‘확인 필요’로 올립니다.
    if (unsureN) {
      const where =
        lockedN === unsureN
          ? "모두 수식·그림이 든 문단에 있어 화면에서는 고칠 수 없으니, 한글에서 원본 사진과 대조해 고치고 글자색을 검정으로 바꾸세요."
          : `3단계에서 문항을 펼쳐 원본 사진과 대조해 고치세요(고친 문단의 빨간 글자는 검정이 됩니다).${lockedN ? ` 이 가운데 ${lockedN}자는 수식·그림이 든 문단에 있어 한글에서 고쳐야 합니다.` : ""}`;
      add(unsureN >= 10 ? "error" : "warn", "글자 인식 확인", `${num(q, numbers)}: 사진에서 인식이 불확실한 글자 ${unsureN}자(빨간색) — ${unsure.length > 60 ? unsure.slice(0, 60) + "…" : unsure}. ${where}`, "사진 글자 인식(OCR) 결과", q);
    }
    if (colors.size) add("info", "글자색", `${num(q, numbers)}: 검정이 아닌 글자색(${[...colors].join(", ")})이 있습니다. 원안지는 흑백 인쇄 기준입니다.`, cite.color, q);

    // 기호: 양식(없으면 문항 파일 다수)과 다른 기호 — 원문은 그대로 두고 알리기만 합니다.
    // 상자를 양식 틀로 다시 짰으면 상자 표시(〈 보 기 〉)는 양식 것이 되므로 불일치가 아닙니다.
    const boxUnified = spec.boxStyle === "template" && !!tpl.boxProto;
    const fixed = (m: { fam: string; used: string }) => (q.symbolFixes ?? []).some((f) => f.fam === m.fam && f.from === m.used);
    const mism = symbolMismatches(qSymbols.get(q.id)!, tpl.symbols ?? {}, allSymbols).filter((m) => !(boxUnified && m.fam === "bogiLabel") && !fixed(m));
    if (mism.length) {
      const strong = mism.some((m) => ["bogiLabel", "bogiRef", "bogiItem", "bullet"].includes(m.fam));
      const detail = mism.map((m) => `${SYMBOL_LABEL[m.fam]} ‘${m.used}’ (${m.basis === "양식" ? "양식" : "다른 문항 다수"}: ‘${m.want}’)`).join(" · ");
      const fix = mism.filter((m) => FIXABLE.has(m.fam)).map((m) => ({ fam: m.fam, from: m.used, to: m.want }));
      issues.push({
        severity: strong ? "warn" : "info",
        rule: "기호 불일치",
        message: `${num(q, numbers)}: ${detail}. 자동으로 바꾸지 않았습니다.${fix.length ? " 확인한 뒤 ‘양식 기호로 바꾸기’를 누르면 바꿉니다." : " 필요하면 원본에서 고쳐 주세요."}`,
        source: strong ? `${cite.symbols} / ${cite.bogiSymbols}` : cite.symbols,
        questionId: q.id,
        fix: fix.length ? fix : undefined,
      });
    }
    if (q.symbolFixes?.length) add("info", "기호 바꿈", `${num(q, numbers)}: ${q.symbolFixes.map((f) => `${SYMBOL_LABEL[f.fam] ?? f.fam} ‘${f.from}’ → ‘${f.to}’`).join(" · ")} (교사 확인)`, "교사가 화면에서 고른 기호 바꾸기 — 앱이 스스로 바꾸지 않음", q);
    for (const el of q.paras.flatMap((p) => descendants(p, "pos"))) {
      const rel = `${el.getAttribute("vertRelTo")}/${el.getAttribute("horzRelTo")}`;
      if (el.getAttribute("treatAsChar") === "0" && /PAPER|PAGE/.test(rel)) {
        add("warn", "쪽 기준 개체", `${num(q, numbers)}: 쪽(용지) 기준으로 고정된 그림·도형이 있어 합친 뒤 위치가 어긋날 수 있습니다. 한글에서 확인하세요.`, cite.merge, q);
        break;
      }
    }
  }

  const order2: Record<Issue["severity"], number> = { error: 0, warn: 1, info: 2 };
  return issues.sort((a, b) => order2[a.severity] - order2[b.severity]);
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function compress(ns: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < ns.length; i++) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    out.push(i === j ? String(ns[i]) : `${ns[i]}~${ns[j]}`);
    i = j;
  }
  return out.join(", ");
}
