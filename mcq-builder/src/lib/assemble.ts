/**
 * 합답형·정답형·부정형 문항의 결정론적 조립.
 * 근거: 경기도교육청 (2024) 『평가문항 제작 방법』 Ⅱ장 발문·선택지 작성 원리(p.24, p.46–51),
 *       sci-mcq-builder 스킬의 hapdab_check.py(발문 분기·복수 정답·정답 위치)와 difficulty.py(7등급).
 * 모델은 이 결과를 바꿀 수 없고, 교사는 UI에서 배열을 고를 수 있다.
 */
import type {
  Assembly,
  AssemblyContext,
  DifficultyEstimate,
  ItemFormat,
  LevelLabel,
  Proposition,
} from "../types";

export const BOGI_LABELS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ"];
export const CIRCLED = ["①", "②", "③", "④", "⑤"];
export const DIFFICULTY_TIERS = ["D", "C", "C+", "B", "B+", "A", "A+"];

/** 선택된 명제의 표시 기호: 합답형은 ㄱㄴㄷ, 그 외는 ①~⑤ */
export function pickLabel(format: ItemFormat, index: number): string {
  const table = format === "hapdab" ? BOGI_LABELS : CIRCLED;
  return table[index] ?? String(index + 1);
}

/** 3항 〈보기〉 표준 배열 — 항목 수가 달라 "있는 대로" 발문 */
const ARRAYS_3: string[][][] = [
  [["ㄱ"], ["ㄴ"], ["ㄱ", "ㄷ"], ["ㄴ", "ㄷ"], ["ㄱ", "ㄴ", "ㄷ"]],
  [["ㄱ"], ["ㄷ"], ["ㄱ", "ㄴ"], ["ㄴ", "ㄷ"], ["ㄱ", "ㄴ", "ㄷ"]],
  [["ㄴ"], ["ㄷ"], ["ㄱ", "ㄴ"], ["ㄱ", "ㄷ"], ["ㄱ", "ㄴ", "ㄷ"]],
  [["ㄱ"], ["ㄴ"], ["ㄷ"], ["ㄱ", "ㄴ"], ["ㄴ", "ㄷ"]],
  [["ㄱ"], ["ㄴ"], ["ㄷ"], ["ㄱ", "ㄷ"], ["ㄴ", "ㄷ"]],
  [["ㄱ"], ["ㄷ"], ["ㄱ", "ㄴ"], ["ㄱ", "ㄷ"], ["ㄴ", "ㄷ"]],
  [["ㄱ"], ["ㄴ"], ["ㄷ"], ["ㄴ", "ㄷ"], ["ㄱ", "ㄴ", "ㄷ"]],
];

/** 4항 〈보기〉 표준 배열 — 2개씩 균일하여 "고른 것은" 발문 */
const ARRAYS_4: string[][][] = [
  [["ㄱ", "ㄴ"], ["ㄱ", "ㄷ"], ["ㄴ", "ㄷ"], ["ㄴ", "ㄹ"], ["ㄷ", "ㄹ"]],
  [["ㄱ", "ㄴ"], ["ㄱ", "ㄹ"], ["ㄴ", "ㄷ"], ["ㄴ", "ㄹ"], ["ㄷ", "ㄹ"]],
  [["ㄱ", "ㄴ"], ["ㄱ", "ㄷ"], ["ㄱ", "ㄹ"], ["ㄴ", "ㄷ"], ["ㄷ", "ㄹ"]],
  [["ㄱ", "ㄷ"], ["ㄱ", "ㄹ"], ["ㄴ", "ㄷ"], ["ㄴ", "ㄹ"], ["ㄷ", "ㄹ"]],
];

function setEq(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function isSubset(a: string[], b: string[]): boolean {
  return a.every((x) => b.includes(x));
}

/** "단독 진술 → 복수 진술", 기호순 (p.51) */
function cmpSets(a: string[], b: string[]): number {
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < a.length; i++) {
    const d = BOGI_LABELS.indexOf(a[i]) - BOGI_LABELS.indexOf(b[i]);
    if (d !== 0) return d;
  }
  return 0;
}

function nonEmptySubsets(labels: string[]): string[][] {
  const out: string[][] = [];
  for (let mask = 1; mask < 1 << labels.length; mask++) {
    const s: string[] = [];
    labels.forEach((l, i) => {
      if (mask & (1 << i)) s.push(l);
    });
    out.push(s);
  }
  return out.sort(cmpSets);
}

/** 표준 배열에 정답 집합이 없을 때의 비표준 대체 배열 */
function fallbackArray(labels: string[], truth: string[]): string[][] {
  const others = nonEmptySubsets(labels).filter((s) => !setEq(s, truth));
  return [truth, ...others.slice(0, 4)].sort(cmpSets);
}

/** 직접 발문 꼬리 — 합답형은 선택지 항목 수 균일 여부로 분기 (p.32) */
export function stemTail(format: ItemFormat, uniform: boolean): string {
  if (format === "jeongdap") return "옳은 것은?";
  if (format === "bujeong") return "옳지 않은 것은?";
  return uniform
    ? "옳은 것만을 〈보기〉에서 고른 것은?"
    : "옳은 것만을 〈보기〉에서 있는 대로 고른 것은?";
}

/** 발문 전체: 앞부분 + 꼬리 + 단서 조항 */
export function composeStem(prefix: string, tail: string, conditions: string[]): string {
  const cleaned = conditions.map((c) => c.trim()).filter(Boolean);
  const head = `${prefix.trim()} ${tail}`.trim();
  return cleaned.length ? `${head} (단, ${cleaned.join(" ")})` : head;
}

const LABEL_WEIGHT: Record<LevelLabel, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 };

/** difficulty.py 이식 — 권장치이며 최종 판단은 교사 */
export function estimateDifficulty(
  picks: Proposition[],
  answerCount: number,
  ctx: AssemblyContext,
  negative: boolean,
): DifficultyEstimate {
  const base = picks.length
    ? picks.reduce((s, p) => s + (LABEL_WEIGHT[p.level] ?? 3), 0) / picks.length
    : 3;
  const answerTable: Record<number, number> = { 1: 0, 2: 0.6, 3: 0.3 };
  const answerWeight = answerTable[answerCount] ?? 0.3;
  const contextWeight =
    0.4 * ctx.dataComplexity + 0.5 * (negative ? 1 : 0) + 0.5 * (ctx.fusion ? 1 : 0);
  const score = base + answerWeight + contextWeight;
  const idx = Math.min(DIFFICULTY_TIERS.length - 1, Math.max(0, Math.round(score - 1)));
  return { tier: DIFFICULTY_TIERS[idx], score, base, answerWeight, contextWeight };
}

export function assemble(
  format: ItemFormat,
  picks: Proposition[],
  ctx: AssemblyContext,
  arrayIndex = 0,
): Assembly {
  const warnings: string[] = [];

  if (format === "hapdab") {
    const n = picks.length;
    const labels = BOGI_LABELS.slice(0, n);
    const truth = labels.filter((_, i) => picks[i].isTrue);

    if (n < 3) warnings.push("〈보기〉 항목은 3개 이상이어야 합니다.");
    if (n >= 3 && truth.length === 0)
      warnings.push("정답이 없습니다. 참 명제를 최소 1개 포함하세요.");

    const standard = n === 3 ? ARRAYS_3 : n === 4 ? ARRAYS_4 : [];
    let options = standard.filter((arr) => arr.some((c) => setEq(c, truth)));
    if (options.length === 0 && truth.length > 0 && n >= 3) {
      options = [fallbackArray(labels, truth)];
      if (n === 4)
        warnings.push(
          "4항 〈보기〉는 참 명제가 정확히 2개일 때 2개씩 균일한 표준 배열을 쓸 수 있습니다. 비표준 배열로 대체했습니다.",
        );
    }

    const idx = options.length ? Math.min(Math.max(arrayIndex, 0), options.length - 1) : 0;
    const arr = options[idx] ?? [];
    const uniform = arr.length > 0 && arr.every((c) => c.length === arr[0].length);
    const answerIndex = arr.findIndex((c) => setEq(c, truth));

    if (uniform) {
      // 균일 배열("고른 것은")에서 참 명제만으로 된 다른 선택지는 복수 정답
      arr.forEach((c, i) => {
        if (i !== answerIndex && c.length > 0 && isSubset(c, truth))
          warnings.push(
            `복수 정답 위험: ${CIRCLED[i]} ${c.join(", ")}도 참 명제만으로 구성됩니다.`,
          );
      });
    }
    if (answerIndex === 0)
      warnings.push("정답이 ①에 있습니다. 관행적 편향을 피하려면 다른 배열을 고르세요.");
    if (n >= 3 && truth.length === n)
      warnings.push(
        "모든 〈보기〉가 참이라 항목이 가장 많은 선택지가 정답입니다(지양 권장, 검토 지침 p.50).",
      );

    return {
      format,
      picks,
      uniform,
      directStem: stemTail(format, uniform),
      arrayOptions: options,
      arrayIndex: idx,
      choices: arr.map((c) => c.join(", ")),
      answerIndex,
      warnings,
      difficulty: estimateDifficulty(picks, truth.length, ctx, false),
      context: ctx,
    };
  }

  // 정답형: 참 1 + 거짓 4 / 부정형: 참 4 + 거짓 1
  const trueCount = picks.filter((p) => p.isTrue).length;
  const falseCount = picks.length - trueCount;
  if (picks.length !== 5) warnings.push("선택지는 정확히 5개여야 합니다.");
  let answerIndex = -1;
  if (format === "jeongdap") {
    if (picks.length === 5 && trueCount !== 1)
      warnings.push(`정답형은 참 명제 1개 + 거짓 명제 4개여야 합니다(현재 참 ${trueCount}개).`);
    if (trueCount === 1) answerIndex = picks.findIndex((p) => p.isTrue);
  } else {
    if (picks.length === 5 && falseCount !== 1)
      warnings.push(`부정형은 참 명제 4개 + 거짓 명제 1개여야 합니다(현재 거짓 ${falseCount}개).`);
    if (falseCount === 1) answerIndex = picks.findIndex((p) => !p.isTrue);
  }
  if (answerIndex === 0)
    warnings.push("정답이 ①에 있습니다. 관행적 편향을 피하려면 순서를 바꾸세요.");
  const lens = picks.map((p) => p.text.length);
  if (lens.length > 1 && Math.max(...lens) > Math.min(...lens) * 1.8)
    warnings.push("선택지 길이 차이가 큽니다. 길이가 정답 단서가 되지 않도록 다듬으세요.");

  return {
    format,
    picks,
    uniform: true,
    directStem: stemTail(format, true),
    arrayOptions: [],
    arrayIndex: 0,
    choices: picks.map((p) => p.text),
    answerIndex,
    warnings,
    difficulty: estimateDifficulty(picks, 1, ctx, format === "bujeong"),
    context: ctx,
  };
}
