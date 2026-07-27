import { useState } from "react";
import type { GraspsTask, Stage1Result } from "../types";
import { markerFor } from "../lib/markers";

interface Props {
  stage1: Stage1Result;
  task: GraspsTask;
  busy: boolean;
  onRegenerate: () => void;
  onReselect: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onRestart: () => void;
}

const GRASPS_ROWS: {
  key: keyof GraspsTask;
  letter: string;
  name: string;
}[] = [
  { key: "goal", letter: "G", name: "목표 Goal" },
  { key: "role", letter: "R", name: "역할 Role" },
  { key: "audience", letter: "A", name: "청중 Audience" },
  { key: "situation", letter: "S", name: "상황 Situation" },
  { key: "performanceProduct", letter: "P", name: "수행·산출물 Product/Performance" },
  { key: "standards", letter: "S", name: "성공기준 Standards" },
];

export default function GraspsResult({
  stage1,
  task,
  busy,
  onRegenerate,
  onReselect,
  onCopy,
  onDownload,
  onRestart,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="rise-in mx-auto max-w-4xl">
      {/* 액션 바 */}
      <div className="sticky top-2 z-10 mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-paper-line bg-paper/90 p-2 shadow-sm backdrop-blur">
        <button
          onClick={handleCopy}
          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-paper-line hover:bg-paper"
        >
          {copied ? "복사됨 ✓" : "Markdown 복사"}
        </button>
        <button
          onClick={onDownload}
          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-paper-line hover:bg-paper"
        >
          .md 다운로드
        </button>
        <button
          onClick={onRegenerate}
          disabled={busy}
          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-paper-line hover:bg-paper disabled:opacity-40"
        >
          {busy ? "다시 생성 중…" : "안내문·루브릭 다시 생성"}
        </button>
        <button
          onClick={onReselect}
          disabled={busy}
          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-paper-line hover:bg-paper disabled:opacity-40"
        >
          요소 다시 고르기
        </button>
        <div className="ml-auto">
          <button
            onClick={onRestart}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-paper-line/50"
          >
            새 과제
          </button>
        </div>
      </div>

      {/* GRASPS 6요소 카드 */}
      <section>
        <h2 className="serif text-lg font-bold text-blueprint">
          GRASPS 수행과제
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {GRASPS_ROWS.map((row) => (
            <div
              key={row.name}
              className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-paper-line"
            >
              <div className="flex items-baseline gap-2">
                <span className="serif text-2xl font-bold text-thread">
                  {row.letter}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  {row.name}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">
                {task[row.key] as string}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 학생용 안내문 */}
      <section className="mt-6 rounded-xl bg-blueprint p-6 text-paper shadow-sm">
        <h3 className="serif text-sm font-bold tracking-wide text-white/80">
          학생용 과제 안내문
        </h3>
        <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-paper/95">
          {task.studentPrompt}
        </p>
      </section>

      {/* UDL 산출물 옵션 */}
      {task.productOptions && task.productOptions.length > 0 && (
        <section className="mt-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-paper-line">
          <h3 className="serif text-sm font-bold text-blueprint">
            산출물 대안 — UDL 행동·표현의 다양화
          </h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            아래 옵션은 모두 같은 이해를 증거로 요구하며 같은 루브릭으로
            평가됩니다.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {task.productOptions.map((o, i) => (
              <li
                key={i}
                className="rounded-lg border border-paper-line bg-paper/50 p-3"
              >
                <p className="text-sm font-semibold text-ink">{o.format}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  {o.rationale}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 루브릭 — 정렬 마커로 Stage 1 이해와 연결 */}
      <section className="mt-6">
        <h2 className="serif text-lg font-bold text-blueprint">루브릭</h2>
        <p className="mt-0.5 text-sm text-ink-soft">
          각 준거 옆의 표식은 그 준거가 평가하는{" "}
          <strong className="text-ink">영속적 이해</strong>를 가리킵니다 —
          정렬이 눈에 보이도록.
        </p>

        <div className="mt-3 space-y-4">
          {task.rubric.map((c, idx) => {
            const m = markerFor(c.alignedUnderstandingIndex);
            const aligned = stage1.understandings[c.alignedUnderstandingIndex];
            return (
              <div
                key={idx}
                className={`overflow-hidden rounded-xl border-l-4 ${m.edge} bg-white shadow-sm ring-1 ring-paper-line`}
              >
                <div className={`px-4 py-3 ${m.surface}`}>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-bold ring-1 ${m.chip}`}
                    >
                      {m.label}
                    </span>
                    <h4 className="font-bold text-ink">{c.criterion}</h4>
                  </div>
                  {aligned && (
                    <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                      대응 이해: {aligned}
                    </p>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      {c.levels.map((l, li) => (
                        <tr
                          key={li}
                          className="border-t border-paper-line align-top"
                        >
                          <th
                            scope="row"
                            className="w-24 whitespace-nowrap bg-paper/40 px-4 py-2.5 text-left font-semibold text-blueprint"
                          >
                            {l.label}
                          </th>
                          <td className="px-4 py-2.5 leading-relaxed text-ink">
                            {l.descriptor}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
