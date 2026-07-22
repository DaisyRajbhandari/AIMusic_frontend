import type {
  AuthUser,
  LoginCredentials,
} from "@/types/auth";

export type AdminLoginCredentials =
  LoginCredentials;

export interface AdminUser
  extends Omit<
    AuthUser,
    "role" | "token_kind"
  > {
  role: "admin";
  token_kind?: "admin";
}

export interface AdminAuthenticationResponse {
  message?: string;
  access_token: string;
  token_type?: string;
  session_type: "admin";
  user: AdminUser;
}

export interface AdminMeResponse {
  user: AdminUser;
}