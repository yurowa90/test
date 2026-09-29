import { useEffect, useMemo, useState } from "react";
import type { Issue, Question } from "../engine/types";
import type { BuildOutput } from "../pipeline";

interface Props {
  out: BuildOutput;
  order: Question[];
  baseName: string;
  onDownload: (kind: "hwp" | "hwpx" | "report") => void;
}

const SEV: Record<Issue["severity"], { label: string; tone: string; rule: string }> = {
  error: { label: "확인 필요", tone: "border-danger/50 bg-danger-soft text-danger", rule: "border-l-danger" },
  warn: { label: "검토 권장", tone: "border-warn/50 bg-warn-soft text-warn", rule: "border-l-warn" },
  info: { label: "참고", tone: "border-line bg-surface-2 text-ink-2", rule: "border-l-line-strong" },
};

type Filter = "all" | Issue["severity"] | "symbol";

/**
 * 미리보기 SVG는 문서 내용(글자·그림)에서 만들어지므로 HTML로 끼워 넣지 않고
 * <img>로 띄웁니다. 이미지로 그린 SVG는 스크립트·외부 자원을 실행하거나 불러오지 않습니다.
 */
function useSvgUrl(svg: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!svg) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [svg]);
  return url;
}

export default function ResultView({ out, order, baseName, onDownload }: Props) {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [showChanges, setShowChanges] = useState(false);
  const url = useSvgUrl(out.svgs[page]);
  useEffect(() => setPage(0), [out]);

  const byKind = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of out.changes) m.set(c.kind, (m.get(c.kind) ?? 0) + 1);
    return [...m];
  }, [out.changes]);
  const count = useMemo(() => {
    const c = { error: 0, warn: 0, info: 0, symbol: 0 };
    for (const i of out.issues) {
      c[i.severity]++;
      if (i.rule === "기호 불일치") c.symbol++;
    }
    return c;
  }, [out.issues]);
  const shown = out.issues.filter((i) => (filter === "all" ? true : filter === "symbol" ? i.rule === "기호 불일치" : i.severity === filter));
  const qLabel = (id?: string) => {
    if (!id) return "";
    const q = order.find((x) => x.id === id);
    const n = out.numbers.get(id);
    return q ? (q.kind === "essay" ? `논술형 ${n}` : `${n}번`) : "";
  };

  return (
    <div className="rise-in space-y-6">
      <div className="flex flex-wrap items-center gap-2 border-y border-ink py-3">
        <button type="button" onClick={() => onDownload("hwp")} className="btn btn-primary">
          {baseName}.hwp 내려받기
        </button>
        <button type="button" onClick={() => onDownload("hwpx")} className="btn btn-line">
          .hwpx 내려받기
        </button>
        <button type="button" onClick={() => onDownload("report")} className="btn btn-line">
          편집 검수 보고서(.txt)
        </button>
        <span className="ml-auto text-sm text-ink-2">
          <b className="serif text-lg text-ink">{out.pages}</b>쪽{out.loss.count ? ` · 변환 손실 보고 ${out.loss.count}건` : ""}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        <section aria-label="원안지 미리보기">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="kicker">미리보기</span>
            <div className="flex items-center gap-1 text-sm">
              <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="btn btn-line !min-h-0 !px-2 !py-0.5" aria-label="앞 쪽">
                ◀
              </button>
              <span className="w-20 text-center tabular-nums">
                {page + 1} / {out.svgs.length}쪽
              </span>
              <button type="button" disabled={page >= out.svgs.length - 1} onClick={() => setPage(page + 1)} className="btn btn-line !min-h-0 !px-2 !py-0.5" aria-label="다음 쪽">
                ▶
              </button>
            </div>
          </div>
          <div className="sheet border border-line-strong bg-canvas p-3 sm:p-5">
            <div className="shadow-[0_2px_10px_rgba(43,31,34,0.18)]">{url && <img src={url} alt={`원안지 ${page + 1}쪽 미리보기`} />}</div>
          </div>
          <div className="mt-2 space-y-1 text-[11.5px] leading-relaxed text-ink-3">
            <p>미리보기는 브라우저용 한글 엔진(rhwp)으로 그린 것이라 글꼴·쪽 나눔·표 높이가 한글과 조금 다를 수 있습니다. ‘문항이 쪼개지지 않게’ 설정은 한글에서만 반영되고, 두 단에 걸친 머리 표 아래 오른쪽 단 첫 줄이 표와 겹쳐 보일 수 있습니다(한글에서는 표 아래에서 시작).</p>
            {out.previewNoNumber.length > 0 && (
              <p className="text-warn">
                {out.previewNoNumber.join(", ")}번은 문항 머리에 어울림 그림·표가 있어 미리보기에서 번호가 안 보일 수 있습니다. 한글 파일에는 번호가 들어가 있습니다.
              </p>
            )}
          </div>
        </section>

        <section aria-label="편집 검수" className="space-y-4">
          <div className="border-b-2 border-ink pb-2">
            <span className="kicker">편집 검수</span>
            <h3 className="serif text-[19px] font-bold">자동으로 고치지 않은 것</h3>
            <p className="text-[12px] text-ink-3">문항 글자·기호는 바꾸지 않았습니다. 근거 문서의 조항을 함께 적었으니 원본에서 확인해 주세요.</p>
          </div>
          <div className="flex flex-wrap gap-1 text-[12px] font-bold" role="tablist" aria-label="검수 항목 거르기">
            {(
              [
                ["all", `전체 ${out.issues.length}`],
                ["error", `확인 필요 ${count.error}`],
                ["warn", `검토 권장 ${count.warn}`],
                ["symbol", `기호 불일치 ${count.symbol}`],
                ["info", `참고 ${count.info}`],
              ] as [Filter, string][]
            ).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`border px-2 py-1 ${filter === k ? "border-primary bg-primary text-white" : "border-line-strong text-ink-2 hover:border-primary hover:text-primary"}`}>
                {l}
              </button>
            ))}
          </div>
          {shown.length === 0 && <p className="text-sm text-ok">해당하는 검수 항목이 없습니다.</p>}
          <ul className="max-h-[70vh] space-y-2 overflow-auto pr-1">
            {shown.map((i, k) => (
              <li key={k} className={`border border-line border-l-[3px] bg-paper px-3 py-2 text-sm ${SEV[i.severity].rule}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`border px-1.5 text-[10.5px] font-bold ${SEV[i.severity].tone}`}>{SEV[i.severity].label}</span>
                  <span className="font-bold">{i.rule}</span>
                  <span className="serif text-xs font-bold text-primary">{qLabel(i.questionId)}</span>
                </div>
                <p className="mt-1 text-ink-2">{i.message}</p>
                <p className="mt-0.5 text-[11px] text-ink-3">근거: {i.source}</p>
              </li>
            ))}
          </ul>

          <div className="border border-line bg-surface-2 px-3 py-2 text-sm">
            <button type="button" onClick={() => setShowChanges(!showChanges)} className="font-bold text-ink" aria-expanded={showChanges}>
              형식만 고친 것 {out.changes.length}건 {showChanges ? "▲" : "▼"}
            </button>
            <p className="text-[11.5px] text-ink-2">{byKind.map(([k, n]) => `${k} ${n}`).join(" · ")} · 모든 문항에 글꼴·크기·줄간격 통일</p>
            {showChanges && (
              <ul className="mt-2 max-h-64 space-y-0.5 overflow-auto text-xs text-ink-2">
                {out.changes.map((c, k) => (
                  <li key={k}>
                    <span className="text-ink-3">{qLabel(c.questionId ?? undefined) || "전체"}</span> {c.kind}: {c.detail}
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
