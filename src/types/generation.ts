export type GenerationStatus =
  | "completed"
  | "failed"
  | "pending"
  | string;

export type GenerationJsonPrimitive =
  | string
  | number
  | boolean
  | null;

export type GenerationJsonValue =
  | GenerationJsonPrimitive
  | GenerationJsonObject
  | GenerationJsonValue[];

export interface GenerationJsonObject {
  [key: string]: GenerationJsonValue;
}

export interface CreateGenerationData {
  prompt: string;
  mood: string;
  genre: string;
  tempo: string;
  instrument: string;
  structure: string;
}

export interface GenerationCoherenceScore {
  sectionName?: string;

  chordAdherence?: number | null;
  harmonicStability?: number | null;
  rhythmicRegularity?: number | null;
  motifSimilarity?: number | null;
  densityFidelity?: number | null;
  transitionQuality?: number | null;
  emotionalAlignment?: number | null;
  promptAlignment?: number | null;
  overallScore?: number | null;

  [key: string]:
    | string
    | number
    | null
    | undefined;
}

export interface GenerationRecord {
  id: number | string;

  title: string;
  prompt: string;
  fullPrompt?: string;

  mood: string;
  genre: string;
  tempo: string;
  instrument: string;
  structure: string;

  status: GenerationStatus;
  message?: string | null;

  musicSpec?:
    | GenerationJsonObject
    | GenerationJsonValue[];

  structuredPlan?:
    | GenerationJsonObject
    | GenerationJsonValue[];

  routing?:
    | GenerationJsonObject
    | GenerationJsonValue[];

  criticTrace?:
    | GenerationJsonObject
    | GenerationJsonValue[];

  coherenceScores?:
    GenerationCoherenceScore[];

  midiFilePath?: string | null;
  audioFilePath?: string | null;

  createdAt?: number | string | null;
}

export interface CreateGenerationResponse {
  message: string;
  request: GenerationRecord;
}

export interface GenerationHistoryItem {
  id: number | string;

  title: string;
  prompt: string;
  fullPrompt?: string;

  mood: string;
  genre: string;
  tempo: string;
  instrument: string;
  structure: string;

  status: GenerationStatus;
  message?: string | null;

  structuredPlan?:
    | GenerationJsonObject
    | GenerationJsonValue[];

  midiNotes?:
    | GenerationJsonObject
    | GenerationJsonValue[];

  midiFilePath?: string | null;
  audioFilePath?: string | null;

  createdAt?: number | string | null;
}

export interface GenerationHistoryResponse {
  generations: GenerationHistoryItem[];
}

export interface GenerationApiErrorResponse {
  detail?: string;
  message?: string;
  request?: GenerationRecord;
}