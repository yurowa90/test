import { useState } from "react";
import type { TemplateAnalysis, Zone } from "../engine/types";

const ZONE_LABEL: Record<Zone, { label: string; fate: string; tone: string }> = {
  head: { label: "머리(결재·출제 정보 표)", fate: "유지", tone: "bg-ok-soft text-ok" },
  notice: { label: "유의사항", fate: "삭제", tone: "bg-danger-soft text-danger" },
  gap: { label: "빈 줄·작성 안내", fate: "삭제", tone: "bg-paper-deep text-ink-faint" },
  sample: { label: "예시 선택형 문항", fate: "삭제", tone: "bg-danger-soft text-danger" },
  essayIntro: { label: "논술형 안내 문구", fate: "유지", tone: "bg-ok-soft text-ok" },
  essaySample: { label: "예시 논술형 문항", fate: "삭제", tone: "bg-danger-soft text-danger" },
  tail: { label: "꼬리(확인 사항·쪽 표시)", fate: "유지", tone: "bg-ok-soft text-ok" },
};

const RULE_LABEL: Record<string, string> = {
  font: "글씨체",
  size: "글자 크기",
  numberSize: "문항 번호",
  lineSpacing: "줄간격",
  negation: "부정어",
  score: "배점",
  paper: "용지",
  choiceTab: "선지 배열",
};

export default function TemplateCard({ tpl }: { tpl: TemplateAnalysis }) {
  const [open, setOpen] = useState(false);
  const s = tpl.spec;
  const counts = new Map<Zone, number>();
  tpl.zones.forEach((z) => counts.set(z, (counts.get(z) ?? 0) + 1));
  const known = tpl.rules.filter((r) => r.key !== "other");

  return (
    <div className="rise-in space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <Stat k="용지" v={`${tpl.paper.name} · ${tpl.paper.columns}단`} />
        <Stat k="본문 글꼴" v={`${s.fontFace || "—"} ${s.sizePt}pt`} />
        <Stat k="줄간격" v={`${s.lineSpacing}%`} />
        <Stat k="문항 번호" v={tpl.numberSizePt ? `자동 번호 · ${tpl.numberSizePt}pt` : "자동 번호"} />
      </dl>

      {known.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-faint">양식 유의사항에서 읽은 규칙</p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {known.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-16 shrink-0 text-ink-faint">{RULE_LABEL[r.key]}</span>
                <span className="text-ink">{r.value ?? r.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tpl.conflicts.length > 0 && (
        <div className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          <p className="font-semibold">규칙과 예시가 다릅니다 — 어느 쪽을 따를지 확인하세요</p>
          <ul className="mt-1 list-disc pl-5">
            {tpl.conflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {tpl.notes.map((n) => (
        <p key={n} className="text-sm text-warn">
          {n}
        </p>
      ))}

      <div>
        <button type="button" onClick={() => setOpen(!open)} className="text-xs font-semibold tracking-wide text-ink-faint hover:text-ink">
          양식 구역 {open ? "접기 ▲" : "펼치기 ▼"}
        </button>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(Object.keys(ZONE_LABEL) as Zone[])
            .filter((z) => counts.get(z))
            .map((z) => (
              <span key={z} className={`rounded px-2 py-0.5 text-xs ${ZONE_LABEL[z].tone}`}>
                {ZONE_LABEL[z].label} {counts.get(z)} · {ZONE_LABEL[z].fate}
              </span>
            ))}
        </div>
        {open && (
          <ol className="mt-2 max-h-72 overflow-auto rounded border border-paper-line bg-white text-xs">
            {tpl.paraPreview.map((t, i) => (
              <li key={i} className="flex gap-2 border-b border-paper-line/60 px-2 py-1 last:border-0">
                <span className="w-6 shrink-0 text-right text-ink-faint">{i}</span>
                <span className={`w-20 shrink-0 rounded px-1 text-center ${ZONE_LABEL[tpl.zones[i]].tone}`}>{ZONE_LABEL[tpl.zones[i]].fate}</span>
                <span className="truncate text-ink-soft">{t.replace(/\s+/g, " ") || "(빈 줄)"}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-paper-deep/70 px-3 py-2">
      <dt className="text-xs text-ink-faint">{k}</dt>
      <dd className="font-semibold text-ink">{v}</dd>
    </div>
  );
}
