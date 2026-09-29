import type { Issue, Question } from "../engine/types";

interface Props {
  order: Question[];
  excluded: Set<string>;
  issues: Issue[];
  onMove: (id: string, dir: -1 | 1) => void;
  onToggle: (id: string) => void;
  onReset: () => void;
}

const CIRCLED = "①②③④⑤";

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function QuestionBoard({ order, excluded, issues, onMove, onToggle, onReset }: Props) {
  const active = order.filter((q) => !excluded.has(q.id));
  const mcqs = active.filter((q) => q.kind === "mcq");
  const essays = active.filter((q) => q.kind === "essay");
  const total = active.reduce((a, q) => a + (q.score ?? 0), 0);
  const dist = [1, 2, 3, 4, 5].map((k) => mcqs.filter((q) => q.answers.length === 1 && q.answers[0] === k).length);
  const maxD = Math.max(1, ...dist);
  const issueCount = new Map<string, number>();
  for (const i of issues) if (i.questionId && i.severity !== "info") issueCount.set(i.questionId, (issueCount.get(i.questionId) ?? 0) + 1);

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
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <Box k="선택형" v={`${mcqs.length}문항`} />
          <Box k="논술형" v={`${essays.length}문항`} />
          <Box k="배점 합계" v={`${fmt(total)}점`} warn={Math.abs(total - 100) > 0.01} />
        </dl>
        <div className="rounded-md bg-paper-deep/70 px-3 py-2">
          <p className="text-xs text-ink-faint">정답 분포</p>
          <div className="mt-1 flex items-end gap-2" aria-label="정답 분포">
            {dist.map((d, i) => (
              <div key={i} className="flex w-7 flex-col items-center gap-0.5">
                <span className="text-[11px] tabular-nums text-ink-soft">{d}</span>
                <div className="w-4 rounded-sm bg-blueprint-line" style={{ height: `${4 + (d / maxD) * 28}px` }} />
                <span className="text-xs">{CIRCLED[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-faint">원래 번호순으로 모았습니다. 화살표로 순서를 바꾸고, 뺄 문항은 체크를 푸세요. 결과 번호는 1번부터 이어 매깁니다.</p>
        <button type="button" onClick={onReset} className="shrink-0 rounded px-2 py-1 text-xs text-ink-soft hover:bg-paper-deep">
          번호순으로 되돌리기
        </button>
      </div>

      {groups
        .filter((g) => g.list.length)
        .map((g) => (
          <div key={g.title} className="overflow-x-auto rounded-lg border border-paper-line bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="bg-paper-deep/60 px-3 py-1.5 text-left text-xs font-semibold text-ink-soft">{g.title}</caption>
              <thead className="text-xs text-ink-faint">
                <tr className="border-b border-paper-line">
                  <th className="w-10 px-2 py-1.5">포함</th>
                  <th className="w-12 px-2 py-1.5 text-right">결과</th>
                  <th className="w-12 px-2 py-1.5 text-right">원래</th>
                  <th className="px-2 py-1.5 text-left">발문</th>
                  <th className="w-14 px-2 py-1.5 text-right">배점</th>
                  <th className="w-12 px-2 py-1.5">정답</th>
                  <th className="w-28 px-2 py-1.5 text-left">파일</th>
                  <th className="w-16 px-2 py-1.5">순서</th>
                </tr>
              </thead>
              <tbody>
                {g.list.map((q) => {
                  const off = excluded.has(q.id);
                  const dup = q.kind === "mcq" && q.srcNumber != null && dupNums.has(q.srcNumber) && !off;
                  const n = issueCount.get(q.id);
                  return (
                    <tr key={q.id} className={`border-b border-paper-line/60 last:border-0 ${off ? "opacity-40" : ""} ${dup ? "bg-danger-soft/60" : ""}`}>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={!off} onChange={() => onToggle(q.id)} aria-label={`${q.srcNumber}번 포함`} />
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{off ? "—" : finalNo.get(q.id)}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${dup ? "font-semibold text-danger" : "text-ink-faint"}`}>{q.srcNumber ?? "?"}</td>
                      <td className="max-w-0 px-2 py-1.5">
                        <p className="truncate text-ink">{q.summary}</p>
                        <p className="text-[11px] text-ink-faint">
                          {[q.objects.pic && `그림 ${q.objects.pic}`, q.objects.tbl && `표·상자 ${q.objects.tbl}`, q.objects.equation && `수식 ${q.objects.equation}`].filter(Boolean).join(" · ")}
                          {n ? <span className="ml-2 text-warn">검수 {n}건</span> : null}
                        </p>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{q.score != null ? fmt(q.score) : <span className="text-danger">없음</span>}</td>
                      <td className="px-2 py-1.5 text-center">
                        {q.kind === "essay" ? (
                          <span className="text-ink-faint">—</span>
                        ) : q.answers.length ? (
                          <span className="rounded bg-answer px-1">{q.answers.map((a) => CIRCLED[a - 1]).join("")}</span>
                        ) : (
                          <span className="text-danger">없음</span>
                        )}
                      </td>
                      <td className="max-w-0 truncate px-2 py-1.5 text-xs text-ink-soft" title={q.fileName}>
                        {q.fileName}
                      </td>
                      <td className="px-2 py-1.5 text-center whitespace-nowrap">
                        <button type="button" onClick={() => onMove(q.id, -1)} className="rounded px-1.5 hover:bg-paper-deep" aria-label="위로">
                          ↑
                        </button>
                        <button type="button" onClick={() => onMove(q.id, 1)} className="rounded px-1.5 hover:bg-paper-deep" aria-label="아래로">
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

function Box({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className={`rounded-md px-3 py-2 ${warn ? "bg-warn-soft" : "bg-paper-deep/70"}`}>
      <dt className="text-xs text-ink-faint">{k}</dt>
      <dd className={`font-semibold ${warn ? "text-warn" : "text-ink"}`}>{v}</dd>
    </div>
  );
}
