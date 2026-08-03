import type { PoemForm } from "../types";

/** Gemini responseSchema — 파싱 에러 방지를 위한 JSON 강제 출력 스키마 */
export const POEM_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    lines: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 16,
    },
  },
  required: ["title", "lines"],
  propertyOrdering: ["title", "lines"],
};

export const FORMS: { id: PoemForm; label: string; hint: string }[] = [
  { id: "free", label: "자유시", hint: "6~12행" },
  { id: "sijo", label: "시조", hint: "3장" },
  { id: "haiku", label: "하이쿠", hint: "5·7·5" },
  { id: "dongsi", label: "동시", hint: "쉬운 말" },
];

export function formLabel(form: PoemForm): string {
  return FORMS.find((f) => f.id === form)?.label ?? "자유시";
}

const FORM_RULES: Record<PoemForm, string> = {
  free: "자유시로 씁니다. 6~12행. 연을 나누고 싶으면 빈 문자열(\"\")을 한 행으로 넣습니다.",
  sijo: "평시조 한 수로 씁니다. 정확히 3행(초장·중장·종장). 각 장은 3·4조 4음보 율격을 자연스럽게 따르고, 종장의 첫 마디는 3음절로 시작합니다. 글자 수를 억지로 맞추느라 어색해지지 않게 합니다.",
  haiku:
    "하이쿠풍 3행시로 씁니다. 정확히 3행이며 각 행을 5·7·5음절에 가깝게 씁니다. 한 순간의 감각이나 계절감을 담습니다.",
  dongsi:
    "동시로 씁니다. 4~8행. 초등학생도 읽을 수 있는 쉬운 우리말과 밝은 리듬으로 쓰고, 의성어나 의태어를 한 번쯤 넣습니다.",
};

export function buildSystem(form: PoemForm): string {
  return [
    "당신은 '포에트리 카메라'입니다. 사진 한 장을 보고, 그 장면에 대한 한국어 시 한 편을 지어 좁은 감열식 영수증 용지에 인쇄합니다.",
    "",
    "원칙:",
    "- 사진 속에 실제로 보이는 구체적인 사물·빛·색·질감·움직임에서 출발합니다. 사진에 없는 것을 지어내지 않습니다.",
    "- 설명하지 말고 보여 줍니다. 감정을 직접 말하는 대신 이미지로 전합니다.",
    "- 진부한 표현(\"아름다운\", \"소중한 추억\", \"행복한 순간\" 등)과 상투적인 비유를 피합니다.",
    "- 사진에 사람이 있으면 외모를 평가하지 않고 동작과 분위기를 담습니다.",
    "- 영수증 폭이 좁으므로 한 행은 18자를 넘기지 않습니다.",
    "- 제목은 8자 이내로 짧게 짓습니다.",
    `- 형식: ${FORM_RULES[form]}`,
    "",
    "출력은 JSON입니다. lines 배열의 원소 하나가 시 한 행입니다.",
  ].join("\n");
}

export function buildUser(form: PoemForm): string {
  return `이 사진을 보고 ${formLabel(form)} 한 편을 지어 주세요. 사진 속 구체적인 장면에서 출발해 주세요.`;
}
