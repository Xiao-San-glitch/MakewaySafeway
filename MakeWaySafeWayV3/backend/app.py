import os, sqlite3, hashlib, hmac, base64, json, secrets, time, re
from datetime import datetime, timezone
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()
DB = os.getenv("DATABASE_PATH", "makewaysafeway.db")
TOKEN_SECRET = os.getenv("TOKEN_SECRET", "development-only-change-this-secret")
app = FastAPI(title="MakeWaySafeWay API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173","http://127.0.0.1:5173"], allow_methods=["GET","POST"], allow_headers=["Content-Type"])

def now(): return datetime.now(timezone.utc).isoformat()
def conn():
    c=sqlite3.connect(DB); c.row_factory=sqlite3.Row; return c
with conn() as db:
    db.execute("CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL)")
    db.execute("""CREATE TABLE IF NOT EXISTS hazards(id INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL,latitude REAL NOT NULL,longitude REAL NOT NULL,note TEXT NOT NULL DEFAULT '',source_type TEXT NOT NULL DEFAULT 'community_unverified',status TEXT NOT NULL DEFAULT 'unverified',reported_at TEXT NOT NULL)""")

class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=128)
class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=128)

def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 310000).hex()
    return f"{salt}${digest}"
def make_token(user_id):
    payload = base64.urlsafe_b64encode(json.dumps({'sub': user_id, 'exp': int(time.time()) + 60*60*24*7}).encode()).decode().rstrip('=')
    sig = hmac.new(TOKEN_SECRET.encode(), payload.encode(), hashlib.sha256).digest()
    return payload + '.' + base64.urlsafe_b64encode(sig).decode().rstrip('=')
def current_user(authorization: str = Header(default='')):
    if not authorization.startswith('Bearer '): raise HTTPException(401, 'Please log in to use this feature.')
    try:
        payload, signature = authorization[7:].split('.', 1)
        expected = base64.urlsafe_b64encode(hmac.new(TOKEN_SECRET.encode(), payload.encode(), hashlib.sha256).digest()).decode().rstrip('=')
        if not hmac.compare_digest(signature, expected): raise ValueError()
        data = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        if data['exp'] < time.time(): raise ValueError()
        with conn() as db: row = db.execute('SELECT id,name,email FROM users WHERE id=?', (data['sub'],)).fetchone()
        if not row: raise ValueError()
        return dict(row)
    except Exception: raise HTTPException(401, 'Session expired or invalid. Please log in again.')

@app.post('/api/auth/register')
def register(r: RegisterRequest):
    email = r.email.strip().lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email): raise HTTPException(400, 'Enter a valid email address.')
    try:
        with conn() as db:
            cur = db.execute('INSERT INTO users(name,email,password_hash,created_at) VALUES(?,?,?,?)', (r.name.strip(), email, password_hash(r.password), now()))
            user_id = cur.lastrowid
    except sqlite3.IntegrityError: raise HTTPException(409, 'An account with this email already exists.')
    user = {'id': user_id, 'name': r.name.strip(), 'email': email}
    return {'token': make_token(user_id), 'user': user}

@app.post('/api/auth/login')
def login(r: LoginRequest):
    email = r.email.strip().lower()
    with conn() as db: row = db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
    if not row: raise HTTPException(401, 'Email or password is incorrect.')
    try:
        salt, digest = row['password_hash'].split('$', 1)
        check = hashlib.pbkdf2_hmac('sha256', r.password.encode(), bytes.fromhex(salt), 310000).hex()
    except Exception: raise HTTPException(401, 'Email or password is incorrect.')
    if not hmac.compare_digest(check, digest): raise HTTPException(401, 'Email or password is incorrect.')
    user = {'id': row['id'], 'name': row['name'], 'email': row['email']}
    return {'token': make_token(row['id']), 'user': user}

@app.get('/api/auth/me')
def me(authorization: str = Header(default='')): return {'user': current_user(authorization)}

class Report(BaseModel):
    type: str = Field(min_length=2,max_length=40)
    latitude: float = Field(ge=-90,le=90)
    longitude: float = Field(ge=-180,le=180)
    note: str = Field(default="",max_length=500)
class RiskRequest(BaseModel):
    distance_m: float = Field(ge=0)
    duration_s: float = Field(ge=0)
    hazards: list[dict] = []
    weather: Optional[dict] = None
class SOSRequest(BaseModel):
    latitude: Optional[float] = Field(default=None,ge=-90,le=90)
    longitude: Optional[float] = Field(default=None,ge=-180,le=180)
    contacts: list[str] = []

@app.get("/api/health")
def health(): return {"status":"ok"}
@app.get("/api/hazards")
def hazards():
    with conn() as db: rows=db.execute("SELECT * FROM hazards WHERE status!='resolved' ORDER BY reported_at DESC LIMIT 500").fetchall()
    return {"hazards":[dict(r) for r in rows]}
@app.post("/api/reports")
def report(r: Report, authorization: str = Header(default='')):
    current_user(authorization)
    allowed={"waterlogging","flood","road_closure","crash","obstacle","poor_lighting","other"}
    if r.type not in allowed: raise HTTPException(400,"Unsupported hazard type.")
    with conn() as db:
        cur=db.execute("INSERT INTO hazards(type,latitude,longitude,note,source_type,status,reported_at) VALUES(?,?,?,?,?,?,?)",(r.type,r.latitude,r.longitude,r.note.strip(),"community_unverified","unverified",now()))
        ident=cur.lastrowid
    return {"id":ident,"status":"unverified","message":"Report saved for review."}
@app.post("/api/route-risk")
def route_risk(d: RiskRequest):
    active=[h for h in d.hazards if h.get("status") not in {"resolved","rejected","expired"}]
    flood={"flood","waterlogging"}
    f=min(1,sum(1 for h in active if h.get("type") in flood)/3)
    h=min(1,len(active)/5)
    try: rain=min(1,max(0,float(d.weather.get("rain_mm",0))/20)) if d.weather else 0
    except (ValueError,TypeError): rain=0
    unknown=.35
    score=round(100*min(1,.30*f+.20*h+.10*rain+.15*unknown))
    label="Lower observed signal" if score<25 else "Watch" if score<50 else "Elevated signal" if score<75 else "High signal"
    return {"score":score,"label":label,"explanation":f"Based on {len(active)} unresolved reports, current rain if available, and an uncertainty penalty. Not a validated flood forecast or official warning.","inputs":{"reports_count":len(active),"rain_mm":d.weather.get("rain_mm") if d.weather else None,"unknown_data_penalty":unknown}}
@app.post("/api/sos")
def sos(d: SOSRequest, authorization: str = Header(default='')):
    current_user(authorization)
    configured=[os.getenv("SOS_CONTACT_1","").strip(),os.getenv("SOS_CONTACT_2","").strip()]
    if not all(configured): raise HTTPException(400,"Configure SOS_CONTACT_1 and SOS_CONTACT_2 in backend/.env.")
    if len(d.contacts)!=2 or [x.strip() for x in d.contacts]!=configured: raise HTTPException(400,"Entered contacts must match server-configured contacts.")
    sid,token,sender=[os.getenv(k,"").strip() for k in ("TWILIO_ACCOUNT_SID","TWILIO_AUTH_TOKEN","TWILIO_FROM_NUMBER")]
    if os.getenv("ENABLE_REAL_SMS","false").lower()!="true": raise HTTPException(503,"SMS disabled. Enable it only after configuring and testing Twilio.")
    if not all([sid,token,sender]): raise HTTPException(503,"Twilio credentials and sender are not configured.")
    loc=f"https://maps.google.com/?q={d.latitude},{d.longitude}" if d.latitude is not None and d.longitude is not None else "Location unavailable"
    body=f"SOS: I may need help. Last location: {loc}. Time: {now()}. Please contact me."
    try:
        from twilio.rest import Client
        client=Client(sid,token)
        sent=[client.messages.create(body=body,from_=sender,to=n) for n in configured]
        return {"status":"accepted_by_provider","message":"Twilio accepted the SMS request; delivery is not guaranteed.","message_ids":[x.sid for x in sent]}
    except Exception as e:
        raise HTTPException(502,"SMS provider request failed. Check backend logs and Twilio configuration.") from e
