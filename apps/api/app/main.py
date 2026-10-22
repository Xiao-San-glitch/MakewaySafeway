from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .api.routes import health, routing, safety, osm, hazards, reports, contacts, alerts
app = FastAPI(title=settings.app_name, version="0.1.0", description="Prototype API; scores are not safety guarantees.")
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in settings.cors_origins.split(",")], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])
for r in [health.router,routing.router,safety.router,osm.router,hazards.router,reports.router,contacts.router,alerts.router]:
    app.include_router(r, prefix="/api")
