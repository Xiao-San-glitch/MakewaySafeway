# Feature folders

- `map-routing/README.md` — Real map tiles, Nominatim place search and OSRM driving routes are connected in App.
- `hazards-reports/README.md` — Reports are stored in SQLite by backend/app.
- `rain-flood-risk/README.md` — Open-Meteo current weather is connected.
- `offline/README.md` — Service worker caches the app shell only.
- `voice/README.md` — Browser speech synthesis reads route instructions when supported.
- `sos-twilio/README.md` — SOS requires confirmation and backend/.
- `street-data/README.md` — OpenStreetMap is used for map display with attribution.
- `admin-audit/README.md` — Reserved for authenticated moderation, report verification, audit logs and data-freshness checks.

To keep the project beginner-friendly, the working UI is in `App.jsx` and backend endpoints are in `backend/app.py`. Move code into feature folders only when a feature grows.
