import type {
  AuthenticationResponse,
  ForgotPasswordRequestData,
  LoginCredentials,
  MeResponse,
  MessageResponse,
  RegisterData,
  ResetPasswordData,
} from "@/types/auth";

const configuredAuthApiUrl = import.meta.env.VITE_AUTH_API_URL;

export const AUTH_API_BASE_URL = (
  configuredAuthApiUrl || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

async function readErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  try {
    const result = (await response.json()) as {
      detail?: string;
      message?: string;
    };

    return result.detail || result.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export async function loginUser(
  credentials: LoginCredentials,
): Promise<AuthenticationResponse> {
  let response: Response;

  try {
    response = await fetch(`${AUTH_API_BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: credentials.email.trim(),
        password: credentials.password,
      }),
    });
  } catch (error) {
    console.error("Login connection error:", error);

    throw new Error(
      "Unable to connect to the authentication backend. Check that the FastAPI server is running.",
    );
  }

  if (!response.ok) {
    const message = await readErrorMessage(
      response,
      `Login failed with status ${response.status}.`,
    );

    throw new Error(message);
  }

  const result = (await response.json()) as AuthenticationResponse;

  if (!result.access_token || !result.user) {
    throw new Error(
      "The login response did not include an access token and user information.",
    );
  }

  return result;
}
export async function registerUser(
  registrationData: RegisterData,
): Promise<AuthenticationResponse> {
  let response: Response;

  try {
    response = await fetch(`${AUTH_API_BASE_URL}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: registrationData.fullName.trim(),
        email: registrationData.email.trim(),
        age: registrationData.age.trim(),
        gender: registrationData.gender.trim(),
        password: registrationData.password,
      }),
    });
  } catch (error) {
    console.error("Registration connection error:", error);

    throw new Error(
      "Unable to connect to the authentication backend. Check that the FastAPI server is running.",
    );
  }

  if (!response.ok) {
    const message = await readErrorMessage(
      response,
      `Registration failed with status ${response.status}.`,
    );

    throw new Error(message);
  }

  const result =
    (await response.json()) as AuthenticationResponse;

  if (!result.access_token || !result.user) {
    throw new Error(
      "The registration response did not include an access token and user information.",
    );
  }

  return result;
}

export async function requestPasswordResetCode(
  requestData: ForgotPasswordRequestData,
): Promise<MessageResponse> {
  let response: Response;

  try {
    response = await fetch(
      `${AUTH_API_BASE_URL}/forgot-password/request`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: requestData.email.trim(),
        }),
      },
    );
  } catch (error) {
    console.error(
      "Password reset request connection error:",
      error,
    );

    throw new Error(
      "Unable to connect to the authentication backend. Check that the FastAPI server is running.",
    );
  }

  if (!response.ok) {
    const message = await readErrorMessage(
      response,
      `Password reset request failed with status ${response.status}.`,
    );

    throw new Error(message);
  }

  const result = (await response.json()) as MessageResponse;

  return {
    message:
      result.message ||
      "If an account exists for that email, a reset code has been sent.",
  };
}

export async function resetPassword(
  resetData: ResetPasswordData,
): Promise<MessageResponse> {
  let response: Response;

  try {
    response = await fetch(
      `${AUTH_API_BASE_URL}/forgot-password/reset`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: resetData.email.trim(),
          code: resetData.code.trim(),
          newPassword: resetData.newPassword,
        }),
      },
    );
  } catch (error) {
    console.error(
      "Password reset connection error:",
      error,
    );

    throw new Error(
      "Unable to connect to the authentication backend. Check that the FastAPI server is running.",
    );
  }

  if (!response.ok) {
    const message = await readErrorMessage(
      response,
      `Password reset failed with status ${response.status}.`,
    );

    throw new Error(message);
  }

  const result = (await response.json()) as MessageResponse;

  return {
    message:
      result.message ||
      "Your password has been reset successfully.",
  };
}

export async function getCurrentUser(
  accessToken: string,
): Promise<MeResponse> {
  let response: Response;

  try {
    response = await fetch(`${AUTH_API_BASE_URL}/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch (error) {
    console.error("Session validation connection error:", error);

    throw new Error(
      "Unable to connect to the authentication backend.",
    );
  }

  if (!response.ok) {
    const message = await readErrorMessage(
      response,
      `Session validation failed with status ${response.status}.`,
    );

    throw new Error(message);
  }

  const result = (await response.json()) as MeResponse;

  if (!result.user) {
    throw new Error(
      "The session validation response did not include user information.",
    );
  }

  return result;
}