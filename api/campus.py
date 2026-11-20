import hmac,json,logging,os
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
def trusted_gateway(key: str, local_directory: Path = directory) -> bool:
    secret = os.environ.get('CAMPUS_GATEWAY_SECRET')
    if not secret and not os.environ.get('CAMPUS_DATABASE_URL'):
        try:
            secret = json.loads((local_directory/'review-auth.json').read_text())['secret']
        except (OSError, ValueError, KeyError, TypeError):
            return False
    return bool(secret) and hmac.compare_digest(key, secret)


@router.post('/action')
def execute(body:Action,x_review_key:str=Header(default='')):
    if not trusted_gateway(x_review_key, directory):
        raise HTTPException(403,'Trusted web gateway required')
    database_url = os.environ.get('CAMPUS_DATABASE_URL')
    if not database_url:
        directory.mkdir(parents=True, exist_ok=True)
    try:
        return CampusWorkflow(str(directory/'campus_workflow.db'), database_url=database_url).execute(body.actor,body.action,body.payload)
    except (ValueError, KeyError, TypeError) as error:
        raise HTTPException(400, str(error)) from error
    except Exception as error:
        if not database_url:
            raise
        logging.getLogger(__name__).error("Hosted workflow failed (%s)", type(error).__name__)
        raise HTTPException(503, 'Hosted workflow database unavailable') from None
