from pydantic import BaseModel, Field
from typing import Literal
class Coordinate(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
class RouteRequest(BaseModel):
    origin: Coordinate
    destination: Coordinate
    alternatives: bool = True
class ScoreRequest(BaseModel):
    lighting_coverage: float = Field(ge=0, le=1)
    hazard_density: float = Field(ge=0)
    facility_score: float = Field(ge=0, le=1)
    road_activity: float = Field(ge=0, le=1)
    data_coverage: float = Field(ge=0, le=1)
    freshness: float = Field(ge=0, le=1)
    corroboration: float = Field(ge=0, le=1)
class HazardRequest(BaseModel):
    lat: float = Field(ge=-90, le=90); lon: float = Field(ge=-180, le=180)
    category: Literal["broken_light","road_hazard","harassment_concern","flooding","other"]
    description: str = Field(min_length=3, max_length=1000)
class ModerateRequest(BaseModel):
    status: Literal["pending","approved","rejected","resolved"]
class ContactRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=7, max_length=25)
    consent: bool = False
class SmsRequest(BaseModel):
    contact_id: int
    message: str = Field(min_length=1, max_length=1200)
