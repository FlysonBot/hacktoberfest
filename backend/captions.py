import json

from google.genai import types

from backend import gemma
from backend.prompts import CAPTIONS_PROMPT, EXPLAIN_PROMPT

captions_config = types.GenerateContentConfig(
    system_instruction=CAPTIONS_PROMPT,
    thinking_config=types.ThinkingConfig(thinking_level='minimal'),
    http_options=types.HttpOptions(timeout=20_000),  # ms; real calls took ~2s
)
explain_config = types.GenerateContentConfig(
    system_instruction=EXPLAIN_PROMPT,
    thinking_config=types.ThinkingConfig(thinking_level='minimal'),
    http_options=types.HttpOptions(timeout=20_000),  # ms; real calls took ~1s
)


def parse_captions(reply: str | None, count: int) -> list[str] | None:
    """Pulls the JSON array of strings out of the reply (models sometimes add text around it)."""
    if not reply or '[' not in reply or ']' not in reply:
        return None
    try:
        captions = json.loads(reply[reply.index('[') : reply.rindex(']') + 1])
    except json.JSONDecodeError:
        return None
    if not isinstance(captions, list) or len(captions) != count:
        return None
    if not all(isinstance(c, str) and c.strip() for c in captions):
        return None
    return [c.strip() for c in captions]


def make_captions(structure: str, steps: list[dict]) -> list[str] | None:
    """One caption per step, or None (frontend then uses captions built from `detail`)."""
    facts = [{'step': i, 'action': s.get('action'), 'detail': s.get('detail')} for i, s in enumerate(steps)]
    contents = f'Structure: {structure}\n{len(steps)} steps:\n{json.dumps(facts)}'
    for _ in range(2):  # retry once on a garbled reply
        reply = gemma.generate(contents, captions_config)
        if reply is None:  # API down: retrying only delays the frontend's fallback captions
            return None
        captions = parse_captions(reply, len(steps))
        if captions is not None:
            return captions
    return None


def make_explanation(structure: str, step: dict, prompt: str, user_answer: str, correct_answer: str) -> str | None:
    contents = (
        f'Structure: {structure}\n'
        f'Step: {json.dumps({"action": step.get("action"), "detail": step.get("detail")})}\n'
        f'Question: {prompt}\n'
        f'Student answered: {user_answer}\n'
        f'Correct answer: {correct_answer}'
    )
    reply = gemma.generate(contents, explain_config)
    return reply.strip() if reply and reply.strip() else None
