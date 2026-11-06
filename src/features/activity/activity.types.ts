export type ActivityCategory =
  | "project"
  | "task"
  | "finance"
  | "asset"
  | "auth";

export interface CreateActivityDto {
  category: ActivityCategory;
  action: string;
  description: string;
  metadata?: any;
}

export interface ActivityFilterQuery {
  category?: ActivityCategory;
  limit?: number;
}
