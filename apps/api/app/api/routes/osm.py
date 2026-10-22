import httpx
from fastapi import APIRouter, HTTPException, Query
from ...core.config import settings
router=APIRouter(prefix="/osm",tags=["openstreetmap"])
@router.get("/context")
async def context(lat:float=Query(ge=-90,le=90),lon:float=Query(ge=-180,le=180),radius_m:int=Query(500,ge=50,le=2000)):
    q=f'[out:json][timeout:15];(node(around:{radius_m},{lat},{lon})[amenity~"police|hospital|clinic|pharmacy|fire_station"];way(around:{radius_m},{lat},{lon})[highway];way(around:{radius_m},{lat},{lon})[lit];);out center tags;'
    try:
        async with httpx.AsyncClient(timeout=20,headers={"User-Agent":"MakewaySafewayMVP/0.1"}) as c:
            r=await c.post(settings.overpass_url,data={"data":q}); r.raise_for_status(); data=r.json()
        return {"elements":data.get("elements",[]),"limitations":["OSM coverage varies.","Missing lighting tags do not mean unlit."]}
    except Exception as e: raise HTTPException(502,f"Overpass unavailable: {type(e).__name__}")
