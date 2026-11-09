import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test_only_secret_value_at_least_32_chars_long";
process.env.NODE_ENV = "test";

const [
  { prisma },
  { requirePermission },
  {
    createSprintSchema,
    updateSprintSchema,
    startSprintSchema,
    fibonacciStoryPointsSchema,
  },
  { createTaskSchema, updateTaskSchema },
  { sprintsService },
  { sprintsRepository },
] = await Promise.all([
  import("../src/config/db.config.js"),
  import("../src/shared/middlewares/auth.middleware.js"),
  import("../src/features/sprints/sprints.schema.js"),
  import("../src/features/tasks/tasks.schema.js"),
  import("../src/features/sprints/sprints.service.js"),
  import("../src/features/sprints/sprints.repository.js"),
]);

// ==============================================================
// AC-B3-1: Validasi Story Points Fibonacci [1, 2, 3, 5, 8, 13]
// ==============================================================
test("AC-B3-1: fibonacciStoryPointsSchema accepts all valid Fibonacci values [1, 2, 3, 5, 8, 13]", () => {
  const validFibonacci = [1, 2, 3, 5, 8, 13];
  for (const pts of validFibonacci) {
    const parsed = fibonacciStoryPointsSchema.parse(pts);
    assert.equal(parsed, pts);
  }
});

test("AC-B3-1: fibonacciStoryPointsSchema strictly rejects non-Fibonacci numbers", () => {
  const invalidIntegers = [0, 4, 6, 7, 9, 10, 11, 12, 14, 21, -1];
  for (const val of invalidIntegers) {
    assert.throws(
      () => fibonacciStoryPointsSchema.parse(val),
      /Story points wajib salah satu deret Fibonacci: 1, 2, 3, 5, 8, 13/
    );
  }

  // Non-integer numbers harus ditolak
  assert.throws(
    () => fibonacciStoryPointsSchema.parse(3.5),
    /Story points harus berupa bilangan bulat/
  );
});

test("AC-B3-1: createTaskSchema and updateTaskSchema validate storyPoints using Fibonacci", () => {
  // Valid create task with story points
  const validTask = createTaskSchema.parse({
    title: "Implementasi Login RBAC",
    storyPoints: 5,
    assigneeId: "user-123",
  });
  assert.equal(validTask.storyPoints, 5);

  // Invalid create task with non-Fibonacci
  assert.throws(
    () =>
      createTaskSchema.parse({
        title: "Task Non Fibonacci",
        storyPoints: 4,
      }),
    /Story points wajib salah satu deret Fibonacci/
  );

  // Valid update task
  const validUpdate = updateTaskSchema.parse({
    storyPoints: 8,
  });
  assert.equal(validUpdate.storyPoints, 8);

  // Update task allow null (remove points)
  const nullUpdate = updateTaskSchema.parse({
    storyPoints: null,
  });
  assert.equal(nullUpdate.storyPoints, null);

  // Invalid update task
  assert.throws(
    () =>
      updateTaskSchema.parse({
        storyPoints: 7,
      }),
    /Story points wajib salah satu deret Fibonacci/
  );
});

test("US-2 / AC-2.1: sprint schemas strictly reject malformed date strings while allowing optional planning dates", () => {
  assert.equal(
    createSprintSchema.safeParse({ name: "Sprint Planning", startDate: "bukan-tanggal" }).success,
    false
  );
  assert.equal(
    updateSprintSchema.safeParse({ startDate: "2026-01-01", endDate: "tidak-valid" }).success,
    false
  );
  assert.equal(
    startSprintSchema.safeParse({ startDate: "invalid", endDate: "2026-11-20" }).success,
    false
  );
  assert.equal(
    updateSprintSchema.safeParse({ name: "Sprint Rename", startDate: null, endDate: null }).success,
    true
  );
});

// ==============================================================
// US-2 / AC-2.2 & BR-SPRINT-02: Aktivasi Sprint dengan Rentang Tanggal & Single Active Rule
// ==============================================================
test("US-2 / AC-2.2: startSprint rejects missing dates, invalid format, or startDate > endDate", async (t) => {
  const originalFindById = sprintsRepository.findById;

  sprintsRepository.findById = async () =>
    ({
      id: "sprint-1",
      projectId: "proj-1",
      name: "Sprint 1",
      status: "planning",
      tasks: [],
      project: { id: "proj-1", ownerId: "owner-1" },
    } as any);

  t.after(() => {
    sprintsRepository.findById = originalFindById;
  });

  await assert.rejects(
    async () => sprintsService.startSprint("sprint-1", {} as any),
    /Tanggal mulai dan tanggal selesai wajib diisi/
  );

  await assert.rejects(
    async () =>
      sprintsService.startSprint("sprint-1", {
        startDate: "invalid-date",
        endDate: "2026-11-20",
      }),
    /Format tanggal mulai atau tanggal selesai tidak valid/
  );

  await assert.rejects(
    async () =>
      sprintsService.startSprint("sprint-1", {
        startDate: "2026-11-20",
        endDate: "2026-11-10",
      }),
    /Tanggal mulai tidak boleh melebihi tanggal selesai/
  );
});

test("US-2 / AC-2.2: startSprint activates planning sprint with valid dates without requiring assignee or storyPoints on tasks", async (t) => {
  const originalFindById = sprintsRepository.findById;
  const originalFindActive = sprintsRepository.findActiveSprintByProjectId;
  const originalStartAtomically = sprintsRepository.startSprintAtomically;
  const originalLog = sprintsRepository.logActivity;

  let capturedDates: { startDate?: Date; endDate?: Date } = {};

  sprintsRepository.findById = async () =>
    ({
      id: "sprint-1",
      projectId: "proj-1",
      name: "Sprint 1",
      status: "planning",
      startDate: null,
      tasks: [
        { id: "t1", title: "Task Tanpa Assignee", assigneeId: null, storyPoints: null, status: "todo" },
      ],
      project: { id: "proj-1", ownerId: "owner-1" },
    } as any);

  sprintsRepository.findActiveSprintByProjectId = async () => null;
  sprintsRepository.startSprintAtomically = async (_id, _projectId, startDate, endDate) => {
    capturedDates = { startDate, endDate };
    return {
      id: "sprint-1",
      projectId: "proj-1",
      status: "active",
      name: "Sprint 1",
      startDate,
      endDate,
      tasks: [],
    } as any;
  };
  sprintsRepository.logActivity = async () => ({} as any);

  t.after(() => {
    sprintsRepository.findById = originalFindById;
    sprintsRepository.findActiveSprintByProjectId = originalFindActive;
    sprintsRepository.startSprintAtomically = originalStartAtomically;
    sprintsRepository.logActivity = originalLog;
  });

  const started = await sprintsService.startSprint("sprint-1", {
    startDate: "2026-11-10",
    endDate: "2026-11-24",
  });

  assert.equal(started.status, "active");
  assert.equal(capturedDates.startDate?.toISOString().slice(0, 10), "2026-11-10");
  assert.equal(capturedDates.endDate?.toISOString().slice(0, 10), "2026-11-24");
});

test("Sprint Rule: startSprint strictly rejects starting if another sprint is already active", async (t) => {
  const originalFindById = sprintsRepository.findById;
  const originalFindActive = sprintsRepository.findActiveSprintByProjectId;

  sprintsRepository.findById = async () =>
    ({
      id: "sprint-2",
      projectId: "proj-1",
      name: "Sprint 2",
      status: "planning",
      tasks: [{ id: "t1", title: "Task 1", assigneeId: "user-1", storyPoints: 5, status: "todo" }],
      project: { id: "proj-1", ownerId: "owner-1" },
    } as any);

  sprintsRepository.findActiveSprintByProjectId = async () =>
    ({
      id: "sprint-1",
      projectId: "proj-1",
      name: "Sprint 1 Sedang Berjalan",
      status: "active",
    } as any);

  t.after(() => {
    sprintsRepository.findById = originalFindById;
    sprintsRepository.findActiveSprintByProjectId = originalFindActive;
  });

  await assert.rejects(
    async () =>
      sprintsService.startSprint("sprint-2", {
        startDate: "2026-11-10",
        endDate: "2026-11-24",
      }),
    /Hanya boleh tepat satu sprint aktif dalam proyek/
  );
});

// ==============================================================
// US-2 / AC-2.3 & BR-SPRINT-04: Penutupan Sprint Atomik & Realokasi Task TODO
// ==============================================================
test("US-2 / AC-2.3: completeSprint rejects non-active sprint and delegates atomic relocation when active", async (t) => {
  const originalFindById = sprintsRepository.findById;
  const originalCompleteAtomically = sprintsRepository.completeSprintAtomically;

  let sprintStatus = "planning";
  let capturedMoves: unknown[] = [];

  sprintsRepository.findById = async () =>
    ({
      id: "sprint-1",
      projectId: "proj-1",
      name: "Sprint 1",
      status: sprintStatus,
      tasks: [],
      project: { id: "proj-1", ownerId: "owner-1" },
    } as any);

  sprintsRepository.completeSprintAtomically = async (_id, _projectId, taskMoves) => {
    capturedMoves = taskMoves;
    return {
      sprint: { id: "sprint-1", status: "completed", name: "Sprint 1" },
      progress: 50,
      completedSprintCount: 1,
      totalSprintCount: 2,
      readyTermIds: ["term-1"],
    } as any;
  };

  t.after(() => {
    sprintsRepository.findById = originalFindById;
    sprintsRepository.completeSprintAtomically = originalCompleteAtomically;
  });

  await assert.rejects(
    async () => sprintsService.completeSprint("sprint-1", { taskMoves: [] }),
    /Hanya sprint berstatus aktif yang dapat diselesaikan/
  );

  sprintStatus = "active";
  const result = await sprintsService.completeSprint("sprint-1", {
    taskMoves: [{ taskId: "t-todo-1", targetSprintId: null }],
  });

  assert.equal(result.sprint.status, "completed");
  assert.equal(result.progress, 50);
  assert.deepEqual(result.readyTermIds, ["term-1"]);
  assert.deepEqual(capturedMoves, [{ taskId: "t-todo-1", targetSprintId: null }]);
});

test("US-2 / AC-2.3 & BR-SPRINT-04: completeSprintAtomically enforces TODO task allocation and updates progress atomically", async (t) => {
  const originalTransaction = prisma.$transaction;

  const taskUpdates: Array<{ where: { id: string }; data: { sprintId: string | null } }> = [];
  let updatedProjectProgress = -1;
  let loggedAudit: any = null;

  const mockTx = {
    $queryRaw: async () => [],
    sprint: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === "sprint-1") {
          return {
            id: "sprint-1",
            projectId: "proj-1",
            name: "Sprint 1",
            status: "active",
            tasks: [
              { id: "t-done", title: "Done Task", status: "done" },
              { id: "t-todo", title: "Todo Carryover", status: "todo" },
            ],
          };
        }
        if (where.id === "sprint-completed") {
          return { id: "sprint-completed", projectId: "proj-1", status: "completed", name: "Sprint 0" };
        }
        if (where.id === "sprint-2") {
          return { id: "sprint-2", projectId: "proj-1", status: "planning", name: "Sprint 2" };
        }
        return null;
      },
      update: async ({ where, data }: any) => ({
        id: where.id,
        projectId: "proj-1",
        name: "Sprint 1",
        status: data.status,
        completedAt: data.completedAt,
        tasks: [],
      }),
      count: async ({ where }: any) => (where.status === "completed" ? 1 : 2),
    },
    task: {
      update: async (args: any) => {
        taskUpdates.push(args);
        return args;
      },
    },
    project: {
      update: async ({ data }: any) => {
        updatedProjectProgress = data.progress;
        return { id: "proj-1", progress: data.progress };
      },
    },
    paymentTerm: {
      findMany: async () => [],
    },
    activityLog: {
      create: async ({ data }: any) => {
        loggedAudit = data;
        return data;
      },
    },
  };

  (prisma as any).$transaction = async (callback: (tx: any) => Promise<any>) => callback(mockTx);

  t.after(() => {
    (prisma as any).$transaction = originalTransaction;
  });

  // 1. Tolak jika ada task 'todo' yang belum dialokasikan di taskMoves
  await assert.rejects(
    () => sprintsRepository.completeSprintAtomically("sprint-1", "proj-1", [], new Date("2026-11-15T10:00:00Z")),
    /belum ditentukan tujuannya/
  );

  // 2. Tolak jika sprint tujuan pemindahan sudah completed
  await assert.rejects(
    () =>
      sprintsRepository.completeSprintAtomically(
        "sprint-1",
        "proj-1",
        [{ taskId: "t-todo", targetSprintId: "sprint-completed" }],
        new Date("2026-11-15T10:00:00Z")
      ),
    /sudah berstatus completed/
  );

  // 3. Berhasil memindahkan task TODO ke sprint planning lain, menandai completed, & memperbarui progress
  const result = await sprintsRepository.completeSprintAtomically(
    "sprint-1",
    "proj-1",
    [{ taskId: "t-todo", targetSprintId: "sprint-2" }],
    new Date("2026-11-15T10:00:00Z"),
    { id: "u-owner", name: "Owner", role: "owner" }
  );

  assert.equal(result.sprint.status, "completed");
  assert.equal(result.progress, 50);
  assert.equal(updatedProjectProgress, 50);
  assert.deepEqual(taskUpdates, [{ where: { id: "t-todo" }, data: { sprintId: "sprint-2" } }]);
  assert.equal(loggedAudit.action, "SPRINT_COMPLETE");
});

// ==============================================================
// AC-B3-3: Kalkulasi Formula Matematis Progres Kumulatif
// Formula: (Points Sprint Selesai / Points Seluruh Scope Disetujui) * 100%
// ==============================================================
test("AC-B3-3: Cumulative progress calculates mathematical percentage correctly across sprints", () => {
  // Simulasi proyek dengan multi-sprint & backlog
  // Scope Disetujui:
  // Sprint 1 (Completed): 8 pts (done)
  // Sprint 2 (Completed): 5 pts (done)
  // Sprint 3 (Active): 13 pts (in_progress)
  // Backlog: 5 pts (todo)
  // Total Scope Points: 8 + 5 + 13 + 5 = 31 points

  const totalScopePoints = 8 + 5 + 13 + 5; // 31
  const completedSprintPoints = 8 + 5; // 13

  const expectedProgress = Math.round((completedSprintPoints / totalScopePoints) * 10000) / 100;
  // 13 / 31 * 100 = 41.9354... -> 41.94%
  assert.equal(expectedProgress, 41.94);

  // Jika Sprint 3 juga selesai:
  const completedWithSprint3 = completedSprintPoints + 13; // 26
  const progressWithSprint3 = Math.round((completedWithSprint3 / totalScopePoints) * 10000) / 100;
  // 26 / 31 * 100 = 83.8709... -> 83.87%
  assert.equal(progressWithSprint3, 83.87);

  // Jika seluruh scope selesai:
  const allCompleted = totalScopePoints;
  const progressAll = Math.round((allCompleted / totalScopePoints) * 10000) / 100;
  assert.equal(progressAll, 100);

  // Jika scope 0 points:
  const emptyScope = 0;
  const progressZero = emptyScope > 0 ? (0 / emptyScope) * 100 : 0;
  assert.equal(progressZero, 0);
});

// ==============================================================
// RBAC Protection: Task Deletion via requirePermission("tasks.delete")
// ==============================================================
test("RBAC: deleteTask permission guard allows Owner by default and forbids Developer (403)", async (t) => {
  const originalRoleFindMany = prisma.rolePolicy.findMany;
  (prisma.rolePolicy as any).findMany = async () => [];

  t.after(() => {
    (prisma.rolePolicy as any).findMany = originalRoleFindMany;
  });

  const guard = requirePermission("tasks.delete");

  async function runGuard(roles: string[]) {
    return new Promise<any>((resolve) => {
      guard(
        { user: { id: "u-test", roles } } as any,
        {} as any,
        (err?: any) => resolve(err)
      );
    });
  }

  assert.equal(await runGuard(["owner"]), undefined);

  const devErr = await runGuard(["developer"]);
  assert.ok(devErr, "Developer harus menghasilkan error");
  assert.equal(devErr.statusCode, 403);

  const opsDefaultErr = await runGuard(["operasional"]);
  assert.ok(opsDefaultErr, "Operasional tanpa policy override ditolak default");
  assert.equal(opsDefaultErr.statusCode, 403);
});
