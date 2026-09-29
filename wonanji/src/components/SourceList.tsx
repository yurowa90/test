import type { LoadedDoc } from "../engine/load";
import type { SourceAnalysis } from "../engine/types";

function ranges(ns: number[]): string {
  const s = [...ns].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? `${s[i]}` : `${s[i]}~${s[j]}`);
    i = j;
  }
  return out.join(", ");
}

const FORMAT: Record<LoadedDoc["format"], string> = { hwp: "HWP", hwpx: "HWPX", pdf: "PDF", image: "사진" };

export default function SourceList({ sources, docs, onRemove }: { sources: SourceAnalysis[]; docs: LoadedDoc[]; onRemove: (i: number) => void }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {sources.map((s, i) => {
        const mcq = s.questions.filter((q) => q.kind === "mcq");
        const essay = s.questions.filter((q) => q.kind === "essay");
        const fmt = docs[i]?.format;
        return (
          <li key={i} className="rise-in py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2">
                  {fmt && <span className="border border-ink px-1.5 text-[10.5px] font-bold">{FORMAT[fmt]}</span>}
                  <span className="truncate font-semibold text-ink">{s.name}</span>
                </p>
                <p className="mt-0.5 text-sm text-ink-2">
                  선택형 {mcq.length}문항
                  {mcq.length > 0 && <span className="text-ink-3"> (원래 {ranges(mcq.map((q) => q.srcNumber ?? 0))}번)</span>}
                  {essay.length > 0 && <> · 논술형 {essay.length}문항</>}
                  {" · "}정답 표시 {s.questions.filter((q) => q.answers.length).length}곳{" · "}
                  <span className="text-ink-3">문항 머리: {s.headStyle}</span>
                </p>
                {s.placeholders.length > 0 && <p className="text-xs text-ink-3">비워 둔 번호(다른 선생님 몫): {ranges(s.placeholders)}번</p>}
                {s.notes.map((n) => (
                  <p key={n} className="text-xs text-warn">
                    {n}
                  </p>
                ))}
                {s.loss.count > 0 && <p className="text-xs text-warn">변환 중 손실 보고 {s.loss.count}건 — 결과를 한글에서 꼭 확인하세요.</p>}
              </div>
              <button type="button" onClick={() => onRemove(i)} className="btn btn-line !min-h-0 shrink-0 !px-2 !py-1 text-xs" aria-label={`${s.name} 빼기`}>
                빼기
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
