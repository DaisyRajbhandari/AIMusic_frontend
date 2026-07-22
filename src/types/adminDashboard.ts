export type DashboardMetric =
  | number
  | null;

export type DashboardTimestamp =
  | number
  | string
  | null;

export type JsonPrimitive =
  | string
  | number
  | boolean
  | null;

export type JsonValue =
  | JsonPrimitive
  | JsonObject
  | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface TrainingRun {
  id: number | string;

  userEmail?: string | null;

  runName: string;
  baseModel: string;

  totalParameters: number;
  trainableParameters: number;
  trainablePercentage?: DashboardMetric;

  loraRank: number;
  loraAlpha: number;

  learningRate?: DashboardMetric;
  batchSize?: number | null;
  totalEpochs?: number | null;

  status?: string | null;

  startedAt?: DashboardTimestamp;
  completedAt?: DashboardTimestamp;
  createdAt?: DashboardTimestamp;

  averageEpochTime?: DashboardMetric;
  savedEpochs?: number | null;
}

export interface TrainingSummary {
  latestEpoch?: number | null;

  trainLoss?: DashboardMetric;
  trainPerplexity?: DashboardMetric;

  evalLoss?: DashboardMetric;
  evalPerplexity?: DashboardMetric;

  bestEvalLoss?: DashboardMetric;
  bestEvalPerplexity?: DashboardMetric;
  bestEpoch?: number | null;

  averageEpochTimeSeconds?: DashboardMetric;
}

export interface EpochMetric {
  id?: number | string;
  runId?: number | string;

  epoch: number;

  trainLoss?: DashboardMetric;
  trainPerplexity?: DashboardMetric;

  evalLoss?: DashboardMetric;
  evalPerplexity?: DashboardMetric;

  bestEvalLoss?: DashboardMetric;
  bestEvalPerplexity?: DashboardMetric;

  learningRate?: DashboardMetric;
  epochTimeSeconds?: DashboardMetric;

  checkpointPath?: string | null;
}

export interface TaskMetric {
  id?: number | string;
  runId?: number | string;

  taskName: string;
  epoch?: number | null;

  trainLoss?: DashboardMetric;
  trainPerplexity?: DashboardMetric;

  evalLoss?: DashboardMetric;
  evalPerplexity?: DashboardMetric;

  bestEvalLoss?: DashboardMetric;
  bestEvalPerplexity?: DashboardMetric;
  bestEpoch?: number | null;

  adapterWeight?: DashboardMetric;
  sampleCount?: number | null;
}

export interface BatchMetric {
  id?: number | string;
  runId?: number | string;

  epoch?: number | null;
  batch?: number | null;
  globalStep: number;

  taskName?: string | null;

  loss?: DashboardMetric;
  perplexity?: DashboardMetric;
  learningRate?: DashboardMetric;
}

export type TaskMetricSeries =
  Record<string, TaskMetric[]>;

export interface ResearchDashboardData {
  run: TrainingRun | null;
  summary: TrainingSummary | null;

  epochs: EpochMetric[];
  tasks: TaskMetric[];
  taskSeries: TaskMetricSeries;
  batches: BatchMetric[];
}

export interface TrainingRunsResponse {
  runs: TrainingRun[];
}

export interface AdminGeneration {
  id: number | string;

  userEmail?: string | null;

  title?: string | null;
  prompt: string;
  fullPrompt?: string | null;

  mood?: string | null;
  genre?: string | null;
  tempo?: string | null;
  instrument?: string | null;
  structure?: string | null;

  status?: string | null;
  message?: string | null;

  structuredPlan?: JsonValue;
  midiNotes?: JsonValue;

  midiFilePath?: string | null;
  createdAt?: DashboardTimestamp;
}

export interface AdminGenerationsResponse {
  generations: AdminGeneration[];
}

export interface CoherenceScore {
  sectionName: string;

  chordAdherence?: DashboardMetric;
  harmonicStability?: DashboardMetric;
  rhythmicRegularity?: DashboardMetric;
  motifSimilarity?: DashboardMetric;
  densityFidelity?: DashboardMetric;
  transitionQuality?: DashboardMetric;
  emotionalAlignment?: DashboardMetric;
  promptAlignment?: DashboardMetric;

  overallScore?: DashboardMetric;
}

export interface CriticTraceEntry {
  key?: string;
  value?: JsonValue;

  [key: string]: JsonValue | undefined;
}

export interface GenerationAnalysis {
  generationId: number | string;
  originalPrompt: string;

  intent: JsonObject;
  structurePlan: JsonValue;
  routing: JsonObject;

  criticTrace:
    | CriticTraceEntry[]
    | JsonObject;

  midiFilePath?: string | null;
  audioFilePath?: string | null;

  coherenceScores: CoherenceScore[];
}

export interface ApiErrorResponse {
  detail?: string;
  message?: string;
}