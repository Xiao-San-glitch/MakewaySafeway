from fastapi import APIRouter, Query
from ...db import connect
from ...schemas import HazardRequest
router=APIRouter(prefix="/hazards",tags=["hazards"])
@router.post("")
def create(b:HazardRequest):
    c=connect(); cur=c.execute("INSERT INTO hazards(lat,lon,category,description) VALUES(?,?,?,?)",(b.lat,b.lon,b.category,b.description)); c.commit()
    row=c.execute("SELECT * FROM hazards WHERE id=?",(cur.lastrowid,)).fetchone(); c.close(); return dict(row)
@router.get("")
def listing(status:str="approved"):
    c=connect(); rows=c.execute("SELECT * FROM hazards WHERE status=? ORDER BY created_at DESC",(status,)).fetchall(); c.close()
    return {"items":[dict(x) for x in rows],"count":len(rows)}
