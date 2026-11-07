export type SprintStatus = "planning" | "active" | "completed";

export const FIBONACCI_POINTS = [1, 2, 3, 5, 8, 13] as const;
export type FibonacciPoint = (typeof FIBONACCI_POINTS)[number];

export interface CreateSprintDto {
  name: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
}

export interface UpdateSprintDto {
  name?: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
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
  totalPoints: number;
  completedPoints: number;
  totalTasks: number;
  completedTasks: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectCumulativeProgress {
  projectId: string;
  totalScopePoints: number;
  completedPoints: number;
  progress: number; // in percent (0 - 100)
}
