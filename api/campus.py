import hmac,json
from pathlib import Path
from fastapi import APIRouter,Header,HTTPException
from pydantic import BaseModel,Field
from algorithm_engine.campus_workflow import CampusWorkflow
router=APIRouter(prefix='/workflow',tags=['Dated campus workflows'])
directory=Path(__file__).resolve().parents[1]/'data'/'local-publication'
class Action(BaseModel):
    actor:dict
    action:str
    payload:dict=Field(default_factory=dict)
@router.post('/action')
def execute(body:Action,x_review_key:str=Header(default='')):
    auth=directory/'review-auth.json'
    if not auth.exists() or not hmac.compare_digest(x_review_key,json.loads(auth.read_text())['secret']):
        raise HTTPException(403,'Trusted web gateway required')
    directory.mkdir(parents=True,exist_ok=True)
    try:return CampusWorkflow(str(directory/'campus_workflow.db')).execute(body.actor,body.action,body.payload)
    except (ValueError,KeyError,TypeError) as e:raise HTTPException(400,str(e))
