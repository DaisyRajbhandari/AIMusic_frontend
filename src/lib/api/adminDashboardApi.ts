import { AUTH_API_BASE_URL } from "@/lib/api/authApi";

import type {
  AdminGenerationsResponse,
  ApiErrorResponse,
  GenerationAnalysis,
  ResearchDashboardData,
  TrainingRunsResponse,
} from "@/types/adminDashboard";

export class AdminDashboardApiError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(message);

    this.name = "AdminDashboardApiError";
    this.status = status;
  }
}

interface AdminRequestOptions
  extends Omit<RequestInit, "headers"> {
  headers?: HeadersInit;
}

async function readResponseBody(
  response: Response,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function getErrorMessage(
  result: unknown,
  fallbackMessage: string,
): string {
  if (
    result &&
    typeof result === "object"
  ) {
    const errorResponse =
      result as ApiErrorResponse;

    return (
      errorResponse.detail ||
      errorResponse.message ||
      fallbackMessage
    );
  }

  return fallbackMessage;
}

async function requestAdminJson<T>(
  path: string,
  accessToken: string,
  options: AdminRequestOptions = {},
): Promise<T> {
  if (!accessToken.trim()) {
    throw new AdminDashboardApiError(
      "Administrator session is missing.",
      401,
    );
  }

  const headers = new Headers(
    options.headers,
  );

  headers.set(
    "Authorization",
    `Bearer ${accessToken}`,
  );

  if (
    options.body &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  let response: Response;

  try {
    response = await fetch(
      `${AUTH_API_BASE_URL}${path}`,
      {
        ...options,
        headers,
      },
    );
  } catch (error) {
    console.error(
      "Administrator dashboard connection error:",
      error,
    );

    throw new AdminDashboardApiError(
      "Unable to connect to the administrator backend.",
      0,
    );
  }

  const result =
    await readResponseBody(response);

  if (response.status === 401) {
    throw new AdminDashboardApiError(
      getErrorMessage(
        result,
        "Your administrator session has expired.",
      ),
      response.status,
    );
  }

  if (response.status === 403) {
    throw new AdminDashboardApiError(
      getErrorMessage(
        result,
        "Administrator access is required. A user token cannot open this dashboard.",
      ),
      response.status,
    );
  }

  if (!response.ok) {
    throw new AdminDashboardApiError(
      getErrorMessage(
        result,
        `Request failed with status ${response.status}.`,
      ),
      response.status,
    );
  }

  return result as T;
}

export function isAdminAuthorizationError(
  error: unknown,
): boolean {
  return (
    error instanceof
      AdminDashboardApiError &&
    (error.status === 401 ||
      error.status === 403)
  );
}

export async function getTrainingRuns(
  accessToken: string,
  signal?: AbortSignal,
): Promise<TrainingRunsResponse> {
  return requestAdminJson<TrainingRunsResponse>(
    "/admin/research/runs",
    accessToken,
    {
      method: "GET",
      signal,
    },
  );
}

export async function getResearchDashboard(
  accessToken: string,
  runId?: number | string | null,
  batchLimit = 5000,
  signal?: AbortSignal,
): Promise<ResearchDashboardData> {
  const searchParameters =
    new URLSearchParams();

  if (
    runId !== undefined &&
    runId !== null &&
    String(runId).trim()
  ) {
    searchParameters.set(
      "run_id",
      String(runId),
    );
  }

  searchParameters.set(
    "batch_limit",
    String(batchLimit),
  );

  const query =
    searchParameters.toString();

  return requestAdminJson<ResearchDashboardData>(
    `/admin/research/dashboard?${query}`,
    accessToken,
    {
      method: "GET",
      signal,
    },
  );
}

export async function getAdminGenerations(
  accessToken: string,
  signal?: AbortSignal,
): Promise<AdminGenerationsResponse> {
  return requestAdminJson<AdminGenerationsResponse>(
    "/admin/generations",
    accessToken,
    {
      method: "GET",
      signal,
    },
  );
}

export async function getGenerationAnalysis(
  accessToken: string,
  generationId: number | string,
  signal?: AbortSignal,
): Promise<GenerationAnalysis> {
  const encodedGenerationId =
    encodeURIComponent(
      String(generationId),
    );

  return requestAdminJson<GenerationAnalysis>(
    `/admin/generations/${encodedGenerationId}/analysis`,
    accessToken,
    {
      method: "GET",
      signal,
    },
  );
}