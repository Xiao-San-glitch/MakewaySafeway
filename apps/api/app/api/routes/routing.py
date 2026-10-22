import httpx
from fastapi import APIRouter, HTTPException
from ...core.config import settings
from ...schemas import RouteRequest
router=APIRouter(prefix="/routing",tags=["routing"])
@router.post("/compare")
async def compare(body: RouteRequest):
    coords=f"{body.origin.lon},{body.origin.lat};{body.destination.lon},{body.destination.lat}"
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r=await c.get(f"{settings.osrm_base_url.rstrip('/')}/route/v1/foot/{coords}",params={"overview":"full","geometries":"geojson","steps":"true","alternatives":str(body.alternatives).lower()})
            r.raise_for_status(); data=r.json()
        if data.get("code")!="Ok": raise HTTPException(502,"Routing provider returned no route.")
        return {"provider_notice":"Public OSRM demo endpoint; replace for production.","routes":[{"id":f"route-{i+1}","distance_m":x["distance"],"duration_s":x["duration"],"geometry":x["geometry"],"safety_score":None,"note":"Routing data alone cannot establish safety."} for i,x in enumerate(data["routes"])]}
    except HTTPException: raise
    except Exception as e: raise HTTPException(502,f"Routing provider unavailable: {type(e).__name__}")
