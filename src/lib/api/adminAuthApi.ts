import { AUTH_API_BASE_URL } from "@/lib/api/authApi";

import type {
  AdminAuthenticationResponse,
  AdminLoginCredentials,
  AdminMeResponse,
} from "@/types/adminAuth";

async function readAdminErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  try {
    const result = (await response.json()) as {
      detail?: string;
      message?: string;
    };

    return (
      result.detail ||
      result.message ||
      fallbackMessage
    );
  } catch {
    return fallbackMessage;
  }
}

export async function loginAdmin(
  credentials: AdminLoginCredentials,
): Promise<AdminAuthenticationResponse> {
  let response: Response;

  try {
    response = await fetch(
      `${AUTH_API_BASE_URL}/admin/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: credentials.email.trim(),
          password: credentials.password,
        }),
      },
    );
  } catch (error) {
    console.error(
      "Administrator login connection error:",
      error,
    );

    throw new Error(
      "Unable to connect to the authentication backend. Check that the FastAPI server is running.",
    );
  }

  if (!response.ok) {
    const message =
      await readAdminErrorMessage(
        response,
        `Administrator login failed with status ${response.status}.`,
      );

    throw new Error(message);
  }

  const result =
    (await response.json()) as AdminAuthenticationResponse;

  if (
    !result.access_token ||
    !result.user ||
    result.user.role !== "admin" ||
    result.session_type !== "admin"
  ) {
    throw new Error(
      "The backend did not return a valid administrator session.",
    );
  }

  return result;
}

export async function getCurrentAdmin(
  accessToken: string,
): Promise<AdminMeResponse> {
  let response: Response;

  try {
    response = await fetch(
      `${AUTH_API_BASE_URL}/admin/me`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  } catch (error) {
    console.error(
      "Administrator session validation connection error:",
      error,
    );

    throw new Error(
      "Unable to connect to the authentication backend.",
    );
  }

  if (!response.ok) {
    const message =
      await readAdminErrorMessage(
        response,
        `Administrator session validation failed with status ${response.status}.`,
      );

    throw new Error(message);
  }

  const result =
    (await response.json()) as AdminMeResponse;

  if (
    !result.user ||
    result.user.role !== "admin"
  ) {
    throw new Error(
      "The saved session does not belong to an administrator.",
    );
  }

  return result;
}