import { useState } from "react";
import type { TeacherInput } from "../types";

interface Props {
  initial: TeacherInput;
  hasApiKey: boolean;
  busy: boolean;
  onOpenKey: () => void;
  onSubmit: (input: TeacherInput) => void;
}

const SUBJECTS = [
  "통합과학",
  "물리학",
  "화학",
  "생명과학",
  "지구과학",
  "과학탐구실험",
  "융합과학",
];

const GRADES = [
  "중학교 1학년",
  "중학교 2학년",
  "중학교 3학년",
  "고등학교 1학년",
  "고등학교 2학년",
  "고등학교 3학년",
];

export default function InputForm({
  initial,
  hasApiKey,
  busy,
  onOpenKey,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<TeacherInput>(initial);

  const set = (patch: Partial<TeacherInput>) =>
    setForm((f) => ({ ...f, ...patch }));

  const canSubmit = hasApiKey && form.standard.trim().length > 0 && !busy;

  return (
    <form
      className="rise-in mx-auto max-w-3xl"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(form);
      }}
    >
      <div className="grid grid-cols-1 gap-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-paper-line sm:p-8">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-ink">
            교과
            <input
              list="subject-list"
              value={form.subject}
              onChange={(e) => set({ subject: e.target.value })}
              placeholder="통합과학"
              className="mt-1.5 w-full rounded-lg border border-paper-line bg-paper/50 px-3 py-2.5 text-sm text-ink focus:border-thread focus:bg-white focus:outline-none"
            />
            <datalist id="subject-list">
              {SUBJECTS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>

          <label className="block text-sm font-semibold text-ink">
            학년
            <input
              list="grade-list"
              value={form.grade}
              onChange={(e) => set({ grade: e.target.value })}
              placeholder="고등학교 1학년"
              className="mt-1.5 w-full rounded-lg border border-paper-line bg-paper/50 px-3 py-2.5 text-sm text-ink focus:border-thread focus:bg-white focus:outline-none"
            />
            <datalist id="grade-list">
              {GRADES.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>
        </div>

        <label className="block text-sm font-semibold text-ink">
          성취기준 <span className="text-thread">*</span>
          <textarea
            value={form.standard}
            onChange={(e) => set({ standard: e.target.value })}
            rows={4}
            placeholder="[10통과02-03] 생태계 구성 요소를 이해하고 환경 요인의 변화가 생태계에 미치는 영향을 분석할 수 있다."
            className="mt-1.5 w-full resize-y rounded-lg border border-paper-line bg-paper/50 px-3 py-2.5 text-sm leading-relaxed text-ink focus:border-thread focus:bg-white focus:outline-none"
          />
        </label>

        <label className="block text-sm font-semibold text-ink">
          수업 맥락 메모{" "}
          <span className="font-normal text-ink-soft">(선택)</span>
          <textarea
            value={form.context}
            onChange={(e) => set({ context: e.target.value })}
            rows={2}
            placeholder="예: 4차시 분량, 소집단 탐구 중심, 지역 하천을 소재로 다루고 싶음"
            className="mt-1.5 w-full resize-y rounded-lg border border-paper-line bg-paper/50 px-3 py-2.5 text-sm leading-relaxed text-ink focus:border-thread focus:bg-white focus:outline-none"
          />
        </label>

        {!hasApiKey && (
          <button
            type="button"
            onClick={onOpenKey}
            className="rounded-lg border border-dashed border-thread/60 bg-thread-soft/40 px-4 py-3 text-sm font-semibold text-thread hover:bg-thread-soft/70"
          >
            먼저 Gemini API 키를 등록하세요 →
          </button>
        )}

        <div className="flex items-center justify-between border-t border-paper-line pt-5">
          <p className="max-w-xs text-xs leading-relaxed text-ink-soft">
            다음 단계에서 <strong className="text-ink">Stage 1</strong>(전이
            목표·이해·질문)을 먼저 확인합니다.
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-blueprint px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blueprint-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "생성 중…" : "Stage 1 생성"}
            {!busy && <span aria-hidden>→</span>}
          </button>
        </div>
      </div>
    </form>
  );
}
