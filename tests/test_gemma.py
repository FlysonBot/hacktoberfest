"""Offline tests for gemma.py's model fallback. The Gemini client is mocked; no API calls."""

import os

os.environ.setdefault('GEMINI_API_KEY', 'dummy')

import httpx
import pytest
from google.genai import errors

from backend import gemma


def fake_client(monkeypatch, *outcomes):
    """Each generate_content call raises/returns the next outcome; returns the list of models called."""
    models = []

    def generate_content(model, contents, config):
        outcome = outcomes[len(models)]
        models.append(model)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome
    monkeypatch.setattr(gemma.client.models, 'generate_content', generate_content)
    monkeypatch.setattr(gemma.time, 'sleep', lambda s: None)
    return models


def api_error(cls, code):
    return cls(code, {'error': {'code': code, 'message': 'x', 'status': 'x'}})


class Reply:
    text = 'ok'


def test_429_gives_up_without_retry(monkeypatch):  # retrying a rate limit right away won't help
    models = fake_client(monkeypatch, api_error(errors.ClientError, 429))
    assert gemma.generate('hi', None) is None
    assert models == ['gemma-4-26b-a4b-it']


def test_503_retried_once(monkeypatch):
    models = fake_client(monkeypatch, api_error(errors.ServerError, 503), Reply())
    assert gemma.generate('hi', None) == 'ok'
    assert models == ['gemma-4-26b-a4b-it'] * 2


def test_network_error_falls_back(monkeypatch):  # used to escape as a plain-text 500
    fake_client(monkeypatch, httpx.ConnectError('ssl'), Reply())
    assert gemma.generate('hi', None, {'a': 1, 'b': 1}) == 'ok'


def test_only_26b_used(monkeypatch):  # 31b failed 9 of 9 real calls on 2026-10-25
    models = fake_client(monkeypatch, *[api_error(errors.ServerError, 503)] * 2)
    with pytest.raises(gemma.GemmaUnavailable):
        gemma.call_tool('hi', None)
    assert models == ['gemma-4-26b-a4b-it'] * 2


def test_image_mime():
    assert gemma.image_mime(b'\x89PNG\r\n') == 'image/png'
    assert gemma.image_mime(b'\xff\xd8\xff') == 'image/jpeg'
    assert gemma.image_mime(b'RIFF\0\0\0\0WEBP') == 'image/webp'
