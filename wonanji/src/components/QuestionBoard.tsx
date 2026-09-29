import { useState } from "react";
import type { Issue, Question } from "../engine/types";

interface Props {
  order: Question[];
  excluded: Set<string>;
  /** 화면에서 지정한 정답(문항 ID → 번호들) */
  answers: Map<string, number[]>;
  issues: Issue[];
  onMove: (id: string, dir: -1 | 1) => void;
  onToggle: (id: string) => void;
  onAnswer: (id: string, a: number[] | null) => void;
  onReset: () => void;
}

const CIRCLED = "①②③④⑤";
const SEV: Record<Issue["severity"], { label: string; tone: string }> = {
  error: { label: "확인", tone: "border-danger/50 bg-danger-soft text-danger" },
  warn: { label: "검토", tone: "border-warn/50 bg-warn-soft text-warn" },
  info: { label: "참고", tone: "border-line bg-surface-2 text-ink-2" },
};

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** 문항 줄 안에서는 "원래 3번: " 같은 머리말이 겹치므로 뗍니다. */
function bare(msg: string) {
  return msg.replace(/^[^:：]{1,24}[:：]\s*/, "");
}

export default function QuestionBoard({ order, excluded, answers, issues, onMove, onToggle, onAnswer, onReset }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const answerOf = (q: Question) => answers.get(q.id) ?? q.answers;
  const active = order.filter((q) => !excluded.has(q.id));
  const mcqs = active.filter((q) => q.kind === "mcq");
  const essays = active.filter((q) => q.kind === "essay");
  const total = active.reduce((a, q) => a + (q.score ?? 0), 0);
  const dist = [1, 2, 3, 4, 5].map((k) => mcqs.filter((q) => answerOf(q).length === 1 && answerOf(q)[0] === k).length);
  const maxD = Math.max(1, ...dist);
  const noAnswer = mcqs.filter((q) => !answerOf(q).length).length;

  // 문항별 검수: 확인·검토 항목과, 참고라도 기호 불일치는 화면에 띄웁니다(원문은 바꾸지 않음).
  const perQ = new Map<string, Issue[]>();
  for (const i of issues) {
    if (!i.questionId) continue;
    if (i.severity === "info" && i.rule !== "기호 불일치") continue;
    perQ.set(i.questionId, [...(perQ.get(i.questionId) ?? []), i]);
  }
  const symbolN = issues.filter((i) => i.rule === "기호 불일치").length;

  const finalNo = new Map<string, number>();
  mcqs.forEach((q, i) => finalNo.set(q.id, i + 1));
  essays.forEach((q, i) => finalNo.set(q.id, i + 1));

  const dupNums = new Set<number>();
  const seen = new Set<number>();
  for (const q of mcqs) {
    if (q.srcNumber == null) continue;
    if (seen.has(q.srcNumber)) dupNums.add(q.srcNumber);
    seen.add(q.srcNumber);
  }

  const groups: { title: string; list: Question[] }[] = [
    { title: "선택형", list: order.filter((q) => q.kind === "mcq") },
    { title: "논술형", list: order.filter((q) => q.kind === "essay") },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <dl className="grid grid-cols-2 border-l border-t border-line sm:grid-cols-4">
          <Stat k="선택형" v={`${mcqs.length}문항`} />
          <Stat k="논술형" v={`${essays.length}문항`} />
          <Stat k="배점 합계" v={`${fmt(total)}점`} tone={Math.abs(total - 100) > 0.01 ? "warn" : undefined} sub={Math.abs(total - 100) > 0.01 ? "100점이 아닙니다" : undefined} />
          <Stat k="정답 미지정" v={`${noAnswer}문항`} tone={noAnswer ? "danger" : undefined} sub={symbolN ? `기호 불일치 ${symbolN}문항` : undefined} />
        </dl>
        <figure className="border border-line bg-paper px-4 py-2">
          <figcaption className="text-[11px] font-bold text-ink-3">정답 분포</figcaption>
          <div className="mt-1 flex items-end gap-3" role="img" aria-label={`정답 분포 ${dist.map((d, i) => `${CIRCLED[i]} ${d}`).join(", ")}`}>
            {dist.map((d, i) => (
              <div key={i} className="flex w-6 flex-col items-center gap-0.5">
                <span className="text-[11px] tabular-nums text-ink-2">{d}</span>
                <div className={`w-3.5 ${d === maxD && d > 0 ? "bg-primary" : "bg-ink/70"}`} style={{ height: `${3 + (d / maxD) * 30}px` }} />
                <span className="serif text-[13px]">{CIRCLED[i]}</span>
              </div>
            ))}
          </div>
        </figure>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-l-[3px] border-l-primary bg-primary-soft/40 px-3 py-1.5">
        <p className="text-[12.5px] text-ink-2">
          원래 번호순으로 모았습니다. 화살표로 순서를 바꾸고, 뺄 문항은 체크를 푸세요. 정답 표시가 없거나 틀린 문항은 <b className="text-ink">정답</b> 칸에서 고르면 결과에 음영으로 표시합니다.
        </p>
        <button type="button" onClick={onReset} className="btn btn-line !min-h-0 shrink-0 !px-2 !py-1 text-xs">
          번호순으로 되돌리기
        </button>
      </div>

      {groups
        .filter((g) => g.list.length)
        .map((g) => (
          <div key={g.title} className="overflow-x-auto border border-line bg-paper">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="border-b-2 border-ink px-3 py-1.5 text-left">
                <span className="serif text-[15px] font-bold">{g.title}</span>
                <span className="ml-2 text-xs text-ink-3">{g.list.filter((q) => !excluded.has(q.id)).length}문항</span>
              </caption>
              <thead className="text-[11px] text-ink-3">
                <tr className="border-b border-line">
                  <th className="w-10 px-2 py-1.5 font-bold">포함</th>
                  <th className="w-12 px-2 py-1.5 text-right font-bold">결과</th>
                  <th className="w-12 px-2 py-1.5 text-right font-bold">원래</th>
                  <th className="px-2 py-1.5 text-left font-bold">발문 · 검수</th>
                  <th className="w-14 px-2 py-1.5 text-right font-bold">배점</th>
                  <th className="w-24 px-2 py-1.5 font-bold">정답</th>
                  <th className="w-28 px-2 py-1.5 text-left font-bold">파일</th>
                  <th className="w-16 px-2 py-1.5 font-bold">순서</th>
                </tr>
              </thead>
              <tbody>
                {g.list.map((q) => {
                  const off = excluded.has(q.id);
                  const dup = q.kind === "mcq" && q.srcNumber != null && dupNums.has(q.srcNumber) && !off;
                  const list = off ? [] : perQ.get(q.id) ?? [];
                  const open = openId === q.id;
                  const sym = list.find((i) => i.rule === "기호 불일치");
                  const detected = q.answers;
                  const chosen = answers.get(q.id);
                  return (
                    <tr key={q.id} className={`border-b border-line/70 align-top last:border-0 ${off ? "opacity-40" : ""} ${dup ? "bg-danger-soft/70" : ""}`}>
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" checked={!off} onChange={() => onToggle(q.id)} aria-label={`원래 ${q.srcNumber ?? "?"}번 포함`} className="accent-primary" />
                      </td>
                      <td className="serif px-2 py-2 text-right text-[15px] font-bold tabular-nums">{off ? "—" : finalNo.get(q.id)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${dup ? "font-bold text-danger" : "text-ink-3"}`}>{q.srcNumber ?? "?"}</td>
                      <td className="max-w-0 px-2 py-2">
                        <p className="truncate text-ink" title={q.summary}>
                          {q.summary}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-3">
                          {[q.objects.pic && `그림 ${q.objects.pic}`, q.objects.tbl && `표·상자 ${q.objects.tbl}`, q.objects.equation && `수식 ${q.objects.equation}`].filter(Boolean).join(" · ")}
                          {list.length > 0 && (
                            <button type="button" onClick={() => setOpenId(open ? null : q.id)} className="font-bold text-warn underline-offset-2 hover:underline" aria-expanded={open}>
                              검수 {list.length}건 {open ? "▲" : "▼"}
                            </button>
                          )}
                        </p>
                        {sym && !open && (
                          <p className="mt-1 border-l-2 border-warn bg-warn-soft px-2 py-0.5 text-[11.5px] text-warn">
                            <b>기호 불일치</b> · {bare(sym.message)}
                          </p>
                        )}
                        {open && (
                          <ul className="mt-1.5 space-y-1">
                            {list.map((i, k) => (
                              <li key={k} className="flex items-start gap-1.5 text-[11.5px] leading-snug">
                                <span className={`shrink-0 border px-1 text-[10.5px] font-bold ${SEV[i.severity].tone}`}>{SEV[i.severity].label}</span>
                                <span>
                                  <b className="text-ink">{i.rule}</b> <span className="text-ink-2">{bare(i.message)}</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{q.score != null ? fmt(q.score) : <span className="text-danger">없음</span>}</td>
                      <td className="px-2 py-2 text-center">
                        {q.kind === "essay" ? (
                          <span className="text-ink-3">—</span>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <select
                              value={chosen && chosen.length === 1 ? String(chosen[0]) : ""}
                              onChange={(e) => onAnswer(q.id, e.target.value ? [Number(e.target.value)] : null)}
                              aria-label={`원래 ${q.srcNumber ?? "?"}번 정답`}
                              className={`field !min-h-0 !w-auto !px-1 !py-0.5 text-center text-[13px] ${!detected.length && !chosen ? "!border-danger" : ""} ${chosen ? "!bg-answer" : ""}`}
                            >
                              <option value="">{detected.length ? `표시 ${detected.map((a) => CIRCLED[a - 1]).join("")}` : "없음"}</option>
                              {[1, 2, 3, 4, 5].map((k) => (
                                <option key={k} value={k}>
                                  {CIRCLED[k - 1]}
                                </option>
                              ))}
                            </select>
                            <span className="text-[10.5px] text-ink-3">{chosen ? "직접 지정" : detected.length ? "형광펜" : ""}</span>
                          </div>
                        )}
                      </td>
                      <td className="max-w-0 truncate px-2 py-2 text-xs text-ink-2" title={q.fileName}>
                        {q.fileName}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-center">
                        <button type="button" onClick={() => onMove(q.id, -1)} className="px-1.5 text-ink-2 hover:bg-primary-soft hover:text-primary" aria-label="위로">
                          ↑
                        </button>
                        <button type="button" onClick={() => onMove(q.id, 1)} className="px-1.5 text-ink-2 hover:bg-primary-soft hover:text-primary" aria-label="아래로">
                          ↓
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}

function Stat({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: "warn" | "danger" }) {
  const bg = tone === "warn" ? "bg-warn-soft" : tone === "danger" ? "bg-danger-soft" : "bg-paper";
  const fg = tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-ink";
  return (
    <div className={`border-b border-r border-line px-3 py-2 ${bg}`}>
      <dt className="text-[11px] font-bold text-ink-3">{k}</dt>
      <dd className={`serif text-[20px] font-bold leading-tight tabular-nums ${fg}`}>{v}</dd>
      {sub && <dd className={`text-[11.5px] ${fg}`}>{sub}</dd>}
    </div>
  );
}
