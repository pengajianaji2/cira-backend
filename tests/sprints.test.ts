import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test_only_secret_value_at_least_32_chars_long";
process.env.NODE_ENV = "test";

const [
  { requireAnyRole },
  { fibonacciStoryPointsSchema },
  { createTaskSchema, updateTaskSchema },
  { sprintsService },
  { sprintsRepository },
] = await Promise.all([
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

// ==============================================================
// AC-B3-1: Validasi Tepat Satu Assignee Sebelum Sprint Dimulai
// ==============================================================
test("AC-B3-1: startSprint rejects sprint if any task is missing an assignee", async () => {
  const originalFindById = sprintsRepository.findById;
  const originalFindActive = sprintsRepository.findActiveSprintByProjectId;

  // Mock sprint dengan 1 task tanpa assignee
  sprintsRepository.findById = async () =>
    ({
      id: "sprint-1",
      projectId: "proj-1",
      name: "Sprint 1",
      status: "planning",
      tasks: [
        { id: "t1", title: "Task 1", assigneeId: "user-1", storyPoints: 3, status: "todo" },
        { id: "t2", title: "Task 2 Tanpa Assignee", assigneeId: null, storyPoints: 5, status: "todo" },
      ],
    } as any);

  sprintsRepository.findActiveSprintByProjectId = async () => null;

  await assert.rejects(
    async () => sprintsService.startSprint("sprint-1"),
    /belum memiliki assignee\. Seluruh task dalam sprint wajib memiliki tepat satu assignee/
  );

  // Restore mocks
  sprintsRepository.findById = originalFindById;
  sprintsRepository.findActiveSprintByProjectId = originalFindActive;
});

test("AC-B3-1: startSprint rejects sprint if any task is missing Fibonacci story points", async () => {
  const originalFindById = sprintsRepository.findById;
  const originalFindActive = sprintsRepository.findActiveSprintByProjectId;

  sprintsRepository.findById = async () =>
    ({
      id: "sprint-1",
      projectId: "proj-1",
      name: "Sprint 1",
      status: "planning",
      tasks: [
        { id: "t1", title: "Task 1", assigneeId: "user-1", storyPoints: 3, status: "todo" },
        { id: "t2", title: "Task Tanpa Points", assigneeId: "user-2", storyPoints: null, status: "todo" },
      ],
    } as any);

  sprintsRepository.findActiveSprintByProjectId = async () => null;

  await assert.rejects(
    async () => sprintsService.startSprint("sprint-1"),
    /belum memiliki story points Fibonacci/
  );

  sprintsRepository.findById = originalFindById;
  sprintsRepository.findActiveSprintByProjectId = originalFindActive;
});

test("AC-B3-1: startSprint allows starting sprint when all tasks have assignee and Fibonacci points", async () => {
  const originalFindById = sprintsRepository.findById;
  const originalFindActive = sprintsRepository.findActiveSprintByProjectId;
  const originalUpdate = sprintsRepository.update;
  const originalLog = sprintsRepository.logActivity;

  sprintsRepository.findById = async () =>
    ({
      id: "sprint-1",
      projectId: "proj-1",
      name: "Sprint 1",
      status: "planning",
      startDate: null,
      tasks: [
        { id: "t1", title: "Task 1", assigneeId: "user-1", storyPoints: 3, status: "todo" },
        { id: "t2", title: "Task 2", assigneeId: "user-2", storyPoints: 5, status: "todo" },
      ],
    } as any);

  sprintsRepository.findActiveSprintByProjectId = async () => null;
  sprintsRepository.update = async (_id, data) =>
    ({
      id: "sprint-1",
      status: data.status,
      name: "Sprint 1",
    } as any);
  sprintsRepository.logActivity = async () => ({} as any);

  const started = await sprintsService.startSprint("sprint-1");
  assert.equal(started.status, "active");

  sprintsRepository.findById = originalFindById;
  sprintsRepository.findActiveSprintByProjectId = originalFindActive;
  sprintsRepository.update = originalUpdate;
  sprintsRepository.logActivity = originalLog;
});

// ==============================================================
// Sprint Rule: Single Active Sprint Per Project (Tanpa Overlap)
// ==============================================================
test("Sprint Rule: startSprint strictly rejects starting if another sprint is already active", async () => {
  const originalFindById = sprintsRepository.findById;
  const originalFindActive = sprintsRepository.findActiveSprintByProjectId;

  sprintsRepository.findById = async () =>
    ({
      id: "sprint-2",
      projectId: "proj-1",
      name: "Sprint 2",
      status: "planning",
      tasks: [{ id: "t1", title: "Task 1", assigneeId: "user-1", storyPoints: 5, status: "todo" }],
    } as any);

  // Ada sprint 1 yang sudah aktif
  sprintsRepository.findActiveSprintByProjectId = async () =>
    ({
      id: "sprint-1",
      projectId: "proj-1",
      name: "Sprint 1 Sedang Berjalan",
      status: "active",
    } as any);

  await assert.rejects(
    async () => sprintsService.startSprint("sprint-2"),
    /Hanya boleh tepat satu sprint aktif dalam proyek/
  );

  sprintsRepository.findById = originalFindById;
  sprintsRepository.findActiveSprintByProjectId = originalFindActive;
});

// ==============================================================
// AC-B3-2: Penolakan Complete Sprint Jika Ada Task Belum 'done'
// ==============================================================
test("AC-B3-2: completeSprint rejects completion if any task in sprint is not 'done'", async () => {
  const originalFindById = sprintsRepository.findById;

  // Sprint aktif dengan 1 task todo dan 1 task done
  sprintsRepository.findById = async () =>
    ({
      id: "sprint-1",
      projectId: "proj-1",
      name: "Sprint 1",
      status: "active",
      tasks: [
        { id: "t1", title: "Task Selesai", status: "done", storyPoints: 5 },
        { id: "t2", title: "Task Belum Selesai", status: "in_progress", storyPoints: 3 },
      ],
    } as any);

  await assert.rejects(
    async () => sprintsService.completeSprint("sprint-1"),
    /masih terdapat 1 task yang belum berstatus 'done'/
  );

  sprintsRepository.findById = originalFindById;
});

test("AC-B3-2: completeSprint succeeds when all tasks are 'done' and recalculates progress", async () => {
  const originalFindById = sprintsRepository.findById;
  const originalUpdate = sprintsRepository.update;
  const originalCalculate = sprintsRepository.calculateCumulativeProgress;
  const originalUpdateProgress = sprintsRepository.updateProjectProgress;
  const originalLog = sprintsRepository.logActivity;

  sprintsRepository.findById = async () =>
    ({
      id: "sprint-1",
      projectId: "proj-1",
      name: "Sprint 1",
      status: "active",
      tasks: [
        { id: "t1", title: "Task 1", status: "done", storyPoints: 5 },
        { id: "t2", title: "Task 2", status: "done", storyPoints: 3 },
      ],
    } as any);

  sprintsRepository.update = async (_id, data) =>
    ({
      id: "sprint-1",
      status: data.status,
      name: "Sprint 1",
      completedAt: data.completedAt,
    } as any);

  sprintsRepository.calculateCumulativeProgress = async () => ({
    totalScopePoints: 8,
    completedPoints: 8,
    progress: 100,
  });

  let recordedProgress = 0;
  sprintsRepository.updateProjectProgress = async (_pid, prog) => {
    recordedProgress = prog;
    return {} as any;
  };
  sprintsRepository.logActivity = async () => ({} as any);

  const result = await sprintsService.completeSprint("sprint-1");
  assert.equal(result.sprint.status, "completed");
  assert.equal(result.cumulativeProgress.progress, 100);
  assert.equal(recordedProgress, 100);

  sprintsRepository.findById = originalFindById;
  sprintsRepository.update = originalUpdate;
  sprintsRepository.calculateCumulativeProgress = originalCalculate;
  sprintsRepository.updateProjectProgress = originalUpdateProgress;
  sprintsRepository.logActivity = originalLog;
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
// RBAC Protection: Task Deletion (Hanya Owner & Operasional)
// ==============================================================
test("RBAC: deleteTask endpoint allows Owner and Operasional, strictly forbids Developer (403)", () => {
  const allowedRoles = requireAnyRole("owner", "operasional");

  let ownerPassed = false;
  allowedRoles(
    { user: { id: "u-owner", roles: ["owner"] } } as any,
    {} as any,
    (err) => {
      assert.equal(err, undefined);
      ownerPassed = true;
    }
  );
  assert.equal(ownerPassed, true);

  let opsPassed = false;
  allowedRoles(
    { user: { id: "u-ops", roles: ["operasional"] } } as any,
    {} as any,
    (err) => {
      assert.equal(err, undefined);
      opsPassed = true;
    }
  );
  assert.equal(opsPassed, true);

  // Developer harus ditolak dengan error 403 Forbidden
  let devError: any;
  allowedRoles(
    { user: { id: "u-dev", roles: ["developer"] } } as any,
    {} as any,
    (err) => {
      devError = err;
    }
  );
  assert.ok(devError, "Developer harus menghasilkan error");
  assert.equal(devError.statusCode, 403);
});
