from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse
import hashlib
import hmac
import json
import math
import os
import secrets
import smtplib
import sqlite3
import ssl
import time
from email.message import EmailMessage

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from pydantic import BaseModel, Field
from pwdlib import PasswordHash

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DB_NAME = str(BASE_DIR / "synestra.db")

GENERATED_FILES_DIR = (
    BASE_DIR.parent / "generated"
).resolve()


def delete_generated_file(
    file_url: str | None,
) -> dict:
    if not file_url:
        return {
            "deleted": False,
            "filename": None,
            "reason": "No file path stored",
        }

    parsed_url = urlparse(
        str(file_url)
    )

    filename = Path(
        unquote(parsed_url.path)
    ).name

    if not filename:
        return {
            "deleted": False,
            "filename": None,
            "reason": "Invalid filename",
        }

    allowed_extensions = {
        ".mid",
        ".midi",
        ".wav",
    }

    if (
        Path(filename).suffix.lower()
        not in allowed_extensions
    ):
        return {
            "deleted": False,
            "filename": filename,
            "reason": (
                "Unsupported generated-file "
                "extension"
            ),
        }

    target_path = (
        GENERATED_FILES_DIR / filename
    ).resolve()

    if (
        target_path.parent
        != GENERATED_FILES_DIR
    ):
        return {
            "deleted": False,
            "filename": filename,
            "reason": "Unsafe file path",
        }

    if not target_path.exists():
        return {
            "deleted": False,
            "filename": filename,
            "reason": (
                "File was already missing"
            ),
        }

    if not target_path.is_file():
        return {
            "deleted": False,
            "filename": filename,
            "reason": (
                "Generated path is not a file"
            ),
        }

    target_path.unlink()

    return {
        "deleted": True,
        "filename": filename,
        "reason": None,
    }


JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24
JWT_ISSUER = "synestra-ai"

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL") or SMTP_USERNAME
PASSWORD_RESET_DEBUG = os.getenv("PASSWORD_RESET_DEBUG", "false").lower() == "true"

RESET_CODE_EXPIRE_MINUTES = 10
RESET_CODE_COOLDOWN_SECONDS = 60
RESET_CODE_MAX_ATTEMPTS = 5

if not JWT_SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY is missing. Create backend/.env and add JWT_SECRET_KEY."
    )

app = FastAPI(title="Synestra AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://192.168.1.68:8080",

    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

password_hash = PasswordHash.recommended()
bearer_scheme = HTTPBearer(auto_error=False)


def connect_db():
    connection = sqlite3.connect(DB_NAME)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def normalize_email(email: str) -> str:
    return email.strip().lower()


def legacy_sha256_hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def is_legacy_sha256_hash(stored_hash: str) -> bool:
    if len(stored_hash) != 64:
        return False

    return all(character in "0123456789abcdef" for character in stored_hash.lower())


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, stored_hash: str) -> bool:
    if is_legacy_sha256_hash(stored_hash):
        return hmac.compare_digest(
            legacy_sha256_hash(password),
            stored_hash.lower(),
        )

    try:
        return password_hash.verify(password, stored_hash)
    except Exception:
        return False


def create_access_token(
    email: str,
    token_version: int,
    role: str,
    token_kind: str,
) -> str:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": email,
        "ver": token_version,
        "role": str(role).strip().lower(),
        "token_kind": token_kind,
        "iat": now,
        "exp": expires_at,
        "iss": JWT_ISSUER,
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def public_user(user: sqlite3.Row) -> dict:
    return {
        "name": user["full_name"],
        "email": user["email"],
        "age": user["age"],
        "gender": user["gender"],
        "role": user["role"],
    }


def column_exists(cursor, table_name, column_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()

    for column in columns:
        if column["name"] == column_name:
            return True

    return False


def create_tables():
    connection = connect_db()
    cursor = connection.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            age TEXT NOT NULL,
            gender TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
        """
    )

    if not column_exists(cursor, "users", "token_version"):
        cursor.execute(
            "ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0"
        )

    if not column_exists(cursor, "users", "role"):
        cursor.execute(
            "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'"
        )

    cursor.execute(
        """
        UPDATE users
        SET role = 'user'
        WHERE role IS NULL
           OR TRIM(role) = ''
           OR LOWER(role) NOT IN ('user', 'admin')
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS password_reset_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            email TEXT NOT NULL,
            code_hash TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            used INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        )
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_password_reset_email_created
        ON password_reset_codes (email, created_at DESC)
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS generations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            prompt TEXT NOT NULL,
            mood TEXT,
            genre TEXT,
            tempo TEXT,
            music_key TEXT,
            instrument TEXT,
            structure TEXT,
            status TEXT DEFAULT 'pending',
            message TEXT,
            midi_notes TEXT,
            midi_file_path TEXT,
            created_at INTEGER NOT NULL
        )
        """
    )

    if not column_exists(cursor, "generations", "status"):
        cursor.execute(
            "ALTER TABLE generations ADD COLUMN status TEXT DEFAULT 'pending'"
        )

    if not column_exists(cursor, "generations", "message"):
        cursor.execute("ALTER TABLE generations ADD COLUMN message TEXT")

    if not column_exists(cursor, "generations", "midi_notes"):
        cursor.execute("ALTER TABLE generations ADD COLUMN midi_notes TEXT")

    if not column_exists(cursor, "generations", "midi_file_path"):
        cursor.execute("ALTER TABLE generations ADD COLUMN midi_file_path TEXT")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS training_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            run_name TEXT NOT NULL,
            base_model TEXT NOT NULL,
            total_parameters INTEGER NOT NULL,
            trainable_parameters INTEGER NOT NULL,
            lora_rank INTEGER NOT NULL,
            lora_alpha REAL NOT NULL,
            learning_rate REAL,
            batch_size INTEGER,
            total_epochs INTEGER,
            status TEXT NOT NULL DEFAULT 'created',
            started_at INTEGER,
            completed_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(user_email, run_name)
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS epoch_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            epoch INTEGER NOT NULL,
            train_loss REAL,
            train_perplexity REAL,
            eval_loss REAL,
            eval_perplexity REAL,
            best_eval_loss REAL,
            best_eval_perplexity REAL,
            learning_rate REAL,
            epoch_time_seconds REAL,
            checkpoint_path TEXT,
            created_at INTEGER NOT NULL,
            UNIQUE(run_id, epoch),
            FOREIGN KEY(run_id) REFERENCES training_runs(id) ON DELETE CASCADE
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS task_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            epoch INTEGER NOT NULL,
            task_name TEXT NOT NULL,
            train_loss REAL,
            train_perplexity REAL,
            eval_loss REAL,
            eval_perplexity REAL,
            best_eval_loss REAL,
            best_eval_perplexity REAL,
            adapter_weight REAL,
            sample_count INTEGER,
            created_at INTEGER NOT NULL,
            UNIQUE(run_id, epoch, task_name),
            FOREIGN KEY(run_id) REFERENCES training_runs(id) ON DELETE CASCADE
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS batch_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            epoch INTEGER NOT NULL,
            global_step INTEGER NOT NULL,
            batch_number INTEGER,
            task_name TEXT NOT NULL DEFAULT 'global',
            loss REAL,
            perplexity REAL,
            learning_rate REAL,
            created_at INTEGER NOT NULL,
            UNIQUE(run_id, global_step, task_name),
            FOREIGN KEY(run_id) REFERENCES training_runs(id) ON DELETE CASCADE
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS generation_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            generation_id INTEGER NOT NULL UNIQUE,
            original_prompt TEXT NOT NULL,
            intent_json TEXT,
            structure_plan_json TEXT,
            routing_json TEXT,
            critic_trace_json TEXT,
            midi_file_path TEXT,
            audio_file_path TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(generation_id) REFERENCES generations(id) ON DELETE CASCADE
        )
        """
    )
    analysis_rows = cursor.execute(
        """
        SELECT generation_id, intent_json
        FROM generation_analysis
        WHERE intent_json IS NOT NULL
        """
    ).fetchall()

    for analysis_row in analysis_rows:
        try:
            intent_data = json.loads(
                analysis_row["intent_json"]
            )
        except (
            TypeError,
            json.JSONDecodeError,
        ):
            continue

        if not isinstance(intent_data, dict):
            continue

        saved_key = intent_data.get("key")

        if not saved_key:
            nested_music_spec = intent_data.get(
                "musicSpec"
            )

            if isinstance(
                nested_music_spec,
                dict,
            ):
                saved_key = nested_music_spec.get(
                    "key"
                )

        if saved_key:
            cursor.execute(
                """
                UPDATE generations
                SET music_key = ?
                WHERE id = ?
                  AND (
                    music_key IS NULL
                    OR TRIM(music_key) = ''
                  )
                """,
                (
                    str(saved_key).strip(),
                    analysis_row[
                        "generation_id"
                    ],
                ),
            )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS coherence_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            generation_id INTEGER NOT NULL,
            section_name TEXT NOT NULL DEFAULT 'global',
            chord_adherence REAL,
            harmonic_stability REAL,
            rhythmic_regularity REAL,
            motif_similarity REAL,
            density_fidelity REAL,
            transition_quality REAL,
            emotional_alignment REAL,
            prompt_alignment REAL,
            overall_score REAL,
            created_at INTEGER NOT NULL,
            UNIQUE(generation_id, section_name),
            FOREIGN KEY(generation_id) REFERENCES generations(id) ON DELETE CASCADE
        )
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_training_runs_user_created
        ON training_runs (user_email, created_at DESC)
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_epoch_metrics_run_epoch
        ON epoch_metrics (run_id, epoch)
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_task_metrics_run_task_epoch
        ON task_metrics (run_id, task_name, epoch)
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_batch_metrics_run_step
        ON batch_metrics (run_id, global_step)
        """
    )

    connection.commit()
    connection.close()


create_tables()


class RegisterRequest(BaseModel):
    fullName: str
    email: str
    age: str
    gender: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class ForgotPasswordCodeRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    newPassword: str


class GenerateRequest(BaseModel):
    prompt: str
    mood: str
    genre: str
    tempo: str
    instrument: str
    structure: str


class TrainingRunInput(BaseModel):
    runName: str
    baseModel: str
    totalParameters: int
    trainableParameters: int
    loraRank: int
    loraAlpha: float
    learningRate: float | None = None
    batchSize: int | None = None
    totalEpochs: int | None = None
    status: str = "completed"
    startedAt: int | None = None
    completedAt: int | None = None


class EpochMetricInput(BaseModel):
    epoch: int
    trainLoss: float | None = None
    trainPerplexity: float | None = None
    evalLoss: float | None = None
    evalPerplexity: float | None = None
    bestEvalLoss: float | None = None
    bestEvalPerplexity: float | None = None
    learningRate: float | None = None
    epochTimeSeconds: float | None = None
    checkpointPath: str | None = None


class TaskMetricInput(BaseModel):
    epoch: int
    taskName: str
    trainLoss: float | None = None
    trainPerplexity: float | None = None
    evalLoss: float | None = None
    evalPerplexity: float | None = None
    bestEvalLoss: float | None = None
    bestEvalPerplexity: float | None = None
    adapterWeight: float | None = None
    sampleCount: int | None = None


class BatchMetricInput(BaseModel):
    epoch: int
    globalStep: int
    batchNumber: int | None = None
    taskName: str = "global"
    loss: float | None = None
    perplexity: float | None = None
    learningRate: float | None = None


class TrainingRunImportRequest(BaseModel):
    run: TrainingRunInput
    epochs: list[EpochMetricInput] = Field(default_factory=list)
    tasks: list[TaskMetricInput] = Field(default_factory=list)
    batches: list[BatchMetricInput] = Field(default_factory=list)


class GenerationAnalysisInput(BaseModel):
    intent: dict | list | None = None
    structurePlan: dict | list | None = None
    routing: dict | list | None = None
    criticTrace: dict | list | None = None
    midiFilePath: str | None = None
    audioFilePath: str | None = None


class CoherenceScoreInput(BaseModel):
    sectionName: str = "global"
    chordAdherence: float | None = None
    harmonicStability: float | None = None
    rhythmicRegularity: float | None = None
    motifSimilarity: float | None = None
    densityFidelity: float | None = None
    transitionQuality: float | None = None
    emotionalAlignment: float | None = None
    promptAlignment: float | None = None
    overallScore: float | None = None


class CoherenceScoresRequest(BaseModel):
    scores: list[CoherenceScoreInput] = Field(default_factory=list)


def json_dumps_or_none(value):
    if value is None:
        return None
    return json.dumps(value)


def json_loads_or_default(value, default):
    if value is None or value == "":
        return default

    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return default


def calculate_perplexity(loss: float | None):
    if loss is None:
        return None

    try:
        return float(math.exp(loss))
    except OverflowError:
        return None


def validate_non_negative(value, field_name: str):
    if value is not None and value < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} cannot be negative",
        )


def get_owned_training_run(cursor, run_id: int, user_email: str):
    run = cursor.execute(
        """
        SELECT * FROM training_runs
        WHERE id = ? AND LOWER(user_email) = ?
        """,
        (run_id, normalize_email(user_email)),
    ).fetchone()

    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training run not found")

    return run


def get_owned_generation(cursor, generation_id: int, user_email: str):
    generation = cursor.execute(
        """
        SELECT * FROM generations
        WHERE id = ? AND LOWER(user_email) = ?
        """,
        (generation_id, normalize_email(user_email)),
    ).fetchone()

    if not generation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generation not found")

    return generation


def get_training_run(cursor, run_id: int):
    run = cursor.execute(
        "SELECT * FROM training_runs WHERE id = ?",
        (run_id,),
    ).fetchone()

    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training run not found")

    return run


def get_generation_by_id(cursor, generation_id: int):
    generation = cursor.execute(
        "SELECT * FROM generations WHERE id = ?",
        (generation_id,),
    ).fetchone()

    if not generation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generation not found")

    return generation


def serialize_training_run(run, average_epoch_time=None, best_epoch=None):
    total_parameters = int(run["total_parameters"])
    trainable_parameters = int(run["trainable_parameters"])
    trainable_percentage = (
        (trainable_parameters / total_parameters) * 100
        if total_parameters > 0
        else 0
    )

    return {
        "id": run["id"],
        "runName": run["run_name"],
        "baseModel": run["base_model"],
        "totalParameters": total_parameters,
        "trainableParameters": trainable_parameters,
        "trainablePercentage": trainable_percentage,
        "loraRank": run["lora_rank"],
        "loraAlpha": run["lora_alpha"],
        "learningRate": run["learning_rate"],
        "batchSize": run["batch_size"],
        "totalEpochs": run["total_epochs"],
        "status": run["status"],
        "startedAt": run["started_at"],
        "completedAt": run["completed_at"],
        "createdAt": run["created_at"],
        "updatedAt": run["updated_at"],
        "createdBy": run["user_email"],
        "averageEpochTimeSeconds": average_epoch_time,
        "bestEpoch": best_epoch,
    }


def serialize_epoch_metric(row):
    return {
        "epoch": row["epoch"],
        "trainLoss": row["train_loss"],
        "trainPerplexity": row["train_perplexity"],
        "evalLoss": row["eval_loss"],
        "evalPerplexity": row["eval_perplexity"],
        "bestEvalLoss": row["best_eval_loss"],
        "bestEvalPerplexity": row["best_eval_perplexity"],
        "learningRate": row["learning_rate"],
        "epochTimeSeconds": row["epoch_time_seconds"],
        "checkpointPath": row["checkpoint_path"],
    }


def serialize_task_metric(row):
    return {
        "epoch": row["epoch"],
        "taskName": row["task_name"],
        "trainLoss": row["train_loss"],
        "trainPerplexity": row["train_perplexity"],
        "evalLoss": row["eval_loss"],
        "evalPerplexity": row["eval_perplexity"],
        "bestEvalLoss": row["best_eval_loss"],
        "bestEvalPerplexity": row["best_eval_perplexity"],
        "adapterWeight": row["adapter_weight"],
        "sampleCount": row["sample_count"],
    }


def serialize_batch_metric(row):
    return {
        "epoch": row["epoch"],
        "globalStep": row["global_step"],
        "batchNumber": row["batch_number"],
        "taskName": row["task_name"],
        "loss": row["loss"],
        "perplexity": row["perplexity"],
        "learningRate": row["learning_rate"],
    }


def hash_reset_code(email: str, code: str) -> str:
    value = f"{normalize_email(email)}:{code}".encode()
    return hmac.new(
        JWT_SECRET_KEY.encode(),
        value,
        hashlib.sha256,
    ).hexdigest()


def send_password_reset_email(to_email: str, code: str):
    if not SMTP_USERNAME or not SMTP_PASSWORD or not SMTP_FROM_EMAIL:
        raise RuntimeError(
            "SMTP settings are missing. Check SMTP_USERNAME, "
            "SMTP_PASSWORD, and SMTP_FROM_EMAIL in backend/.env."
        )

    message = EmailMessage()
    message["Subject"] = "Your Synestra AI password reset code"
    message["From"] = SMTP_FROM_EMAIL
    message["To"] = to_email
    message.set_content(
        f"""Hello,

Your Synestra AI password reset code is:

{code}

This code expires in {RESET_CODE_EXPIRE_MINUTES} minutes and can be used only once.

If you did not request this password reset, you can ignore this email.

Synestra AI
"""
    )

    context = ssl.create_default_context()

    with smtplib.SMTP_SSL(
        SMTP_HOST,
        SMTP_PORT,
        context=context,
        timeout=20,
    ) as smtp:
        smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
        smtp.send_message(message)


RESET_REQUEST_MESSAGE = (
    "If an account exists for that email, a reset code has been sent. "
    "Please also check the spam folder."
)


def get_auth_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if (
        credentials is None
        or credentials.scheme.lower() != "bearer"
    ):
        raise credentials_exception

    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER,
            options={
                "require": [
                    "exp",
                    "iat",
                    "sub",
                    "iss",
                    "ver",
                    "role",
                    "token_kind",
                ]
            },
        )

        email = payload.get("sub")
        token_version = payload.get("ver")
        token_role = payload.get("role")
        token_kind = payload.get("token_kind")

        if (
            not email
            or not isinstance(email, str)
            or not isinstance(token_version, int)
            or token_role not in {"user", "admin"}
            or token_kind not in {"user", "admin"}
        ):
            raise credentials_exception

    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    except InvalidTokenError:
        raise credentials_exception

    connection = connect_db()

    user = connection.execute(
        """
        SELECT *
        FROM users
        WHERE LOWER(email) = ?
        """,
        (normalize_email(email),),
    ).fetchone()

    connection.close()

    if not user:
        raise credentials_exception

    if int(user["token_version"]) != token_version:
        raise credentials_exception

    return {
        "user": user,
        "payload": payload,
    }


def get_current_user(
    auth_context=Depends(get_auth_context),
):
    return auth_context["user"]


def require_admin(
    auth_context=Depends(get_auth_context),
):
    user = auth_context["user"]
    payload = auth_context["payload"]

    database_role = str(user["role"]).strip().lower()
    token_role = str(payload.get("role", "")).strip().lower()
    token_kind = str(
        payload.get("token_kind", "")
    ).strip().lower()

    if (
        database_role != "admin"
        or token_role != "admin"
        or token_kind != "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )

    return user


@app.get("/")
def home():
    return {"message": "Synestra AI backend is running"}


@app.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(data: RegisterRequest):
    full_name = data.fullName.strip()
    email = normalize_email(data.email)
    age = data.age.strip()
    gender = data.gender.strip()
    password = data.password

    if not full_name or not email or not age or not gender or not password.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="All fields are required")

    if len(password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long",
        )

    connection = connect_db()
    cursor = connection.cursor()

    existing_user = cursor.execute(
        "SELECT * FROM users WHERE LOWER(email) = ?",
        (email,),
    ).fetchone()

    if existing_user:
        connection.close()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    cursor.execute(
        """
        INSERT INTO users (
            full_name,
            email,
            age,
            gender,
            password_hash,
            role,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, 'user', ?)
        """,
        (
            full_name,
            email,
            age,
            gender,
            hash_password(password),
            int(time.time()),
        ),
    )

    user_id = cursor.lastrowid
    connection.commit()

    user = cursor.execute(
        "SELECT * FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    connection.close()

    access_token = create_access_token(
        email=user["email"],
        token_version=int(user["token_version"]),
        role=user["role"],
        token_kind="user",
    )

    return {
        "message": "Registration successful",
        "access_token": access_token,
        "token_type": "bearer",
        "session_type": "user",
        "user": public_user(user),
    }


@app.post("/login", status_code=status.HTTP_200_OK)
def login_user(data: LoginRequest):
    email = normalize_email(data.email)
    password = data.password

    if not email or not password.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password are required",
        )

    connection = connect_db()
    cursor = connection.cursor()

    user = cursor.execute(
        "SELECT * FROM users WHERE LOWER(email) = ?",
        (email,),
    ).fetchone()

    if not user or not verify_password(password, user["password_hash"]):
        connection.close()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    # Upgrade old SHA-256 hashes to Argon2 after a successful login.
    if is_legacy_sha256_hash(user["password_hash"]):
        cursor.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(password), user["id"]),
        )
        connection.commit()

    connection.close()

    access_token = create_access_token(
        email=user["email"],
        token_version=int(user["token_version"]),
        role=user["role"],
        token_kind="user",
    )

    return {
        "message": "Login successful",
        "access_token": access_token,
        "token_type": "bearer",
        "session_type": "user",
        "user": public_user(user),
    }

@app.post("/admin/login", status_code=status.HTTP_200_OK)
def admin_login(data: LoginRequest):
    email = normalize_email(data.email)
    password = data.password

    if not email or not password.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password are required",
        )

    connection = connect_db()
    cursor = connection.cursor()

    user = cursor.execute(
        "SELECT * FROM users WHERE LOWER(email) = ?",
        (email,),
    ).fetchone()

    if not user or not verify_password(password, user["password_hash"]):
        connection.close()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if str(user["role"]).strip().lower() != "admin":
        connection.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )

    if is_legacy_sha256_hash(user["password_hash"]):
        cursor.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(password), user["id"]),
        )
        connection.commit()

    connection.close()

    access_token = create_access_token(
        email=user["email"],
        token_version=int(user["token_version"]),
        role=user["role"],
        token_kind="admin",
    )

    return {
        "message": "Admin login successful",
        "access_token": access_token,
        "token_type": "bearer",
        "session_type": "admin",
        "user": public_user(user),
    }


@app.get("/me")
def get_my_profile(current_user=Depends(get_current_user)):
    return {"user": public_user(current_user)}


@app.get("/admin/me")
def get_admin_profile(current_admin=Depends(require_admin)):
    return {"user": public_user(current_admin)}


@app.post(
    "/forgot-password/request",
    status_code=status.HTTP_200_OK,
)
def request_password_reset(data: ForgotPasswordCodeRequest):
    email = normalize_email(data.email)

    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required")

    connection = connect_db()
    cursor = connection.cursor()
    now = int(time.time())

    user = cursor.execute(
        "SELECT * FROM users WHERE LOWER(email) = ?",
        (email,),
    ).fetchone()

    # Keep the public response generic so this endpoint does not reveal
    # whether a particular email address has an account.
    if not user:
        connection.close()
        return {"message": RESET_REQUEST_MESSAGE}

    latest_request = cursor.execute(
        """
        SELECT created_at
        FROM password_reset_codes
        WHERE email = ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (email,),
    ).fetchone()

    if (
        latest_request
        and now - int(latest_request["created_at"])
        < RESET_CODE_COOLDOWN_SECONDS
    ):
        connection.close()
        return {"message": RESET_REQUEST_MESSAGE}

    cursor.execute(
        """
        UPDATE password_reset_codes
        SET used = 1
        WHERE email = ? AND used = 0
        """,
        (email,),
    )

    code = f"{secrets.randbelow(1_000_000):06d}"
    code_hash = hash_reset_code(email, code)
    expires_at = now + (RESET_CODE_EXPIRE_MINUTES * 60)

    cursor.execute(
        """
        INSERT INTO password_reset_codes (
            user_id,
            email,
            code_hash,
            expires_at,
            attempts,
            used,
            created_at
        )
        VALUES (?, ?, ?, ?, 0, 0, ?)
        """,
        (
            user["id"],
            email,
            code_hash,
            expires_at,
            now,
        ),
    )

    reset_record_id = cursor.lastrowid
    connection.commit()
    connection.close()

    try:
        if PASSWORD_RESET_DEBUG:
            print(
                f"[PASSWORD RESET DEBUG] Code for {email}: {code} "
                f"(expires in {RESET_CODE_EXPIRE_MINUTES} minutes)"
            )
        else:
            send_password_reset_email(email, code)
    except Exception as error:
        # Invalidate the code if the email could not be sent.
        failed_connection = connect_db()
        failed_connection.execute(
            "UPDATE password_reset_codes SET used = 1 WHERE id = ?",
            (reset_record_id,),
        )
        failed_connection.commit()
        failed_connection.close()

        print(f"Password reset email error for {email}: {error}")

    return {"message": RESET_REQUEST_MESSAGE}


@app.post(
    "/forgot-password/reset",
    status_code=status.HTTP_200_OK,
)
def reset_password(data: ResetPasswordRequest):
    email = normalize_email(data.email)
    code = data.code.strip()
    new_password = data.newPassword

    if not email or not code or not new_password.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email, reset code, and new password are required",
        )

    if not code.isdigit() or len(code) != 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset code must contain exactly 6 digits",
        )

    if len(new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long",
        )

    connection = connect_db()
    cursor = connection.cursor()
    now = int(time.time())

    user = cursor.execute(
        "SELECT * FROM users WHERE LOWER(email) = ?",
        (email,),
    ).fetchone()

    reset_record = cursor.execute(
        """
        SELECT *
        FROM password_reset_codes
        WHERE email = ? AND used = 0
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (email,),
    ).fetchone()

    invalid_code_error = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="The reset code is invalid or has expired",
    )

    if not user or not reset_record:
        connection.close()
        raise invalid_code_error

    if int(reset_record["expires_at"]) < now:
        cursor.execute(
            "UPDATE password_reset_codes SET used = 1 WHERE id = ?",
            (reset_record["id"],),
        )
        connection.commit()
        connection.close()
        raise invalid_code_error

    current_attempts = int(reset_record["attempts"])

    if current_attempts >= RESET_CODE_MAX_ATTEMPTS:
        cursor.execute(
            "UPDATE password_reset_codes SET used = 1 WHERE id = ?",
            (reset_record["id"],),
        )
        connection.commit()
        connection.close()
        raise invalid_code_error

    submitted_code_hash = hash_reset_code(email, code)
    code_matches = hmac.compare_digest(
        submitted_code_hash,
        reset_record["code_hash"],
    )

    if not code_matches:
        new_attempt_count = current_attempts + 1
        mark_used = 1 if new_attempt_count >= RESET_CODE_MAX_ATTEMPTS else 0

        cursor.execute(
            """
            UPDATE password_reset_codes
            SET attempts = ?, used = ?
            WHERE id = ?
            """,
            (
                new_attempt_count,
                mark_used,
                reset_record["id"],
            ),
        )

        connection.commit()
        connection.close()
        raise invalid_code_error

    cursor.execute(
        """
        UPDATE users
        SET password_hash = ?,
            token_version = token_version + 1
        WHERE id = ?
        """,
        (
            hash_password(new_password),
            user["id"],
        ),
    )

    cursor.execute(
        """
        UPDATE password_reset_codes
        SET used = 1
        WHERE email = ?
        """,
        (email,),
    )

    connection.commit()
    connection.close()

    return {
        "message": (
            "Password reset successful. All previous sessions have been "
            "invalidated. Please log in with your new password."
        )
    }


@app.post("/generate", status_code=status.HTTP_201_CREATED)
async def create_generation_request(
    data: GenerateRequest,
    response: Response,
    current_user=Depends(get_current_user),
):
    if not data.prompt.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Prompt is required")

    user_email = current_user["email"]

    connection = connect_db()
    cursor = connection.cursor()

    planner_service_url = os.getenv(
    "PLANNER_SERVICE_URL",
    "http://127.0.0.1:8001/generate-plan",
)
    planner_headers = {
        "bypass-tunnel-reminder": "true",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                planner_service_url,
                json={"prompt": data.prompt},
                headers=planner_headers,
                timeout=45.0,
            )
            response.raise_for_status()
            ai_result = response.json()

            music_spec = ai_result.get("music_spec", {})
            structured_plan = ai_result.get("structured_plan", {})
            routing = (
                ai_result.get("routing")
                or ai_result.get("lora_routing")
                or {}
            )
            critic_trace = ai_result.get("critic_trace") or []
            coherence_scores = ai_result.get("coherence_scores") or []
            generated_midi_path = (
                ai_result.get("midi_file_path")
                or ai_result.get("midi_download_url")
            )
            generated_audio_path = (
                ai_result.get("audio_file_path")
                or ai_result.get("audio_download_url")
            )
            generation_status = "completed"
            message = "AI Plan generated successfully."

    except httpx.HTTPStatusError as error:
        generation_status = "failed"
        message = (
            f"Planner service returned {error.response.status_code}: "
            f"{error.response.text[:200]}"
        )
        music_spec = {}
        structured_plan = {}
        routing = {}
        critic_trace = []
        coherence_scores = []
        generated_midi_path = None
        generated_audio_path = None
    except httpx.RequestError as error:
        generation_status = "failed"
        message = f"Planner service connection error: {str(error)}"
        music_spec = {}
        structured_plan = {}
        routing = {}
        critic_trace = []
        coherence_scores = []
        generated_midi_path = None
        generated_audio_path = None
    except Exception as error:
        generation_status = "failed"
        message = f"Planner service error: {str(error)}"
        music_spec = {}
        structured_plan = {}
        routing = {}
        critic_trace = []
        coherence_scores = []
        generated_midi_path = None
        generated_audio_path = None
    planner_mood = music_spec.get("mood")
    planner_genre = music_spec.get("genre")
    planner_tempo = music_spec.get("tempo")
    planner_instrumentation = music_spec.get(
        "instrumentation"
    )

    resolved_mood = str(
        planner_mood or data.mood
    ).strip()

    resolved_genre = str(
        planner_genre or data.genre
    ).strip()

    resolved_tempo = str(
        planner_tempo or data.tempo
    ).strip()
    planner_key = music_spec.get("key")

    resolved_key = (
        str(planner_key).strip()
        if planner_key
        else None
    )
    if isinstance(
        planner_instrumentation,
        list,
    ):
        resolved_instrument = ", ".join(
            str(instrument).strip()
            for instrument in planner_instrumentation
            if str(instrument).strip()
        )
    elif planner_instrumentation:
        resolved_instrument = str(
            planner_instrumentation
        ).strip()
    else:
        resolved_instrument = (
            data.instrument
        )

    planned_sections = []

    if isinstance(
        structured_plan,
        dict,
    ):
        possible_sections = (
            structured_plan.get("sections")
        )

        if isinstance(
            possible_sections,
            list,
        ):
            planned_sections = (
                possible_sections
            )

    section_names = []

    for section in planned_sections:
        if not isinstance(section, dict):
            continue

        section_name = str(
            section.get("name") or ""
        ).strip()

        if section_name:
            section_names.append(
                section_name
            )

    resolved_structure = (
        " â†’ ".join(section_names)
        if section_names
        else data.structure
    )
    cursor.execute(
        """
        INSERT INTO generations (
    user_email,
    prompt,
    mood,
    genre,
    tempo,
    music_key,
    instrument,
            structure,
            status,
            message,
            midi_notes,
            midi_file_path,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_email,
            data.prompt,
                        resolved_mood,
            resolved_genre,
            resolved_tempo,
            resolved_key,
            resolved_instrument,
            resolved_structure,
            generation_status,
            message,
            json.dumps(structured_plan),
            generated_midi_path,
            int(time.time()),
        ),
    )

    generation_id = cursor.lastrowid
    now = int(time.time())

    cursor.execute(
        """
        INSERT INTO generation_analysis (
            generation_id,
            original_prompt,
            intent_json,
            structure_plan_json,
            routing_json,
            critic_trace_json,
            midi_file_path,
            audio_file_path,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(generation_id) DO UPDATE SET
            original_prompt = excluded.original_prompt,
            intent_json = excluded.intent_json,
            structure_plan_json = excluded.structure_plan_json,
            routing_json = excluded.routing_json,
            critic_trace_json = excluded.critic_trace_json,
            midi_file_path = excluded.midi_file_path,
            audio_file_path = excluded.audio_file_path,
            updated_at = excluded.updated_at
        """,
        (
            generation_id,
            data.prompt,
            json_dumps_or_none(music_spec),
            json_dumps_or_none(structured_plan),
            json_dumps_or_none(routing),
            json_dumps_or_none(critic_trace),
            generated_midi_path,
            generated_audio_path,
            now,
            now,
        ),
    )

    if isinstance(coherence_scores, dict):
        coherence_scores = [
            {"sectionName": "global", **coherence_scores}
        ]

    if isinstance(coherence_scores, list):
        for score in coherence_scores:
            if not isinstance(score, dict):
                continue

            section_name = str(
                score.get("sectionName")
                or score.get("section_name")
                or "global"
            ).strip() or "global"

            cursor.execute(
                """
                INSERT INTO coherence_scores (
                    generation_id,
                    section_name,
                    chord_adherence,
                    harmonic_stability,
                    rhythmic_regularity,
                    motif_similarity,
                    density_fidelity,
                    transition_quality,
                    emotional_alignment,
                    prompt_alignment,
                    overall_score,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(generation_id, section_name) DO UPDATE SET
                    chord_adherence = excluded.chord_adherence,
                    harmonic_stability = excluded.harmonic_stability,
                    rhythmic_regularity = excluded.rhythmic_regularity,
                    motif_similarity = excluded.motif_similarity,
                    density_fidelity = excluded.density_fidelity,
                    transition_quality = excluded.transition_quality,
                    emotional_alignment = excluded.emotional_alignment,
                    prompt_alignment = excluded.prompt_alignment,
                    overall_score = excluded.overall_score,
                    created_at = excluded.created_at
                """,
                (
                    generation_id,
                    section_name,
                    score.get("chordAdherence", score.get("chord_adherence")),
                    score.get("harmonicStability", score.get("harmonic_stability")),
                    score.get("rhythmicRegularity", score.get("rhythmic_regularity")),
                    score.get("motifSimilarity", score.get("motif_similarity")),
                    score.get("densityFidelity", score.get("density_fidelity")),
                    score.get("transitionQuality", score.get("transition_quality")),
                    score.get("emotionalAlignment", score.get("emotional_alignment")),
                    score.get("promptAlignment", score.get("prompt_alignment")),
                    score.get("overallScore", score.get("overall_score")),
                    now,
                ),
            )

    connection.commit()
    connection.close()

    if generation_status == "completed":
        response.status_code = status.HTTP_201_CREATED
    else:
        response.status_code = status.HTTP_502_BAD_GATEWAY

    return {
        "message": message,
        "request": {
            "id": generation_id,
            "title": (
                data.prompt[:42] + "..."
                if len(data.prompt) > 42
                else data.prompt
            ),
            "prompt": data.prompt,
            "fullPrompt": data.prompt,
            "mood": resolved_mood,
            "genre": resolved_genre,
            "tempo": resolved_tempo,
            "key": resolved_key,
            "instrument": resolved_instrument,
            "structure": resolved_structure,
            "status": generation_status,
            "message": message,
            "musicSpec": music_spec,
            "structuredPlan": structured_plan,
            "routing": routing,
            "criticTrace": critic_trace,
            "coherenceScores": coherence_scores,
            "midiFilePath": generated_midi_path,
            "audioFilePath": generated_audio_path,
        },
    }


@app.get("/generations")
def get_generations(
    current_user=Depends(get_current_user),
):
    connection = connect_db()
    cursor = connection.cursor()

    rows = cursor.execute(
        """
        SELECT
            g.id,
            g.user_email,
            g.prompt,
            g.mood,
            g.genre,
            g.tempo,
            g.music_key,
            g.instrument,
            g.structure,
            g.status,
            g.message,
            g.midi_notes,
            COALESCE(
                ga.midi_file_path,
                g.midi_file_path
            ) AS resolved_midi_file_path,
            ga.audio_file_path AS audio_file_path,
            g.created_at
        FROM generations AS g
        LEFT JOIN generation_analysis AS ga
            ON ga.generation_id = g.id
        WHERE LOWER(g.user_email) = ?
        ORDER BY g.created_at DESC
        """,
        (
            normalize_email(
                current_user["email"]
            ),
        ),
    ).fetchall()

    connection.close()

    generations = []

    for row in rows:
        prompt = row["prompt"]
        structured_plan = {}

        if row["midi_notes"]:
            try:
                structured_plan = json.loads(
                    row["midi_notes"]
                )
            except (
                TypeError,
                json.JSONDecodeError,
            ):
                structured_plan = {}

        generations.append(
            {
                "id": row["id"],
                "title": (
                    prompt[:42] + "..."
                    if len(prompt) > 42
                    else prompt
                ),
                "prompt": prompt,
                "fullPrompt": prompt,
                "mood": row["mood"],
                "genre": row["genre"],
                "tempo": row["tempo"],
                "key": row["music_key"] if "music_key" in row.keys() else None,
                "instrument": row["instrument"],
                "structure": row["structure"],
                "status": row["status"],
                "message": row["message"],
                "structuredPlan": structured_plan,
                "midiNotes": structured_plan,
                
                "midiFilePath": row[
                    "resolved_midi_file_path"
                ],
                "audioFilePath": row[
                    "audio_file_path"
                ],
                "createdAt": row["created_at"],
            }
        )

    return {
        "generations": generations
    }



@app.delete("/generations/{generation_id}")
def delete_user_generation(
    generation_id: int,
    current_user=Depends(get_current_user),
):
    user_email = normalize_email(
        current_user["email"]
    )

    connection = connect_db()
    cursor = connection.cursor()

    generation = cursor.execute(
        """
        SELECT
            g.id,
            COALESCE(
                ga.midi_file_path,
                g.midi_file_path
            ) AS midi_file_path,
            ga.audio_file_path
                AS audio_file_path
        FROM generations AS g
        LEFT JOIN generation_analysis AS ga
            ON ga.generation_id = g.id
        WHERE g.id = ?
          AND LOWER(g.user_email) = ?
        """,
        (
            generation_id,
            user_email,
        ),
    ).fetchone()

    if generation is None:
        connection.close()

        raise HTTPException(
            status_code=
                status.HTTP_404_NOT_FOUND,
            detail="Generation not found",
        )

    midi_file_path = (
        generation["midi_file_path"]
    )

    audio_file_path = (
        generation["audio_file_path"]
    )

    cursor.execute(
        """
        DELETE FROM generations
        WHERE id = ?
          AND LOWER(user_email) = ?
        """,
        (
            generation_id,
            user_email,
        ),
    )

    connection.commit()
    connection.close()

    cleanup_results = []

    for file_path in {
        midi_file_path,
        audio_file_path,
    }:
        if not file_path:
            continue

        try:
            cleanup_results.append(
                delete_generated_file(
                    file_path
                )
            )
        except OSError as error:
            cleanup_results.append(
                {
                    "deleted": False,
                    "filename": Path(
                        urlparse(
                            str(file_path)
                        ).path
                    ).name,
                    "reason": str(error),
                }
            )

    return {
        "message": (
            "Generation deleted "
            "successfully"
        ),
        "generationId": generation_id,
        "fileCleanup": cleanup_results,
    }


@app.get("/admin/generations")
def get_admin_generations(current_admin=Depends(require_admin)):
    connection = connect_db()
    rows = connection.execute(
        """
        SELECT * FROM generations
        ORDER BY created_at DESC
        """
    ).fetchall()
    connection.close()

    generations = []

    for row in rows:
        prompt = row["prompt"]
        structured_plan = json_loads_or_default(row["midi_notes"], {})

        generations.append(
            {
                "id": row["id"],
                "userEmail": row["user_email"],
                "title": (
                    prompt[:42] + "..." if len(prompt) > 42 else prompt
                ),
                "prompt": prompt,
                "fullPrompt": prompt,
                "mood": row["mood"],
                "genre": row["genre"],
                "tempo": row["tempo"],
                "key": row["music_key"],
                "instrument": row["instrument"],
                "structure": row["structure"],
                "status": row["status"],
                "message": row["message"],
                "structuredPlan": structured_plan,
                "midiNotes": structured_plan,
                "midiFilePath": row["midi_file_path"],
                "createdAt": row["created_at"],
            }
        )

    return {"generations": generations}


@app.post(
    "/admin/research/runs/import",
    status_code=status.HTTP_201_CREATED,
)
@app.post(
    "/research/runs/import",
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def import_training_run(
    data: TrainingRunImportRequest,
    current_admin=Depends(require_admin),
):
    run = data.run
    run_name = run.runName.strip()
    base_model = run.baseModel.strip()

    if not run_name or not base_model:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Run name and base model are required",
        )

    if run.totalParameters <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Total parameters must be greater than zero",
        )

    if run.trainableParameters < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trainable parameters cannot be negative",
        )

    if run.trainableParameters > run.totalParameters:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trainable parameters cannot exceed total parameters",
        )

    if run.loraRank <= 0 or run.loraAlpha <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LoRA rank and alpha must be greater than zero",
        )

    now = int(time.time())
    email = normalize_email(current_admin["email"])
    connection = connect_db()
    cursor = connection.cursor()

    existing_run = cursor.execute(
        """
        SELECT * FROM training_runs
        WHERE LOWER(user_email) = ? AND run_name = ?
        """,
        (email, run_name),
    ).fetchone()

    if existing_run:
        run_id = int(existing_run["id"])
        cursor.execute(
            """
            UPDATE training_runs
            SET base_model = ?,
                total_parameters = ?,
                trainable_parameters = ?,
                lora_rank = ?,
                lora_alpha = ?,
                learning_rate = ?,
                batch_size = ?,
                total_epochs = ?,
                status = ?,
                started_at = ?,
                completed_at = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                base_model,
                run.totalParameters,
                run.trainableParameters,
                run.loraRank,
                run.loraAlpha,
                run.learningRate,
                run.batchSize,
                run.totalEpochs,
                run.status.strip() or "completed",
                run.startedAt,
                run.completedAt,
                now,
                run_id,
            ),
        )
    else:
        cursor.execute(
            """
            INSERT INTO training_runs (
                user_email,
                run_name,
                base_model,
                total_parameters,
                trainable_parameters,
                lora_rank,
                lora_alpha,
                learning_rate,
                batch_size,
                total_epochs,
                status,
                started_at,
                completed_at,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                email,
                run_name,
                base_model,
                run.totalParameters,
                run.trainableParameters,
                run.loraRank,
                run.loraAlpha,
                run.learningRate,
                run.batchSize,
                run.totalEpochs,
                run.status.strip() or "completed",
                run.startedAt,
                run.completedAt,
                now,
                now,
            ),
        )
        run_id = int(cursor.lastrowid)

    for metric in data.epochs:
        if metric.epoch <= 0:
            connection.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Epoch numbers must be greater than zero",
            )

        train_perplexity = metric.trainPerplexity
        eval_perplexity = metric.evalPerplexity
        best_eval_perplexity = metric.bestEvalPerplexity

        if train_perplexity is None:
            train_perplexity = calculate_perplexity(metric.trainLoss)
        if eval_perplexity is None:
            eval_perplexity = calculate_perplexity(metric.evalLoss)
        if best_eval_perplexity is None:
            best_eval_perplexity = calculate_perplexity(metric.bestEvalLoss)

        for value, field_name in [
            (metric.trainLoss, "Train loss"),
            (train_perplexity, "Train perplexity"),
            (metric.evalLoss, "Eval loss"),
            (eval_perplexity, "Eval perplexity"),
            (metric.bestEvalLoss, "Best eval loss"),
            (best_eval_perplexity, "Best eval perplexity"),
            (metric.epochTimeSeconds, "Epoch time"),
        ]:
            validate_non_negative(value, field_name)

        cursor.execute(
            """
            INSERT INTO epoch_metrics (
                run_id,
                epoch,
                train_loss,
                train_perplexity,
                eval_loss,
                eval_perplexity,
                best_eval_loss,
                best_eval_perplexity,
                learning_rate,
                epoch_time_seconds,
                checkpoint_path,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id, epoch) DO UPDATE SET
                train_loss = excluded.train_loss,
                train_perplexity = excluded.train_perplexity,
                eval_loss = excluded.eval_loss,
                eval_perplexity = excluded.eval_perplexity,
                best_eval_loss = excluded.best_eval_loss,
                best_eval_perplexity = excluded.best_eval_perplexity,
                learning_rate = excluded.learning_rate,
                epoch_time_seconds = excluded.epoch_time_seconds,
                checkpoint_path = excluded.checkpoint_path,
                created_at = excluded.created_at
            """,
            (
                run_id,
                metric.epoch,
                metric.trainLoss,
                train_perplexity,
                metric.evalLoss,
                eval_perplexity,
                metric.bestEvalLoss,
                best_eval_perplexity,
                metric.learningRate,
                metric.epochTimeSeconds,
                metric.checkpointPath,
                now,
            ),
        )

    for metric in data.tasks:
        task_name = metric.taskName.strip()
        if not task_name:
            connection.close()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task name is required")

        if metric.epoch <= 0:
            connection.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Task metric epoch must be greater than zero",
            )

        train_perplexity = metric.trainPerplexity
        eval_perplexity = metric.evalPerplexity
        best_eval_perplexity = metric.bestEvalPerplexity

        if train_perplexity is None:
            train_perplexity = calculate_perplexity(metric.trainLoss)
        if eval_perplexity is None:
            eval_perplexity = calculate_perplexity(metric.evalLoss)
        if best_eval_perplexity is None:
            best_eval_perplexity = calculate_perplexity(metric.bestEvalLoss)

        cursor.execute(
            """
            INSERT INTO task_metrics (
                run_id,
                epoch,
                task_name,
                train_loss,
                train_perplexity,
                eval_loss,
                eval_perplexity,
                best_eval_loss,
                best_eval_perplexity,
                adapter_weight,
                sample_count,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id, epoch, task_name) DO UPDATE SET
                train_loss = excluded.train_loss,
                train_perplexity = excluded.train_perplexity,
                eval_loss = excluded.eval_loss,
                eval_perplexity = excluded.eval_perplexity,
                best_eval_loss = excluded.best_eval_loss,
                best_eval_perplexity = excluded.best_eval_perplexity,
                adapter_weight = excluded.adapter_weight,
                sample_count = excluded.sample_count,
                created_at = excluded.created_at
            """,
            (
                run_id,
                metric.epoch,
                task_name,
                metric.trainLoss,
                train_perplexity,
                metric.evalLoss,
                eval_perplexity,
                metric.bestEvalLoss,
                best_eval_perplexity,
                metric.adapterWeight,
                metric.sampleCount,
                now,
            ),
        )

    for metric in data.batches:
        task_name = metric.taskName.strip() or "global"
        if metric.epoch <= 0 or metric.globalStep < 0:
            connection.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Batch epoch must be positive and global step cannot be negative",
            )

        perplexity = metric.perplexity
        if perplexity is None:
            perplexity = calculate_perplexity(metric.loss)

        cursor.execute(
            """
            INSERT INTO batch_metrics (
                run_id,
                epoch,
                global_step,
                batch_number,
                task_name,
                loss,
                perplexity,
                learning_rate,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id, global_step, task_name) DO UPDATE SET
                epoch = excluded.epoch,
                batch_number = excluded.batch_number,
                loss = excluded.loss,
                perplexity = excluded.perplexity,
                learning_rate = excluded.learning_rate,
                created_at = excluded.created_at
            """,
            (
                run_id,
                metric.epoch,
                metric.globalStep,
                metric.batchNumber,
                task_name,
                metric.loss,
                perplexity,
                metric.learningRate,
                now,
            ),
        )

    connection.commit()
    connection.close()

    return {
        "message": "Training run imported successfully",
        "runId": run_id,
        "saved": {
            "epochs": len(data.epochs),
            "tasks": len(data.tasks),
            "batches": len(data.batches),
        },
    }


@app.get("/admin/research/runs")
@app.get("/research/runs", include_in_schema=False)
def list_training_runs(current_admin=Depends(require_admin)):
    connection = connect_db()
    cursor = connection.cursor()
    rows = cursor.execute(
        """
        SELECT tr.*,
               AVG(em.epoch_time_seconds) AS average_epoch_time,
               COUNT(DISTINCT em.epoch) AS saved_epochs
        FROM training_runs tr
        LEFT JOIN epoch_metrics em ON em.run_id = tr.id
        GROUP BY tr.id
        ORDER BY tr.created_at DESC
        """
    ).fetchall()
    connection.close()

    runs = []
    for row in rows:
        item = serialize_training_run(
            row,
            average_epoch_time=row["average_epoch_time"],
        )
        item["savedEpochs"] = row["saved_epochs"]
        runs.append(item)

    return {"runs": runs}


@app.get("/admin/research/dashboard")
@app.get("/research/dashboard", include_in_schema=False)
def get_research_dashboard(
    run_id: int | None = None,
    batch_limit: int = 5000,
    current_admin=Depends(require_admin),
):
    if batch_limit < 1 or batch_limit > 50000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="batch_limit must be between 1 and 50000",
        )

    connection = connect_db()
    cursor = connection.cursor()

    if run_id is None:
        run = cursor.execute(
            """
            SELECT * FROM training_runs
            ORDER BY created_at DESC
            LIMIT 1
            """
        ).fetchone()
    else:
        run = get_training_run(cursor, run_id)

    if not run:
        connection.close()
        return {
            "run": None,
            "summary": None,
            "epochs": [],
            "tasks": [],
            "taskSeries": {},
            "batches": [],
        }

    run_id = int(run["id"])
    epoch_rows = cursor.execute(
        """
        SELECT * FROM epoch_metrics
        WHERE run_id = ?
        ORDER BY epoch ASC
        """,
        (run_id,),
    ).fetchall()

    task_rows = cursor.execute(
        """
        SELECT * FROM task_metrics
        WHERE run_id = ?
        ORDER BY task_name ASC, epoch ASC
        """,
        (run_id,),
    ).fetchall()

    batch_rows = cursor.execute(
        """
        SELECT * FROM batch_metrics
        WHERE run_id = ?
        ORDER BY global_step ASC
        LIMIT ?
        """,
        (run_id, batch_limit),
    ).fetchall()

    average_epoch_row = cursor.execute(
        """
        SELECT AVG(epoch_time_seconds) AS average_epoch_time
        FROM epoch_metrics
        WHERE run_id = ? AND epoch_time_seconds IS NOT NULL
        """,
        (run_id,),
    ).fetchone()

    best_epoch_row = cursor.execute(
        """
        SELECT epoch, eval_loss, eval_perplexity
        FROM epoch_metrics
        WHERE run_id = ? AND eval_loss IS NOT NULL
        ORDER BY eval_loss ASC, epoch ASC
        LIMIT 1
        """,
        (run_id,),
    ).fetchone()

    latest_epoch = epoch_rows[-1] if epoch_rows else None
    best_epoch = int(best_epoch_row["epoch"]) if best_epoch_row else None
    average_epoch_time = (
        average_epoch_row["average_epoch_time"]
        if average_epoch_row
        else None
    )

    task_series = {}
    for row in task_rows:
        task_series.setdefault(row["task_name"], []).append(
            serialize_task_metric(row)
        )

    latest_task_summaries = []
    for task_name, series in task_series.items():
        latest = dict(series[-1])
        valid_best = [
            item for item in series if item["evalLoss"] is not None
        ]
        best = min(valid_best, key=lambda item: item["evalLoss"]) if valid_best else None
        latest["bestEvalLoss"] = best["evalLoss"] if best else latest["bestEvalLoss"]
        latest["bestEvalPerplexity"] = (
            best["evalPerplexity"] if best else latest["bestEvalPerplexity"]
        )
        latest["bestEpoch"] = best["epoch"] if best else None
        latest_task_summaries.append(latest)

    summary = {
        "latestEpoch": latest_epoch["epoch"] if latest_epoch else None,
        "trainLoss": latest_epoch["train_loss"] if latest_epoch else None,
        "trainPerplexity": latest_epoch["train_perplexity"] if latest_epoch else None,
        "evalLoss": latest_epoch["eval_loss"] if latest_epoch else None,
        "evalPerplexity": latest_epoch["eval_perplexity"] if latest_epoch else None,
        "bestEvalLoss": best_epoch_row["eval_loss"] if best_epoch_row else None,
        "bestEvalPerplexity": (
            best_epoch_row["eval_perplexity"] if best_epoch_row else None
        ),
        "bestEpoch": best_epoch,
        "averageEpochTimeSeconds": average_epoch_time,
    }

    response_run = serialize_training_run(
        run,
        average_epoch_time=average_epoch_time,
        best_epoch=best_epoch,
    )

    connection.close()

    return {
        "run": response_run,
        "summary": summary,
        "epochs": [serialize_epoch_metric(row) for row in epoch_rows],
        "tasks": latest_task_summaries,
        "taskSeries": task_series,
        "batches": [serialize_batch_metric(row) for row in batch_rows],
    }


@app.delete("/admin/research/runs/{run_id}")
@app.delete("/research/runs/{run_id}", include_in_schema=False)
def delete_training_run(
    run_id: int,
    current_admin=Depends(require_admin),
):
    connection = connect_db()
    cursor = connection.cursor()
    get_training_run(cursor, run_id)

    cursor.execute("DELETE FROM batch_metrics WHERE run_id = ?", (run_id,))
    cursor.execute("DELETE FROM task_metrics WHERE run_id = ?", (run_id,))
    cursor.execute("DELETE FROM epoch_metrics WHERE run_id = ?", (run_id,))
    cursor.execute("DELETE FROM training_runs WHERE id = ?", (run_id,))
    connection.commit()
    connection.close()

    return {"message": "Training run deleted successfully"}


@app.put("/admin/generations/{generation_id}/analysis")
@app.put(
    "/generations/{generation_id}/analysis",
    include_in_schema=False,
)
def save_generation_analysis(
    generation_id: int,
    data: GenerationAnalysisInput,
    current_admin=Depends(require_admin),
):
    connection = connect_db()
    cursor = connection.cursor()
    generation = get_generation_by_id(cursor, generation_id)
    now = int(time.time())

    cursor.execute(
        """
        INSERT INTO generation_analysis (
            generation_id,
            original_prompt,
            intent_json,
            structure_plan_json,
            routing_json,
            critic_trace_json,
            midi_file_path,
            audio_file_path,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(generation_id) DO UPDATE SET
            original_prompt = excluded.original_prompt,
            intent_json = excluded.intent_json,
            structure_plan_json = excluded.structure_plan_json,
            routing_json = excluded.routing_json,
            critic_trace_json = excluded.critic_trace_json,
            midi_file_path = excluded.midi_file_path,
            audio_file_path = excluded.audio_file_path,
            updated_at = excluded.updated_at
        """,
        (
            generation_id,
            generation["prompt"],
            json_dumps_or_none(data.intent),
            json_dumps_or_none(data.structurePlan),
            json_dumps_or_none(data.routing),
            json_dumps_or_none(data.criticTrace),
            data.midiFilePath,
            data.audioFilePath,
            now,
            now,
        ),
    )

    if data.midiFilePath is not None:
        cursor.execute(
            "UPDATE generations SET midi_file_path = ? WHERE id = ?",
            (data.midiFilePath, generation_id),
        )

    connection.commit()
    connection.close()

    return {"message": "Generation analysis saved successfully"}


@app.get("/admin/generations/{generation_id}/analysis")
@app.get(
    "/generations/{generation_id}/analysis",
    include_in_schema=False,
)
def get_generation_analysis(
    generation_id: int,
    current_admin=Depends(require_admin),
):
    connection = connect_db()
    cursor = connection.cursor()
    generation = get_generation_by_id(cursor, generation_id)

    analysis = cursor.execute(
        "SELECT * FROM generation_analysis WHERE generation_id = ?",
        (generation_id,),
    ).fetchone()

    score_rows = cursor.execute(
        """
        SELECT * FROM coherence_scores
        WHERE generation_id = ?
        ORDER BY CASE WHEN section_name = 'global' THEN 0 ELSE 1 END,
                 section_name ASC
        """,
        (generation_id,),
    ).fetchall()
    connection.close()

    scores = [
        {
            "sectionName": row["section_name"],
            "chordAdherence": row["chord_adherence"],
            "harmonicStability": row["harmonic_stability"],
            "rhythmicRegularity": row["rhythmic_regularity"],
            "motifSimilarity": row["motif_similarity"],
            "densityFidelity": row["density_fidelity"],
            "transitionQuality": row["transition_quality"],
            "emotionalAlignment": row["emotional_alignment"],
            "promptAlignment": row["prompt_alignment"],
            "overallScore": row["overall_score"],
        }
        for row in score_rows
    ]

    if not analysis:
        return {
            "generationId": generation_id,
            "originalPrompt": generation["prompt"],
            "intent": {},
            "structurePlan": {},
            "routing": {},
            "criticTrace": [],
            "midiFilePath": generation["midi_file_path"],
            "audioFilePath": None,
            "coherenceScores": scores,
        }

    return {
        "generationId": generation_id,
        "originalPrompt": analysis["original_prompt"],
        "intent": json_loads_or_default(analysis["intent_json"], {}),
        "structurePlan": json_loads_or_default(
            analysis["structure_plan_json"],
            {},
        ),
        "routing": json_loads_or_default(analysis["routing_json"], {}),
        "criticTrace": json_loads_or_default(
            analysis["critic_trace_json"],
            [],
        ),
        "midiFilePath": analysis["midi_file_path"],
        "audioFilePath": analysis["audio_file_path"],
        "coherenceScores": scores,
    }


@app.put("/admin/generations/{generation_id}/coherence")
@app.put(
    "/generations/{generation_id}/coherence",
    include_in_schema=False,
)
def save_coherence_scores(
    generation_id: int,
    data: CoherenceScoresRequest,
    current_admin=Depends(require_admin),
):
    connection = connect_db()
    cursor = connection.cursor()
    get_generation_by_id(cursor, generation_id)
    now = int(time.time())

    for score in data.scores:
        section_name = score.sectionName.strip() or "global"

        for value, field_name in [
            (score.chordAdherence, "Chord adherence"),
            (score.harmonicStability, "Harmonic stability"),
            (score.rhythmicRegularity, "Rhythmic regularity"),
            (score.motifSimilarity, "Motif similarity"),
            (score.densityFidelity, "Density fidelity"),
            (score.transitionQuality, "Transition quality"),
            (score.emotionalAlignment, "Emotional alignment"),
            (score.promptAlignment, "Prompt alignment"),
            (score.overallScore, "Overall score"),
        ]:
            if value is not None and not 0 <= value <= 1:
                connection.close()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{field_name} must be between 0 and 1",
                )

        cursor.execute(
            """
            INSERT INTO coherence_scores (
                generation_id,
                section_name,
                chord_adherence,
                harmonic_stability,
                rhythmic_regularity,
                motif_similarity,
                density_fidelity,
                transition_quality,
                emotional_alignment,
                prompt_alignment,
                overall_score,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(generation_id, section_name) DO UPDATE SET
                chord_adherence = excluded.chord_adherence,
                harmonic_stability = excluded.harmonic_stability,
                rhythmic_regularity = excluded.rhythmic_regularity,
                motif_similarity = excluded.motif_similarity,
                density_fidelity = excluded.density_fidelity,
                transition_quality = excluded.transition_quality,
                emotional_alignment = excluded.emotional_alignment,
                prompt_alignment = excluded.prompt_alignment,
                overall_score = excluded.overall_score,
                created_at = excluded.created_at
            """,
            (
                generation_id,
                section_name,
                score.chordAdherence,
                score.harmonicStability,
                score.rhythmicRegularity,
                score.motifSimilarity,
                score.densityFidelity,
                score.transitionQuality,
                score.emotionalAlignment,
                score.promptAlignment,
                score.overallScore,
                now,
            ),
        )

    connection.commit()
    connection.close()

    return {
        "message": "Coherence scores saved successfully",
        "saved": len(data.scores),
    }
