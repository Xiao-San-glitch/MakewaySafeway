import os
import re
import json
import hashlib
import hmac
import base64
import secrets
import time
import threading

from services.hazard_engine import assess_route_risk
from services.weather_service import get_weather
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr



# ============================================================
# CONFIGURATION
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

USERS_FILE = DATA_DIR / "users.txt"
HAZARDS_FILE = DATA_DIR / "hazards.txt"

DATA_DIR.mkdir(parents=True, exist_ok=True)

load_dotenv(BASE_DIR / ".env")

TOKEN_SECRET = os.getenv(
    "TOKEN_SECRET",
    "development-only-change-this-secret",
)

if TOKEN_SECRET == "development-only-change-this-secret":
    print("WARNING: Set a unique TOKEN_SECRET in backend/.env")

file_lock = threading.RLock()

app = FastAPI(title="MakeWaySafeWay API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# ============================================================
# TEXT FILE STORAGE
# ============================================================

def now():
    return datetime.now(timezone.utc).isoformat()


def initialize_file(path: Path):
    if not path.exists():
        path.write_text("[]\n", encoding="utf-8")


def read_records(path: Path):
    initialize_file(path)

    try:
        content = path.read_text(encoding="utf-8").strip()

        if not content:
            return []

        records = json.loads(content)

        if not isinstance(records, list):
            raise ValueError("Expected a JSON list.")

        return records

    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Storage file is invalid: {path.name}. "
                   "Check its contents before continuing.",
        ) from exc


def write_records(path: Path, records):
    temporary_path = path.with_suffix(path.suffix + ".tmp")

    with temporary_path.open("w", encoding="utf-8") as file:
        json.dump(records, file, ensure_ascii=False, indent=2)
        file.write("\n")
        file.flush()
        os.fsync(file.fileno())

    os.replace(temporary_path, path)


initialize_file(USERS_FILE)
initialize_file(HAZARDS_FILE)


# ============================================================
# PASSWORD HASHING
# ============================================================

def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)

    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        310000,
    ).hex()

    return f"{salt}${digest}"


def verify_password(password, stored_hash):
    try:
        salt, expected_digest = stored_hash.split("$", 1)

        actual_digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt),
            310000,
        ).hex()

        return hmac.compare_digest(
            actual_digest,
            expected_digest,
        )

    except (ValueError, TypeError):
        return False


# ============================================================
# AUTHENTICATION TOKENS
# ============================================================

def make_token(user_id):
    payload_data = {
        "sub": user_id,
        "exp": int(time.time()) + 60 * 60 * 24 * 7,
    }

    payload = (
        base64.urlsafe_b64encode(
            json.dumps(payload_data).encode("utf-8")
        )
        .decode("utf-8")
        .rstrip("=")
    )

    signature = hmac.new(
        TOKEN_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    encoded_signature = (
        base64.urlsafe_b64encode(signature)
        .decode("utf-8")
        .rstrip("=")
    )

    return payload + "." + encoded_signature


def current_user(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Please log in to use this feature.",
        )

    try:
        payload, signature = authorization[7:].split(".", 1)

        expected_signature = (
            base64.urlsafe_b64encode(
                hmac.new(
                    TOKEN_SECRET.encode("utf-8"),
                    payload.encode("utf-8"),
                    hashlib.sha256,
                ).digest()
            )
            .decode("utf-8")
            .rstrip("=")
        )

        if not hmac.compare_digest(signature, expected_signature):
            raise ValueError("Invalid token signature")

        decoded_payload = base64.urlsafe_b64decode(
            payload + "=" * (-len(payload) % 4)
        )

        token_data = json.loads(decoded_payload)

        if token_data["exp"] < time.time():
            raise ValueError("Token expired")

        with file_lock:
            users = read_records(USERS_FILE)

        user = next(
            (
                item for item in users
                if item["id"] == token_data["sub"]
            ),
            None,
        )

        if user is None:
            raise ValueError("User no longer exists")

        return {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
        }

    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise

        raise HTTPException(
            status_code=401,
            detail="Session expired or invalid. Please log in again.",
        ) from exc


# ============================================================
# REQUEST MODELS
# ============================================================

class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class Report(BaseModel):
    type: str = Field(min_length=2, max_length=40)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    note: str = Field(default="", max_length=500)


class RiskRequest(BaseModel):
    distance_m: float = Field(ge=0)
    duration_s: float = Field(ge=0)
    hazards: list[dict] = Field(default_factory=list)
    weather: Optional[dict] = None
    route_coordinates: list[list[float]] = Field(default_factory=list)


class SOSContactRequest(BaseModel):
    phone: str = Field(min_length=8, max_length=16)


class SOSRequest(BaseModel):
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)


# ============================================================
# HEALTH
# ============================================================

@app.get("/api/health")
def health():
    return {"status": "ok"}
@app.get("/api/weather")
async def weather(latitude: float, longitude: float):
    if not (-90 <= latitude <= 90):
        raise HTTPException(
            status_code=400,
            detail="Latitude must be between -90 and 90.",
        )

    if not (-180 <= longitude <= 180):
        raise HTTPException(
            status_code=400,
            detail="Longitude must be between -180 and 180.",
        )

    try:
        return await get_weather(latitude, longitude)
    except Exception as exc:
        print(f"Weather API error: {exc}")
        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve weather data. Please try again.",
        ) from exc

# ============================================================
# REGISTER
# ============================================================

@app.post("/api/auth/register")
def register(request: RegisterRequest):
    name = request.name.strip()
    email = str(request.email).strip().lower()

    if len(name) < 2:
        raise HTTPException(
            status_code=400,
            detail="Name must contain at least two characters.",
        )

    with file_lock:
        users = read_records(USERS_FILE)

        if any(user["email"].lower() == email for user in users):
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists.",
            )

        user_id = max(
            (user.get("id", 0) for user in users),
            default=0,
        ) + 1

        user = {
            "id": user_id,
            "name": name,
            "email": email,
            "password_hash": password_hash(request.password),
            "created_at": now(),
        }

        users.append(user)
        write_records(USERS_FILE, users)

    public_user = {
        "id": user_id,
        "name": name,
        "email": email,
    }

    return {
        "token": make_token(user_id),
        "user": public_user,
    }


# ============================================================
# LOGIN
# ============================================================

@app.post("/api/auth/login")
def login(request: LoginRequest):
    email = str(request.email).strip().lower()

    with file_lock:
        users = read_records(USERS_FILE)

        user = next(
            (
                item for item in users
                if item["email"].lower() == email
            ),
            None,
        )

    if user is None or not verify_password(
        request.password,
        user["password_hash"],
    ):
        raise HTTPException(
            status_code=401,
            detail="Email or password is incorrect.",
        )

    return {
        "token": make_token(user["id"]),
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
        },
    }


# ============================================================
# CURRENT USER
# ============================================================

@app.get("/api/auth/me")
def me(authorization: str = Header(default="")):
    return {"user": current_user(authorization)}


# ============================================================
# HAZARD REPORTS
# ============================================================

@app.get("/api/hazards")
def hazards():
    with file_lock:
        records = read_records(HAZARDS_FILE)

    active_records = [
        item for item in records
        if item.get("status") != "resolved"
    ]

    active_records.sort(
        key=lambda item: item.get("reported_at", ""),
        reverse=True,
    )

    return {"hazards": active_records[:500]}


@app.post("/api/reports")
def report(
    request: Report,
    authorization: str = Header(default=""),
):
    current_user(authorization)

    allowed_types = {
        "waterlogging",
        "flood",
        "road_closure",
        "crash",
        "obstacle",
        "poor_lighting",
        "other",
    }

    if request.type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Unsupported hazard type.",
        )

    with file_lock:
        records = read_records(HAZARDS_FILE)

        hazard_id = max(
            (item.get("id", 0) for item in records),
            default=0,
        ) + 1

        hazard = {
            "id": hazard_id,
            "type": request.type,
            "latitude": request.latitude,
            "longitude": request.longitude,
            "note": request.note.strip(),
            "source_type": "community_unverified",
            "status": "unverified",
            "reported_at": now(),
        }

        records.append(hazard)
        write_records(HAZARDS_FILE, records)

    return {
        "id": hazard_id,
        "status": "unverified",
        "message": "Report saved for review.",
    }


# ============================================================
# ROUTE RISK ESTIMATE
# ============================================================

@app.post("/api/route-risk")
async def route_risk(request: RiskRequest):
    weather = request.weather

    # Fetch live weather if the frontend did not provide it.
    if weather is None and request.route_coordinates:
        try:
            latitude, longitude = request.route_coordinates[0]
            weather = await get_weather(latitude, longitude)
        except Exception as exc:
            print(f"Route weather unavailable: {exc}")
            weather = None

    result = assess_route_risk(
        hazards=request.hazards,
        weather=weather,
        route_coordinates=request.route_coordinates,
    )

    result["route"] = {
        "distance_m": request.distance_m,
        "duration_s": request.duration_s,
    }

    result["weather"] = weather
    return result

# ============================================================
# SOS CONTACT / TWILIO
# ============================================================

def normalize_sos_phone(phone: str) -> str:
    phone = phone.strip()
    # Require international format, e.g. +919876543210.
    if not re.fullmatch(r"\+[1-9][0-9]{7,14}", phone):
        raise HTTPException(
            status_code=400,
            detail="Enter a valid international phone number, e.g. +919876543210.",
        )
    return phone


@app.get("/api/sos/contact")
def get_sos_contact(authorization: str = Header(default="")):
    account = current_user(authorization)

    with file_lock:
        users = read_records(USERS_FILE)
        user = next(
            (item for item in users if item.get("id") == account["id"]),
            None,
        )

    if user is None:
        raise HTTPException(status_code=401, detail="Please log in again.")

    return {"phone": user.get("sos_contact", "")}


@app.put("/api/sos/contact")
def save_sos_contact(
    request: SOSContactRequest,
    authorization: str = Header(default=""),
):
    account = current_user(authorization)
    phone = normalize_sos_phone(request.phone)

    with file_lock:
        users = read_records(USERS_FILE)
        user = next(
            (item for item in users if item.get("id") == account["id"]),
            None,
        )

        if user is None:
            raise HTTPException(status_code=401, detail="Please log in again.")

        user["sos_contact"] = phone
        write_records(USERS_FILE, users)

    return {"phone": phone, "message": "Emergency contact saved."}


@app.post("/api/sos")
def sos(
    request: SOSRequest,
    authorization: str = Header(default=""),
):
    account = current_user(authorization)

    with file_lock:
        users = read_records(USERS_FILE)
        user = next(
            (item for item in users if item.get("id") == account["id"]),
            None,
        )

    if user is None:
        raise HTTPException(status_code=401, detail="Please log in again.")

    contact = user.get("sos_contact", "").strip()
    if not contact:
        raise HTTPException(
            status_code=400,
            detail="Save an emergency contact before sending SOS.",
        )

    if request.latitude is not None and request.longitude is not None:
        location_url = (
            "https://maps.google.com/?q="
            f"{request.latitude},{request.longitude}"
        )
    else:
        location_url = "Location unavailable"

    message_body = (
        "SOS: I may need help. "
        f"Last location: {location_url}. "
        f"Time: {now()}. Please contact me."
    )

    # Safe by default: no provider call and no SMS in development mode.
    if os.getenv("ENABLE_REAL_SMS", "false").strip().lower() != "true":
        return {
            "status": "test_mode_not_sent",
            "message": (
                "Test mode: SOS message prepared for your saved contact, "
                "but NO SMS was sent."
            ),
            "recipient": contact,
            "message_preview": message_body,
        }

    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    sender_number = os.getenv("TWILIO_FROM_NUMBER", "").strip()

    if not all([account_sid, auth_token, sender_number]):
        raise HTTPException(
            status_code=503,
            detail="Twilio credentials and sender are not configured.",
        )

    try:
        from twilio.rest import Client

        client = Client(account_sid, auth_token)
        sent_message = client.messages.create(
            body=message_body,
            from_=sender_number,
            to=contact,
        )

        return {
            "status": "accepted_by_provider",
            "message": (
                "Twilio accepted the SMS request; delivery is not guaranteed."
            ),
            "message_id": sent_message.sid,
        }

    except Exception as exc:
        print(f"Twilio request failed: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=502,
            detail="SMS provider request failed. Check backend logs and Twilio configuration.",
        ) from exc
