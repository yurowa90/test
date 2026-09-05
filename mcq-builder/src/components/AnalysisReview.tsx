import type { Dispatch, SetStateAction } from "react";
import type { AnalysisResult, BehaviorDomain, Scenario } from "../types";
import { BEHAVIOR_DOMAINS } from "../types";
import { BEHAVIOR_CHIP } from "../lib/markers";

interface Props {
  value: AnalysisResult;
  onChange: Dispatch<SetStateAction<AnalysisResult>>;
  onScenarioChange: (index: number) => void;
  initialScenarioIndex?: number;
  requireSourcePlan: boolean;
  busy: boolean;
  onBack: () => void;
  onConfirm: (edited: AnalysisResult, scenarioIndex: number) => void;
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

export default function AnalysisReview({
  value,
  onChange: setDraft,
  onScenarioChange: setScenarioIndex,
  initialScenarioIndex = 0,
  requireSourcePlan,
  busy,
  onBack,
  onConfirm,
}: Props) {
  const draft = value;
  const scenarioIndex = Math.min(initialScenarioIndex, Math.max(value.scenarios.length - 1, 0));

  const setElement = (i: number, v: string) =>
    setDraft((d) => ({
      ...d,
      contentElements: d.contentElements.map((e, idx) => (idx === i ? v : e)),
    }));
  const removeElement = (i: number) =>
    setDraft((d) => ({
      ...d,
      contentElements: d.contentElements.filter((_, idx) => idx !== i),
    }));
  const addElement = () =>
    setDraft((d) => ({ ...d, contentElements: [...d.contentElements, ""] }));
  const setScenario = (i: number, patch: Partial<Scenario>) =>
    setDraft((d) => ({
      ...d,
      scenarios: d.scenarios.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    }));

  const chosen = draft.scenarios[scenarioIndex];
  const canConfirm =
    !!chosen &&
    draft.contentElements.some((element) => element.trim() !== "") &&
    draft.assessmentElement.trim() !== "" &&
    draft.assessmentGoal.trim() !== "" &&
    chosen.description.trim() !== "" &&
    chosen.cues.some(cue => cue.trim() !== "") &&
    draft.behaviorRationale.trim() !== "" &&
    (!requireSourcePlan || chosen.sourcePlan.trim() !== "") &&
    !busy;

  return (
    <div className="rise-in mx-auto max-w-3xl">
      <div className="rounded-xl border border-thread/30 bg-thread-soft/30 px-5 py-4">
        <p className="text-sm leading-relaxed text-ink">
          <strong className="serif">교사 검토는 건너뛸 수 없는 관문입니다.</strong>{" "}
          모델이 교육과정 분석 초안을 냈을 뿐, 이 평가 요소가 성취기준의 핵심인지
          판단하는 사람은 선생님입니다. 문장을 눌러 고치고, 문제 장면 하나를 골라
          확정하세요. 확정한 평가 요소가 문항정보표의 기준이 됩니다.
        </p>
      </div>

      {/* 필수 학습 요소 */}
      <section className="mt-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-paper-line">
        <h3 className="serif text-sm font-bold tracking-wide text-blueprint">
          필수 학습 요소
        </h3>
        <p className="mt-0.5 text-xs text-ink-soft">
          교육과정의 내용 요소에서 뽑은 것만 남깁니다. 교과서에는 있지만 교육과정과
          무관한 활동은 평가 요소가 될 수 없습니다(지침 p.69).
        </p>
        <ul className="mt-2 space-y-1">
          {draft.contentElements.map((e, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-2 select-none text-thread" aria-hidden>
                ◦
              </span>
              <AutoTextarea value={e} onChange={(v) => setElement(i, v)} rows={1} />
              <button
                type="button"
                onClick={() => removeElement(i)}
                aria-label="삭제"
                className="mt-1.5 rounded px-1.5 text-xs text-ink-soft hover:bg-paper-line/50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addElement}
          className="mt-2 text-xs font-semibold text-blueprint hover:underline"
        >
          + 요소 추가
        </button>
      </section>

      {/* 평가 요소·목표 */}
      <section className="mt-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-paper-line">
        <h3 className="serif text-sm font-bold tracking-wide text-blueprint">
          평가 요소 <span className="ml-1 text-xs font-normal text-ink-soft">(한 문항에 하나)</span>
        </h3>
        <div className="mt-2 rounded-lg border-l-4 border-thread bg-thread-soft/30 p-2">
          <AutoTextarea
            value={draft.assessmentElement}
            onChange={(v) => setDraft((d) => ({ ...d, assessmentElement: v }))}
            rows={2}
          />
        </div>
        <h3 className="serif mt-4 text-sm font-bold tracking-wide text-blueprint">
          평가 목표
        </h3>
        <p className="mt-0.5 text-xs text-ink-soft">
          "~을 알고 ~을 파악할 수 있는지를 평가한다." 형식
        </p>
        <div className="mt-1">
          <AutoTextarea
            value={draft.assessmentGoal}
            onChange={(v) => setDraft((d) => ({ ...d, assessmentGoal: v }))}
            rows={2}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
          <label className="text-sm font-semibold text-ink">
            행동 영역
            <select
              value={draft.behaviorDomain}
              onChange={(e) =>
                setDraft((d) => ({ ...d, behaviorDomain: e.target.value as BehaviorDomain, behaviorRationale: "" }))
              }
              className="mt-1.5 block rounded-lg border border-paper-line bg-paper/50 px-3 py-2 text-sm text-ink focus:border-thread focus:bg-white focus:outline-none"
            >
              {BEHAVIOR_DOMAINS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label
            className={`rounded-lg px-3 py-2 text-xs leading-relaxed ring-1 ${BEHAVIOR_CHIP[draft.behaviorDomain]}`}
          >
            행동 영역 선택 근거 (변경 시 다시 작성)
            <AutoTextarea value={draft.behaviorRationale} onChange={v => setDraft(d => ({ ...d, behaviorRationale: v }))} />
          </label>
        </div>
        <label className="growth-panel">이해를 확인할 학생 응답 증거 (선택)
          <AutoTextarea value={draft.evidenceGoal ?? ""} onChange={v => setDraft(d => ({ ...d, evidenceGoal: v }))} />
          <p className="text-xs">예: 두 조건의 값을 비교하고, 그 차이를 근거로 관계를 설명한다. 단순 정답 선택과 사고 과정의 증거를 구분합니다.</p>
        </label>
      </section>

      {/* 문제 장면 후보 */}
      <section className="mt-4">
        <h3 className="serif text-sm font-bold tracking-wide text-blueprint">
          문제 장면 후보 — 하나를 고르세요
        </h3>
        <p className="mt-0.5 text-xs text-ink-soft">
          평가 요소가 '몸'이면 문제 장면은 '옷'입니다(지침 p.69). 같은 평가 요소를
          다른 자료로 입힌 후보들입니다. 설명과 단서는 직접 고칠 수 있습니다.
        </p>
        <ul className="mt-3 space-y-3">
          {draft.scenarios.map((s, i) => {
            const active = i === scenarioIndex;
            return (
              <li
                key={i}
                className={[
                  "rounded-xl border bg-white p-4 shadow-sm transition",
                  active ? "border-blueprint ring-2 ring-blueprint/20" : "border-paper-line",
                ].join(" ")}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="scenario"
                    checked={active}
                    onChange={() => setScenarioIndex(i)}
                    className="mt-1 h-4 w-4 accent-blueprint"
                  />
                  <span className="flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-ink">{s.title}</span>
                      <span className="rounded-full bg-blueprint/10 px-2 py-0.5 text-[11px] font-semibold text-blueprint">
                        자료: {s.stimulusType}
                      </span>
                      <span className="rounded-full bg-paper-line/60 px-2 py-0.5 text-[11px] text-ink-soft">
                        {s.inquiryContext}
                      </span>
                    </span>
                  </span>
                </label>
                <div className="mt-2 pl-7">
                  <AutoTextarea
                    value={s.description}
                    onChange={(v) => setScenario(i, { description: v })}
                    rows={3}
                  />
                  <p className="mt-1 text-[11px] font-semibold text-ink-soft">
                    자료에 반드시 담을 단서 (한 줄에 하나)
                  </p>
                  <AutoTextarea
                    value={s.cues.join("\n")}
                    onChange={(v) =>
                      setScenario(i, {
                        cues: v.split("\n").map((c) => c.trim()).filter(Boolean),
                      })
                    }
                    rows={Math.max(2, s.cues.length)}
                  />
                  <p className="mt-1 text-[11px] font-semibold text-ink-soft">
                    출처 자료 활용 계획
                  </p>
                  <AutoTextarea
                    value={s.sourcePlan ?? ""}
                    onChange={(v) => setScenario(i, { sourcePlan: v })}
                    rows={2}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={onBack}
          disabled={busy}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-ink-soft hover:bg-paper-line/50 disabled:opacity-40"
        >
          ← 입력 수정
        </button>
        <button
          onClick={() => onConfirm(draft, scenarioIndex)}
          disabled={!canConfirm}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blueprint px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blueprint-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "자료·명제 생성 중…" : "이 장면으로 자료·〈보기〉 명제 만들기"}
          {!busy && <span aria-hidden>→</span>}
        </button>
      </div>
    </div>
  );
}
