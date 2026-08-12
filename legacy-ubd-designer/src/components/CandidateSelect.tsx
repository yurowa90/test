import { useState } from "react";
import type {
  GraspsCandidates,
  GraspsElementKey,
  GraspsSelection,
} from "../types";

interface Props {
  candidates: GraspsCandidates;
  busy: boolean;
  onBack: () => void;
  onConfirm: (selection: GraspsSelection) => void;
}

const ELEMENTS: {
  key: GraspsElementKey;
  letter: string;
  name: string;
  hint: string;
}[] = [
  { key: "goal", letter: "G", name: "목표 Goal", hint: "해결할 실제 도전·문제" },
  {
    key: "role",
    letter: "R",
    name: "역할 Role",
    hint: "학생이 맡는 역할 — 수행을 실제로 바꾸는가",
  },
  {
    key: "audience",
    letter: "A",
    name: "청중 Audience",
    hint: "산출물을 받을 실재하는 대상",
  },
  {
    key: "situation",
    letter: "S",
    name: "상황 Situation",
    hint: "맥락과 실세계 제약",
  },
  {
    key: "performanceProduct",
    letter: "P",
    name: "수행·산출물 Product/Performance",
    hint: "무엇을, 왜 만드는가",
  },
  {
    key: "standards",
    letter: "S",
    name: "성공기준 Standards",
    hint: "루브릭 준거의 씨앗 — 이해와 대응",
  },
];

export default function CandidateSelect({
  candidates,
  busy,
  onBack,
  onConfirm,
}: Props) {
  // 각 요소의 선택 인덱스와, 살짝 손볼 수 있는 현재 텍스트
  const [selIdx, setSelIdx] = useState<Record<string, number>>(
    () => Object.fromEntries(ELEMENTS.map((e) => [e.key, 0])),
  );
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ELEMENTS.map((e) => [e.key, candidates[e.key]?.[0] ?? ""]),
    ),
  );

  const pick = (key: GraspsElementKey, idx: number) => {
    setSelIdx((s) => ({ ...s, [key]: idx }));
    setText((t) => ({ ...t, [key]: candidates[key][idx] }));
  };

  const edit = (key: GraspsElementKey, v: string) =>
    setText((t) => ({ ...t, [key]: v }));

  const confirm = () => {
    const selection = Object.fromEntries(
      ELEMENTS.map((e) => [e.key, text[e.key].trim()]),
    ) as GraspsSelection;
    onConfirm(selection);
  };

  return (
    <div className="rise-in mx-auto max-w-3xl">
      <div className="rounded-xl border border-thread/30 bg-thread-soft/30 px-5 py-4">
        <p className="text-sm leading-relaxed text-ink">
          <strong className="serif">요소마다 후보를 하나씩 고르세요.</strong>{" "}
          원저(Wiggins &amp; McTighe, Fig 7.7)는 요소별로 여러 문장 틀을
          제안합니다. 후보를 고른 뒤 필요하면 문장을 직접 손봐도 됩니다. 확정한
          6요소로 학생 안내문과 루브릭을 만듭니다.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        {ELEMENTS.map((el) => {
          const options = candidates[el.key] ?? [];
          return (
            <section
              key={el.key + el.letter}
              className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-paper-line"
            >
              <div className="flex items-baseline gap-2">
                <span className="serif text-2xl font-bold text-thread">
                  {el.letter}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  {el.name}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-ink-soft">{el.hint}</p>

              <ul className="mt-3 space-y-2">
                {options.map((opt, idx) => {
                  const active = selIdx[el.key] === idx;
                  return (
                    <li key={idx}>
                      <button
                        type="button"
                        onClick={() => pick(el.key, idx)}
                        aria-pressed={active}
                        className={[
                          "flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm leading-relaxed transition",
                          active
                            ? "border-blueprint bg-blueprint/5 text-ink"
                            : "border-paper-line bg-paper/40 text-ink-soft hover:border-ink-soft/40 hover:text-ink",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                            active
                              ? "border-blueprint bg-blueprint"
                              : "border-ink-soft/40",
                          ].join(" ")}
                          aria-hidden
                        >
                          {active && (
                            <span className="h-1.5 w-1.5 rounded-full bg-white" />
                          )}
                        </span>
                        <span>{opt}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <label className="mt-3 block text-xs font-semibold text-ink-soft">
                선택한 문장 (직접 수정 가능)
                <textarea
                  value={text[el.key]}
                  onChange={(e) => edit(el.key, e.target.value)}
                  rows={2}
                  className="mt-1 w-full resize-y rounded-md border border-paper-line bg-paper/30 px-3 py-2 text-sm leading-relaxed text-ink focus:border-thread focus:bg-white focus:outline-none"
                />
              </label>
            </section>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={onBack}
          disabled={busy}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-ink-soft hover:bg-paper-line/50 disabled:opacity-40"
        >
          ← Stage 1 수정
        </button>
        <button
          onClick={confirm}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blueprint px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blueprint-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "안내문·루브릭 생성 중…" : "이 6요소로 과제 완성"}
          {!busy && <span aria-hidden>→</span>}
        </button>
      </div>
    </div>
  );
}
