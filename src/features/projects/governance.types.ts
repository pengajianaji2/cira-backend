export type ProjectStatus = "lead" | "active" | "completed" | "cancelled";
export type ProjectRepoType = "monorepo" | "separate";
export type VoteChoice = "approve" | "reject";
export type RequestStatus = "pending" | "approved" | "rejected";

export interface AddRosterMemberDto {
  userId: string;
  roleInProject?: string;
}

export interface CreateStatusRequestDto {
  targetStatus: ProjectStatus;
  reason: string;
}

export interface SubmitVoteDto {
  vote: VoteChoice;
  reason?: string;
}

export interface OwnerFinalDecisionDto {
  decision: VoteChoice;
  reason?: string;
}

export interface CreateRepoLinkDto {
  label: string;
  url: string;
}

export interface UpdateRepoLinkDto {
  label?: string;
  url?: string;
}

export interface UpdateRepoTypeDto {
  repoType: ProjectRepoType;
}

export interface SavePrdVersionDto {
  content: string;
  description?: string;
}
