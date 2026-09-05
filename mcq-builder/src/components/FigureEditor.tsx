import { useState } from "react";
import type { ItemFigure } from "../lib/figure";
import { chartFromTable, figureIssue, figureTable, validFigure } from "../lib/figure";

const EMPTY: ItemFigure = { kind: "bar", title: "", xLabel: "", yLabel: "", categories: [], xValues: [], series: [], steps: [], caption: "", evidence: "" };

export default function FigureEditor({ figure, onApply }: { figure?: ItemFigure; onApply: (figure: ItemFigure) => void }) {
  const initial = validFigure(figure) ? figure : EMPTY;
  const [draft, setDraft] = useState<ItemFigure>(initial);
  const [table, setTable] = useState(figure ? figureTable(initial) : "");
  const [error, setError] = useState("");
  function apply() {
    try {
      const next = draft.kind === "process" ? { ...draft, categories: [], xValues: [], series: [], xLabel: "", yLabel: "", steps: table.trim().split(/\r?\n/).map(row => { const [title, ...lines] = row.split("|").map(s => s.trim()); return { title, lines }; }) } : chartFromTable(table, draft);
      const issue = figureIssue(next);
      if (issue) throw new Error(issue);
      onApply(next); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "입력한 그림 데이터를 확인하세요."); }
  }
  return <details className="figure-editor"><summary>그림 직접 작성·수정 (API 없이 가능)</summary>
    <label>그림 유형<select value={draft.kind} onChange={e => { setDraft({ ...draft, kind: e.target.value as ItemFigure["kind"] }); setTable(""); setError(""); }}><option value="bar">막대그래프</option><option value="line">꺾은선그래프 (수치 x축)</option><option value="process">과정 모식도 (수치 없음)</option></select></label>
    <label>그림 제목<input value={draft.title} maxLength={60} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
    {draft.kind !== "process" && <div className="growth-row"><label>x축 제목·단위<input value={draft.xLabel} maxLength={40} onChange={e => setDraft({ ...draft, xLabel: e.target.value })} /></label><label>y축 제목·단위<input value={draft.yLabel} maxLength={40} onChange={e => setDraft({ ...draft, yLabel: e.target.value })} /></label></div>}
    <label>{draft.kind === "process" ? "단계별 상태 (한 줄에 ‘단계 제목 | 설명 | 추가 설명’)" : "그래프 값 (시트에서 제목 행과 데이터 행을 함께 복사)"}<textarea rows={6} value={table} onChange={e => setTable(e.target.value)} placeholder={draft.kind === "process" ? "시점 1 | 관찰한 상태\n시점 2 | 관찰한 상태" : "첫 열은 범주 또는 x값, 다음 열부터 계열별 수치입니다. 열은 탭으로 구분합니다."} /></label>
    <p className="growth-help">{draft.kind === "process" ? "2~6단계로 작성합니다. 정답이나 학생이 추론할 결론은 넣지 마세요." : "자료 지점 2~10개, 계열 1~4개를 지원합니다. 값이 없는 자료는 수치를 만들지 말고 과정 모식도로 표현하세요."}</p>
    <label>학생용 그림 설명 (선택)<textarea value={draft.caption} maxLength={180} onChange={e => setDraft({ ...draft, caption: e.target.value })} /></label>
    <label>사용한 값·관계의 근거 (교사용)<textarea value={draft.evidence} maxLength={300} onChange={e => setDraft({ ...draft, evidence: e.target.value })} placeholder="본문 표의 행·열, 논문 그림 번호 또는 모식도로 옮긴 관찰 내용을 적으세요." /></label>
    <button type="button" onClick={apply}>그림 적용 후 명제 다시 확인</button>
    {error && <p role="alert" className="editorial-alert">{error}</p>}
  </details>;
}
