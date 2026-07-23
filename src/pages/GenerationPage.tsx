import React from "react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  AnimatePresence,
  motion,
} from "framer-motion";
import {
  Download,
  FileAudio,
  Loader2,
  Music2,
  Quote,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";
import { Breadcrumb } from "@/components/SEOContent";
import RelatedTools from "@/components/RelatedTools";
import { useAuth } from "@/contexts/AuthContext";
import { usePageMetadata } from "@/hooks/usePageMetadata";
import { AUTH_API_BASE_URL } from "@/lib/api/authApi";
import { PLANNER_API_BASE_URL } from "@/lib/api/plannerApi";
import {
  createGeneration,
  GenerationApiError,
  isUserAuthorizationError,
} from "@/lib/api/generationApi";

import type {
  CreateGenerationResponse,
  GenerationRecord,
} from "@/types/generation";

const PROMPT_GENRES = [
  {
    keywords: [
      "classical",
      "piano",
      "satie",
      "ambient",
      "calm",
      "relaxing",
      "slow",
      "acoustic",
    ],
    audioUrl: "/musics/Gymnopedieno.1.mp3",
    genre: "classical",
  },
  {
    keywords: [
      "electronic",
      "synth",
      "gaming",
      "edm",
      "dance",
      "sprunki",
      "beat",
      "techno",
      "house",
    ],
    audioUrl: "/musics/SprunkiPhase2.5(Bonus).mp3",
    genre: "electronic",
  },
  {
    keywords: [
      "pop",
      "afrobeat",
      "groove",
      "rema",
      "smooth",
      "rhythm",
      "danceable",
    ],
    audioUrl: "/musics/Remacalm.mp3",
    genre: "pop",
  },
  {
    keywords: [
      "rock",
      "jrock",
      "band",
      "anime",
      "guitar",
      "energetic",
      "solo",
    ],
    audioUrl: "/musics/SakuraNoUta.mp3",
    genre: "jrock",
  },
] as const;

const GENERATION_STEPS = [
  "Contacting SoLuna AI generation cluster...",
  "Tokenizing semantic input prompt...",
  "Generating core chord progressions and tempo mapping...",
  "Orchestrating instrument tracks from the structured plan...",
  "Scoring auxiliary voices, melodies, counterpoint, and pads...",
  "Compiling generated MIDI and rendered audio outputs...",
] as const;

interface GenerationRequestCache {
  key: string;
  promise: Promise<CreateGenerationResponse>;
}

function buildGenerationFileUrl(
  filePath: string,
): string {
  if (/^https?:\/\//i.test(filePath)) {
    return filePath;
  }

  const cleanBaseUrl =
    PLANNER_API_BASE_URL.replace(/\/+$/, "");

  const cleanPath =
    filePath.replace(/^\/+/, "");

  return `${cleanBaseUrl}/${cleanPath}`;
}

function isExternalFileUrl(
  fileUrl: string,
): boolean {
  return (
    /^https?:\/\//i.test(fileUrl) &&
    !fileUrl.startsWith(AUTH_API_BASE_URL) &&
    !fileUrl.startsWith(PLANNER_API_BASE_URL)
  );
}

export default function GenerationPage() {
  const navigate = useNavigate();

  const {
    user,
    accessToken,
    logout,
  } = useAuth();

  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const prompt =
    searchParams.get("prompt")?.trim() || "";

  usePageMetadata({
    title:
      "AI Prompt Composer | SoLuna - Generating Your Audio",
    description:
      "Watch your text prompt get transformed into structured MIDI arrangements and rendered audio.",
    keywords:
      "ai generation, prompt music, text to midi, render prompt to audio, virtual orchestra, free midi tools",
    canonicalUrl:
      "https://SoLuna.studio/generation",
    ogImage: "https://SoLuna.studio/logo2.png",
    ogType: "website",
  });

  const matchedTrack = useMemo(() => {
    const query = prompt.toLowerCase();

    return (
      PROMPT_GENRES.find((track) =>
        track.keywords.some((keyword) =>
          query.includes(keyword),
        ),
      ) || PROMPT_GENRES[0]
    );
  }, [prompt]);

  const [isGenerating, setIsGenerating] =
    useState(Boolean(prompt));

  const [genStep, setGenStep] =
    useState(0);

  const [isCompleted, setIsCompleted] =
    useState(false);

  const [
    generationResult,
    setGenerationResult,
  ] = useState<GenerationRecord | null>(
    null,
  );

  const [
    generationError,
    setGenerationError,
  ] = useState("");

  const [
    generationAttempt,
    setGenerationAttempt,
  ] = useState(0);

  const [
    audioSourceUrl,
    setAudioSourceUrl,
  ] = useState("");

  const [
    isReferenceAudio,
    setIsReferenceAudio,
  ] = useState(false);

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [currentTime, setCurrentTime] =
    useState(0);

  const [
    audioDuration,
    setAudioDuration,
  ] = useState(0);

  const audioRef =
    useRef<HTMLAudioElement | null>(null);

  const progressIntervalRef =
    useRef<number | null>(null);

  const generationRequestRef =
    useRef<GenerationRequestCache | null>(
      null,
    );

  const handleLogout = () => {
    logout();

    navigate("/login", {
      replace: true,
    });
  };

  useEffect(() => {
    if (!prompt) {
      setIsGenerating(false);
      setIsCompleted(false);
      setGenerationResult(null);
      setGenerationError("");
      return;
    }

    if (!accessToken) {
      navigate("/login", {
        replace: true,
        state: {
          from:
            `/generation?prompt=${encodeURIComponent(
              prompt,
            )}`,
        },
      });

      return;
    }

    let isActive = true;

    setGenStep(0);
    setIsGenerating(true);
    setIsCompleted(false);
    setGenerationResult(null);
    setGenerationError("");

    const progressInterval =
      window.setInterval(() => {
        setGenStep((currentStep) =>
          Math.min(
            currentStep + 1,
            GENERATION_STEPS.length - 2,
          ),
        );
      }, 1600);

    const requestKey = [
      accessToken,
      prompt,
      generationAttempt,
    ].join("::");

    if (
      !generationRequestRef.current ||
      generationRequestRef.current.key !==
        requestKey
    ) {
      generationRequestRef.current = {
        key: requestKey,
        promise: createGeneration(
          {
            prompt,
            mood: "prompt-derived",
            genre: matchedTrack.genre,
            tempo: "auto",
            instrument:
              "automatic orchestration",
            structure:
              "Intro-Build-Climax-Outro",
          },
          accessToken,
        ),
      };
    }

    const generationPromise =
      generationRequestRef.current.promise;

    generationPromise
      .then((response) => {
        if (!isActive) {
          return;
        }

        window.clearInterval(
          progressInterval,
        );

        setGenStep(
          GENERATION_STEPS.length - 1,
        );

        setGenerationResult(
          response.request,
        );

        setIsGenerating(false);

        const completed =
          response.request.status ===
          "completed";

        setIsCompleted(completed);

        if (completed) {
          toast({
            title:
              "Composition complete",
            description:
              response.message ||
              "The backend completed your arrangement.",
          });
        } else {
          setGenerationError(
            response.request.message ||
              response.message ||
              "The generation did not complete.",
          );
        }
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        window.clearInterval(
          progressInterval,
        );

        if (
          isUserAuthorizationError(error)
        ) {
          logout();

          navigate("/login", {
            replace: true,
            state: {
              from:
                `/generation?prompt=${encodeURIComponent(
                  prompt,
                )}`,
            },
          });

          return;
        }

        const failedGeneration =
          error instanceof
          GenerationApiError
            ? error.generation
            : null;

        setGenerationResult(
          failedGeneration,
        );

        const message =
          error instanceof Error
            ? error.message
            : "Generation failed.";

        setGenerationError(message);
        setIsGenerating(false);
        setIsCompleted(false);

        toast({
          title:
            "Composition generation failed",
          description: message,
          variant: "destructive",
        });
      });

    return () => {
      isActive = false;

      window.clearInterval(
        progressInterval,
      );
    };
  }, [
    accessToken,
    generationAttempt,
    logout,
    matchedTrack.genre,
    navigate,
    prompt,
    toast,
  ]);

  const generatedAudioPath =
    generationResult?.audioFilePath || "";

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setIsPlaying(false);
    setCurrentTime(0);
    setAudioDuration(0);

    if (!generatedAudioPath) {
      setAudioSourceUrl(
        matchedTrack.audioUrl,
      );

      setIsReferenceAudio(true);
      return;
    }

    const fileUrl =
      buildGenerationFileUrl(
        generatedAudioPath,
      );

    if (isExternalFileUrl(fileUrl)) {
      setAudioSourceUrl(fileUrl);
      setIsReferenceAudio(false);
      return;
    }

    if (!accessToken) {
      setAudioSourceUrl("");
      setIsReferenceAudio(false);
      return;
    }

    const controller =
      new AbortController();

    let isActive = true;
    let objectUrl = "";

    const loadGeneratedAudio =
      async () => {
        try {
          const response = await fetch(
            fileUrl,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },
              signal:
                controller.signal,
            },
          );

          if (
            response.status === 401 ||
            response.status === 403
          ) {
            logout();
            navigate("/login", {
              replace: true,
            });
            return;
          }

          if (!response.ok) {
            throw new Error(
              `Audio could not be loaded (${response.status}).`,
            );
          }

          const blob =
            await response.blob();

          objectUrl =
            URL.createObjectURL(blob);

          if (isActive) {
            setAudioSourceUrl(
              objectUrl,
            );

            setIsReferenceAudio(
              false,
            );
          }
        } catch (error) {
          const isAbortError =
            error instanceof
              DOMException &&
            error.name ===
              "AbortError";

          if (
            !isAbortError &&
            isActive
          ) {
            console.error(
              "Generated audio load error:",
              error,
            );

            setAudioSourceUrl(
              matchedTrack.audioUrl,
            );

            setIsReferenceAudio(
              true,
            );
          }
        }
      };

    void loadGeneratedAudio();

    return () => {
      isActive = false;
      controller.abort();

      if (objectUrl) {
        URL.revokeObjectURL(
          objectUrl,
        );
      }
    };
  }, [
    accessToken,
    generatedAudioPath,
    logout,
    matchedTrack.audioUrl,
    navigate,
  ]);

  const togglePlay = () => {
    if (!audioSourceUrl) {
      toast({
        title:
          "Audio unavailable",
        description:
          "No playable audio file is available for this generation.",
        variant: "destructive",
      });

      return;
    }

    if (!audioRef.current) {
      const audio =
        new Audio(audioSourceUrl);

      audio.addEventListener(
        "loadedmetadata",
        () => {
          setAudioDuration(
            audio.duration || 0,
          );
        },
      );

      audio.addEventListener(
        "ended",
        () => {
          setIsPlaying(false);
          setCurrentTime(0);

          if (
            progressIntervalRef.current
          ) {
            window.clearInterval(
              progressIntervalRef.current,
            );
          }
        },
      );

      audioRef.current = audio;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);

      if (progressIntervalRef.current) {
        window.clearInterval(
          progressIntervalRef.current,
        );
      }

      return;
    }

    audioRef.current
      .play()
      .then(() => {
        setIsPlaying(true);

        progressIntervalRef.current =
          window.setInterval(() => {
            if (audioRef.current) {
              setCurrentTime(
                audioRef.current.currentTime,
              );
            }
          }, 250);
      })
      .catch((error: unknown) => {
        console.error(
          "Audio playback error:",
          error,
        );

        toast({
          title:
            "Audio playback blocked",
          description:
            "Could not start the audio stream.",
          variant: "destructive",
        });
      });
  };

  const handleSliderSeek = (
    value: number[],
  ) => {
    if (audioRef.current) {
      audioRef.current.currentTime =
        value[0];

      setCurrentTime(value[0]);
    }
  };

  const formatTime = (
    seconds: number,
  ): string => {
    const minutes =
      Math.floor(seconds / 60);

    const remainingSeconds =
      Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0");

    return `${minutes}:${remainingSeconds}`;
  };

  const handleDownload =
    async (
      filePath:
        | string
        | null
        | undefined,
      fallbackName: string,
    ): Promise<void> => {
      if (!filePath) {
        return;
      }

      const fileUrl =
        buildGenerationFileUrl(
          filePath,
        );

      if (isExternalFileUrl(fileUrl)) {
        const link =
          document.createElement("a");

        link.href = fileUrl;
        link.target = "_blank";
        link.rel =
          "noopener noreferrer";
        link.download =
          fallbackName;

        document.body.appendChild(
          link,
        );

        link.click();
        link.remove();

        return;
      }

      if (!accessToken) {
        handleLogout();
        return;
      }

      try {
        const response = await fetch(
          fileUrl,
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
          },
        );

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          handleLogout();
          return;
        }

        if (!response.ok) {
          throw new Error(
            `Download failed with status ${response.status}.`,
          );
        }

        const blob =
          await response.blob();

        const temporaryUrl =
          URL.createObjectURL(blob);

        const link =
          document.createElement("a");

        link.href = temporaryUrl;
        link.download =
          fallbackName;

        document.body.appendChild(
          link,
        );

        link.click();
        link.remove();

        URL.revokeObjectURL(
          temporaryUrl,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not download the generated file.";

        console.error(
          "Generation file download error:",
          error,
        );

        toast({
          title:
            "Download failed",
          description: message,
          variant: "destructive",
        });
      }
    };

  const handleReset = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (
      progressIntervalRef.current
    ) {
      window.clearInterval(
        progressIntervalRef.current,
      );
    }

    setIsPlaying(false);
    setCurrentTime(0);
    setAudioDuration(0);
    setGenerationResult(null);
    setGenerationError("");
    setIsCompleted(false);
    setIsGenerating(true);
    setGenStep(0);

    setGenerationAttempt(
      (currentAttempt) =>
        currentAttempt + 1,
    );
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }

      if (
        progressIntervalRef.current
      ) {
        window.clearInterval(
          progressIntervalRef.current,
        );
      }
    };
  }, []);

  const generatedMidiPath =
    generationResult?.midiFilePath;

  const hasGeneratedAudio =
    Boolean(generatedAudioPath);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030303] selection:bg-white/10">
      <main className="container relative z-10 mx-auto px-4 pb-16 pt-8 md:px-6 md:pt-12">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Signed in as
              </p>

              <p className="truncate text-sm font-medium text-white">
                {user?.name ||
                  user?.full_name ||
                  user?.fullname ||
                  user?.email}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleLogout}
              className="shrink-0 rounded-xl border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
            >
              Log out
            </Button>
          </div>

          <Breadcrumb
            items={[
              {
                name: "Home",
                url:
                  "https://SoLuna.studio/",
              },
              {
                name:
                  "AI Generation",
                url:
                  "https://SoLuna.studio/generation",
              },
            ]}
          />

          <div className="mb-16 space-y-6 text-center">
            <div className="inline-flex items-center space-x-2 rounded-full border border-white/5 bg-white/[0.02] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>
                AI Prompt Composer
              </span>
            </div>

            <div className="space-y-4">
              <h1 className="text-5xl font-light tracking-tighter text-white md:text-7xl">
                Composition{" "}
                <span className="font-thin text-muted-foreground">
                  Suite
                </span>
              </h1>

              <p className="mx-auto max-w-2xl text-xl font-light leading-relaxed text-muted-foreground">
                Your prompt is sent to the
                authenticated SoLuna generation
                backend and converted into a
                structured composition.
              </p>
            </div>
          </div>

          <div className="glass-card flex min-h-[550px] flex-col justify-center overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#0a0a0a]/90 p-10 shadow-2xl">
            {!prompt && (
              <div className="space-y-4 py-12 text-center">
                <Quote className="mx-auto h-10 w-10 text-muted-foreground/30" />

                <h3 className="text-xl font-light text-white">
                  No prompt provided
                </h3>

                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                  Return to the home page and
                  enter a text prompt to start
                  generation.
                </p>

                <Link to="/">
                  <Button
                    variant="outline"
                    className="mt-4"
                  >
                    Back to Home
                  </Button>
                </Link>
              </div>
            )}

            {prompt && (
              <AnimatePresence mode="wait">
                {isGenerating && (
                  <motion.div
                    key="generating-panel"
                    initial={{
                      opacity: 0,
                      scale: 0.98,
                    }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                    }}
                    exit={{
                      opacity: 0,
                    }}
                    className="flex flex-1 flex-col items-center justify-center space-y-8"
                  >
                    <div className="flex flex-col items-center justify-center space-y-4">
                      <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-white/5 bg-white/[0.03]">
                        <Loader2 className="h-10 w-10 animate-spin text-white" />
                      </div>

                      <div className="max-w-md space-y-2 text-center">
                        <h3 className="text-2xl font-light text-white">
                          Generating Composition
                        </h3>

                        <div className="truncate rounded-xl border border-white/5 bg-white/[0.02] p-3 px-4 text-xs italic leading-relaxed text-muted-foreground">
                          “{prompt}”
                        </div>
                      </div>
                    </div>

                    <div className="mx-auto w-full max-w-md space-y-3 rounded-2xl border border-white/5 bg-white/[0.02] p-6 text-left font-mono text-xs">
                      {GENERATION_STEPS.map(
                        (step, index) => {
                          const isDone =
                            index < genStep;

                          const isActive =
                            index ===
                            genStep;

                          return (
                            <div
                              key={step}
                              className={`flex items-start gap-3 transition-all duration-300 ${
                                isDone
                                  ? "text-white/60"
                                  : isActive
                                    ? "animate-pulse font-bold text-white"
                                    : "text-muted-foreground/20"
                              }`}
                            >
                              {isDone ? (
                                <span className="font-bold text-white">
                                  ✔
                                </span>
                              ) : isActive ? (
                                <span className="text-white">
                                  •
                                </span>
                              ) : (
                                <span>◦</span>
                              )}

                              <span className="flex-1">
                                {step}
                              </span>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </motion.div>
                )}

                {generationError &&
                  !isGenerating && (
                    <motion.div
                      key="generation-error"
                      initial={{
                        opacity: 0,
                        y: 12,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                      }}
                      exit={{
                        opacity: 0,
                      }}
                      className="mx-auto w-full max-w-2xl space-y-6 text-center"
                    >
                      <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-6">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-200/70">
                          Generation failed
                        </p>

                        <h3 className="mt-3 text-2xl font-light text-white">
                          The planner could not
                          complete this request
                        </h3>

                        <p className="mt-4 text-sm leading-6 text-red-100/80">
                          {generationError}
                        </p>

                        {generationResult?.id && (
                          <p className="mt-3 text-xs text-white/40">
                            Failed request saved
                            as generation{" "}
                            {generationResult.id}.
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap justify-center gap-3">
                        <Button
                          type="button"
                          onClick={
                            handleReset
                          }
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Try again
                        </Button>

                        <Link to="/">
                          <Button
                            variant="outline"
                          >
                            New Prompt
                          </Button>
                        </Link>
                      </div>
                    </motion.div>
                  )}

                {isCompleted &&
                  !isGenerating &&
                  generationResult && (
                    <motion.div
                      key="completed-panel"
                      initial={{
                        opacity: 0,
                        y: 15,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                      }}
                      exit={{
                        opacity: 0,
                      }}
                      className="space-y-8 text-left"
                    >
                      <div className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                            Generated request{" "}
                            {generationResult.id}
                          </p>

                          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-200">
                            {
                              generationResult.status
                            }
                          </span>
                        </div>

                        <h3 className="border-l-2 border-primary/60 pl-1.5 text-lg font-light italic leading-relaxed text-white md:text-xl">
                          “{prompt}”
                        </h3>

                        <p className="text-xs leading-5 text-muted-foreground">
                          {generationResult.message ||
                            "The backend completed the composition request."}
                        </p>
                      </div>

                      <div className="space-y-4">
                        <Button
                          onClick={togglePlay}
                          className="h-16 w-full rounded-2xl bg-white text-lg font-semibold text-black hover:bg-white/90"
                        >
                          {isPlaying
                            ? "⏸ Pause Audio"
                            : isReferenceAudio
                              ? "▶ Play Reference Preview"
                              : "▶ Play Generated Audio"}
                        </Button>

                        {isReferenceAudio && (
                          <p className="text-center text-xs text-amber-200/70">
                            The backend did not
                            provide a playable
                            audio file, so this is
                            a reference preview
                            and not the generated
                            output.
                          </p>
                        )}

                        <div className="grid gap-6 pt-4 md:grid-cols-2">
                          <div className="space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
                            <div className="flex items-center gap-3">
                              <div className="rounded-xl border border-white/5 bg-white/5 p-2">
                                <FileAudio className="h-5 w-5 text-white" />
                              </div>

                              <div>
                                <Label className="text-sm font-bold text-white">
                                  {hasGeneratedAudio
                                    ? "Generated Audio"
                                    : "Reference Preview"}
                                </Label>

                                <p className="text-xs text-muted-foreground">
                                  {hasGeneratedAudio
                                    ? "Rendered audio returned by the backend"
                                    : "Static preview used only when no generated audio is available"}
                                </p>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <Slider
                                value={[
                                  currentTime,
                                ]}
                                max={
                                  audioDuration ||
                                  1
                                }
                                step={0.1}
                                onValueChange={
                                  handleSliderSeek
                                }
                                className="w-full cursor-pointer py-2"
                              />

                              <div className="flex justify-between font-mono text-[9px] text-muted-foreground/40">
                                <span>
                                  {formatTime(
                                    currentTime,
                                  )}
                                </span>

                                <span>
                                  {formatTime(
                                    audioDuration,
                                  )}
                                </span>
                              </div>
                            </div>

                            {generatedAudioPath ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleDownload(
                                    generatedAudioPath,
                                    `soluna-${generationResult.id}-audio.wav`,
                                  )
                                }
                                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-xs font-semibold text-white transition-all hover:border-white/20"
                              >
                                <Download className="h-4 w-4" />
                                Download Audio
                              </button>
                            ) : (
                              <p className="text-xs leading-5 text-muted-foreground">
                                No generated audio
                                file path was
                                returned.
                              </p>
                            )}
                          </div>

                          <div className="flex flex-col justify-between space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
                            <div className="space-y-4">
                              <div className="flex items-center gap-3">
                                <div className="rounded-xl border border-white/5 bg-white/5 p-2">
                                  <Music2 className="h-5 w-5 text-white" />
                                </div>

                                <div>
                                  <Label className="text-sm font-bold text-white">
                                    AI Orchestrated MIDI
                                  </Label>

                                  <p className="text-xs text-muted-foreground">
                                    Structured MIDI output returned by the backend
                                  </p>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="rounded-lg bg-white/[0.03] p-3">
                                  <span className="text-muted-foreground">
                                    Genre
                                  </span>
                                  <p className="mt-1 font-medium text-white">
                                    {
                                      generationResult.genre
                                    }
                                  </p>
                                </div>

                                <div className="rounded-lg bg-white/[0.03] p-3">
                                  <span className="text-muted-foreground">
                                    Structure
                                  </span>
                                  <p className="mt-1 font-medium text-white">
                                    {
                                      generationResult.structure
                                    }
                                  </p>
                                </div>
                              </div>
                            </div>

                            {generatedMidiPath ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleDownload(
                                    generatedMidiPath,
                                    `soluna-${generationResult.id}.mid`,
                                  )
                                }
                                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-xs font-bold text-black transition-all hover:bg-white/90"
                              >
                                <Download className="h-4 w-4" />
                                Download MIDI
                              </button>
                            ) : (
                              <p className="text-xs leading-5 text-muted-foreground">
                                No MIDI file path
                                was returned by the
                                planner.
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-6">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Backend genre:{" "}
                            {generationResult.genre.toUpperCase()}
                          </span>

                          <div className="flex items-center gap-2">
                            <Link to="/">
                              <Button
                                variant="outline"
                                className="h-9 rounded-lg text-xs"
                              >
                                New Prompt
                              </Button>
                            </Link>

                            <Button
                              onClick={
                                handleReset
                              }
                              variant="ghost"
                              className="h-9 rounded-lg border border-white/10 text-xs text-muted-foreground hover:bg-white/5 hover:text-white"
                            >
                              <RefreshCw className="mr-2 h-3.5 w-3.5" />
                              Regenerate
                            </Button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
              </AnimatePresence>
            )}
          </div>

          <div className="mt-16">
            <RelatedTools currentPath="/generation" />
          </div>
        </div>
      </main>
    </div>
  );
}