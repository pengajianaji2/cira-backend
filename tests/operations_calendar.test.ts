import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET =
  process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
    ? process.env.JWT_SECRET
    : "test_only_secret_value_at_least_32_chars_long";
process.env.NODE_ENV = "test";

const [
  { prisma },
  { requirePermission },
  { ForbiddenError },
  {
    calendarQuerySchema,
    createOperationalEventSchema,
    updateOperationalEventSchema,
  },
  { INTERNAL_PROJECT_SENTINEL, operationsRepository },
  { operationsService },
  { sprintsRepository },
  { sprintsService },
] = await Promise.all([
  import("../src/config/db.config.js"),
  import("../src/shared/middlewares/auth.middleware.js"),
  import("../src/shared/errors/AppError.js"),
  import("../src/features/operations/operations.schema.js"),
  import("../src/features/operations/operations.repository.js"),
  import("../src/features/operations/operations.service.js"),
  import("../src/features/sprints/sprints.repository.js"),
  import("../src/features/sprints/sprints.service.js"),
]);

// =========================================================================
// AC-4.1: Read-Aggregation Tanpa Duplikasi, Deep Link, Overdue & Timezone WIB
// =========================================================================
test("US-4 / AC-4.1: getOperationalCalendar mengagregasikan Sprint, PaymentTerm ready, Invoice due/overdue, dan OperationalEvent dalam WIB dengan ID unik dan deep link", async (t) => {
  const originalFindSources = operationsRepository.findCalendarSourcesInRange;
  let capturedParams: any = null;

  operationsRepository.findCalendarSourcesInRange = async (params) => {
    capturedParams = params;
    return {
      sprints: [
        {
          id: "spr-1",
          projectId: "proj-1",
          name: "Sprint 2 - Checkout",
          status: "active",
          // 17:00:00Z = 00:00:00+07:00 tanggal 2 November 2026 di WIB
          startDate: new Date("2026-11-01T17:00:00.000Z"),
          endDate: new Date("2026-11-15T16:59:59.000Z"),
          project: { id: "proj-1", name: "Portal E-Commerce", status: "active" },
        },
        {
          // Sprint planning tanpa tanggal lengkap tidak boleh dipaksa masuk feed
          id: "spr-nodate",
          projectId: "proj-1",
          name: "Sprint Backlog Draft",
          status: "planning",
          startDate: null,
          endDate: null,
          project: { id: "proj-1", name: "Portal E-Commerce", status: "active" },
        },
      ],
      readyTerms: [
        {
          id: "term-ready-1",
          projectId: "proj-1",
          termNumber: 2,
          title: "Termin Beta Release",
          amount: 15_000_000 as any,
          status: "ready",
          readyAt: new Date("2026-11-05T03:00:00.000Z"),
          project: { id: "proj-1", name: "Portal E-Commerce", status: "active" },
        },
      ],
      invoicesInRange: [
        {
          id: "term-inv-overdue",
          projectId: "proj-1",
          termNumber: 1,
          title: "Termin DP",
          amount: 10_000_000 as any,
          status: "invoiced",
          invoiceNumber: "INV/2026/001",
          invoiceDueDate: "2026-11-08",
          paidAt: null,
          project: { id: "proj-1", name: "Portal E-Commerce", status: "active" },
        },
        {
          id: "term-inv-paid",
          projectId: "proj-1",
          termNumber: 1,
          title: "Termin Lunas",
          amount: 5_000_000 as any,
          status: "paid",
          invoiceNumber: "INV/2026/000",
          invoiceDueDate: "2026-11-03",
          paidAt: new Date("2026-11-02T04:00:00.000Z"),
          project: { id: "proj-1", name: "Portal E-Commerce", status: "active" },
        },
      ],
      overdueCarryoverInvoices: [
        {
          id: "term-inv-carryover",
          projectId: "proj-2",
          termNumber: 1,
          title: "Termin Oktober",
          amount: 12_000_000 as any,
          status: "invoiced",
          invoiceNumber: "INV/2026/099",
          invoiceDueDate: "2026-10-25",
          paidAt: null,
          project: { id: "proj-2", name: "Aplikasi Kasir", status: "active" },
        },
      ],
      manualEvents: [
        {
          id: "ev-internal-1",
          title: "All-Hands Evaluasi Bulanan",
          eventType: "meeting",
          description: "Koordinasi lintas tim",
          startAt: new Date("2026-11-04T02:00:00.000Z"),
          endAt: new Date("2026-11-04T03:00:00.000Z"),
          allDay: false,
          allDayStartDate: null,
          allDayEndDate: null,
          projectId: null,
          status: "scheduled",
          cancelledAt: null,
          cancelReason: null,
          lastRemindedAt: null,
          reminderNote: null,
          reminderCount: 0,
          project: null,
        },
      ],
    };
  };

  t.after(() => {
    operationsRepository.findCalendarSourcesInRange = originalFindSources;
  });

  // Hari bisnis WIB: 10 November 2026 pukul 01:00 WIB (masih 9 Nov 18:00Z di UTC)
  const now = new Date("2026-11-09T18:00:00.000Z");
  const feed = await operationsService.getOperationalCalendar(
    {
      from: "2026-11-01",
      to: "2026-11-30",
    },
    now
  );

  assert.equal(feed.range.from, "2026-11-01");
  assert.equal(feed.range.to, "2026-11-30");
  assert.equal(feed.range.timezone, "Asia/Jakarta");
  assert.equal(capturedParams.todayWib, "2026-11-10");
  assert.deepEqual(capturedParams.projectStatuses, ["active"]);

  assert.equal(feed.events.length, 5);
  const byId = new Map(feed.events.map((ev) => [ev.id, ev]));

  assert.equal(byId.has("sprint:spr-1"), true);
  assert.equal(byId.has("sprint:spr-nodate"), false);
  assert.equal(byId.get("sprint:spr-1")?.startAt, "2026-11-02");
  assert.equal(byId.get("sprint:spr-1")?.href, "/projects/proj-1?tab=sprints");

  assert.equal(byId.get("payment_term:term-ready-1")?.href, "/projects/proj-1?tab=finance");
  assert.equal(byId.get("payment_term:term-ready-1")?.metadata?.amount, 15_000_000);

  assert.equal(byId.get("invoice:term-inv-overdue")?.overdue, true);
  assert.equal(byId.get("invoice:term-inv-overdue")?.href, "/projects/proj-1?tab=finance");
  assert.equal(byId.get("invoice:term-inv-paid")?.overdue, false);

  assert.equal(byId.get("operational_event:ev-internal-1")?.project, null);
  assert.equal(
    byId.get("operational_event:ev-internal-1")?.href,
    "/operations/calendar?eventId=ev-internal-1"
  );

  // Urutan kronologis: 2026-11-02 -> 2026-11-03 -> 2026-11-04 -> 2026-11-05 -> 2026-11-08
  assert.deepEqual(
    feed.events.map((ev) => ev.id),
    [
      "sprint:spr-1",
      "invoice:term-inv-paid",
      "operational_event:ev-internal-1",
      "payment_term:term-ready-1",
      "invoice:term-inv-overdue",
    ]
  );

  // Carryover overdue sebelum rentang tetap dimunculkan
  assert.equal(feed.overdueCarryover.length, 1);
  assert.equal(feed.overdueCarryover[0].id, "invoice:term-inv-carryover");
  assert.equal(feed.overdueCarryover[0].overdue, true);
});

test("US-4 / AC-4.1: Filter scope __internal__ memisahkan agenda internal dari sumber proyek", async (t) => {
  const originalFindSources = operationsRepository.findCalendarSourcesInRange;
  let capturedParams: any = null;

  operationsRepository.findCalendarSourcesInRange = async (params) => {
    capturedParams = params;
    return {
      sprints: [],
      readyTerms: [],
      invoicesInRange: [],
      overdueCarryoverInvoices: [],
      manualEvents: [],
    };
  };

  t.after(() => {
    operationsRepository.findCalendarSourcesInRange = originalFindSources;
  });

  await operationsService.getOperationalCalendar({
    from: "2026-11-01",
    to: "2026-11-30",
    projectIds: [INTERNAL_PROJECT_SENTINEL],
  });

  assert.equal(capturedParams.hasProjectFilter, true);
  assert.equal(capturedParams.includeInternal, true);
  assert.deepEqual(capturedParams.realProjectIds, []);
});

// =========================================================================
// AC-4.2: Manajemen Agenda Manual & Project Scope (Nullable Project)
// =========================================================================
test("US-4 / AC-4.2: createOperationalEventSchema mendukung keempat tipe, mode all-day vs terjadwal, dan projectId opsional/nullable", () => {
  for (const eventType of ["client_demo", "deployment", "maintenance", "meeting"] as const) {
    const parsedInternal = createOperationalEventSchema.safeParse({
      title: `Agenda ${eventType}`,
      eventType,
      projectId: "",
      allDay: false,
      startAt: "2026-11-12T09:00:00.000+07:00",
      endAt: "2026-11-12T10:30:00.000+07:00",
    });
    assert.equal(parsedInternal.success, true);
    if (parsedInternal.success) {
      assert.equal(parsedInternal.data.projectId, null);
    }
  }

  const parsedAllDay = createOperationalEventSchema.safeParse({
    title: "Maintenance Database Server",
    eventType: "maintenance",
    allDay: true,
    allDayStartDate: "2026-11-20",
    allDayEndDate: "2026-11-21",
    projectId: "proj-1",
  });
  assert.equal(parsedAllDay.success, true);

  // Tolak tipe di luar enum, rentang mundur, dan tanggal kalender tidak valid
  assert.equal(
    createOperationalEventSchema.safeParse({
      title: "Agenda Ilegal",
      eventType: "holiday",
      allDay: true,
      allDayStartDate: "2026-11-20",
    }).success,
    false
  );
  assert.equal(
    createOperationalEventSchema.safeParse({
      title: "Tanggal Mundur",
      eventType: "deployment",
      allDay: true,
      allDayStartDate: "2026-11-25",
      allDayEndDate: "2026-11-20",
    }).success,
    false
  );
  assert.equal(
    createOperationalEventSchema.safeParse({
      title: "Tanggal Palsu",
      eventType: "meeting",
      allDay: true,
      allDayStartDate: "2026-02-30",
    }).success,
    false
  );

  // updateOperationalEventSchema menolak field status liar lewat .strict()
  assert.equal(
    updateOperationalEventSchema.safeParse({
      title: "Ubah Judul",
      status: "cancelled",
    }).success,
    false
  );
});

test("US-4 / AC-4.2: createOperationalEvent menyimpan agenda internal (projectId=null) tanpa ActivityLog proyek dan mencatat ActivityLog untuk agenda berproyek", async (t) => {
  const originalFindProject = operationsRepository.findProjectMinimalById;
  const originalCreateEvent = operationsRepository.createEvent;
  const originalLogActivity = operationsRepository.logProjectActivity;

  const createdPayloads: any[] = [];
  const loggedActivities: any[] = [];

  operationsRepository.findProjectMinimalById = async (projectId) =>
    projectId === "proj-valid"
      ? { id: "proj-valid", name: "Web Company Profile", status: "active" }
      : null;

  operationsRepository.createEvent = async (data) => {
    createdPayloads.push(data);
    return {
      id: `ev-${createdPayloads.length}`,
      ...data,
      status: "scheduled",
      reminderCount: 0,
      lastRemindedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      project: data.projectId
        ? { id: data.projectId, name: "Web Company Profile", status: "active" }
        : null,
    } as any;
  };

  operationsRepository.logProjectActivity = async (data) => {
    loggedActivities.push(data);
    return data as any;
  };

  t.after(() => {
    operationsRepository.findProjectMinimalById = originalFindProject;
    operationsRepository.createEvent = originalCreateEvent;
    operationsRepository.logProjectActivity = originalLogActivity;
  });

  // 1. Agenda Internal Agensi (projectId = null) -> tidak mencatat ActivityLog proyek
  const internalEv = await operationsService.createOperationalEvent(
    {
      title: "Rapat Operasional Mingguan",
      eventType: "meeting",
      projectId: null,
      allDay: true,
      allDayStartDate: "2026-11-18",
    },
    { id: "ops-1", email: "ops@cira.id", name: "Ops Lead", roles: ["operasional"] }
  );

  assert.equal(internalEv.projectId, null);
  assert.equal(internalEv.allDay, true);
  assert.equal(createdPayloads[0].allDayStartDate, "2026-11-18");
  assert.equal(createdPayloads[0].allDayEndDate, "2026-11-18");
  assert.equal(loggedActivities.length, 0);

  // 2. Agenda Terikat Proyek -> memvalidasi proyek & mencatat OPERATIONAL_EVENT_CREATE
  const projectEv = await operationsService.createOperationalEvent(
    {
      title: "Demo Sprint 3",
      eventType: "client_demo",
      projectId: "proj-valid",
      allDay: false,
      startAt: "2026-11-19T14:00:00.000+07:00",
      endAt: "2026-11-19T15:30:00.000+07:00",
    },
    { id: "ops-1", email: "ops@cira.id", name: "Ops Lead", roles: ["operasional"] }
  );

  assert.equal(projectEv.projectId, "proj-valid");
  assert.equal(loggedActivities.length, 1);
  assert.equal(loggedActivities[0].action, "OPERATIONAL_EVENT_CREATE");

  // 3. Project ID tidak ditemukan -> 404 NotFoundError
  await assert.rejects(
    () =>
      operationsService.createOperationalEvent({
        title: "Demo Invalid",
        eventType: "client_demo",
        projectId: "proj-missing",
        allDay: false,
        startAt: "2026-11-19T14:00:00.000+07:00",
      }),
    (err: any) => err?.statusCode === 404
  );
});

// =========================================================================
// AC-4.3: Soft Cancel Status 'cancelled' Tanpa Hard Delete & Follow-Up Manual
// =========================================================================
test("US-4 / AC-4.3: cancelOperationalEvent melakukan soft status ke 'cancelled' tanpa hard delete serta memblokir mutasi setelah dibatalkan", async (t) => {
  const originalFindById = operationsRepository.findEventById;
  const originalCancelEvent = operationsRepository.cancelEvent;
  const originalLogActivity = operationsRepository.logProjectActivity;
  const originalDelete = prisma.operationalEvent.delete;
  const originalDeleteMany = prisma.operationalEvent.deleteMany;

  let storedEvent: any = {
    id: "ev-cancel-1",
    title: "Production Deployment",
    eventType: "deployment",
    description: "Deploy v2.1",
    startAt: new Date("2026-11-22T15:00:00.000Z"),
    endAt: new Date("2026-11-22T17:00:00.000Z"),
    allDay: false,
    allDayStartDate: null,
    allDayEndDate: null,
    projectId: "proj-1",
    status: "scheduled",
    cancelledAt: null,
    cancelReason: null,
    lastRemindedAt: null,
    reminderNote: null,
    reminderCount: 0,
    project: { id: "proj-1", name: "Portal Klien", status: "active" },
  };

  let hardDeleteCalled = false;
  const activityActions: string[] = [];

  (prisma.operationalEvent as any).delete = async () => {
    hardDeleteCalled = true;
    throw new Error("Hard delete dilarang!");
  };
  (prisma.operationalEvent as any).deleteMany = async () => {
    hardDeleteCalled = true;
    throw new Error("Hard delete dilarang!");
  };

  operationsRepository.findEventById = async (id) =>
    id === storedEvent.id ? storedEvent : null;

  operationsRepository.cancelEvent = async (_id, data) => {
    storedEvent = {
      ...storedEvent,
      status: "cancelled",
      cancelledAt: data.cancelledAt,
      cancelledById: data.cancelledById ?? null,
      cancelReason: data.cancelReason ?? null,
    };
    return storedEvent;
  };

  operationsRepository.logProjectActivity = async (data) => {
    activityActions.push(data.action);
    return data as any;
  };

  t.after(() => {
    operationsRepository.findEventById = originalFindById;
    operationsRepository.cancelEvent = originalCancelEvent;
    operationsRepository.logProjectActivity = originalLogActivity;
    (prisma.operationalEvent as any).delete = originalDelete;
    (prisma.operationalEvent as any).deleteMany = originalDeleteMany;
  });

  const cancelledAt = new Date("2026-11-21T08:00:00.000Z");
  const result = await operationsService.cancelOperationalEvent(
    "ev-cancel-1",
    { cancelReason: "Menunggu UAT klien selesai" },
    { id: "owner-1", email: "owner@cira.id", name: "Owner", roles: ["owner"] },
    cancelledAt
  );

  assert.equal(hardDeleteCalled, false);
  assert.equal(result.status, "cancelled");
  assert.equal(result.cancelReason, "Menunggu UAT klien selesai");
  assert.equal(activityActions[0], "OPERATIONAL_EVENT_CANCEL");

  // Re-cancel, edit, maupun follow-up agenda yang sudah cancelled harus ditolak
  await assert.rejects(
    () => operationsService.cancelOperationalEvent("ev-cancel-1", {}),
    (err: any) => err?.statusCode === 400
  );
  await assert.rejects(
    () => operationsService.updateOperationalEvent("ev-cancel-1", { title: "Revisi" }),
    (err: any) => err?.statusCode === 400
  );
  await assert.rejects(
    () => operationsService.recordOperationalEventReminder("ev-cancel-1", { note: "Follow up" }),
    (err: any) => err?.statusCode === 400
  );
});

test("US-4 / AC-4.3: recordOperationalEventReminder mencatat log follow-up manual (BR-CAL-11) dan filter includeCancelled mengatur query repository", async (t) => {
  const originalFindById = operationsRepository.findEventById;
  const originalRecordReminder = operationsRepository.recordReminder;
  const originalLogActivity = operationsRepository.logProjectActivity;
  const originalEventFindMany = prisma.operationalEvent.findMany;

  const capturedWheres: any[] = [];

  operationsRepository.findEventById = async () =>
    ({
      id: "ev-rem-1",
      title: "Demo Klien Tahap 1",
      projectId: "proj-1",
      status: "scheduled",
    }) as any;

  operationsRepository.recordReminder = async (_id, data) =>
    ({
      id: "ev-rem-1",
      title: "Demo Klien Tahap 1",
      projectId: "proj-1",
      lastRemindedAt: data.remindedAt,
      reminderNote: data.note ?? null,
      reminderCount: 1,
    }) as any;

  let loggedAction = "";
  operationsRepository.logProjectActivity = async (data) => {
    loggedAction = data.action;
    return data as any;
  };

  (prisma.operationalEvent as any).findMany = async (args: any) => {
    capturedWheres.push(args.where);
    return [];
  };

  t.after(() => {
    operationsRepository.findEventById = originalFindById;
    operationsRepository.recordReminder = originalRecordReminder;
    operationsRepository.logProjectActivity = originalLogActivity;
    (prisma.operationalEvent as any).findMany = originalEventFindMany;
  });

  const recorded = await operationsService.recordOperationalEventReminder(
    "ev-rem-1",
    { note: "Sudah konfirmasi link meeting ke PIC klien" },
    { id: "ops-1", email: "ops@cira.id", name: "Ops", roles: ["operasional"] }
  );

  assert.equal(recorded.reminderCount, 1);
  assert.equal(recorded.reminderNote, "Sudah konfirmasi link meeting ke PIC klien");
  assert.equal(loggedAction, "OPERATIONAL_EVENT_FOLLOWUP");

  const commonParams = {
    from: "2026-11-01",
    to: "2026-11-30",
    rangeStartUtc: new Date("2026-10-31T17:00:00.000Z"),
    rangeEndUtc: new Date("2026-11-30T16:59:59.999Z"),
    todayWib: "2026-11-10",
    includeTypes: new Set(["operational_event"] as const),
    projectStatuses: ["active"] as any,
    realProjectIds: [],
    hasProjectFilter: false,
    includeInternal: true,
  };

  await operationsRepository.findOperationalEventsInRange({
    ...commonParams,
    includeCancelled: false,
  });
  await operationsRepository.findOperationalEventsInRange({
    ...commonParams,
    includeCancelled: true,
  });

  assert.equal(capturedWheres[0].status, "scheduled");
  assert.equal("status" in capturedWheres[1], false);
});

// =========================================================================
// AC-4.4: Otorisasi Akses RBAC Server-Side & Isolasi Roster Sprint Developer
// =========================================================================
test("US-4 / AC-4.4: Developer menerima 403 Forbidden saat mengakses endpoint kalender operasional & agenda manual, sedangkan Owner/Operasional diizinkan", async (t) => {
  const originalRoleFindMany = prisma.rolePolicy.findMany;
  (prisma.rolePolicy as any).findMany = async () => [];

  t.after(() => {
    (prisma.rolePolicy as any).findMany = originalRoleFindMany;
  });

  const canReadCalendar = requirePermission("operations.calendar.read");
  const canManageEvents = requirePermission("operations.events.manage");

  async function runGuard(middleware: ReturnType<typeof requirePermission>, roles?: string[]) {
    return new Promise<any>((resolve) => {
      middleware(
        (roles ? { user: { id: "u-1", email: "u@cira.id", name: "User", roles } } : {}) as any,
        {} as any,
        (err?: any) => resolve(err)
      );
    });
  }

  assert.equal(await runGuard(canReadCalendar, ["owner"]), undefined);
  assert.equal(await runGuard(canReadCalendar, ["operasional"]), undefined);
  assert.equal(await runGuard(canReadCalendar, ["ops"]), undefined);
  assert.equal(await runGuard(canManageEvents, ["owner"]), undefined);
  assert.equal(await runGuard(canManageEvents, ["operasional"]), undefined);

  const devCalErr = await runGuard(canReadCalendar, ["developer"]);
  assert.equal(devCalErr?.statusCode, 403);

  const devManageErr = await runGuard(canManageEvents, ["developer"]);
  assert.equal(devManageErr?.statusCode, 403);

  const anonErr = await runGuard(canReadCalendar, undefined);
  assert.equal(anonErr?.statusCode, 403);
});

test("US-4 / AC-4.4: sprintsService membatasi Developer hanya pada proyek yang terdaftar di ProjectRoster (403 ForbiddenError di luar roster)", async (t) => {
  const originalFindProjectById = sprintsRepository.findProjectById;
  const originalFindSprints = sprintsRepository.findSprintsByProjectId;
  const originalFindSprintById = sprintsRepository.findById;
  const originalIsRoster = sprintsRepository.isUserInProjectRoster;
  const originalCalcProgress = sprintsRepository.calculateCumulativeProgress;

  sprintsRepository.findProjectById = async (projectId) =>
    ({ id: projectId, name: "Project A", ownerId: "owner-1" }) as any;

  sprintsRepository.findSprintsByProjectId = async (projectId) => [
    {
      id: "spr-a1",
      projectId,
      name: "Sprint 1",
      goal: "MVP",
      status: "active",
      startDate: new Date("2026-11-01T00:00:00.000Z"),
      endDate: new Date("2026-11-14T00:00:00.000Z"),
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tasks: [{ status: "done", storyPoints: 3 }],
    },
  ];

  sprintsRepository.findById = async (id) =>
    ({
      id,
      projectId: "proj-a",
      name: "Sprint 1",
      status: "active",
      tasks: [],
      project: { id: "proj-a", ownerId: "owner-1" },
    }) as any;

  sprintsRepository.calculateCumulativeProgress = async () => ({
    totalScopePoints: 5,
    completedPoints: 3,
    progress: 50,
    completedSprintCount: 1,
    totalSprintCount: 2,
  });

  sprintsRepository.isUserInProjectRoster = async (projectId, userId) =>
    projectId === "proj-a" && userId === "dev-member";

  t.after(() => {
    sprintsRepository.findProjectById = originalFindProjectById;
    sprintsRepository.findSprintsByProjectId = originalFindSprints;
    sprintsRepository.findById = originalFindSprintById;
    sprintsRepository.isUserInProjectRoster = originalIsRoster;
    sprintsRepository.calculateCumulativeProgress = originalCalcProgress;
  });

  const devOutsider = {
    id: "dev-outsider",
    email: "out@cira.id",
    name: "Dev Outsider",
    roles: ["developer"],
  };
  const devMember = {
    id: "dev-member",
    email: "in@cira.id",
    name: "Dev Member",
    roles: ["developer"],
  };
  const opsUser = {
    id: "ops-1",
    email: "ops@cira.id",
    name: "Ops User",
    roles: ["operasional"],
  };

  await assert.rejects(
    () => sprintsService.getSprintsByProjectId("proj-a", devOutsider),
    (err: any) => err instanceof ForbiddenError && err.statusCode === 403
  );
  await assert.rejects(
    () => sprintsService.getSprintById("spr-a1", devOutsider),
    (err: any) => err instanceof ForbiddenError && err.statusCode === 403
  );
  await assert.rejects(
    () => sprintsService.getProjectCumulativeProgress("proj-a", devOutsider),
    (err: any) => err instanceof ForbiddenError && err.statusCode === 403
  );

  // Developer di dalam roster diizinkan mengakses sprint & progres proyeknya
  const memberSprints = await sprintsService.getSprintsByProjectId("proj-a", devMember);
  assert.equal(memberSprints.length, 1);
  assert.equal(memberSprints[0].completedPoints, 3);

  const memberProgress = await sprintsService.getProjectCumulativeProgress("proj-a", devMember);
  assert.equal(memberProgress.progress, 50);

  // Operasional memiliki visibilitas lintas proyek
  const opsSprints = await sprintsService.getSprintsByProjectId("proj-other", opsUser);
  assert.equal(opsSprints.length, 1);
});

// =========================================================================
// AC-4.5: Pembatasan Rentang <= 90 Hari, Validasi Tanggal & Minimal Select
// =========================================================================
test("US-4 / AC-4.5: calendarQuerySchema dan getOperationalCalendar menolak rentang > 90 hari, from > to, parameter tidak berpasangan, serta tanggal kalender palsu", async () => {
  // Valid 90 hari inklusif: 2026-01-01 s.d. 2026-03-31 (31 + 28 + 31 = 90 hari)
  const valid90 = calendarQuerySchema.safeParse({
    from: "2026-01-01",
    to: "2026-03-31",
    types: "sprint,invoice",
    includeCancelled: "true",
  });
  assert.equal(valid90.success, true);
  if (valid90.success) {
    assert.deepEqual(valid90.data.types, ["sprint", "invoice"]);
    assert.equal(valid90.data.includeCancelled, true);
  }

  // Tolak 91 hari: 2026-01-01 s.d. 2026-04-01
  assert.equal(
    calendarQuerySchema.safeParse({
      from: "2026-01-01",
      to: "2026-04-01",
    }).success,
    false
  );

  // Tolak from > to
  assert.equal(
    calendarQuerySchema.safeParse({
      from: "2026-11-20",
      to: "2026-11-05",
    }).success,
    false
  );

  // Tolak parameter tidak berpasangan
  assert.equal(calendarQuerySchema.safeParse({ from: "2026-11-01" }).success, false);
  assert.equal(calendarQuerySchema.safeParse({ to: "2026-11-30" }).success, false);

  // Tolak tanggal kalender palsu
  assert.equal(
    calendarQuerySchema.safeParse({ from: "2026-02-30", to: "2026-03-05" }).success,
    false
  );

  // Service-level guard juga menolak 91 hari & from > to
  await assert.rejects(
    () =>
      operationsService.getOperationalCalendar({
        from: "2026-01-01",
        to: "2026-04-01",
      }),
    (err: any) => err?.statusCode === 400
  );
  await assert.rejects(
    () =>
      operationsService.getOperationalCalendar({
        from: "2026-11-20",
        to: "2026-11-05",
      }),
    (err: any) => err?.statusCode === 400
  );
});

test("US-4 / AC-4.5: operationsRepository.findCalendarSourcesInRange menjalankan 1 batch query paralel dengan proyeksi select minimal tanpa N+1", async (t) => {
  const originalSprintFindMany = prisma.sprint.findMany;
  const originalPaymentTermFindMany = prisma.paymentTerm.findMany;
  const originalEventFindMany = prisma.operationalEvent.findMany;

  const sprintCalls: any[] = [];
  const termCalls: any[] = [];
  const eventCalls: any[] = [];

  (prisma.sprint as any).findMany = async (args: any) => {
    sprintCalls.push(args);
    return [];
  };
  (prisma.paymentTerm as any).findMany = async (args: any) => {
    termCalls.push(args);
    return [];
  };
  (prisma.operationalEvent as any).findMany = async (args: any) => {
    eventCalls.push(args);
    return [];
  };

  t.after(() => {
    (prisma.sprint as any).findMany = originalSprintFindMany;
    (prisma.paymentTerm as any).findMany = originalPaymentTermFindMany;
    (prisma.operationalEvent as any).findMany = originalEventFindMany;
  });

  await operationsRepository.findCalendarSourcesInRange({
    from: "2026-11-01",
    to: "2026-11-30",
    rangeStartUtc: new Date("2026-10-31T17:00:00.000Z"),
    rangeEndUtc: new Date("2026-11-30T16:59:59.999Z"),
    todayWib: "2026-11-10",
    includeTypes: new Set(["sprint", "payment_term", "invoice", "operational_event"]),
    projectStatuses: ["active"],
    realProjectIds: [],
    hasProjectFilter: false,
    includeInternal: true,
    includeCancelled: false,
  });

  assert.equal(sprintCalls.length, 1);
  assert.equal(termCalls.length, 3); // 1 readyAt + 1 invoice in-range + 1 overdueCarryover
  assert.equal(eventCalls.length, 1);

  for (const call of [...sprintCalls, ...termCalls, ...eventCalls]) {
    assert.ok(call.select, "Setiap query agregasi wajib menggunakan select kolom minimal");
    assert.equal(call.include, undefined, "Tidak boleh menggunakan include penuh");
  }
});
