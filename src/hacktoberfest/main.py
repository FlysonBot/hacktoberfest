import time

from google import genai
from google.genai import errors

client = genai.Client()  # reads GEMINI_API_KEY

MODELS = ["gemma-4-31b-it", "gemma-4-26b-a4b-it"]  # strongest first, fast fallback
RETRIES = 2


def generate(contents: str) -> str:
    for model in MODELS:
        for attempt in range(RETRIES):
            try:
                return client.models.generate_content(model=model, contents=contents).text
            except errors.ServerError as e:  # intermittent 5xx from the API
                print(f"{model} attempt {attempt + 1} failed: {e.code}")
                time.sleep(2**attempt)
    raise RuntimeError("All Gemma models failed")


print(generate("Explain transformer attention in two sentences."))
