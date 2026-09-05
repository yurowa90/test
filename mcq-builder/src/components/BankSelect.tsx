import { useMemo, useState } from "react";
import type {
  Assembly,
  AssemblyContext,
  ItemBank,
  ItemFormat,
  Proposition,
  SourceMode,
  Stimulus,
} from "../types";
import { FORMAT_LABELS } from "../types";
import { CIRCLED, assemble, composeStem, pickLabel } from "../lib/assemble";
import {
  BEHAVIOR_CHIP,
  BEHAVIOR_SHORT,
  LEVEL_CHIP,
  LEVEL_HINT,
  TIER_CHIP,
  TRUTH_CHIP,
} from "../lib/markers";
import StimulusBody from "./StimulusBody";

interface Props {
  bank: ItemBank;
  format: ItemFormat;
  bogiCount: 3 | 4;
  sourceMode: SourceMode;
  busy: boolean;
  /** 결과 화면에서 되돌아온 경우 이전 자료·조립을 복원 */
  initialStimulus?: Stimulus | null;
  initialAssembly?: Assembly | null;
  onBack: () => void;
  onRegenerate: () => void;
  onConfirm: (stimulus: Stimulus, assembly: Assembly) => void;
}

function PropCard({
  p,
  order,
  label,
  full,
  onToggle,
}: {
  p: Proposition;
  order: number;
  label: string;
  full: boolean;
  onToggle: () => void;
}) {
  const picked = order >= 0;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={picked}
        disabled={!picked && full}
        className={[
          "w-full rounded-lg border p-3 text-left transition",
          picked
            ? "border-blueprint bg-blueprint/5"
            : "border-paper-line bg-white hover:border-ink-soft/40",
          "disabled:cursor-not-allowed disabled:opacity-45",
        ].join(" ")}
      >
        <div className="flex items-start gap-2.5">
          <span
            className={[
              "mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded border px-1 text-[11px] font-bold",
              picked
                ? "border-blueprint bg-blueprint text-white"
                : "border-ink-soft/40 text-transparent",
            ].join(" ")}
            aria-hidden
          >
            {picked ? label : "·"}
          </span>
          <span className="flex-1 text-sm leading-relaxed text-ink">{p.text}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${LEVEL_CHIP[p.level]}`}
            title={LEVEL_HINT[p.level]}
          >
            수준 {p.level}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${BEHAVIOR_CHIP[p.behavior]}`}
          >
            {BEHAVIOR_SHORT[p.behavior]}
          </span>
        </div>
      </button>
      <details className="mt-1 px-2 text-xs text-ink-soft">
        <summary className="cursor-pointer select-none">해설</summary>
        <p className="mt-1 leading-relaxed">{p.explanation}</p>
      </details>
    </li>
  );
}

export default function BankSelect({
  bank,
  format,
  bogiCount,
  sourceMode,
  busy,
  initialStimulus,
  initialAssembly,
  onBack,
  onRegenerate,
  onConfirm,
}: Props) {
  const [stimulus] = useState<Stimulus>(initialStimulus ?? bank.stimulus);
  const [pickIds, setPickIds] = useState<string[]>(
    () => initialAssembly?.picks.map((p) => p.id) ?? [],
  );
  const [arrayIndex, setArrayIndex] = useState(initialAssembly?.arrayIndex ?? 0);
  const [ctx, setCtx] = useState<AssemblyContext>(
    () =>
      initialAssembly?.context ?? {
        dataComplexity: bank.stimulus.complexity,
        fusion: false,
      },
  );

  const maxPicks = format === "hapdab" ? bogiCount : 5;
  const byId = useMemo(
    () => new Map(bank.propositions.map((p) => [p.id, p] as const)),
    [bank],
  );
  const picks = useMemo(
    () => pickIds.map((id) => byId.get(id)).filter((p): p is Proposition => !!p),
    [pickIds, byId],
  );
  const assembly = useMemo(
    () => assemble(format, picks, ctx, arrayIndex),
    [format, picks, ctx, arrayIndex],
  );

  const toggle = (id: string) => {
    setArrayIndex(0);
    setPickIds((ids) =>
      ids.includes(id)
        ? ids.filter((x) => x !== id)
        : ids.length < maxPicks
          ? [...ids, id]
          : ids,
    );
  };
  const move = (i: number, dir: -1 | 1) => {
    setArrayIndex(0);
    setPickIds((ids) => {
      const j = i + dir;
      if (j < 0 || j >= ids.length) return ids;
      const next = [...ids];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const trues = bank.propositions.filter((p) => p.isTrue);
  const falses = bank.propositions.filter((p) => !p.isTrue);
  const full = picks.length === maxPicks;
  const blockingWarnings = assembly.warnings.filter(
    (warning) =>
      warning.includes("정답이 없습니다") ||
      warning.includes("복수 정답 위험") ||
      warning.includes("비표준 배열") ||
      warning.includes("모든 〈보기〉가 참"),
  );
  const ready = full && assembly.answerIndex >= 0 && blockingWarnings.length === 0 && !busy;
  const d = assembly.difficulty;
  const orderLabel = format === "hapdab" ? "ㄱ, ㄴ, ㄷ" : "①~⑤";

  const rule =
    format === "hapdab"
      ? assembly.uniform
        ? "선택지의 항목 수가 모두 같아 '고른 것은'으로 분기했습니다."
        : "선택지의 항목 수가 서로 달라 '있는 대로 고른 것은'으로 분기했습니다."
      : format === "jeongdap"
        ? "정답형: 참 1개 + 거짓 4개."
        : "부정형: 참 4개 + 거짓 1개. '않은'에 밑줄이 붙습니다.";

  return (
    <div className="rise-in mx-auto max-w-6xl">
      <div className="rounded-xl border border-thread/30 bg-thread-soft/30 px-5 py-4">
        <p className="text-sm leading-relaxed text-ink">
          <strong className="serif">
            {FORMAT_LABELS[format]} — 풀에서 {maxPicks}개를 고르면 문항이 조립됩니다.
          </strong>{" "}
          각 명제의 <strong>수준</strong> 표식은 그 명제를 옳게 판단하는 데 필요한
          최소 성취수준(판별점)입니다. 고르는 순서가 {orderLabel} 순서가 되고, 발문
          분기·선택지 배열·정답·복수 정답 검사·난이도 등급은 규칙으로 즉시 계산됩니다.
        </p>
      </div>

      {/* 자료 */}
      <section className="mt-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-paper-line">
        <div className="flex items-center justify-between gap-3">
          <h3 className="serif text-sm font-bold tracking-wide text-blueprint">
            자료 — 문제 장면 구현
          </h3>
          <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink-soft ring-1 ring-paper-line">
            명제 진위·정답과 함께 잠김
          </span>
        </div>
        <div className="mt-3 text-[15px] text-ink">
          <p className="leading-relaxed">{stimulus.indirectStem}</p>
          <div className="mt-2 rounded-lg border border-ink/20 bg-paper/30 p-3">
            <StimulusBody text={stimulus.body} />
          </div>
          {stimulus.figureSpec && (
            <p className="mt-2 rounded-lg border border-dashed border-thread/50 bg-thread-soft/30 px-3 py-2 text-xs leading-relaxed text-ink-soft">
              <span className="font-semibold text-thread">그림·그래프 제작 지시</span>{" "}
              {stimulus.figureSpec}
            </p>
          )}
          <p className="mt-2 text-[11px] text-ink-soft">
            {sourceMode === "synthetic"
              ? "교육용 합성 자료"
              : stimulus.sourceIds.length > 0
                ? `사용 출처: ${stimulus.sourceIds.join(", ")}`
                : "출처 연결 오류 — 풀을 다시 생성하세요"}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
            자료의 수치·단위·조건을 바꾸면 명제의 진위와 정답이 달라질 수 있습니다. 수정이
            필요하면 입력 단계의 출처 데이터·출제 맥락을 고친 뒤 자료·명제 풀 전체를 다시
            생성합니다.
          </p>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* 명제 풀 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            { title: "참 명제 후보", list: trues, chip: TRUTH_CHIP.true, tag: "참" },
            { title: "매력적 오답(거짓) 후보", list: falses, chip: TRUTH_CHIP.false, tag: "거짓" },
          ].map((col) => (
            <section key={col.title}>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${col.chip}`}>
                  {col.tag}
                </span>
                <h3 className="text-sm font-bold text-ink">{col.title}</h3>
                <span className="text-xs text-ink-soft">{col.list.length}개</span>
              </div>
              <ul className="mt-2 space-y-2">
                {col.list.map((p) => {
                  const order = pickIds.indexOf(p.id);
                  return (
                    <PropCard
                      key={p.id}
                      p={p}
                      order={order}
                      label={order >= 0 ? pickLabel(format, order) : ""}
                      full={full}
                      onToggle={() => toggle(p.id)}
                    />
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {/* 조립 패널 */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-paper-line">
            <h3 className="serif text-sm font-bold text-blueprint">
              조립 결과{" "}
              <span className="ml-1 text-xs font-normal text-ink-soft">
                {picks.length}/{maxPicks}
              </span>
            </h3>
            <ol className="mt-2 space-y-1.5">
              {picks.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-start gap-2 rounded-lg border border-paper-line bg-paper/40 px-2 py-1.5 text-sm"
                >
                  <span className="font-bold text-thread">{pickLabel(format, i)}</span>
                  <span className="flex-1 leading-relaxed text-ink">{p.text}</span>
                  <span
                    className={`mt-0.5 shrink-0 rounded-full px-1.5 text-[10px] font-bold ring-1 ${TRUTH_CHIP[p.isTrue ? "true" : "false"]}`}
                  >
                    {p.isTrue ? "참" : "거짓"}
                  </span>
                  <span className="flex shrink-0 flex-col text-[10px] leading-none text-ink-soft">
                    <button type="button" onClick={() => move(i, -1)} aria-label="위로" className="px-1 hover:text-ink">
                      ▲
                    </button>
                    <button type="button" onClick={() => move(i, 1)} aria-label="아래로" className="px-1 hover:text-ink">
                      ▼
                    </button>
                  </span>
                </li>
              ))}
              {picks.length === 0 && (
                <li className="text-xs leading-relaxed text-ink-soft">
                  왼쪽 풀에서 명제를 고르세요. 고른 순서가 {orderLabel} 순서가 됩니다.
                </li>
              )}
            </ol>

            <div className="mt-3 rounded-lg bg-blueprint/5 px-3 py-2">
              <span className="text-[11px] font-semibold text-blueprint">발문</span>
              <p className="mt-0.5 text-sm leading-relaxed text-ink">
                {composeStem(stimulus.stemPrefix, assembly.directStem, stimulus.conditions)}
              </p>
              <p className="mt-1 text-[11px] text-ink-soft">{rule}</p>
            </div>

            {full && (
              <div className="mt-3">
                {format === "hapdab" ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink">
                    {assembly.choices.map((c, i) => (
                      <span
                        key={i}
                        className={
                          i === assembly.answerIndex
                            ? "rounded bg-thread-soft px-1 font-bold text-thread"
                            : ""
                        }
                      >
                        {CIRCLED[i]} {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink-soft">
                    선택지는 위 순서대로 ①~⑤가 됩니다.
                  </p>
                )}
                {assembly.arrayOptions.length > 1 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="mr-1 text-[11px] text-ink-soft">선택지 배열</span>
                    {assembly.arrayOptions.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setArrayIndex(i)}
                        aria-pressed={i === assembly.arrayIndex}
                        className={[
                          "rounded px-2 py-0.5 text-[11px] font-semibold ring-1",
                          i === assembly.arrayIndex
                            ? "bg-blueprint text-white ring-blueprint"
                            : "bg-white text-ink-soft ring-paper-line hover:text-ink",
                        ].join(" ")}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-sm text-ink">
                  정답:{" "}
                  <strong className="text-thread">
                    {assembly.answerIndex >= 0 ? CIRCLED[assembly.answerIndex] : "없음"}
                  </strong>
                </p>
              </div>
            )}

            {assembly.warnings.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                {assembly.warnings.map((w, i) => (
                  <li key={i}>⚠ {w}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-paper-line">
            <div className="flex items-center justify-between">
              <h3 className="serif text-sm font-bold text-blueprint">사전 인지 복잡도 (7등급)</h3>
              <span
                className={`rounded-md px-2.5 py-1 text-sm font-bold ${TIER_CHIP[d.tier] ?? "bg-slate-300 text-ink"}`}
              >
                {d.tier}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
              점수 {d.score.toFixed(2)} = 명제 수준 평균 {d.base.toFixed(2)} + 정답 구조{" "}
              {d.answerWeight.toFixed(2)} + 맥락 {d.contextWeight.toFixed(2)}. 권장치이며 최종
              추정치입니다. 실제 문항 난도는 학생 응답 자료의 정답률·변별도로 판단합니다.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <label className="block font-semibold text-ink">
                자료 복잡도
                <select
                  value={ctx.dataComplexity}
                  onChange={(e) =>
                    setCtx((c) => ({
                      ...c,
                      dataComplexity: Number(e.target.value) as 0 | 1 | 2,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-paper-line bg-paper/50 px-2 py-1.5 text-xs text-ink focus:border-thread focus:outline-none"
                >
                  <option value={0}>0 단순</option>
                  <option value={1}>1 보통</option>
                  <option value={2}>2 복잡</option>
                </select>
              </label>
              <label className="flex items-center gap-2 font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={ctx.fusion}
                  onChange={(e) => setCtx((c) => ({ ...c, fusion: e.target.checked }))}
                  className="h-4 w-4 accent-blueprint"
                />
                교과 융합 문항
              </label>
            </div>
          </section>

          <button
            type="button"
            onClick={() => onConfirm(stimulus, assembly)}
            disabled={!ready}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blueprint px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blueprint-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy
              ? "해설·사전 점검 생성 중…"
              : blockingWarnings.length > 0
                ? "차단 경고를 해결하세요"
                : "이 조합으로 해설·사전 점검 생성"}
            {!busy && <span aria-hidden>→</span>}
          </button>
        </aside>
      </div>

      <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={onBack}
          disabled={busy}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-ink-soft hover:bg-paper-line/50 disabled:opacity-40"
        >
          ← 평가 요소·장면 수정
        </button>
        <button
          onClick={() => {
            if (window.confirm("현재 자료 수정과 명제 선택을 지우고 다시 생성하시겠습니까?")) {
              onRegenerate();
            }
          }}
          disabled={busy}
          className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-ink ring-1 ring-paper-line hover:bg-paper disabled:opacity-40"
        >
          {busy ? "생성 중…" : "자료·명제 풀 다시 생성"}
        </button>
      </div>
    </div>
  );
}
