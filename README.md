# MakewaySafeway — MVP starter
**Know your route.**

This ZIP includes a React/Vite frontend, MapLibre map, responsive CSS, FastAPI backend with separate feature routers, OSRM route lookup, Overpass OSM lookup, explainable heuristic scoring, SQLite hazard/contact storage, optional Twilio SMS, and ML training scripts.

## Run
Backend:
```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```
Frontend, in another terminal:
```bash
cd apps/web
npm install
cp .env.example .env
npm run dev
```
API docs: http://127.0.0.1:8000/docs

## Important
This is a hackathon MVP starter, not a validated personal-safety service. Scores are heuristic, map data may be missing or stale, and SMS delivery is not guaranteed. SOS sends an SMS to a consented trusted contact only; it does not call emergency services. For immediate danger in India, call 112 directly. No trained model weights are included. Training scripts need valid, representative labeled data before any real-world use.
