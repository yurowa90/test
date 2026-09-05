import { useEffect, useState } from "react";
import type { TeacherInput } from "../types";
import type { Workspace } from "../lib/workspace";
import { storage } from "../lib/storage";
import { GeminiError } from "../lib/gemini-client";
import { emptyRevisionContent, proposeRevision, readRevisionMaterial, readRevisionState, REVISION_PARTS, revisionReport, revisionToWorkspace } from "../lib/item-revision";
import type { RevisionContent, RevisionPart, RevisionState } from "../lib/item-revision";
import { downloadMarkdown } from "../lib/export";
import ScientificFigure from "./ScientificFigure";
import FigureEditor from "./FigureEditor";

const KEY = "item-revision-v1";
type Attachment = { name: string; mimeType: string; data: string };
function ContentFields({ content, onChange, prefix, targets }: { content: RevisionContent; onChange: (content: RevisionContent) => void; prefix: string; targets?: RevisionPart[] }) {
  const enabled = (part: RevisionPart) => !targets || targets.includes(part);
  return <div className="revision-fields">
    <fieldset disabled={!enabled("stem")}><legend>발문{!enabled("stem") ? " · 원문 고정" : ""}</legend>
      <label>{prefix} 자료 소개<textarea value={content.intro} onChange={e => onChange({ ...content, intro: e.target.value })} /></label>
      <label>{prefix} 직접 발문 앞부분<input value={content.stemPrefix} onChange={e => onChange({ ...content, stemPrefix: e.target.value })} /></label>
    </fieldset>
    <fieldset disabled={!enabled("material")}><legend>자료{!enabled("material") ? " · 원문 고정" : ""}</legend>
      <label>{prefix} 자료 본문<textarea rows={6} value={content.body} onChange={e => onChange({ ...content, body: e.target.value, figure: undefined })} /></label>
      <label>{prefix} 조건 (한 줄에 하나)<textarea value={content.conditions.join("\n")} onChange={e => onChange({ ...content, conditions: e.target.value.split("\n").filter(Boolean), figure: undefined })} /></label>
      <label>{prefix} 그림 구성·제작 지시<textarea value={content.figureSpec} onChange={e => onChange({ ...content, figureSpec: e.target.value, figure: undefined })} /></label>
    </fieldset>
    <fieldset disabled={!enabled("statements")}><legend>보기·선택지{!enabled("statements") ? " · 원문 고정" : ""}</legend><label>{prefix} 진술 (번호 없이 한 줄에 하나)<textarea rows={5} value={content.statements.join("\n")} onChange={e => onChange({ ...content, statements: e.target.value.split("\n") })} /></label></fieldset>
  </div>;
}

export default function RevisionStudio({ input, apiKey, model, busy, onBusy, onOpenKey, onApply }: { input: TeacherInput; apiKey: string; model: string; busy: boolean; onBusy: (busy: boolean) => void; onOpenKey: () => void; onApply: (work: Workspace) => void }) {
  const [state, setState] = useState<RevisionState>(() => readRevisionState(storage.get(KEY), input));
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(true);
  useEffect(() => { setSaved(storage.set(KEY, JSON.stringify(state))); }, [state]);
  const patch = (next: Partial<RevisionState>) => { setError(""); setState(s => ({ ...s, ...next })); };
  const resetSource = (next: Partial<RevisionState>) => patch({ ...next, reading: null, originalConfirmed: false, proposal: null });
  async function files(selected: FileList | null) {
    if (!selected?.length) return;
    const values = Array.from(selected);
    if (values.length > 3 || values.reduce((n, f) => n + f.size, 0) > 8 * 1024 * 1024 || values.some(f => !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(f.type))) { setError("PDF·PNG·JPEG·WebP를 최대 3개, 합계 8MB 이내로 선택하세요. 큰 PDF는 사용할 페이지만 추려 주세요."); return; }
    onBusy(true); setError("");
    try {
      const loaded = await Promise.all(values.map(file => new Promise<Attachment>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, mimeType: file.type, data: String(reader.result).split(",")[1] }); reader.onerror = reject; reader.readAsDataURL(file); })));
      setAttachments(loaded); resetSource({});
    } catch { setError("첨부 파일을 읽지 못했습니다. 다시 선택하세요."); } finally { onBusy(false); }
  }
  async function read() {
    if (!apiKey) { onOpenKey(); return; }
    if (!state.text.trim() && !attachments.length) { setError("원문·아이디어를 입력하거나 파일을 첨부하세요. URL만으로 원문을 가져오지는 않습니다."); return; }
    onBusy(true); setError("");
    try { const reading = await readRevisionMaterial(state, attachments, apiKey, model); patch({ reading, originalConfirmed: false, proposal: null }); }
    catch (e) { setError(e instanceof GeminiError ? e.message : "원자료를 읽지 못했습니다. 입력은 유지했습니다."); }
    finally { onBusy(false); }
  }
  async function revise() {
    if (!apiKey) { onOpenKey(); return; }
    onBusy(true); setError("");
    try { patch({ proposal: await proposeRevision(state, input, apiKey, model) }); }
    catch (e) { setError(e instanceof GeminiError ? e.message : "수정안을 만들지 못했습니다. 기존 내용은 유지했습니다."); }
    finally { onBusy(false); }
  }
  function apply() { try { onApply(revisionToWorkspace(state, input)); } catch (e) { setError(e instanceof Error ? e.message : "수정안을 확인하세요."); } }
  const proposal = state.proposal;
  const editProposal = (content: RevisionContent) => proposal && patch({ proposal: { ...proposal, content, judgments: content.statements.map(() => ({ verdict: "판단보류", reason: "직접 수정한 내용과 자료의 일치 여부를 다시 확인하세요." })) } });
  return <section className="revision-studio editorial-wide-stage" aria-label="기존 문항·자료 개선">
    <h2>기존 문항·자료 개선</h2><p>원자료 읽기 → 교사 대조 → 부분 수정 → 원본 비교 → 문항 검토로 연결합니다.</p>
    <p className="growth-help">입력·첨부는 읽기 버튼을 누르면 Google Gemini로 전송됩니다. 미공개 시험 원안과 공동출제 기밀은 입력하지 마세요. 첨부 파일 자체는 새로고침 후 다시 선택해야 하며, 읽어 낸 내용과 수정안은 이 브라우저에 저장됩니다.</p>
    {!saved && <p role="alert" className="editorial-alert">자동 저장에 실패했습니다. 개선 기록을 내려받으세요.</p>}
    <fieldset disabled={busy}>
      <div className="revision-meta"><label>입력 자료 유형<select value={state.kind} onChange={e => resetSource({ kind: e.target.value })}>{["기출문제", "교과서·전공서적", "논문", "아이디어"].map(kind => <option key={kind}>{kind}</option>)}</select></label><label>자료 사용 방식<select value={state.sourceMode} onChange={e => patch({ sourceMode: e.target.value as RevisionState["sourceMode"], proposal: null })}><option value="reference">원자료 수치·조건 보존</option><option value="synthetic">아이디어 기반 합성 자료</option></select></label></div>
      <label>원문·아이디어 또는 첨부에서 읽을 범위<textarea rows={5} value={state.text} onChange={e => resetSource({ text: e.target.value })} placeholder="문항 전체를 붙여넣거나, 첨부한 자료의 쪽수·문항 번호·그림 번호와 활용할 아이디어를 적으세요." /></label>
      <label>PDF·문항 사진 첨부 (최대 3개, 합계 8MB)<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple onChange={e => void files(e.target.files)} /></label>
      {attachments.length > 0 && <div><ul>{attachments.map(a => <li key={a.name}>{a.name}</li>)}</ul><button type="button" onClick={() => { setAttachments([]); resetSource({}); }}>첨부 해제</button></div>}
      <label>출처·원문 위치<input value={state.location} onChange={e => resetSource({ location: e.target.value })} placeholder="예: 2024학년도 ○월 ○번 / 책명·쪽수 / 논문 DOI·Figure 2" /></label>
      <div className="revision-meta"><label>개선 문항 과목<input value={state.subject} onChange={e => patch({ subject: e.target.value, proposal: null })} /></label><label>개선 문항 성취기준·수업 범위<textarea value={state.standard} onChange={e => patch({ standard: e.target.value, proposal: null })} /></label></div>
      <div className="revision-meta"><label>개선 문항 유형<select value={state.format} onChange={e => patch({ format: e.target.value as RevisionState["format"], proposal: null })}><option value="hapdab">합답형 (ㄱ·ㄴ·ㄷ)</option><option value="jeongdap">정답형 (옳은 것 하나)</option><option value="bujeong">부정형 (옳지 않은 것 하나)</option></select></label>{state.format === "hapdab" && <label>보기 진술 수<select value={state.bogiCount} onChange={e => patch({ bogiCount: Number(e.target.value) as 3 | 4, proposal: null })}><option value={3}>3개</option><option value={4}>4개</option></select></label>}</div>
      <div className="growth-actions"><button type="button" className="growth-primary" onClick={() => void read()}>1. 원자료 읽기</button><button type="button" onClick={() => patch({ reading: { content: { ...emptyRevisionContent(), body: state.text }, notes: ["교사가 직접 구분한 원문 확인본"], location: state.location }, originalConfirmed: false, proposal: null })}>API 없이 원문 직접 구분</button><button type="button" onClick={() => downloadMarkdown("문항_개선_기록.md", revisionReport(state))}>개선 기록 내려받기</button></div>
      {state.reading && <>
        <h3>2. 원문 확인본 대조</h3><p className="growth-help">OCR·AI 판독은 틀릴 수 있습니다. 특히 수치, 축, 단위, 부등호, 부정 표현을 원자료와 대조하세요.</p>
        <ul>{state.reading.notes.map((note, i) => <li key={i}>{note}</li>)}</ul><p>{state.reading.location}</p>
        <ContentFields prefix="원문" content={state.reading.content} onChange={content => patch({ reading: { ...state.reading!, content }, originalConfirmed: false, proposal: null })} />
        <label className="growth-check"><input type="checkbox" checked={state.originalConfirmed} onChange={e => patch({ originalConfirmed: e.target.checked, proposal: null })} />원문과 읽기 결과의 수치·기호·내용을 대조했습니다.</label>
        <h3>3. 바꿀 부분과 개선 방향</h3><div className="growth-actions">{Object.entries(REVISION_PARTS).map(([key, label]) => <label className="growth-check" key={key}><input type="checkbox" checked={state.targets.includes(key as RevisionPart)} onChange={e => patch({ targets: e.target.checked ? [...state.targets, key as RevisionPart] : state.targets.filter(t => t !== key), proposal: null })} />{label}</label>)}</div>
        <label>개선 방식<select value={state.mode} onChange={e => patch({ mode: e.target.value as RevisionState["mode"], proposal: null })}><option value="polish">다듬기 — 의미·자료 보존</option><option value="variant">변형 — 같은 평가 요소로 새 문항</option><option value="idea">아이디어·자료를 문항으로 구성</option></select></label>
        <label>구체적인 개선 요청<textarea value={state.request} onChange={e => patch({ request: e.target.value, proposal: null })} placeholder="예: 자료값은 유지하고 ㄷ을 오개념을 드러내는 보기로 바꿔 주세요. / 표를 그래프로 바꾸되 계산 부담을 줄여 주세요." /></label>
        <button type="button" className="growth-primary" disabled={!state.originalConfirmed || !state.targets.length} onClick={() => void revise()}>선택한 부분의 수정안 만들기</button>
      </>}
      {proposal && state.reading && <>
        <h3>4. 원본과 수정안 비교</h3><p>{proposal.diagnosis}</p>
        <div className="comparison"><div><h4>원문 확인본</h4><pre>{[state.reading.content.intro, state.reading.content.body, ...state.reading.content.conditions, state.reading.content.stemPrefix, ...state.reading.content.statements].join("\n\n")}</pre></div><div><h4>수정안 · 교사가 직접 다듬을 수 있습니다</h4><ContentFields prefix="수정안" content={proposal.content} targets={state.targets} onChange={editProposal} /></div></div>
        <ScientificFigure figure={proposal.content.figure} source={state.sourceMode === "synthetic" ? "교육용 합성 자료" : state.location} controls />
        {state.targets.includes("material") && <FigureEditor key={JSON.stringify(proposal.content.figure)} figure={proposal.content.figure} onApply={figure => editProposal({ ...proposal.content, figure })} />}
        <ul>{proposal.changes.map((change, i) => <li key={i}><p>{REVISION_PARTS[change.part]} — {change.reason}</p><p className="growth-help">다른 문항에 적용할 원리: {change.principle}</p></li>)}</ul>
        {proposal.warnings.length > 0 && <div className="growth-feedback"><h4>재검토할 점</h4><ul>{proposal.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></div>}
        <h4>수정 후 진위·근거 검토</h4><p className="growth-help">AI 판정은 사전 의견입니다. 판단보류는 직접 해결하고, 가져온 뒤 선택한 진술을 다시 확인하세요. 원문의 정답 번호·선택지 배열은 현재 문항 유형에 따라 재계산됩니다.</p>
        {proposal.content.statements.map((statement, i) => <div className="growth-panel" key={i}><p>{i + 1}. {statement}</p><label>진술 {i + 1} 진위<select value={proposal.judgments[i]?.verdict ?? "판단보류"} onChange={e => patch({ proposal: { ...proposal, judgments: proposal.judgments.map((j, index) => index === i ? { ...j, verdict: e.target.value as typeof j.verdict } : j) } })}>{["판단보류", "참", "거짓"].map(v => <option key={v}>{v}</option>)}</select></label><label>진술 {i + 1} 근거<textarea value={proposal.judgments[i]?.reason ?? ""} onChange={e => patch({ proposal: { ...proposal, judgments: proposal.judgments.map((j, index) => index === i ? { ...j, reason: e.target.value } : j) } })} /></label></div>)}
        <button type="button" className="growth-primary" onClick={apply}>현재 작업 보관 후 3단계로 가져오기</button>
      </>}
    </fieldset>
    {busy && <p role="status">자료를 처리하고 있습니다. 입력 내용은 유지됩니다.</p>}
    {error && <p role="alert" className="editorial-alert">{error}</p>}
  </section>;
}
