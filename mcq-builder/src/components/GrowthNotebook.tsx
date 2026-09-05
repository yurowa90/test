import { useState } from "react";
import type { Reflection, Revision, Workspace } from "../lib/workspace";
import { revisionDifferences } from "../lib/workspace";
import { downloadMarkdown, downloadText } from "../lib/export";

export function notebookMarkdown(work: Workspace): string {
  return `\n\n## 교사의 출제 성찰\n\n- 발견한 문제: ${work.reflection.problem || "미기록"}\n- 바꾼 이유: ${work.reflection.reason || "미기록"}\n- 다음 문항에 적용할 원리: ${work.reflection.transfer || "미기록"}\n\n## 명제별 자료 연결·수정 이유\n\n${(work.bankDraft?.bank.propositions ?? []).map((p,i) => `- 명제 ${i+1}: ${p.text}\n  - 자료 연결: ${work.bankDraft?.notes[p.id]?.evidence || "미기록"}\n  - 수정 이유: ${work.bankDraft?.notes[p.id]?.revisionReason || "미기록"}`).join("\n")}`;
}

export default function GrowthNotebook({ work, revisions, onReflection, onCheckpoint, onRestore, busy, saved }: { work: Workspace; revisions: Revision[]; onReflection: (r: Reflection) => void; onCheckpoint: (label: string) => void; onRestore: (id: string) => void; busy: boolean; saved: boolean }) {
  const [selected, setSelected] = useState("");
  const [label, setLabel] = useState("");
  const revision = revisions.find(r => r.id === selected) ?? revisions[0];
  const changes = revision ? revisionDifferences(revision.snapshot,work) : [];
  return <details className="growth-panel growth-notebook">
    <summary>출제 성장 노트 · 보관 버전 {revisions.length}개 · {saved ? "이 브라우저에 저장됨" : "저장 실패 — 기록을 내려받으세요"}</summary>
    <p>긴 보고서 대신 핵심 수정 한두 건만 남기세요. 편집은 자동 저장되고, 재생성·새 문항 시작 전에는 이전 버전을 보관합니다.</p>
    <fieldset disabled={busy}>
      <div className="reflection-grid">{([ ["problem","발견한 문제"], ["reason","바꾼 이유"], ["transfer","다음 문항에 적용할 원리"] ] as const).map(([key,title]) => <label key={key}>{title}<textarea rows={3} value={work.reflection[key]} onChange={e => onReflection({ ...work.reflection, [key]: e.target.value })} /></label>)}</div>
      <div className="growth-actions"><label>보관 이름 (선택)<input value={label} onChange={e => setLabel(e.target.value)} placeholder="예: 오답의 조건을 구체화" /></label><button type="button" onClick={() => onCheckpoint(label.trim() || "교사 수동 보관")}>현재 버전 보관</button><button type="button" onClick={() => downloadMarkdown("출제_성장_노트.md", `# 출제 성장 노트\n${notebookMarkdown(work)}\n\n${[...revisions].reverse().map(r => `## ${r.at} · ${r.label}\n\n${r.snapshot.input.subject} · ${r.snapshot.analysis?.assessmentElement || r.snapshot.input.standard}\n${notebookMarkdown(r.snapshot)}`).join("\n\n")}`)}>전체 성찰 기록 내려받기</button></div>
      {revision && <>
        <label>현재 작업과 비교할 버전<select value={revision.id} onChange={e => setSelected(e.target.value)}>{revisions.map(r => <option key={r.id} value={r.id}>{new Date(r.at).toLocaleString("ko-KR")} · {r.label} · {r.snapshot.input.subject}</option>)}</select></label>
        <button type="button" onClick={() => onRestore(revision.id)}>현재 작업 보관 후 이 버전 복원</button>
        <p className="growth-help">복원하면 교사 최종 확인을 다시 받습니다. 변경 없는 이동은 기록을 만들지 않습니다.</p>
        {changes.length ? changes.map(row => <details key={row.label}><summary>{row.label} 변경</summary><div className="comparison"><div><h4>보관 버전</h4><pre>{row.before}</pre></div><div><h4>현재 작업</h4><pre>{row.after}</pre></div></div></details>) : <p>비교 대상과 편집 내용이 같습니다.</p>}
      </>}
      <button type="button" onClick={() => downloadText("문항_작업_전체백업.json",JSON.stringify({ version: 3, current: work, revisions },null,2),"application/json")}>현재 문항·버전 전체 백업 (.json)</button>
      <p className="growth-help">API 키는 백업에 포함되지 않습니다. 초안과 원자료 발췌는 포함됩니다.</p>
    </fieldset>
  </details>;
}
