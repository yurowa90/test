import { useState } from "react";
import type { Stage1Result } from "../types";
import { markerFor } from "../lib/markers";

interface Props {
  value: Stage1Result;
  busy: boolean;
  udlOptions: boolean;
  onToggleUdl: (on: boolean) => void;
  onBack: () => void;
  onConfirm: (edited: Stage1Result) => void;
}

function AutoTextarea({
  value,
  onChange,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full resize-y rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm leading-relaxed text-ink hover:border-paper-line focus:border-thread focus:bg-white focus:outline-none"
    />
  );
}

export default function Stage1Review({
  value,
  busy,
  udlOptions,
  onToggleUdl,
  onBack,
  onConfirm,
}: Props) {
  const [draft, setDraft] = useState<Stage1Result>(value);

  const setUnderstanding = (i: number, v: string) =>
    setDraft((d) => ({
      ...d,
      understandings: d.understandings.map((u, idx) => (idx === i ? v : u)),
    }));

  const setQuestion = (i: number, v: string) =>
    setDraft((d) => ({
      ...d,
      essentialQuestions: d.essentialQuestions.map((q, idx) =>
        idx === i ? v : q,
      ),
    }));

  return (
    <div className="rise-in mx-auto max-w-3xl">
      <div className="rounded-xl border border-thread/30 bg-thread-soft/30 px-5 py-4">
        <p className="text-sm leading-relaxed text-ink">
          <strong className="serif">교사 검토는 건너뛸 수 없는 관문입니다.</strong>{" "}
          모델이 초안을 냈을 뿐, 이 이해가 옳은지 판단하는 사람은 선생님입니다.
          문장을 눌러 직접 고친 뒤 확정하세요. 여기서 확정한 이해가 다음 단계
          루브릭의 준거가 됩니다.
        </p>
      </div>

      {/* 전이 목표 */}
      <section className="mt-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-paper-line">
        <h3 className="serif text-sm font-bold tracking-wide text-blueprint">
          전이 목표
        </h3>
        <p className="mt-0.5 text-xs text-ink-soft">
          배운 것을 낯선 맥락에 스스로 적용하는 장기 목표
        </p>
        <div className="mt-2">
          <AutoTextarea
            value={draft.transferGoal}
            onChange={(v) => setDraft((d) => ({ ...d, transferGoal: v }))}
            rows={2}
          />
        </div>
      </section>

      {/* 영속적 이해 — 정렬 마커 부여 */}
      <section className="mt-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-paper-line">
        <h3 className="serif text-sm font-bold tracking-wide text-blueprint">
          영속적 이해
        </h3>
        <p className="mt-0.5 text-xs text-ink-soft">
          단원이 끝나도 남아야 할 핵심 통찰. 각 이해에는 색 표식이 붙고, 다음
          단계 루브릭 준거에 같은 표식이 다시 나타납니다.
        </p>
        <ul className="mt-3 space-y-3">
          {draft.understandings.map((u, i) => {
            const m = markerFor(i);
            return (
              <li
                key={i}
                className={`flex gap-3 rounded-lg border-l-4 ${m.edge} ${m.surface} p-3`}
              >
                <span
                  className={`mt-1 inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-bold ring-1 ${m.chip}`}
                >
                  {m.label}
                </span>
                <AutoTextarea
                  value={u}
                  onChange={(v) => setUnderstanding(i, v)}
                  rows={2}
                />
              </li>
            );
          })}
        </ul>
      </section>

      {/* 본질적 질문 */}
      <section className="mt-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-paper-line">
        <h3 className="serif text-sm font-bold tracking-wide text-blueprint">
          본질적 질문
        </h3>
        <p className="mt-0.5 text-xs text-ink-soft">
          하나의 사실로 닫히지 않는 개방형 질문
        </p>
        <ul className="mt-3 space-y-2">
          {draft.essentialQuestions.map((q, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 select-none text-thread" aria-hidden>
                ?
              </span>
              <AutoTextarea
                value={q}
                onChange={(v) => setQuestion(i, v)}
                rows={1}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* UDL 토글 */}
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-paper-line">
        <input
          type="checkbox"
          checked={udlOptions}
          onChange={(e) => onToggleUdl(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-blueprint"
        />
        <span className="text-sm text-ink">
          <strong>UDL 산출물 옵션 함께 생성</strong>
          <span className="mt-0.5 block text-xs text-ink-soft">
            같은 이해를 여러 산출 형태(보고서·발표·영상·모형)로 드러내도록 P를
            다양화합니다.
          </span>
        </span>
      </label>

      {/* 확정 관문 */}
      <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={onBack}
          disabled={busy}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-ink-soft hover:bg-paper-line/50 disabled:opacity-40"
        >
          ← 입력 수정
        </button>
        <button
          onClick={() => onConfirm(draft)}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blueprint px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blueprint-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "GRASPS 생성 중…" : "이 이해를 평가하는 과제 만들기"}
          {!busy && <span aria-hidden>→</span>}
        </button>
      </div>
    </div>
  );
}
