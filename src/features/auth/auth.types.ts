export interface UserResponse {
  id: string;
  name: string;
  email: string;
  roles: string[];
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
}

export interface ChangePasswordInput {
  oldPassword: string;
  newPassword: string;
}
