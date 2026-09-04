import type {
  AnalysisResult,
  Assembly,
  FinalItem,
  ItemBank,
  Proposition,
  Scenario,
  Stimulus,
  TeacherInput,
} from "../types";
import { BEHAVIOR_DOMAINS, LEVEL_LABELS, STIMULUS_TYPES } from "../types";
import {
  ANALYSIS_SCHEMA,
  BANK_SCHEMA,
  FINAL_SCHEMA,
  buildAnalysisSystem,
  buildAnalysisUser,
  buildBankSystem,
  buildBankUser,
  buildFinalSystem,
  buildFinalUser,
} from "./prompts";

export const DEFAULT_MODEL = "gemini-2.5-flash";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** 사용자에게 그대로 보여줄 한국어 오류 */
export class GeminiError extends Error {}

interface CallOptions {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schema: unknown;
  temperature?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** JSON 강제 출력으로 Gemini를 호출하고 파싱된 객체를 반환. 429/503은 1회 재시도. */
async function callGemini<T>({
  apiKey,
  model,
  system,
  user,
  schema,
  temperature = 0.7,
}: CallOptions): Promise<T> {
  const url = `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature,
    },
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new GeminiError(
        "네트워크 연결에 실패했습니다. 인터넷 상태를 확인한 뒤 다시 시도해 주세요.",
      );
    }

    if (res.ok) {
      const data = await res.json();
      const text: string | undefined =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        const blockReason = data?.promptFeedback?.blockReason;
        if (blockReason) {
          throw new GeminiError(
            `모델이 응답을 생성하지 못했습니다(사유: ${blockReason}). 성취기준·맥락 문구를 다듬어 다시 시도해 주세요.`,
          );
        }
        throw new GeminiError("모델이 빈 응답을 반환했습니다. 다시 시도해 주세요.");
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new GeminiError(
          "모델 응답을 해석하지 못했습니다(JSON 형식 오류). 다시 시도해 주세요.",
        );
      }
    }

    if ((res.status === 429 || res.status === 503) && attempt === 0) {
      lastError = res.status;
      await sleep(1500);
      continue;
    }

    if (res.status === 400 || res.status === 403) {
      throw new GeminiError(
        "API 키가 유효하지 않거나 권한이 없습니다. 키를 다시 확인해 주세요.",
      );
    }
    if (res.status === 429) {
      throw new GeminiError("요청 한도를 초과했습니다(429). 잠시 후 다시 시도해 주세요.");
    }
    throw new GeminiError(
      `모델 호출에 실패했습니다(HTTP ${res.status}). 잠시 후 다시 시도해 주세요.`,
    );
  }

  throw new GeminiError(
    `모델이 일시적으로 혼잡합니다(${lastError}). 잠시 후 다시 시도해 주세요.`,
  );
}

const asString = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

/** Pass 1 — 교육과정 분석·평가 요소·문제 장면 */
export async function generateAnalysis(
  input: TeacherInput,
  apiKey: string,
  model: string,
): Promise<AnalysisResult> {
  const raw = await callGemini<Partial<AnalysisResult>>({
    apiKey,
    model,
    system: buildAnalysisSystem(input),
    user: buildAnalysisUser(input),
    schema: ANALYSIS_SCHEMA,
  });

  const scenarios: Scenario[] = Array.isArray(raw.scenarios)
    ? raw.scenarios
        .filter((s) => s && typeof s === "object")
        .map((s) => ({
          title: asString(s.title, "문제 장면"),
          stimulusType: (STIMULUS_TYPES as readonly string[]).includes(s.stimulusType as string)
            ? s.stimulusType
            : "제시문",
          description: asString(s.description),
          cues: asStringArray(s.cues),
          inquiryContext: s.inquiryContext === "실생활" ? "실생활" : "순수과학",
        }))
    : [];

  if (!asString(raw.assessmentElement).trim() || scenarios.length === 0) {
    throw new GeminiError("평가 요소·문제 장면 생성이 불완전합니다. 다시 시도해 주세요.");
  }

  const fallbackBehavior = input.options.behavior === "auto" ? "이해" : input.options.behavior;
  return {
    contentElements: asStringArray(raw.contentElements),
    assessmentElement: asString(raw.assessmentElement).trim(),
    assessmentGoal: asString(raw.assessmentGoal).trim(),
    behaviorDomain: (BEHAVIOR_DOMAINS as readonly string[]).includes(raw.behaviorDomain as string)
      ? (raw.behaviorDomain as AnalysisResult["behaviorDomain"])
      : fallbackBehavior,
    behaviorRationale: asString(raw.behaviorRationale),
    scenarios,
  };
}

/** Pass 2a — 자료 + 참·거짓 명제 풀 */
export async function generateBank(
  input: TeacherInput,
  analysis: AnalysisResult,
  scenario: Scenario,
  apiKey: string,
  model: string,
): Promise<ItemBank> {
  const raw = await callGemini<{ stimulus?: Partial<Stimulus>; propositions?: unknown[] }>({
    apiKey,
    model,
    system: buildBankSystem(input, analysis),
    user: buildBankUser(input, analysis, scenario),
    schema: BANK_SCHEMA,
  });

  const s = raw.stimulus ?? {};
  const complexityRaw = Number(s.complexity);
  const complexity = (
    Number.isFinite(complexityRaw) ? Math.min(2, Math.max(0, Math.round(complexityRaw))) : 1
  ) as 0 | 1 | 2;
  const stimulus: Stimulus = {
    indirectStem: asString(s.indirectStem).trim(),
    body: asString(s.body).trim(),
    figureSpec: asString(s.figureSpec).trim(),
    conditions: asStringArray(s.conditions),
    stemPrefix: asString(s.stemPrefix, "이에 대한 설명으로").trim() || "이에 대한 설명으로",
    complexity,
  };

  const propositions: Proposition[] = (Array.isArray(raw.propositions) ? raw.propositions : [])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p, i) => ({
      id: `P${i + 1}`,
      text: asString(p.text).trim(),
      isTrue: p.isTrue === true,
      level: (LEVEL_LABELS as readonly string[]).includes(p.level as string)
        ? (p.level as Proposition["level"])
        : "C",
      behavior: (BEHAVIOR_DOMAINS as readonly string[]).includes(p.behavior as string)
        ? (p.behavior as Proposition["behavior"])
        : analysis.behaviorDomain,
      explanation: asString(p.explanation).trim(),
    }))
    .filter((p) => p.text !== "");

  const trueCount = propositions.filter((p) => p.isTrue).length;
  if (!stimulus.body || !stimulus.indirectStem || propositions.length < 6 || trueCount === 0 || trueCount === propositions.length) {
    throw new GeminiError("자료·명제 풀 생성이 불완전합니다. 다시 시도해 주세요.");
  }
  return { stimulus, propositions };
}

/** Pass 2b — 윤문·해설·문항정보표·검토 체크리스트 */
export async function generateFinal(
  input: TeacherInput,
  analysis: AnalysisResult,
  scenario: Scenario,
  stimulus: Stimulus,
  assembly: Assembly,
  apiKey: string,
  model: string,
): Promise<FinalItem> {
  const raw = await callGemini<Partial<FinalItem>>({
    apiKey,
    model,
    system: buildFinalSystem(),
    user: buildFinalUser(input, analysis, scenario, stimulus, assembly),
    schema: FINAL_SCHEMA,
    temperature: 0.4,
  });

  const originals = assembly.picks.map((p) => p.text);
  const statements = asStringArray(raw.statements);
  const info = (raw.info ?? {}) as Partial<FinalItem["info"]>;

  return {
    indirectStem: asString(raw.indirectStem, stimulus.indirectStem).trim() || stimulus.indirectStem,
    body: asString(raw.body, stimulus.body).trim() || stimulus.body,
    figureSpec: asString(raw.figureSpec, stimulus.figureSpec).trim(),
    conditions: Array.isArray(raw.conditions) ? asStringArray(raw.conditions) : stimulus.conditions,
    statements: statements.length === originals.length ? statements : originals,
    explanations: Array.isArray(raw.explanations)
      ? raw.explanations
          .filter((e): e is FinalItem["explanations"][number] => !!e && typeof e === "object")
          .map((e) => ({
            label: asString(e.label),
            verdict: asString(e.verdict),
            text: asString(e.text),
          }))
      : [],
    solution: asString(raw.solution).trim(),
    info: {
      subject: asString(info.subject, input.subject),
      contentArea: asString(info.contentArea, input.domain ?? ""),
      contentElement: asString(info.contentElement, analysis.contentElements[0] ?? ""),
      behaviorDomain: asString(info.behaviorDomain, analysis.behaviorDomain),
      standardCode: asString(info.standardCode, input.standardCode ?? "-"),
      assessmentElement: asString(info.assessmentElement, analysis.assessmentElement),
      assessmentGoal: asString(info.assessmentGoal, analysis.assessmentGoal),
      inquiryContext: asString(info.inquiryContext, scenario.inquiryContext),
      difficultyTier: asString(info.difficultyTier, assembly.difficulty.tier),
      answer: asString(info.answer),
      intent: asString(info.intent),
    },
    review: Array.isArray(raw.review)
      ? raw.review
          .filter((r): r is FinalItem["review"][number] => !!r && typeof r === "object")
          .map((r) => ({ item: asString(r.item), pass: r.pass !== false, note: asString(r.note) }))
      : [],
  };
}
