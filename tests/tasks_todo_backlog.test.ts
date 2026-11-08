import test from "node:test";
import assert from "node:assert/strict";
import {
  createTaskSchema,
  updateTaskStatusSchema,
  moveTaskToSprintSchema,
} from "../src/features/tasks/tasks.schema.js";

test("US-1 / AC-1.1: Status tunggal task hanya 'todo' atau 'done'", () => {
  // Valid 'todo'
  const validTodo = createTaskSchema.safeParse({
    title: "Buat halaman login",
    status: "todo",
  });
  assert.equal(validTodo.success, true);
  if (validTodo.success) {
    assert.equal(validTodo.data.status, "todo");
  }

  // Valid 'done'
  const validDone = createTaskSchema.safeParse({
    title: "Setup database PostgreSQL",
    status: "done",
  });
  assert.equal(validDone.success, true);
  if (validDone.success) {
    assert.equal(validDone.data.status, "done");
  }

  // Reject status legacy 'in_progress'
  const invalidInProgress = createTaskSchema.safeParse({
    title: "Implementasi auth JWT",
    status: "in_progress",
  });
  assert.equal(invalidInProgress.success, false);

  // Reject status sembarang
  const invalidStatus = createTaskSchema.safeParse({
    title: "Testing invalid status",
    status: "doing",
  });
  assert.equal(invalidStatus.success, false);
});

test("US-1 / AC-1.1: updateTaskStatusSchema hanya mengizinkan 'todo' dan 'done'", () => {
  assert.equal(updateTaskStatusSchema.safeParse({ status: "todo" }).success, true);
  assert.equal(updateTaskStatusSchema.safeParse({ status: "done" }).success, true);
  assert.equal(updateTaskStatusSchema.safeParse({ status: "in_progress" }).success, false);
  assert.equal(updateTaskStatusSchema.safeParse({ status: "pending" }).success, false);
});

test("US-1 / AC-1.2: Task baru tanpa sprintId default ke Backlog (sprintId = null/undefined)", () => {
  const result = createTaskSchema.safeParse({
    title: "Task backlog baru",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.status, "todo");
    assert.equal(result.data.sprintId, undefined);
  }
});

test("US-1 / AC-1.3: moveTaskToSprintSchema mengizinkan string sprintId atau null (kembali ke Backlog)", () => {
  // Ke sprint baru
  const toSprint = moveTaskToSprintSchema.safeParse({
    targetSprintId: "sprint-uuid-123",
  });
  assert.equal(toSprint.success, true);
  if (toSprint.success) {
    assert.equal(toSprint.data.targetSprintId, "sprint-uuid-123");
  }

  // Ke backlog (null)
  const toBacklog = moveTaskToSprintSchema.safeParse({
    targetSprintId: null,
  });
  assert.equal(toBacklog.success, true);
  if (toBacklog.success) {
    assert.equal(toBacklog.data.targetSprintId, null);
  }

  // Invalid: number or object
  const invalid = moveTaskToSprintSchema.safeParse({
    targetSprintId: 12345,
  });
  assert.equal(invalid.success, false);
});
