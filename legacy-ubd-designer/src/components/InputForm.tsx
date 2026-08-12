import { useEffect, useMemo, useState } from "react";
import type { ScienceStandard, TeacherInput } from "../types";
import {
  domainsFor,
  loadStandards,
  schoolLevels,
  standardsFor,
  subjectsFor,
} from "../lib/standards";

interface Props {
  initial: TeacherInput;
  hasApiKey: boolean;
  busy: boolean;
  onOpenKey: () => void;
  onSubmit: (input: TeacherInput) => void;
}

type Mode = "picker" | "direct";

const selectClass =
  "mt-1.5 w-full rounded-lg border border-paper-line bg-paper/50 px-3 py-2.5 text-sm text-ink focus:border-thread focus:bg-white focus:outline-none disabled:opacity-50";

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export default function InputForm({
  initial,
  hasApiKey,
  busy,
  onOpenKey,
  onSubmit,
}: Props) {
  const [mode, setMode] = useState<Mode>("picker");
  const [form, setForm] = useState<TeacherInput>(initial);

  const [all, setAll] = useState<ScienceStandard[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // 성취기준 데이터 로드
  useEffect(() => {
    loadStandards()
      .then(setAll)
      .catch(() =>
        setLoadErr(
          "성취기준 목록을 불러오지 못했습니다. 직접 입력으로 진행할 수 있습니다.",
        ),
      );
  }, []);

  // 캐스케이드 선택 상태
  const [level, setLevel] = useState("");
  const [subject, setSubject] = useState("");
  const [domain, setDomain] = useState("");
  const [code, setCode] = useState("");

  const levels = useMemo(() => (all ? schoolLevels(all) : []), [all]);
  const subjects = useMemo(
    () => (all && level ? subjectsFor(all, level) : []),
    [all, level],
  );
  const domains = useMemo(
    () => (all && level && subject ? domainsFor(all, level, subject) : []),
    [all, level, subject],
  );
  const stds = useMemo(
    () =>
      all && level && subject && domain
        ? standardsFor(all, level, subject, domain)
        : [],
    [all, level, subject, domain],
  );
  const selected = useMemo(
    () => stds.find((s) => s.code === code) ?? null,
    [stds, code],
  );

  const set = (patch: Partial<TeacherInput>) =>
    setForm((f) => ({ ...f, ...patch }));

  // 성취기준을 고르면 폼에 반영
  function chooseStandard(next: ScienceStandard | null) {
    if (!next) {
      set({ standard: "", standardCode: undefined, achievementLevels: undefined });
      return;
    }
    set({
      standard: next.text,
      subject: next.subject,
      grade: form.grade || next.level,
      standardCode: next.code,
      achievementLevels: next.levels,
    });
  }

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
        {/* 모드 전환 */}
        <div className="flex gap-1 rounded-lg bg-paper/70 p-1 ring-1 ring-paper-line">
          {(
            [
              ["picker", "공식 과학 성취기준에서 선택"],
              ["direct", "직접 입력"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={[
                "flex-1 rounded-md px-3 py-2 text-sm font-semibold transition",
                mode === m
                  ? "bg-white text-ink shadow-sm ring-1 ring-paper-line"
                  : "text-ink-soft hover:text-ink",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "picker" ? (
          <>
            {loadErr && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {loadErr}
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-ink">
                학교급
                <select
                  value={level}
                  disabled={!all}
                  onChange={(e) => {
                    setLevel(e.target.value);
                    setSubject("");
                    setDomain("");
                    setCode("");
                    chooseStandard(null);
                  }}
                  className={selectClass}
                >
                  <option value="">{all ? "선택" : "불러오는 중…"}</option>
                  {levels.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-semibold text-ink">
                과목
                <select
                  value={subject}
                  disabled={!level}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setDomain("");
                    setCode("");
                    chooseStandard(null);
                  }}
                  className={selectClass}
                >
                  <option value="">선택</option>
                  {subjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-semibold text-ink">
                영역
                <select
                  value={domain}
                  disabled={!subject}
                  onChange={(e) => {
                    setDomain(e.target.value);
                    setCode("");
                    chooseStandard(null);
                  }}
                  className={selectClass}
                >
                  <option value="">선택</option>
                  {domains.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-semibold text-ink">
                성취기준
                <select
                  value={code}
                  disabled={!domain}
                  onChange={(e) => {
                    setCode(e.target.value);
                    chooseStandard(
                      stds.find((s) => s.code === e.target.value) ?? null,
                    );
                  }}
                  className={selectClass}
                >
                  <option value="">선택</option>
                  {stds.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} · {truncate(s.text, 32)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selected && (
              <div className="rounded-lg border border-blueprint/20 bg-blueprint/5 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-blueprint px-2 py-0.5 text-xs font-bold text-white">
                    {selected.code}
                  </span>
                  {selected.levels ? (
                    <span className="rounded-full bg-thread-soft px-2 py-0.5 text-xs font-semibold text-thread">
                      성취수준 {selected.levels.system === 3 ? "A~C" : "A~E"} 포함
                      → 루브릭 정렬
                    </span>
                  ) : (
                    <span className="rounded-full bg-paper-line/60 px-2 py-0.5 text-xs text-ink-soft">
                      성취수준 미개발 (루브릭은 4수준 기본 생성)
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink">
                  {selected.text}
                </p>
              </div>
            )}

            <label className="block text-sm font-semibold text-ink">
              학년 <span className="font-normal text-ink-soft">(선택)</span>
              <input
                value={form.grade}
                onChange={(e) => set({ grade: e.target.value })}
                placeholder="예: 고등학교 1학년"
                className="mt-1.5 w-full rounded-lg border border-paper-line bg-paper/50 px-3 py-2.5 text-sm text-ink focus:border-thread focus:bg-white focus:outline-none"
              />
            </label>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-ink">
                교과
                <input
                  value={form.subject}
                  onChange={(e) =>
                    set({
                      subject: e.target.value,
                      standardCode: undefined,
                      achievementLevels: undefined,
                    })
                  }
                  placeholder="통합과학1"
                  className="mt-1.5 w-full rounded-lg border border-paper-line bg-paper/50 px-3 py-2.5 text-sm text-ink focus:border-thread focus:bg-white focus:outline-none"
                />
              </label>
              <label className="block text-sm font-semibold text-ink">
                학년
                <input
                  value={form.grade}
                  onChange={(e) => set({ grade: e.target.value })}
                  placeholder="고등학교 1학년"
                  className="mt-1.5 w-full rounded-lg border border-paper-line bg-paper/50 px-3 py-2.5 text-sm text-ink focus:border-thread focus:bg-white focus:outline-none"
                />
              </label>
            </div>

            <label className="block text-sm font-semibold text-ink">
              성취기준 <span className="text-thread">*</span>
              <textarea
                value={form.standard}
                onChange={(e) =>
                  set({
                    standard: e.target.value,
                    standardCode: undefined,
                    achievementLevels: undefined,
                  })
                }
                rows={4}
                placeholder="[10통과1-02-03] 생태계 구성 요소를 이해하고 환경 요인의 변화가 생태계에 미치는 영향을 분석할 수 있다."
                className="mt-1.5 w-full resize-y rounded-lg border border-paper-line bg-paper/50 px-3 py-2.5 text-sm leading-relaxed text-ink focus:border-thread focus:bg-white focus:outline-none"
              />
            </label>
          </>
        )}

        <label className="block text-sm font-semibold text-ink">
          수업 목표·핵심 활동{" "}
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
