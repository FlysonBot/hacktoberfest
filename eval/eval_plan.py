"""Eval for /api/plan: does Gemma pick the right structure + source and extract the right initial/ops?

Sends each test question to gemma-4-31b-it with the show_visualization tool (CLAUDE.md contract 1)
and prints PASS/FAIL per case, the extracted tool call, and a final score.

Run from the repo root:
    python eval/eval_plan.py
Needs GEMINI_API_KEY in the environment.
"""

import json
import re
import time

try:
    # Use the OS certificate store so HTTPS works behind antivirus TLS scanning (e.g. Avast).
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

PLAN_MODEL = "gemma-4-31b-it"
FALLBACK_MODEL = "gemma-4-26b-a4b-it"
SLEEP_SECONDS = 4  # free tier is ~15 requests/min
# Try 31b first, fall back to 26b on 500/503, then repeat once with backoff.
ATTEMPTS = [PLAN_MODEL, FALLBACK_MODEL, PLAN_MODEL, FALLBACK_MODEL]

# Valid ops per structure (CLAUDE.md ops table).
VALID_OPS = {
    "singly_linked_list": {"append", "prepend", "insert_after", "remove", "search"},
    "doubly_linked_list": {"append", "prepend", "insert_after", "remove", "search"},
    "stack": {"push", "pop", "peek"},
    "queue": {"enqueue", "dequeue", "peek"},
    "bst": {"insert", "search", "remove"},
    "hash_linear_probing": {"insert", "search", "remove"},
    "hash_chaining": {"insert", "search", "remove"},
    "heap": {"insert", "remove_max"},
    "insertion_sort": {"sort"},
}
ALL_OPS = sorted(set().union(*VALID_OPS.values()))

TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "structure": {"type": "string", "enum": list(VALID_OPS)},
        "initial": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Starting contents, as strings ([] if empty). JS parses numbers.",
        },
        "ops": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "op": {"type": "string", "enum": ALL_OPS},
                    "args": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["op", "args"],
            },
        },
        "source": {"type": "string", "enum": ["user_question", "generated_example"]},
    },
    "required": ["structure", "initial", "ops", "source"],
}

SHOW_VISUALIZATION = types.FunctionDeclaration(
    name="show_visualization",
    description="Choose which data-structure visualization to show, its starting contents, and the operations to animate.",
    parameters_json_schema=TOOL_SCHEMA,
)

# Placeholder until backend/prompts.py exists; keep in sync with the backend's system prompt.
SYSTEM_PROMPT = """You help CSE 12 students understand data structures by choosing a visualization.
Always call the show_visualization tool. Never answer in free text and never compute results yourself.

Structures, what `initial` means, and valid ops (args):
- singly_linked_list / doubly_linked_list: initial = values head -> tail.
  ops: append [v], prepend [v], insert_after [existing, new], remove [v], search [v]
- stack: initial = values bottom -> top. ops: push [v], pop [], peek []
- queue: initial = values front -> back. ops: enqueue [v], dequeue [], peek []
- bst: initial = values in level order. ops: insert [v], search [v], remove [v]
- hash_linear_probing / hash_chaining: initial[0] = table size, rest = keys already in the table; hash = key % size.
  ops: insert [k], search [k], remove [k]
- heap (max-heap): initial = array order. ops: insert [v], remove_max []
- insertion_sort: initial = the array to sort. ops: sort []

Rules:
- Specific question: copy exact values and operations from the question; source = "user_question".
- `initial` holds only what already exists before the question's operations; the operations the question
  asks for go in `ops` (e.g. "insert 50, 30, 70 into a BST" -> initial [], three insert ops).
- Concept-only request: invent a small instructive example (4-6 items); source = "generated_example".
- BST shown in an image or described by parent/child: list values in level order in `initial`.
- Maps: inserting an existing key overwrites it (don't add a new entry).
- All values in initial and args are strings."""


def ops(*pairs):
    return [{"op": op, "args": list(args)} for op, *args in pairs]


# (question, expected structure, expected source, expected initial, expected ops)
# expected initial/ops are None for generated_example cases (only op names are checked).
CASES = [
    ("numList is a doubly-linked list: 12 <-> 30. What is numList after these operations?\n"
     "ListInsertAfter(numList, node 30, node 8)\n"
     "ListInsertAfter(numList, node 12, node 45)\n"
     "ListInsertAfter(numList, node 45, node 76)",
     "doubly_linked_list", "user_question", ["12", "30"],
     ops(("insert_after", "30", "8"), ("insert_after", "12", "45"), ("insert_after", "45", "76"))),
    ("Given an empty stack numStack, what are the stack's contents after these operations?\n"
     "Push(numStack, 45)\nPush(numStack, 56)\nPush(numStack, 11)\nPop(numStack)",
     "stack", "user_question", [],
     ops(("push", "45"), ("push", "56"), ("push", "11"), ("pop",))),
    ("Which nodes are visited when searching for 65 in this BST? The root is 21. 21's left child is 12 and "
     "right child is 91. 12's children are 11 (left) and 19 (right). 91's children are 65 (left) and 96 (right).",
     "bst", "user_question", ["21", "12", "91", "11", "19", "65", "96"],
     ops(("search", "65"))),
    ("Insert 50, 30, 70, 20, 40 into a BST.",
     "bst", "user_question", [],
     ops(("insert", "50"), ("insert", "30"), ("insert", "70"), ("insert", "20"), ("insert", "40"))),
    ("How does a queue work?", "queue", "generated_example", None, None),
    ("Explain separate chaining.", "hash_chaining", "generated_example", None, None),
]

client = genai.Client()

config = types.GenerateContentConfig(
    system_instruction=SYSTEM_PROMPT,
    tools=[types.Tool(function_declarations=[SHOW_VISUALIZATION])],
    tool_config=types.ToolConfig(function_calling_config=types.FunctionCallingConfig(mode="ANY")),
    thinking_config=types.ThinkingConfig(thinking_level="minimal"),
)


def plan(question):
    """Returns (model_used, show_visualization args dict), or raises with a reason."""
    for attempt, model in enumerate(ATTEMPTS):
        try:
            response = client.models.generate_content(model=model, contents=question, config=config)
            break
        except genai_errors.ServerError as e:  # 500/503 "high demand"
            if attempt == len(ATTEMPTS) - 1:
                raise
            wait = SLEEP_SECONDS * (attempt + 1)
            print(f"  {e.code} from {model}; trying {ATTEMPTS[attempt + 1]} in {wait}s", flush=True)
            time.sleep(wait)
    for call in response.function_calls or []:
        if call.name == "show_visualization":
            return model, dict(call.args or {})
    raise ValueError(f"no tool call; text was: {(response.text or '').strip()[:200]!r}")


def norm_ops(raw):
    """[{op, args}] -> [(op, (args...))] with args as stripped strings."""
    return [(o.get("op"), tuple(str(a).strip() for a in o.get("args") or [])) for o in raw or []]


NUMBER = re.compile(r"-?\d+")


def check(question, args, want_structure, want_source, want_initial, want_ops):
    """Returns a list of failure reasons (empty = PASS)."""
    problems = []
    structure, source = args.get("structure"), args.get("source")
    if structure != want_structure:
        problems.append(f"structure={structure!r}, want {want_structure!r}")
    if source != want_source:
        problems.append(f"source={source!r}, want {want_source!r}")

    got_ops = norm_ops(args.get("ops"))
    got_initial = [str(v).strip() for v in args.get("initial") or []]

    if any(a == "" for _, op_args in got_ops for a in op_args) or "" in got_initial:
        problems.append("empty-string value in initial or args")

    if structure in ("hash_linear_probing", "hash_chaining"):
        if not got_initial or not got_initial[0].isdigit() or int(got_initial[0]) <= 0:
            problems.append(f"initial[0] must be a positive integer table size, got {got_initial[:1]}")

    if want_source == "user_question":
        # Faithfulness: every number Gemma emits must appear in the question text.
        question_numbers = set(NUMBER.findall(question))
        emitted = got_initial + [a for _, op_args in got_ops for a in op_args]
        invented = sorted({n for v in emitted for n in NUMBER.findall(v)} - question_numbers)
        if invented:
            problems.append(f"numbers not in question: {invented}")

    if want_initial is not None:
        if got_initial != want_initial:
            problems.append(f"initial={got_initial}, want {want_initial}")
        if got_ops != norm_ops(want_ops):
            problems.append(f"ops differ, want {json.dumps(want_ops)}")
    else:
        bad = [op for op, _ in got_ops if op not in VALID_OPS.get(want_structure, set())]
        if bad:
            problems.append(f"invalid ops for {want_structure}: {bad}")
        if not got_ops:
            problems.append("no ops")
    return problems


passed = 0
for i, (question, *expected) in enumerate(CASES, 1):
    if i > 1:
        time.sleep(SLEEP_SECONDS)
    print(f"[{i}/{len(CASES)}] {question.splitlines()[0]}", flush=True)
    try:
        model, args = plan(question)
    except Exception as e:
        print(f"  FAIL  error: {e}\n", flush=True)
        continue

    problems = check(question, args, *expected)
    passed += not problems
    print(f"  {'PASS' if not problems else 'FAIL'}  ({model})", flush=True)
    for p in problems:
        print(f"    - {p}", flush=True)
    print(f"  structure={args.get('structure')}  source={args.get('source')}", flush=True)
    print(f"  initial: {json.dumps(args.get('initial'))}", flush=True)
    print(f"  ops:     {json.dumps(args.get('ops'))}\n", flush=True)

print(f"Score: {passed}/{len(CASES)} ({100 * passed / len(CASES):.0f}%)", flush=True)
