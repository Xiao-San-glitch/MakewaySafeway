from fastapi import APIRouter
from ...db import connect
from ...schemas import ContactRequest
router=APIRouter(prefix="/contacts",tags=["trusted contacts"])
@router.post("")
def add(b:ContactRequest):
    c=connect(); cur=c.execute("INSERT INTO contacts(name,phone,consent) VALUES(?,?,?)",(b.name,b.phone,int(b.consent))); c.commit()
    r=c.execute("SELECT id,name,phone,consent FROM contacts WHERE id=?",(cur.lastrowid,)).fetchone(); c.close(); return dict(r)
@router.get("")
def listing():
    c=connect(); rows=c.execute("SELECT id,name,phone,consent FROM contacts").fetchall(); c.close(); return {"items":[dict(x) for x in rows]}
