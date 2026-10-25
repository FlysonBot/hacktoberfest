from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

from backend.plan import make_plan

app = FastAPI()


class PlanRequest(BaseModel):
    text: str
    image_base64: str | None = None


class CaptionsRequest(BaseModel):
    structure: str
    steps: list[dict[str, Any]]


class ExplainRequest(BaseModel):
    structure: str
    step: dict[str, Any]
    prompt: str
    user_answer: str
    correct_answer: str


# /api/plan is real; captions and explain are still echo stubs.
@app.post('/api/plan')
def plan(req: PlanRequest):
    return make_plan(req.text, req.image_base64)


@app.post('/api/captions')
def captions(req: CaptionsRequest):
    print('CAPTIONS in:', req.structure, len(req.steps), 'steps', flush=True)
    return {'received_steps': len(req.steps)}


@app.post('/api/explain')
def explain(req: ExplainRequest):
    print('EXPLAIN in:', req.model_dump(), flush=True)
    return {'received': req.model_dump()}
