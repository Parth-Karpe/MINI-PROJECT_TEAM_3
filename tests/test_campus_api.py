import json
from pathlib import Path
from uuid import uuid4
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api import campus

def test_workflow_gateway_requires_secret_and_server_identity(monkeypatch):
    directory=Path.cwd()/'data'/'local-publication'/('api-test-'+uuid4().hex)
    directory.mkdir(parents=True)
    (directory/'review-auth.json').write_text(json.dumps(dict(secret='test-only-gateway-secret')))
    monkeypatch.setattr(campus,'directory',directory)
    app=FastAPI();app.include_router(campus.router)
    with TestClient(app) as client:
        body=dict(actor=dict(id='HOD',name='HOD',role='hod'),action='view',payload=dict(date='2026-11-09'))
        assert client.post('/workflow/action',json=body).status_code==403
        assert client.post('/workflow/action',json=body,headers={'X-Review-Key':'wrong'}).status_code==403
        response=client.post('/workflow/action',json=body,headers={'X-Review-Key':'test-only-gateway-secret'})
        assert response.status_code==200
        assert not response.json()['published']
