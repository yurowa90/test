/**
 * 표식 팔레트.
 * 이 앱의 시그니처는 〈보기〉 명제마다 붙는 성취수준(판별점) 표식과 행동 영역 표식이다.
 * 교사가 ㄱㄴㄷ를 고르는 순간, 그 조합의 발문·선택지 배열·정답·난이도가 눈앞에서 바뀐다.
 */
import type { BehaviorDomain, LevelLabel } from "../types";

export const LEVEL_CHIP: Record<LevelLabel, string> = {
  A: "bg-rose-100 text-rose-800 ring-rose-300",
  B: "bg-amber-100 text-amber-900 ring-amber-300",
  C: "bg-teal-100 text-teal-800 ring-teal-300",
  D: "bg-indigo-100 text-indigo-800 ring-indigo-300",
  E: "bg-slate-100 text-slate-700 ring-slate-300",
};

export const LEVEL_HINT: Record<LevelLabel, string> = {
  A: "최상위 수준만 옳게 판단 가능",
  B: "중상 수준에서 판단 가능",
  C: "중간 수준에서 판단 가능",
  D: "중하 수준에서 판단 가능",
  E: "최하위 수준도 판단 가능",
};

export const BEHAVIOR_SHORT: Record<BehaviorDomain, string> = {
  이해: "이해",
  적용: "적용",
  "문제 인식 및 가설 설정": "문제·가설",
  "탐구 설계 및 수행": "탐구 설계",
  "자료 분석 및 해석": "자료 해석",
  "결론 도출 및 평가": "결론·평가",
};

export const BEHAVIOR_CHIP: Record<BehaviorDomain, string> = {
  이해: "bg-sky-50 text-sky-800 ring-sky-200",
  적용: "bg-violet-50 text-violet-800 ring-violet-200",
  "문제 인식 및 가설 설정": "bg-lime-50 text-lime-800 ring-lime-200",
  "탐구 설계 및 수행": "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "자료 분석 및 해석": "bg-orange-50 text-orange-800 ring-orange-200",
  "결론 도출 및 평가": "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200",
};

export const TRUTH_CHIP = {
  true: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  false: "bg-rose-50 text-rose-700 ring-rose-200",
} as const;

export const TIER_CHIP: Record<string, string> = {
  "A+": "bg-rose-600 text-white",
  A: "bg-rose-500 text-white",
  "B+": "bg-amber-500 text-white",
  B: "bg-amber-400 text-ink",
  "C+": "bg-teal-500 text-white",
  C: "bg-teal-400 text-white",
  D: "bg-slate-400 text-white",
};
