import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test_only_secret_value_at_least_32_chars_long";
process.env.NODE_ENV = "test";

const [
  { profileSchema },
  { authRepository },
  { authService },
  { ConflictError },
] = await Promise.all([
  import("../src/features/auth/auth.schema.js"),
  import("../src/features/auth/auth.repository.js"),
  import("../src/features/auth/auth.service.js"),
  import("../src/shared/errors/AppError.js"),
]);

// ==========================================
// AC-3: Data Profil Akun (Nama, Email, WhatsApp, Instagram)
// ==========================================

test("AC-3: authService.getMe mengembalikan nama, email, whatsapp, dan instagram sesuai data akun", async (t) => {
  const originalFindById = authRepository.findById;
  t.after(() => {
    authRepository.findById = originalFindById;
  });

  authRepository.findById = (async (id: string) => {
    if (id === "u-with-contacts") {
      return {
        id: "u-with-contacts",
        name: "Rani Putri",
        email: "rani@cira.id",
        roles: ["operasional"],
        whatsapp: "+6281234567890",
        instagram: "rani.putri",
        isActive: true,
        isPrimaryOwner: false,
        avatarUrl: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      };
    }

    return {
      id: "u-empty-contacts",
      name: "Budi Santoso",
      email: "budi@cira.id",
      roles: ["developer"],
      whatsapp: null,
      instagram: null,
      isActive: true,
      isPrimaryOwner: false,
      avatarUrl: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    };
  }) as unknown as typeof authRepository.findById;

  const filled = await authService.getMe("u-with-contacts");
  assert.equal(filled.name, "Rani Putri");
  assert.equal(filled.email, "rani@cira.id");
  assert.equal(filled.whatsapp, "+6281234567890");
  assert.equal(filled.instagram, "rani.putri");

  const empty = await authService.getMe("u-empty-contacts");
  assert.equal(empty.name, "Budi Santoso");
  assert.equal(empty.email, "budi@cira.id");
  assert.equal(empty.whatsapp, null);
  assert.equal(empty.instagram, null);
});

// ==========================================
// AC-4: Pembaruan WhatsApp & Instagram Valid, Clear, & Direktori Tim
// ==========================================

test("AC-4: profileSchema & authService.updateProfile menyimpan kontak valid, menormalkan kosong ke null, dan langsung tampil di Direktori Tim", async (t) => {
  const originalFindByEmail = authRepository.findByEmail;
  const originalUpdateProfile = authRepository.updateProfile;
  const originalGetDirectoryUsers = authRepository.getDirectoryUsers;

  t.after(() => {
    authRepository.findByEmail = originalFindByEmail;
    authRepository.updateProfile = originalUpdateProfile;
    authRepository.getDirectoryUsers = originalGetDirectoryUsers;
  });

  const dbUser = {
    id: "u-1",
    name: "Budi Santoso",
    email: "budi@cira.id",
    roles: ["developer"],
    whatsapp: null as string | null,
    instagram: null as string | null,
    isActive: true,
    isPrimaryOwner: false,
    avatarUrl: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };

  authRepository.findByEmail = (async (email: string) =>
    email === dbUser.email ? dbUser : null) as unknown as typeof authRepository.findByEmail;

  authRepository.updateProfile = (async (_id, data) => {
    dbUser.name = data.name;
    dbUser.email = data.email;
    if (data.whatsapp !== undefined) dbUser.whatsapp = data.whatsapp;
    if (data.instagram !== undefined) dbUser.instagram = data.instagram;
    dbUser.updatedAt = new Date("2026-02-01T00:00:00Z");
    return dbUser;
  }) as unknown as typeof authRepository.updateProfile;

  authRepository.getDirectoryUsers = (async () => [
    {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      whatsapp: dbUser.whatsapp,
      instagram: dbUser.instagram,
      roles: dbUser.roles,
      isActive: dbUser.isActive,
      isPrimaryOwner: dbUser.isPrimaryOwner,
      avatarUrl: dbUser.avatarUrl,
      createdAt: dbUser.createdAt,
    },
  ]) as unknown as typeof authRepository.getDirectoryUsers;

  // 1. Update WA & IG valid dengan whitespace tepi
  const parsedValid = profileSchema.parse({
    name: "  Budi Santoso  ",
    email: "  BUDI@CIRA.ID ",
    whatsapp: " +6281234567890 ",
    instagram: " budi.dev_01 ",
  });
  assert.equal(parsedValid.whatsapp, "+6281234567890");
  assert.equal(parsedValid.instagram, "budi.dev_01");

  const updated = await authService.updateProfile("u-1", parsedValid);
  assert.equal(updated.name, "Budi Santoso");
  assert.equal(updated.email, "budi@cira.id");
  assert.equal(updated.whatsapp, "+6281234567890");
  assert.equal(updated.instagram, "budi.dev_01");

  const directoryAfterSave = await authService.getDirectory();
  assert.equal(directoryAfterSave[0].whatsapp, "+6281234567890");
  assert.equal(directoryAfterSave[0].instagram, "budi.dev_01");

  // 2. Kosongkan instagram ("") sementara whatsapp tetap valid
  const parsedCleared = profileSchema.parse({
    name: "Budi Santoso",
    email: "budi@cira.id",
    whatsapp: "+6281234567890",
    instagram: "",
  });
  assert.equal(parsedCleared.instagram, null);

  const clearedResult = await authService.updateProfile("u-1", parsedCleared);
  assert.equal(clearedResult.whatsapp, "+6281234567890");
  assert.equal(clearedResult.instagram, null);

  const directoryAfterClear = await authService.getDirectory();
  assert.equal(directoryAfterClear[0].instagram, null);
});

// ==========================================
// AC-4: Penolakan Format Salah & Bentrok Email
// ==========================================

test("AC-4: profileSchema & authService.updateProfile menolak format WA/IG salah dengan pesan jelas serta menolak bentrok email", async (t) => {
  const originalFindByEmail = authRepository.findByEmail;
  const originalUpdateProfile = authRepository.updateProfile;

  t.after(() => {
    authRepository.findByEmail = originalFindByEmail;
    authRepository.updateProfile = originalUpdateProfile;
  });

  // Format WhatsApp lokal (diawali 0) ditolak
  const localWa = profileSchema.safeParse({
    name: "Budi Santoso",
    email: "budi@cira.id",
    whatsapp: "081234567890",
    instagram: "budi_dev",
  });
  assert.equal(localWa.success, false);
  if (!localWa.success) {
    assert.equal(localWa.error.issues[0].path[0], "whatsapp");
    assert.match(localWa.error.issues[0].message, /WhatsApp/i);
  }

  // Format Instagram berawalan '@' atau URL ditolak
  const atIg = profileSchema.safeParse({
    name: "Budi Santoso",
    email: "budi@cira.id",
    whatsapp: "+6281234567890",
    instagram: "@budi_dev",
  });
  assert.equal(atIg.success, false);
  if (!atIg.success) {
    assert.equal(atIg.error.issues[0].path[0], "instagram");
    assert.match(atIg.error.issues[0].message, /Instagram/i);
  }

  const urlIg = profileSchema.safeParse({
    name: "Budi Santoso",
    email: "budi@cira.id",
    whatsapp: "+6281234567890",
    instagram: "https://instagram.com/budi_dev",
  });
  assert.equal(urlIg.success, false);
  if (!urlIg.success) {
    assert.equal(urlIg.error.issues[0].path[0], "instagram");
  }

  // Konflik email ditolak tanpa memanggil updateProfile
  let updateCalled = false;
  authRepository.findByEmail = (async () => ({
    id: "other-user",
    email: "taken@cira.id",
  })) as unknown as typeof authRepository.findByEmail;
  authRepository.updateProfile = (async () => {
    updateCalled = true;
    throw new Error("Should not update on email conflict");
  }) as unknown as typeof authRepository.updateProfile;

  await assert.rejects(
    () =>
      authService.updateProfile("u-1", {
        name: "Budi Santoso",
        email: "taken@cira.id",
        whatsapp: "+6281234567890",
        instagram: "budi_dev",
      }),
    (err: unknown) => err instanceof ConflictError,
  );
  assert.equal(updateCalled, false);
});
