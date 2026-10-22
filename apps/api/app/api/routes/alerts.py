from fastapi import APIRouter, HTTPException
from ...core.config import settings
from ...db import connect
from ...schemas import SmsRequest
router=APIRouter(prefix="/alerts",tags=["alerts"])
def send(to,msg):
    if not all([settings.twilio_account_sid,settings.twilio_auth_token,settings.twilio_from_number]):
        raise HTTPException(503,"Twilio not configured; set credentials in apps/api/.env.")
    try:
        from twilio.rest import Client
        m=Client(settings.twilio_account_sid,settings.twilio_auth_token).messages.create(body=msg,from_=settings.twilio_from_number,to=to)
        return {"provider":"Twilio","message_sid":m.sid,"status":m.status,"delivery_note":"Provider acceptance does not guarantee delivery."}
    except HTTPException: raise
    except Exception as e: raise HTTPException(502,f"SMS provider error: {type(e).__name__}")
def get_contact(cid):
    c=connect(); r=c.execute("SELECT * FROM contacts WHERE id=?",(cid,)).fetchone(); c.close()
    if not r: raise HTTPException(404,"Contact not found")
    if not r["consent"]: raise HTTPException(403,"Contact consent is required")
    return r
@router.post("/sms")
def sms(b:SmsRequest):
    c=get_contact(b.contact_id); return send(c["phone"],b.message)
@router.post("/sos")
def sos(b:SmsRequest):
    c=get_contact(b.contact_id)
    return {"notice":"SMS only; this does not call emergency services.","result":send(c["phone"],"SOS alert from MakewaySafeway: "+b.message)}
