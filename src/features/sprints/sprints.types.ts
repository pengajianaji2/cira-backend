export type SprintStatus = "planning" | "active" | "completed";

export interface CreateSprintDto {
  name: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  tasks?: Array<{
    title: string;
    description?: string;
    priority?: "low" | "medium" | "high" | "urgent";
    assigneeId?: string | null;
  }>;
}

export interface UpdateSprintDto {
  name?: string;
  goal?: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface StartSprintDto {
  startDate: string;
  endDate: string;
}

export interface TaskMoveTarget {
  taskId: string;
  targetSprintId: string;
}

export interface CloseSprintDto {
  taskMoves?: TaskMoveTarget[];
}

export interface AssignTasksToSprintDto {
  taskIds: string[];
}

export interface SprintSummary {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  startDate: Date | null;
  endDate: Date | null;
  completedAt: Date | null;
  totalTasks: number;
  completedTasks: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectCumulativeProgress {
  projectId: string;
  totalTasks: number;
  completedTasks: number;
  progress: number; // in percent (0 - 100)
  completedSprintCount?: number;
  totalSprintCount?: number;
}
