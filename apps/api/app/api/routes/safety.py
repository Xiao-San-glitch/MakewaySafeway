from fastapi import APIRouter
from ...schemas import ScoreRequest
router=APIRouter(prefix="/safety",tags=["safety"])
@router.post("/score")
def score(b: ScoreRequest):
    hp=min(b.hazard_density/10,1)
    parts={"lighting":.4*b.lighting_coverage,"hazards":.3*(1-hp),"facilities":.15*b.facility_score,"road_activity":.15*b.road_activity}
    reliability=round(100*(.5*b.data_coverage+.3*b.freshness+.2*b.corroboration))
    limits=[]
    if b.data_coverage<.6: limits.append("Low coverage; missing data is not evidence of safety.")
    if b.freshness<.5: limits.append("Some information may be stale.")
    if b.corroboration<.5: limits.append("Limited independent corroboration.")
    return {"score":round(100*sum(parts.values())),"label":"heuristic estimate","reliability":reliability,"components":parts,"limitations":limits,"disclaimer":"Not a guarantee of personal safety; heuristic weights require local validation."}
