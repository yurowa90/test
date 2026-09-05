import assert from "node:assert/strict";
import test from "node:test";
import type { ItemFormat, Proposition } from "../types.ts";
import { assemble, composeStem } from "./assemble.ts";

const context = { dataComplexity: 1 as const, fusion: false };

function propositions(bits: boolean[]): Proposition[] {
  return bits.map((isTrue, index) => ({
    id: `P${index + 1}`,
    text: `진술 ${index + 1}이다.`,
    isTrue,
    level: "C",
    behavior: "이해",
    explanation: "검산 근거",
  }));
}

test("합답형 3항의 모든 진위 조합에서 정답과 5개 선택지를 일관되게 계산한다", () => {
  for (let mask = 0; mask < 8; mask += 1) {
    const bits = Array.from({ length: 3 }, (_, index) => Boolean(mask & (1 << index)));
    const result = assemble("hapdab", propositions(bits), context);
    if (bits.some(Boolean)) {
      assert.equal(result.choices.length, 5);
      assert.ok(result.answerIndex >= 0 && result.answerIndex < 5);
    } else {
      assert.equal(result.answerIndex, -1);
    }
  }
});

test("합답형 4항의 표준 배열은 참 명제가 두 개인 경우에만 균일하다", () => {
  for (let mask = 1; mask < 16; mask += 1) {
    const bits = Array.from({ length: 4 }, (_, index) => Boolean(mask & (1 << index)));
    const result = assemble("hapdab", propositions(bits), context);
    assert.equal(result.choices.length, 5);
    assert.ok(result.answerIndex >= 0 && result.answerIndex < 5);
    assert.equal(result.uniform, bits.filter(Boolean).length === 2);
  }
});

for (const format of ["jeongdap", "bujeong"] satisfies ItemFormat[]) {
  test(`${format}은 유일 정답 조건을 만족할 때만 정답을 확정한다`, () => {
    for (let mask = 0; mask < 32; mask += 1) {
      const bits = Array.from({ length: 5 }, (_, index) => Boolean(mask & (1 << index)));
      const result = assemble(format, propositions(bits), context);
      const trueCount = bits.filter(Boolean).length;
      const valid = format === "jeongdap" ? trueCount === 1 : trueCount === 4;
      assert.equal(result.answerIndex >= 0, valid);
    }
  });
}

test("단서 조항을 발문 뒤에 한 번만 결합한다", () => {
  assert.equal(
    composeStem("이 자료에 대한 설명으로", "옳은 것은?", ["온도는 일정하다."]),
    "이 자료에 대한 설명으로 옳은 것은? (단, 온도는 일정하다.)",
  );
});
