import base64
import time

import truststore

truststore.inject_into_ssl()  # OS cert store, so HTTPS works behind Avast-style TLS scanning; before google.genai

from google import genai  # noqa: E402
from google.genai import errors, types  # noqa: E402

client = genai.Client()  # reads GEMINI_API_KEY

# Tries per model. 26b only: on 2026-10-25, 31b failed 9 of 9 calls (some hung 30-51s first); 26b answered in 1-3s.
MODELS = {'gemma-4-26b-a4b-it': 2}


class GemmaUnavailable(Exception):
    """Every model failed at the API level (5xx, 4xx, timeout, network). Not raised for bad output."""


def _call(contents, config, models: dict[str, int]):
    """Returns the first successful response, trying each model in order. Raises GemmaUnavailable."""
    for model, tries in models.items():
        for attempt in range(tries):
            try:
                return client.models.generate_content(model=model, contents=contents, config=config)
            except errors.ServerError as e:  # intermittent 5xx: worth another try on the same model
                print(f'{model} attempt {attempt + 1} failed: {e.code}')
                if attempt + 1 < tries:
                    time.sleep(2**attempt)
            except errors.ClientError as e:  # 4xx, e.g. 429 (quotas are per model): skip to the next model
                print(f'{model} failed: {e.code} {e.message}')
                break
            except Exception as e:  # timeout, network, SSL: skip to the next model
                print(f'{model} failed: {type(e).__name__}: {e}')
                break
    raise GemmaUnavailable


def generate(contents: str, config, models: dict[str, int] = MODELS) -> str | None:
    """Plain-text Gemma call (captions/explain). Returns the reply text, or None if every model failed."""
    try:
        return _call(contents, config, models).text
    except GemmaUnavailable:
        return None


def image_mime(data: bytes) -> str:
    """Detects the image type from its first bytes (the frontend sends only base64, no type)."""
    if data.startswith(b'\xff\xd8'):
        return 'image/jpeg'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    if data.startswith(b'GIF8'):
        return 'image/gif'
    return 'image/png'


def call_tool(text: str, config, image_base64: str | None = None) -> dict | None:
    """Calls Gemma with a forced tool call and returns the tool's args, or None if it didn't call the tool.
    Raises GemmaUnavailable if every model failed at the API level."""
    contents: list = [text]
    if image_base64:
        data = base64.b64decode(image_base64)
        contents.insert(0, types.Part.from_bytes(data=data, mime_type=image_mime(data)))
    response = _call(contents, config, MODELS)
    for call in response.function_calls or []:
        if call.name == 'show_visualization':
            return dict(call.args or {})
    return None
