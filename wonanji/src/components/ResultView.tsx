import { useMemo, useState } from "react";
import type { Issue, Question } from "../engine/types";
import type { BuildOutput } from "../pipeline";

interface Props {
  out: BuildOutput;
  order: Question[];
  baseName: string;
  onDownload: (kind: "hwp" | "hwpx" | "report") => void;
}

const SEV: Record<Issue["severity"], { label: string; tone: string }> = {
  error: { label: "확인 필요", tone: "bg-danger-soft text-danger" },
  warn: { label: "검토 권장", tone: "bg-warn-soft text-warn" },
  info: { label: "참고", tone: "bg-paper-deep text-ink-soft" },
};

export default function ResultView({ out, order, baseName, onDownload }: Props) {
  const [page, setPage] = useState(0);
  const [showChanges, setShowChanges] = useState(false);
  const byKind = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of out.changes) m.set(c.kind, (m.get(c.kind) ?? 0) + 1);
    return [...m];
  }, [out.changes]);
  const qLabel = (id?: string) => {
    if (!id) return "";
    const q = order.find((x) => x.id === id);
    const n = out.numbers.get(id);
    return q ? (q.kind === "essay" ? `논술형 ${n}` : `${n}번`) : "";
  };

  return (
    <div className="rise-in space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onDownload("hwp")} className="rounded-md bg-blueprint px-4 py-2 font-semibold text-white hover:bg-blueprint-deep">
          {baseName}.hwp 내려받기
        </button>
        <button type="button" onClick={() => onDownload("hwpx")} className="rounded-md border border-blueprint px-4 py-2 font-semibold text-blueprint hover:bg-blueprint/5">
          .hwpx 내려받기
        </button>
        <button type="button" onClick={() => onDownload("report")} className="rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-paper-deep">
          검수 보고서(.txt)
        </button>
        <span className="text-sm text-ink-faint">
          {out.pages}쪽{out.loss.count ? ` · 변환 손실 보고 ${out.loss.count}건` : ""}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-ink-faint">
        미리보기는 브라우저용 한글 엔진(rhwp)으로 그린 것이라 글꼴·쪽 나눔·표 높이가 한글과 조금 다를 수 있습니다. 특히 ‘문항이 쪼개지지 않게’ 설정은 한글에서만 반영됩니다. 최종 확인은 한글에서 해 주세요.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <section aria-label="원안지 미리보기">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded px-2 py-1 hover:bg-paper-deep disabled:opacity-30">
              ◀
            </button>
            <span className="tabular-nums">
              {page + 1} / {out.svgs.length}쪽
            </span>
            <button type="button" disabled={page >= out.svgs.length - 1} onClick={() => setPage(page + 1)} className="rounded px-2 py-1 hover:bg-paper-deep disabled:opacity-30">
              ▶
            </button>
          </div>
          <div className="sheet overflow-hidden rounded border border-paper-line shadow-sm" dangerouslySetInnerHTML={{ __html: out.svgs[page] ?? "" }} />
        </section>

        <section aria-label="편집 검수" className="space-y-4">
          <div>
            <h3 className="serif text-lg font-semibold">편집 검수</h3>
            <p className="text-xs text-ink-faint">자동으로 고치지 않는 항목입니다. 근거 문서의 해당 조항을 함께 적었습니다.</p>
          </div>
          {out.issues.length === 0 && <p className="text-sm text-ok">검수 항목이 없습니다.</p>}
          <ul className="space-y-2">
            {out.issues.map((i, k) => (
              <li key={k} className="rounded-md border border-paper-line bg-white px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${SEV[i.severity].tone}`}>{SEV[i.severity].label}</span>
                  <span className="font-semibold">{i.rule}</span>
                  <span className="text-xs text-ink-faint">{qLabel(i.questionId)}</span>
                </div>
                <p className="mt-1 text-ink-soft">{i.message}</p>
                <p className="mt-0.5 text-[11px] text-ink-faint">근거: {i.source}</p>
              </li>
            ))}
          </ul>

          <div className="rounded-md bg-paper-deep/60 px-3 py-2 text-sm">
            <button type="button" onClick={() => setShowChanges(!showChanges)} className="font-semibold text-ink">
              자동으로 고친 것 {out.changes.length}건 {showChanges ? "▲" : "▼"}
            </button>
            <p className="text-xs text-ink-soft">{byKind.map(([k, n]) => `${k} ${n}`).join(" · ")} · 모든 문항에 글꼴·크기·줄간격 통일</p>
            {showChanges && (
              <ul className="mt-2 max-h-64 space-y-0.5 overflow-auto text-xs text-ink-soft">
                {out.changes.map((c, k) => (
                  <li key={k}>
                    <span className="text-ink-faint">{qLabel(c.questionId ?? undefined) || "전체"}</span> {c.kind}: {c.detail}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
