import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test_only_secret_value_at_least_32_chars_long";
process.env.NODE_ENV = "test";

const [
  { requireAnyRole },
  { createContractSchema, uploadBastSchema },
  { financeService },
  { financeRepository },
] = await Promise.all([
  import("../src/shared/middlewares/auth.middleware.js"),
  import("../src/features/finance/finance.schema.js"),
  import("../src/features/finance/finance.service.js"),
  import("../src/features/finance/finance.repository.js"),
]);

// ==============================================================
// AC-13 (AC-B4-1): Kontrak Proyek & Validasi Termin Tepat 100%
// ==============================================================
test("AC-B4-1: createContractSchema accepts when total percentage is exactly 100%", () => {
  const validPayload = {
    contractValue: 150_000_000,
    terms: [
      {
        title: "Termin 1 - DP 30%",
        percentage: 30,
        triggerType: "manual" as const,
      },
      {
        title: "Termin 2 - Progress 40%",
        percentage: 40,
        triggerType: "sprint" as const,
        requiredCompletedSprints: 1,
      },
      {
        title: "Termin 3 - Pelunasan 30%",
        percentage: 30,
        triggerType: "manual" as const,
      },
    ],
  };

  const parsed = createContractSchema.parse(validPayload);
  assert.equal(parsed.contractValue, 150_000_000);
  assert.equal(parsed.terms.length, 3);
});

test("AC-B4-1: createContractSchema strictly rejects when total percentage is not 100%", () => {
  // Kasus kurang dari 100% (90%)
  assert.throws(
    () =>
      createContractSchema.parse({
        contractValue: 100_000_000,
        terms: [
          { title: "Termin 1", percentage: 40, triggerType: "manual" },
          { title: "Termin 2", percentage: 50, triggerType: "manual" },
        ],
      }),
    /Total persentase seluruh termin wajib tepat 100%/
  );

  // Kasus lebih dari 100% (110%)
  assert.throws(
    () =>
      createContractSchema.parse({
        contractValue: 100_000_000,
        terms: [
          { title: "Termin 1", percentage: 50, triggerType: "manual" },
          { title: "Termin 2", percentage: 60, triggerType: "manual" },
        ],
      }),
    /Total persentase seluruh termin wajib tepat 100%/
  );
});

test("AC-B4-1: createContract absorbs rounding difference into the last term exactly", async () => {
  const originalFindProject = financeRepository.findProjectById;
  const originalFindWithTerms = financeRepository.findProjectWithTerms;
  const originalSave = financeRepository.saveContractWithTerms;
  const originalEval = financeRepository.evaluateProjectTermReadiness;
  const originalFindTerms = financeRepository.findTermsByProjectId;
  const originalLog = financeRepository.logActivity;

  let capturedTerms: any[] = [];
  try {
    financeRepository.findProjectById = async () =>
      ({ id: "proj-1", name: "Proyek Alpha", contractValue: 0 } as any);
    financeRepository.findProjectWithTerms = async () =>
      ({ id: "proj-1", paymentTerms: [] } as any);

    financeRepository.saveContractWithTerms = async (_pid, _cval, terms) => {
      capturedTerms = terms;
      return terms as any;
    };
    financeRepository.evaluateProjectTermReadiness = async () => [];
    financeRepository.findTermsByProjectId = async () => capturedTerms as any;
    financeRepository.logActivity = async () => ({} as any);

    // Nilai kontrak: Rp 100.000.000 dengan pembagian 33.33%, 33.33%, 33.34%
    const result = await financeService.createContract("proj-1", {
      contractValue: 100_000_000,
      terms: [
        { title: "Termin 1", percentage: 33.33, triggerType: "manual" },
        { title: "Termin 2", percentage: 33.33, triggerType: "manual" },
        { title: "Termin 3", percentage: 33.34, triggerType: "manual" },
      ],
    });

    assert.equal(result.contractValue, 100_000_000);
    assert.equal(capturedTerms.length, 3);

    // Termin 1: 33,330,000
    assert.equal(capturedTerms[0].amount, 33_330_000);
    // Termin 2: 33,330,000
    assert.equal(capturedTerms[1].amount, 33_330_000);
    // Termin 3 menyerap sisa: 100,000,000 - 66,660,000 = 33,340,000
    assert.equal(capturedTerms[2].amount, 33_340_000);

    const totalAllocated = capturedTerms.reduce((sum, t) => sum + t.amount, 0);
    assert.equal(totalAllocated, 100_000_000);
  } finally {
    financeRepository.findProjectById = originalFindProject;
    financeRepository.findProjectWithTerms = originalFindWithTerms;
    financeRepository.saveContractWithTerms = originalSave;
    financeRepository.evaluateProjectTermReadiness = originalEval;
    financeRepository.findTermsByProjectId = originalFindTerms;
    financeRepository.logActivity = originalLog;
  }
});

test("AC-B4-1: createContract rejects modifying contract if any term is already locked", async () => {
  const originalFindProject = financeRepository.findProjectById;
  const originalFindWithTerms = financeRepository.findProjectWithTerms;

  try {
    financeRepository.findProjectById = async () => ({ id: "proj-1" } as any);
    financeRepository.findProjectWithTerms = async () =>
      ({
        id: "proj-1",
        paymentTerms: [{ id: "t1", isLocked: true, invoiceNumber: "INV-2026-001/T1" }],
      } as any);

    await assert.rejects(
      async () =>
        financeService.createContract("proj-1", {
          contractValue: 50_000_000,
          terms: [{ title: "Full", percentage: 100, triggerType: "manual" }],
        }),
      /terdapat termin yang telah diterbitkan invoice atau terkunci/
    );
  } finally {
    financeRepository.findProjectById = originalFindProject;
    financeRepository.findProjectWithTerms = originalFindWithTerms;
  }
});

// ==============================================================
// AC-14 (AC-B4-2): Unggah BAST & Update Status ke 'ready'
// ==============================================================
test("AC-B4-2: uploadBastSchema validates file URL or Base64 data URL", () => {
  const validUrl = uploadBastSchema.parse({
    bastUrl: "https://res.cloudinary.com/demo/image/upload/bast-sample.pdf",
    bastFileName: "BAST-Termin-1.pdf",
  });
  assert.equal(validUrl.bastFileName, "BAST-Termin-1.pdf");

  assert.throws(
    () =>
      uploadBastSchema.parse({
        bastUrl: "not-a-valid-url-or-base64",
      }),
    /Bukti pembayaran harus berupa URL valid atau data image\/PDF/
  );
});

test("AC-B4-2: markTermReadyWithBast rejects if requiredCompletedSprints threshold is not met", async () => {
  const originalFindTerm = financeRepository.findTermById;
  const originalCountCompleted = financeRepository.countCompletedSprints;

  try {
    financeRepository.findTermById = async () =>
      ({
        id: "term-1",
        projectId: "proj-1",
        title: "Termin 2 - Selesai Sprint 1",
        triggerType: "sprint",
        requiredCompletedSprints: 2,
        status: "planned",
      } as any);

    financeRepository.countCompletedSprints = async () => 1;

    await assert.rejects(
      async () =>
        financeService.markTermReadyWithBast("term-1", {
          bastUrl: "https://example.com/bast.pdf",
        }),
      /membutuhkan 2 sprint selesai \(saat ini baru 1 selesai\)/
    );
  } finally {
    financeRepository.findTermById = originalFindTerm;
    financeRepository.countCompletedSprints = originalCountCompleted;
  }
});

test("AC-B4-2: markTermReadyWithBast succeeds when BAST is uploaded and updates status to ready", async () => {
  const originalFindTerm = financeRepository.findTermById;
  const originalMarkReady = financeRepository.markTermReadyAtomically;
  const originalLog = financeRepository.logActivity;

  try {
    financeRepository.findTermById = async () =>
      ({
        id: "term-1",
        projectId: "proj-1",
        title: "Termin 1 - DP",
        triggerType: "manual",
        status: "planned",
        readyAt: null,
      } as any);

    financeRepository.markTermReadyAtomically = async (_id, data) =>
      ({
        id: "term-1",
        status: "ready",
        readyAt: data.readyAt,
        bastUrl: data.bastUrl,
        bastUploadedAt: data.bastUploadedAt,
      } as any);
    financeRepository.logActivity = async () => ({} as any);

    const updated = await financeService.markTermReadyWithBast("term-1", {
      bastUrl: "https://example.com/bast-dp.pdf",
      bastFileName: "BAST-DP.pdf",
    });

    assert.equal(updated.status, "ready");
    assert.equal(updated.bastUrl, "https://example.com/bast-dp.pdf");
  } finally {
    financeRepository.findTermById = originalFindTerm;
    financeRepository.markTermReadyAtomically = originalMarkReady;
    financeRepository.logActivity = originalLog;
  }
});

// ==============================================================
// AC-15 (AC-B4-3): Penerbitan Invoice Resmi & Kunci Termin
// ==============================================================
test("AC-B4-3: issueTermInvoice rejects if term is not in 'ready' status", async () => {
  const originalFindTerm = financeRepository.findTermById;

  try {
    financeRepository.findTermById = async () =>
      ({
        id: "term-1",
        title: "Termin 1",
        status: "planned",
        isLocked: false,
      } as any);

    await assert.rejects(
      async () =>
        financeService.issueTermInvoice("term-1", {
          invoiceDueDate: "2026-12-01",
        }),
      /belum berstatus 'Siap ditagih' \(ready\)/
    );
  } finally {
    financeRepository.findTermById = originalFindTerm;
  }
});

test("AC-B4-3: issueTermInvoice generates unique INV-YYYY-NNN/Tn and locks the term", async () => {
  const originalFindTerm = financeRepository.findTermById;
  const originalIssueAtomically = financeRepository.issueInvoiceAtomically;
  const originalLog = financeRepository.logActivity;

  const currentYear = 2026;
  const expectedInvoiceNumber = `INV-${currentYear}-003/T2`;

  try {
    financeRepository.findTermById = async () =>
      ({
        id: "term-2",
        projectId: "proj-1",
        termNumber: 2,
        title: "Termin 2 - 40%",
        amount: 40_000_000,
        status: "ready",
        isLocked: false,
        invoiceNumber: null,
      } as any);

    let savedData: any = null;
    financeRepository.issueInvoiceAtomically = async (_id, year, termNumber, data) => {
      savedData = {
        ...data,
        invoiceNumber: `INV-${year}-003/T${termNumber}`,
      };
      return {
        invoiceNumber: savedData.invoiceNumber,
        updated: {
          id: "term-2",
          ...savedData,
        } as any,
      };
    };
    financeRepository.logActivity = async () => ({} as any);

    const issued = await financeService.issueTermInvoice(
      "term-2",
      {
        invoiceDueDate: "2026-12-10",
        notes: "Mohon ditransfer ke rekening BCA PT Cira Digital",
      },
      undefined,
      new Date("2026-11-10T05:00:00.000Z")
    );

    assert.equal(issued.invoiceNumber, expectedInvoiceNumber);
    assert.equal(savedData.invoiceNumber, expectedInvoiceNumber);
    assert.equal(savedData.status, "invoiced");
    assert.equal(savedData.isLocked, true);
    assert.equal(savedData.invoiceDueDate, "2026-12-10");
  } finally {
    financeRepository.findTermById = originalFindTerm;
    financeRepository.issueInvoiceAtomically = originalIssueAtomically;
    financeRepository.logActivity = originalLog;
  }
});

test("AC-B4-3: deleteTerm strictly rejects deleting a locked/invoiced term", async () => {
  const originalFindTerm = financeRepository.findTermById;

  try {
    financeRepository.findTermById = async () =>
      ({
        id: "term-locked",
        title: "Termin 1 Terkunci",
        isLocked: true,
        invoiceNumber: "INV-2026-001/T1",
      } as any);

    await assert.rejects(
      async () => financeService.deleteTerm("term-locked"),
      /Termin yang telah memiliki invoice resmi atau berstatus terkunci tidak dapat dihapus/
    );
  } finally {
    financeRepository.findTermById = originalFindTerm;
  }
});

// ==============================================================
// RBAC Protection: Owner & Operasional Only
// ==============================================================
test("RBAC: Finance endpoints allow Owner and Operasional, strictly forbid Developer (403)", () => {
  const financeRoleCheck = requireAnyRole("owner", "operasional", "ops");

  let ownerPassed = false;
  financeRoleCheck(
    { user: { id: "u1", roles: ["owner"] } } as any,
    {} as any,
    (err) => {
      assert.equal(err, undefined);
      ownerPassed = true;
    }
  );
  assert.equal(ownerPassed, true);

  let opsPassed = false;
  financeRoleCheck(
    { user: { id: "u2", roles: ["operasional"] } } as any,
    {} as any,
    (err) => {
      assert.equal(err, undefined);
      opsPassed = true;
    }
  );
  assert.equal(opsPassed, true);

  let devError: any = null;
  financeRoleCheck(
    { user: { id: "u3", roles: ["developer"] } } as any,
    {} as any,
    (err) => {
      devError = err;
    }
  );
  assert.ok(devError);
  assert.equal(devError.statusCode, 403);
});
