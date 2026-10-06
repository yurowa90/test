import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { editableParas, isEdited, paraSegments, paraText, restorePara, setParaText, unsureCount } from "../engine/edit";
import { HeaderIndex } from "../engine/header";
import { refreshQuestion } from "../engine/segment";
import type { FormatSpec, Issue, MergeMode, Question, SourceAnalysis, SymbolFix } from "../engine/types";
import { bareMessage, parseAnswers, scoreOf, SEV_LABEL } from "../work";

interface Props {
  order: Question[];
  excluded: Set<string>;
  /** 화면에서 지정한 정답(문항 ID → 번호들) */
  answers: Map<string, number[]>;
  scores: Map<string, number>;
  fixes: Map<string, SymbolFix[]>;
  issues: Issue[];
  spec: FormatSpec;
  sources: SourceAnalysis[];
  /** 사진 파일의 원본 그림 주소(파일 번호 → blob URL) */
  imageUrls: Map<number, string>;
  fileOrder: number[];
  /** 다른 곳(5단계 검수·요약)에서 이 문항으로 오라고 할 때 */
  focus: { id: string; n: number } | null;
  onMove: (id: string, dir: -1 | 1) => void;
  onMoveTo: (id: string, n: number) => void;
  onToggle: (id: string) => void;
  onIncludeAll: () => void;
  onAnswer: (id: string, a: number[] | null) => void;
  onAnswers: (list: [string, number][]) => void;
  onScore: (id: string, v: number | null) => void;
  onFix: (id: string, fix: SymbolFix[] | null) => void;
  onMerge: (m: MergeMode) => void;
  onFileOrder: (order: number[]) => void;
  onResetOrder: () => void;
  onEdited: () => void;
  onSaveWork: () => void;
  onLoadWork: (f: File) => void;
}

const CIRCLED = "①②③④⑤";
const SEV_TONE: Record<Issue["severity"], string> = {
  error: "border-danger/50 bg-danger-soft text-danger",
  warn: "border-warn/50 bg-warn-soft text-warn",
  info: "border-line bg-surface-2 text-ink-2",
};

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function QuestionBoard(props: Props) {
  const { order, excluded, answers, scores, fixes, issues, spec, sources, imageUrls, fileOrder, focus } = props;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const loadRef = useRef<HTMLInputElement>(null);
  const answerOf = (q: Question) => answers.get(q.id) ?? q.answers;
  const active = order.filter((q) => !excluded.has(q.id));
  const mcqs = active.filter((q) => q.kind === "mcq");
  const essays = active.filter((q) => q.kind === "essay");
  const withOverride = (q: Question) => ({ ...q, scoreOverride: scores.get(q.id) });
  const unmarkedN = active.filter((q) => scoreOf(withOverride(q), spec) == null).length;
  const total = active.reduce((a, q) => a + (scoreOf(withOverride(q), spec) ?? 0), 0);
  const known = mcqs.filter((q) => answerOf(q).length === 1);
  const dist = [1, 2, 3, 4, 5].map((k) => known.filter((q) => answerOf(q)[0] === k).length);
  const maxD = Math.max(1, ...dist);
  const noAnswer = mcqs.filter((q) => !answerOf(q).length).length;
  const distNotes = issues.filter((i) => ["정답 편중", "정답 연속", "정답 개수 동일"].includes(i.rule));
  const sevCount = { error: 0, warn: 0, info: 0 };
  for (const i of issues) sevCount[i.severity]++;

  // 문항별 검수: 확인·검토 항목, 그리고 참고라도 기호 불일치·기호 바꿈은 줄에 띄웁니다(원문은 바꾸지 않음).
  const perQ = useMemo(() => {
    const m = new Map<string, Issue[]>();
    for (const i of issues) {
      if (!i.questionId) continue;
      if (i.severity === "info" && !["기호 불일치", "기호 바꿈"].includes(i.rule)) continue;
      m.set(i.questionId, [...(m.get(i.questionId) ?? []), i]);
    }
    return m;
  }, [issues]);
  const flagged = (id: string, rule: string) => (perQ.get(id) ?? []).some((i) => i.rule === rule);

  const finalNo = new Map<string, number>();
  mcqs.forEach((q, i) => finalNo.set(q.id, i + 1));
  essays.forEach((q, i) => finalNo.set(q.id, i + 1));
  const label = (q: Question) => (excluded.has(q.id) ? `원래 ${q.srcNumber ?? "?"}번(뺌)` : q.kind === "essay" ? `논술형 ${finalNo.get(q.id)}` : `${finalNo.get(q.id)}번`);

  // 다른 곳에서 이 문항으로 오라고 하면 줄을 펼치고 화면 가운데로
  useEffect(() => {
    if (!focus) return;
    setOpen((s) => new Set(s).add(focus.id));
    setFlash(focus.id);
    const t = setTimeout(() => document.getElementById(`q-${focus.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    const t2 = setTimeout(() => setFlash(null), 2400);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [focus]);

  const toggleOpen = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const withIssues = active.filter((q) => perQ.has(q.id)).map((q) => q.id);
  const allOpen = withIssues.length > 0 && withIssues.every((id) => open.has(id));

  const groups: { title: string; list: Question[] }[] = [
    { title: "선택형", list: order.filter((q) => q.kind === "mcq") },
    { title: "논술형", list: order.filter((q) => q.kind === "essay") },
  ];
  const fileNames = fileOrder.map((i) => sources[i]).filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div>
          <dl className="grid grid-cols-2 border-l border-t border-line sm:grid-cols-4">
            <Stat k="선택형" v={`${mcqs.length}문항`} />
            <Stat k="논술형" v={`${essays.length}문항`} />
            <Stat
              k="배점 합계"
              v={`${fmt(total)}점`}
              tone={Math.abs(total - 100) > 0.01 ? "warn" : undefined}
              sub={unmarkedN ? `배점 없는 ${unmarkedN}문항은 0점으로 셈` : Math.abs(total - 100) > 0.01 ? "100점이 아닙니다" : undefined}
              link={unmarkedN ? { href: "#s-options", text: "표기 없는 배점 정하기(4단계)" } : undefined}
            />
            <Stat k="정답 미지정" v={`${noAnswer}문항`} tone={noAnswer ? "danger" : undefined} sub={noAnswer ? "아래 ‘정답 한꺼번에 입력’ 가능" : undefined} />
          </dl>
          <p className="mt-1.5 text-[12px] text-ink-2">
            검수: <b className="text-danger">{SEV_LABEL.error} {sevCount.error}</b> · <b className="text-warn">{SEV_LABEL.warn} {sevCount.warn}</b> · {SEV_LABEL.info} {sevCount.info} — 문항 줄의 ‘검수 N건’을 누르면 펼쳐집니다.
          </p>
        </div>
        <figure className="border border-line bg-paper px-4 py-2">
          <figcaption className="text-[11px] font-bold text-ink-3">정답 분포 · 정답이 정해진 {known.length}문항 기준</figcaption>
          <div className="mt-1 flex items-end gap-3" role="img" aria-label={`정답 분포 ${dist.map((d, i) => `${CIRCLED[i]} ${d}`).join(", ")}`}>
            {dist.map((d, i) => (
              <div key={i} className="flex w-6 flex-col items-center gap-0.5">
                <span className="text-[11px] tabular-nums text-ink-2">{d}</span>
                <div className={`w-3.5 ${d === maxD && d > 0 ? "bg-primary" : "bg-ink/70"}`} style={{ height: `${3 + (d / maxD) * 30}px` }} />
                <span className="serif text-[13px]">{CIRCLED[i]}</span>
              </div>
            ))}
          </div>
          {distNotes.map((n, k) => (
            <p key={k} className={`mt-1 max-w-[15rem] text-[11px] leading-snug ${n.severity === "warn" ? "text-warn" : "text-ink-3"}`}>
              {n.rule}: {n.message}
            </p>
          ))}
        </figure>
      </div>

      {/* 합치는 방식 */}
      {sources.length > 1 && (
        <fieldset className="border border-line bg-paper px-3 py-2.5">
          <legend className="px-1 text-[12px] font-bold text-ink">합치는 방식</legend>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="합치는 방식">
            {(
              [
                ["split", "선생님별 번호 분담", "선생님마다 맡은 번호만 쓰고 나머지는 비워 둔 파일. 원래 번호순으로 모으고, 같은 번호가 두 파일에 있으면 알려 줍니다."],
                ["append", "출처별로 이어 붙이기", "파일마다 1번부터 매긴 파일(다른 시험지·PDF·사진). 파일 순서대로 붙이고 번호는 새로 매깁니다."],
              ] as [MergeMode, string, string][]
            ).map(([m, t, d]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={spec.merge === m}
                onClick={() => spec.merge !== m && props.onMerge(m)}
                className={`border px-3 py-2 text-left ${spec.merge === m ? "border-primary bg-primary-soft" : "border-line-strong hover:border-primary"}`}
              >
                <span className="flex items-center gap-2 text-[13px] font-bold text-ink">
                  <span className={`inline-block h-3 w-3 rounded-full border ${spec.merge === m ? "border-primary bg-primary" : "border-line-strong"}`} />
                  {t}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-2">{d}</span>
              </button>
            ))}
          </div>
          {spec.merge === "append" && (
            <div className="mt-2">
              <p className="text-[11.5px] font-bold text-ink-3">파일 순서(위에서부터 이어 붙임)</p>
              <ol className="mt-1 divide-y divide-line border border-line">
                {fileNames.map((s, k) => (
                  <li key={s.fileIdx} className="flex items-center justify-between gap-2 px-2 py-1 text-[12.5px]">
                    <span className="truncate">
                      <b className="mr-1.5 tabular-nums">{k + 1}</b>
                      {s.name} <span className="text-ink-3">({s.questions.filter((q) => q.kind === "mcq").length}문항)</span>
                    </span>
                    <span className="shrink-0">
                      <IconBtn label={`${s.name} 위로`} disabled={k === 0} onClick={() => props.onFileOrder(swap(fileOrder, k, k - 1))}>
                        ↑
                      </IconBtn>
                      <IconBtn label={`${s.name} 아래로`} disabled={k === fileNames.length - 1} onClick={() => props.onFileOrder(swap(fileOrder, k, k + 1))}>
                        ↓
                      </IconBtn>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-2 border-l-[3px] border-l-primary bg-primary-soft/40 px-3 py-2">
        <p className="w-full text-[12.5px] text-ink-2">
          문항 줄을 누르면 전문과 검수가 펼쳐집니다. <b className="text-ink">결과 번호</b>를 누르면 그 번호로 옮길 수 있고, 뺄 문항은 체크를 푸세요. 정답 표시가 없거나 틀린 문항은 <b className="text-ink">정답</b> 칸에서 고르면(숫자 1~5 키도 됨) 결과에 음영으로 표시합니다.
        </p>
        <button type="button" onClick={props.onResetOrder} className="btn btn-line !min-h-0 !px-2 !py-1 text-xs">
          순서만 처음대로
        </button>
        {excluded.size > 0 && (
          <button type="button" onClick={props.onIncludeAll} className="btn btn-line !min-h-0 !px-2 !py-1 text-xs">
            뺀 문항 {excluded.size}개 다시 넣기
          </button>
        )}
        {withIssues.length > 0 && (
          <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(withIssues))} className="btn btn-line !min-h-0 !px-2 !py-1 text-xs" aria-expanded={allOpen}>
            검수 {allOpen ? "모두 접기" : `있는 ${withIssues.length}문항 모두 펼치기`}
          </button>
        )}
        <button type="button" onClick={() => setBulkOpen(!bulkOpen)} className="btn btn-line !min-h-0 !px-2 !py-1 text-xs" aria-expanded={bulkOpen}>
          정답 한꺼번에 입력 {bulkOpen ? "▲" : "▼"}
        </button>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={props.onSaveWork} className="btn btn-line !min-h-0 !px-2 !py-1 text-xs" title="순서·포함 여부·정답·배점·고친 글자·옵션을 파일로 저장(문항 파일은 들어가지 않음)">
            작업 저장(.json)
          </button>
          <button type="button" onClick={() => loadRef.current?.click()} className="btn btn-line !min-h-0 !px-2 !py-1 text-xs">
            작업 불러오기
          </button>
          <input
            ref={loadRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) props.onLoadWork(f);
              e.target.value = "";
            }}
          />
        </span>
      </div>

      {bulkOpen && <BulkAnswers order={order} excluded={excluded} sources={sources} finalNo={finalNo} onApply={props.onAnswers} />}

      {groups
        .filter((g) => g.list.length)
        .map((g) => (
          <div key={g.title} className="border border-line bg-paper">
            {/* 제목은 가로 스크롤 밖에 두어, 좁은 화면에서 표를 밀어도 보이게 합니다. */}
            <div className="border-b-2 border-ink px-3 py-1.5 text-left">
              <span className="serif text-[15px] font-bold">{g.title}</span>
              <span className="ml-2 text-xs text-ink-3">{g.list.filter((q) => !excluded.has(q.id)).length}문항</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm" aria-label={`${g.title} 문항`}>
                <thead className="text-[11px] text-ink-3">
                  <tr className="border-b border-line">
                    <th className="sticky left-0 z-[2] w-10 bg-paper px-2 py-1.5 font-bold">포함</th>
                    <th className="sticky left-10 z-[2] w-14 bg-paper px-2 py-1.5 text-right font-bold">결과</th>
                    <th className="w-12 px-2 py-1.5 text-right font-bold">원래</th>
                    <th className="px-2 py-1.5 text-left font-bold">발문 · 검수</th>
                    <th className="w-20 px-2 py-1.5 text-right font-bold">배점</th>
                    <th className="w-24 px-2 py-1.5 font-bold">정답</th>
                    <th className="w-28 px-2 py-1.5 text-left font-bold">파일</th>
                    <th className="w-20 px-2 py-1.5 font-bold">순서</th>
                  </tr>
                </thead>
                <tbody>
                  {g.list.map((q) => (
                    <Row
                      key={q.id}
                      q={q}
                      off={excluded.has(q.id)}
                      finalNo={finalNo.get(q.id)}
                      label={label(q)}
                      list={excluded.has(q.id) ? [] : (perQ.get(q.id) ?? [])}
                      open={open.has(q.id)}
                      flash={flash === q.id}
                      dupNum={flagged(q.id, "번호 중복")}
                      dupContent={flagged(q.id, "중복 문항 의심")}
                      chosen={answers.get(q.id)}
                      score={scores.get(q.id)}
                      fix={fixes.get(q.id)}
                      source={sources[q.fileIdx]}
                      imageUrl={imageUrls.get(q.fileIdx)}
                      onToggleOpen={() => toggleOpen(q.id)}
                      {...props}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </div>
  );
}

function swap(a: number[], i: number, j: number): number[] {
  const n = [...a];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex min-h-9 min-w-9 items-center justify-center text-ink-2 hover:bg-primary-soft hover:text-primary disabled:opacity-30 sm:min-h-7 sm:min-w-7"
    >
      {children}
    </button>
  );
}

interface RowProps extends Props {
  q: Question;
  off: boolean;
  finalNo?: number;
  label: string;
  list: Issue[];
  open: boolean;
  flash: boolean;
  dupNum: boolean;
  dupContent: boolean;
  chosen?: number[];
  score?: number;
  fix?: SymbolFix[];
  source?: SourceAnalysis;
  imageUrl?: string;
  onToggleOpen: () => void;
}

function Row(p: RowProps) {
  const { q, off, list, open, chosen, spec } = p;
  const [editNo, setEditNo] = useState(false);
  const detected = q.answers;
  const sym = list.find((i) => i.rule === "기호 불일치");
  const tone = p.flash ? "bg-answer/60" : p.dupNum ? "bg-danger-soft" : p.dupContent ? "bg-warn-soft" : "bg-paper";
  const sc = scoreOf({ ...q, scoreOverride: p.score }, spec);
  const missingScore = sc == null;
  const unmarked = q.score == null && p.score == null && sc != null;
  return (
    <>
      <tr id={`q-${q.id}`} className={`border-b border-line/70 align-top ${off ? "opacity-45" : ""} ${tone} scroll-mt-nav transition-colors`}>
        <td className={`sticky left-0 z-[1] px-2 py-2 text-center ${tone}`}>
          <input type="checkbox" checked={!off} onChange={() => p.onToggle(q.id)} aria-label={`${p.label} 포함`} className="h-[18px] w-[18px] accent-primary" />
        </td>
        <td className={`sticky left-10 z-[1] px-2 py-2 text-right ${tone}`}>
          {off ? (
            <span className="text-ink-3">—</span>
          ) : editNo ? (
            <input
              type="number"
              min={1}
              autoFocus
              defaultValue={p.finalNo}
              aria-label={`${p.label}을 옮길 번호`}
              className="field !min-h-0 !w-14 !px-1 !py-0.5 text-right tabular-nums"
              onBlur={() => setEditNo(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditNo(false);
                if (e.key === "Enter") {
                  const n = Number((e.target as HTMLInputElement).value);
                  if (Number.isFinite(n) && n >= 1) p.onMoveTo(q.id, Math.round(n));
                  setEditNo(false);
                }
              }}
            />
          ) : (
            <button type="button" onClick={() => setEditNo(true)} className="serif min-h-9 min-w-9 text-[15px] font-bold tabular-nums underline decoration-line-strong decoration-dotted underline-offset-4 hover:text-primary sm:min-h-0" title="눌러서 다른 번호로 옮기기" aria-label={`${p.label} — 눌러서 다른 번호로 옮기기`}>
              {p.finalNo}
            </button>
          )}
        </td>
        <td className={`px-2 py-2 text-right tabular-nums ${p.dupNum ? "font-bold text-danger" : "text-ink-3"}`}>{q.srcNumber ?? "?"}</td>
        <td className="max-w-0 px-2 py-2">
          <button type="button" onClick={p.onToggleOpen} className="block w-full truncate text-left text-ink hover:text-primary" aria-expanded={open} title={q.summary}>
            {q.summary}
          </button>
          <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-3">
            {[q.objects.pic && `그림 ${q.objects.pic}`, q.objects.tbl && `표·상자 ${q.objects.tbl}`, q.objects.equation && `수식 ${q.objects.equation}`].filter(Boolean).join(" · ")}
            {list.length > 0 && (
              <button type="button" onClick={p.onToggleOpen} className="font-bold text-warn underline-offset-2 hover:underline" aria-expanded={open}>
                검수 {list.length}건 {open ? "▲" : "▼"}
              </button>
            )}
            {p.dupContent && <span className="font-bold text-warn">중복 의심</span>}
            {p.fix?.length ? <span className="font-bold text-ok">기호 바꿈</span> : null}
          </p>
          {sym && !open && (
            <p className="mt-1 border-l-2 border-warn bg-warn-soft px-2 py-0.5 text-[11.5px] text-warn">
              <b>기호 불일치</b> · {bareMessage(sym.message)}
            </p>
          )}
        </td>
        <td className="px-2 py-2 text-right">
          <input
            type="number"
            step={0.5}
            min={0}
            value={p.score ?? q.score ?? ""}
            placeholder={unmarked ? `${spec.unmarkedScore}` : "없음"}
            aria-label={`${p.label} 배점`}
            onChange={(e) => {
              const v = e.target.value === "" ? null : Number(e.target.value);
              p.onScore(q.id, v == null || !Number.isFinite(v) || v === q.score ? null : v);
            }}
            className={`field !min-h-0 !w-16 !px-1 !py-0.5 text-right tabular-nums ${p.score != null ? "!bg-answer" : ""} ${missingScore && !off ? "!border-danger" : ""}`}
          />
          <span className="block text-[11px] text-ink-3">{p.score != null ? "직접 지정" : unmarked ? "표기 없음" : missingScore ? "표기 없음" : ""}</span>
        </td>
        <td className="px-2 py-2 text-center">
          {q.kind === "essay" ? (
            <span className="text-ink-3">—</span>
          ) : (
            <div className="flex flex-col items-center gap-0.5">
              <select
                value={chosen && chosen.length === 1 ? String(chosen[0]) : ""}
                onChange={(e) => p.onAnswer(q.id, e.target.value ? [Number(e.target.value)] : null)}
                onKeyDown={(e) => {
                  if (/^[1-5]$/.test(e.key)) {
                    e.preventDefault();
                    const n = Number(e.key);
                    p.onAnswer(q.id, detected.length === 1 && detected[0] === n ? null : [n]);
                  } else if (e.key === "0" || e.key === "Delete") {
                    e.preventDefault();
                    p.onAnswer(q.id, null);
                  }
                }}
                aria-label={`${p.label} 정답`}
                className={`field !min-h-9 !w-auto !px-1 !py-0.5 text-center text-[13px] sm:!min-h-0 ${!detected.length && !chosen ? "!border-danger" : ""} ${chosen ? "!bg-answer" : ""}`}
              >
                <option value="">{detected.length ? `표시 ${detected.map((a) => CIRCLED[a - 1]).join("")}` : "없음"}</option>
                {[1, 2, 3, 4, 5].map((k) => (
                  <option key={k} value={k}>
                    {CIRCLED[k - 1]}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-ink-3">{chosen ? "직접 지정" : detected.length ? "형광펜" : "정답 없음"}</span>
            </div>
          )}
        </td>
        <td className="max-w-0 truncate px-2 py-2 text-xs text-ink-2" title={q.fileName}>
          {q.fileName}
        </td>
        <td className="whitespace-nowrap px-1 py-1 text-center">
          <IconBtn label={`${p.label} 위로`} onClick={() => p.onMove(q.id, -1)}>
            ↑
          </IconBtn>
          <IconBtn label={`${p.label} 아래로`} onClick={() => p.onMove(q.id, 1)}>
            ↓
          </IconBtn>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line bg-surface">
          <td colSpan={8} className="px-3 py-3">
            <Detail {...p} />
          </td>
        </tr>
      )}
    </>
  );
}

function Detail(p: RowProps) {
  const { q, list, fix } = p;
  const fixable = list.flatMap((i) => i.fix ?? []);
  return (
    <div className="sticky left-3 max-w-[calc(100vw-4rem)] space-y-3 md:max-w-none">
      {list.length > 0 && (
        <ul className="space-y-1">
          {list.map((i, k) => (
            <li key={k} className="flex flex-wrap items-start gap-1.5 text-[12px] leading-snug">
              <span className={`shrink-0 border px-1 text-[11px] font-bold ${SEV_TONE[i.severity]}`}>{SEV_LABEL[i.severity]}</span>
              <span className="min-w-0 flex-1">
                <b className="text-ink">{i.rule}</b> <span className="text-ink-2">{bareMessage(i.message)}</span>
              </span>
              {i.fix && (
                <button type="button" onClick={() => p.onFix(q.id, mergeFix(fix, i.fix!))} className="btn btn-line !min-h-0 !px-2 !py-0.5 text-[11.5px]">
                  양식 기호로 바꾸기 ({i.fix.map((f) => `${f.from}→${f.to}`).join(", ")})
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {fix?.length ? (
        <p className="flex flex-wrap items-center gap-2 text-[12px] text-ok">
          바꾼 기호(교사 확인): {fix.map((f) => `‘${f.from}’ → ‘${f.to}’`).join(", ")}
          <button type="button" onClick={() => p.onFix(q.id, null)} className="btn btn-line !min-h-0 !px-2 !py-0.5 text-[11.5px]">
            되돌리기
          </button>
        </p>
      ) : null}
      {!fixable.length && list.some((i) => i.rule === "기호 불일치") && <p className="text-[11.5px] text-ink-3">〈보기〉 상자 표시·항목 기호·불릿은 문항 구조와 맞물려 있어 원본에서 고쳐 주세요.</p>}
      {p.imageUrl ? (
        <TextEditor q={q} source={p.source} imageUrl={p.imageUrl} onEdited={p.onEdited} />
      ) : (
        <div>
          <p className="text-[11px] font-bold text-ink-3">문항 전문(읽기 전용)</p>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap border border-line bg-paper px-3 py-2 font-sans text-[12.5px] leading-relaxed text-ink">{q.text.replace(/￼/g, "[그림·표]")}</pre>
        </div>
      )}
    </div>
  );
}

function mergeFix(cur: SymbolFix[] | undefined, add: SymbolFix[]): SymbolFix[] {
  const out = [...(cur ?? [])];
  for (const f of add) if (!out.some((x) => x.fam === f.fam && x.from === f.from)) out.push(f);
  return out;
}

/** 사진에서 인식한 문항: 원본 사진과 인식 글자를 나란히 두고, 교사가 문단마다 고칩니다(고친 글은 검정). */
function TextEditor({ q, source, imageUrl, onEdited }: { q: Question; source?: SourceAnalysis; imageUrl: string; onEdited: () => void }) {
  const [rev, setRev] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [zoom, setZoom] = useState(false);
  const index = useMemo(() => (source ? new HeaderIndex(source.pkg) : null), [source]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const paras = useMemo(() => editableParas(q), [q, rev]);
  if (!index) return null;
  const unsureTotal = paras.reduce((a, p) => a + unsureCount(p, index), 0);
  const done = () => {
    refreshQuestion(q);
    setRev((r) => r + 1);
    setEditing(null);
    onEdited();
  };
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <figure className="min-w-0">
        <figcaption className="flex items-center justify-between text-[11px] font-bold text-ink-3">
          <span>원본 사진(전체) — 이 문항 부분을 찾아 대조하세요</span>
          <button type="button" onClick={() => setZoom(!zoom)} className="btn btn-line !min-h-0 !px-2 !py-0.5 text-[11px]" aria-pressed={zoom}>
            {zoom ? "맞춰 보기" : "크게 보기"}
          </button>
        </figcaption>
        <div className="mt-1 max-h-[28rem] overflow-auto border border-line bg-white">
          <img src={imageUrl} alt={`${q.fileName} 원본 사진`} className={zoom ? "w-[220%] max-w-none" : "w-full"} />
        </div>
      </figure>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-ink-3">
          인식한 글자 — <span className="text-danger">빨간 글자</span> {unsureTotal}자는 확신이 낮습니다. 문단의 ‘고치기’를 눌러 원본대로 고치세요.
        </p>
        <ol className="mt-1 max-h-[28rem] space-y-1.5 overflow-auto">
          {paras.map((p, i) => (
            <li key={i} className="border border-line bg-paper px-2 py-1.5 text-[13px] leading-relaxed">
              {editing === i ? (
                <div className="space-y-1">
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.min(6, Math.max(2, Math.ceil(draft.length / 38)))} className="field !min-h-0 text-[13px]" aria-label={`${i + 1}번째 문단 고치기`} autoFocus />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="btn btn-primary !min-h-0 !px-2 !py-0.5 text-[12px]"
                      onClick={() => {
                        if (draft !== paraText(p)) setParaText(p, draft, index);
                        done();
                      }}
                    >
                      고친 글 넣기
                    </button>
                    <button type="button" className="btn btn-line !min-h-0 !px-2 !py-0.5 text-[12px]" onClick={() => setEditing(null)}>
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 whitespace-pre-wrap">
                    {paraSegments(p, index).map((s, k) =>
                      s.unsure ? (
                        <mark key={k} className="bg-danger-soft text-danger underline decoration-danger/50">
                          {s.text}
                        </mark>
                      ) : (
                        <span key={k}>{s.text}</span>
                      ),
                    )}
                    {isEdited(p) && <span className="ml-1 text-[11px] font-bold text-ok">고침</span>}
                  </p>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="btn btn-line !min-h-0 !px-2 !py-0.5 text-[11.5px]"
                      onClick={() => {
                        setDraft(paraText(p));
                        setEditing(i);
                      }}
                    >
                      고치기
                    </button>
                    {isEdited(p) && (
                      <button
                        type="button"
                        className="btn btn-line !min-h-0 !px-2 !py-0.5 text-[11.5px]"
                        onClick={() => {
                          restorePara(p);
                          done();
                        }}
                      >
                        원래대로
                      </button>
                    )}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function BulkAnswers({ order, excluded, sources, finalNo, onApply }: { order: Question[]; excluded: Set<string>; sources: SourceAnalysis[]; finalNo: Map<string, number>; onApply: (list: [string, number][]) => void }) {
  const [target, setTarget] = useState("all");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const included = order.filter((q) => q.kind === "mcq" && !excluded.has(q.id));
  const list = target === "all" ? included : sources[Number(target)]?.questions.filter((q) => q.kind === "mcq") ?? [];
  const parsed = parseAnswers(text);
  const numberOf = (q: Question) => (target === "all" ? finalNo.get(q.id) : q.srcNumber);
  const pairs: [string, number][] = parsed.numbered
    ? parsed.numbered.map(([n, a]) => [list.find((q) => numberOf(q) === n)?.id ?? "", a] as [string, number]).filter(([id]) => id)
    : parsed.seq.slice(0, list.length).map((a, i) => [list[i].id, a]);
  const count = parsed.numbered ? parsed.numbered.length : parsed.seq.length;
  return (
    <div className="border border-line bg-paper px-3 py-3">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <label className="font-bold text-ink" htmlFor="bulk-target">
          대상
        </label>
        <select id="bulk-target" value={target} onChange={(e) => setTarget(e.target.value)} className="field !w-auto !min-h-0 !py-1 text-[12.5px]">
          <option value="all">결과 번호순 — 포함한 선택형 {included.length}문항</option>
          {sources.map((s, i) => (
            <option key={i} value={i}>
              「{s.name}」 원래 번호순 — {s.questions.filter((q) => q.kind === "mcq").length}문항
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setMsg(null);
        }}
        rows={2}
        placeholder="예: 31254 21345 …   또는 ③①②⑤④   또는 1-3, 2-1, 3-2(번호-정답)"
        className="field mt-2 font-mono text-[13px]"
        aria-label="정답 붙여넣기"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
        <span className={parsed.bad.length || (count && count !== list.length && !parsed.numbered) ? "text-warn" : "text-ink-2"}>
          {parsed.bad.length
            ? `1~5가 아닌 숫자(${parsed.bad.join(", ")})는 건너뜁니다. `
            : ""}
          읽은 정답 {count}개 / 대상 {list.length}문항{parsed.numbered ? " (번호-정답 짝으로 읽음)" : count && count !== list.length ? " — 개수가 다릅니다. 앞에서부터 넣습니다." : ""}
        </span>
        <button
          type="button"
          disabled={!pairs.length}
          onClick={() => {
            onApply(pairs);
            setMsg(`${pairs.length}문항에 정답을 넣었습니다. 형광펜 표시와 같은 정답은 ‘형광펜’으로 둡니다.`);
          }}
          className="btn btn-primary !min-h-0 !px-3 !py-1 text-[12.5px]"
        >
          {pairs.length}문항에 넣기
        </button>
        {msg && <span className="text-ok">{msg}</span>}
      </div>
    </div>
  );
}

function Stat({ k, v, sub, tone, link }: { k: string; v: string; sub?: string; tone?: "warn" | "danger"; link?: { href: string; text: string } }) {
  const bg = tone === "warn" ? "bg-warn-soft" : tone === "danger" ? "bg-danger-soft" : "bg-paper";
  const fg = tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-ink";
  return (
    <div className={`border-b border-r border-line px-3 py-2 ${bg}`}>
      <dt className="text-[11px] font-bold text-ink-3">{k}</dt>
      <dd className={`serif text-[20px] font-bold leading-tight tabular-nums ${fg}`}>{v}</dd>
      {sub && <dd className={`text-[11.5px] leading-snug ${fg}`}>{sub}</dd>}
      {link && (
        <dd>
          <a href={link.href} className="text-[11.5px] font-bold text-primary underline underline-offset-2">
            {link.text}
          </a>
        </dd>
      )}
    </div>
  );
}
