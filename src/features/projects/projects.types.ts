export type ProjectStatus = "lead" | "active" | "completed" | "cancelled";

export interface CreateProjectDto {
  name: string;
  clientName: string;
  clientContact: string;
  contractValue?: number;
  prdContent?: string;
}

export interface UpdateProjectDto {
  name?: string;
  clientName?: string;
  clientContact?: string;
  status?: ProjectStatus;
  contractValue?: number;
  prdContent?: string;
}

export interface ProjectQueryFilter {
  status?: ProjectStatus;
  search?: string;
}
