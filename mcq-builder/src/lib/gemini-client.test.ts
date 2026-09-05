import test from "node:test";
import assert from "node:assert/strict";
import { callGemini, listModels, matchesSchema, normalizeKey, normalizeModel, testConnection } from "./gemini-client.ts";

const key = "test-key-never-sent-to-google";
const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] };
const options = { apiKey: key, model: "gemini-2.5-flash", system: "test", user: "test", schema };
const json = (value: unknown, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
const success = () => json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"ok":true}' }] } }] });
const kind = (expected: string) => (e: unknown) => (e as { kind: string }).kind === expected;

test("request uses key header, normalized model, JSON schema and sufficient output budget", async () => {
  const result = await callGemini({ ...options, model: " models/gemini-2.5-flash ", apiKey: ` ${key} ` }, {
    fetch: async (url, init) => {
      assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
      assert.equal(new Headers(init?.headers).get("x-goog-api-key"), key);
      const body = JSON.parse(init?.body as string);
      assert.deepEqual(body.generationConfig.responseSchema, schema);
      assert.equal(body.generationConfig.maxOutputTokens, 32768);
      assert.equal(body.contents[0].parts[0].text, "test");
      return success();
    },
  });
  assert.deepEqual(result, { ok: true });
});
test("all non-thought text parts are joined", async () => {
  const fetch: typeof globalThis.fetch = async () => json({ candidates: [{ finishReason: "STOP", content: { parts: [
    { text: "private reasoning", thought: true }, { text: '{"ok":' }, { text: "true}" },
  ] } }] });
  assert.deepEqual(await callGemini(options, { fetch }), { ok: true });
});
test("input mistakes and retired models fail before sending a request", async () => {
  assert.equal(normalizeKey(` ${key} `), key);
  assert.throws(() => normalizeKey('"AIza wrong"'), kind("key"));
  assert.throws(() => normalizeModel("models/gemini-2.0-flash"), kind("model"));
  assert.throws(() => normalizeModel("gemini-2.5-flash?key=leak"), kind("model"));
  await assert.rejects(callGemini({ ...options, apiKey: "bad" }, { fetch: async () => { assert.fail("must not fetch"); } }), kind("key"));
});
for (const [status, data, expected] of [
  [400, { error: { details: [{ reason: "API_KEY_INVALID" }], message: key } }, "key"],
  [400, { error: { status: "INVALID_ARGUMENT" } }, "request"],
  [401, {}, "key"], [403, {}, "permission"], [404, {}, "model"], [429, {}, "quota"],
] as const) test(`HTTP ${status} maps to ${expected} without exposing diagnostics`, async () => {
  let calls = 0;
  await assert.rejects(callGemini(options, { fetch: async () => { calls++; return json(data, status); } }), e => {
    assert.equal((e as { kind: string }).kind, expected); assert.ok(!(e as Error).message.includes(key)); return true;
  });
  assert.equal(calls, 1);
});
for (const status of [500, 502, 503, 504]) test(`HTTP ${status} retries once then succeeds`, async () => {
  let calls = 0; const waits: number[] = [];
  await callGemini(options, { fetch: async () => ++calls === 1 ? json({}, status) : success(), sleep: async ms => { waits.push(ms); } });
  assert.equal(calls, 2); assert.deepEqual(waits, [2000]);
});
test("retry stops after two server failures", async () => {
  let calls = 0;
  await assert.rejects(callGemini(options, { fetch: async () => { calls++; return new Response("bad gateway", { status: 502 }); }, sleep: async () => {} }), kind("server"));
  assert.equal(calls, 2);
});
test("429 honors Retry-After and Google RetryInfo", async () => {
  let calls = 0; const waits: number[] = [];
  await callGemini(options, { fetch: async () => ++calls === 1 ? json({ error: { details: [{ retryDelay: "3s" }] } }, 429, { "Retry-After": "2" }) : success(), sleep: async ms => { waits.push(ms); } });
  assert.deepEqual(waits, [3000]);
});
for (const [data, retryAfter] of [
  [{ error: { details: [{ violations: [{ quotaValue: "0" }] }] } }, "1"],
  [{ error: { message: "RequestsPerDay limit exceeded" } }, "1"],
  [{}, "60"], [{}, ""],
] as const) test(`quota is not retried when wait cannot help: ${JSON.stringify(data)} ${retryAfter}`, async () => {
  let calls = 0;
  await assert.rejects(callGemini(options, { fetch: async () => { calls++; return json(data, 429, retryAfter ? { "Retry-After": retryAfter } : {}); }, sleep: async () => { assert.fail("must not retry"); } }), kind("quota"));
  assert.equal(calls, 1);
});
for (const [data, expected] of [
  [{ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"ok":true}' }] } }] }, "truncated"],
  [{ promptFeedback: { blockReason: "SAFETY" } }, "blocked"],
  [{ candidates: [{ finishReason: "SAFETY" }] }, "blocked"],
  [{ candidates: [] }, "empty"],
  [{ candidates: [{ content: { parts: [{ text: '{"ok":' }] } }] }, "json"],
  [{ candidates: [{ content: { parts: [{ text: '{"ok":"true"}' }] } }] }, "schema"],
  [{ candidates: [{ content: { parts: [{ text: 'null' }] } }] }, "schema"],
  [{ candidates: [{ content: { parts: [{ text: '[]' }] } }] }, "schema"],
  [{ candidates: [{ content: { parts: [{ text: '{}' }] } }] }, "schema"],
] as const) test(`invalid model output is rejected: ${expected} ${JSON.stringify(data).slice(0,90)}`, async () => {
  await assert.rejects(callGemini(options, { fetch: async () => json(data) }), kind(expected));
});
test("malformed HTTP JSON is distinguished from network failure", async () => {
  await assert.rejects(callGemini(options, { fetch: async () => new Response("<html>proxy</html>") }), kind("json"));
  await assert.rejects(callGemini(options, { fetch: async () => { throw new TypeError("failed to fetch"); } }), kind("network"));
});
test("timeout covers body after response headers arrive", async () => {
  await assert.rejects(callGemini(options, { timeoutMs: 5, fetch: async (_url, init) => new Response(new ReadableStream({
    start(controller) { init?.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError"))); },
  })) }), kind("timeout"));
});
test("cancellation aborts an active request and prevents a pre-cancelled request", async () => {
  const controller = new AbortController();
  await assert.rejects(callGemini({ ...options, signal: controller.signal }, { fetch: async (_url, init) => {
    controller.abort(); throw new DOMException(String(init?.signal?.aborted), "AbortError");
  } }), kind("cancelled"));
  await assert.rejects(callGemini({ ...options, signal: controller.signal }, { fetch: async () => { assert.fail("must not fetch"); } }), kind("cancelled"));
});
test("model discovery follows pagination, deduplicates and excludes unsupported models", async () => {
  const model = (name: string, limit = 65536, methods = ["generateContent"]) => ({ name: `models/${name}`, outputTokenLimit: limit, supportedGenerationMethods: methods });
  let calls = 0;
  const models = await listModels(key, undefined, { fetch: async (url, init) => {
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), key); calls++;
    if (calls === 1) return json({ models: [model("gemini-2.5-flash"), model("gemini-2.0-flash"), model("gemini-2.5-flash-image"), model("gemini-short", 8192), model("gemini-embedding", 65536, ["embedContent"])], nextPageToken: "next page" });
    assert.match(String(url), /pageToken=next%20page/);
    return json({ models: [model("gemini-2.5-flash"), model("gemini-future-pro")] });
  } });
  assert.deepEqual(models.map(m => m.id), ["gemini-2.5-flash", "gemini-future-pro"]);
  assert.equal(calls, 2);
});
test("model discovery rejects repeated pagination tokens", async () => {
  await assert.rejects(listModels(key, undefined, { fetch: async () => json({ models: [], nextPageToken: "repeat" }) }));
});
test("schema checks reject missing nested explanations and coerced truth", () => {
  const bankSchema = { type: "object", required: ["propositions"], properties: { propositions: { type: "array", minItems: 1, items: { type: "object", properties: { isTrue: { type: "boolean" }, explanation: { type: "string" } }, required: ["isTrue", "explanation"] } } } };
  assert.equal(matchesSchema({ propositions: [{ isTrue: "false", explanation: "x" }] }, bankSchema), false);
  assert.equal(matchesSchema({ propositions: [{ isTrue: false }] }, bankSchema), false);
  assert.equal(matchesSchema({ propositions: [] }, bankSchema), false);
  assert.equal(matchesSchema({ propositions: [{ isTrue: false, explanation: "x" }] }, bankSchema), true);
});
test("connection test uses the generation transport and requires true", async () => {
  await testConnection(key, options.model, undefined, { fetch: async () => success() });
  await assert.rejects(testConnection(key, options.model, undefined, { fetch: async () => json({ candidates: [{ content: { parts: [{ text: '{"ok":false}' }] } }] }) }));
});
