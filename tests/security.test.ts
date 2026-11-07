import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test_only_secret_value_at_least_32_chars_long";
process.env.NODE_ENV = "test";

const [{ validateBrowserOrigin }, { requireAuth, requireAnyRole }, { createDesignAssetSchema }, { loginSchema }, { validateRequest }, { activityFilterQuerySchema }, { loginRateLimit }, { errorHandler }, { getAllowedOrigins }, { updatePaymentSchema }, { validateCsrf }, { changePasswordSchema }, jwtModule, { prisma }] = await Promise.all([
  import("../src/shared/middlewares/validateBrowserOrigin.js"),
  import("../src/shared/middlewares/auth.middleware.js"),
  import("../src/features/assets/assets.schema.js"),
  import("../src/features/auth/auth.schema.js"),
  import("../src/shared/middlewares/validateRequest.js"),
  import("../src/features/activity/activity.schema.js"),
  import("../src/shared/middlewares/loginRateLimit.js"),
  import("../src/shared/middlewares/errorHandler.js"),
  import("../src/config/cors.config.js"),
  import("../src/features/finance/finance.schema.js"),
  import("../src/shared/middlewares/csrf.js"),
  import("../src/features/auth/auth.schema.js").then((module) => ({ changePasswordSchema: module.changePasswordSchema })),
  import("jsonwebtoken"),
  import("../src/config/db.config.js"),
]);
const jwt = jwtModule.default;

test("mutating browser requests reject origins outside the configured allowlist", () => {
  let forwarded: unknown;
  validateBrowserOrigin(
    { method: "PATCH", get: () => "https://attacker.invalid" } as never,
    {} as never,
    (error) => { forwarded = error; }
  );
  assert.equal((forwarded as { statusCode: number }).statusCode, 403);
});

test("CSRF middleware requires a matching cookie/header token on unsafe methods", () => {
  let denied: unknown;
  validateCsrf({ method: "POST", cookies: {}, get: () => undefined } as never, {} as never, (error) => { denied = error; });
  assert.equal((denied as { statusCode: number }).statusCode, 403);
  let passed = false;
  validateCsrf({ method: "POST", cookies: { csrfToken: "a".repeat(64) }, get: () => "a".repeat(64) } as never, {} as never, (error) => { assert.equal(error, undefined); passed = true; });
  assert.equal(passed, true);
});

test("production CORS allowlist excludes localhost origins", () => {
  assert.deepEqual(getAllowedOrigins("production", "https://app.example.com"), ["https://app.example.com"]);
});

test("non-browser requests without Origin remain compatible", () => {
  let called = false;
  validateBrowserOrigin(
    { method: "PATCH", get: () => undefined } as never,
    {} as never,
    (error) => { assert.equal(error, undefined); called = true; }
  );
  assert.equal(called, true);
});

test("finance role middleware allows owner and denies developer-only accounts", () => {
  const middleware = requireAnyRole("owner", "ops");
  let denied: unknown;
  middleware({ user: { roles: ["dev"] } } as never, {} as never, (error) => { denied = error; });
  assert.equal((denied as { statusCode: number }).statusCode, 403);

  let passed = false;
  middleware({ user: { roles: ["owner", "dev"] } } as never, {} as never, (error) => {
    assert.equal(error, undefined);
    passed = true;
  });
  assert.equal(passed, true);
});

test("authentication middleware accepts a valid HS256 token and rejects forged tokens", async () => {
  const token = jwt.sign({ id: "user-1", email: "user@example.test", name: "User", roles: ["dev"] }, process.env.JWT_SECRET!, { algorithm: "HS256" });
  const request = { cookies: { token }, headers: {} };

  // Mock DB lookup agar offline test environment tidak mencoba jaringan eksternal
  (prisma.user as any).findUnique = async () => ({
    id: "user-1",
    email: "user@example.test",
    name: "User",
    roles: ["dev"],
    isActive: true,
  });

  let accepted = false;
  await requireAuth(request as never, {} as never, (error) => { assert.equal(error, undefined); accepted = true; });
  assert.equal(accepted, true);
  assert.equal((request as { user?: { id: string } }).user?.id, "user-1");

  let rejected: unknown;
  await requireAuth({ cookies: { token: `${token}forged` }, headers: {} } as never, {} as never, (error) => { rejected = error; });
  assert.equal((rejected as { statusCode: number }).statusCode, 401);
});

test("asset upload validation rejects SVG, mismatched MIME, and oversized data URLs", () => {
  const base = {
    name: "asset.png", originalSize: 10, compressedSize: 8, compressionRatio: 20,
    dataUrl: "data:image/png;base64,aGVsbG8=", mimeType: "image/png",
  };
  assert.equal(createDesignAssetSchema.safeParse(base).success, true);
  assert.equal(createDesignAssetSchema.safeParse({ ...base, mimeType: "image/jpeg" }).success, false);
  assert.equal(createDesignAssetSchema.safeParse({ ...base, dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }).success, false);
  assert.equal(createDesignAssetSchema.safeParse({ ...base, dataUrl: `data:image/png;base64,${"a".repeat(2_600_000)}` }).success, false);
});

test("payment proof validation preserves image/PDF data URLs and rejects active URL schemes", () => {
  assert.equal(updatePaymentSchema.safeParse({ proofUrl: "data:application/pdf;base64,JVBERi0=" }).success, true);
  assert.equal(updatePaymentSchema.safeParse({ proofUrl: "data:image/svg+xml;base64,PHN2Zz4=" }).success, true);
  assert.equal(updatePaymentSchema.safeParse({ proofUrl: "javascript:alert(1)" }).success, false);
  assert.equal(updatePaymentSchema.safeParse({ proofUrl: `data:application/pdf;base64,${"a".repeat(6_000_001)}` }).success, false);
});

test("login schema rejects passwords exceeding bcrypt's safe input length", () => {
  assert.equal(loginSchema.safeParse({ email: "a@b.com", password: "123456" }).success, true);
  assert.equal(loginSchema.safeParse({ email: "a@b.com", password: "é".repeat(37) }).success, false);
});

test("new password requires a longer passphrase while preserving bcrypt's byte limit", () => {
  assert.equal(changePasswordSchema.safeParse({ oldPassword: "oldpass", newPassword: "long-enough-pass", }).success, true);
  assert.equal(changePasswordSchema.safeParse({ oldPassword: "oldpass", newPassword: "short" }).success, false);
});

test("query validation stores coerced values without assigning Express 5's getter-only req.query", () => {
  const request = Object.create(null);
  Object.defineProperty(request, "query", { get: () => ({ limit: "20" }) });
  const response = { locals: {} };
  let forwarded: unknown;
  validateRequest({ query: activityFilterQuerySchema })(request as never, response as never, (error) => { forwarded = error; });
  assert.equal(forwarded, undefined);
  assert.equal(response.locals.validatedQuery.limit, 20);
});

test("login rate limiter allows ten attempts and rejects the next request from the same IP", () => {
  let denied: unknown;
  for (let i = 0; i < 11; i += 1) {
    loginRateLimit({ ip: "198.51.100.12", socket: {} } as never, {} as never, (error) => { denied = error; });
  }
  assert.equal((denied as { statusCode: number }).statusCode, 429);
});

test("unexpected server errors return generic data without stack traces", () => {
  const response = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  errorHandler(new Error("sensitive internal detail"), {} as never, response as never, (() => {}) as never);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    success: false,
    message: "Terjadi kesalahan internal pada server.",
    error: undefined,
  });
});
