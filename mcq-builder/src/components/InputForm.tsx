import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import ReferenceSearch from "./ReferenceSearch";
import type {
  BehaviorDomain,
  ItemFormat,
  ItemOptions,
  ScienceStandard,
  SourceReference,
  StimulusType,
  TargetDifficulty,
  InquiryContext,
  TeacherInput,
} from "../types";
import { BEHAVIOR_DOMAINS, SOURCE_KINDS, SOURCE_USES, STIMULUS_TYPES } from "../types";
import {
  domainsFor,
  loadStandards,
  schoolLevels,
  standardsFor,
  subjectsFor,
} from "../lib/standards";

interface Props {
  initial: TeacherInput;
  onChange: Dispatch<SetStateAction<TeacherInput>>;
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

function blankSource(index: number): SourceReference {
  return {
    id: `S${index}`,
    kind: "논문",
    title: "",
    creators: "",
    year: "",
    locator: "",
    use: "원자료 수치 재구성",
    rights: "",
    dataExcerpt: "",
    verified: false,
  };
}

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
  onChange: setForm,
  hasApiKey,
  busy,
  onOpenKey,
  onSubmit,
}: Props) {
  const form = initial;
  const picker = form.picker ?? { mode: form.standard ? "direct" : "picker", level: "", subject: "", domain: "", code: "" };
  const mode = picker.mode;
  const setMode = (mode: Mode) => setForm(f => ({ ...f, picker: { ...picker, mode } }));

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

  const { level, subject, domain, code } = picker;
  const setPicker = (patch: Partial<typeof picker>) => setForm(f => ({ ...f, picker: { ...(f.picker ?? picker), ...patch } }));
  const setLevel = (level: string) => setPicker({ level });
  const setSubject = (subject: string) => setPicker({ subject });
  const setDomain = (domain: string) => setPicker({ domain });
  const setCode = (code: string) => setPicker({ code });

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

  const updateSource = (id: string, patch: Partial<SourceReference>) =>
    setForm((f) => ({
      ...f,
      sources: f.sources.map((s) =>
        s.id === id
          ? {
              ...s,
              ...patch,
              verified: "verified" in patch ? Boolean(patch.verified) : false,
            }
          : s,
      ),
    }));
  const addSource = () =>
    setForm((f) => {
      const nextIndex =
        Math.max(0, ...f.sources.map((source) => Number(source.id.replace(/^S/, "")) || 0)) + 1;
      return { ...f, sources: [...f.sources, blankSource(nextIndex)] };
    });
  const removeSource = (id: string) =>
    setForm((f) => ({ ...f, sources: f.sources.filter((s) => s.id !== id) }));

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
      grade: next.level,
      standardCode: next.code,
      domain: next.domain,
      achievementLevels: next.levels,
    });
  }

  const sourceReady =
    form.sourceMode === "synthetic" ||
    form.sources.some(
      (s) =>
        s.title.trim() !== "" &&
        s.locator.trim() !== "" &&
        s.dataExcerpt.trim() !== "" &&
        s.verified,
    );
  const canSubmit = hasApiKey && form.standard.trim().length > 0 && sourceReady && !busy;

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

        {/* 출처 기반 자료 */}
        <section className="rounded-xl border border-paper-line bg-white p-4 shadow-sm">
          <h3 className="serif text-sm font-bold text-blueprint">자료·그림·표의 출처</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            논문·전공서적·공공데이터에서 교사가 확인한 수치와 구조를 입력하면 이를
            바탕으로 표와 그래프를 다시 구성합니다. 원본 그림을 그대로 복제하지 않으며,
            모델이 출처나 값을 임의로 만들지 못하게 합니다.
          </p>

          <Seg<"reference" | "synthetic">
            value={form.sourceMode}
            options={[
              { value: "reference", label: "검증한 출처 사용" },
              { value: "synthetic", label: "교육용 합성 자료" },
            ]}
            onChange={(v) => set({ sourceMode: v })}
          />

          {form.sourceMode === "reference" ? (
            <div className="mt-4 space-y-4">
              <ReferenceSearch subject={form.subject} standard={form.standard} />
              {form.sources.map((source, index) => (
                <article
                  key={source.id}
                  className="rounded-xl border border-paper-line bg-paper/30 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-bold text-ink">출처 {index + 1} · {source.verified ? "교사 원문 대조 완료" : "원문 대조 전"}</h4>
                    {form.sources.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSource(source.id)}
                        className="rounded px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        삭제
                      </button>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-semibold text-ink">
                      자료 종류
                      <select
                        value={source.kind}
                        onChange={(e) =>
                          updateSource(source.id, {
                            kind: e.target.value as SourceReference["kind"],
                          })
                        }
                        className={selectClass}
                      >
                        {SOURCE_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {kind}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-ink">
                      활용 방식
                      <select
                        value={source.use}
                        onChange={(e) =>
                          updateSource(source.id, {
                            use: e.target.value as SourceReference["use"],
                          })
                        }
                        className={selectClass}
                      >
                        {SOURCE_USES.map((use) => (
                          <option key={use} value={use}>
                            {use}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-ink sm:col-span-2">
                      논문·책·데이터셋 제목 <span className="text-thread">*</span>
                      <input
                        value={source.title}
                        onChange={(e) => updateSource(source.id, { title: e.target.value })}
                        placeholder="예: 논문명, 전공서적명, 통계표명"
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-ink">
                      저자·기관
                      <input
                        value={source.creators}
                        onChange={(e) => updateSource(source.id, { creators: e.target.value })}
                        placeholder="저자 또는 발행 기관"
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-ink">
                      발행 연도
                      <input
                        value={source.year}
                        onChange={(e) => updateSource(source.id, { year: e.target.value })}
                        placeholder="예: 2025"
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-ink sm:col-span-2">
                      DOI·URL·ISBN·쪽수·그림/표 번호 <span className="text-thread">*</span>
                      <input
                        value={source.locator}
                        onChange={(e) => updateSource(source.id, { locator: e.target.value })}
                        placeholder="예: DOI 10.xxxx/xxxx, Fig. 2, pp. 115-116"
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-ink sm:col-span-2">
                      이용 조건·라이선스
                      <input
                        value={source.rights}
                        onChange={(e) => updateSource(source.id, { rights: e.target.value })}
                        placeholder="예: CC BY 4.0, 수치만 인용하여 재구성, 교사용 제한"
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-ink sm:col-span-2">
                      확인한 수치·표·그림 구조 <span className="text-thread">*</span>
                      <textarea
                        value={source.dataExcerpt}
                        onChange={(e) => updateSource(source.id, { dataExcerpt: e.target.value })}
                        rows={5}
                        placeholder={
                          "원문에서 확인한 데이터만 붙여 넣으세요.\n예: 온도(℃), 효소 활성(상댓값)\n10, 0.12\n20, 0.38\n30, 0.91"
                        }
                        className={`${inputClass} resize-y font-mono leading-relaxed`}
                      />
                    </label>
                  </div>

                  <details className="growth-panel">
                    <summary>원자료 → 출제 자료 변환 기록</summary>
                    <p>수치가 같아도 축·단위·표본·조건을 바꾸면 해석이 달라질 수 있습니다.</p>
                    <label>현재 확인 범위
                      <select value={source.inspected ?? (source.verified ? "figure" : "bibliography")} onChange={e => updateSource(source.id, { inspected: e.target.value as SourceReference["inspected"] })}>
                        <option value="bibliography">서지정보만 확인</option><option value="fulltext">원문 본문 확인</option><option value="figure">그림·표·설명까지 확인</option>
                      </select>
                    </label>
                    {([
                      ["originalLocation", "판본·쪽수·그림/표 번호", "예: 3판, p.125, Fig.4b 및 설명"],
                      ["studyConditions", "대상·표본 수·측정 조건·단위", "원문에 없는 조건은 추정하지 마세요."],
                      ["transformations", "재구성한 부분", "예: 소수 둘째 자리 반올림. 축·단위 유지. 변경 없음도 기록 가능"],
                      ["limitations", "해석 한계", "예: 특정 실험 조건의 결과이며 다른 종으로 일반화하지 않음"],
                    ] as const).map(([key, label, placeholder]) => <label key={key}>{label}<textarea rows={2} value={source[key] ?? ""} placeholder={placeholder} onChange={e => updateSource(source.id, { [key]: e.target.value })} /></label>)}
                  </details>
                  <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink">
                    <input
                      type="checkbox"
                      checked={source.verified}
                      disabled={source.inspected === "bibliography"}
                      onChange={(e) => updateSource(source.id, { verified: e.target.checked, inspected: source.inspected ?? "figure" })}
                      className="mt-0.5 h-4 w-4 accent-blueprint"
                    />
                    원문과 위의 수치·설명을 직접 대조했으며, 출제 목적의 재구성에 필요한
                    이용 조건을 확인했습니다.
                  </label>
                </article>
              ))}

              <button
                type="button"
                onClick={addSource}
                className="text-xs font-semibold text-blueprint hover:underline"
              >
                + 출처 추가
              </button>
              {!sourceReady && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  제목, 위치 정보, 확인한 데이터와 원문 대조 확인을 모두 입력해야 다음
                  단계로 이동할 수 있습니다.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              합성 자료는 실제 연구 결과처럼 표현하지 않습니다. 결과물에 ‘교육용으로
              재구성한 합성 자료’라고 표시됩니다.
            </p>
          )}
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

        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-900">
          입력한 성취기준, 출처 데이터, 출제 맥락은 문항 생성을 위해 Google Gemini API로
          전송됩니다. 실제 정기시험 원안, 공동출제 비공개 문항, 학생 개인정보는 입력하지
          마세요.
        </p>

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
