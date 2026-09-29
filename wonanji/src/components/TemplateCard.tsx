import { useState } from "react";
import type { TemplateAnalysis, Zone } from "../engine/types";

const ZONE_LABEL: Record<Zone, { label: string; fate: string; keep: boolean }> = {
  head: { label: "머리(결재·출제 정보 표)", fate: "유지", keep: true },
  headQ: { label: "쪽 모양(제목·머리말) + 1번 예시", fate: "쪽 모양만 유지", keep: true },
  notice: { label: "유의사항", fate: "삭제", keep: false },
  gap: { label: "빈 줄·작성 안내", fate: "삭제", keep: false },
  sample: { label: "예시 선택형 문항", fate: "삭제", keep: false },
  essayIntro: { label: "논술형 안내 문구", fate: "유지", keep: true },
  essaySample: { label: "예시 논술형 문항", fate: "삭제", keep: false },
  tail: { label: "꼬리(확인 사항·쪽 표시)", fate: "유지", keep: true },
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

const pct = (r: number) => `${Math.round(r * 100)}%`;

export default function TemplateCard({ tpl }: { tpl: TemplateAnalysis }) {
  const [open, setOpen] = useState(false);
  const s = tpl.spec;
  const L = tpl.layout;
  const counts = new Map<Zone, number>();
  tpl.zones.forEach((z) => counts.set(z, (counts.get(z) ?? 0) + 1));
  const known = tpl.rules.filter((r) => r.key !== "other");
  const perLine = Object.entries(L.choicesPerLine)
    .sort((a, b) => b[1] - a[1])
    .map(([n, c]) => `${n}개 ${c}줄`)
    .join(" · ");

  return (
    <div className="rise-in space-y-5">
      <div>
        <span className="kicker">양식에서 읽은 편집 규격</span>
        <dl className="mt-2 grid grid-cols-2 border-l border-t border-line text-sm sm:grid-cols-4">
          <Stat k="용지·단" v={`${tpl.paper.name} · ${tpl.paper.columns}단`} sub={`단 폭 ${(L.columnWidthHU / 283.46).toFixed(0)}mm`} />
          <Stat k="본문 글자" v={`${s.fontFace || "—"} ${s.sizePt}pt`} sub={`줄간격 ${s.lineSpacing}% · 자간 ${L.charSpacing}% · 장평 ${L.charRatio}%`} />
          <Stat k="문항 번호" v={s.numbering.label || "—"} sub={`${tpl.numberSizePt ? `${tpl.numberSizePt}pt · ` : ""}${s.headLead ? "번호 뒤 한 칸" : "번호 모양에 간격 포함"}`} />
          <Stat k="배점 표기" v={s.scoreDecimal ? "[4.0점] 소수점" : "[3점] 정수"} sub={s.unmarkedScore ? `표기 없는 문항 = ${s.unmarkedScore}점(학력평가 관례)` : "모든 문항 표기"} />
          <Stat k="〈보기〉 상자" v={L.box ? `단의 ${pct(L.box.ratio)}` : "예시 없음"} sub={L.box ? `${L.box.count}개 · ${L.box.align === "CENTER" ? "가운데" : "왼쪽"} 정렬` : "단 폭에 맞춤"} />
          <Stat k="자료 표" v={L.table ? `최대 단의 ${pct(L.table.maxRatio)}` : "예시 없음"} sub={L.table ? `${L.table.count}개 · 가운데 ${L.table.centered}` : "넘치면 줄임"} />
          <Stat k="그림" v={L.figure ? `최대 단의 ${pct(L.figure.maxRatio)}` : "예시 없음"} sub={L.figure ? `${L.figure.count}개 · 어울림 ${L.figure.floating}` : "넘치면 줄임"} />
          <Stat k="선지 배열" v={perLine || "예시 없음"} sub={`문항 사이 빈 줄 ${s.gapLines}`} />
        </dl>
      </div>

      {known.length > 0 && (
        <div>
          <span className="kicker">양식 유의사항에서 읽은 규칙</span>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {known.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-16 shrink-0 text-ink-3">{RULE_LABEL[r.key]}</span>
                <span className="text-ink">{r.value ?? r.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tpl.conflicts.length > 0 && (
        <div className="border border-warn/40 border-l-[3px] border-l-warn bg-warn-soft px-3 py-2 text-sm text-warn">
          <p className="font-semibold">규칙과 예시가 다릅니다 — 어느 쪽을 따를지 확인하세요</p>
          <ul className="mt-1 list-disc pl-5">
            {tpl.conflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {tpl.notes.map((n) => (
        <p key={n} className="border-l-[3px] border-l-primary bg-primary-soft/50 px-3 py-1.5 text-[13px] text-ink-2">
          {n}
        </p>
      ))}

      <div>
        <button type="button" onClick={() => setOpen(!open)} className="text-[12px] font-bold text-primary">
          양식 구역 {open ? "접기 ▲" : "펼치기 ▼"}
        </button>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(Object.keys(ZONE_LABEL) as Zone[])
            .filter((z) => counts.get(z))
            .map((z) => (
              <span key={z} className={`border px-2 py-0.5 text-xs ${ZONE_LABEL[z].keep ? "border-ok/40 bg-ok-soft text-ok" : "border-line bg-surface-2 text-ink-2"}`}>
                {ZONE_LABEL[z].label} {counts.get(z)} · {ZONE_LABEL[z].fate}
              </span>
            ))}
        </div>
        {open && (
          <ol className="mt-2 max-h-72 overflow-auto border border-line bg-paper text-xs">
            {tpl.paraPreview.map((t, i) => (
              <li key={i} className="flex gap-2 border-b border-line/60 px-2 py-1 last:border-0">
                <span className="w-6 shrink-0 text-right text-ink-3 tabular-nums">{i}</span>
                <span className={`w-24 shrink-0 text-center ${ZONE_LABEL[tpl.zones[i]].keep ? "text-ok" : "text-ink-3"}`}>{ZONE_LABEL[tpl.zones[i]].fate}</span>
                <span className="truncate text-ink-2">{t.replace(/\s+/g, " ") || "(빈 줄)"}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="border-b border-r border-line bg-[#f6f2f0]/60 px-3 py-2">
      <dt className="text-[11px] font-bold text-ink-3">{k}</dt>
      <dd className="serif text-[15px] font-semibold leading-snug text-ink">{v}</dd>
      {sub && <dd className="text-[11.5px] leading-snug text-ink-2">{sub}</dd>}
    </div>
  );
}
