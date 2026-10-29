# MakeWaySafeWay — Simple Starter

A compact, beginner-friendly React + FastAPI project. The frontend has a single-tab, three-step flow (Home → Journey → Route), with back navigation and animated buttons. No fabricated demo hazards are included.

## Run
Backend terminal:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app:app --reload
```
Frontend terminal:
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```
Open the Vite URL shown in the terminal. Backend default: `http://127.0.0.1:8000`.

## Real services
- Map tiles: OpenStreetMap + Leaflet
- Place search: OpenStreetMap Nominatim
- Driving routes: OSRM public routing endpoint
- Current weather: Open-Meteo
- Reports: saved to a local SQLite database
- SOS SMS: Twilio, configured on the backend only
- Voice: browser speech synthesis
- Offline: basic app-shell caching only

Public map/search/routing services have usage limits and are not guaranteed for production. Offline route calculation, official flood feeds, road lighting/sidewalk scoring, authenticated moderation, and production security still need implementation. See `frontend/src/features/` for the feature-by-feature notes.

**Safety note:** risk scores are estimates, not official warnings or guarantees. Missing street data means unknown, not safe. SOS SMS requires connectivity and valid Twilio setup.

## Accounts (new)
The app now has email/password registration and login. Passwords are salted and hashed in SQLite; sessions use a signed token stored in the browser. Hazard reports and SOS endpoints require login. Configure `TOKEN_SECRET` in `backend/.env` before use beyond local development. Add HTTPS, rate limiting, email verification, password reset, and stronger production security before public launch.


## Access rules and live location
- Users must log in before they can plan a journey.
- The home screen offers an explicit **Allow live location** action each time it is shown. The browser will ask for location permission when needed.
- Without login, users can allow and view their own current location, but cannot calculate a journey, submit hazard reports, or use SOS.
- Once logged in and location is enabled, the journey starts from GPS coordinates. The route screen watches GPS updates and recentres the map as the user moves.
- The journey screen shows reported hazards only within 5 km of the current location. Community reports are unverified; no report does not mean a road is safe.
- GPS requires a secure context (normally localhost or HTTPS) and browser permission. Continuous tracking requires the route screen to remain open.
