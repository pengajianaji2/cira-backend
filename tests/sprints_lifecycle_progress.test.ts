import test from "node:test";
import assert from "node:assert/strict";
import {
  createSprintSchema,
  startSprintSchema,
  closeSprintSchema,
} from "../src/features/sprints/sprints.schema.js";

test("US-2 / AC-2.1: createSprintSchema mengizinkan tanggal kosong saat planning", () => {
  const emptyDates = createSprintSchema.safeParse({
    name: "Sprint 1 Planning",
  });
  assert.equal(emptyDates.success, true);
  if (emptyDates.success) {
    assert.equal(emptyDates.data.name, "Sprint 1 Planning");
    assert.equal(emptyDates.data.startDate, undefined);
    assert.equal(emptyDates.data.endDate, undefined);
  }
});

test("US-2 / AC-2.1: createSprintSchema memvalidasi startDate <= endDate jika keduanya diisi", () => {
  // Valid start <= end
  const valid = createSprintSchema.safeParse({
    name: "Sprint 1 Planning",
    startDate: "2026-11-01",
    endDate: "2026-11-14",
  });
  assert.equal(valid.success, true);

  // Invalid start > end
  const invalid = createSprintSchema.safeParse({
    name: "Sprint 1 Planning",
    startDate: "2026-11-20",
    endDate: "2026-11-10",
  });
  assert.equal(invalid.success, false);
});

test("US-2 / AC-2.2: startSprintSchema mewajibkan startDate dan endDate valid serta start <= end", () => {
  // Valid
  const valid = startSprintSchema.safeParse({
    startDate: "2026-11-10",
    endDate: "2026-11-24",
  });
  assert.equal(valid.success, true);

  // Missing startDate
  const missingStart = startSprintSchema.safeParse({
    endDate: "2026-11-24",
  });
  assert.equal(missingStart.success, false);

  // Missing endDate
  const missingEnd = startSprintSchema.safeParse({
    startDate: "2026-11-10",
  });
  assert.equal(missingEnd.success, false);

  // Invalid start > end
  const invalidDates = startSprintSchema.safeParse({
    startDate: "2026-11-25",
    endDate: "2026-11-10",
  });
  assert.equal(invalidDates.success, false);
});

test("US-2 / AC-2.3: closeSprintSchema menerima taskMoves dengan tujuan sprintId atau null (Backlog)", () => {
  const result = closeSprintSchema.safeParse({
    taskMoves: [
      { taskId: "task-1", targetSprintId: null }, // ke Backlog
      { taskId: "task-2", targetSprintId: "sprint-2" }, // ke Sprint 2
    ],
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.taskMoves.length, 2);
    assert.equal(result.data.taskMoves[0].targetSprintId, null);
    assert.equal(result.data.taskMoves[1].targetSprintId, "sprint-2");
  }
});

test("US-2 / AC-2.5: Rumus progres proyek: completedSprintCount / totalSprintCount * 100%", () => {
  function calculateProgress(completed: number, total: number): number {
    if (total === 0) return 0;
    return Math.min(100, Math.round((completed / total) * 1000) / 10);
  }

  // Total 0
  assert.equal(calculateProgress(0, 0), 0);

  // 1 selesai dari 3 total sprint
  assert.equal(calculateProgress(1, 3), 33.3);

  // 2 selesai dari 4 total sprint
  assert.equal(calculateProgress(2, 4), 50);

  // 3 selesai dari 3 total sprint
  assert.equal(calculateProgress(3, 3), 100);
});
