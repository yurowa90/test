import { useState } from "react";
import type {
  AnalysisResult,
  Assembly,
  FinalItem,
  Scenario,
  Stimulus,
  TeacherInput,
} from "../types";
import { FORMAT_LABELS } from "../types";
import { CIRCLED, composeStem, pickLabel } from "../lib/assemble";
import { downloadText, formatSource, sourceNote, toStudentHtml } from "../lib/export";
import { TIER_CHIP } from "../lib/markers";
import StimulusBody from "./StimulusBody";
import ScientificFigure from "./ScientificFigure";

interface Props {
  input: TeacherInput;
  analysis: AnalysisResult;
  scenario: Scenario;
  stimulus: Stimulus;
  assembly: Assembly;
  final: FinalItem;
  busy: boolean;
  teacherChecks: boolean[];
  onChecksChange: (checks: boolean[]) => void;
  onRegenerate: () => void;
  onReselect: () => void;
  onCopy: (mode: "student" | "teacher") => Promise<boolean>;
  onDownload: (mode: "student" | "teacher") => void;
  onRestart: () => void;
  onGenerateFigure: () => void;
}

const TEACHER_CHECKS = [
  "자료와 출처 원문의 수치·단위·조건을 대조했습니다.",
  "각 진술의 참·거짓과 정답이 하나뿐임을 직접 검산했습니다.",
  "교육과정 및 실제 수업 범위 안의 내용임을 확인했습니다.",
  "학생용 결과에 정답·해설·제작 지시가 포함되지 않음을 확인했습니다.",
] as const;

/** 부정 발문의 '않은'에 밑줄 (지침 p.10, p.31) */
function StemText({ text }: { text: string }) {
  const idx = text.indexOf("않은");
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <u className="decoration-2 underline-offset-4">않은</u>
      {text.slice(idx + 2)}
    </>
  );
}

export default function ItemResult({
  input,
  analysis,
  scenario,
  stimulus,
  assembly,
  final,
  busy,
  teacherChecks,
  onChecksChange,
  onRegenerate,
  onReselect,
  onCopy,
  onDownload,
  onRestart,
  onGenerateFigure,
}: Props) {
  const [copyStatus, setCopyStatus] = useState<"" | "학생용 복사됨" | "교사용 복사됨" | "복사 실패">("");
  const usedSourceIds = new Set(stimulus.sourceIds);
  const usedSources = input.sources.filter((source) => usedSourceIds.has(source.id));
  const approved =
    !busy && teacherChecks.length === 4 && teacherChecks.every(Boolean) &&
    (input.sourceMode === "synthetic" || usedSources.length > 0);
  const handleCopy = async (mode: "student" | "teacher") => {
    const success = await onCopy(mode);
    setCopyStatus(success ? (mode === "student" ? "학생용 복사됨" : "교사용 복사됨") : "복사 실패");
    setTimeout(() => setCopyStatus(""), 1600);
  };

  const answer = assembly.answerIndex >= 0 ? CIRCLED[assembly.answerIndex] : "-";
  const tier = final.info.difficultyTier || assembly.difficulty.tier;
  const stem = composeStem(stimulus.stemPrefix, assembly.directStem, final.conditions);
  const failed = final.review.filter((r) => !r.pass);

  const infoRows: [string, string][] = [
    ["교과(과목)", final.info.subject],
    ["내용 영역", final.info.contentArea],
    ["내용 요소", final.info.contentElement],
    ["행동 영역", final.info.behaviorDomain],
    ["성취기준", final.info.standardCode],
    ["평가 요소", final.info.assessmentElement],
    ["평가 목표", final.info.assessmentGoal],
    ["탐구 상황", final.info.inquiryContext],
    ["사전 인지 복잡도(7등급)", tier],
    ["정답", answer],
    ["출제 의도·주안점", final.info.intent],
  ];

  return (
    <div className="rise-in mx-auto max-w-4xl">
      {/* 액션 바 */}
      <div className="sticky top-2 z-10 mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-paper-line bg-paper/90 p-2 shadow-sm backdrop-blur">
        <button
          onClick={() => handleCopy("student")}
          disabled={!approved}
          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-paper-line hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
        >
          학생용 복사
        </button>
        <button
          onClick={() => handleCopy("teacher")}
          disabled={!approved}
          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-paper-line hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
        >
          교사용 복사
        </button>
        <button
          onClick={() => onDownload("student")}
          disabled={!approved}
          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-paper-line hover:bg-paper disabled:opacity-40"
        >
          학생용 .md
        </button>
        <button
          onClick={() => onDownload("teacher")}
          disabled={!approved}
          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-paper-line hover:bg-paper disabled:opacity-40"
        >
          교사용 .md
        </button>
        {copyStatus && (
          <span aria-live="polite" className="text-xs font-semibold text-ink-soft">
            {copyStatus}
          </span>
        )}
        <button type="button" disabled={!approved} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-paper-line disabled:opacity-40" onClick={() => downloadText("학생용_문항.html", toStudentHtml(input, stimulus, assembly, final), "text/html;charset=utf-8")}>학생용 HTML (그림 포함)</button>
        <button
          onClick={onRegenerate}
          disabled={busy}
          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-paper-line hover:bg-paper disabled:opacity-40"
        >
          {busy ? "다시 생성 중…" : "해설·사전 점검 다시 생성"}
        </button>
        <button
          onClick={onReselect}
          disabled={busy}
          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-paper-line hover:bg-paper disabled:opacity-40"
        >
          〈보기〉 다시 조립
        </button>
        <div className="ml-auto">
          <button
            onClick={onRestart}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-paper-line/50"
          >
            새 문항
          </button>
        </div>
      </div>

      {/* 문항지 */}
      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-paper-line sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          <span className="rounded bg-blueprint px-2 py-0.5 font-bold text-white">
            {input.standardCode ?? "직접 입력"}
          </span>
          <span>{input.subject || "-"}</span>
          <span aria-hidden>·</span>
          <span>{FORMAT_LABELS[assembly.format]}</span>
          <span aria-hidden>·</span>
          <span>{analysis.behaviorDomain}</span>
          <span aria-hidden>·</span>
          <span>자료: {scenario.stimulusType}</span>
          <span
            className={`ml-auto rounded-md px-2 py-0.5 font-bold ${TIER_CHIP[tier] ?? "bg-slate-300 text-ink"}`}
          >
            인지 복잡도 {tier}
          </span>
        </div>

        <div className="mt-5 text-[15px] leading-relaxed text-ink">
          <p>
            <span className="mr-1.5 font-bold">1.</span>
            {final.indirectStem}
          </p>
          <div className="mt-3 rounded-lg border border-ink/25 bg-paper/30 p-4">
            <StimulusBody text={final.body} />
            <ScientificFigure figure={final.figure} source={sourceNote(input, stimulus)} controls />
          </div>
          {final.figureSpec && (
            <details className="mt-2 text-xs text-ink-soft"><summary>그림·그래프 제작 지시(출제자용)</summary><p>{final.figureSpec}</p></details>
          )}
          <div className="figure-tools"><div className="growth-actions"><button type="button" disabled={busy} onClick={onGenerateFigure}>{final.figure ? "그림 다시 만들기" : "이 자료로 그림 만들기"}</button><button type="button" disabled={busy} onClick={onReselect}>3단계에서 그림 직접 작성·수정</button></div><p className="growth-help">그림 추가·수정 후 3단계에서 명제의 진위를 다시 확인합니다. HTML 파일은 브라우저에서 열어 인쇄하거나 PDF로 저장할 수 있습니다.</p></div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
            {input.sourceMode === "synthetic"
              ? "자료: 교육용으로 재구성한 합성 자료"
              : usedSources.length > 0
                ? `자료 출처: ${usedSources.map((source) => formatSource(source)).join(" / ")} (출제 목적에 맞게 재구성)`
                : "자료 출처: 교사 확인 필요"}
          </p>
          <p className="mt-4">
            <StemText text={stem} />
          </p>

          {assembly.format === "hapdab" && (
            <div className="mt-3 rounded-lg border border-ink/30 px-4 py-3">
              <p className="serif text-center text-sm font-bold tracking-[0.5em] text-ink">
                보 기
              </p>
              <ul className="mt-2 space-y-1">
                {final.statements.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-semibold">{pickLabel("hapdab", i)}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {assembly.format === "hapdab" ? (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
              {assembly.choices.map((c, i) => (
                <span key={i}>
                  {CIRCLED[i]} {c}
                </span>
              ))}
            </div>
          ) : (
            <ul className="mt-3 space-y-1">
              {final.statements.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span>{CIRCLED[i]}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 정답·해설 */}
      <section className="mt-6 rounded-xl bg-blueprint p-6 text-paper shadow-sm">
        <div className="flex items-baseline gap-3">
          <h3 className="serif text-sm font-bold tracking-wide text-white/80">정답 · 해설</h3>
          <span className="text-2xl font-bold text-white">{answer}</span>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {final.explanations.map((e, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                className={[
                  "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                  e.verdict.includes("거짓")
                    ? "bg-rose-100 text-rose-800"
                    : "bg-emerald-100 text-emerald-800",
                ].join(" ")}
              >
                {e.label} {e.verdict}
              </span>
              <span className="leading-relaxed text-paper/95">{e.text}</span>
            </li>
          ))}
        </ul>
        {final.solution && (
          <p className="mt-4 whitespace-pre-line border-t border-white/15 pt-3 text-sm leading-relaxed text-paper/95">
            {final.solution}
          </p>
        )}
      </section>

      {/* 문항정보표 */}
      <section className="mt-6">
        <h2 className="serif text-lg font-bold text-blueprint">문항정보표</h2>
        <p className="mt-0.5 text-sm text-ink-soft">
          내용 요소 × 행동 영역의 이원분류(지침 p.5)와 확정한 평가 요소·목표가 그대로
          들어갑니다.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-paper-line">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {infoRows.map(([k, v]) => (
                <tr key={k} className="border-t border-paper-line align-top first:border-t-0">
                  <th
                    scope="row"
                    className="w-40 whitespace-nowrap bg-paper/40 px-4 py-2.5 text-left font-semibold text-blueprint"
                  >
                    {k}
                  </th>
                  <td className="px-4 py-2.5 leading-relaxed text-ink">{v || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          조립 근거: {assembly.uniform ? "선택지 항목 수 균일" : "선택지 항목 수 상이"} →
          "{assembly.directStem}" / 사전 인지 복잡도 점수 {assembly.difficulty.score.toFixed(2)} (명제 평균{" "}
          {assembly.difficulty.base.toFixed(2)} + 정답 구조 {assembly.difficulty.answerWeight.toFixed(2)} +
          맥락 {assembly.difficulty.contextWeight.toFixed(2)})
        </p>
      </section>

      <section className="mt-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-paper-line">
        <h2 className="serif text-lg font-bold text-blueprint">자료 출처·이용 기록</h2>
        {input.sourceMode === "synthetic" ? (
          <p className="mt-2 text-sm leading-relaxed text-ink">
            교육용으로 재구성한 합성 자료이며 실제 연구 결과가 아닙니다.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {usedSources.length === 0 && (
              <li className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
                연결된 출처가 없습니다. 자료·명제 단계로 돌아가 출처 연결을 확인하세요.
              </li>
            )}
            {usedSources.map((source) => (
              <li key={source.id} className="rounded-lg bg-paper/40 px-3 py-2 text-sm text-ink">
                <p className="font-semibold">{formatSource(source)}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  활용: {source.use} · 이용 조건: {source.rights || "교사 확인 필요"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 교사 최종 확인 */}
      <section className="mt-6 rounded-xl border border-blueprint/25 bg-blueprint/5 p-5">
        <h2 className="serif text-lg font-bold text-blueprint">교사 최종 확인</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          AI 사전 점검은 독립 검토가 아닙니다. 아래 항목을 직접 확인해야 학생용·교사용
          결과를 내보낼 수 있습니다.
        </p>
        <ul className="mt-3 space-y-2">
          {TEACHER_CHECKS.map((label, index) => (
            <li key={label}>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-white px-3 py-2 text-sm leading-relaxed text-ink ring-1 ring-paper-line">
                <input
                  type="checkbox"
                  checked={teacherChecks[index]}
                  onChange={(event) =>
                    onChecksChange(teacherChecks.map((value, i) => (i === index ? event.target.checked : value)))
                  }
                  className="mt-0.5 h-4 w-4 accent-blueprint"
                />
                {label}
              </label>
            </li>
          ))}
        </ul>
        <p aria-live="polite" className="mt-3 text-xs font-semibold text-blueprint">
          {approved ? "교사 확인 완료 — 내보내기가 활성화되었습니다." : "교사 확인 전 — 내보내기가 잠겨 있습니다."}
        </p>
      </section>

      {/* AI 사전 점검 */}
      <section className="mt-6">
        <h2 className="serif text-lg font-bold text-blueprint">AI 사전 점검</h2>
        <p className="mt-0.5 text-sm text-ink-soft">
          지침 Ⅱ장 4절의 관점으로 생성 모델이 자기 점검한 결과입니다. 독립 검토가 아니며,
          이상 가능성을 찾는 보조 자료로만 사용합니다. 확인 필요 항목
          {failed.length > 0 ? ` ${failed.length}개` : "은 발견되지 않았습니다"}.
        </p>
        <ul className="mt-3 space-y-2">
          {final.review.map((r, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-lg bg-white px-4 py-3 shadow-sm ring-1 ring-paper-line"
            >
              <span
                className={[
                  "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1",
                  r.pass
                    ? "bg-emerald-100 text-emerald-800 ring-emerald-300"
                    : "bg-rose-100 text-rose-800 ring-rose-300",
                ].join(" ")}
              >
                {r.pass ? "이상 미발견" : "확인 필요"}
              </span>
              <span className="text-sm leading-relaxed text-ink">
                {r.item}
                {r.note && <span className="block text-xs text-ink-soft">{r.note}</span>}
              </span>
            </li>
          ))}
        </ul>
        {assembly.warnings.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            {assembly.warnings.map((w, i) => (
              <li key={i}>⚠ 조립 경고: {w}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
