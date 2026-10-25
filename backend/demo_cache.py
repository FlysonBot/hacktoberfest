"""Cached /api/plan answers for the docs/DEMO.md questions, served when Gemma fails or times out (CLAUDE.md "Demo safety")."""

import json
import re
from pathlib import Path

SAMPLES = Path(__file__).parent.parent / 'samples'

# Demo question text -> sample plan. Keep in sync with docs/DEMO.md.
QUESTIONS = {
    "Given an empty stack numStack, what are the stack's contents after these operations? "
    'Push(numStack, 45), Push(numStack, 56), Push(numStack, 11), Pop(numStack)': 'plan_stack.json',
    'numList is a doubly-linked list: 12 <-> 30. What is numList after these operations? '
    'ListInsertAfter(numList, node 30, node 8) ListInsertAfter(numList, node 12, node 45) '
    'ListInsertAfter(numList, node 45, node 76)': 'plan_doubly_linked_list.json',
    'numList is a doubly-linked list: 12 ⇄ 30. ListInsertAfter(numList, node 30, node 8); '
    'ListInsertAfter(numList, node 12, node 45); ListInsertAfter(numList, node 45, node 76)': 'plan_doubly_linked_list.json',
    "Which nodes are visited when searching for 65 in this BST? The root is 21. 21's left child is 12 and "
    "right child is 91. 12's children are 11 (left) and 19 (right). 91's children are 65 (left) and 96 (right).": 'plan_bst.json',
}


def _key(text: str) -> str:
    """Lowercase words and numbers only, so spacing, newlines, and punctuation don't matter."""
    return ' '.join(re.findall(r'[a-z0-9]+', text.lower()))


CACHE = {_key(q): json.loads((SAMPLES / name).read_text()) for q, name in QUESTIONS.items()}


def lookup(text: str) -> dict | None:
    return CACHE.get(_key(text))
