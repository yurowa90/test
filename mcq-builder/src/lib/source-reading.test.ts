import test from 'node:test';
import assert from 'node:assert/strict';
import type { SourceReference } from '../types.ts';
import type { Attachment } from './attachments.ts';
import { GeminiError } from './gemini-client.ts';
import { applySourceReading, readSourceOriginal } from './source-reading.ts';

const apiKey = 'test-key-never-sent-to-google';
const model = 'gemini-2.5-flash';
const source: SourceReference = {
  id: 'source-1', kind: '논문', title: '자연선택 실험 자료', creators: '교사 확인', year: '2024',
  locator: 'https://example.org/article', originalLocation: '5쪽, 그림 2', use: '표 재구성',
  rights: '교사 확인', dataExcerpt: '교사가 먼저 옮긴 자료: 대조군 12개체.', verified: true,
  studyConditions: '동일한 먹이 공급', transformations: '표로 재구성', limitations: '한 집단의 결과', inspected: 'figure',
};
const attachments: Attachment[] = [
  { name: '실험 표.png', mimeType: 'image/png', data: 'iVBORw0KGgo=', url: 'blob:local-png', size: 8 },
  { name: '방법.pdf', mimeType: 'application/pdf', data: 'JVBERi0xLjc=', url: 'blob:local-pdf', size: 8 },
  { name: '그래프.jpg', mimeType: 'image/jpeg', data: '/9j/4A==', url: 'blob:local-jpeg', size: 4 },
];
const reading = { dataExcerpt: '실험 표.png\n| 집단 | 개체 수 |\n| --- | --- |\n| 대조군 | 12 |', notes: ['그래프.jpg의 세로축 단위는 판독 불가'] };
const response = (result: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(result) }] } }] }));
const errorKind = (kind: string) => (error: unknown) => error instanceof GeminiError && error.kind === kind;

test('source reading sends each image and PDF inline, with its name mapped by file order', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    requests++;
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    assert.equal(new Headers(init.headers).get('x-goog-api-key'), apiKey);
    const body = JSON.parse(init.body as string);
    const parts = body.contents[0].parts;
    assert.deepEqual(JSON.parse(parts[0].text), {
      title: source.title, location: source.originalLocation, filesInOrder: attachments.map(a => a.name),
    });
    assert.deepEqual(parts.slice(1), attachments.map(a => ({ inlineData: { mimeType: a.mimeType, data: a.data } })));
    assert.ok(!String(init.body).includes('blob:local-'));
    return response(reading);
  });
  assert.deepEqual(await readSourceOriginal(source, attachments, apiKey, model), reading);
  assert.equal(requests, 1);
});

test('reading returns a reviewable result without modifying the existing source or attachments', async t => {
  const current = Object.freeze(structuredClone(source));
  const files = attachments.map(a => Object.freeze({ ...a }));
  Object.freeze(files);
  const beforeFiles = structuredClone(files);
  t.mock.method(globalThis, 'fetch', async () => response(reading));
  const result = await readSourceOriginal(current, files, apiKey, model);
  assert.deepEqual(current, source);
  assert.deepEqual(files, beforeFiles);
  assert.equal(current.verified, true);
  assert.notEqual(result.dataExcerpt, current.dataExcerpt);
  assert.deepEqual(result.notes, reading.notes);
});

test('source locator is used when a page or figure location has not been entered', async t => {
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    assert.equal(JSON.parse(body.contents[0].parts[0].text).location, source.locator);
    return response(reading);
  });
  await readSourceOriginal({ ...source, originalLocation: '' }, attachments, apiKey, model);
});

test('a missing attachment is rejected before any API call', async t => {
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('must not send an empty source reading request'); });
  await assert.rejects(readSourceOriginal(source, [], apiKey, model), errorKind('request'));
});

for (const [result, kind] of [
  [{ dataExcerpt: ' \n\t ', notes: ['숫자가 흐려 판독 불가'] }, 'response'],
  [{ notes: [] }, 'schema'],
  [{ dataExcerpt: '자료', notes: '목록이 아님' }, 'schema'],
] as const) test(`empty or incomplete reading is rejected without changing existing source: ${kind}`, async t => {
  const current = Object.freeze(structuredClone(source));
  t.mock.method(globalThis, 'fetch', async () => response(result));
  await assert.rejects(readSourceOriginal(current, attachments, apiKey, model), errorKind(kind));
  assert.deepEqual(current, source);
});

test('network failure preserves source content and verification state', async t => {
  const current = Object.freeze(structuredClone(source));
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('network disconnected'); });
  await assert.rejects(readSourceOriginal(current, attachments, apiKey, model), errorKind('network'));
  assert.deepEqual(current, source);
});

test('cancellation aborts an in-flight request and preserves source content', async t => {
  const current = Object.freeze(structuredClone(source));
  const controller = new AbortController();
  let receivedSignal: AbortSignal | null | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    receivedSignal = init.signal;
    controller.abort();
    throw new DOMException('Aborted', 'AbortError');
  });
  await assert.rejects(readSourceOriginal(current, attachments, apiKey, model, controller.signal), errorKind('cancelled'));
  assert.equal(receivedSignal?.aborted, true);
  assert.deepEqual(current, source);
});

test('a request cancelled before starting never calls the API', async t => {
  const controller = new AbortController();
  controller.abort();
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('must not send a cancelled reading'); });
  await assert.rejects(readSourceOriginal(source, attachments, apiKey, model, controller.signal), errorKind('cancelled'));
});

test('applying a reviewed reading keeps the original text and notes and requires verification again', () => {
  const current = Object.freeze(structuredClone(source));
  const beforeReading = structuredClone(reading);
  const applied = applySourceReading(current, reading);
  assert.notEqual(applied, current);
  assert.equal(applied.dataExcerpt, `${source.dataExcerpt}\n\n${reading.dataExcerpt}\n\n판독 시 확인할 사항:\n- ${reading.notes[0]}`);
  assert.equal(applied.verified, false);
  assert.deepEqual({ ...applied, dataExcerpt: source.dataExcerpt, verified: true }, source);
  assert.deepEqual(current, source);
  assert.deepEqual(reading, beforeReading);
});

test('applying to empty source data adds no empty warning section and retains all notes when present', () => {
  const noNotes = applySourceReading({ ...source, dataExcerpt: ' \n ' }, { dataExcerpt: '  직접 표시된 수치: 12  ', notes: [] });
  assert.equal(noNotes.dataExcerpt, '직접 표시된 수치: 12');
  assert.equal(noNotes.verified, false);
  const withNotes = applySourceReading(source, { dataExcerpt: '새 자료', notes: ['축 단위 판독 불가', '그림의 오른쪽이 잘림'] });
  assert.ok(withNotes.dataExcerpt.endsWith('판독 시 확인할 사항:\n- 축 단위 판독 불가\n- 그림의 오른쪽이 잘림'));
});
