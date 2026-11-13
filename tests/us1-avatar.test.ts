import test from "node:test";
import assert from "node:assert/strict";
process.env.JWT_SECRET = "test_only_secret_value_at_least_32_chars_long";
process.env.NODE_ENV = "test";
const [{ avatarSchema }, { withResolvedUserAvatar, verifySignature, safeFilename }] = await Promise.all([
  import("../src/features/auth/auth.schema.js"),
  import("../src/features/files/fileSecurity.js"),
]);
test("avatar endpoint only accepts a private upload-session ID", () => {
  assert.equal(avatarSchema.safeParse({ uploadSessionId: "11111111-1111-4111-8111-111111111111" }).success, true);
  assert.equal(avatarSchema.safeParse({ dataUrl: "data:image/png;base64,aGVsbG8=" }).success, false);
  assert.equal(avatarSchema.safeParse({ uploadSessionId: "https://public.invalid/avatar.png" }).success, false);
});
test("user avatar is exposed through the authenticated file proxy", () => {
  assert.equal(withResolvedUserAvatar(null), null);
  assert.equal(withResolvedUserAvatar({ id: "u1", avatarFileId: null })?.avatarUrl, null);
  assert.equal(withResolvedUserAvatar({ id: "u1", avatarFileId: "file-1" })?.avatarUrl, "/api/v1/files/file-1");
});
test("file signature and sanitized filename helpers reject unsafe content", () => {
  assert.throws(() => verifySignature(Buffer.from("not png"), "image/png"));
  assert.doesNotThrow(() => verifySignature(Buffer.from([137,80,78,71,13,10,26,10]), "image/png"));
  assert.equal(safeFilename("../avatar.png").includes(".."), false);
});
