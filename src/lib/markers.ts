/**
 * 정렬(alignment) 마커 팔레트.
 * 각 영속적 이해에 하나의 색 토큰(U1, U2, …)을 부여하고,
 * 그 이해를 평가하는 루브릭 준거에 같은 토큰을 다시 표시해
 * "이해 → 평가"의 정렬을 눈으로 보이게 한다. 이것이 이 앱의 시그니처다.
 */
export interface Marker {
  label: string;
  /** 배경 + 글자 + 테두리 Tailwind 클래스 */
  chip: string;
  /** 얇은 좌측 강조선 색 (border-l 용) */
  edge: string;
  /** 배경 은은한 색 (카드 표면) */
  surface: string;
}

const PALETTE: Omit<Marker, "label">[] = [
  {
    chip: "bg-indigo-100 text-indigo-800 ring-indigo-300",
    edge: "border-indigo-400",
    surface: "bg-indigo-50/60",
  },
  {
    chip: "bg-teal-100 text-teal-800 ring-teal-300",
    edge: "border-teal-400",
    surface: "bg-teal-50/60",
  },
  {
    chip: "bg-amber-100 text-amber-900 ring-amber-300",
    edge: "border-amber-400",
    surface: "bg-amber-50/60",
  },
  {
    chip: "bg-rose-100 text-rose-800 ring-rose-300",
    edge: "border-rose-400",
    surface: "bg-rose-50/60",
  },
  {
    chip: "bg-violet-100 text-violet-800 ring-violet-300",
    edge: "border-violet-400",
    surface: "bg-violet-50/60",
  },
];

export function markerFor(index: number): Marker {
  const base = PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
  return { label: `U${index + 1}`, ...base };
}
