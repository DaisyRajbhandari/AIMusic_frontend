from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


app = FastAPI(
    title="SoLuna Planner Service",
    version="1.0.0",
)


class GeneratePlanRequest(BaseModel):
    prompt: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/generate-plan")
def generate_plan(data: GeneratePlanRequest):
    prompt = data.prompt.strip()

    if not prompt:
        raise HTTPException(
            status_code=400,
            detail="Prompt is required",
        )

    return {
        "music_spec": {
            "prompt": prompt,
            "mood": "happy",
            "genre": "pop",
            "tempo": 120,
            "key": "C major",
            "instrumentation": [
                "piano",
                "bass",
                "drums",
                "strings",
            ],
        },
        "structured_plan": {
            "sections": [
                {
                    "name": "Intro",
                    "bars": 4,
                    "description": (
                        "Light piano introduction "
                        "with soft percussion."
                    ),
                },
                {
                    "name": "Build",
                    "bars": 8,
                    "description": (
                        "Bass and rhythmic chords "
                        "are introduced."
                    ),
                },
                {
                    "name": "Climax",
                    "bars": 8,
                    "description": (
                        "Full instrumentation with "
                        "a strong lead melody."
                    ),
                },
                {
                    "name": "Outro",
                    "bars": 4,
                    "description": (
                        "The arrangement gradually "
                        "reduces and resolves."
                    ),
                },
            ]
        },
        "routing": {
            "harmony": "harmony_adapter",
            "melody": "melody_adapter",
            "rhythm": "rhythm_adapter",
        },
        "critic_trace": [
            {
                "stage": "planning",
                "status": "approved",
                "message": (
                    "The generated structure is coherent."
                ),
            }
        ],
        "coherence_scores": [
            {
                "sectionName": "global",
                "chordAdherence": 0.88,
                "harmonicStability": 0.85,
                "rhythmicRegularity": 0.90,
                "motifSimilarity": 0.82,
                "densityFidelity": 0.84,
                "transitionQuality": 0.86,
                "emotionalAlignment": 0.91,
                "promptAlignment": 0.93,
                "overallScore": 0.87,
            }
        ],
        "midi_file_path": None,
        "audio_file_path": None,
    }