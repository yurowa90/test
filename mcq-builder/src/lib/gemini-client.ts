// Transport is separate from prompts so the real request path can be tested without Vite.
export const DEFAULT_MODEL = "gemini-2.5-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
export class GeminiError extends Error {
  kind: string;
  constructor(message: string, kind = "response") { super(message); this.name = "GeminiError"; this.kind = kind; }
}
type ObjectValue = Record<string, unknown>;
const object = (v: unknown): v is ObjectValue => !!v && typeof v === "object" && !Array.isArray(v);
const records = (v: unknown): ObjectValue[] => Array.isArray(v) ? v.filter(object) : [];
export function normalizeKey(key: string): string {
  // Copy/paste may add line breaks, NBSP, zero-width marks or wrapping quotes.
  // Do not infer provider validity from an undocumented length/alphabet rule.
  let value = key.replace(/[\s\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/gu, "");
  const wrappers: Record<string, string> = { '"': '"', "'": "'", "`": "`", "“": "”", "‘": "’" };
  if (value.length >= 2 && wrappers[value[0]] === value.at(-1)) value = value.slice(1, -1);
  if (!value) throw new GeminiError("API 키가 비어 있습니다. AI Studio에서 복사한 키를 붙여넣어 주세요.", "key");
  if (/^[*•●·]+$/.test(value)) throw new GeminiError("가려진 표시 문자가 입력됐습니다. AI Studio의 복사 버튼으로 실제 키를 복사해 주세요.", "key");
  if (!/^[\x21-\x7E]+$/.test(value)) throw new GeminiError("키에 한글·전각 문자 등 전송할 수 없는 문자가 남아 있습니다. AI Studio의 키 복사 버튼으로 다시 복사해 주세요. 키 값은 공유하지 마세요.", "key");
  return value;
}
export function normalizeModel(model: string): string {
  const value = model.trim().replace(/^models\//, "");
  if (!/^gemini-[a-z0-9.-]+$/.test(value)) throw new GeminiError("모델 ID가 올바르지 않습니다. 모델 목록에서 선택하세요.", "model");
  if (/^gemini-(1\.|2\.0)/.test(value)) throw new GeminiError("종료된 Gemini 모델입니다. API 설정에서 모델 목록을 불러와 다시 선택하세요.", "model");
  return value;
}
interface Runtime {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}
interface CallOptions {
  apiKey: string; model: string; system: string; user: string; schema: unknown;
  temperature?: number; signal?: AbortSignal;
}
function httpError(status: number, data: unknown): GeminiError {
  const error = object(data) && object(data.error) ? data.error : {};
  // Inspect Google diagnostics, but never echo request text or credentials into the UI.
  const diagnostic = JSON.stringify(error);
  if (/API_KEY_INVALID|API_KEY_EXPIRED|API key not valid/i.test(diagnostic) || status === 401)
    return new GeminiError("API 키가 유효하지 않거나 만료됐습니다. Google AI Studio에서 키를 확인한 뒤 다시 입력하세요.", "key");
  if (status === 403) return new GeminiError("사용 권한이 없습니다(403). 키의 웹사이트 제한, Generative Language API 허용 여부와 Google 프로젝트 권한을 확인하세요.", "permission");
  if (status === 404) return new GeminiError("선택한 모델을 사용할 수 없습니다(404). API 설정에서 모델 목록을 새로 불러와 선택하고 연결 시험을 해 주세요.", "model");
  if (status === 429) return new GeminiError("요청 한도 또는 할당량을 초과했습니다(429). AI Studio에서 이 모델의 분당·일일 한도와 결제 상태를 확인하세요. 무료 한도가 0이면 기다려도 해결되지 않습니다.", "quota");
  if (status === 400) return new GeminiError("요청을 처리하지 못했습니다(400). 모델의 JSON 출력 지원, 입력 길이, 이용 지역과 결제 설정을 확인하세요. API 설정의 연결 시험으로 모델 호환성을 먼저 확인할 수 있습니다.", "request");
  return new GeminiError(`Google 응답 오류(HTTP ${status})입니다. 잠시 후 다시 시도해 주세요. 입력한 작업은 유지됩니다.`, "server");
}
function retryDelay(response: Response, data: unknown): number | null {
  if (![429, 500, 502, 503, 504].includes(response.status)) return null;
  const diagnostic = JSON.stringify(data);
  if (response.status === 429 && /PerDay|daily|quotaValue"\s*:\s*"?0|limit:\s*0/i.test(diagnostic)) return null;
  const header = response.headers.get("Retry-After");
  let delay: number | undefined;
  if (header) delay = /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  const error = object(data) && object(data.error) ? data.error : {};
  for (const detail of records(error.details)) {
    if (typeof detail.retryDelay === "string" && /^\d+(\.\d+)?s$/.test(detail.retryDelay))
      delay = Math.max(delay ?? 0, parseFloat(detail.retryDelay) * 1000);
  }
  // Unknown quota errors need user action; never blindly retry them.
  if (response.status === 429 && delay === undefined) return null;
  if (delay !== undefined && (!Number.isFinite(delay) || delay > 10_000)) return null;
  return Math.max(1000, delay ?? 2000);
}
async function request(url: string, apiKey: string, body: unknown | undefined, signal: AbortSignal | undefined, runtime: Runtime): Promise<unknown> {
  const key = normalizeKey(apiKey);
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    if (signal?.aborted) throw new GeminiError("요청을 취소했습니다.", "cancelled");
    signal?.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, runtime.timeoutMs ?? 120_000);
    let response: Response;
    let data: unknown;
    try {
      response = await (runtime.fetch ?? fetch)(url, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
      });
      const text = await response.text(); // Timeout covers the response body, too.
      try { data = JSON.parse(text); } catch {
        if (response.ok) throw new GeminiError("Google 응답 형식이 올바르지 않습니다. 네트워크·프록시 상태를 확인하고 다시 시도하세요.", "json");
        data = null;
      }
    } catch (error) {
      if (timedOut) throw new GeminiError("응답 제한 시간을 초과했습니다. 작업은 유지됩니다. 입력 범위를 줄이거나 다른 모델로 다시 시도하세요.", "timeout");
      if (signal?.aborted) throw new GeminiError("요청을 취소했습니다.", "cancelled");
      if (error instanceof GeminiError) throw error;
      throw new GeminiError("Google API에 연결하지 못했습니다. 인터넷 연결, 학교망 차단 또는 브라우저 확장 프로그램을 확인하세요.", "network");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
    if (response.ok) return data;
    const delay = retryDelay(response, data);
    if (attempt === 0 && delay !== null) {
      await (runtime.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(delay);
      continue;
    }
    throw httpError(response.status, data);
  }
  throw new GeminiError("요청을 완료하지 못했습니다.");
}

/** Validate the schema subset used by our three prompts; never coerce truth values. */
export function matchesSchema(value: unknown, schema: unknown): boolean {
  if (!object(schema)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
  switch (schema.type) {
    case "object": {
      if (!object(value)) return false;
      const properties = object(schema.properties) ? schema.properties : {};
      if (Array.isArray(schema.required) && schema.required.some(k => typeof k !== "string" || !(k in value))) return false;
      return Object.entries(properties).every(([key, child]) => !(key in value) || matchesSchema(value[key], child));
    }
    case "array": return Array.isArray(value) &&
      (typeof schema.minItems !== "number" || value.length >= schema.minItems) &&
      (typeof schema.maxItems !== "number" || value.length <= schema.maxItems) && value.every(v => matchesSchema(v, schema.items));
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    case "integer": case "number": return typeof value === "number" && Number.isFinite(value) &&
      (schema.type !== "integer" || Number.isInteger(value)) &&
      (typeof schema.minimum !== "number" || value >= schema.minimum) &&
      (typeof schema.maximum !== "number" || value <= schema.maximum);
    default: return false;
  }
}
export async function callGemini<T>(options: CallOptions, runtime: Runtime = {}): Promise<T> {
  const model = normalizeModel(options.model);
  const data = await request(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, options.apiKey, {
    systemInstruction: { parts: [{ text: options.system }] },
    contents: [{ role: "user", parts: [{ text: options.user }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: options.schema,
      maxOutputTokens: 32768, ...(options.temperature === undefined ? {} : { temperature: options.temperature }) },
  }, options.signal, runtime);
  const envelope = object(data) ? data : {};
  const candidate = records(envelope.candidates)[0];
  if (object(envelope.promptFeedback) && envelope.promptFeedback.blockReason)
    throw new GeminiError("Google이 입력을 차단했습니다. 입력 내용을 확인해 주세요.", "blocked");
  if (candidate?.finishReason === "MAX_TOKENS")
    throw new GeminiError("모델 응답이 출력 길이 제한으로 잘렸습니다. 불완전한 문항은 반영하지 않았습니다. 입력 범위를 줄여 다시 시도하세요.", "truncated");
  if (candidate?.finishReason && candidate.finishReason !== "STOP")
    throw new GeminiError("모델이 응답을 정상적으로 마치지 못했습니다. 입력 내용을 확인하고 다시 시도하세요.", "blocked");
  const parts = candidate && object(candidate.content) ? records(candidate.content.parts) : [];
  const text = parts.filter(p => p.thought !== true && typeof p.text === "string").map(p => p.text).join("").trim();
  if (!text) throw new GeminiError("모델이 빈 응답을 반환했습니다. 다른 모델로 연결 시험을 해 주세요.", "empty");
  let parsed: unknown;
  try { parsed = JSON.parse(text.replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1")); }
  catch { throw new GeminiError("모델 응답의 JSON 형식이 올바르지 않습니다. 불완전한 문항은 반영하지 않았습니다. 다시 시도하세요.", "json"); }
  if (!object(parsed) || !matchesSchema(parsed, options.schema))
    throw new GeminiError("모델 응답에 필수 항목이 빠졌거나 진위·목록 형식이 잘못됐습니다. 불완전한 문항은 반영하지 않았습니다. 다시 시도하세요.", "schema");
  return parsed as T;
}
export interface GeminiModel { id: string; label: string }
export async function listModels(apiKey: string, signal?: AbortSignal, runtime: Runtime = {}): Promise<GeminiModel[]> {
  const models = new Map<string, GeminiModel>();
  const seen = new Set<string>();
  let token = "";
  for (let page = 0; page < 20; page++) {
    const data = await request(`${ENDPOINT}?pageSize=100${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`, apiKey, undefined, signal, { timeoutMs: 15000, ...runtime });
    if (!object(data) || !Array.isArray(data.models)) throw new GeminiError("모델 목록을 읽지 못했습니다. 다시 불러오세요.");
    for (const m of records(data.models)) {
      if (typeof m.name !== "string" || !Array.isArray(m.supportedGenerationMethods) || !m.supportedGenerationMethods.includes("generateContent")) continue;
      let id: string;
      try { id = normalizeModel(m.name); } catch { continue; }
      if (/image|tts|audio|live|robotics|computer|embedding|research/i.test(id) || typeof m.outputTokenLimit !== "number" || m.outputTokenLimit < 32768) continue;
      models.set(id, { id, label: typeof m.displayName === "string" ? m.displayName : id });
    }
    if (!data.nextPageToken) return [...models.values()].sort((a,b) => a.id.localeCompare(b.id));
    if (typeof data.nextPageToken !== "string" || seen.has(data.nextPageToken)) break;
    token = data.nextPageToken; seen.add(token);
  }
  throw new GeminiError("모델 목록이 불완전하게 반환됐습니다. 다시 불러오세요.");
}
export async function testConnection(apiKey: string, model: string, signal?: AbortSignal, runtime: Runtime = {}): Promise<void> {
  const result = await callGemini<{ ok: boolean }>({ apiKey, model, signal,
    system: "Return a JSON object for a connection test.", user: 'Return exactly {"ok":true}.',
    schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
  }, runtime);
  if (result.ok !== true) throw new GeminiError("모델이 연결 시험에 올바르게 응답하지 않았습니다.");
}
