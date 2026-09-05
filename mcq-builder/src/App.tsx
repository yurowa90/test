import { useEffect, useState } from "react";
import type { SetStateAction } from "react";
import type { AnalysisResult, Assembly, Stimulus, TeacherInput, WizardStep } from "./types";
import { DEFAULT_MODEL, GeminiError, generateAnalysis, generateBank, generateFinal } from "./lib/gemini";
import { API_KEY_STORAGE, DRAFT_STORAGE, MODEL_STORAGE, storage } from "./lib/storage";
import { copyToClipboard, downloadMarkdown, toStudentMarkdown, toTeacherMarkdown } from "./lib/export";
import { bankReadiness, createBankDraft, editAnalysis, editBank, editInput, readSaved, restoreRevision, startWorkspace } from "./lib/workspace";
import type { BankDraft, Revision, SavedWorkspace, Workspace } from "./lib/workspace";
import ApiKeyModal from "./components/ApiKeyModal";
import InputForm from "./components/InputForm";
import AnalysisReview from "./components/AnalysisReview";
import BankSelect from "./components/BankSelect";
import ItemResult from "./components/ItemResult";
import PedagogyGuide from "./components/PedagogyGuide";
import WorkspacePreview from "./components/WorkspacePreview";
import GrowthNotebook, { notebookMarkdown } from "./components/GrowthNotebook";
import StructureGuide from "./components/StructureGuide";
import { exampleWorkspace } from "./lib/example";

const EMPTY_INPUT: TeacherInput = {
  subject: "", grade: "", standard: "", context: "", sourceMode: "reference",
  sources: [{ id: "S1", kind: "논문", title: "", creators: "", year: "", locator: "", use: "원자료 수치 재구성", rights: "", dataExcerpt: "", verified: false }],
  options: { format: "hapdab", bogiCount: 3, behavior: "auto", difficulty: "중", inquiryContext: "순수과학", stimulusHint: "auto" },
};
const SAVE_KEY = "workspace-v3";
const STEPS: { id: WizardStep; label: string }[] = [{ id: "input", label: "입력" }, { id: "analysis", label: "평가 요소" }, { id: "bank", label: "자료·명제" }, { id: "result", label: "검토·출력" }];

function newRevision(work: Workspace, label: string): Revision {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), label, snapshot: work };
}

export default function App() {
  const [savedWork, setSavedWork] = useState<SavedWorkspace>(() => readSaved(storage.get(SAVE_KEY) ?? storage.get(DRAFT_STORAGE), EMPTY_INPUT));
  const { current: work, revisions } = savedWork;
  const { step, input, analysis, scenarioIndex, bank, bankDraft, stimulus, assembly, final } = work;
  const [saved, setSaved] = useState(true);
  const [apiKey, setApiKey] = useState(() => storage.get(API_KEY_STORAGE) ?? "");
  const [model, setModel] = useState(() => storage.get(MODEL_STORAGE) ?? DEFAULT_MODEL);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"settings" | "preview">("settings");
  const scenario = analysis?.scenarios[scenarioIndex] ?? null;
  const stepIndex = STEPS.findIndex(s => s.id === step);
  const workbenchStep = step === "input" || step === "analysis";

  useEffect(() => {
    // Flush every committed edit and flush again on page exit. No debounce can discard a final keystroke.
    const persist = () => storage.set(SAVE_KEY, JSON.stringify(savedWork));
    setSaved(persist());
    window.addEventListener("pagehide", persist);
    return () => { persist(); window.removeEventListener("pagehide", persist); };
  }, [savedWork]);

  function update(fn: (w: Workspace) => Workspace) {
    setSavedWork(s => ({ ...s, current: fn(s.current) }));
  }
  function checkpoint(label: string) {
    const revision = newRevision(work,label);
    setSavedWork(s => ({ ...s, revisions: [revision,...s.revisions] }));
  }
  function navigate(next: WizardStep) {
    if (busy) return;
    if (next === "result" && !final && bankDraft) {
      void runFinal(bankDraft.bank.stimulus, bankReadiness(bankDraft,input).assembly);
      return;
    }
    update(w => ({ ...w, step: next })); setMobilePane("settings");
  }
  function inputChange(action: SetStateAction<TeacherInput>) {
    if (busy) return;
    if (analysis || bank || final) checkpoint("입력 수정 전");
    update(w => editInput(w, typeof action === "function" ? action(w.input) : action));
  }
  function analysisChange(action: SetStateAction<AnalysisResult>) {
    if (busy) return;
    if (bank || final) checkpoint("평가 요소 수정 전");
    update(w => w.analysis ? editAnalysis(w, typeof action === "function" ? action(w.analysis) : action) : w);
  }
  function scenarioChange(index: number) {
    if (bank || final) checkpoint("장면 변경 전");
    update(w => w.analysis ? editAnalysis(w,w.analysis,index) : w);
  }
  function bankChange(draft: BankDraft) {
    if (busy) return;
    setError(null);
    if (final) checkpoint("완성 문항 수정 전");
    update(w => editBank(w,draft));
  }
  function report(e: unknown) { setError(e instanceof GeminiError ? e.message : "처리하지 못했습니다. 작업은 보존되어 있습니다. 다시 시도해 주세요."); }
  async function handleInputSubmit(next: TeacherInput) {
    if (busy) return;
    if (!apiKey) { setKeyModalOpen(true); return; }
    checkpoint("평가 요소 분석 전"); setBusy(true); setError(null);
    try {
      const result = await generateAnalysis(next,apiKey,model);
      const generated: Workspace = { ...editInput(work,next), analysis: result, step: "analysis" };
      const baseline = newRevision(generated,"AI 평가 요소 최초 초안");
      setSavedWork(s => ({ ...s, current: generated, revisions: [baseline,...s.revisions] }));
      setMobilePane("settings");
    } catch (e) { report(e); } finally { setBusy(false); }
  }
  async function runBank(confirmed: AnalysisResult, index: number) {
    if (busy || !confirmed.scenarios[index]) return;
    if (!apiKey) { setKeyModalOpen(true); return; }
    checkpoint("자료·명제 생성 전"); setBusy(true); setError(null);
    try {
      const result = await generateBank(input,confirmed,confirmed.scenarios[index],apiKey,model);
      const generated: Workspace = { ...editAnalysis(work,confirmed,index), bank: result, bankDraft: createBankDraft(result), step: "bank" };
      const baseline = newRevision(generated,"AI 자료·명제 최초 초안");
      setSavedWork(s => ({ ...s, current: generated, revisions: [baseline,...s.revisions] }));
    } catch (e) { report(e); } finally { setBusy(false); }
  }
  async function runFinal(st: Stimulus, asm: Assembly) {
    if (busy || !analysis || !scenario) return;
    if (bankDraft) {
      const gate = bankReadiness(bankDraft,input);
      if (!gate.ready) {
        update(w => ({ ...w, step: "bank" }));
        setError("아직 진행 조건을 충족하지 않았습니다. 아래 ‘진행 전에 필요한 항목’을 확인하세요.");
        requestAnimationFrame(() => { const panel = document.getElementById("bank-progress"); panel?.focus(); panel?.scrollIntoView({ block: "start" }); });
        return;
      }
      st = bankDraft.bank.stimulus; asm = gate.assembly;
    }
    if (!apiKey) { setKeyModalOpen(true); return; }
    checkpoint("해설·사전 점검 생성 전"); setBusy(true); setError(null);
    update(w => ({ ...w, final: null, teacherChecks: [false,false,false,false] }));
    try {
      const result = await generateFinal(input,analysis,scenario,st,asm,apiKey,model);
      update(w => ({ ...w, stimulus: st, assembly: asm, final: result, step: "result", teacherChecks: [false,false,false,false] }));
    } catch (e) { update(w => ({ ...w, step: "bank" })); report(e); } finally { setBusy(false); }
  }
  function markdown(mode: "student" | "teacher") {
    if (!analysis || !scenario || !stimulus || !assembly || !final || work.teacherChecks.length !== 4 || !work.teacherChecks.every(Boolean)) return null;
    const args = [input,analysis,scenario,stimulus,assembly,final] as const;
    return mode === "student" ? toStudentMarkdown(...args) : toTeacherMarkdown(...args) + notebookMarkdown(work);
  }
  async function handleCopy(mode: "student" | "teacher") { const md = markdown(mode); return md ? copyToClipboard(md) : false; }
  function handleDownload(mode: "student" | "teacher") { const md = markdown(mode); if (md) downloadMarkdown(`${mode === "student" ? "학생용" : "교사용"}_문항.md`,md); }
  function restart() {
    checkpoint("새 문항 시작 전"); update(() => startWorkspace(EMPTY_INPUT)); setError(null); setMobilePane("settings");
  }
  function restore(id: string) {
    const revision = revisions.find(r => r.id === id);
    if (!revision || busy) return;
    checkpoint("이전 버전 복원 전"); update(() => restoreRevision(revision)); setError(null); setMobilePane("settings");
  }
  function saveKey(key: string, m: string) {
    setApiKey(key); setModel(m);
    const keySaved = storage.set(API_KEY_STORAGE, key);
    const modelSaved = storage.set(MODEL_STORAGE, m);
    setError(keySaved && modelSaved ? null : "설정은 현재 창에 적용됐지만 브라우저 저장에 실패했습니다. 새로고침하면 설정을 다시 확인해 주세요.");
    setKeyModalOpen(false);
  }
  function clearKey() {
    setApiKey("");
    const removed = storage.remove(API_KEY_STORAGE);
    setError(removed ? null : "현재 창의 키는 지웠지만 브라우저 저장소 삭제에 실패했습니다. 브라우저 설정에서 이 사이트의 데이터를 삭제해 주세요.");
    setKeyModalOpen(false);
  }
  const available = { input: true, analysis: !!analysis, bank: !!bankDraft, result: !!final || !!bankDraft };
  return <div className="editorial-shell"><div className="editorial-wrap">
    <header className="editorial-header"><div className="editorial-mast"><div><h1>학력평가형 문항 설계·성찰 도우미</h1><p>출제 원리를 이해하고, 근거를 대조하며, 고친 이유를 다음 문항에 연결합니다.</p></div><div className="editorial-stamp"><span>과학과</span><span>2022 개정</span><span>교사 성장</span></div></div></header>
    <section className="method-overview"><div className="method-overview-head"><div><span>설계 방식</span><h2>문항 구조를 보면서 단계적으로 설계합니다</h2><p>교육과정 분석 → 자료·명제 편집 → 근거 대조 → 교사 검토·성찰</p></div><button type="button" className="api-status" disabled={busy} onClick={() => setKeyModalOpen(true)}>{apiKey ? "API 설정 · 키 입력됨" : "API 키 설정"}</button></div><div className="method-cards"><article className="method-card"><strong>교사가 설계하고 판단합니다</strong><small>명제를 직접 작성·수정하고 자료와 대조해 진위를 확인합니다.</small></article><article className="method-card"><strong>수정 과정을 함께 남깁니다</strong><small>원본 비교·출처 변환 기록·성찰 노트가 하나의 작업에 쌓입니다.</small></article></div></section>
    <div className="work-summary"><div className="work-summary-values"><b>{input.subject || "과목 미지정"}</b><span>{input.standardCode || "성취기준 미선택"}</span><span>{input.sourceMode === "reference" ? `교사 대조 출처 ${input.sources.filter(s => s.verified).length}개` : "합성 자료"}</span><span role="status">{saved ? "편집 내용 저장됨" : "저장 실패"}</span></div><nav className="step-nav" aria-label="문항 설계 단계">{STEPS.map((s,i) => <button key={s.id} type="button" disabled={busy || !available[s.id]} className={i === stepIndex ? "is-current" : ""} aria-current={i === stepIndex ? "step" : undefined} onClick={() => navigate(s.id)}>{i+1}. {s.label}</button>)}</nav></div>
    {!saved && <div className="editorial-alert" role="alert">브라우저 저장에 실패했습니다. 이 화면을 닫기 전에 성장 노트와 작업 백업을 내려받으세요.</div>}
    {error && <div className="editorial-alert" role="alert">{error}</div>}
    {busy && <p className="growth-feedback" role="status">AI 응답을 기다리고 있습니다. 이전 버전과 편집 내용은 보존됩니다.</p>}
    <GrowthNotebook work={work} revisions={revisions} onReflection={reflection => update(w => ({ ...w, reflection }))} onCheckpoint={checkpoint} onRestore={restore} busy={busy} saved={saved} />
    <div className="growth-actions"><button type="button" disabled={busy} onClick={() => { checkpoint("예시 체험 전"); update(() => exampleWorkspace()); setError(null); }}>API 키 없이 합성 자료로 출제 연습</button><button type="button" disabled={busy} onClick={restart}>현재 버전 보관 후 새 문항</button></div>
    {workbenchStep && <div className="mobile-tabs" aria-label="설정과 미리보기 전환"><button type="button" aria-pressed={mobilePane === "settings"} aria-selected={mobilePane === "settings"} onClick={() => setMobilePane("settings")}>설정</button><button type="button" aria-pressed={mobilePane === "preview"} aria-selected={mobilePane === "preview"} onClick={() => setMobilePane("preview")}>결과 미리보기</button></div>}
    {workbenchStep ? <div className="editorial-workbench">
      <main className={`paper-pane ${mobilePane === "preview" ? "is-mobile-active" : ""}`}><WorkspacePreview step={step} input={input} analysis={analysis} scenario={scenario} stimulus={null} assembly={null} final={null} /></main>
      <aside className={`editorial-tools ${mobilePane === "settings" ? "is-mobile-active" : ""}`}><PedagogyGuide step={step} /><fieldset disabled={busy}><legend className="sr-only">문항 설계 설정</legend>
        {step === "input" && <InputForm initial={input} onChange={inputChange} hasApiKey={!!apiKey} busy={busy} onOpenKey={() => setKeyModalOpen(true)} onSubmit={handleInputSubmit} />}
        {step === "analysis" && analysis && <AnalysisReview value={analysis} onChange={analysisChange} initialScenarioIndex={scenarioIndex} onScenarioChange={scenarioChange} requireSourcePlan={input.sourceMode === "reference"} busy={busy} onBack={() => navigate("input")} onConfirm={runBank} />}
      </fieldset></aside>
    </div> : <main className="editorial-wide-stage"><PedagogyGuide step={step} />
      {step === "bank" && bankDraft && bank && <BankSelect draft={bankDraft} original={bank} input={input} analysis={analysis} busy={busy} error={error} hasApiKey={!!apiKey} onChange={bankChange} onCheckpoint={checkpoint} onBack={() => navigate("analysis")} onRegenerate={() => analysis && runBank(analysis,scenarioIndex)} onConfirm={runFinal} />}
      {step === "result" && analysis && scenario && stimulus && assembly && final && <><StructureGuide input={input} analysis={analysis} assembly={assembly} stimulus={stimulus} notes={bankDraft?.notes} /><ItemResult input={input} analysis={analysis} scenario={scenario} stimulus={stimulus} assembly={assembly} final={final} teacherChecks={work.teacherChecks} onChecksChange={teacherChecks => update(w => ({ ...w, teacherChecks }))} busy={busy} onRegenerate={() => runFinal(stimulus,assembly)} onReselect={() => navigate("bank")} onCopy={handleCopy} onDownload={handleDownload} onRestart={restart} /></>}
    </main>}
    <footer className="editorial-footer"><p>참고 기준: 경기도교육청 『2024 평가문항 제작 방법』 · 2022 개정 과학과 교육과정</p><p>AI 사전 점검과 교사 원문 대조·최종 확인을 구분합니다.</p></footer>
  </div>{keyModalOpen && <ApiKeyModal initialKey={apiKey} initialModel={model} onSave={saveKey} onClear={clearKey} onClose={() => setKeyModalOpen(false)} />}</div>;
}
