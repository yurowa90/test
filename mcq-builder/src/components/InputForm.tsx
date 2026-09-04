import { useEffect, useMemo, useState } from "react";
import type {
  BehaviorDomain,
  ItemFormat,
  ItemOptions,
  ScienceStandard,
  StimulusType,
  TargetDifficulty,
  InquiryContext,
  TeacherInput,
} from "../types";
import { BEHAVIOR_DOMAINS, STIMULUS_TYPES } from "../types";
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
const inputClass =
  "mt-1.5 w-full rounded-lg border border-paper-line bg-paper/50 px-3 py-2.5 text-sm text-ink focus:border-thread focus:bg-white focus:outline-none";

const FORMAT_HINTS: Record<ItemFormat, string> = {
  hapdab:
    "〈보기〉 ㄱ, ㄴ, ㄷ의 진위 조합을 고르는 5지선다. 과학탐구의 표준 유형이며 발문은 선택지 항목 수에 따라 자동 분기됩니다.",
  jeongdap: "옳은 진술 1개 + 그럴듯한 오답 4개. 명제 풀에서 참 1개·거짓 4개를 고릅니다.",
  bujeong:
    "옳지 않은 진술 1개 + 옳은 진술 4개. 부정어 '않은'에 밑줄이 붙습니다. 다수 출제는 지양(지침 p.46).",
};

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1 rounded-lg bg-paper/70 p-1 ring-1 ring-paper-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={[
            "rounded-md px-3 py-1.5 text-sm font-semibold transition",
            value === o.value
              ? "bg-white text-ink shadow-sm ring-1 ring-paper-line"
              : "text-ink-soft hover:text-ink",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
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

  useEffect(() => {
    loadStandards()
      .then(setAll)
      .catch(() =>
        setLoadErr(
          "성취기준 목록을 불러오지 못했습니다. 직접 입력으로 진행할 수 있습니다.",
        ),
      );
  }, []);

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
  const setOpt = (patch: Partial<ItemOptions>) =>
    setForm((f) => ({ ...f, options: { ...f.options, ...patch } }));
  const o = form.options;

  function chooseStandard(next: ScienceStandard | null) {
    if (!next) {
      set({
        standard: "",
        standardCode: undefined,
        domain: undefined,
        achievementLevels: undefined,
      });
      return;
    }
    set({
      standard: next.text,
      subject: next.subject,
      grade: form.grade || next.level,
      standardCode: next.code,
      domain: next.domain,
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
                      → 명제 수준 라벨의 근거
                    </span>
                  ) : (
                    <span className="rounded-full bg-paper-line/60 px-2 py-0.5 text-xs text-ink-soft">
                      성취수준 미개발 (판별점 기준으로 라벨링)
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
                className={inputClass}
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
                      domain: undefined,
                      achievementLevels: undefined,
                    })
                  }
                  placeholder="통합과학1"
                  className={inputClass}
                />
              </label>
              <label className="block text-sm font-semibold text-ink">
                학년
                <input
                  value={form.grade}
                  onChange={(e) => set({ grade: e.target.value })}
                  placeholder="고등학교 1학년"
                  className={inputClass}
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
                    domain: undefined,
                    achievementLevels: undefined,
                  })
                }
                rows={4}
                placeholder="[10통과1-02-03] 생태계 구성 요소를 이해하고 환경 요인의 변화가 생태계에 미치는 영향을 분석할 수 있다."
                className={`${inputClass} resize-y leading-relaxed`}
              />
            </label>
          </>
        )}

        {/* 문항 옵션 */}
        <section className="rounded-xl border border-paper-line bg-paper/40 p-4">
          <h3 className="serif text-sm font-bold text-blueprint">문항 옵션</h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            교육청 지침의 문항 유형·행동 영역·탐구 상황 축입니다. '자동'으로 두면
            성취기준에 맞춰 모델이 고르고, 다음 단계에서 다시 확인할 수 있습니다.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className="block text-sm font-semibold text-ink">문항 유형</span>
              <Seg<ItemFormat>
                value={o.format}
                options={[
                  { value: "hapdab", label: "합답형 〈보기〉 ㄱㄴㄷ" },
                  { value: "jeongdap", label: "정답형" },
                  { value: "bujeong", label: "부정형" },
                ]}
                onChange={(v) => setOpt({ format: v })}
              />
              <p className="mt-1 text-xs text-ink-soft">{FORMAT_HINTS[o.format]}</p>
            </div>

            {o.format === "hapdab" && (
              <div>
                <span className="block text-sm font-semibold text-ink">
                  〈보기〉 항목 수
                </span>
                <Seg<"3" | "4">
                  value={String(o.bogiCount) as "3" | "4"}
                  options={[
                    { value: "3", label: "3항 (ㄱ ㄴ ㄷ)" },
                    { value: "4", label: "4항 (ㄱ ㄴ ㄷ ㄹ)" },
                  ]}
                  onChange={(v) => setOpt({ bogiCount: v === "4" ? 4 : 3 })}
                />
              </div>
            )}

            <label className="block text-sm font-semibold text-ink">
              행동 영역
              <select
                value={o.behavior}
                onChange={(e) =>
                  setOpt({ behavior: e.target.value as BehaviorDomain | "auto" })
                }
                className={selectClass}
              >
                <option value="auto">자동 (성취기준에서 판단)</option>
                {BEHAVIOR_DOMAINS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span className="block text-sm font-semibold text-ink">목표 난이도</span>
              <Seg<TargetDifficulty>
                value={o.difficulty}
                options={[
                  { value: "상", label: "상" },
                  { value: "중", label: "중" },
                  { value: "하", label: "하" },
                ]}
                onChange={(v) => setOpt({ difficulty: v })}
              />
            </div>

            <div>
              <span className="block text-sm font-semibold text-ink">탐구 상황</span>
              <Seg<InquiryContext>
                value={o.inquiryContext}
                options={[
                  { value: "순수과학", label: "순수과학" },
                  { value: "실생활", label: "실생활" },
                ]}
                onChange={(v) => setOpt({ inquiryContext: v })}
              />
            </div>

            <label className="block text-sm font-semibold text-ink">
              선호 자료 형태
              <select
                value={o.stimulusHint}
                onChange={(e) =>
                  setOpt({ stimulusHint: e.target.value as StimulusType | "auto" })
                }
                className={selectClass}
              >
                <option value="auto">자동</option>
                {STIMULUS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <label className="block text-sm font-semibold text-ink">
          출제 맥락 메모 <span className="font-normal text-ink-soft">(선택)</span>
          <textarea
            value={form.context}
            onChange={(e) => set({ context: e.target.value })}
            rows={2}
            placeholder="예: 2학기 중간고사 3점 문항, 교과서에서 다룬 지역 하천 탐구 자료를 소재로, 계산은 최소화"
            className={`${inputClass} resize-y leading-relaxed`}
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
            다음 단계에서 <strong className="text-ink">평가 요소·평가 목표·문제 장면</strong>을
            먼저 확인합니다. 문항은 그 뒤에 만듭니다.
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-blueprint px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blueprint-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "분석 중…" : "평가 요소 분석"}
            {!busy && <span aria-hidden>→</span>}
          </button>
        </div>
      </div>
    </form>
  );
}
