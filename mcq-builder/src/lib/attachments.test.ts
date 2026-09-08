import test from "node:test";
import assert from "node:assert/strict";
import { ATTACHMENT_ACCEPT, loadAttachments, releaseAttachments } from "./attachments.ts";

const pdf = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 12, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
const file = (bytes: Uint8Array, name: string, type = "") => new File([bytes], name, { type });

test("file picker accepts PDF and the supported image formats", () => {
  for (const value of [".pdf", ".png", ".jpg", ".jpeg", ".webp", "application/pdf", "image/png", "image/jpeg", "image/webp"]) {
    assert.ok(ATTACHMENT_ACCEPT.split(",").includes(value));
  }
  assert.ok(!ATTACHMENT_ACCEPT.includes("image/*"));
});

for (const [bytes, name, type, expected] of [
  [pdf, "논문.pdf", "application/pdf", "application/pdf"],
  [pdf, "논문.PDF", "", "application/pdf"],
  [png, "그림.png", "image/png", "image/png"],
  [png, "그림.PNG", "", "image/png"],
  [jpeg, "문항.jpg", "", "image/jpeg"],
  [jpeg, "문항.jpeg", "image/jpeg", "image/jpeg"],
  [jpeg, "문항.jpg", "image/jpg", "image/jpeg"],
  [webp, "그래프.webp", "image/webp", "image/webp"],
  [webp, "그래프.webp", "application/octet-stream", "image/webp"],
] as const) test(`normalizes and reads ${name} with MIME ${type || "missing"}`, async () => {
  const loaded = await loadAttachments([file(bytes, name, type)]);
  try {
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].name, name);
    assert.equal(loaded[0].mimeType, expected);
    assert.equal(loaded[0].size, bytes.length);
    assert.deepEqual(new Uint8Array(Buffer.from(loaded[0].data, "base64")), bytes);
    const preview = await fetch(loaded[0].url);
    assert.equal(preview.headers.get("content-type"), expected);
    assert.deepEqual(new Uint8Array(await preview.arrayBuffer()), bytes);
  } finally {
    releaseAttachments(loaded);
  }
});

test("reads mixed PDF and image selections in order and releases every preview", async () => {
  const loaded = await loadAttachments([file(pdf, "1.pdf"), file(png, "2.png"), file(jpeg, "3.jpg")]);
  assert.deepEqual(loaded.map(a => a.mimeType), ["application/pdf", "image/png", "image/jpeg"]);
  releaseAttachments(loaded);
  for (const attachment of loaded) await assert.rejects(fetch(attachment.url));
  releaseAttachments(loaded); // Browser URL revocation is safe to repeat.
});

test("empty selections are accepted but empty files, too many files and totals above 8MB are rejected before reading", async () => {
  assert.deepEqual(await loadAttachments([]), []);
  await assert.rejects(loadAttachments([file(new Uint8Array(), "empty.pdf")]), /빈 파일/);
  await assert.rejects(loadAttachments(Array.from({ length: 4 }, () => file(png, "image.png"))), /최대 3개/);
  const large = file(new Uint8Array(4 * 1024 * 1024 + 1), "large.png");
  Object.defineProperty(large, "arrayBuffer", { value: async () => { assert.fail("must not read over-limit files"); } });
  await assert.rejects(loadAttachments([large, large]), /8MB/);
});

test("the combined 8MB boundary is accepted", async () => {
  const bytes = new Uint8Array(4 * 1024 * 1024);
  bytes.set(png);
  const loaded = await loadAttachments([file(bytes, "a.png"), file(bytes, "b.png")]);
  assert.equal(loaded.reduce((total, attachment) => total + attachment.size, 0), 8 * 1024 * 1024);
  releaseAttachments(loaded);
});

for (const [bytes, name, type] of [
  [new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), "image.svg", "image/svg+xml"],
  [new TextEncoder().encode("<html><script>alert(1)</script></html>"), "image.png", "image/png"],
  [new TextEncoder().encode("GIF89a"), "image.gif", "image/gif"],
  [png, "image.jpg", "image/png"],
  [jpeg, "image.png", "image/png"],
  [png, "image.png", "image/gif"],
  [png, "image.svg", "image/png"],
  [new Uint8Array([0x89, 0x50]), "image.png", ""],
] as const) test(`rejects unsupported, mislabeled or invalid attachment ${name} (${type})`, async () => {
  await assert.rejects(loadAttachments([file(bytes, name, type)]), /형식|파일만 첨부할 수 있습니다/);
});

test("read failure rolls back new previews while preserving earlier attachments", async t => {
  const existing = await loadAttachments([file(pdf, "existing.pdf")]);
  const created: string[] = [];
  const revoked: string[] = [];
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  t.mock.method(URL, "createObjectURL", (blob: Blob) => { const url = create(blob); created.push(url); return url; });
  t.mock.method(URL, "revokeObjectURL", (url: string) => { revoked.push(url); revoke(url); });
  const unreadable = file(jpeg, "unreadable.jpg");
  Object.defineProperty(unreadable, "arrayBuffer", { value: async () => { throw new Error("disk failure"); } });
  try {
    await assert.rejects(loadAttachments([file(png, "new.png"), unreadable]), /파일을 읽지 못했습니다/);
    assert.equal(created.length, 1);
    assert.deepEqual(revoked, created);
    assert.equal((await fetch(existing[0].url)).status, 200);
  } finally {
    releaseAttachments(existing);
  }
});

test("invalid second file content also releases earlier previews from the same selection", async t => {
  const created: string[] = [];
  const revoked: string[] = [];
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  t.mock.method(URL, "createObjectURL", (blob: Blob) => { const url = create(blob); created.push(url); return url; });
  t.mock.method(URL, "revokeObjectURL", (url: string) => { revoked.push(url); revoke(url); });
  await assert.rejects(loadAttachments([file(pdf, "valid.pdf"), file(new TextEncoder().encode("invalid"), "invalid.png")]), /일치하지 않습니다/);
  assert.equal(created.length, 1);
  assert.deepEqual(revoked, created);
});
