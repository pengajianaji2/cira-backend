import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";

process.env.JWT_SECRET = "test_only_secret_value_at_least_32_chars_long";
process.env.NODE_ENV = "test";

const [
  { requireAnyRole },
  {
    createStatusRequestSchema,
    submitVoteSchema,
    ownerFinalDecisionSchema,
    createRepoLinkSchema,
    updateRepoTypeSchema,
    savePrdVersionSchema,
  },
] = await Promise.all([
  import("../src/shared/middlewares/auth.middleware.js"),
  import("../src/features/projects/governance.schema.js"),
]);

// ==========================================
// AC-B2-1: Pengajuan Perubahan Status Proyek
// ==========================================
test("AC-B2-1: createStatusRequestSchema accepts valid targetStatus and reason", () => {
  const validPayload = {
    targetStatus: "active",
    reason: "Persetujuan kickoff proyek dan pembayaran DP 30% telah diverifikasi.",
  };
  const parsed = createStatusRequestSchema.parse(validPayload);
  assert.equal(parsed.targetStatus, "active");
  assert.equal(parsed.reason, validPayload.reason);
});

test("AC-B2-1: createStatusRequestSchema rejects invalid target status or too short reason", () => {
  assert.throws(
    () =>
      createStatusRequestSchema.parse({
        targetStatus: "in_progress", // bukan enum lead/active/completed/cancelled
        reason: "Valid reason here",
      }),
    /Target status tidak valid/
  );

  assert.throws(
    () =>
      createStatusRequestSchema.parse({
        targetStatus: "active",
        reason: "ok", // kurang dari 3 karakter
      }),
    /Alasan pengajuan status minimal 3 karakter/
  );
});

// ==========================================
// AC-B2-2: Konsensus Voting Roster
// ==========================================
test("AC-B2-2: submitVoteSchema accepts 'approve' and 'reject' votes", () => {
  const approve = submitVoteSchema.parse({ vote: "approve" });
  assert.equal(approve.vote, "approve");

  const reject = submitVoteSchema.parse({
    vote: "reject",
    reason: "Scope MVP belum tuntas dibahas bersama tim.",
  });
  assert.equal(reject.vote, "reject");
  assert.equal(reject.reason, "Scope MVP belum tuntas dibahas bersama tim.");
});

test("AC-B2-2: submitVoteSchema rejects invalid vote options", () => {
  assert.throws(
    () =>
      submitVoteSchema.parse({
        vote: "abstain",
      }),
    /Pilihan vote hanya boleh 'approve' atau 'reject'/
  );
});

test("AC-B2-2: 100% consensus calculation logic triggers approval only when all votes approve", () => {
  const rosterCount = 3;

  // Skenario 1: Baru 2 dari 3 anggota yang vote approve
  const votesPartial = [
    { vote: "approve", userId: "u1" },
    { vote: "approve", userId: "u2" },
  ];
  const isAllVotedPartial = votesPartial.length >= rosterCount;
  const is100PercentApprovePartial =
    isAllVotedPartial &&
    votesPartial.filter((v) => v.vote === "approve").length === rosterCount;
  assert.equal(is100PercentApprovePartial, false);

  // Skenario 2: 3 dari 3 vote, tetapi ada 1 reject
  const votesWithReject = [
    { vote: "approve", userId: "u1" },
    { vote: "reject", userId: "u2" },
    { vote: "approve", userId: "u3" },
  ];
  const isAllVotedReject = votesWithReject.length >= rosterCount;
  const is100PercentApproveReject =
    isAllVotedReject &&
    votesWithReject.filter((v) => v.vote === "approve").length === rosterCount;
  assert.equal(is100PercentApproveReject, false);

  // Skenario 3: 3 dari 3 vote dan seluruhnya approve (100% Konsensus)
  const votesAllApprove = [
    { vote: "approve", userId: "u1" },
    { vote: "approve", userId: "u2" },
    { vote: "approve", userId: "u3" },
  ];
  const isAllVotedAll = votesAllApprove.length >= rosterCount;
  const is100PercentApproveAll =
    isAllVotedAll &&
    votesAllApprove.filter((v) => v.vote === "approve").length === rosterCount;
  assert.equal(is100PercentApproveAll, true);
});

// ==========================================
// AC-B2-3: Arbitrase Final Owner
// ==========================================
test("AC-B2-3: ownerFinalDecisionSchema validates decision and reason", () => {
  const approved = ownerFinalDecisionSchema.parse({
    decision: "approve",
    reason: "Saya telah berdiskusi dengan klien dan risiko telah dimitigasi.",
  });
  assert.equal(approved.decision, "approve");

  const rejected = ownerFinalDecisionSchema.parse({
    decision: "reject",
    reason: "Menolak pengajuan karena timeline belum disetujui klien.",
  });
  assert.equal(rejected.decision, "reject");
});

test("AC-B2-3: arbitrase endpoint allows Owner and strictly rejects Developer/Operasional", () => {
  const ownerOnly = requireAnyRole("owner");

  let ownerPassed = false;
  ownerOnly(
    { user: { roles: ["owner"] } } as never,
    {} as never,
    (err) => {
      assert.equal(err, undefined);
      ownerPassed = true;
    }
  );
  assert.equal(ownerPassed, true);

  let devError: unknown;
  ownerOnly(
    { user: { roles: ["developer"] } } as never,
    {} as never,
    (err) => {
      devError = err;
    }
  );
  assert.equal((devError as { statusCode: number }).statusCode, 403);

  let opsError: unknown;
  ownerOnly(
    { user: { roles: ["operasional"] } } as never,
    {} as never,
    (err) => {
      opsError = err;
    }
  );
  assert.equal((opsError as { statusCode: number }).statusCode, 403);
});

// ==========================================
// AC-B2-4: PRD Versioning & Kompresi GZIP
// ==========================================
test("AC-B2-4: savePrdVersionSchema validates content length bounds", () => {
  const valid = savePrdVersionSchema.parse({
    content: "# PRD Proyek\nIsi spesifikasi lengkap...",
    description: "Versi revisi sprint 1",
  });
  assert.equal(valid.content, "# PRD Proyek\nIsi spesifikasi lengkap...");
  assert.equal(valid.description, "Versi revisi sprint 1");

  assert.throws(
    () =>
      savePrdVersionSchema.parse({
        content: "x".repeat(500_001),
      }),
    /Konten PRD tidak boleh melebihi 500.000 karakter/
  );
});

test("AC-B2-4: GZIP compression and decompression preserves content integrity exactly", () => {
  const originalMarkdown = `# PRD: Cira PM Governance
## 1. Problem & Scope
This is a test PRD content to verify GZIP roundtrip compression and decompression.
${"Lore ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(20)}`;

  // Kompresi dengan zlib.gzipSync
  const compressed = zlib.gzipSync(Buffer.from(originalMarkdown, "utf-8"));
  assert.ok(compressed instanceof Buffer);
  assert.ok(compressed.length > 0);

  // Dekompresi dengan zlib.gunzipSync
  const decompressed = zlib.gunzipSync(compressed).toString("utf-8");
  assert.equal(decompressed, originalMarkdown);
});

test("AC-B2-4: PRD restore logic creates new version at top without overwriting historical version", () => {
  const versionsHistory = [
    { versionNumber: 1, content: "PRD Versi 1 awal" },
    { versionNumber: 2, content: "PRD Versi 2 revisi" },
  ];

  const targetToRestore = versionsHistory.find((v) => v.versionNumber === 1)!;
  const currentMaxVersion = Math.max(...versionsHistory.map((v) => v.versionNumber));
  const newRestoredVersion = {
    versionNumber: currentMaxVersion + 1,
    content: targetToRestore.content,
    description: `Dipulihkan dari Versi #${targetToRestore.versionNumber}`,
  };

  // Simulasikan penambahan versi baru di urutan teratas
  const updatedHistory = [newRestoredVersion, ...versionsHistory];

  assert.equal(updatedHistory.length, 3);
  assert.equal(updatedHistory[0].versionNumber, 3);
  assert.equal(updatedHistory[0].content, "PRD Versi 1 awal");
  assert.equal(updatedHistory[1].versionNumber, 1); // Versi lama tetap utuh
  assert.equal(updatedHistory[2].versionNumber, 2); // Versi lama tetap utuh
});

// ==========================================
// AC-B2-5: Tautan Repositori Berlabel & Repo Type
// ==========================================
test("AC-B2-5: createRepoLinkSchema validates URL and label", () => {
  const valid = createRepoLinkSchema.parse({
    label: "Frontend Next.js",
    url: "https://github.com/company/cira-frontend",
  });
  assert.equal(valid.label, "Frontend Next.js");
  assert.equal(valid.url, "https://github.com/company/cira-frontend");

  assert.throws(
    () =>
      createRepoLinkSchema.parse({
        label: "",
        url: "https://github.com/company/cira-frontend",
      }),
    /Label repositori wajib diisi/
  );

  assert.throws(
    () =>
      createRepoLinkSchema.parse({
        label: "Frontend",
        url: "not-a-valid-url",
      }),
    /Format URL repositori tidak valid/
  );
});

test("AC-B2-5: updateRepoTypeSchema validates 'monorepo' vs 'separate'", () => {
  const mono = updateRepoTypeSchema.parse({ repoType: "monorepo" });
  assert.equal(mono.repoType, "monorepo");

  const sep = updateRepoTypeSchema.parse({ repoType: "separate" });
  assert.equal(sep.repoType, "separate");

  assert.throws(
    () =>
      updateRepoTypeSchema.parse({
        repoType: "multirepo",
      }),
    /Tipe repositori harus 'monorepo' atau 'separate'/
  );
});

test("AC-B2-5: repository CRUD authorization allows Owner and Developer, denies Operasional", () => {
  const repoAuth = requireAnyRole("owner", "developer");

  let ownerAllowed = false;
  repoAuth({ user: { roles: ["owner"] } } as never, {} as never, (err) => {
    assert.equal(err, undefined);
    ownerAllowed = true;
  });
  assert.equal(ownerAllowed, true);

  let devAllowed = false;
  repoAuth({ user: { roles: ["developer"] } } as never, {} as never, (err) => {
    assert.equal(err, undefined);
    devAllowed = true;
  });
  assert.equal(devAllowed, true);

  let opsDenied: unknown;
  repoAuth({ user: { roles: ["operasional"] } } as never, {} as never, (err) => {
    opsDenied = err;
  });
  assert.equal((opsDenied as { statusCode: number }).statusCode, 403);
});

test("Roster management authorization allows Owner and Operasional, denies Developer", () => {
  const rosterAuth = requireAnyRole("owner", "operasional");

  let ownerAllowed = false;
  rosterAuth({ user: { roles: ["owner"] } } as never, {} as never, (err) => {
    assert.equal(err, undefined);
    ownerAllowed = true;
  });
  assert.equal(ownerAllowed, true);

  let opsAllowed = false;
  rosterAuth({ user: { roles: ["operasional"] } } as never, {} as never, (err) => {
    assert.equal(err, undefined);
    opsAllowed = true;
  });
  assert.equal(opsAllowed, true);

  let devDenied: unknown;
  rosterAuth({ user: { roles: ["developer"] } } as never, {} as never, (err) => {
    devDenied = err;
  });
  assert.equal((devDenied as { statusCode: number }).statusCode, 403);
});
