import { useState, useRef, useEffect, useMemo } from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Download,
  RefreshCw,
  Loader2,
  FileAudio,
  Music2,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { usePageMetadata } from "@/hooks/usePageMetadata";
import { Breadcrumb } from "@/components/SEOContent";
import RelatedTools from "@/components/RelatedTools";
import { useAuth } from "@/contexts/AuthContext";

const PROMPT_GENRES = [
  {
    keywords: ["classical", "piano", "satie", "ambient", "calm", "relaxing", "slow", "acoustic"],
    title: "Orchestrated Gymnopédie No. 1 (Ambient Classical)",
    audioUrl: "/musics/Gymnopedieno.1.mp3",
    duration: "2:39",
    genre: "classical"
  },
  {
    keywords: ["electronic", "synth", "gaming", "edm", "dance", "sprunki", "beat", "techno", "house"],
    title: "Sprunki Phase 2.5 - Synth Arrangement (Electronic)",
    audioUrl: "/musics/SprunkiPhase2.5(Bonus).mp3",
    duration: "2:05",
    genre: "electronic"
  },
  {
    keywords: ["pop", "afrobeat", "groove", "rema", "smooth", "rhythm", "danceable"],
    title: "Calm Down - Afrobeat Orchestration (Pop)",
    audioUrl: "/musics/Remacalm.mp3",
    duration: "3:58",
    genre: "pop"
  },
  {
    keywords: ["rock", "jrock", "band", "anime", "guitar", "energetic", "solo"],
    title: "Sakura no Uta - Full Band Arrangement (Rock)",
    audioUrl: "/musics/SakuraNoUta.mp3",
    duration: "1:40",
    genre: "jrock"
  }
];

export default function GenerationPage() {
    const navigate = useNavigate();
  const { user, logout } = useAuth();
  usePageMetadata({
    title: "AI Prompt Composer | SoLuna - Generating Your Audio",
    description: "Watch your text prompt get transformed into structured midi arrangements and pristine MP3 audio.",
    keywords: "ai generation, prompt music, text to midi, render prompt to mp3, virtual orchestra, free midi tools",
    canonicalUrl: "https://SoLuna.studio/generation",
    ogImage: "https://SoLuna.studio/logo2.png",
    ogType: "website"
  });

  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const prompt = searchParams.get("prompt") || "";
    const handleLogout = () => {
    logout();

    navigate("/login", {
      replace: true,
    });
  };

  // Find matching genre track based on prompt keywords
  const matchedTrack = useMemo(() => {
    const query = prompt.toLowerCase();
    const match = PROMPT_GENRES.find(g => g.keywords.some(k => query.includes(k)));
    // Fallback to Classical if no keyword matches
    return match || PROMPT_GENRES[0];
  }, [prompt]);

  // States
  const [isGenerating, setIsGenerating] = useState(true);
  const [genStep, setGenStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  // Playback audio states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<number | null>(null);

  const generationSteps = [
    "Contacting SoLuna AI Generation cluster...",
    "Tokenizing semantic input prompt...",
    "Generating core chord progressions & tempo mapping...",
    "Orchestrating instrument tracks based on prompt layout...",
    "Scoring auxiliary voices (melodies, counterpoint, pads)...",
    "Compiling completed MIDI file and rendering high-fidelity MP3..."
  ];

  // Simulation effect
  useEffect(() => {
    if (!prompt) {
      setIsGenerating(false);
      return;
    }

    setGenStep(0);
    setIsGenerating(true);
    setIsCompleted(false);

    // Simulated API call or generation process
    const interval = setInterval(() => {
      setGenStep((prev) => {
        if (prev >= generationSteps.length - 1) {
          clearInterval(interval);
          setTimeout(() => {
            setIsGenerating(false);
            setIsCompleted(true);
            toast({
              title: "Composition Complete!",
              description: "AI has successfully completed your arrangement."
            });
          }, 800);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [prompt]);

  // Audio playback controls
  const togglePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(matchedTrack.audioUrl);
      audioRef.current.addEventListener("loadedmetadata", () => {
        setAudioDuration(audioRef.current?.duration || 0);
      });
      audioRef.current.addEventListener("ended", () => {
        setIsPlaying(false);
        setCurrentTime(0);
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      });
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        progressIntervalRef.current = window.setInterval(() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }, 250);
      }).catch((e) => {
        console.error("Audio playback error:", e);
        toast({
          title: "Audio playback blocked",
          description: "Could not start audio stream.",
          variant: "destructive"
        });
      });
    }
  };

  const handleSliderSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleReset = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setIsCompleted(false);
    setIsGenerating(true);
    setGenStep(0);
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#030303] relative overflow-hidden selection:bg-white/10">
      <main className="container mx-auto px-4 md:px-6 pt-8 md:pt-12 pb-16 relative z-10">
        <div className="max-w-5xl mx-auto">
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
          {/* Breadcrumb */}
          <Breadcrumb
           items={[
            { name: "Home", url: "https://SoLuna.studio/" },
            { name: "AI Generation", url: "https://SoLuna.studio/generation" }
          ]} />

          {/* Header */}
          <div className="mb-16 text-center space-y-6">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-white/5 bg-white/[0.02] text-muted-foreground text-[10px] font-bold tracking-[0.2em] uppercase">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>AI Prompt Composer</span>
            </div>

            <div className="space-y-4">
              <h1 className="text-5xl md:text-7xl font-light tracking-tighter text-white">
                Composition <span className="text-muted-foreground font-thin">Suite</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed font-light">
                Witness your musical ideas materialize. Our neural networks analyze your text description and generate fully scored arrangements.
              </p>
            </div>
          </div>

          {/* Main Glass Card */}
          <div className="glass-card rounded-[2.5rem] border border-white/5 bg-[#0a0a0a]/90 shadow-2xl overflow-hidden min-h-[550px] flex flex-col p-10 justify-center">
            
            {!prompt && (
              <div className="text-center py-12 space-y-4">
                <Quote className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <h3 className="text-xl font-light text-white">No prompt provided</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Please go back to the home page and enter a text prompt to generate audio.
                </p>
                <Link to="/">
                  <Button variant="outline" className="mt-4">Back to Home</Button>
                </Link>
              </div>
            )}

            {prompt && (
              <AnimatePresence mode="wait">
                {/* Step 1: Processing */}
                {isGenerating && (
                  <motion.div
                    key="generating-panel"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col items-center justify-center space-y-8"
                  >
                    <div className="flex flex-col items-center justify-center space-y-4">
                      <div className="relative flex items-center justify-center w-24 h-24 bg-white/[0.03] rounded-full border border-white/5">
                        <Loader2 className="w-10 h-10 animate-spin text-white" />
                      </div>
                      
                      <div className="space-y-2 text-center max-w-md">
                        <h3 className="text-2xl font-light text-white">Generating Composition</h3>
                        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl text-xs text-muted-foreground italic leading-relaxed truncate px-4">
                          "{prompt}"
                        </div>
                      </div>
                    </div>

                    {/* Progress Steps Log */}
                    <div className="w-full max-w-md mx-auto p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-left space-y-3 font-mono text-xs">
                      {generationSteps.map((step, idx) => {
                        const isDone = idx < genStep;
                        const isActive = idx === genStep;
                        return (
                          <div 
                            key={idx} 
                            className={`flex items-start gap-3 transition-all duration-300 ${
                              isDone ? "text-white/60" : isActive ? "text-white font-bold animate-pulse" : "text-muted-foreground/20"
                            }`}
                          >
                            {isDone ? (
                              <span className="text-white font-bold">✔</span>
                            ) : isActive ? (
                              <span className="text-white">•</span>
                            ) : (
                              <span>◦</span>
                            )}
                            <span className="flex-1">{step}</span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {/* Step 2: Finished result page */}
                {isCompleted && !isGenerating && (
                  <motion.div
                    key="completed-panel"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="space-y-8 text-left"
                  >
                    {/* Prompt Box display */}
                    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 relative overflow-hidden flex flex-col gap-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold">Arranged Prompt</p>
                      <h3 className="text-lg md:text-xl text-white font-light italic leading-relaxed pl-1.5 border-l-2 border-primary/60">
                        "{prompt}"
                      </h3>
                    </div>

                    {/* Audio Controls */}
                    <div className="space-y-4">
                      <Button
                        onClick={togglePlay}
                        className="w-full h-16 rounded-2xl bg-white text-black hover:bg-white/90 text-lg font-semibold"
                      >
                        {isPlaying ? "⏸ Pause Preview" : "▶ Play Preview"}
                      </Button>

                      {/* Download and Audio cards */}
                      <div className="grid md:grid-cols-2 gap-6 pt-4">
                        {/* Audio Preview and MP3 */}
                        <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-white/5 border border-white/5">
                              <FileAudio className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <Label className="text-sm font-bold text-white">Prisine MP3 Audio</Label>
                              <p className="text-xs text-muted-foreground">High-quality rendered audio track</p>
                            </div>
                          </div>
                          
                          <div className="space-y-1">
                            <Slider
                              value={[currentTime]}
                              max={audioDuration || 125}
                              step={0.1}
                              onValueChange={handleSliderSeek}
                              className="w-full cursor-pointer py-2"
                            />
                            <div className="flex justify-between text-[9px] text-muted-foreground/40 font-mono">
                              <span>{formatTime(currentTime)}</span>
                              <span>{formatTime(audioDuration || 125)}</span>
                            </div>
                          </div>
                          
                          <a
                            href={matchedTrack.audioUrl}
                            download
                            className="w-full h-10 px-4 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                          >
                            <Download className="w-4 h-4 text-white" />
                            Download MP3 File
                          </a>
                        </div>

                        {/* MIDI Orchestration */}
                        <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-4 flex flex-col justify-between">
                          <div className="space-y-4">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-xl bg-white/5 border border-white/5">
                                <Music2 className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <Label className="text-sm font-bold text-white">AI Orchestrated MIDI</Label>
                                <p className="text-xs text-muted-foreground">Complete multi-track musical score</p>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed pt-2">
                              Contains full MIDI track listings (Piano keys, backing strings, chord counter-points, and beat stems) mapped to GM standard values.
                            </p>
                          </div>
                          
                          <a
                            href="/samples/completed_orchestration.mid"
                            download
                            className="w-full h-10 px-4 rounded-lg bg-white hover:bg-white/90 text-black text-xs font-bold flex items-center justify-center gap-2 transition-all"
                          >
                            <Download className="w-4 h-4" />
                            Download MIDI File
                          </a>
                        </div>
                      </div>

                      {/* Reset Actions */}
                      <div className="flex justify-between items-center pt-6 mt-6 border-t border-white/5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                          AI Model preset: {matchedTrack.genre.toUpperCase()}
                        </span>
                        
                        <div className="flex items-center gap-2">
                          <Link to="/">
                            <Button
                              variant="outline"
                              className="rounded-lg h-9 text-xs"
                            >
                              New Prompt
                            </Button>
                          </Link>
                          
                          <Button
                            onClick={handleReset}
                            variant="ghost"
                            className="rounded-lg h-9 text-xs border border-white/10 hover:bg-white/5 text-muted-foreground hover:text-white"
                          >
                            <RefreshCw className="w-3.5 h-3.5 mr-2" />
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

          {/* Related tools */}
          <div className="mt-16">
            <RelatedTools currentTool="/generation" />
          </div>
        </div>
      </main>
    </div>
  );
}