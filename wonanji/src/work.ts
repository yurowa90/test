// 화면 도우미: 작업 설정 저장·불러오기(.json), 검수 항목 묶기, 검수 보고서 글.
// 작업 설정 파일에는 문항 파일이 들어가지 않습니다(순서·포함 여부·정답·배점·기호 바꾸기·고친 글자·옵션만).
import { editableParas, isEdited, paraText, setParaText } from "./engine/edit";
import { HeaderIndex } from "./engine/header";
import { refreshQuestion } from "./engine/segment";
import type { Change, FormatSpec, Issue, MergeMode, Question, SourceAnalysis, SymbolFix } from "./engine/types";

/** 파일 이름 + 파일 안 문항 순번(같은 파일을 다시 올리면 같은 값) */
export const qKey = (q: Question) => `${q.fileName}#${q.id.slice(q.id.indexOf("-") + 1)}`;

const OPTION_KEYS = [
  "sizePt", "lineSpacing", "gapLines", "layout", "choiceLayout", "negation", "negationStyle", "normalizeScore", "resetSpacing", "keepColors",
  "cellMode", "keepTogether", "normalizeEquationSize", "scoreDecimal", "unmarkedScore", "headLead", "fitObjects", "wordWrap", "tracking", "boxStyle",
] as const;

export interface WorkState {
  order: Question[];
  excluded: Set<string>;
  answers: Map<string, number[]>;
  scores: Map<string, number>;
  fixes: Map<string, SymbolFix[]>;
  spec: FormatSpec;
  fileOrder: number[];
}

interface WorkFile {
  app: "wonanji";
  version: 1;
  savedAt: string;
  template: string;
  files: string[];
  merge: MergeMode;
  fileOrder: string[];
  order: string[];
  excluded: string[];
  answers: [string, number[]][];
  scores: [string, number][];
  fixes: [string, SymbolFix[]][];
  edits: [string, number, string][];
  options: Record<string, unknown>;
  headerFrom: string | null;
}

export function exportWork(tplName: string, sources: SourceAnalysis[], st: WorkState): string {
  const byId = new Map(st.order.map((q) => [q.id, q]));
  const key = (id: string) => {
    const q = byId.get(id);
    return q ? qKey(q) : null;
  };
  const pairs = <T,>(m: Map<string, T>) => [...m].map(([id, v]) => [key(id), v] as [string | null, T]).filter((x): x is [string, T] => !!x[0]);
  const edits: [string, number, string][] = [];
  for (const q of st.order) editableParas(q).forEach((p, i) => isEdited(p) && edits.push([qKey(q), i, paraText(p)]));
  const options: Record<string, unknown> = {};
  for (const k of OPTION_KEYS) options[k] = st.spec[k];
  const w: WorkFile = {
    app: "wonanji",
    version: 1,
    savedAt: new Date().toISOString(),
    template: tplName,
    files: sources.map((s) => s.name),
    merge: st.spec.merge,
    fileOrder: st.fileOrder.map((i) => sources[i]?.name).filter(Boolean),
    order: st.order.map(qKey),
    excluded: [...st.excluded].map(key).filter((k): k is string => !!k),
    answers: pairs(st.answers),
    scores: pairs(st.scores),
    fixes: pairs(st.fixes),
    edits,
    options,
    headerFrom: typeof st.spec.headerFrom === "number" ? (sources[st.spec.headerFrom]?.name ?? null) : null,
  };
  return JSON.stringify(w, null, 1);
}

export interface ImportResult {
  state: WorkState;
  matched: number;
  missing: number;
  edits: number;
  templateMismatch: boolean;
  savedAt: string;
}

/** 저장한 작업 설정을 지금 올린 파일에 맞춰 되살립니다. 고친 글자는 문항 문단에 바로 반영합니다. */
export function importWork(json: string, tplName: string, sources: SourceAnalysis[], current: WorkState): ImportResult {
  let w: WorkFile;
  try {
    w = JSON.parse(json) as WorkFile;
  } catch {
    throw new Error("작업 설정 파일(.json)을 읽지 못했습니다.");
  }
  if (w?.app !== "wonanji" || !Array.isArray(w.order)) throw new Error("원안지 편집기에서 저장한 작업 설정 파일이 아닙니다.");
  const all = sources.flatMap((s) => s.questions);
  const byKey = new Map(all.map((q) => [qKey(q), q]));
  const idOf = (k: string) => byKey.get(k)?.id;
  const seen = new Set<string>();
  const order: Question[] = [];
  let missing = 0;
  for (const k of w.order) {
    const q = byKey.get(k);
    if (!q) {
      missing++;
      continue;
    }
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    order.push(q);
  }
  // 저장할 때 없던 문항(새로 올린 파일 등)은 지금 순서대로 뒤에 붙입니다.
  for (const q of current.order) if (!seen.has(q.id)) order.push(q);
  const toMap = <T,>(list: [string, T][] | undefined) => new Map((list ?? []).map(([k, v]) => [idOf(k), v] as [string | undefined, T]).filter((x): x is [string, T] => !!x[0]));
  const spec: FormatSpec = { ...current.spec, merge: w.merge === "append" ? "append" : "split" };
  for (const k of OPTION_KEYS) if (w.options && k in w.options) (spec as unknown as Record<string, unknown>)[k] = w.options[k];
  if (w.headerFrom) {
    const i = sources.findIndex((s) => s.name === w.headerFrom);
    spec.headerFrom = i >= 0 ? i : "template";
  } else spec.headerFrom = "template";
  const fileOrder = (w.fileOrder ?? []).map((n) => sources.findIndex((s) => s.name === n)).filter((i) => i >= 0);
  for (let i = 0; i < sources.length; i++) if (!fileOrder.includes(i)) fileOrder.push(i);
  let edits = 0;
  const index = new Map<number, HeaderIndex>();
  for (const [k, i, text] of w.edits ?? []) {
    const q = byKey.get(k);
    const p = q && editableParas(q)[i];
    if (!q || !p) continue;
    let h = index.get(q.fileIdx);
    if (!h) index.set(q.fileIdx, (h = new HeaderIndex(sources[q.fileIdx].pkg)));
    if (paraText(p) !== text) {
      setParaText(p, text, h);
      refreshQuestion(q);
      edits++;
    }
  }
  return {
    state: {
      order,
      excluded: new Set((w.excluded ?? []).map(idOf).filter((x): x is string => !!x)),
      answers: toMap(w.answers),
      scores: toMap(w.scores),
      fixes: toMap(w.fixes),
      spec,
      fileOrder,
    },
    matched: w.order.length - missing,
    missing,
    edits,
    templateMismatch: !!w.template && w.template !== tplName,
    savedAt: w.savedAt,
  };
}

/** 정답 붙여넣기: ‘31254’, ‘③①②⑤④’, ‘1-3, 2-1’, ‘1번 ③’ 모두 받습니다. 번호가 붙어 있으면 [번호, 정답] 목록. */
export function parseAnswers(s: string): { seq: number[]; numbered: [number, number][] | null; bad: string[] } {
  const norm = s.replace(/[①②③④⑤]/g, (c) => String("①②③④⑤".indexOf(c) + 1));
  const pairs = [...norm.matchAll(/(\d+)\s*(?:번|[.)\-:=])\s*([1-5])(?!\d)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
  if (pairs.length >= 2) return { seq: [], numbered: pairs, bad: [] };
  const bad = [...new Set(norm.match(/[06-9]/g) ?? [])];
  const seq = [...norm.matchAll(/[1-5]/g)].map((m) => Number(m[0]));
  return { seq, numbered: null, bad };
}

// ── 검수 항목 묶기 ──

export const SEV_LABEL: Record<Issue["severity"], string> = { error: "확인 필요", warn: "검토 권장", info: "참고" };

/** 문항 번호 머리말(‘12번: ’, ‘논술형 2: ’)을 뗀 본문 */
export function bareMessage(msg: string): string {
  return msg.replace(/^(?:논술형\s*\d+|\d+번)\s*[:：]\s*/, "");
}

export interface IssueGroup {
  severity: Issue["severity"];
  rule: string;
  message: string;
  source: string;
  ids: string[];
  fix?: SymbolFix[];
}

/** 같은 규칙·같은 내용(번호만 다른 것)을 한 묶음으로 */
export function groupIssues(issues: Issue[]): IssueGroup[] {
  const out: IssueGroup[] = [];
  const at = new Map<string, IssueGroup>();
  for (const i of issues) {
    const message = i.questionId ? bareMessage(i.message) : i.message;
    const key = `${i.severity}|${i.rule}|${message}|${i.source}`;
    const g = at.get(key);
    if (g && i.questionId) {
      if (!g.ids.includes(i.questionId)) g.ids.push(i.questionId);
      continue;
    }
    const ng: IssueGroup = { severity: i.severity, rule: i.rule, message, source: i.source, ids: i.questionId ? [i.questionId] : [], fix: i.fix };
    if (i.questionId) at.set(key, ng);
    out.push(ng);
  }
  return out;
}

// ── 검수 보고서 ──

const CIRCLED = "①②③④⑤";
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export interface ReportInput {
  tplName: string;
  sources: SourceAnalysis[];
  active: Question[];
  excluded: Question[];
  spec: FormatSpec;
  out: { pages: number; issues: Issue[]; changes: Change[]; numbers: Map<string, number>; loss: { count: number; items: string[] }; previewAdjusted: boolean };
}

export function scoreOf(q: Question, spec: FormatSpec): number | null {
  return q.scoreOverride ?? q.score ?? (spec.unmarkedScore != null && q.kind === "mcq" ? spec.unmarkedScore : null);
}

export function checklist(o: ReportInput["out"], active: Question[], spec: FormatSpec): string[] {
  const unsure = o.issues.filter((i) => i.rule === "글자 인식 확인").length;
  const fixed = o.issues.filter((i) => i.rule === "쪽 기준 개체").length;
  const list = [
    o.previewAdjusted
      ? "첫 쪽 오른쪽 단이 머리 표 아래에서 시작하는지(미리보기도 한글처럼 맞춰 그렸습니다)"
      : "첫 쪽 오른쪽 단이 머리 표 아래에서 시작하는지(미리보기 엔진은 겹쳐 그릴 수 있습니다)",
    spec.keepTogether ? "한 문항이 단·쪽에서 쪼개지지 않았는지(‘문항이 쪼개지지 않게’는 한글에서만 반영)" : "단·쪽에서 쪼개진 문항이 없는지",
    "그림·표·〈보기〉 상자가 문항 안 제자리에 있고 글자와 겹치지 않는지",
    "학생 배부용은 ‘학생 배부용(정답 음영 없음)’ 파일로 인쇄할 것(교사용 파일에는 정답 음영이 있음)",
  ];
  if (unsure) list.push(`사진에서 인식한 문항의 빨간 글자(${unsure}문항)를 원본과 대조해 고쳤는지`);
  if (fixed) list.push(`쪽 기준으로 고정된 그림·도형(${fixed}문항)의 위치`);
  if (o.loss.count) list.push(`변환 손실 보고 ${o.loss.count}건(보고서 끝 목록)`);
  if (active.some((q) => q.symbolFixes?.length)) list.push("교사가 바꾼 기호가 〈보기〉·선지와 맞는지");
  return list;
}

export function buildReport(r: ReportInput): string {
  const { out: o, active, spec } = r;
  const num = (q: Question) => (q.kind === "essay" ? `논술형 ${o.numbers.get(q.id)}` : `${o.numbers.get(q.id)}번`);
  const L: string[] = [
    `원안지 편집 검수 보고서 (${new Date().toLocaleString("ko-KR")})`,
    `양식: ${r.tplName}`,
    `문항 파일: ${r.sources.map((s) => s.name).join(", ")}`,
    `합치는 방식: ${spec.merge === "append" ? "출처별로 이어 붙이기(번호 새로 매김)" : "선생님별 번호 분담(원래 번호순)"}`,
    `결과: ${o.pages}쪽, 선택형 ${active.filter((q) => q.kind === "mcq").length}문항, 논술형 ${active.filter((q) => q.kind === "essay").length}문항`,
    "",
    "■ 적용한 편집 옵션",
    `  본문 ${spec.fontFace || "양식 글꼴"} ${spec.sizePt}pt · 줄간격 ${spec.lineSpacing}% · 문항 배치 ${spec.layout === "balanced" ? "단마다 균등" : `빈 줄 ${spec.gapLines}줄 고정`}`,
    `  부정어 ${spec.negation === "off" ? "손대지 않음" : spec.negationStyle === "underline" ? "밑줄만" : "밑줄+진하게"} · 배점 표기 ${!spec.normalizeScore ? "원본 유지" : spec.scoreDecimal ? "[4.0점]" : "[4점]"} · 표기 없는 배점 ${spec.unmarkedScore == null ? "누락으로 봄" : `${spec.unmarkedScore}점`}`,
    `  〈보기〉 상자 ${spec.boxStyle === "template" ? "양식 틀로 통일" : "원본 유지"} · 선지 ${spec.choiceLayout === "auto" ? "자동 배열" : "원본 배열"} · 글자색 ${spec.keepColors ? "원본 유지" : "모두 검정"}`,
    "",
    "■ 최종 확인표(결과 번호 · 출처 · 정답 · 배점)",
  ];
  for (const q of active) {
    const a = q.kind === "mcq" ? (q.answers.length ? q.answers.map((x) => CIRCLED[x - 1]).join("") + (q.answerOverride ? "(지정)" : "") : "없음") : "—";
    const sc = scoreOf(q, spec);
    L.push(`  ${num(q).padEnd(7)} 「${q.fileName}」 원래 ${q.srcNumber ?? "?"}번 · 정답 ${a} · 배점 ${sc == null ? "없음" : fmt(sc) + (q.scoreOverride != null ? "(지정)" : "")}`);
  }
  if (r.excluded.length) {
    L.push("", "■ 뺀 문항");
    for (const q of r.excluded) L.push(`  「${q.fileName}」 원래 ${q.srcNumber ?? "?"}번 ${q.kind === "essay" ? "(논술형)" : ""} ${q.summary.slice(0, 40)}`);
  }
  L.push("", "■ 편집 검수(문항 글자·기호는 바꾸지 않았습니다)");
  for (const g of groupIssues(o.issues)) {
    const nums = g.ids.map((id) => active.find((q) => q.id === id)).filter((q): q is Question => !!q).map(num);
    L.push(`  [${SEV_LABEL[g.severity]}] ${g.rule}${nums.length ? ` (${nums.join(", ")})` : ""}: ${g.message}`, `      근거: ${g.source}`);
  }
  L.push("", "■ 한글에서 확인할 것");
  checklist(o, active, spec).forEach((c, i) => L.push(`  ${i + 1}. ${c}`));
  L.push("", "■ 형식만 고친 것");
  const byKind = new Map<string, Change[]>();
  for (const c of o.changes) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c]);
  for (const [k, list] of byKind) {
    L.push(`  ${k} ${list.length}건`);
    for (const c of list) {
      const q = c.questionId ? active.find((x) => x.id === c.questionId) : null;
      L.push(`    - ${q ? num(q) + " " : ""}${c.detail}`);
    }
  }
  if (o.loss.count) {
    L.push("", "■ 변환 손실 보고");
    for (const it of o.loss.items) L.push(`  - ${it}`);
  }
  return L.join("\n");
}
