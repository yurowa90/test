import { useEffect, useState } from "react";
import type {
  AnalysisResult,
  Assembly,
  FinalItem,
  ItemBank,
  Stimulus,
  TeacherInput,
  WizardStep,
} from "./types";
import {
  DEFAULT_MODEL,
  GeminiError,
  generateAnalysis,
  generateBank,
  generateFinal,
} from "./lib/gemini";
import { API_KEY_STORAGE, DRAFT_STORAGE, MODEL_STORAGE, storage } from "./lib/storage";
import {
  copyToClipboard,
  downloadMarkdown,
  toStudentMarkdown,
  toTeacherMarkdown,
} from "./lib/export";
import ApiKeyModal from "./components/ApiKeyModal";
import InputForm from "./components/InputForm";
import AnalysisReview from "./components/AnalysisReview";
import BankSelect from "./components/BankSelect";
import ItemResult from "./components/ItemResult";

const EMPTY_INPUT: TeacherInput = {
  subject: "",
  grade: "",
  standard: "",
  context: "",
  sourceMode: "reference",
  sources: [
    {
      id: "S1",
      kind: "논문",
      title: "",
      creators: "",
      year: "",
      locator: "",
      use: "원자료 수치 재구성",
      rights: "",
      dataExcerpt: "",
      verified: false,
    },
  ],
  options: {
    format: "hapdab",
    bogiCount: 3,
    behavior: "auto",
    difficulty: "중",
    inquiryContext: "순수과학",
    stimulusHint: "auto",
  },
};

interface DraftSnapshot {
  version: 2;
  step: WizardStep;
  input: TeacherInput;
  analysis: AnalysisResult | null;
  scenarioIndex: number;
  bank: ItemBank | null;
  stimulus: Stimulus | null;
  assembly: Assembly | null;
  final: FinalItem | null;
}

function loadDraft(): DraftSnapshot | null {
  const raw = storage.get(DRAFT_STORAGE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DraftSnapshot>;
    return parsed.version === 2 && parsed.input ? (parsed as DraftSnapshot) : null;
  } catch {
    return null;
  }
}

const STEPS: { id: WizardStep; label: string; sub: string }[] = [
  { id: "input", label: "입력", sub: "성취기준·옵션" },
  { id: "analysis", label: "평가 요소", sub: "장면 확정" },
  { id: "bank", label: "〈보기〉 조립", sub: "명제 선택" },
  { id: "result", label: "결과 검토", sub: "교사 확인·출력" },
];

export default function App() {
  const [seed] = useState<DraftSnapshot | null>(loadDraft);
  const [step, setStep] = useState<WizardStep>(seed?.step ?? "input");
  const [input, setInput] = useState<TeacherInput>(seed?.input ?? EMPTY_INPUT);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(seed?.analysis ?? null);
  const [scenarioIndex, setScenarioIndex] = useState(seed?.scenarioIndex ?? 0);
  const [bank, setBank] = useState<ItemBank | null>(seed?.bank ?? null);
  const [bankVersion, setBankVersion] = useState(0);
  const [stimulus, setStimulus] = useState<Stimulus | null>(seed?.stimulus ?? null);
  const [assembly, setAssembly] = useState<Assembly | null>(seed?.assembly ?? null);
  const [final, setFinal] = useState<FinalItem | null>(seed?.final ?? null);
  const [finalVersion, setFinalVersion] = useState(0);

  const [apiKey, setApiKey] = useState(() => storage.get(API_KEY_STORAGE) ?? "");
  const [model, setModel] = useState(() => storage.get(MODEL_STORAGE) ?? DEFAULT_MODEL);
  const [keyModalOpen, setKeyModalOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const scenario = analysis?.scenarios[scenarioIndex] ?? null;

  useEffect(() => {
    const snapshot: DraftSnapshot = {
      version: 2,
      step,
      input,
      analysis,
      scenarioIndex,
      bank,
      stimulus,
      assembly,
      final,
    };
    const timer = window.setTimeout(() => {
      storage.set(DRAFT_STORAGE, JSON.stringify(snapshot));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [step, input, analysis, scenarioIndex, bank, stimulus, assembly, final]);

  function saveKey(key: string, m: string) {
    setApiKey(key);
    setModel(m);
    storage.set(API_KEY_STORAGE, key);
    storage.set(MODEL_STORAGE, m);
    setKeyModalOpen(false);
  }

  function clearKey() {
    setApiKey("");
    storage.remove(API_KEY_STORAGE);
    setKeyModalOpen(false);
  }

  function reportError(e: unknown) {
    if (e instanceof GeminiError) setError(e.message);
    else setError("알 수 없는 오류가 발생했습니다. 다시 시도해 주세요.");
  }

  // Pass 1: 성취기준 → 교육과정 분석·평가 요소·문제 장면
  async function handleInputSubmit(next: TeacherInput) {
    setInput(next);
    setError(null);
    setBusy(true);
    try {
      const result = await generateAnalysis(next, apiKey, model);
      setAnalysis(result);
      setScenarioIndex(0);
      setStep("analysis");
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  // Pass 2a: 확정된 평가 요소·장면 → 자료 + 명제 풀
  async function runBank(confirmed: AnalysisResult, idx: number) {
    const sc = confirmed.scenarios[idx];
    if (!sc) return;
    setError(null);
    setBusy(true);
    try {
      const result = await generateBank(input, confirmed, sc, apiKey, model);
      setBank(result);
      setStimulus(null);
      setAssembly(null);
      setFinal(null);
      setBankVersion((v) => v + 1);
      setStep("bank");
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleAnalysisConfirm(confirmed: AnalysisResult, idx: number) {
    setAnalysis(confirmed);
    setScenarioIndex(idx);
    await runBank(confirmed, idx);
  }

  async function handleBankRegenerate() {
    if (analysis) await runBank(analysis, scenarioIndex);
  }

  // Pass 2b: 잠근 문항 골격 → 해설·문항정보표·AI 사전 점검
  async function runFinal(st: Stimulus, asm: Assembly) {
    if (!analysis || !scenario) return;
    setStimulus(st);
    setAssembly(asm);
    setError(null);
    setBusy(true);
    try {
      const result = await generateFinal(input, analysis, scenario, st, asm, apiKey, model);
      setFinal(result);
      setFinalVersion((version) => version + 1);
      setStep("result");
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerateFinal() {
    if (stimulus && assembly) await runFinal(stimulus, assembly);
  }

  function markdown(mode: "student" | "teacher"): string | null {
    if (!analysis || !scenario || !stimulus || !assembly || !final) return null;
    const args = [input, analysis, scenario, stimulus, assembly, final] as const;
    return mode === "student" ? toStudentMarkdown(...args) : toTeacherMarkdown(...args);
  }

  async function handleCopy(mode: "student" | "teacher"): Promise<boolean> {
    const md = markdown(mode);
    return md ? copyToClipboard(md) : false;
  }

  function handleDownload(mode: "student" | "teacher") {
    const md = markdown(mode);
    if (!md) return;
    const name = `${mode === "student" ? "학생용" : "교사용"}_${input.standardCode || input.subject || "문항"}`
      .replace(/\s+/g, "")
      .replace(/[^\p{L}\p{N}_-]/gu, "");
    downloadMarkdown(`${name || "item"}.md`, md);
  }

  function handleRestart() {
    if (
      (analysis || bank || final) &&
      !window.confirm("현재 문항과 생성 이력을 지우고 새 문항을 시작하시겠습니까?")
    ) {
      return;
    }
    setStep("input");
    setInput(EMPTY_INPUT);
    setAnalysis(null);
    setScenarioIndex(0);
    setBank(null);
    setStimulus(null);
    setAssembly(null);
    setFinal(null);
    setError(null);
    storage.remove(DRAFT_STORAGE);
  }

  return (
    <div className="min-h-screen">
      {/* 헤더 / 히어로 */}
      <header className="blueprint-grid relative overflow-hidden text-paper">
        <div className="relative mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blueprint-line">
                과학 선다형 · 경기도교육청 문항 제작 지침 · 교사 검토형 4단계
              </p>
              <h1 className="serif mt-3 text-3xl font-bold leading-tight sm:text-[2.6rem]">
                평가 요소를 먼저 정하고,
                <br className="hidden sm:block" /> 그 다음에 문항을 조립합니다.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-paper/80 sm:text-base">
                성취기준에서 문항을 바로 뽑지 않습니다. 교육과정 분석 → 평가 요소·문제
                장면을 <strong className="text-white">교사가 확정</strong>한 뒤, 자료와
                참·거짓 명제 풀을 만들고, 선생님이 고른 ㄱㄴㄷ 조합을 발문 분기·복수
                정답 차단·난이도 추천 규칙으로 조립합니다.
              </p>
            </div>
            <button
              onClick={() => setKeyModalOpen(true)}
              className="shrink-0 rounded-lg border border-blueprint-line/60 bg-white/5 px-3 py-2 text-xs font-semibold text-paper/90 backdrop-blur hover:bg-white/10"
            >
              {apiKey ? "API 키 ✓" : "API 키 설정"}
            </button>
          </div>

          <nav aria-label="진행 단계" className="mt-10">
            <ol className="flex items-center gap-2 sm:gap-3">
              {STEPS.map((s, i) => {
                const state = i < stepIndex ? "done" : i === stepIndex ? "active" : "todo";
                return (
                  <li key={s.id} className="flex flex-1 items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-current={state === "active" ? "step" : undefined}
                        className={[
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-1 transition",
                          state === "active"
                            ? "bg-thread text-white ring-thread"
                            : state === "done"
                              ? "bg-white/90 text-blueprint ring-white/90"
                              : "bg-transparent text-paper/50 ring-blueprint-line/60",
                        ].join(" ")}
                      >
                        {state === "done" ? "✓" : i + 1}
                      </span>
                      <span className="hidden sm:block">
                        <span
                          className={[
                            "block text-sm font-semibold",
                            state === "todo" ? "text-paper/50" : "text-paper",
                          ].join(" ")}
                        >
                          {s.label}
                        </span>
                        <span className="block text-[11px] text-paper/50">{s.sub}</span>
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <span
                        className={[
                          "h-px flex-1",
                          i < stepIndex ? "bg-thread" : "bg-blueprint-line/50",
                        ].join(" ")}
                        aria-hidden
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </header>

      <main className="px-5 py-8 sm:px-8 sm:py-12">
        {error && (
          <div
            role="alert"
            className="mx-auto mb-6 max-w-3xl rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            {error}
          </div>
        )}

        {step === "input" && (
          <InputForm
            initial={input}
            hasApiKey={!!apiKey}
            busy={busy}
            onOpenKey={() => setKeyModalOpen(true)}
            onSubmit={handleInputSubmit}
          />
        )}

        {step === "analysis" && analysis && (
          <AnalysisReview
            key={analysis.assessmentElement}
            value={analysis}
            initialScenarioIndex={scenarioIndex}
            requireSourcePlan={input.sourceMode === "reference"}
            busy={busy}
            onBack={() => setStep("input")}
            onConfirm={handleAnalysisConfirm}
          />
        )}

        {step === "bank" && bank && (
          <BankSelect
            key={bankVersion}
            bank={bank}
            format={input.options.format}
            bogiCount={input.options.bogiCount}
            sourceMode={input.sourceMode}
            busy={busy}
            initialStimulus={stimulus}
            initialAssembly={assembly}
            onBack={() => setStep("analysis")}
            onRegenerate={handleBankRegenerate}
            onConfirm={runFinal}
          />
        )}

        {step === "result" && analysis && scenario && stimulus && assembly && final && (
          <ItemResult
            key={finalVersion}
            input={input}
            analysis={analysis}
            scenario={scenario}
            stimulus={stimulus}
            assembly={assembly}
            final={final}
            busy={busy}
            onRegenerate={handleRegenerateFinal}
            onReselect={() => setStep("bank")}
            onCopy={handleCopy}
            onDownload={handleDownload}
            onRestart={handleRestart}
          />
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-5 pb-10 text-center text-xs text-ink-soft sm:px-8">
        <p>
          경기도교육청 『2024 평가문항 제작 방법』 · 2022 개정 과학과 성취기준 473개 ·
          입력 내용은 문항 생성을 위해 Google Gemini API로 전송되며, 작업 초안과 키는 이
          브라우저에 저장됩니다.
        </p>
      </footer>

      <ApiKeyModal
        open={keyModalOpen}
        initialKey={apiKey}
        initialModel={model}
        onSave={saveKey}
        onClear={clearKey}
        onClose={() => setKeyModalOpen(false)}
      />
    </div>
  );
}
