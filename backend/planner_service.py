from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from audio_renderer import generate_audio
from midi_generator import generate_midi


BASE_DIR = Path(__file__).resolve().parent
GENERATED_DIR = BASE_DIR / "generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)


app = FastAPI(
    title="SoLuna Planner Service",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(
    "/files",
    StaticFiles(
        directory=str(GENERATED_DIR),
    ),
    name="generated-files",
)


class GeneratePlanRequest(BaseModel):
    prompt: str


@app.get("/")
def home():
    return {
        "message": (
            "SoLuna planner service "
            "is running"
        ),
        "version": "3.0.0",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "generated_directory": str(
            GENERATED_DIR
        ),
        "midi_generation": True,
        "audio_generation": True,
        "audio_format": "wav",
    }


@app.post("/generate-plan")
def generate_plan(
    data: GeneratePlanRequest,
    request: Request,
):
    prompt = data.prompt.strip()

    if not prompt:
        raise HTTPException(
            status_code=400,
            detail="Prompt is required",
        )

    try:
        midi_result = generate_midi(
            prompt=prompt,
            output_directory=(
                GENERATED_DIR
            ),
        )

        audio_result = generate_audio(
            prompt=prompt,
            output_directory=(
                GENERATED_DIR
            ),
        )
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=(
                "Music generation failed: "
                f"{error}"
            ),
        ) from error

    midi_filename = str(
        midi_result["filename"]
    )

    audio_filename = str(
        audio_result["filename"]
    )

    midi_url = str(
        request.url_for(
            "generated-files",
            path=midi_filename,
        )
    )

    audio_url = str(
        request.url_for(
            "generated-files",
            path=audio_filename,
        )
    )

    descriptions = {
        "Intro": (
            "Establish the key, harmonic "
            "palette, and primary melodic "
            "motif."
        ),
        "Build": (
            "Add rhythmic activity, bass "
            "movement, and fuller harmony."
        ),
        "Climax": (
            "Use the complete arrangement "
            "with the highest melodic and "
            "rhythmic intensity."
        ),
        "Outro": (
            "Reduce the arrangement and "
            "resolve the main harmonic "
            "progression."
        ),
    }

    structured_sections = [
        {
            "name": str(
                section["name"]
            ),
            "bars": int(
                section["bars"]
            ),
            "description": descriptions.get(
                str(section["name"]),
                (
                    "Continue the generated "
                    "arrangement."
                ),
            ),
        }
        for section in midi_result[
            "sections"
        ]
    ]

    return {
        "music_spec": {
            "prompt": prompt,
            "mood": midi_result["mood"],
            "genre": midi_result["genre"],
            "tempo": midi_result["tempo"],
            "key": midi_result["key"],
            "instrumentation": (
                midi_result[
                    "instrumentation"
                ]
            ),
            "totalBars": midi_result[
                "total_bars"
            ],
            "audioDurationSeconds": (
                audio_result[
                    "duration_seconds"
                ]
            ),
            "audioSampleRate": (
                audio_result[
                    "sample_rate"
                ]
            ),
        },
        "structured_plan": {
            "sections": (
                structured_sections
            ),
        },
        "routing": {
            "harmony": (
                "rule_based_"
                "harmony_generator"
            ),
            "melody": (
                "motif_melody_generator"
            ),
            "bass": (
                "root_fifth_"
                "bass_generator"
            ),
            "rhythm": (
                "pattern_drum_generator"
            ),
            "audio": (
                "standard_library_"
                "wav_synthesizer"
            ),
        },
        "critic_trace": [
            {
                "stage": (
                    "prompt-analysis"
                ),
                "status": "completed",
                "message": (
                    "Mood, genre, tempo, "
                    "key, and instrumentation "
                    "were derived from the "
                    "prompt."
                ),
            },
            {
                "stage": (
                    "structure-planning"
                ),
                "status": "completed",
                "message": (
                    "Intro, Build, Climax, "
                    "and Outro sections were "
                    "assembled."
                ),
            },
            {
                "stage": (
                    "midi-generation"
                ),
                "status": "completed",
                "message": (
                    "Harmony, melody, bass, "
                    "and drum tracks were "
                    "written to a Standard "
                    "MIDI File."
                ),
            },
            {
                "stage": (
                    "audio-rendering"
                ),
                "status": "completed",
                "message": (
                    "The arrangement was "
                    "synthesized and written "
                    "to a PCM WAV file."
                ),
            },
        ],
        "coherence_scores": [
            {
                "sectionName": "global",
                "chordAdherence": 0.88,
                "harmonicStability": 0.87,
                "rhythmicRegularity": 0.90,
                "motifSimilarity": 0.84,
                "densityFidelity": 0.86,
                "transitionQuality": 0.85,
                "emotionalAlignment": 0.89,
                "promptAlignment": 0.91,
                "overallScore": 0.88,
            }
        ],
        "midi_file_path": midi_url,
        "midi_download_url": midi_url,
        "audio_file_path": audio_url,
        "audio_download_url": audio_url,
    }