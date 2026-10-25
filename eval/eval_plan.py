"""Eval for /api/plan: does Gemma pick the right structure + source and extract the right initial/ops?

Sends each test question to gemma-4-31b-it with the show_visualization tool (CLAUDE.md contract 1)
and prints PASS/FAIL per case, the extracted tool call, and a final score.

Run from the repo root:
    uv run python eval/eval_plan.py                                   # 31b -> 26b fallback, high thinking
    uv run python eval/eval_plan.py --model gemma-4-26b-a4b-it --thinking minimal
    uv run python eval/eval_plan.py --compare                         # A: 26b minimal vs B: 31b high
Needs GEMINI_API_KEY in the environment.
"""

import json
import re
import time
from collections import Counter

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
- Keep ops in the EXACT order the question lists them.
  Example: "Insert 50, 30, 70" -> insert ["50"], insert ["30"], insert ["70"].
- pop, peek, dequeue, remove_max, and sort take args: []. Never put words or brackets in args.
  Example: "Pop(numStack)" -> {"op": "pop", "args": []}.
- Each arg is one plain number or word as a string, e.g. ["45"] (insert_after takes two: ["30", "8"]).
- Students write informally, with typos, missing punctuation, or partial info. Interpret generously; if values
  are missing, invent a small example instead of refusing. If the structure starts empty, initial must be [].
- Complete examples of correct show_visualization calls (copy this shape exactly):
  "Explain how a stack works." ->
  {"structure": "stack", "initial": [], "ops": [{"op": "push", "args": ["5"]}, {"op": "push", "args": ["8"]},
   {"op": "push", "args": ["2"]}, {"op": "pop", "args": []}, {"op": "peek", "args": []}], "source": "generated_example"}
  "q is empty. enqueue 4 then 9, dequeue once" ->
  {"structure": "queue", "initial": [], "ops": [{"op": "enqueue", "args": ["4"]}, {"op": "enqueue", "args": ["9"]},
   {"op": "dequeue", "args": []}], "source": "user_question"}
  "list is 3 7, insert 5 after 3" ->
  {"structure": "singly_linked_list", "initial": ["3", "7"], "ops": [{"op": "insert_after", "args": ["3", "5"]}],
   "source": "user_question"}
- Every push / enqueue / append / prepend / insert / search / remove has exactly one value in args.
  Every pop / peek / dequeue / remove_max / sort has args: [] (never a value, word, or bracket)."""


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
    # Messy input: how students actually type.
    ("push 45 56 11 then pop, what's left",
     "stack", "user_question", [],
     ops(("push", "45"), ("push", "56"), ("push", "11"), ("pop",))),
    ("what does pop do", "stack", "generated_example", None, None),
    ("my hw: list is 12 30, insert 8 after 30, 45 after 12",
     ("doubly_linked_list", "singly_linked_list"), "user_question", ["12", "30"],
     ops(("insert_after", "30", "8"), ("insert_after", "12", "45"))),
    ("stack starts empty. push 3, push 7. pop.",
     "stack", "user_question", [],
     ops(("push", "3"), ("push", "7"), ("pop",))),
    ("explain bst search pls", "bst", "generated_example", None, None),
]

client = genai.Client()


def make_config(thinking_level):
    return types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        tools=[types.Tool(function_declarations=[SHOW_VISUALIZATION])],
        tool_config=types.ToolConfig(function_calling_config=types.FunctionCallingConfig(mode="ANY")),
        thinking_config=types.ThinkingConfig(thinking_level=thinking_level),
    )


# Set by run_suite(): which models to try (in order, on 500/503), the config, and per-run stats.
attempts_order = ATTEMPTS
config = make_config("high")
stats = {"latencies": [], "server_errors": 0}


def plan(question, note=None):
    """Returns (model_used, show_visualization args dict), or raises with a reason.
    `note` (from retry_note) is appended to the question on a retry."""
    contents = question if note is None else f"{question}\n\n{note}"
    for attempt, model in enumerate(attempts_order):
        t = time.time()
        try:
            response = client.models.generate_content(model=model, contents=contents, config=config)
            stats["latencies"].append(time.time() - t)
            break
        except genai_errors.ServerError as e:  # 500/503 "high demand"
            stats["server_errors"] += 1
            if attempt == len(attempts_order) - 1:
                raise
            wait = SLEEP_SECONDS * (attempt + 1)
            print(f"  {e.code} from {model} after {time.time() - t:.1f}s; trying {attempts_order[attempt + 1]} in {wait}s", flush=True)
            time.sleep(wait)
    for call in response.function_calls or []:
        if call.name == "show_visualization":
            return model, dict(call.args or {})
    raise ValueError(f"no tool call; text was: {(response.text or '').strip()[:200]!r}")


def norm_ops(raw):
    """[{op, args}] -> [(op, (args...))] with args as stripped strings."""
    return [(o.get("op"), tuple(str(a).strip() for a in o.get("args") or [])) for o in raw or []]


NUMBER = re.compile(r"-?\d+")

# Number of args each op takes (CLAUDE.md ops table).
ARG_COUNT = {
    "pop": 0, "peek": 0, "dequeue": 0, "remove_max": 0, "sort": 0,
    "push": 1, "enqueue": 1, "append": 1, "prepend": 1, "insert": 1, "search": 1, "remove": 1,
    "insert_after": 2,
}


def is_subsequence(needle, haystack):
    it = iter(haystack)
    return all(n in it for n in needle)


def validate(question, args):
    """Checks the backend can run too (no expected answer needed). Returns failure reasons."""
    problems = []
    structure, source = args.get("structure"), args.get("source")
    got_ops = norm_ops(args.get("ops"))
    got_initial = [str(v).strip() for v in args.get("initial") or []]

    if structure not in VALID_OPS:
        problems.append(f"unknown structure {structure!r}")
    else:
        bad = [op for op, _ in got_ops if op not in VALID_OPS[structure]]
        if bad:
            problems.append(f"invalid ops for {structure}: {bad}")

    if any(a == "" for _, op_args in got_ops for a in op_args) or "" in got_initial:
        problems.append("empty-string value in initial or args")

    if structure in ("hash_linear_probing", "hash_chaining"):
        if not got_initial or not got_initial[0].isdigit() or int(got_initial[0]) <= 0:
            problems.append(f"initial[0] must be a positive integer table size, got {got_initial[:1]}")

    if source == "user_question":
        # Faithfulness: each number Gemma emits can't appear more often than it does in the question text.
        question_numbers = Counter(NUMBER.findall(question))
        emitted = got_initial + [a for _, op_args in got_ops for a in op_args]
        invented = Counter(n for v in emitted for n in NUMBER.findall(v)) - question_numbers
        if invented:
            problems.append(f"numbers over-used vs question (extra count): {dict(invented)}")
        # Order: each op's key number (its LAST arg: the value pushed/inserted/searched) must appear
        # in the question in the same order as the ops. Last arg only, because "insert 8 after 30"
        # lists 8 before 30 while args are ["30", "8"]. Ops only; initial may be reordered (BST level order).
        op_numbers = [n for _, op_args in got_ops if op_args for n in NUMBER.findall(op_args[-1])]
        if not is_subsequence(op_numbers, NUMBER.findall(question)):
            problems.append(f"ops numbers out of order vs question: {op_numbers}")

    wrong_counts = [f"{op}{list(op_args)}" for op, op_args in got_ops
                    if op in ARG_COUNT and len(op_args) != ARG_COUNT[op]]
    if wrong_counts:
        problems.append(f"wrong arg count: {wrong_counts}")

    # A specific question always has something to show: starting contents or operations.
    if source == "user_question" and not got_initial and not got_ops:
        problems.append("empty plan: a specific question needs starting contents or operations")

    # insert_after's first arg must already be in the list at that point (catches swapped args
    # like insert_after ["45", "12"] when 45 hasn't been inserted yet).
    if structure in ("singly_linked_list", "doubly_linked_list"):
        current = list(got_initial)
        for op, op_args in got_ops:
            if op in ("append", "prepend") and op_args:
                current.append(op_args[0])
            elif op == "insert_after" and len(op_args) == 2:
                if op_args[0] not in current:
                    problems.append(f"insert_after {list(op_args)}: node {op_args[0]} isn't in the list at that point "
                                    f"(args are [existing node, new value])")
                current.append(op_args[1])
            elif op == "remove" and op_args and op_args[0] in current:
                current.remove(op_args[0])
    return problems


def compare(args, want_structure, want_source, want_initial, want_ops):
    """Eval-only checks against the expected answer. Never shown to the model."""
    problems = []
    # want_structure may be a tuple of acceptable structures.
    allowed = want_structure if isinstance(want_structure, tuple) else (want_structure,)
    if args.get("structure") not in allowed:
        problems.append(f"structure={args.get('structure')!r}, want {' or '.join(map(repr, allowed))}")
    if args.get("source") != want_source:
        problems.append(f"source={args.get('source')!r}, want {want_source!r}")
    got_ops = norm_ops(args.get("ops"))
    if want_initial is not None:
        got_initial = [str(v).strip() for v in args.get("initial") or []]
        if got_initial != want_initial:
            problems.append(f"initial={got_initial}, want {want_initial}")
        if got_ops != norm_ops(want_ops):
            problems.append(f"ops differ, want {json.dumps(want_ops)}")
    elif not got_ops:
        problems.append("no ops")
    return problems


def check(question, args, *expected):
    """Returns (validation problems, expected-answer problems); both empty = PASS."""
    return validate(question, args), compare(args, *expected)


def retry_note(validation_problems):
    """Error note for the retry. Lists only validation problems, so it never leaks the expected answer."""
    if not validation_problems:
        return ("Your previous show_visualization call did not match the question. Re-read the question and "
                "copy its data structure, starting contents, and operations exactly.")
    lines = "\n".join(f"- {p}" for p in validation_problems)
    return f"Your previous show_visualization call was invalid:\n{lines}\nCall show_visualization again and fix these problems."


def attempt(question, expected, note=None):
    """One plan() call + check. Returns (validation problems, mismatches), or None on API/tool error."""
    try:
        model, args = plan(question, note)
    except Exception as e:
        print(f"  error: {e}", flush=True)
        return None
    validation, mismatch = check(question, args, *expected)
    print(f"  {'ok' if not validation + mismatch else 'invalid'}  ({model})", flush=True)
    for p in validation + mismatch:
        print(f"    - {p}", flush=True)
    print(f"  structure={args.get('structure')}  source={args.get('source')}", flush=True)
    print(f"  initial: {json.dumps(args.get('initial'))}", flush=True)
    print(f"  ops:     {json.dumps(args.get('ops'))}", flush=True)
    return validation, mismatch


def run_suite(label, models, thinking_level):
    """Runs every case (retrying once with the error note on the same model order). Returns a stats dict."""
    global attempts_order, config, stats
    attempts_order, config = models, make_config(thinking_level)
    stats = {"latencies": [], "server_errors": 0}
    print(f"===== {label}: models={models} thinking={thinking_level} =====", flush=True)
    first_try = after_retry = 0
    for i, (question, *expected) in enumerate(CASES, 1):
        if i > 1:
            time.sleep(SLEEP_SECONDS)
        print(f"[{i}/{len(CASES)}] {question.splitlines()[0]}", flush=True)
        result = attempt(question, expected)
        if result is not None and not result[0] + result[1]:
            first_try += 1
            after_retry += 1
            print("  PASS (first try)\n", flush=True)
            continue

        time.sleep(SLEEP_SECONDS)
        note = retry_note(result[0]) if result else None  # API error: plain retry, nothing to correct
        print(f"  retrying{' with error note' if note else ''}", flush=True)
        retry = attempt(question, expected, note)
        ok = retry is not None and not retry[0] + retry[1]
        after_retry += ok
        print(f"  {'PASS (after retry)' if ok else 'FAIL (after retry)'}\n", flush=True)

    n = len(CASES)
    lat = sorted(stats["latencies"])
    result = {
        "label": label, "n": n, "first_try": first_try, "after_retry": after_retry,
        "median": lat[len(lat) // 2] if lat else float("nan"), "max": lat[-1] if lat else float("nan"),
        "server_errors": stats["server_errors"],
    }
    print(f"First-try accuracy:   {first_try}/{n} ({100 * first_try / n:.0f}%)", flush=True)
    print(f"After-retry accuracy: {after_retry}/{n} ({100 * after_retry / n:.0f}%)", flush=True)
    print(f"Latency (successful calls): median {result['median']:.1f}s, max {result['max']:.1f}s; 500/503 errors: {stats['server_errors']}\n", flush=True)
    return result


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", help="test only this model (500/503 retries stay on it)")
    parser.add_argument("--thinking", default="high", help="thinking level: minimal | low | medium | high")
    parser.add_argument("--compare", action="store_true", help="compare A: 26b minimal vs B: 31b high")
    opts = parser.parse_args()

    if opts.compare:
        rows = [
            run_suite("A", [FALLBACK_MODEL] * 3, "minimal"),
            run_suite("B", [PLAN_MODEL] * 3, "high"),
        ]
        print("| setup | first try | after retry | median latency | max latency | 500/503 |")
        print("|---|---|---|---|---|---|")
        names = {"A": f"A: {FALLBACK_MODEL}, minimal", "B": f"B: {PLAN_MODEL}, high"}
        for r in rows:
            print(f"| {names[r['label']]} | {r['first_try']}/{r['n']} | {r['after_retry']}/{r['n']} | "
                  f"{r['median']:.1f}s | {r['max']:.1f}s | {r['server_errors']} |")
    elif opts.model:
        run_suite(opts.model, [opts.model] * 3, opts.thinking)
    else:
        run_suite("default", ATTEMPTS, opts.thinking)
