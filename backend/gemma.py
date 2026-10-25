import base64
import time

from google import genai
from google.genai import errors, types

client = genai.Client()  # reads GEMINI_API_KEY

MODELS = ['gemma-4-31b-it', 'gemma-4-26b-a4b-it']  # strongest first, fast fallback
FAST_FIRST = ['gemma-4-26b-a4b-it', 'gemma-4-31b-it']  # captions/explain: speed over strength
RETRIES = 2


def generate(contents: str, config, models: list[str] = FAST_FIRST) -> str | None:
    """Plain-text Gemma call (captions/explain). Returns the reply text, or None if every model failed."""
    for model in models:
        for attempt in range(RETRIES):
            try:
                return client.models.generate_content(
                    model=model, contents=contents, config=config
                ).text
            except errors.ServerError as e:  # intermittent 5xx from the API
                print(f'{model} attempt {attempt + 1} failed: {e.code}')
                time.sleep(2**attempt)
            except errors.ClientError as e:  # 4xx, e.g. 429 rate limit: retrying won't help, give up
                print(f'{model} failed: {e.code} {e.message}')
                return None
    return None


def call_tool(text: str, config, image_base64: str | None = None) -> dict | None:
    """Calls Gemma with a forced tool call and returns the tool's args, or None."""
    contents: list = [text]
    if image_base64:
        contents.insert(
            0,
            types.Part.from_bytes(
                data=base64.b64decode(image_base64), mime_type='image/png'
            ),
        )
    for model in MODELS:
        for attempt in range(RETRIES):
            try:
                response = client.models.generate_content(
                    model=model, contents=contents, config=config
                )
                for call in response.function_calls or []:
                    if call.name == 'show_visualization':
                        return dict(call.args or {})
                return None
            except errors.ServerError as e:
                print(f'{model} attempt {attempt + 1} failed: {e.code}')
                time.sleep(2**attempt)
            except (
                errors.ClientError
            ) as e:  # 4xx, e.g. 429 rate limit: retrying won't help, give up
                print(f'{model} failed: {e.code} {e.message}')
                return None
    return None
