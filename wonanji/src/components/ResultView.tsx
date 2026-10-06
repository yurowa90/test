import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FormatSpec, Issue, Question, SymbolFix } from "../engine/types";
import type { BuildOutput } from "../pipeline";
import { checklist, groupIssues, scoreOf, SEV_LABEL, type IssueGroup } from "../work";

export type DownloadKind = "hwp" | "hwpx" | "student" | "report";

interface Props {
  out: BuildOutput;
  order: Question[];
  excluded: Question[];
  spec: FormatSpec;
  /** 3·4단계가 바뀌어 이 결과가 오래됐는지 */
  stale: boolean;
  busy: boolean;
  onRebuild: () => void;
  onDownload: (kind: DownloadKind, base: string) => void;
  onFocusQuestion: (id: string) => void;
  onFixAll: (ids: string[], fix: SymbolFix[]) => void;
}

const SEV_TONE: Record<Issue["severity"], { tone: string; rule: string }> = {
  error: { tone: "border-danger/50 bg-danger-soft text-danger", rule: "border-l-danger" },
  warn: { tone: "border-warn/50 bg-warn-soft text-warn", rule: "border-l-warn" },
  info: { tone: "border-line bg-surface-2 text-ink-2", rule: "border-l-line-strong" },
};
const CIRCLED = "①②③④⑤";

type Sev = "all" | Issue["severity"];

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

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
};

export default function ResultView({ out, order, excluded, spec, stale, busy, onRebuild, onDownload, onFocusQuestion, onFixAll }: Props) {
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [sev, setSev] = useState<Sev>("all");
  const [rule, setRule] = useState<string | null>(null);
  const [openKinds, setOpenKinds] = useState<Set<string>>(new Set());
  const [showChanges, setShowChanges] = useState(false);
  const [base, setBase] = useState(`원안지_${today()}`);
  const previewRef = useRef<HTMLElement>(null);
  const pageCount = out.svgs.length;
  // 다시 만들어도 보던 쪽·거르기는 그대로 두고, 쪽 수가 줄었으면 마지막 쪽으로
  useEffect(() => setPage((p) => Math.min(p, Math.max(0, pageCount - 1))), [pageCount]);
  const url = useSvgUrl(out.svgs[Math.min(page, pageCount - 1)]);

  const byKind = useMemo(() => {
    const m = new Map<string, typeof out.changes>();
    for (const c of out.changes) m.set(c.kind, [...(m.get(c.kind) ?? []), c]);
    return [...m];
  }, [out.changes]);
  const count = useMemo(() => {
    const c = { error: 0, warn: 0, info: 0 };
    for (const i of out.issues) c[i.severity]++;
    return c;
  }, [out.issues]);
  const rules = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of out.issues) if (sev === "all" || i.severity === sev) m.set(i.rule, (m.get(i.rule) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [out.issues, sev]);
  const groups = useMemo(() => groupIssues(out.issues.filter((i) => (sev === "all" || i.severity === sev) && (!rule || i.rule === rule))), [out.issues, sev, rule]);
  const qOf = (id: string) => order.find((x) => x.id === id);
  const qLabel = (id?: string | null) => {
    if (!id) return "";
    const q = qOf(id);
    const n = out.numbers.get(id);
    return q ? (q.kind === "essay" ? `논술형 ${n}` : `${n}번`) : "";
  };
  const goPage = (id: string) => {
    const pg = out.pageOf.get(id);
    if (pg == null) return;
    setPage(pg);
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const checks = checklist(out, order, spec);

  return (
    <div className="rise-in space-y-6">
      {stale && (
        <div role="status" className="flex flex-wrap items-center gap-3 border border-warn/50 border-l-[3px] border-l-warn bg-warn-soft px-3 py-2 text-sm text-warn">
          <span className="min-w-0 flex-1">
            <b>3·4단계에서 바뀐 내용이 아직 반영되지 않았습니다.</b> 아래 미리보기·검수는 바뀌기 전 결과이며, 내려받기는 다시 만든 뒤에 할 수 있습니다.
          </span>
          <button type="button" onClick={onRebuild} disabled={busy} className="btn btn-primary !min-h-0 !py-1.5">
            바뀐 내용으로 다시 만들기
          </button>
        </div>
      )}

      <div className="space-y-2 border-y border-ink py-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="out-name" className="text-[12px] font-bold text-ink-3">
            파일 이름
          </label>
          <input id="out-name" value={base} onChange={(e) => setBase(e.target.value.replace(/[\\/:*?"<>|]/g, ""))} className="field !min-h-0 !w-56 !py-1 text-[13px]" />
          <span className="ml-auto text-sm text-ink-2">
            <b className="serif text-lg text-ink">{out.pages}</b>쪽{out.loss.count ? ` · 변환 손실 보고 ${out.loss.count}건` : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={stale} onClick={() => onDownload("hwp", base)} className="btn btn-primary" title="정답 음영이 들어 있습니다(교사 보관·검토용)">
            교사용 .hwp <span className="text-[11px] font-semibold opacity-80">정답 음영 포함</span>
          </button>
          <button type="button" disabled={stale} onClick={() => onDownload("student", base)} className="btn btn-ink" title="선택형 정답 음영만 지운 사본(학생 배부·인쇄용)">
            학생 배부용 .hwp <span className="text-[11px] font-semibold opacity-80">정답 음영 없음</span>
          </button>
          <button type="button" disabled={stale} onClick={() => onDownload("hwpx", base)} className="btn btn-line">
            교사용 .hwpx
          </button>
          <button type="button" disabled={stale} onClick={() => onDownload("report", base)} className="btn btn-line">
            편집 검수 보고서(.txt)
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        <section ref={previewRef} aria-label="원안지 미리보기" className="scroll-mt-nav min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="kicker">미리보기</span>
            <div className="flex items-center gap-1 text-sm">
              <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="btn btn-line !min-h-9 !px-2.5 !py-0.5" aria-label="앞 쪽">
                ◀
              </button>
              <select value={page} onChange={(e) => setPage(Number(e.target.value))} className="field !min-h-9 !w-auto !py-0.5 tabular-nums" aria-label="쪽 고르기">
                {out.svgs.map((_, i) => (
                  <option key={i} value={i}>
                    {i + 1} / {pageCount}쪽
                  </option>
                ))}
              </select>
              <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)} className="btn btn-line !min-h-9 !px-2.5 !py-0.5" aria-label="다음 쪽">
                ▶
              </button>
              <button type="button" onClick={() => setZoom(!zoom)} className="btn btn-line !min-h-9 !px-2.5 !py-0.5 text-xs" aria-pressed={zoom}>
                크게 보기
              </button>
            </div>
          </div>
          {page === 0 && (out.previewAdjusted || out.previewOverlapRisk) && (
            <p className={`mb-2 border-l-[3px] px-3 py-1.5 text-[12px] ${out.previewAdjusted ? "border-l-ok bg-ok-soft text-ok" : "border-l-warn bg-warn-soft text-warn"}`}>
              {out.previewAdjusted
                ? "첫 쪽 오른쪽 단은 한글처럼 머리 표 아래에서 시작하도록 맞춰 그렸습니다(내려받는 파일은 그대로)."
                : "미리보기 엔진은 첫 쪽 오른쪽 단 첫 줄을 머리 표와 겹쳐 그릴 수 있습니다. 한글에서는 머리 표 아래에서 시작합니다."}
            </p>
          )}
          <div className={`sheet border border-line-strong bg-canvas p-3 sm:p-5 ${zoom ? "overflow-auto" : ""}`}>
            <div className={`shadow-[0_2px_10px_rgba(43,31,34,0.18)] ${zoom ? "w-[200%]" : ""}`}>{url && <img src={url} alt={`원안지 ${page + 1}쪽 미리보기`} />}</div>
          </div>
          <div className="mt-2 space-y-1 text-[11.5px] leading-relaxed text-ink-3">
            <p>미리보기는 브라우저용 한글 엔진(rhwp)으로 그린 것이라 글꼴 폭·표 높이가 한글과 조금 다를 수 있습니다.</p>
            {out.previewNoNumber.length > 0 && <p className="text-warn">{out.previewNoNumber.join(", ")}번은 문항 머리에 어울림 그림·표가 있어 미리보기에서 번호가 안 보일 수 있습니다. 한글 파일에는 번호가 들어가 있습니다.</p>}
          </div>
        </section>

        <section aria-label="편집 검수" className="min-w-0 space-y-4">
          <div className="border-b-2 border-ink pb-2">
            <span className="kicker">편집 검수</span>
            <h3 className="serif text-[19px] font-bold">자동으로 고치지 않은 것</h3>
            <p className="text-[12px] text-ink-3">번호를 누르면 그 문항이 있는 쪽을 보여 주고, ‘3단계’를 누르면 문항 줄로 갑니다. 같은 내용은 한 묶음으로 보여 줍니다.</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1 text-[12px] font-bold" role="group" aria-label="심각도로 거르기">
              {(
                [
                  ["all", `전체 ${out.issues.length}`],
                  ["error", `${SEV_LABEL.error} ${count.error}`],
                  ["warn", `${SEV_LABEL.warn} ${count.warn}`],
                  ["info", `${SEV_LABEL.info} ${count.info}`],
                ] as [Sev, string][]
              ).map(([k, l]) => (
                <Chip
                  key={k}
                  on={sev === k}
                  onClick={() => {
                    setSev(k);
                    setRule(null);
                  }}
                >
                  {l}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 text-[11.5px]" role="group" aria-label="규칙으로 거르기">
              {rules.map(([r, n]) => (
                <Chip key={r} small on={rule === r} onClick={() => setRule(rule === r ? null : r)}>
                  {r} {n}
                </Chip>
              ))}
            </div>
          </div>
          {groups.length === 0 && <p className="text-sm text-ok">해당하는 검수 항목이 없습니다.</p>}
          <ul className="space-y-2 lg:max-h-[70vh] lg:overflow-auto lg:pr-1">
            {groups.map((g, k) => (
              <IssueCard key={k} g={g} label={qLabel} hasPage={(id) => out.pageOf.has(id)} onPage={goPage} onFocus={onFocusQuestion} onFixAll={onFixAll} />
            ))}
          </ul>

          <div className="border border-line bg-paper px-3 py-2 text-sm">
            <h4 className="font-bold text-ink">한글에서 확인할 것</h4>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[12.5px] text-ink-2">
              {checks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ol>
          </div>

          <div className="border border-line bg-surface-2 px-3 py-2 text-sm">
            <button type="button" onClick={() => setShowChanges(!showChanges)} className="font-bold text-ink" aria-expanded={showChanges}>
              형식만 고친 것 {out.changes.length}건 {showChanges ? "▲" : "▼"}
            </button>
            <p className="text-[11.5px] text-ink-2">모든 문항에 글꼴·크기·줄간격 통일. 종류를 누르면 문항별 내용을 봅니다.</p>
            {showChanges && (
              <ul className="mt-2 space-y-1 text-xs text-ink-2">
                {byKind.map(([kind, list]) => (
                  <li key={kind} className="border-b border-line/60 pb-1 last:border-0">
                    <button
                      type="button"
                      className="font-bold text-ink"
                      aria-expanded={openKinds.has(kind)}
                      onClick={() =>
                        setOpenKinds((s) => {
                          const n = new Set(s);
                          if (n.has(kind)) n.delete(kind);
                          else n.add(kind);
                          return n;
                        })
                      }
                    >
                      {kind} {list.length}건 {openKinds.has(kind) ? "▲" : "▼"}
                    </button>
                    {openKinds.has(kind) && (
                      <ul className="mt-0.5 space-y-0.5 pl-3">
                        {list.map((c, j) => (
                          <li key={j}>
                            <span className="text-ink-3">{qLabel(c.questionId) || "전체"}</span> {c.detail}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {out.loss.count > 0 && (
            <details className="border border-warn/40 bg-warn-soft px-3 py-2 text-[12px] text-warn">
              <summary className="cursor-pointer font-bold">변환 손실 보고 {out.loss.count}건</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {out.loss.items.map((it, i) => (
                  <li key={i} className="break-all">
                    {it}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>

      <details className="border border-line bg-paper px-4 py-3">
        <summary className="cursor-pointer font-bold text-ink">최종 확인표 — 결과 번호·출처·정답·배점{excluded.length ? `, 뺀 문항 ${excluded.length}개` : ""}</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[12.5px]">
            <thead className="text-[11px] text-ink-3">
              <tr className="border-b border-ink">
                <th className="px-2 py-1 text-right">결과</th>
                <th className="px-2 py-1 text-left">파일</th>
                <th className="px-2 py-1 text-right">원래</th>
                <th className="px-2 py-1">정답</th>
                <th className="px-2 py-1 text-right">배점</th>
                <th className="px-2 py-1 text-right">쪽</th>
              </tr>
            </thead>
            <tbody>
              {order.map((q) => {
                const sc = scoreOf(q, spec);
                const pg = out.pageOf.get(q.id);
                return (
                  <tr key={q.id} className="border-b border-line/60">
                    <td className="serif px-2 py-1 text-right font-bold">{qLabel(q.id)}</td>
                    <td className="max-w-[14rem] truncate px-2 py-1 text-ink-2">{q.fileName}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-ink-3">{q.srcNumber ?? "?"}</td>
                    <td className={`px-2 py-1 text-center ${q.kind === "mcq" && !q.answers.length ? "text-danger" : ""}`}>
                      {q.kind === "essay" ? "—" : q.answers.length ? q.answers.map((a) => CIRCLED[a - 1]).join("") + (q.answerOverride ? " (지정)" : "") : "없음"}
                    </td>
                    <td className={`px-2 py-1 text-right tabular-nums ${sc == null ? "text-danger" : ""}`}>{sc == null ? "없음" : sc + (q.scoreOverride != null ? " (지정)" : "")}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{pg == null ? "" : pg + 1}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {excluded.length > 0 && (
            <p className="mt-2 text-[12px] text-ink-2">
              <b className="text-ink">뺀 문항:</b> {excluded.map((q) => `「${q.fileName}」 원래 ${q.srcNumber ?? "?"}번`).join(", ")}
            </p>
          )}
        </div>
      </details>
    </div>
  );
}

function Chip({ on, small, onClick, children }: { on: boolean; small?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`border ${small ? "px-1.5 py-0.5" : "min-h-8 px-2 py-1"} ${on ? "border-primary bg-primary text-white" : "border-line-strong text-ink-2 hover:border-primary hover:text-primary"}`}
    >
      {children}
    </button>
  );
}

function IssueCard({
  g,
  label,
  hasPage,
  onPage,
  onFocus,
  onFixAll,
}: {
  g: IssueGroup;
  label: (id: string) => string;
  hasPage: (id: string) => boolean;
  onPage: (id: string) => void;
  onFocus: (id: string) => void;
  onFixAll: (ids: string[], fix: SymbolFix[]) => void;
}) {
  return (
    <li className={`border border-line border-l-[3px] bg-paper px-3 py-2 text-sm ${SEV_TONE[g.severity].rule}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`border px-1.5 text-[11px] font-bold ${SEV_TONE[g.severity].tone}`}>{SEV_LABEL[g.severity]}</span>
        <span className="font-bold">{g.rule}</span>
        {g.ids.length > 1 && <span className="text-[11.5px] text-ink-3">{g.ids.length}문항</span>}
      </div>
      {g.ids.length > 0 && (
        <p className="mt-1 flex flex-wrap items-center gap-1">
          {g.ids.map((id) => (
            <span key={id} className="inline-flex items-center border border-line">
              <button type="button" disabled={!hasPage(id)} onClick={() => onPage(id)} className="serif px-1.5 py-0.5 text-xs font-bold text-primary hover:bg-primary-soft" title="미리보기에서 그 쪽 보기">
                {label(id)}
              </button>
              <button type="button" onClick={() => onFocus(id)} className="border-l border-line px-1 py-0.5 text-[11px] text-ink-3 hover:bg-primary-soft hover:text-primary" title="3단계 문항 줄로 가기">
                3단계
              </button>
            </span>
          ))}
        </p>
      )}
      <p className="mt-1 text-ink-2">{g.message}</p>
      {g.fix && g.ids.length > 0 && (
        <button type="button" onClick={() => onFixAll(g.ids, g.fix!)} className="btn btn-line mt-1 !min-h-0 !px-2 !py-0.5 text-[11.5px]">
          {g.ids.length > 1 ? `${g.ids.length}문항 모두 ` : ""}양식 기호로 바꾸기({g.fix.map((f) => `${f.from}→${f.to}`).join(", ")})
        </button>
      )}
      <p className="mt-0.5 text-[11px] text-ink-3">근거: {g.source}</p>
    </li>
  );
}
