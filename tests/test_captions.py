"""Offline tests for captions.parse_captions(): Gemma's raw reply in, list of captions (or None) out."""

import os

os.environ.setdefault('GEMINI_API_KEY', 'dummy')  # importing backend creates the client; never used here

from backend.captions import parse_captions


def test_plain_json_array():
    assert parse_captions('["Start empty.", "Push 45."]', 2) == ['Start empty.', 'Push 45.']


def test_text_around_json():  # models sometimes wrap the JSON in prose or ```json fences
    assert parse_captions('Here you go:\n```json\n["A.", "B."]\n```', 2) == ['A.', 'B.']


def test_wrong_count_rejected():  # frontend needs exactly one caption per step
    assert parse_captions('["A."]', 2) is None


def test_garbage_rejected():
    assert parse_captions('Sorry, I cannot help.', 1) is None
    assert parse_captions('["A.", 5]', 2) is None
    assert parse_captions('["A.", ""]', 2) is None
    assert parse_captions(None, 1) is None
