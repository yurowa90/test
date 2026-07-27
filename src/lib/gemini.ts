import type {
  GraspsCandidates,
  GraspsFinal,
  GraspsSelection,
  Stage1Result,
  TeacherInput,
} from "../types";
import {
  GRASPS_CANDIDATES_SCHEMA,
  GRASPS_FINAL_SCHEMA,
  STAGE1_SCHEMA,
  buildCandidatesSystem,
  buildCandidatesUser,
  buildFinalSystem,
  buildFinalUser,
  buildStage1System,
  buildStage1User,
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
}: CallOptions): Promise<T> {
  const url = `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.7,
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
            `모델이 응답을 생성하지 못했습니다(사유: ${blockReason}). 성취기준 문구를 다듬어 다시 시도해 주세요.`,
          );
        }
        throw new GeminiError(
          "모델이 빈 응답을 반환했습니다. 다시 시도해 주세요.",
        );
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new GeminiError(
          "모델 응답을 해석하지 못했습니다(JSON 형식 오류). 다시 시도해 주세요.",
        );
      }
    }

    // 재시도 가능한 상태 코드
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
      throw new GeminiError(
        "요청 한도를 초과했습니다(429). 잠시 후 다시 시도해 주세요.",
      );
    }
    throw new GeminiError(
      `모델 호출에 실패했습니다(HTTP ${res.status}). 잠시 후 다시 시도해 주세요.`,
    );
  }

  throw new GeminiError(
    `모델이 일시적으로 혼잡합니다(${lastError}). 잠시 후 다시 시도해 주세요.`,
  );
}

export async function generateStage1(
  input: TeacherInput,
  apiKey: string,
  model: string,
): Promise<Stage1Result> {
  return callGemini<Stage1Result>({
    apiKey,
    model,
    system: buildStage1System(),
    user: buildStage1User(input),
    schema: STAGE1_SCHEMA,
  });
}

/** Pass 2a — 6요소 각각의 후보(2~3개)를 생성 */
export async function generateGraspsCandidates(
  input: TeacherInput,
  stage1: Stage1Result,
  apiKey: string,
  model: string,
): Promise<GraspsCandidates> {
  return callGemini<GraspsCandidates>({
    apiKey,
    model,
    system: buildCandidatesSystem(),
    user: buildCandidatesUser(input, stage1),
    schema: GRASPS_CANDIDATES_SCHEMA,
  });
}

/** Pass 2b — 확정된 6요소로 학생 안내문·루브릭을 생성 */
export async function generateGraspsFinal(
  input: TeacherInput,
  stage1: Stage1Result,
  selection: GraspsSelection,
  apiKey: string,
  model: string,
  includeUdlOptions: boolean,
): Promise<GraspsFinal> {
  const final = await callGemini<GraspsFinal>({
    apiKey,
    model,
    system: buildFinalSystem(includeUdlOptions, input.achievementLevels),
    user: buildFinalUser(input, stage1, selection),
    schema: GRASPS_FINAL_SCHEMA,
  });
  if (!final.studentPrompt || !Array.isArray(final.rubric) || final.rubric.length === 0) {
    throw new GeminiError(
      "안내문·루브릭 생성이 불완전합니다. 다시 시도해 주세요.",
    );
  }
  return final;
}
