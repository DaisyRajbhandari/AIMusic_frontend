import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";
import {
  ArrowLeft,
  Download,
  FileAudio,
  History,
  Loader2,
  Music2,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { usePageMetadata } from "@/hooks/usePageMetadata";
import { AUTH_API_BASE_URL } from "@/lib/api/authApi";

interface GenerationSection {
  name?: string;
  bars?: number;
  description?: string;
}

interface StructuredPlan {
  sections?: GenerationSection[];
}

interface GenerationRecord {
  id: number;
  title: string;
  prompt: string;
  fullPrompt?: string;
  mood: string;
  genre: string;
  tempo: string;
  instrument: string;
  structure: string;
  status: string;
  message: string;
  structuredPlan?: StructuredPlan;
  midiNotes?: StructuredPlan;
  midiFilePath?: string | null;
  audioFilePath?: string | null;
  createdAt?: number | string | null;
}

interface GenerationsResponse {
  generations: GenerationRecord[];
}

type HistoryFilter =
  | "all"
  | "completed"
  | "failed"
  | "pending";

function buildFileUrl(filePath: string): string {
  if (/^https?:\/\//i.test(filePath)) {
    return filePath;
  }

  const cleanBase =
    AUTH_API_BASE_URL.replace(/\/+$/, "");
  const cleanPath =
    filePath.replace(/^\/+/, "");

  return `${cleanBase}/${cleanPath}`;
}

function formatDate(
  value: number | string | null | undefined,
): string {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Date unavailable";
  }

  const date =
    typeof value === "number"
      ? new Date(
          value < 10_000_000_000
            ? value * 1000
            : value,
        )
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString();
}

function getStatusClasses(status: string): string {
  switch (status.toLowerCase()) {
    case "completed":
      return (
        "border-emerald-400/20 " +
        "bg-emerald-400/10 " +
        "text-emerald-300"
      );

    case "failed":
      return (
        "border-red-400/20 " +
        "bg-red-400/10 " +
        "text-red-300"
      );

    case "pending":
      return (
        "border-amber-400/20 " +
        "bg-amber-400/10 " +
        "text-amber-300"
      );

    default:
      return (
        "border-white/10 " +
        "bg-white/5 " +
        "text-white/70"
      );
  }
}

export default function HistoryPage() {
  const navigate = useNavigate();

  const {
    user,
    accessToken,
    logout,
  } = useAuth();

  usePageMetadata({
    title: "My Generations | SoLuna",
    description:
      "Review and download your generated SoLuna music compositions.",
    keywords:
      "music generation history, generated midi, generated audio",
    canonicalUrl:
      "https://SoLuna.studio/history",
    ogImage:
      "https://SoLuna.studio/logo2.png",
    ogType: "website",
  });

  const [
    generations,
    setGenerations,
  ] = useState<GenerationRecord[]>([]);

  const [
    selectedFilter,
    setSelectedFilter,
  ] = useState<HistoryFilter>("all");

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    downloadingFile,
    setDownloadingFile,
  ] = useState("");

  const handleSessionExpired =
    useCallback(() => {
      logout();

      navigate("/login", {
        replace: true,
        state: {
          from: "/history",
        },
      });
    }, [
      logout,
      navigate,
    ]);

  const loadGenerations =
    useCallback(async () => {
      if (!accessToken) {
        handleSessionExpired();
        return;
      }

      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(
          `${AUTH_API_BASE_URL}/generations`,
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
          },
        );

        let result: unknown = {};

        try {
          result = await response.json();
        } catch {
          result = {};
        }

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          handleSessionExpired();
          return;
        }

        if (!response.ok) {
          const errorResult =
            result as {
              detail?: string;
              message?: string;
            };

          throw new Error(
            errorResult.detail ||
              errorResult.message ||
              `History request failed (${response.status}).`,
          );
        }

        const historyResult =
          result as GenerationsResponse;

        setGenerations(
          Array.isArray(
            historyResult.generations,
          )
            ? historyResult.generations
            : [],
        );
      } catch (error) {
        console.error(
          "History loading error:",
          error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load generation history.",
        );
      } finally {
        setIsLoading(false);
      }
    }, [
      accessToken,
      handleSessionExpired,
    ]);

  useEffect(() => {
    void loadGenerations();
  }, [loadGenerations]);

  const filteredGenerations =
    useMemo(() => {
      if (selectedFilter === "all") {
        return generations;
      }

      return generations.filter(
        (generation) =>
          generation.status
            .toLowerCase() ===
          selectedFilter,
      );
    }, [
      generations,
      selectedFilter,
    ]);

  const completedCount =
    useMemo(
      () =>
        generations.filter(
          (generation) =>
            generation.status
              .toLowerCase() ===
            "completed",
        ).length,
      [generations],
    );

  const failedCount =
    useMemo(
      () =>
        generations.filter(
          (generation) =>
            generation.status
              .toLowerCase() ===
            "failed",
        ).length,
      [generations],
    );

  const pendingCount =
    useMemo(
      () =>
        generations.filter(
          (generation) =>
            generation.status
              .toLowerCase() ===
            "pending",
        ).length,
      [generations],
    );

  const handleDownload =
    async (
      filePath:
        | string
        | null
        | undefined,
      filename: string,
      downloadKey: string,
    ) => {
      if (!filePath) {
        return;
      }

      setDownloadingFile(downloadKey);
      setErrorMessage("");

      try {
        const fileUrl =
          buildFileUrl(filePath);

        const headers:
          Record<string, string> = {};

        if (
          fileUrl.startsWith(
            AUTH_API_BASE_URL,
          ) &&
          accessToken
        ) {
          headers.Authorization =
            `Bearer ${accessToken}`;
        }

        const response = await fetch(
          fileUrl,
          {
            headers,
          },
        );

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          handleSessionExpired();
          return;
        }

        if (!response.ok) {
          throw new Error(
            `Download failed (${response.status}).`,
          );
        }

        const blob =
          await response.blob();

        const temporaryUrl =
          URL.createObjectURL(blob);

        const link =
          document.createElement("a");

        link.href = temporaryUrl;
        link.download = filename;

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(
          temporaryUrl,
        );
      } catch (error) {
        console.error(
          "History download error:",
          error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not download the file.",
        );
      } finally {
        setDownloadingFile("");
      }
    };

  const handleLogout = () => {
    logout();

    navigate("/login", {
      replace: true,
    });
  };

  const filters: {
    value: HistoryFilter;
    label: string;
  }[] = [
    {
      value: "all",
      label:
        `All (${generations.length})`,
    },
    {
      value: "completed",
      label:
        `Completed (${completedCount})`,
    },
    {
      value: "failed",
      label:
        `Failed (${failedCount})`,
    },
    {
      value: "pending",
      label:
        `Pending (${pendingCount})`,
    },
  ];

  return (
    <div className="min-h-screen bg-[#030303] text-white">
      <main className="container mx-auto max-w-6xl px-4 py-10 md:px-6">
        <div className="mb-10 flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to SoLuna
            </Link>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void loadGenerations()
                }
                disabled={isLoading}
                className="border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
              >
                <RefreshCw
                  className={
                    `mr-2 h-4 w-4 ${
                      isLoading
                        ? "animate-spin"
                        : ""
                    }`
                  }
                />
                Refresh
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleLogout}
                className="border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
              >
                Log out
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/60">
              <History className="h-4 w-4" />
              Generation archive
            </div>

            <h1 className="text-4xl font-light tracking-tight md:text-6xl">
              My Generations
            </h1>

            <p className="mt-3 max-w-2xl text-white/55">
              Signed in as{" "}
              <span className="text-white">
                {user?.name ||
                  user?.full_name ||
                  user?.fullname ||
                  user?.email}
              </span>
              . Review your saved prompts,
              composition plans, MIDI files,
              and rendered audio.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() =>
                  setSelectedFilter(
                    filter.value,
                  )
                }
                className={
                  selectedFilter ===
                  filter.value
                    ? "rounded-full bg-white px-4 py-2 text-sm font-medium text-black"
                    : "rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 transition hover:bg-white/10 hover:text-white"
                }
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200"
          >
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-3xl border border-white/5 bg-white/[0.02]">
            <Loader2 className="h-9 w-9 animate-spin text-white/70" />

            <p className="text-sm text-white/50">
              Loading your generations...
            </p>
          </div>
        ) : filteredGenerations.length ===
          0 ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-3xl border border-white/5 bg-white/[0.02] px-6 text-center">
            <Music2 className="h-12 w-12 text-white/20" />

            <h2 className="text-xl font-medium">
              No generations found
            </h2>

            <p className="max-w-md text-sm text-white/50">
              There are no records matching
              the selected filter.
            </p>

            <Link to="/">
              <Button className="mt-2">
                Create new music
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredGenerations.map(
              (generation) => {
                const sections =
                  generation
                    .structuredPlan
                    ?.sections || [];

                const status =
                  generation.status ||
                  "unknown";

                return (
                  <article
                    key={generation.id}
                    className="overflow-hidden rounded-3xl border border-white/5 bg-[#0a0a0a] shadow-xl"
                  >
                    <div className="border-b border-white/5 p-6 md:p-8">
                      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
                        <div className="min-w-0">
                          <div className="mb-3 flex flex-wrap items-center gap-3">
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wider ${getStatusClasses(
                                status,
                              )}`}
                            >
                              {status}
                            </span>

                            <span className="text-xs text-white/35">
                              Request #
                              {generation.id}
                            </span>

                            <span className="text-xs text-white/35">
                              {formatDate(
                                generation.createdAt,
                              )}
                            </span>
                          </div>

                          <h2 className="text-xl font-medium leading-relaxed text-white md:text-2xl">
                            {generation.prompt}
                          </h2>

                          <p className="mt-3 text-sm text-white/50">
                            {generation.message}
                          </p>
                        </div>

                        <div className="grid shrink-0 grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={
                              !generation.midiFilePath ||
                              downloadingFile ===
                                `midi-${generation.id}`
                            }
                            onClick={() =>
                              void handleDownload(
                                generation.midiFilePath,
                                `soluna-generation-${generation.id}.mid`,
                                `midi-${generation.id}`,
                              )
                            }
                            className="border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            MIDI
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            disabled={
                              !generation.audioFilePath ||
                              downloadingFile ===
                                `audio-${generation.id}`
                            }
                            onClick={() =>
                              void handleDownload(
                                generation.audioFilePath,
                                `soluna-generation-${generation.id}.wav`,
                                `audio-${generation.id}`,
                              )
                            }
                            className="border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
                          >
                            <FileAudio className="mr-2 h-4 w-4" />
                            Audio
                          </Button>
                        </div>
                      </div>

                      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
                        {[
                          [
                            "Mood",
                            generation.mood,
                          ],
                          [
                            "Genre",
                            generation.genre,
                          ],
                          [
                            "Tempo",
                            generation.tempo,
                          ],
                          [
                            "Instrument",
                            generation.instrument,
                          ],
                          [
                            "Structure",
                            generation.structure,
                          ],
                        ].map(
                          ([label, value]) => (
                            <div
                              key={label}
                              className="rounded-2xl border border-white/5 bg-white/[0.02] p-4"
                            >
                              <p className="text-[10px] uppercase tracking-wider text-white/35">
                                {label}
                              </p>

                              <p className="mt-1 break-words text-sm text-white/75">
                                {value ||
                                  "Unavailable"}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>

                    {generation.audioFilePath && (
                      <div className="border-b border-white/5 px-6 py-5 md:px-8">
                        <p className="mb-3 text-xs uppercase tracking-[0.15em] text-white/35">
                          Generated audio
                        </p>

                        <audio
                          controls
                          preload="metadata"
                          src={buildFileUrl(
                            generation.audioFilePath,
                          )}
                          className="w-full"
                        >
                          Your browser does not
                          support audio playback.
                        </audio>
                      </div>
                    )}

                    <div className="p-6 md:p-8">
                      <p className="mb-4 text-xs uppercase tracking-[0.15em] text-white/35">
                        Composition structure
                      </p>

                      {sections.length === 0 ? (
                        <p className="text-sm text-white/40">
                          No structured plan is
                          available for this
                          generation.
                        </p>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                          {sections.map(
                            (
                              section,
                              sectionIndex,
                            ) => (
                              <div
                                key={`${generation.id}-${section.name}-${sectionIndex}`}
                                className="rounded-2xl border border-white/5 bg-white/[0.02] p-4"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <strong className="text-sm text-white">
                                    {section.name ||
                                      `Section ${
                                        sectionIndex +
                                        1
                                      }`}
                                  </strong>

                                  <span className="text-xs text-white/35">
                                    {section.bars ??
                                      "—"}{" "}
                                    bars
                                  </span>
                                </div>

                                <p className="mt-3 text-xs leading-relaxed text-white/45">
                                  {section.description ||
                                    "No description available."}
                                </p>
                              </div>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              },
            )}
          </div>
        )}
      </main>
    </div>
  );
}