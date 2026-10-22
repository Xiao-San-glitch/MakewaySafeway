from fastapi import APIRouter, HTTPException
from ...db import connect
from ...schemas import ModerateRequest
router=APIRouter(prefix="/reports",tags=["moderation"])
@router.post("/{report_id}/moderate")
def moderate(report_id:int,b:ModerateRequest):
    c=connect(); cur=c.execute("UPDATE hazards SET status=? WHERE id=?",(b.status,report_id)); c.commit()
    row=c.execute("SELECT * FROM hazards WHERE id=?",(report_id,)).fetchone(); c.close()
    if cur.rowcount==0: raise HTTPException(404,"Report not found")
    return dict(row)
