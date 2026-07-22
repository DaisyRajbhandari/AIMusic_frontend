/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { AUTH_API_BASE_URL } from "@/lib/api/authApi";
import {
  getAdminGenerations,
  getGenerationAnalysis,
  getResearchDashboard,
  getTrainingRuns,
  isAdminAuthorizationError,
} from "@/lib/api/adminDashboardApi";

import type {
  AdminGeneration,
  GenerationAnalysis,
  ResearchDashboardData,
  TrainingRun,
} from "@/types/adminDashboard";

import "./AdminDashboard.css";

const EMPTY_DASHBOARD: ResearchDashboardData = {
  run: null,
  summary: null,
  epochs: [],
  tasks: [],
  taskSeries: {},
  batches: [],
};

const COHERENCE_FIELDS = [
  ["overallScore", "Overall Coherence"],
  ["chordAdherence", "Chord Adherence"],
  ["harmonicStability", "Harmonic Stability"],
  ["rhythmicRegularity", "Rhythmic Regularity"],
  ["motifSimilarity", "Motif Similarity"],
  ["densityFidelity", "Density Fidelity"],
  ["transitionQuality", "Transition Quality"],
  ["emotionalAlignment", "Emotional Alignment"],
  ["promptAlignment", "Prompt Alignment"],
];

const LOSS_SERIES = [
  { key: "trainLoss", label: "Train loss", color: "#38bdf8" },
  { key: "evalLoss", label: "Evaluation loss", color: "#f472b6" },
  { key: "bestEvalLoss", label: "Best evaluation loss", color: "#a78bfa" },
];

const PERPLEXITY_SERIES = [
  { key: "trainPerplexity", label: "Train perplexity", color: "#22c55e" },
  { key: "evalPerplexity", label: "Evaluation perplexity", color: "#f59e0b" },
  {
    key: "bestEvalPerplexity",
    label: "Best evaluation perplexity",
    color: "#c084fc",
  },
];

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function formatMetric(value, digits = 3) {
  return isNumber(value) ? value.toFixed(digits) : "—";
}

function formatParameterCount(value) {
  if (!isNumber(value)) return "—";

  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }

  return String(value);
}

function formatDuration(totalSeconds) {
  if (!isNumber(totalSeconds)) return "—";

  const roundedSeconds = Math.round(totalSeconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatDate(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const date =
    typeof value === "number"
      ? new Date(value * 1000)
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function formatLabel(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function toPercentage(value) {
  if (!isNumber(value)) return null;

  const percentage = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percentage));
}

function buildFileUrl(filePath) {
  if (!filePath) return "";

  if (/^https?:\/\//i.test(filePath)) {
    return filePath;
  }

  const cleanBaseUrl = AUTH_API_BASE_URL.replace(/\/$/, "");
  const cleanPath = String(filePath).replace(/^\//, "");

  return `${cleanBaseUrl}/${cleanPath}`;
}

function getStructureSections(structurePlan) {
  if (Array.isArray(structurePlan)) {
    return structurePlan;
  }

  if (!structurePlan || typeof structurePlan !== "object") {
    return [];
  }

  const preferredKeys = [
    "sections",
    "structure",
    "form",
    "timeline",
    "segments",
  ];

  for (const key of preferredKeys) {
    if (Array.isArray(structurePlan[key])) {
      return structurePlan[key];
    }
  }

  const firstArray = Object.values(structurePlan).find(Array.isArray);
  return firstArray || [];
}

function MetricCard({ label, value, description }) {
  return (
    <article className="admin-metric-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{description}</span>
    </article>
  );
}

function SectionHeading({ eyebrow, title, description, action }) {
  return (
    <div className="admin-section-heading">
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
        {description && <span>{description}</span>}
      </div>

      {action}
    </div>
  );
}

function EmptyPanel({ title, message }) {
  return (
    <div className="admin-state-panel">
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}

function LoadingPanel({ message }) {
  return (
    <div className="admin-state-panel">
      <div className="admin-spinner" aria-hidden="true"></div>
      <p>{message}</p>
    </div>
  );
}

function ErrorPanel({ message, onRetry }) {
  return (
    <div className="admin-state-panel admin-error-panel">
      <h3>Could not load data</h3>
      <p>{message}</p>

      {onRetry && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

function LineChart({ data, xKey, series, emptyMessage }) {
  const chart = useMemo(() => {
    const usableData = (data || []).filter((item) =>
      series.some(({ key }) => isNumber(item?.[key]))
    );

    if (usableData.length === 0) {
      return null;
    }

    const width = 900;
    const height = 310;
    const padding = {
      top: 26,
      right: 26,
      bottom: 48,
      left: 68,
    };

    const numericValues = usableData.flatMap((item) =>
      series.map(({ key }) => item[key]).filter(isNumber)
    );

    let minimumY = Math.min(...numericValues);
    let maximumY = Math.max(...numericValues);

    if (minimumY === maximumY) {
      minimumY -= 0.5;
      maximumY += 0.5;
    }

    const xValues = usableData.map((item, index) => {
      const value = item?.[xKey];
      return isNumber(value) ? value : index + 1;
    });

    let minimumX = Math.min(...xValues);
    let maximumX = Math.max(...xValues);

    if (minimumX === maximumX) {
      minimumX -= 1;
      maximumX += 1;
    }

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const xPosition = (value) =>
      padding.left +
      ((value - minimumX) / (maximumX - minimumX)) * plotWidth;

    const yPosition = (value) =>
      padding.top +
      ((maximumY - value) / (maximumY - minimumY)) * plotHeight;

    const paths = series.map((item) => {
      const points = usableData
        .map((row, index) => {
          const yValue = row?.[item.key];

          if (!isNumber(yValue)) {
            return null;
          }

          return `${xPosition(xValues[index])},${yPosition(yValue)}`;
        })
        .filter(Boolean)
        .join(" ");

      return {
        ...item,
        points,
      };
    });

    const gridLines = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const y = padding.top + ratio * plotHeight;
      const value = maximumY - ratio * (maximumY - minimumY);

      return { y, value };
    });

    return {
      width,
      height,
      padding,
      minimumX,
      maximumX,
      paths,
      gridLines,
    };
  }, [data, series, xKey]);

  if (!chart) {
    return (
      <div className="admin-chart-empty">
        <span>{emptyMessage}</span>
      </div>
    );
  }

  return (
    <div className="admin-chart">
      <div className="admin-chart-legend">
        {series.map((item) => (
          <span key={item.key}>
            <i style={{ background: item.color }}></i>
            {item.label}
          </span>
        ))}
      </div>

      <div className="admin-chart-scroll">
        <svg
          className="admin-svg-chart"
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          role="img"
          aria-label="Training metric line chart"
        >
          {chart.gridLines.map((line) => (
            <g key={line.y}>
              <line
                x1={chart.padding.left}
                x2={chart.width - chart.padding.right}
                y1={line.y}
                y2={line.y}
                className="admin-chart-grid-line"
              />
              <text
                x={chart.padding.left - 12}
                y={line.y + 4}
                textAnchor="end"
                className="admin-chart-axis-text"
              >
                {line.value.toFixed(2)}
              </text>
            </g>
          ))}

          <line
            x1={chart.padding.left}
            x2={chart.padding.left}
            y1={chart.padding.top}
            y2={chart.height - chart.padding.bottom}
            className="admin-chart-axis-line"
          />

          <line
            x1={chart.padding.left}
            x2={chart.width - chart.padding.right}
            y1={chart.height - chart.padding.bottom}
            y2={chart.height - chart.padding.bottom}
            className="admin-chart-axis-line"
          />

          <text
            x={chart.padding.left}
            y={chart.height - 17}
            className="admin-chart-axis-text"
          >
            {chart.minimumX}
          </text>

          <text
            x={chart.width - chart.padding.right}
            y={chart.height - 17}
            textAnchor="end"
            className="admin-chart-axis-text"
          >
            {chart.maximumX}
          </text>

          {chart.paths.map((path) =>
            path.points ? (
              <polyline
                key={path.key}
                points={path.points}
                fill="none"
                stroke={path.color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null
          )}
        </svg>
      </div>
    </div>
  );
}

function ProtectedAudioPlayer({
  filePath,
  accessToken,
  onUnauthorized,
}) {
  const [audioUrl, setAudioUrl] = useState("");
  const [audioError, setAudioError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!filePath || !accessToken) {
      setAudioUrl("");
      setAudioError("");
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl = "";
    let isActive = true;

    const loadAudio = async () => {
      setIsLoading(true);
      setAudioError("");
      setAudioUrl("");

      try {
        const response = await fetch(buildFileUrl(filePath), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
          onUnauthorized();
          throw new Error("Administrator session is no longer valid.");
        }

        if (!response.ok) {
          throw new Error(
            `Audio could not be loaded (${response.status}).`
          );
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (isActive) {
          setAudioUrl(objectUrl);
        }
      } catch (error) {
        if (error.name !== "AbortError" && isActive) {
          setAudioError(error.message || "Audio playback is unavailable.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadAudio();

    return () => {
      isActive = false;
      controller.abort();

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [filePath, accessToken, onUnauthorized]);

  if (!filePath) {
    return <p className="admin-muted">No rendered audio file is stored.</p>;
  }

  if (isLoading) {
    return <p className="admin-muted">Preparing audio playback...</p>;
  }

  if (audioError) {
    return <p className="admin-inline-error">{audioError}</p>;
  }

  return audioUrl ? (
    <audio className="admin-audio-player" controls preload="metadata">
      <source src={audioUrl} />
      Your browser does not support audio playback.
    </audio>
  ) : null;
}

function AdminDashboardPage() {
  const navigate = useNavigate();
  const {
    admin,
    accessToken,
    logout,
  } = useAdminAuth();

  const onLogout = useCallback(() => {
    logout();
    navigate("/admin/login", { replace: true });
  }, [logout, navigate]);
  const [trainingRuns, setTrainingRuns] =
    useState<TrainingRun[]>([]);

  const [selectedRunId, setSelectedRunId] =
    useState("");

  const [dashboardData, setDashboardData] =
    useState<ResearchDashboardData>(
      EMPTY_DASHBOARD,
    );

  const [isLoadingRuns, setIsLoadingRuns] =
    useState(true);

  const [
    isLoadingDashboard,
    setIsLoadingDashboard,
  ] = useState(false);

  const [dashboardError, setDashboardError] =
    useState("");

  const [generations, setGenerations] =
    useState<AdminGeneration[]>([]);

  const [
    selectedGenerationId,
    setSelectedGenerationId,
  ] = useState("");

  const [
    generationAnalysis,
    setGenerationAnalysis,
  ] = useState<GenerationAnalysis | null>(
    null,
  );

  const [
    isLoadingGenerations,
    setIsLoadingGenerations,
  ] = useState(true);

  const [
    isLoadingAnalysis,
    setIsLoadingAnalysis,
  ] = useState(false);

  const [
    generationError,
    setGenerationError,
  ] = useState("");

  const [isRefreshing, setIsRefreshing] =
    useState(false);

  const handleApiError = useCallback(
    (
      error: unknown,
      fallbackMessage: string,
    ): string => {
      if (isAdminAuthorizationError(error)) {
        onLogout();
      }

      return error instanceof Error
        ? error.message
        : fallbackMessage;
    },
    [onLogout],
  );

  const loadTrainingRuns =
    useCallback(async () => {
      if (!accessToken) {
        onLogout();
        return;
      }

      setIsLoadingRuns(true);
      setDashboardError("");

      try {
        const result =
          await getTrainingRuns(accessToken);

        const runs = Array.isArray(result.runs)
          ? result.runs
          : [];

        setTrainingRuns(runs);

        if (runs.length === 0) {
          setSelectedRunId("");
          setDashboardData(EMPTY_DASHBOARD);
          return;
        }

        setSelectedRunId((currentId) => {
          const currentStillExists =
            runs.some(
              (run) =>
                String(run.id) ===
                String(currentId),
            );

          return currentStillExists
            ? String(currentId)
            : String(runs[0].id);
        });
      } catch (error) {
        console.error(
          "Load training runs error:",
          error,
        );

        setTrainingRuns([]);
        setSelectedRunId("");
        setDashboardData(EMPTY_DASHBOARD);

        setDashboardError(
          handleApiError(
            error,
            "Could not load training runs.",
          ),
        );
      } finally {
        setIsLoadingRuns(false);
      }
    }, [
      accessToken,
      handleApiError,
      onLogout,
    ]);

  const loadDashboard = useCallback(
    async (runId: string) => {
      if (!runId) {
        setDashboardData(EMPTY_DASHBOARD);
        return;
      }

      if (!accessToken) {
        onLogout();
        return;
      }

      setIsLoadingDashboard(true);
      setDashboardError("");

      try {
        const result =
          await getResearchDashboard(
            accessToken,
            runId,
          );

        setDashboardData({
          run: result.run ?? null,
          summary: result.summary ?? null,

          epochs: Array.isArray(
            result.epochs,
          )
            ? result.epochs
            : [],

          tasks: Array.isArray(result.tasks)
            ? result.tasks
            : [],

          taskSeries:
            result.taskSeries &&
            typeof result.taskSeries ===
              "object"
              ? result.taskSeries
              : {},

          batches: Array.isArray(
            result.batches,
          )
            ? result.batches
            : [],
        });
      } catch (error) {
        console.error(
          "Load dashboard error:",
          error,
        );

        setDashboardData(EMPTY_DASHBOARD);

        setDashboardError(
          handleApiError(
            error,
            "Could not load dashboard data.",
          ),
        );
      } finally {
        setIsLoadingDashboard(false);
      }
    },
    [
      accessToken,
      handleApiError,
      onLogout,
    ],
  );

  const loadGenerations =
    useCallback(async () => {
      if (!accessToken) {
        onLogout();
        return;
      }

      setIsLoadingGenerations(true);
      setGenerationError("");

      try {
        const result =
          await getAdminGenerations(
            accessToken,
          );

        const loadedGenerations =
          Array.isArray(result.generations)
            ? result.generations
            : [];

        setGenerations(loadedGenerations);

        if (
          loadedGenerations.length === 0
        ) {
          setSelectedGenerationId("");
          setGenerationAnalysis(null);
          return;
        }

        setSelectedGenerationId(
          (currentId) => {
            const currentStillExists =
              loadedGenerations.some(
                (generation) =>
                  String(generation.id) ===
                  String(currentId),
              );

            return currentStillExists
              ? String(currentId)
              : String(
                  loadedGenerations[0].id,
                );
          },
        );
      } catch (error) {
        console.error(
          "Load generations error:",
          error,
        );

        setGenerations([]);
        setSelectedGenerationId("");
        setGenerationAnalysis(null);

        setGenerationError(
          handleApiError(
            error,
            "Could not load generations.",
          ),
        );
      } finally {
        setIsLoadingGenerations(false);
      }
    }, [
      accessToken,
      handleApiError,
      onLogout,
    ]);

  const loadGenerationAnalysis =
    useCallback(
      async (generationId: string) => {
        if (!generationId) {
          setGenerationAnalysis(null);
          return;
        }

        if (!accessToken) {
          onLogout();
          return;
        }

        setIsLoadingAnalysis(true);
        setGenerationError("");

        try {
          const result =
            await getGenerationAnalysis(
              accessToken,
              generationId,
            );

          setGenerationAnalysis(result);
        } catch (error) {
          console.error(
            "Load generation analysis error:",
            error,
          );

          setGenerationAnalysis(null);

          setGenerationError(
            handleApiError(
              error,
              "Could not load generation analysis.",
            ),
          );
        } finally {
          setIsLoadingAnalysis(false);
        }
      },
      [
        accessToken,
        handleApiError,
        onLogout,
      ],
    );

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await Promise.all([loadTrainingRuns(), loadGenerations()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadTrainingRuns, loadGenerations]);

  useEffect(() => {
    loadTrainingRuns();
    loadGenerations();
  }, [loadTrainingRuns, loadGenerations]);

  useEffect(() => {
    loadDashboard(selectedRunId);
  }, [selectedRunId, loadDashboard]);

  useEffect(() => {
    loadGenerationAnalysis(selectedGenerationId);
  }, [selectedGenerationId, loadGenerationAnalysis]);

  const run = dashboardData.run;
  const summary = dashboardData.summary;
  const epochs = dashboardData.epochs;
  const tasks = dashboardData.tasks;
  const taskSeries = dashboardData.taskSeries;
  const batches = dashboardData.batches;

  const selectedGeneration = useMemo(
    () =>
      generations.find(
        (generation) =>
          String(generation.id) === String(selectedGenerationId)
      ) || null,
    [generations, selectedGenerationId]
  );

  const intentEntries = useMemo(() => {
    const intent = generationAnalysis?.intent;

    return intent && typeof intent === "object"
      ? Object.entries(intent)
      : [];
  }, [generationAnalysis]);

  const structureSections = useMemo(
    () => getStructureSections(generationAnalysis?.structurePlan),
    [generationAnalysis]
  );

  const routingEntries = useMemo(() => {
    const routing = generationAnalysis?.routing;

    return routing && typeof routing === "object"
      ? Object.entries(routing)
      : [];
  }, [generationAnalysis]);

  const criticEntries = useMemo(() => {
    const criticTrace = generationAnalysis?.criticTrace;

    if (Array.isArray(criticTrace)) {
      return criticTrace;
    }

    if (criticTrace && typeof criticTrace === "object") {
      return Object.entries(criticTrace).map(([key, value]) => ({
        key,
        value,
      }));
    }

    return [];
  }, [generationAnalysis]);

  const coherenceScores = useMemo(
    () =>
      Array.isArray(generationAnalysis?.coherenceScores)
        ? generationAnalysis.coherenceScores
        : [],
    [generationAnalysis]
  );

  const taskSeriesEntries = useMemo(
    () =>
      Object.entries(taskSeries || {}).filter(([, values]) =>
        Array.isArray(values)
      ),
    [taskSeries]
  );

  const globalCoherence =
    coherenceScores.find(
      (score) =>
        String(score.sectionName || "").toLowerCase() === "global"
    ) ||
    coherenceScores[0] ||
    null;

  const globalCoherencePercentage = globalCoherence
    ? toPercentage(globalCoherence.overallScore)
    : null;

  const isTrainingLoading = isLoadingRuns || isLoadingDashboard;
  const isGenerationLoading =
    isLoadingGenerations || isLoadingAnalysis;

  const handleDownload = async (filePath, fallbackName) => {
    if (!filePath) return;

    try {
      const response = await fetch(buildFileUrl(filePath), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        onLogout();
        return;
      }

      if (!response.ok) {
        throw new Error(
          `Download failed with status ${response.status}`
        );
      }

      const blob = await response.blob();
      const temporaryUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = temporaryUrl;
      link.download = fallbackName;
      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(temporaryUrl);
    } catch (error) {
      console.error("Admin file download error:", error);
      window.alert(
        error.message || "Could not download the generated file."
      );
    }
  };

  return (
    <div className="admin-dashboard-page">
      <header className="admin-topbar">
        <a className="admin-brand" href="#overview">
          <span>∿</span>
          <div>
            <strong>SoLuna</strong>
            <small>Admin research dashboard</small>
          </div>
        </a>

        <nav className="admin-page-nav" aria-label="Dashboard sections">
          <a href="#overview">Overview</a>
          <a href="#metrics">Metrics</a>
          <a href="#graphs">Graphs</a>
          <a href="#tasks">Per-task</a>
          <a href="#generations">Generations</a>
        </nav>

        <div className="admin-topbar-actions">
          <div className="admin-identity">
            <span>Administrator</span>
            <strong>{admin?.name || admin?.email || "Admin"}</strong>
          </div>

          <button
            type="button"
            className="admin-secondary-button"
            onClick={refreshAll}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>

          

          <button
            type="button"
            className="admin-danger-button"
            onClick={onLogout}
          >
            Log out
          </button>
        </div>
      </header>

      <main className="admin-main">
        <section id="overview" className="admin-section admin-hero-section">
          <div className="admin-hero">
            <div>
              <p>Protected administrator console</p>
              <h1>Multi-task music model research dashboard</h1>
              <span>
                Training configuration, epoch results, per-task analysis,
                generation planning, coherence scores, and playable outputs
                are presented on this single page.
              </span>
            </div>

            <div className="admin-selector-stack">
              <label>
                <span>Training run</span>
                <select
                  value={selectedRunId}
                  onChange={(event) =>
                    setSelectedRunId(event.target.value)
                  }
                  disabled={trainingRuns.length === 0}
                >
                  {trainingRuns.length === 0 ? (
                    <option value="">No saved runs</option>
                  ) : (
                    trainingRuns.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.runName}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label>
                <span>Generation</span>
                <select
                  value={selectedGenerationId}
                  onChange={(event) =>
                    setSelectedGenerationId(event.target.value)
                  }
                  disabled={generations.length === 0}
                >
                  {generations.length === 0 ? (
                    <option value="">No generations</option>
                  ) : (
                    generations.map((generation) => (
                      <option key={generation.id} value={generation.id}>
                        {generation.title || `Generation ${generation.id}`}
                        {generation.userEmail
                          ? ` — ${generation.userEmail}`
                          : ""}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
          </div>

          {isTrainingLoading ? (
            <LoadingPanel message="Loading training metrics..." />
          ) : dashboardError ? (
            <ErrorPanel
              message={dashboardError}
              onRetry={loadTrainingRuns}
            />
          ) : !run || !summary ? (
            <EmptyPanel
              title="No training run is available"
              message="Import a run through POST /admin/research/runs/import. This dashboard does not create mock training values."
            />
          ) : (
            <>
              <div className="admin-metrics-grid">
                <MetricCard
                  label="Total Parameters"
                  value={formatParameterCount(run.totalParameters)}
                  description={run.baseModel || "Base model"}
                />

                <MetricCard
                  label="Trainable Parameters"
                  value={formatParameterCount(run.trainableParameters)}
                  description={
                    isNumber(run.trainablePercentage)
                      ? `${run.trainablePercentage.toFixed(4)}% of total`
                      : "Percentage unavailable"
                  }
                />

                <MetricCard
                  label="LoRA Rank"
                  value={formatMetric(run.loraRank, 0)}
                  description="Adapter rank"
                />

                <MetricCard
                  label="LoRA Alpha"
                  value={formatMetric(run.loraAlpha, 0)}
                  description="Adapter scaling"
                />

                <MetricCard
                  label="Train Loss"
                  value={formatMetric(summary.trainLoss)}
                  description={`Latest epoch ${summary.latestEpoch ?? "—"}`}
                />

                <MetricCard
                  label="Train Perplexity"
                  value={formatMetric(summary.trainPerplexity)}
                  description="Latest global value"
                />

                <MetricCard
                  label="Global Eval Loss"
                  value={formatMetric(summary.evalLoss)}
                  description="Latest evaluation"
                />

                <MetricCard
                  label="Global Eval Perplexity"
                  value={formatMetric(summary.evalPerplexity)}
                  description="Latest evaluation"
                />

                <MetricCard
                  label="Average Epoch Time"
                  value={formatDuration(summary.averageEpochTimeSeconds)}
                  description={`${epochs.length} saved epochs`}
                />

                <MetricCard
                  label="Best Eval Loss"
                  value={formatMetric(summary.bestEvalLoss)}
                  description={`Epoch ${summary.bestEpoch ?? "—"}`}
                />

                <MetricCard
                  label="Best Eval Perplexity"
                  value={formatMetric(summary.bestEvalPerplexity)}
                  description={`Epoch ${summary.bestEpoch ?? "—"}`}
                />
              </div>

              <div className="admin-two-column-grid">
                <article className="admin-panel">
                  <SectionHeading
                    eyebrow="Training configuration"
                    title={run.runName}
                  />

                  <div className="admin-detail-grid">
                    <div>
                      <span>Base model</span>
                      <strong>{run.baseModel || "—"}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>{run.status || "—"}</strong>
                    </div>
                    <div>
                      <span>Learning rate</span>
                      <strong>
                        {isNumber(run.learningRate)
                          ? run.learningRate
                          : "—"}
                      </strong>
                    </div>
                    <div>
                      <span>Batch size</span>
                      <strong>{run.batchSize ?? "—"}</strong>
                    </div>
                    <div>
                      <span>Configured epochs</span>
                      <strong>{run.totalEpochs ?? "—"}</strong>
                    </div>
                    <div>
                      <span>Saved epochs</span>
                      <strong>{epochs.length}</strong>
                    </div>
                    <div>
                      <span>Started</span>
                      <strong>{formatDate(run.startedAt)}</strong>
                    </div>
                    <div>
                      <span>Completed</span>
                      <strong>{formatDate(run.completedAt)}</strong>
                    </div>
                  </div>
                </article>

                <article className="admin-panel">
                  <SectionHeading
                    eyebrow="Loaded records"
                    title="Database coverage"
                  />

                  <div className="admin-record-list">
                    <div>
                      <strong>{epochs.length}</strong>
                      <span>Epoch records</span>
                    </div>
                    <div>
                      <strong>{tasks.length}</strong>
                      <span>Task summaries</span>
                    </div>
                    <div>
                      <strong>{taskSeriesEntries.length}</strong>
                      <span>Task series</span>
                    </div>
                    <div>
                      <strong>{batches.length}</strong>
                      <span>Batch records</span>
                    </div>
                    <div>
                      <strong>{generations.length}</strong>
                      <span>Generations</span>
                    </div>
                  </div>
                </article>
              </div>
            </>
          )}
        </section>

        <section id="metrics" className="admin-section">
          <SectionHeading
            eyebrow="Epoch metrics"
            title="Loss, perplexity, best evaluation, and epoch time"
            description="Each row represents one saved training epoch."
          />

          {isTrainingLoading ? (
            <LoadingPanel message="Loading epoch metrics..." />
          ) : dashboardError ? (
            <ErrorPanel
              message={dashboardError}
              onRetry={() => loadDashboard(selectedRunId)}
            />
          ) : epochs.length === 0 ? (
            <EmptyPanel
              title="No epoch metrics"
              message="The selected run has no saved epoch records."
            />
          ) : (
            <article className="admin-panel admin-table-panel">
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Epoch</th>
                      <th>Train Loss</th>
                      <th>Train PPL</th>
                      <th>Eval Loss</th>
                      <th>Eval PPL</th>
                      <th>Best Eval Loss</th>
                      <th>Best Eval PPL</th>
                      <th>Learning Rate</th>
                      <th>Epoch Time</th>
                      <th>Checkpoint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {epochs.map((epoch) => (
                      <tr key={epoch.epoch}>
                        <td>{epoch.epoch}</td>
                        <td>{formatMetric(epoch.trainLoss)}</td>
                        <td>{formatMetric(epoch.trainPerplexity)}</td>
                        <td>{formatMetric(epoch.evalLoss)}</td>
                        <td>{formatMetric(epoch.evalPerplexity)}</td>
                        <td>{formatMetric(epoch.bestEvalLoss)}</td>
                        <td>
                          {formatMetric(epoch.bestEvalPerplexity)}
                        </td>
                        <td>
                          {isNumber(epoch.learningRate)
                            ? epoch.learningRate
                            : "—"}
                        </td>
                        <td>{formatDuration(epoch.epochTimeSeconds)}</td>
                        <td>{epoch.checkpointPath || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          )}
        </section>

        <section id="graphs" className="admin-section">
          <SectionHeading
            eyebrow="Global graphs"
            title="Global and batch training trends"
            description="Loss and perplexity are plotted against epoch or global step."
          />

          {isTrainingLoading ? (
            <LoadingPanel message="Loading graph data..." />
          ) : dashboardError ? (
            <ErrorPanel
              message={dashboardError}
              onRetry={() => loadDashboard(selectedRunId)}
            />
          ) : !run ? (
            <EmptyPanel
              title="No graph data"
              message="Select or import a training run first."
            />
          ) : (
            <div className="admin-chart-grid">
              <article className="admin-panel admin-chart-panel">
                <SectionHeading
                  eyebrow="Global loss"
                  title="Loss per epoch"
                />
                <LineChart
                  data={epochs}
                  xKey="epoch"
                  emptyMessage="No global loss records are available."
                  series={LOSS_SERIES}
                />
              </article>

              <article className="admin-panel admin-chart-panel">
                <SectionHeading
                  eyebrow="Global perplexity"
                  title="Perplexity per epoch"
                />
                <LineChart
                  data={epochs}
                  xKey="epoch"
                  emptyMessage="No global perplexity records are available."
                  series={PERPLEXITY_SERIES}
                />
              </article>

              <article className="admin-panel admin-chart-panel">
                <SectionHeading
                  eyebrow="Batch loss"
                  title="Loss per global step"
                />
                <LineChart
                  data={batches}
                  xKey="globalStep"
                  emptyMessage="No batch loss records are available."
                  series={[
                    {
                      key: "loss",
                      label: "Batch loss",
                      color: "#38bdf8",
                    },
                  ]}
                />
              </article>

              <article className="admin-panel admin-chart-panel">
                <SectionHeading
                  eyebrow="Batch perplexity"
                  title="Perplexity per global step"
                />
                <LineChart
                  data={batches}
                  xKey="globalStep"
                  emptyMessage="No batch perplexity records are available."
                  series={[
                    {
                      key: "perplexity",
                      label: "Batch perplexity",
                      color: "#a78bfa",
                    },
                  ]}
                />
              </article>
            </div>
          )}
        </section>

        <section id="tasks" className="admin-section">
          <SectionHeading
            eyebrow="Multi-task results"
            title="Per-task metrics and trends"
            description="Latest values are shown first, followed by complete task-level graphs."
          />

          {isTrainingLoading ? (
            <LoadingPanel message="Loading per-task results..." />
          ) : dashboardError ? (
            <ErrorPanel
              message={dashboardError}
              onRetry={() => loadDashboard(selectedRunId)}
            />
          ) : tasks.length === 0 ? (
            <EmptyPanel
              title="No per-task records"
              message="The selected run has no task metrics."
            />
          ) : (
            <>
              <div className="admin-task-grid">
                {tasks.map((task) => (
                  <article
                    className="admin-panel admin-task-card"
                    key={task.taskName}
                  >
                    <div className="admin-task-title">
                      <span>
                        {String(task.taskName || "?")
                          .slice(0, 1)
                          .toUpperCase()}
                      </span>
                      <div>
                        <p>Task adapter</p>
                        <h3>{task.taskName}</h3>
                      </div>
                    </div>

                    <div className="admin-task-values">
                      <div>
                        <span>Train loss</span>
                        <strong>{formatMetric(task.trainLoss)}</strong>
                      </div>
                      <div>
                        <span>Eval loss</span>
                        <strong>{formatMetric(task.evalLoss)}</strong>
                      </div>
                      <div>
                        <span>Train PPL</span>
                        <strong>
                          {formatMetric(task.trainPerplexity)}
                        </strong>
                      </div>
                      <div>
                        <span>Eval PPL</span>
                        <strong>
                          {formatMetric(task.evalPerplexity)}
                        </strong>
                      </div>
                      <div>
                        <span>Best eval loss</span>
                        <strong>{formatMetric(task.bestEvalLoss)}</strong>
                      </div>
                      <div>
                        <span>Best eval PPL</span>
                        <strong>
                          {formatMetric(task.bestEvalPerplexity)}
                        </strong>
                      </div>
                      <div>
                        <span>Best epoch</span>
                        <strong>{task.bestEpoch ?? "—"}</strong>
                      </div>
                      <div>
                        <span>Samples</span>
                        <strong>{task.sampleCount ?? "—"}</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <article className="admin-panel admin-table-panel">
                <SectionHeading
                  eyebrow="Task comparison"
                  title="Latest multi-task results"
                />

                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th>Epoch</th>
                        <th>Train Loss</th>
                        <th>Eval Loss</th>
                        <th>Train PPL</th>
                        <th>Eval PPL</th>
                        <th>Best Eval Loss</th>
                        <th>Best Eval PPL</th>
                        <th>Best Epoch</th>
                        <th>Adapter Weight</th>
                        <th>Samples</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((task) => (
                        <tr key={task.taskName}>
                          <td>{task.taskName}</td>
                          <td>{task.epoch ?? "—"}</td>
                          <td>{formatMetric(task.trainLoss)}</td>
                          <td>{formatMetric(task.evalLoss)}</td>
                          <td>{formatMetric(task.trainPerplexity)}</td>
                          <td>{formatMetric(task.evalPerplexity)}</td>
                          <td>{formatMetric(task.bestEvalLoss)}</td>
                          <td>
                            {formatMetric(task.bestEvalPerplexity)}
                          </td>
                          <td>{task.bestEpoch ?? "—"}</td>
                          <td>{formatMetric(task.adapterWeight)}</td>
                          <td>{task.sampleCount ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <div className="admin-task-chart-stack">
                {taskSeriesEntries.map(([taskName, series]) => (
                  <article
                    className="admin-panel admin-task-chart-group"
                    key={taskName}
                  >
                    <SectionHeading
                      eyebrow="Per-task graph"
                      title={taskName}
                      description="Training and evaluation values across epochs."
                    />

                    <div className="admin-chart-grid">
                      <div>
                        <h3>Loss</h3>
                        <LineChart
                          data={series}
                          xKey="epoch"
                          emptyMessage="No task loss records are available."
                          series={LOSS_SERIES}
                        />
                      </div>

                      <div>
                        <h3>Perplexity</h3>
                        <LineChart
                          data={series}
                          xKey="epoch"
                          emptyMessage="No task perplexity records are available."
                          series={PERPLEXITY_SERIES}
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>

        <section id="generations" className="admin-section">
          <SectionHeading
            eyebrow="Generation inspector"
            title="Prompt, planning, coherence, and generated output"
            description="Review how the prompt was interpreted and converted into a structured composition."
          />

          {isGenerationLoading ? (
            <LoadingPanel message="Loading generation analysis..." />
          ) : generationError ? (
            <ErrorPanel
              message={generationError}
              onRetry={loadGenerations}
            />
          ) : generations.length === 0 ? (
            <EmptyPanel
              title="No generations available"
              message="Create a music generation first. Its analysis will appear here."
            />
          ) : !generationAnalysis ? (
            <EmptyPanel
              title="No analysis available"
              message="The selected generation has no stored analysis."
            />
          ) : (
            <div className="admin-generation-grid">
              <article className="admin-panel">
                <SectionHeading
                  eyebrow="Original input"
                  title="User prompt"
                />

                <div className="admin-generation-meta">
                  <div>
                    <span>User</span>
                    <strong>
                      {selectedGeneration?.userEmail || "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>
                      {selectedGeneration?.status || "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Created</span>
                    <strong>
                      {formatDate(selectedGeneration?.createdAt)}
                    </strong>
                  </div>
                </div>

                <blockquote className="admin-prompt">
                  {generationAnalysis.originalPrompt ||
                    selectedGeneration?.prompt ||
                    "Prompt not available"}
                </blockquote>
              </article>

              <article className="admin-panel">
                <SectionHeading
                  eyebrow="Intent parser"
                  title="LLM prompt breakdown"
                />

                {intentEntries.length === 0 ? (
                  <p className="admin-muted">
                    No LLM intent output is stored.
                  </p>
                ) : (
                  <div className="admin-analysis-grid">
                    {intentEntries.map(([key, value]) => (
                      <div key={key}>
                        <span>{formatLabel(key)}</span>
                        <strong>{formatValue(value)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="admin-panel admin-wide-panel">
                <SectionHeading
                  eyebrow="Structure planner"
                  title="Composition section breakdown"
                />

                {structureSections.length === 0 ? (
                  <div className="admin-json-block">
                    <pre>
                      {JSON.stringify(
                        generationAnalysis.structurePlan || {},
                        null,
                        2
                      )}
                    </pre>
                  </div>
                ) : (
                  <div className="admin-structure-grid">
                    {structureSections.map((section, index) => {
                      const objectSection =
                        section && typeof section === "object"
                          ? section
                          : { value: section };

                      const sectionName =
                        objectSection.name ||
                        objectSection.title ||
                        objectSection.sectionName ||
                        objectSection.label ||
                        `Section ${index + 1}`;

                      const sectionDescription =
                        objectSection.description ||
                        objectSection.summary ||
                        objectSection.purpose ||
                        objectSection.value ||
                        JSON.stringify(objectSection);

                      return (
                        <div key={`${sectionName}-${index}`}>
                          <span>
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <h3>{sectionName}</h3>
                          <p>{formatValue(sectionDescription)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>

              <article className="admin-panel">
                <SectionHeading
                  eyebrow="Adapter routing"
                  title="LoRA routing output"
                />

                {routingEntries.length === 0 ? (
                  <p className="admin-muted">
                    No routing data is stored.
                  </p>
                ) : (
                  <div className="admin-analysis-grid">
                    {routingEntries.map(([key, value]) => (
                      <div key={key}>
                        <span>{formatLabel(key)}</span>
                        <strong>{formatValue(value)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="admin-panel">
                <SectionHeading
                  eyebrow="Critic engine"
                  title="Critic trace"
                />

                {criticEntries.length === 0 ? (
                  <p className="admin-muted">
                    No critic trace is stored.
                  </p>
                ) : (
                  <div className="admin-critic-list">
                    {criticEntries.map((entry, index) => (
                      <div key={index}>
                        <span>{index + 1}</span>
                        <pre>{JSON.stringify(entry, null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="admin-panel admin-wide-panel">
                <SectionHeading
                  eyebrow="Hard scorer"
                  title="Coherence scores"
                  action={
                    globalCoherencePercentage !== null ? (
                      <strong className="admin-overall-score">
                        {globalCoherencePercentage.toFixed(1)}%
                      </strong>
                    ) : null
                  }
                />

                {coherenceScores.length === 0 ? (
                  <p className="admin-muted">
                    No coherence scores are stored.
                  </p>
                ) : (
                  <div className="admin-coherence-stack">
                    {coherenceScores.map((score) => (
                      <div
                        className="admin-coherence-section"
                        key={score.sectionName || "global"}
                      >
                        <h3>{score.sectionName || "global"}</h3>

                        <div className="admin-score-grid">
                          {COHERENCE_FIELDS.map(([key, label]) => {
                            const percentage = toPercentage(score[key]);

                            if (percentage === null) {
                              return null;
                            }

                            return (
                              <div
                                className="admin-score-row"
                                key={`${score.sectionName}-${key}`}
                              >
                                <div>
                                  <span>{label}</span>
                                  <strong>
                                    {percentage.toFixed(1)}%
                                  </strong>
                                </div>
                                <div className="admin-score-track">
                                  <div
                                    className="admin-score-fill"
                                    style={{
                                      width: `${percentage}%`,
                                    }}
                                  ></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="admin-panel admin-wide-panel">
                <SectionHeading
                  eyebrow="Generated output"
                  title="Playback and files"
                  description="Rendered audio can be played in the browser. MIDI remains available for download."
                />

                <ProtectedAudioPlayer
                  filePath={generationAnalysis.audioFilePath}
                  accessToken={accessToken}
                  onUnauthorized={onLogout}
                />

                <div className="admin-file-actions">
                  {generationAnalysis.midiFilePath ? (
                    <button
                      type="button"
                      onClick={() =>
                        handleDownload(
                          generationAnalysis.midiFilePath,
                          `synestra-${generationAnalysis.generationId}.mid`
                        )
                      }
                    >
                      Download MIDI
                    </button>
                  ) : (
                    <span>No MIDI file path is stored.</span>
                  )}

                  {generationAnalysis.audioFilePath ? (
                    <button
                      type="button"
                      onClick={() =>
                        handleDownload(
                          generationAnalysis.audioFilePath,
                          `synestra-${generationAnalysis.generationId}.wav`
                        )
                      }
                    >
                      Download Audio
                    </button>
                  ) : (
                    <span>No rendered audio file is stored.</span>
                  )}
                </div>

                {generationAnalysis.midiFilePath &&
                  !generationAnalysis.audioFilePath && (
                    <p className="admin-muted">
                      Direct browser MIDI playback is not enabled yet.
                      Generate or store a WAV/MP3 version to use the web
                      player.
                    </p>
                  )}
              </article>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default AdminDashboardPage;