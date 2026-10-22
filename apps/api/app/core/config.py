from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    app_name: str = "MakewaySafeway API"
    database_path: str = "app/data/makewaysafeway.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    osrm_base_url: str = "https://router.project-osrm.org"
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
settings = Settings()
