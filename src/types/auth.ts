export type UserRole = "user" | "admin";

export interface AuthUser {
  id?: number | string;
  email: string;
  role: UserRole;

  full_name?: string;
  fullname?: string;
  name?: string;

  age?: number;
  gender?: string;

  token_kind?: "user" | "admin";
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthenticationResponse {
  access_token: string;
  token_type?: string;
  user: AuthUser;
}

export interface MeResponse {
  user: AuthUser;
}