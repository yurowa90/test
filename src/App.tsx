import { useState } from "react";
import type {
  GraspsCandidates,
  GraspsSelection,
  GraspsTask,
  Stage1Result,
  TeacherInput,
  WizardStep,
} from "./types";
import {
  DEFAULT_MODEL,
  GeminiError,
  generateGraspsCandidates,
  generateGraspsFinal,
  generateStage1,
} from "./lib/gemini";
import { API_KEY_STORAGE, MODEL_STORAGE, storage } from "./lib/storage";
import { copyToClipboard, downloadMarkdown, toMarkdown } from "./lib/export";
import ApiKeyModal from "./components/ApiKeyModal";
import InputForm from "./components/InputForm";
import Stage1Review from "./components/Stage1Review";
import CandidateSelect from "./components/CandidateSelect";
import GraspsResult from "./components/GraspsResult";

const EMPTY_INPUT: TeacherInput = {
  subject: "",
  grade: "",
  standard: "",
  context: "",
};

const STEPS: { id: WizardStep; label: string; sub: string }[] = [
  { id: "input", label: "입력", sub: "성취기준" },
  { id: "stage1", label: "Stage 1 검토", sub: "이해 확정" },
  { id: "candidates", label: "GRASPS 요소", sub: "후보 선택" },
  { id: "result", label: "완성", sub: "안내문·루브릭" },
];

export default function App() {
  const [step, setStep] = useState<WizardStep>("input");
  const [input, setInput] = useState<TeacherInput>(EMPTY_INPUT);
  const [stage1, setStage1] = useState<Stage1Result | null>(null);
  const [candidates, setCandidates] = useState<GraspsCandidates | null>(null);
  const [selection, setSelection] = useState<GraspsSelection | null>(null);
  const [task, setTask] = useState<GraspsTask | null>(null);
  const [udlOptions, setUdlOptions] = useState(false);

  const [apiKey, setApiKey] = useState(
    () => storage.get(API_KEY_STORAGE) ?? "",
  );
  const [model, setModel] = useState(
    () => storage.get(MODEL_STORAGE) ?? DEFAULT_MODEL,
  );
  const [keyModalOpen, setKeyModalOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  function saveKey(key: string, m: string) {
    setApiKey(key);
    setModel(m);
    storage.set(API_KEY_STORAGE, key);
    storage.set(MODEL_STORAGE, m);
    setKeyModalOpen(false);
  }

  function reportError(e: unknown) {
    if (e instanceof GeminiError) setError(e.message);
    else setError("알 수 없는 오류가 발생했습니다. 다시 시도해 주세요.");
  }

  // Pass 1: 성취기준 → Stage 1
  async function handleInputSubmit(next: TeacherInput) {
    setInput(next);
    setError(null);
    setBusy(true);
    try {
      const result = await generateStage1(next, apiKey, model);
      setStage1(result);
      setStep("stage1");
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  // Pass 2a: 확정된 Stage 1 → 요소별 후보
  async function handleStage1Confirm(confirmed: Stage1Result) {
    setStage1(confirmed);
    setError(null);
    setBusy(true);
    try {
      const result = await generateGraspsCandidates(
        input,
        confirmed,
        apiKey,
        model,
      );
      setCandidates(result);
      setStep("candidates");
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  // Pass 2b: 확정된 6요소 → 안내문·루브릭
  async function runFinal(sel: GraspsSelection) {
    if (!stage1) return;
    setSelection(sel);
    setError(null);
    setBusy(true);
    try {
      const final = await generateGraspsFinal(
        input,
        stage1,
        sel,
        apiKey,
        model,
        udlOptions,
      );
      setTask({
        ...sel,
        studentPrompt: final.studentPrompt,
        productOptions: final.productOptions,
        rubric: final.rubric,
      });
      setStep("result");
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate() {
    if (selection) await runFinal(selection);
  }

  function handleCopy() {
    if (stage1 && task) copyToClipboard(toMarkdown(input, stage1, task));
  }

  function handleDownload() {
    if (stage1 && task) {
      const name = `grasps_${input.subject || "과제"}_${input.grade || ""}`
        .replace(/\s+/g, "")
        .replace(/[^\p{L}\p{N}_-]/gu, "");
      downloadMarkdown(
        `${name || "grasps"}.md`,
        toMarkdown(input, stage1, task),
      );
    }
  }

  function handleRestart() {
    setStep("input");
    setStage1(null);
    setCandidates(null);
    setSelection(null);
    setTask(null);
    setError(null);
  }

  return (
    <div className="min-h-screen">
      {/* 헤더 / 히어로 */}
      <header className="blueprint-grid relative overflow-hidden text-paper">
        <div className="relative mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blueprint-line">
                Understanding by Design · 2단계 파이프라인
              </p>
              <h1 className="serif mt-3 text-3xl font-bold leading-tight sm:text-[2.6rem]">
                이해를 먼저 정하고,
                <br className="hidden sm:block" /> 그 다음에 과제를 설계합니다.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-paper/80 sm:text-base">
                성취기준에서 GRASPS를 바로 뽑으면 '무엇에 대한 이해의 증거인가'가
                비어 버립니다. 이 도구는 먼저 Stage 1(전이 목표·영속적 이해·본질적
                질문)을 뽑아 <strong className="text-white">교사가 확정</strong>한
                뒤, 그 이해를 평가하는 수행과제와 루브릭을 만듭니다.
              </p>
            </div>
            <button
              onClick={() => setKeyModalOpen(true)}
              className="shrink-0 rounded-lg border border-blueprint-line/60 bg-white/5 px-3 py-2 text-xs font-semibold text-paper/90 backdrop-blur hover:bg-white/10"
            >
              {apiKey ? "API 키 ✓" : "API 키 설정"}
            </button>
          </div>

          {/* 진행 스파인 */}
          <nav aria-label="진행 단계" className="mt-10">
            <ol className="flex items-center gap-2 sm:gap-3">
              {STEPS.map((s, i) => {
                const state =
                  i < stepIndex ? "done" : i === stepIndex ? "active" : "todo";
                return (
                  <li
                    key={s.id}
                    className="flex flex-1 items-center gap-2 sm:gap-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
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
                        <span className="block text-[11px] text-paper/50">
                          {s.sub}
                        </span>
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

        {step === "stage1" && stage1 && (
          <Stage1Review
            value={stage1}
            busy={busy}
            udlOptions={udlOptions}
            onToggleUdl={setUdlOptions}
            onBack={() => setStep("input")}
            onConfirm={handleStage1Confirm}
          />
        )}

        {step === "candidates" && candidates && (
          <CandidateSelect
            candidates={candidates}
            busy={busy}
            onBack={() => setStep("stage1")}
            onConfirm={runFinal}
          />
        )}

        {step === "result" && stage1 && task && (
          <GraspsResult
            stage1={stage1}
            task={task}
            busy={busy}
            onRegenerate={handleRegenerate}
            onReselect={() => setStep("candidates")}
            onCopy={handleCopy}
            onDownload={handleDownload}
            onRestart={handleRestart}
          />
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-5 pb-10 text-center text-xs text-ink-soft sm:px-8">
        <p>
          백워드 설계(Wiggins &amp; McTighe, 2005) · UDL Guidelines 3.0(CAST,
          2024) 기반 · BYOK Gemini · 데이터는 브라우저에만 저장됩니다.
        </p>
      </footer>

      <ApiKeyModal
        open={keyModalOpen}
        initialKey={apiKey}
        initialModel={model}
        onSave={saveKey}
        onClose={() => setKeyModalOpen(false)}
      />
    </div>
  );
}
