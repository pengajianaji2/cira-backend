import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test_only_secret_value_at_least_32_chars_long";
process.env.NODE_ENV = "test";

const [
  { prisma },
  { policiesService },
  { requirePermission },
  { getBusinessDateWib, isInvoiceOverdue, isValidDateOnly },
  {
    createContractSchema,
    updateTermSchema,
    markTermReadySchema,
    issueInvoiceSchema,
  },
  { financeRepository, evaluateProjectTermReadinessInTx },
  { financeService },
  { sprintsRepository },
] = await Promise.all([
  import("../src/config/db.config.js"),
  import("../src/features/auth/policies.service.js"),
  import("../src/shared/middlewares/auth.middleware.js"),
  import("../src/shared/utils/businessDate.js"),
  import("../src/features/finance/finance.schema.js"),
  import("../src/features/finance/finance.repository.js"),
  import("../src/features/finance/finance.service.js"),
  import("../src/features/sprints/sprints.repository.js"),
]);

// =========================================================================
// Helper In-Memory Fake Prisma Transaction untuk pengujian atomik & idempotent
// =========================================================================
interface InMemoryTerm {
  id: string;
  projectId: string;
  termNumber: number;
  title: string;
  percentage: number;
  amount: number;
  triggerType: "date" | "sprint" | "manual";
  triggerDate: string | null;
  requiredCompletedSprints: number | null;
  triggerSprintId: string | null;
  dueDate: string | null;
  status: "planned" | "ready" | "invoiced" | "paid";
  readyAt: Date | null;
  invoiceNumber: string | null;
  invoiceIssuedAt: Date | null;
  invoiceDueDate: string | null;
  paidAt: Date | null;
  isLocked: boolean;
}

function createFakeTx(state: {
  sprints: Array<{ id: string; projectId: string; name: string; status: string; tasks?: any[] }>;
  terms: InMemoryTerm[];
  activityLogs: any[];
  projects?: Array<{ id: string; progress: number }>;
  tasks?: Array<{ id: string; sprintId: string | null }>;
}) {
  return {
    $queryRaw: async () => [],
    sprint: {
      count: async ({ where }: any) => {
        return state.sprints.filter((s) => {
          if (where?.projectId && s.projectId !== where.projectId) return false;
          if (where?.status && s.status !== where.status) return false;
          return true;
        }).length;
      },
      findUnique: async ({ where }: any) => {
        const found = state.sprints.find((s) => s.id === where.id);
        return found ? { ...found, tasks: found.tasks ?? [] } : null;
      },
      update: async ({ where, data }: any) => {
        const found = state.sprints.find((s) => s.id === where.id);
        if (!found) return null;
        Object.assign(found, data);
        return found;
      },
    },
    task: {
      update: async ({ where, data }: any) => {
        const found = state.tasks?.find((t) => t.id === where.id);
        if (found) Object.assign(found, data);
        return found;
      },
    },
    project: {
      update: async ({ where, data }: any) => {
        const found = state.projects?.find((p) => p.id === where.id);
        if (found) Object.assign(found, data);
        return found;
      },
    },
    paymentTerm: {
      findMany: async ({ where }: any) => {
        return state.terms.filter((t) => {
          if (where?.projectId && t.projectId !== where.projectId) return false;
          if (where?.status && t.status !== where.status) return false;
          if (Array.isArray(where?.OR)) {
            return where.OR.some((branch: any) => {
              if (branch.triggerType !== t.triggerType) return false;
              if (branch.triggerDate) {
                if (branch.triggerDate.not === null && t.triggerDate === null) return false;
                if (branch.triggerDate.lte !== undefined && (t.triggerDate === null || t.triggerDate > branch.triggerDate.lte)) {
                  return false;
                }
              }
              if (branch.requiredCompletedSprints) {
                if (branch.requiredCompletedSprints.not === null && t.requiredCompletedSprints === null) {
                  return false;
                }
                if (
                  branch.requiredCompletedSprints.lte !== undefined &&
                  (t.requiredCompletedSprints === null || t.requiredCompletedSprints > branch.requiredCompletedSprints.lte)
                ) {
                  return false;
                }
              }
              return true;
            });
          }
          return true;
        });
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const t of state.terms) {
          if (where?.id && t.id !== where.id) continue;
          if (where?.status && t.status !== where.status) continue;
          if (where?.readyAt === null && t.readyAt !== null) continue;
          Object.assign(t, data);
          count += 1;
        }
        return { count };
      },
    },
    activityLog: {
      create: async ({ data }: any) => {
        state.activityLogs.push(data);
        return data;
      },
    },
  } as any;
}

// =========================================================================
// US-3 / AC-3.1: Pemicu Tunggal Valid (`date` | `sprint` | `manual`)
// =========================================================================
test("US-3 / AC-3.1: createContractSchema menerima tepat satu pemicu valid dan menolak field pemicu campuran", () => {
  const valid = createContractSchema.safeParse({
    contractValue: 100_000_000,
    terms: [
      { title: "Termin 1 - Manual", percentage: 20, triggerType: "manual" },
      {
        title: "Termin 2 - Sprint Threshold",
        percentage: 40,
        triggerType: "sprint",
        requiredCompletedSprints: 2,
      },
      {
        title: "Termin 3 - Tanggal WIB",
        percentage: 40,
        triggerType: "date",
        triggerDate: "2026-12-15",
      },
    ],
  });
  assert.equal(valid.success, true);

  // Tolak date tanpa triggerDate
  const missingDate = createContractSchema.safeParse({
    contractValue: 10_000_000,
    terms: [{ title: "Termin Date", percentage: 100, triggerType: "date" }],
  });
  assert.equal(missingDate.success, false);

  // Tolak sprint tanpa requiredCompletedSprints atau nilai <= 0 / desimal
  assert.equal(
    createContractSchema.safeParse({
      contractValue: 10_000_000,
      terms: [{ title: "Termin Sprint", percentage: 100, triggerType: "sprint" }],
    }).success,
    false
  );
  assert.equal(
    createContractSchema.safeParse({
      contractValue: 10_000_000,
      terms: [
        {
          title: "Termin Sprint 0",
          percentage: 100,
          triggerType: "sprint",
          requiredCompletedSprints: 0,
        },
      ],
    }).success,
    false
  );
  assert.equal(
    createContractSchema.safeParse({
      contractValue: 10_000_000,
      terms: [
        {
          title: "Termin Sprint Desimal",
          percentage: 100,
          triggerType: "sprint",
          requiredCompletedSprints: 1.5,
        },
      ],
    }).success,
    false
  );

  // Tolak mencampur field pemicu (date + requiredCompletedSprints, atau manual + triggerDate)
  assert.equal(
    createContractSchema.safeParse({
      contractValue: 10_000_000,
      terms: [
        {
          title: "Termin Campur Date+Sprint",
          percentage: 100,
          triggerType: "date",
          triggerDate: "2026-12-01",
          requiredCompletedSprints: 1,
        },
      ],
    }).success,
    false
  );
  assert.equal(
    createContractSchema.safeParse({
      contractValue: 10_000_000,
      terms: [
        {
          title: "Termin Manual Dengan Tanggal",
          percentage: 100,
          triggerType: "manual",
          triggerDate: "2026-12-01",
        },
      ],
    }).success,
    false
  );

  // Tolak tanggal kalender palsu (2026-02-30)
  assert.equal(isValidDateOnly("2026-02-30"), false);
  assert.equal(
    createContractSchema.safeParse({
      contractValue: 10_000_000,
      terms: [
        {
          title: "Termin Tanggal Palsu",
          percentage: 100,
          triggerType: "date",
          triggerDate: "2026-02-30",
        },
      ],
    }).success,
    false
  );
});

test("US-3 / AC-3.1: updateTermSchema & updateTerm service menolak perubahan pemicu setelah status ready/invoiced atau field campuran", async () => {
  assert.equal(
    updateTermSchema.safeParse({
      triggerType: "sprint",
      requiredCompletedSprints: 3,
      triggerDate: "2026-12-01",
    }).success,
    false
  );

  const originalFindTerm = financeRepository.findTermById;
  try {
    financeRepository.findTermById = async () =>
      ({
        id: "term-ready",
        projectId: "proj-1",
        termNumber: 1,
        title: "Termin Ready",
        triggerType: "manual",
        status: "ready",
        isLocked: false,
      } as any);

    await assert.rejects(
      async () =>
        financeService.updateTerm("term-ready", {
          triggerType: "sprint",
          requiredCompletedSprints: 1,
        }),
      /tidak dapat diubah setelah berstatus 'ready'/
    );
  } finally {
    financeRepository.findTermById = originalFindTerm;
  }
});

// =========================================================================
// US-3 / AC-3.2: Evaluasi Kesiapan Idempotent & Timezone WIB (Asia/Jakarta)
// =========================================================================
test("US-3 / AC-3.2: evaluateProjectTermReadinessInTx mengevaluasi pemicu tanggal (WIB) & sprint secara idempotent tanpa menerbitkan invoice", async () => {
  // 2026-11-09T17:05:00Z = 2026-11-10 00:05 WIB (Asia/Jakarta)
  const wibMidnightBoundary = new Date("2026-11-09T17:05:00.000Z");
  assert.equal(getBusinessDateWib(wibMidnightBoundary), "2026-11-10");

  // 2026-11-09T16:55:00Z = 2026-11-09 23:55 WIB (belum tanggal 10 WIB)
  const beforeWibMidnight = new Date("2026-11-09T16:55:00.000Z");
  assert.equal(getBusinessDateWib(beforeWibMidnight), "2026-11-09");

  const state = {
    sprints: [
      { id: "s1", projectId: "proj-1", name: "Sprint 1", status: "completed" },
      { id: "s2", projectId: "proj-1", name: "Sprint 2", status: "completed" },
      { id: "s3", projectId: "proj-1", name: "Sprint 3", status: "active" },
    ],
    terms: [
      {
        id: "t-date",
        projectId: "proj-1",
        termNumber: 1,
        title: "Termin Tanggal 10 Nov",
        percentage: 30,
        amount: 30_000_000,
        triggerType: "date" as const,
        triggerDate: "2026-11-10",
        requiredCompletedSprints: null,
        triggerSprintId: null,
        dueDate: null,
        status: "planned" as const,
        readyAt: null,
        invoiceNumber: null,
        invoiceIssuedAt: null,
        invoiceDueDate: null,
        paidAt: null,
        isLocked: false,
      },
      {
        id: "t-sprint-met",
        projectId: "proj-1",
        termNumber: 2,
        title: "Termin 2 Sprint",
        percentage: 40,
        amount: 40_000_000,
        triggerType: "sprint" as const,
        triggerDate: null,
        requiredCompletedSprints: 2,
        triggerSprintId: null,
        dueDate: null,
        status: "planned" as const,
        readyAt: null,
        invoiceNumber: null,
        invoiceIssuedAt: null,
        invoiceDueDate: null,
        paidAt: null,
        isLocked: false,
      },
      {
        id: "t-sprint-unmet",
        projectId: "proj-1",
        termNumber: 3,
        title: "Termin 3 Sprint",
        percentage: 20,
        amount: 20_000_000,
        triggerType: "sprint" as const,
        triggerDate: null,
        requiredCompletedSprints: 3,
        triggerSprintId: null,
        dueDate: null,
        status: "planned" as const,
        readyAt: null,
        invoiceNumber: null,
        invoiceIssuedAt: null,
        invoiceDueDate: null,
        paidAt: null,
        isLocked: false,
      },
      {
        id: "t-manual",
        projectId: "proj-1",
        termNumber: 4,
        title: "Termin Manual",
        percentage: 10,
        amount: 10_000_000,
        triggerType: "manual" as const,
        triggerDate: null,
        requiredCompletedSprints: null,
        triggerSprintId: null,
        dueDate: null,
        status: "planned" as const,
        readyAt: null,
        invoiceNumber: null,
        invoiceIssuedAt: null,
        invoiceDueDate: null,
        paidAt: null,
        isLocked: false,
      },
    ],
    activityLogs: [] as any[],
  };

  const tx = createFakeTx(state);

  // 1. Sebelum tengah malam WIB: hanya termin 2 sprint terpenuhi; t-date tetap planned!
  const firstRun = await evaluateProjectTermReadinessInTx(tx, "proj-1", beforeWibMidnight, {
    id: "user-1",
    name: "Owner",
    role: "owner",
  });
  assert.deepEqual(firstRun, ["t-sprint-met"]);
  assert.equal(state.terms[0].status, "planned");
  assert.equal(state.terms[1].status, "ready");
  assert.equal(state.terms[1].readyAt?.toISOString(), beforeWibMidnight.toISOString());
  assert.equal(state.terms[1].invoiceNumber, null);
  assert.equal(state.activityLogs.length, 1);

  // 2. Setelah 00:05 WIB (17:05 UTC): t-date bertransisi ke ready; t-sprint-met TIDAK berubah readyAt & log tidak duplikat!
  const secondRun = await evaluateProjectTermReadinessInTx(tx, "proj-1", wibMidnightBoundary, {
    id: "user-1",
    name: "Owner",
    role: "owner",
  });
  assert.deepEqual(secondRun, ["t-date"]);
  assert.equal(state.terms[0].status, "ready");
  assert.equal(state.terms[0].readyAt?.toISOString(), wibMidnightBoundary.toISOString());
  assert.equal(state.terms[0].invoiceNumber, null);
  assert.equal(state.terms[1].readyAt?.toISOString(), beforeWibMidnight.toISOString());
  assert.equal(state.terms[2].status, "planned");
  assert.equal(state.terms[3].status, "planned");
  assert.equal(state.activityLogs.length, 2);

  // 3. Evaluasi ulang ketiga: murni idempotent (0 perubahan, 0 log baru)
  const thirdRun = await evaluateProjectTermReadinessInTx(tx, "proj-1", new Date("2026-11-12T10:00:00.000Z"));
  assert.deepEqual(thirdRun, []);
  assert.equal(state.activityLogs.length, 2);
});

test("US-3 / AC-3.2 + BR-SPRINT-05: completeSprintAtomically mengevaluasi pemicu termin dalam satu transaksi atomik", async () => {
  const closedAt = new Date("2026-11-09T10:00:00.000Z");
  const state = {
    projects: [{ id: "proj-1", progress: 0 }],
    sprints: [
      { id: "sprint-1", projectId: "proj-1", name: "Sprint 1", status: "active", tasks: [] },
      { id: "sprint-2", projectId: "proj-1", name: "Sprint 2", status: "planning", tasks: [] },
    ],
    terms: [
      {
        id: "t-after-1-sprint",
        projectId: "proj-1",
        termNumber: 1,
        title: "Termin Setelah 1 Sprint",
        percentage: 100,
        amount: 50_000_000,
        triggerType: "sprint" as const,
        triggerDate: null,
        requiredCompletedSprints: 1,
        triggerSprintId: null,
        dueDate: null,
        status: "planned" as const,
        readyAt: null,
        invoiceNumber: null,
        invoiceIssuedAt: null,
        invoiceDueDate: null,
        paidAt: null,
        isLocked: false,
      },
    ],
    activityLogs: [] as any[],
  };

  const originalTransaction = prisma.$transaction;
  try {
    (prisma as any).$transaction = async (cb: (tx: any) => Promise<any>) => {
      const tx = createFakeTx(state);
      return cb(tx);
    };

    const result = await sprintsRepository.completeSprintAtomically(
      "sprint-1",
      "proj-1",
      [],
      closedAt,
      { id: "owner-1", name: "Ivan", role: "owner" }
    );

    assert.equal(result.progress, 50);
    assert.deepEqual(result.readyTermIds, ["t-after-1-sprint"]);
    assert.equal(state.terms[0].status, "ready");
    assert.equal(state.terms[0].readyAt?.toISOString(), closedAt.toISOString());
    assert.equal(state.terms[0].invoiceNumber, null);
    assert.equal(state.activityLogs.length, 2); // TERM_READY + SPRINT_COMPLETE dalam transaksi yang sama
  } finally {
    (prisma as any).$transaction = originalTransaction;
  }
});

// =========================================================================
// US-3 / AC-3.3: Penerbitan Invoice Manual & Due Date Wajib
// =========================================================================
test("US-3 / AC-3.3: issueInvoiceSchema dan issueTermInvoice mewajibkan invoiceDueDate terpisah dari triggerDate serta mengunci termin", async () => {
  // Validasi schema: tolak tanpa invoiceDueDate
  assert.equal(issueInvoiceSchema.safeParse({}).success, false);
  assert.equal(issueInvoiceSchema.safeParse({ invoiceDueDate: "2026-02-31" }).success, false);
  assert.equal(
    issueInvoiceSchema.safeParse({
      invoiceNumber: "INV-MANUAL-2026-99",
      invoiceDueDate: "2026-11-30",
    }).success,
    true
  );

  // Validasi BAST opsional (BR-TERM-05)
  assert.equal(markTermReadySchema.safeParse(undefined).success, true);

  const originalFindTerm = financeRepository.findTermById;
  const originalIssueAtomically = financeRepository.issueInvoiceAtomically;
  const originalLog = financeRepository.logActivity;

  try {
    financeRepository.findTermById = async () =>
      ({
        id: "term-ready-1",
        projectId: "proj-1",
        termNumber: 2,
        title: "Termin 2",
        percentage: 40,
        amount: 40_000_000,
        triggerType: "date",
        triggerDate: "2026-11-10",
        status: "ready",
        readyAt: new Date("2026-11-10T01:00:00.000Z"),
        isLocked: false,
        invoiceNumber: null,
      } as any);

    let capturedInvoicePayload: any = null;
    financeRepository.issueInvoiceAtomically = async (_id, _year, _termNumber, data) => {
      capturedInvoicePayload = data;
      return {
        invoiceNumber: data.invoiceNumber || "INV-2026-001/T2",
        updated: {
          id: "term-ready-1",
          projectId: "proj-1",
          termNumber: 2,
          title: "Termin 2",
          percentage: 40,
          amount: 40_000_000,
          triggerType: "date",
          triggerDate: "2026-11-10",
          status: "invoiced",
          isLocked: true,
          invoiceNumber: data.invoiceNumber || "INV-2026-001/T2",
          invoiceDueDate: data.invoiceDueDate,
          invoiceIssuedAt: data.invoiceIssuedAt,
        } as any,
      };
    };
    financeRepository.logActivity = async () => ({} as any);

    const issued = await financeService.issueTermInvoice(
      "term-ready-1",
      {
        invoiceDueDate: "2026-11-25",
        notes: "Jatuh tempo 14 hari kalender",
      },
      { id: "ops-1", email: "ops@cira.digital", name: "Ops User", roles: ["operasional"] },
      new Date("2026-11-10T03:00:00.000Z")
    );

    assert.equal(issued.status, "invoiced");
    assert.equal(issued.isLocked, true);
    assert.equal(issued.invoiceDueDate, "2026-11-25");
    assert.equal(issued.triggerDate, "2026-11-10");
    assert.equal(capturedInvoicePayload.invoiceDueDate, "2026-11-25");
  } finally {
    financeRepository.findTermById = originalFindTerm;
    financeRepository.issueInvoiceAtomically = originalIssueAtomically;
    financeRepository.logActivity = originalLog;
  }
});

// =========================================================================
// US-3 / AC-3.4: Status Overdue Invoice (WIB) & Pelunasan (`markTermPaid`)
// =========================================================================
test("US-3 / AC-3.4: status overdue dihitung menurut tanggal WIB dan hilang saat ditandai lunas ('paid')", async () => {
  const invoicedTerm = {
    status: "invoiced",
    invoiceDueDate: "2026-11-20",
  };

  // Pada 2026-11-20 23:50 WIB (16:50 UTC) -> BELUM overdue
  const sameDayWibLate = new Date("2026-11-20T16:50:00.000Z");
  assert.equal(getBusinessDateWib(sameDayWibLate), "2026-11-20");
  assert.equal(isInvoiceOverdue(invoicedTerm, sameDayWibLate), false);

  // Pada 2026-11-21 00:05 WIB (17:05 UTC tgl 20) -> SUDAH overdue
  const nextDayWibEarly = new Date("2026-11-20T17:05:00.000Z");
  assert.equal(getBusinessDateWib(nextDayWibEarly), "2026-11-21");
  assert.equal(isInvoiceOverdue(invoicedTerm, nextDayWibEarly), true);

  // Status non-invoiced tidak pernah overdue
  assert.equal(isInvoiceOverdue({ status: "paid", invoiceDueDate: "2026-11-20" }, nextDayWibEarly), false);
  assert.equal(isInvoiceOverdue({ status: "ready", invoiceDueDate: "2026-11-20" }, nextDayWibEarly), false);

  // Pelunasan melalui financeService.markTermPaid mengubah status menjadi 'paid' & overdue = false
  const originalFindTerm = financeRepository.findTermById;
  const originalMarkPaid = financeRepository.markTermPaidAtomically;
  const originalLog = financeRepository.logActivity;

  try {
    financeRepository.findTermById = async () =>
      ({
        id: "term-inv-1",
        projectId: "proj-1",
        title: "Termin Invoice Overdue",
        amount: 25_000_000,
        percentage: 25,
        status: "invoiced",
        invoiceNumber: "INV-2026-009/T1",
        invoiceDueDate: "2026-11-20",
        isLocked: true,
      } as any);

    financeRepository.markTermPaidAtomically = async (_id, paidAt) =>
      ({
        id: "term-inv-1",
        projectId: "proj-1",
        title: "Termin Invoice Overdue",
        amount: 25_000_000,
        percentage: 25,
        status: "paid",
        invoiceNumber: "INV-2026-009/T1",
        invoiceDueDate: "2026-11-20",
        paidAt,
        isLocked: true,
      } as any);

    financeRepository.logActivity = async () => ({} as any);

    const paidResult = await financeService.markTermPaid(
      "term-inv-1",
      { id: "ops-1", email: "ops@cira.digital", name: "Ops User", roles: ["operasional"] },
      nextDayWibEarly
    );

    assert.equal(paidResult.status, "paid");
    assert.equal(paidResult.overdue, false);
    assert.ok(paidResult.paidAt);
  } finally {
    financeRepository.findTermById = originalFindTerm;
    financeRepository.markTermPaidAtomically = originalMarkPaid;
    financeRepository.logActivity = originalLog;
  }
});

// =========================================================================
// US-3 / RBAC: Izin `finance.payment_terms.manage` & `finance.invoices.create`
// =========================================================================
test("US-3 / RBAC: requirePermission mengizinkan Owner & Operasional untuk termin/invoice dan menolak Developer (403)", async () => {
  const originalFindMany = prisma.rolePolicy.findMany;
  try {
    // Kembalikan [] agar policiesService memakai DEFAULT_ROLE_POLICIES tanpa koneksi DB
    (prisma.rolePolicy as any).findMany = async () => [];

    const manageGuard = requirePermission("finance.payment_terms.manage");
    const invoiceGuard = requirePermission("finance.invoices.create");

    for (const role of ["owner", "operasional"]) {
      let errManage: any = null;
      await manageGuard(
        { user: { id: "u-ok", roles: [role] } } as any,
        {} as any,
        (err) => {
          errManage = err ?? null;
        }
      );
      assert.equal(errManage, null, `${role} wajib diizinkan finance.payment_terms.manage`);

      let errInvoice: any = null;
      await invoiceGuard(
        { user: { id: "u-ok", roles: [role] } } as any,
        {} as any,
        (err) => {
          errInvoice = err ?? null;
        }
      );
      assert.equal(errInvoice, null, `${role} wajib diizinkan finance.invoices.create`);
    }

    let devManageErr: any = null;
    await manageGuard(
      { user: { id: "u-dev", roles: ["developer"] } } as any,
      {} as any,
      (err) => {
        devManageErr = err;
      }
    );
    assert.ok(devManageErr);
    assert.equal(devManageErr.statusCode, 403);

    let devInvoiceErr: any = null;
    await invoiceGuard(
      { user: { id: "u-dev", roles: ["developer"] } } as any,
      {} as any,
      (err) => {
        devInvoiceErr = err;
      }
    );
    assert.ok(devInvoiceErr);
    assert.equal(devInvoiceErr.statusCode, 403);
  } finally {
    (prisma.rolePolicy as any).findMany = originalFindMany;
  }

  // Pastikan policiesService.hasAny tidak memunculkan unused import lint jika dibutuhkan nanti
  assert.equal(typeof policiesService.hasAny, "function");
});
