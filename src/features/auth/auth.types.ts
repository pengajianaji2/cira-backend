export interface UserResponse {
  id: string;
  name: string;
  email: string;
  roles: string[];
  whatsapp?: string | null;
  instagram?: string | null;
  isActive: boolean;
  isPrimaryOwner: boolean;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface ProfileInput {
  name: string;
  email: string;
  whatsapp?: string;
  instagram?: string;
}

export interface ChangePasswordInput {
  oldPassword: string;
  newPassword: string;
}

export interface InviteUserInput {
  email: string;
  role: "developer" | "operasional";
}

export interface UserInvitationResponse {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  emailSent: boolean;
}

export interface ActivateUserInput {
  token: string;
  name: string;
  password: string;
  confirmPassword?: string;
  whatsapp: string;
  instagram: string;
}

export interface UpdateUserRoleInput {
  roles: string[];
}

export interface UpdateUserStatusInput {
  isActive: boolean;
}

export interface DirectoryUserResponse {
  id: string;
  name: string;
  email: string;
  whatsapp: string | null;
  instagram: string | null;
  roles: string[];
  isActive: boolean;
  isPrimaryOwner: boolean;
  avatarUrl?: string | null;
  createdAt: string;
}
