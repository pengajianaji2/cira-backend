export type ProjectStatus = "lead" | "active" | "completed" | "cancelled";
export type ProjectRepoType = "monorepo" | "separate";

export interface CreateProjectDto {
  name: string;
  clientName: string;
  clientContact: string;
  contractValue?: number;
  prdContent?: string;
  repoType?: ProjectRepoType;
}

export interface UpdateProjectDto {
  name?: string;
  clientName?: string;
  clientContact?: string;
  prdContent?: string;
  repoType?: ProjectRepoType;
}

export interface ProjectQueryFilter {
  status?: ProjectStatus;
  search?: string;
}

export interface ProjectListingQuery extends ProjectQueryFilter {
  page: number;
  limit: number;
}
