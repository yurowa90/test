import { useState } from "react";

export default function ReferenceSearch({ subject, standard }: { subject: string; standard: string }) {
  const [query, setQuery] = useState("");
  const suggested = [subject, standard].filter(Boolean).join(" ");
  const term = encodeURIComponent(query.trim() || suggested);
  return <details className="growth-panel">
    <summary>레퍼런스 찾기·고르기</summary>
    <p>평가할 관계와 측정 변인을 검색어로 좁히세요. 예: 자연선택 → 형질 변화·생존율·세대, 영어 검색어: trait survival generation.</p>
    <label>검색어 (공개된 개념·변인만 입력)
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder={suggested || "개념 + 측정 변인 + 실험 대상"} />
    </label>
    <div className="growth-actions">
      <a href={`https://pubmed.ncbi.nlm.nih.gov/?term=${term}`} target="_blank" rel="noreferrer">PubMed 논문 검색 ↗</a>
      <a href={`https://search.crossref.org/?q=${term}`} target="_blank" rel="noreferrer">Crossref 서지·DOI 검색 ↗</a>
      <a href="https://openstax.org/subjects/science" target="_blank" rel="noreferrer">OpenStax 공개 교재 ↗</a>
    </div>
    <p>외부 검색으로 이동합니다. 앱이 원문을 검색·검증한 추천 목록은 아닙니다. PubMed는 생명·의학 분야, Crossref는 분야 전반의 서지 탐색에 사용하세요.</p>
    <ol><li>교육과정 범위에서 읽을 수 있는 자료인가?</li><li>묻고 싶은 관계가 그림·표에 실제로 제시되는가?</li><li>단위·표본·오차·조건을 유지해 재구성할 수 있는가?</li><li>원문 접근과 출처 표시·이용 조건을 확인했는가?</li></ol>
  </details>;
}
