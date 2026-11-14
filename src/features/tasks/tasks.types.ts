export type TaskStatus = "todo" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface CreateTaskDto {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  order?: number;
  sprintId: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeRole?: string;
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  order?: number;
  sprintId?: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
  assigneeRole?: string | null;
}

export interface UpdateTaskStatusDto {
  status: TaskStatus;
  order?: number;
}

export interface MoveTaskToSprintDto {
  targetSprintId: string;
}

export interface ProjectTasksResult {
  tasks: any[];
  hasVerifiedDp: boolean;
  dpWarning: boolean;
}
