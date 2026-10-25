import mimetypes
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.captions import make_captions, make_explanation
from backend.gemma import GemmaUnavailable
from backend.plan import make_plan

FRONTEND = Path(__file__).parent.parent / 'frontend'

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


@app.post('/api/plan')
def plan(req: PlanRequest):
    try:
        return make_plan(req.text, req.image_base64)
    except GemmaUnavailable:  # frontend shows this in its error banner with a Retry button
        raise HTTPException(503, 'Gemma is busy right now. Try again in a minute.')


# On failure, captions/explain return 502; the frontend then shows its own fallback text.
@app.post('/api/captions')
def captions(req: CaptionsRequest):
    result = make_captions(req.structure, req.steps)
    if result is None:
        raise HTTPException(502, 'Gemma captions failed')
    return {'captions': result}


@app.post('/api/explain')
def explain(req: ExplainRequest):
    result = make_explanation(req.structure, req.step, req.prompt, req.user_answer, req.correct_answer)
    if result is None:
        raise HTTPException(502, 'Gemma explanation failed')
    return {'explanation': result}


mimetypes.add_type('text/javascript', '.js')  # some Windows registries map .js to text/plain, which breaks ES modules

# Mounted last so /api/* routes win; serves frontend/index.html at /.
app.mount('/', StaticFiles(directory=FRONTEND, html=True), name='frontend')
