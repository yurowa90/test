import type { Poem } from "../types";

interface Props {
  poem: Poem;
  dateText: string;
  formLabel: string;
}

/**
 * 화면·시스템 인쇄 공용 영수증.
 * 내부 치수는 전부 em — 감싸는 쪽의 font-size(화면 13px, 인쇄 8.5/10.5pt)로
 * 같은 마크업이 용지 폭에 맞게 늘고 준다.
 */
export default function Receipt({ poem, dateText, formLabel }: Props) {
  return (
    <div className="receipt-sheet bg-receipt px-[1.4em] pt-[1.9em] pb-[1.7em] font-receipt text-ink shadow-[0_14px_36px_rgba(0,0,0,0.5)]">
      <p className="m-0 text-center text-[0.85em] leading-[1.4] font-bold tracking-[0.35em]">
        POETRY
        <br />
        CAMERA
      </p>
      <p className="m-0 mt-[0.7em] text-center text-[0.8em] tracking-[0.6em]">
        ***
      </p>

      <h2 className="m-0 mt-[1.7em] text-center text-[1.35em] leading-snug font-bold">
        {poem.title}
      </h2>

      <div className="mt-[1.3em] text-center leading-[1.75]">
        {poem.lines.map((line, i) =>
          line === "" ? (
            <div key={i} className="h-[0.9em]" aria-hidden />
          ) : (
            <p key={i} className="m-0">
              {line}
            </p>
          ),
        )}
      </div>

      <div className="mt-[1.7em] border-t-2 border-dashed border-ink/60" />
      <p className="m-0 mt-[1.1em] text-center text-[0.76em] text-ink-soft">
        {formLabel} · {dateText}
      </p>
      <p className="m-0 mt-[0.35em] text-center text-[0.76em] text-ink-soft">
        이 시는 사진을 본 AI가 지었습니다
      </p>
    </div>
  );
}

const TEETH = 24;
const TEAR_W = 288;
const TEAR_H = 8;
const tearPath = (() => {
  const step = TEAR_W / TEETH;
  let d = "M0 0";
  for (let i = 0; i < TEETH; i++) {
    d += ` L${(i * step + step / 2).toFixed(1)} ${TEAR_H - 1} L${((i + 1) * step).toFixed(1)} 0`;
  }
  return d + " Z";
})();

/** 찢은 감열지 아랫단 — 화면 전용 */
export function TearEdge() {
  return (
    <svg
      viewBox={`0 0 ${TEAR_W} ${TEAR_H}`}
      preserveAspectRatio="none"
      className="block h-2 w-full"
      aria-hidden
    >
      <path d={tearPath} fill="var(--color-receipt)" />
    </svg>
  );
}
