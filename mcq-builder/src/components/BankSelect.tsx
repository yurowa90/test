import type { AnalysisResult, Assembly, ItemBank, Proposition, Stimulus, TeacherInput } from "../types";
import { BEHAVIOR_DOMAINS, LEVEL_LABELS } from "../types";
import type { BankDraft, Judgment } from "../lib/workspace";
import { bankReadiness, changeProposition, changeStimulus } from "../lib/workspace";
import { CIRCLED, composeStem, pickLabel } from "../lib/assemble";
import StimulusBody from "./StimulusBody";
import StructureGuide from "./StructureGuide";
import ScientificFigure from "./ScientificFigure";
import FigureEditor from "./FigureEditor";
import { sourceNote } from "../lib/export";

interface Props {
  draft: BankDraft;
  original: ItemBank;
  input: TeacherInput;
  analysis: AnalysisResult | null;
  busy: boolean;
  error: string | null;
  hasApiKey: boolean;
  onChange: (draft: BankDraft) => void;
  onCheckpoint: (label: string) => void;
  onBack: () => void;
  onRegenerate: () => void;
  onConfirm: (stimulus: Stimulus, assembly: Assembly) => void;
  onGenerateFigure: () => void;
}
const EMPTY_JUDGMENT: Judgment = { verdict: "", reason: "", revealed: false };
function neutralOrder(text: string): number {
  let n = 0;
  for (const ch of text) n = (Math.imul(n, 31) + ch.charCodeAt(0)) | 0;
  return n;
}

export default function BankSelect({ draft, original, input, analysis, busy, error, hasApiKey, onChange, onCheckpoint, onBack, onRegenerate, onConfirm, onGenerateFigure }: Props) {
  const { bank, pickIds, practice } = draft;
  const { stimulus, propositions } = bank;
  const format = input.options.format;
  const { required: maxPicks, picks, assembly, issues, pending, ready, advisories } = bankReadiness(draft, input);
  const ordered = practice ? [...propositions].sort((a,b) => neutralOrder(a.text) - neutralOrder(b.text)) : propositions;
  const patch = (next: Partial<BankDraft>) => onChange({ ...draft, ...next });
  const judgment = (id: string, next: Partial<Judgment>) => patch({ judgments: { ...draft.judgments, [id]: { ...(draft.judgments[id] ?? EMPTY_JUDGMENT), ...next } } });
  const note = (id: string, next: Partial<BankDraft["notes"][string]>) => patch({ notes: { ...draft.notes, [id]: { ...(draft.notes[id] ?? { evidence: "", revisionReason: "" }), ...next } } });
  function addProposition() {
    onCheckpoint("명제 직접 작성 전");
    const id = `T-${crypto.randomUUID()}`;
    const p: Proposition = { id, text: "", isTrue: true, level: "C", behavior: "이해", explanation: "" };
    patch({ bank: { ...bank, propositions: [...propositions, p] } });
  }
  return <fieldset disabled={busy} className="bank-editor">
    <legend className="sr-only">자료·명제 편집과 판단 연습</legend>
    <section className="growth-panel bank-progress" id="bank-progress" tabIndex={-1} aria-labelledby="bank-progress-title">
      <h2 id="bank-progress-title">4단계로 넘어가기</h2>
      <p role="status">명제 선택 {picks.length}/{maxPicks}개 · 선택한 명제 확인 {picks.length - pending.length}/{picks.length}개</p>
      <p className="growth-help">전체 후보를 모두 확인할 필요는 없습니다. 조립에 사용할 {maxPicks}개를 선택하고, 선택한 명제의 본문·근거 아래 ‘현재 자료로 진위와 근거를 다시 확인했습니다’를 체크하세요.</p>
      {practice && <button type="button" onClick={() => patch({ practice: false })}>판단 연습을 마치고 편집·조립 모드로 전환</button>}
      {issues.length > 0 && <div><h3>진행 전에 필요한 항목</h3><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
      {!practice && pending.length > 0 && <div className="growth-actions">{pending.map(p => <a key={p.id} href={`#proposition-${p.id}`}>{pickLabel(format,pickIds.indexOf(p.id))} · 명제 {propositions.indexOf(p)+1} 확인하러 가기</a>)}</div>}
      {!hasApiKey && <p className="growth-help">4단계 해설 생성에는 Gemini API 키가 필요합니다. 아래 버튼을 누르면 연결 설정을 엽니다.</p>}
      {error && <p role="alert" className="editorial-alert">{error}</p>}
      <button type="button" className="growth-primary" disabled={busy} onClick={() => onConfirm(stimulus,assembly)}>{busy ? "해설 생성 중…" : ready ? "4단계로 — 해설·사전 점검 생성" : "진행 조건 확인"}</button>
      <p className="growth-help">조건을 충족하면 해설을 생성한 후 4단계로 이동합니다. 실패한 경우 이곳에 오류가 표시되며 편집 내용은 유지됩니다.</p>
    </section>
    <div className="growth-actions">
      <button type="button" aria-pressed={!practice} onClick={() => patch({ practice: false })}>편집·조립 모드</button>
      <button type="button" aria-pressed={practice} onClick={() => patch({ practice: true })}>내가 먼저 판단하기</button>
      <button type="button" onClick={() => onCheckpoint("수동 편집 기준본")}>현재 버전 보관</button>
    </div>
    <p className="growth-help">{practice ? "AI 진위·해설·정답 표시를 숨깁니다. 먼저 판단과 이유를 적은 뒤 비교하세요. 이미 보았던 명제는 새 문제를 푸는 연습과 구분하세요." : "직접 수정 후 선택한 명제를 다시 대조하세요. 자료 변경은 전체 명제 확인을, 명제 변경은 해당 명제 확인을 해제합니다."}</p>
    <section className="growth-panel">
      <h2>자료 — 판단의 근거</h2>
      <p>{stimulus.indirectStem}</p>
      <StimulusBody text={stimulus.body} />
      <ScientificFigure figure={stimulus.figure} source={sourceNote(input, stimulus)} controls={!practice} />
      {stimulus.conditions.filter(c => c.trim()).length > 0 && <p>조건: {stimulus.conditions.filter(c => c.trim()).join(" ")}</p>}
      {!practice && <>
        {stimulus.figureSpec && <details><summary>그림 제작 지시 확인</summary><p>{stimulus.figureSpec}</p></details>}
        {!stimulus.figure && stimulus.figureSpec && <p className="growth-help">아직 그림이 없습니다. 현재 자료로 만들거나 직접 작성하세요.</p>}
        <div className="growth-actions"><button type="button" disabled={busy} onClick={onGenerateFigure}>{stimulus.figure ? "현재 자료로 그림 다시 만들기" : "이 자료로 그림 만들기"}</button>{stimulus.figure && <button type="button" onClick={() => { onCheckpoint("그림 제거 전"); onChange(changeStimulus(draft, { figure: undefined })); }}>그림 제거</button>}</div>
        <p className="growth-help">막대·꺾은선·과정 모식도를 지원합니다. 그림 변경 후에는 선택한 명제를 다시 대조하세요. 본문·조건·출처를 수정하면 이전 그림이 해제됩니다.</p>
        <FigureEditor key={JSON.stringify(stimulus.figure)} figure={stimulus.figure} onApply={figure => { onCheckpoint("그림 수정 전"); onChange(changeStimulus(draft, { figure })); }} />
      </>}
      {!practice && <details>
        <summary>자료·발문 직접 수정</summary>
        {([ ["indirectStem", "간접 발문"], ["body", "자료 본문 (표는 Markdown 가능)"], ["stemPrefix", "직접 발문 앞부분"], ["figureSpec", "그림·그래프 제작 지시"] ] as const).map(([key,label]) => <label key={key}>{label}<textarea rows={key === "body" ? 6 : 2} value={stimulus[key]} onChange={e => onChange(changeStimulus(draft, { [key]: e.target.value }))} /></label>)}
        <label>조건 (한 줄에 하나)<textarea value={stimulus.conditions.join("\n")} onChange={e => onChange(changeStimulus(draft, { conditions: e.target.value.split("\n") }))} /></label>
        {input.sourceMode === "reference" && <fieldset><legend>사용한 출처</legend>{input.sources.map(s => <label className="growth-check" key={s.id}><input type="checkbox" checked={stimulus.sourceIds.includes(s.id)} onChange={e => onChange(changeStimulus(draft, { sourceIds: e.target.checked ? [...stimulus.sourceIds,s.id] : stimulus.sourceIds.filter(id => id !== s.id) }))} />{s.id} · {s.title || "제목 미입력"}</label>)}</fieldset>}
        <details><summary>최초 생성 자료와 비교</summary><div className="comparison"><div><h4>생성 원본</h4><pre>{original.stimulus.body}</pre></div><div><h4>현재 편집본</h4><pre>{stimulus.body}</pre></div></div></details>
      </details>}
    </section>
    <div className={practice ? "" : "bank-layout"}>
      <section>
        <h2>{practice ? "독립 판단 연습" : "명제 편집·선택"}</h2>
        <div className="proposition-list">{ordered.map((p,index) => {
          const j = draft.judgments[p.id] ?? EMPTY_JUDGMENT;
          const baseline = original.propositions.find(x => x.id === p.id);
          const selected = pickIds.includes(p.id);
          const n = draft.notes[p.id];
          return <article className="growth-panel" id={`proposition-${p.id}`} key={p.id}>
            <h3>명제 {index + 1}{!practice && selected ? ` · ${pickLabel(format,pickIds.indexOf(p.id))}` : ""}</h3>
            {practice ? <>
              <p>{p.text || "본문이 없는 명제입니다. 편집 모드에서 작성하세요."}</p>
              <label>나의 진위 판단<select value={j.verdict} onChange={e => judgment(p.id, { verdict: e.target.value as Judgment["verdict"], revealed: false })}><option value="">선택하세요</option><option value="true">참</option><option value="false">거짓</option><option value="uncertain">판단 보류</option></select></label>
              <label>내 판단 근거<textarea value={j.reason} onChange={e => judgment(p.id, { reason: e.target.value, revealed: false })} placeholder="자료의 어느 값·조건을 근거로 판단했나요?" /></label>
              <button type="button" disabled={!j.verdict || !j.reason.trim()} onClick={() => judgment(p.id, { revealed: true })}>판단 근거 비교</button>
              {j.revealed && <div className="growth-feedback"><p>{baseline ? `${original.origin === "example" ? "예시 기준 판정" : "AI 최초 판정"}: ${baseline.isTrue ? "참" : "거짓"} — ${baseline.explanation}` : "교사가 직접 작성한 명제로 AI 최초 판정이 없습니다."}</p>{baseline && baseline.text !== p.text && <p>최초 판정은 수정 전 문장에 대한 것입니다: {baseline.text}</p>}<p>현재 편집본 판정: {p.isTrue ? "참" : "거짓"} — {p.explanation}</p><p>일치 여부는 정오 채점이 아닙니다. 판단이 다르면 원문의 값·단위·예외 조건을 대조하고 편집 모드에서 판정을 수정하세요.</p></div>}
            </> : <>
              <label className="growth-check"><input type="checkbox" checked={selected} disabled={!selected && picks.length >= maxPicks} onChange={() => patch({ pickIds: selected ? pickIds.filter(id => id !== p.id) : [...pickIds,p.id], arrayIndex: 0 })} />조립에 사용</label>
              <label>명제 본문<textarea value={p.text} onChange={e => onChange(changeProposition(draft,p.id,{ text: e.target.value }))} /></label>
              <div className="growth-row"><label>현재 진위<select value={String(p.isTrue)} onChange={e => onChange(changeProposition(draft,p.id,{ isTrue: e.target.value === "true" }))}><option value="true">참</option><option value="false">거짓</option></select></label>
              <label>예상 수행 수준<select value={p.level} onChange={e => onChange(changeProposition(draft,p.id,{ level: e.target.value as Proposition["level"] }))}>{LEVEL_LABELS.map(l => <option key={l}>{l}</option>)}</select></label></div>
              <label>행동 영역<select value={p.behavior} onChange={e => onChange(changeProposition(draft,p.id,{ behavior: e.target.value as Proposition["behavior"] }))}>{BEHAVIOR_DOMAINS.map(b => <option key={b}>{b}</option>)}</select></label>
              <label>진위 판단 근거·오개념 설명<textarea value={p.explanation} onChange={e => onChange(changeProposition(draft,p.id,{ explanation: e.target.value }))} /></label>
              <label>이 명제가 사용하는 자료의 값·조건 (선택)<textarea value={n?.evidence ?? ""} onChange={e => note(p.id, { evidence: e.target.value })} placeholder="예: 표 2의 A와 B, 같은 온도 조건에서의 측정값" /></label>
              <details><summary>원문 비교·수정 이유</summary><p>{baseline?.text || "교사가 새로 작성한 명제"}</p><label>수정 이유 (핵심 수정만 기록)<textarea value={n?.revisionReason ?? ""} onChange={e => note(p.id, { revisionReason: e.target.value })} /></label></details>
              <label className="growth-check"><input type="checkbox" checked={draft.reviewedIds.includes(p.id)} disabled={!p.text.trim() || !p.explanation.trim()} onChange={e => patch({ reviewedIds: e.target.checked ? [...draft.reviewedIds,p.id] : draft.reviewedIds.filter(id => id !== p.id) })} />현재 자료로 진위와 근거를 다시 확인했습니다.</label>
            </>}
          </article>;
        })}</div>
        {!practice && <button type="button" onClick={addProposition}>+ 명제 직접 작성</button>}
      </section>
      {!practice && <aside className="bank-assembly">
        <section className="growth-panel"><h2>조립 결과 {picks.length}/{maxPicks}</h2>
          <ol>{picks.map((p,i) => <li key={p.id}><p>{pickLabel(format,i)}. {p.text}</p><div className="growth-actions"><button type="button" disabled={i === 0} aria-label={`${pickLabel(format,i)} 위로`} onClick={() => { const ids = [...pickIds]; [ids[i-1],ids[i]] = [ids[i],ids[i-1]]; patch({ pickIds: ids, arrayIndex: 0 }); }}>위로</button><button type="button" onClick={() => patch({ pickIds: pickIds.filter(id => id !== p.id), arrayIndex: 0 })}>선택 해제</button></div></li>)}</ol>
          <p>{composeStem(stimulus.stemPrefix,assembly.directStem,stimulus.conditions)}</p>
          {picks.length === maxPicks && <><p>{assembly.choices.map((c,i) => `${CIRCLED[i]} ${c}`).join(" / ")}</p><p>확인 중인 정답: {assembly.answerIndex >= 0 ? CIRCLED[assembly.answerIndex] : "없음"}</p></>}
          {assembly.arrayOptions.length > 1 && <label>선택지 배열<select value={assembly.arrayIndex} onChange={e => patch({ arrayIndex: Number(e.target.value) })}>{assembly.arrayOptions.map((_,i) => <option key={i} value={i}>배열 {i+1}</option>)}</select></label>}
          <p className="growth-help">사전 인지 복잡도 {assembly.difficulty.tier} · 경험적 난도나 학생의 성취수준 판정이 아닙니다.</p>
          <label>자료 복잡도<select value={draft.context.dataComplexity} onChange={e => patch({ context: { ...draft.context, dataComplexity: Number(e.target.value) as 0|1|2 } })}><option value={0}>단순</option><option value={1}>보통</option><option value={2}>복잡</option></select></label>
          <label className="growth-check"><input type="checkbox" checked={draft.context.fusion} onChange={e => patch({ context: { ...draft.context, fusion: e.target.checked } })} />교과 융합</label>
          {issues.length > 0 && <div><h3>진행 전에 필요한 항목</h3><ul className="growth-feedback">{issues.map(w => <li key={w}>{w}</li>)}</ul></div>}
          {advisories.length > 0 && <details><summary>출제 개선 권고 (진행 가능)</summary><ul>{advisories.map(w => <li key={w}>{w}</li>)}</ul></details>}
          {error && <p role="alert" className="editorial-alert">{error}</p>}
          <button type="button" className="growth-primary" disabled={busy} onClick={() => onConfirm(stimulus,assembly)}>{busy ? "생성 중…" : ready ? "4단계로 — 해설·사전 점검 생성" : "진행 조건 확인"}</button>
        </section>
        <StructureGuide input={input} analysis={analysis} assembly={assembly} stimulus={stimulus} notes={draft.notes} />
      </aside>}
    </div>
    <div className="growth-actions"><button type="button" onClick={onBack}>← 평가 요소·장면</button><button type="button" onClick={onRegenerate}>현재 버전 보관 후 자료·명제 재생성</button></div>
  </fieldset>;
}
