"""Read-only algorithm preview; never writes bookings or approvals."""
from typing import Literal
from fastapi import APIRouter
from pydantic import BaseModel, Field, model_validator
from algorithm_engine.review_decisions import decide_review_batch
router = APIRouter(prefix="/review", tags=["Review algorithm preview"])

class PreviewRow(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    start: float = Field(allow_inf_nan=False)
    end: float = Field(allow_inf_nan=False)
    room_id: str = Field(min_length=1, max_length=100)
    user_id: str = Field(min_length=1, max_length=100)
    faculty_ids: list[str] = Field(min_length=1, max_length=10)
    semester: Literal['1','3','5','7']
    section: Literal['A','B']
    batch: str = ''
    created_at: float = Field(default=0, allow_inf_nan=False)
    base_priority: float = Field(default=3, gt=0, le=100, allow_inf_nan=False)
    @model_validator(mode='after')
    def validate_interval(self):
        if self.end <= self.start: raise ValueError('end must follow start')
        if self.batch and self.batch not in (self.section+'1', self.section+'2'): raise ValueError('batch must match section')
        return self

class PreviewBody(BaseModel):
    bookings: list[PreviewRow] = Field(default_factory=list, max_length=2000)
    pending: list[PreviewRow] = Field(default_factory=list, max_length=100)
    now: float = Field(allow_inf_nan=False)
    aging_rate: float = Field(default=0.5, ge=0, le=10, allow_inf_nan=False)
    algorithm: Literal['dp','greedy'] = 'dp'
    @model_validator(mode='after')
    def unique_ids(self):
        ids=[r.id for r in self.bookings+self.pending]
        if len(set(ids)) != len(ids): raise ValueError('IDs must be unique')
        if any(r.created_at>self.now for r in self.pending): raise ValueError('request arrival cannot be in future')
        return self

@router.post('/decision-preview')
def decision_preview(body: PreviewBody):
    return decide_review_batch([r.model_dump() for r in body.bookings], [r.model_dump() for r in body.pending],
                               body.now,body.algorithm,body.aging_rate)
