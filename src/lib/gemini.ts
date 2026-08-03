import type { CapturedImage, Poem, PoemForm } from "../types";
import { POEM_SCHEMA, buildSystem, buildUser } from "./prompts";

export const DEFAULT_MODEL = "gemini-2.5-flash";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** 사용자에게 그대로 보여줄 한국어 오류 */
export class GeminiError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 사진 + 프롬프트로 Gemini를 호출해 시(JSON)를 받는다. 429/503은 1회 재시도. */
export async function generatePoem(
  image: CapturedImage,
  form: PoemForm,
  apiKey: string,
  model: string,
): Promise<Poem> {
  const url = `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: buildSystem(form) }] },
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: image.mimeType, data: image.base64 } },
          { text: buildUser(form) },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: POEM_SCHEMA,
      temperature: 1.0,
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
            `모델이 시를 짓지 못했습니다(사유: ${blockReason}). 다른 사진으로 시도해 주세요.`,
          );
        }
        throw new GeminiError("모델이 빈 응답을 반환했습니다. 다시 시도해 주세요.");
      }

      let parsed: Poem;
      try {
        parsed = JSON.parse(text) as Poem;
      } catch {
        throw new GeminiError(
          "모델 응답을 해석하지 못했습니다(JSON 형식 오류). 다시 시도해 주세요.",
        );
      }
      return cleanPoem(parsed);
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

/** 행 끝 공백 제거, 앞뒤·연속 빈 행 정리 */
function cleanPoem(poem: Poem): Poem {
  const rawLines = Array.isArray(poem.lines) ? poem.lines : [];
  const lines = rawLines
    .map((l) => String(l ?? "").replace(/\s+$/, ""))
    .filter(
      (l, i, arr) =>
        !(l === "" && (i === 0 || i === arr.length - 1 || arr[i - 1] === "")),
    );
  if (lines.length === 0) {
    throw new GeminiError("시가 비어 있습니다. 다시 시도해 주세요.");
  }
  const title = String(poem.title ?? "").trim() || "무제";
  return { title, lines };
}
