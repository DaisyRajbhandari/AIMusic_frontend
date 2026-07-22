import { AUTH_API_BASE_URL } from "@/lib/api/authApi";

import type {
  CreateGenerationData,
  CreateGenerationResponse,
  GenerationApiErrorResponse,
  GenerationHistoryResponse,
  GenerationRecord,
} from "@/types/generation";

export class GenerationApiError extends Error {
  readonly status: number;
  readonly generation: GenerationRecord | null;

  constructor(
    message: string,
    status: number,
    generation: GenerationRecord | null = null,
  ) {
    super(message);

    this.name = "GenerationApiError";
    this.status = status;
    this.generation = generation;
  }
}

async function readJsonResponse(
  response: Response,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function readErrorMessage(
  result: unknown,
  fallbackMessage: string,
): string {
  if (
    result &&
    typeof result === "object"
  ) {
    const errorResult =
      result as GenerationApiErrorResponse;

    return (
      errorResult.detail ||
      errorResult.message ||
      fallbackMessage
    );
  }

  return fallbackMessage;
}

function readFailedGeneration(
  result: unknown,
): GenerationRecord | null {
  if (
    !result ||
    typeof result !== "object"
  ) {
    return null;
  }

  const errorResult =
    result as GenerationApiErrorResponse;

  if (
    !errorResult.request ||
    typeof errorResult.request !== "object"
  ) {
    return null;
  }

  return errorResult.request;
}

export function isUserAuthorizationError(
  error: unknown,
): boolean {
  return (
    error instanceof GenerationApiError &&
    (error.status === 401 ||
      error.status === 403)
  );
}

export async function createGeneration(
  generationData: CreateGenerationData,
  accessToken: string,
  signal?: AbortSignal,
): Promise<CreateGenerationResponse> {
  if (!accessToken.trim()) {
    throw new GenerationApiError(
      "Your user session is missing. Please log in again.",
      401,
    );
  }

  let response: Response;

  try {
    response = await fetch(
      `${AUTH_API_BASE_URL}/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          prompt: generationData.prompt.trim(),
          mood: generationData.mood.trim(),
          genre: generationData.genre.trim(),
          tempo: generationData.tempo.trim(),
          instrument:
            generationData.instrument.trim(),
          structure:
            generationData.structure.trim(),
        }),
        signal,
      },
    );
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw error;
    }

    console.error(
      "Generation connection error:",
      error,
    );

    throw new GenerationApiError(
      "Unable to connect to the generation backend.",
      0,
    );
  }

  const result =
    await readJsonResponse(response);

  if (!response.ok) {
    const failedGeneration =
      readFailedGeneration(result);

    throw new GenerationApiError(
      readErrorMessage(
        result,
        `Generation failed with status ${response.status}.`,
      ),
      response.status,
      failedGeneration,
    );
  }

  const generationResponse =
    result as CreateGenerationResponse;

  if (
    !generationResponse.request ||
    generationResponse.request.id ===
      undefined
  ) {
    throw new GenerationApiError(
      "The backend returned an invalid generation response.",
      response.status,
    );
  }

  return generationResponse;
}

export async function getUserGenerations(
  accessToken: string,
  signal?: AbortSignal,
): Promise<GenerationHistoryResponse> {
  if (!accessToken.trim()) {
    throw new GenerationApiError(
      "Your user session is missing. Please log in again.",
      401,
    );
  }

  let response: Response;

  try {
    response = await fetch(
      `${AUTH_API_BASE_URL}/generations`,
      {
        method: "GET",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
        signal,
      },
    );
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw error;
    }

    console.error(
      "Generation history connection error:",
      error,
    );

    throw new GenerationApiError(
      "Unable to connect to the generation history backend.",
      0,
    );
  }

  const result =
    await readJsonResponse(response);

  if (!response.ok) {
    throw new GenerationApiError(
      readErrorMessage(
        result,
        `Generation history request failed with status ${response.status}.`,
      ),
      response.status,
    );
  }

  const historyResponse =
    result as GenerationHistoryResponse;

  return {
    generations: Array.isArray(
      historyResponse.generations,
    )
      ? historyResponse.generations
      : [],
  };
}