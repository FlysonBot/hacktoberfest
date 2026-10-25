from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

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


# Echo stubs: print what arrives so we can see the real inputs before wiring up Gemma.
@app.post("/api/plan")
def plan(req: PlanRequest):
    print("PLAN in:", req.text, "| image:", bool(req.image_base64), flush=True)
    return {"received": req.model_dump()}


@app.post("/api/captions")
def captions(req: CaptionsRequest):
    print("CAPTIONS in:", req.structure, len(req.steps), "steps", flush=True)
    return {"received_steps": len(req.steps)}


@app.post("/api/explain")
def explain(req: ExplainRequest):
    print("EXPLAIN in:", req.model_dump(), flush=True)
    return {"received": req.model_dump()}
