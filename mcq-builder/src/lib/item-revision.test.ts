import test from "node:test";
import assert from "node:assert/strict";
import { constrainRevision, emptyRevision, proposeRevision, readRevisionState, revisionToWorkspace } from "./item-revision.ts";
import type { RevisionState } from "./item-revision.ts";
import { callGemini } from "./gemini-client.ts";
import { exampleWorkspace } from "./example.ts";
import { bankReadiness } from "./workspace.ts";

function fixture(): RevisionState {
  const w = exampleWorkspace(), s = w.bank.stimulus;
  const content = { intro: s.indirectStem, stemPrefix: s.stemPrefix, body: s.body, conditions: s.conditions, figureSpec: "", statements: w.bank.propositions.slice(0, 3).map(p => p.text) };
  return { ...emptyRevision(w.input), sourceMode: "synthetic", reading: { content, notes: ["원문 정답 번호는 별도 기록"], location: "합성 예시" }, originalConfirmed: true, proposal: { content: { ...content, intro: "표는 세 시료의 측정 결과이다." }, diagnosis: "발문을 간결하게 정리", changes: [{ part: "stem", reason: "중복 설명 제거", principle: "핵심 조건은 유지" }], warnings: [], assessmentElement: "밀도 비교", assessmentGoal: "질량과 부피의 비를 비교한다", judgments: w.bank.propositions.slice(0, 3).map(p => ({ verdict: p.isTrue ? "참" : "거짓", reason: p.explanation })) } };
}

test("선택하지 않은 부분의 문장·수치·보기는 모델이 바꾸어도 원문 그대로 보존한다", () => {
  const original = fixture().reading!.content;
  const changed = { ...original, intro: "변경", body: "수치를 바꾼 자료", conditions: ["다른 조건"], statements: ["정반대 진술"] };
  const stem = constrainRevision(original, changed, ["stem"]);
  assert.equal(stem.intro, "변경"); assert.equal(stem.body, original.body);
  assert.deepEqual(stem.conditions, original.conditions); assert.deepEqual(stem.statements, original.statements);
  const statements = constrainRevision(original, changed, ["statements"]);
  assert.equal(statements.intro, original.intro); assert.equal(statements.body, original.body);
  assert.deepEqual(statements.statements, ["정반대 진술"]);
});

test("수정안 가져오기는 판독 확인·진위 보류·유형별 진술 수를 검사한다", () => {
  const state = fixture(), input = exampleWorkspace().input;
  assert.throws(() => revisionToWorkspace({ ...state, originalConfirmed: false }, input), /원문 확인/);
  assert.throws(() => revisionToWorkspace({ ...state, format: "jeongdap" }, input), /5개/);
  assert.throws(() => revisionToWorkspace({ ...state, proposal: { ...state.proposal!, judgments: state.proposal!.judgments.map(j => ({ ...j, verdict: "판단보류" })) } }, input), /판단보류/);
  assert.throws(() => revisionToWorkspace({ ...state, sourceMode: "reference" }, input), /출처/);
  const work = revisionToWorkspace(state, input);
  assert.equal(work.step, "bank"); assert.equal(work.final, null);
  assert.deepEqual(work.teacherChecks, [false, false, false, false]);
  assert.deepEqual(work.bankDraft!.reviewedIds, []);
  assert.equal(bankReadiness(work.bankDraft!, work.input).ready, false);
  assert.equal(work.bankDraft!.bank.propositions[2].isTrue, false);
  assert.match(work.revisionRecord!, /원문 확인본/);
  assert.equal(work.reflection.reason, "발문: 중복 설명 제거");
});

test("수정안의 새 성취기준에 이전 성취기준 코드·수준을 붙이지 않는다", () => {
  const state = { ...fixture(), standard: "다른 수업 목표" };
  const work = revisionToWorkspace(state, { ...exampleWorkspace().input, standardCode: "OLD-CODE" });
  assert.equal(work.input.standardCode, undefined);
  assert.equal(work.input.standard, "다른 수업 목표");
  const restored = readRevisionState(JSON.stringify(state), work.input);
  assert.deepEqual(restored.reading, state.reading);
  assert.deepEqual(restored.proposal, state.proposal);
});

test("PDF·이미지는 같은 인증·JSON 전송 경로를 사용하고 지원하지 않는 첨부는 전송 전에 거절한다", async () => {
  const options = { apiKey: "test-only-key", model: "gemini-2.5-flash", system: "test", user: "원자료 읽기", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } };
  let sent = 0;
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    sent++;
    const body = JSON.parse(init!.body as string);
    assert.deepEqual(body.contents[0].parts[1], { inlineData: { mimeType: "application/pdf", data: "JVBERi0=" } });
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "test-only-key");
    return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"ok":true}' }] } }] }));
  };
  await callGemini({ ...options, attachments: [{ mimeType: "application/pdf", data: "JVBERi0=" }] }, { fetch });
  await assert.rejects(callGemini({ ...options, attachments: [{ mimeType: "text/html", data: "aGVsbG8=" }] }, { fetch }), /첨부/);
  assert.equal(sent, 1);
});

test("모델이 고정 부분을 바꾸면 적용을 제거하고 진위 판정을 보류로 돌린다", async () => {
  const state = { ...fixture(), targets: ["stem" as const] };
  const raw = { ...state.proposal!, content: { ...state.proposal!.content, body: "모델이 임의 변경한 수치" } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(raw) }] } }] }));
  try {
    const result = await proposeRevision(state, exampleWorkspace().input, "test-only-key", "gemini-2.5-flash");
    assert.equal(result.content.body, state.reading!.content.body);
    assert.ok(result.judgments.every(j => j.verdict === "판단보류"));
    assert.ok(result.warnings.some(w => w.includes("원문을 보존")));
  } finally { globalThis.fetch = originalFetch; }
});
