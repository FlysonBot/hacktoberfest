from google.genai import types

# Valid ops per structure (CLAUDE.md ops table).
VALID_OPS = {
    'singly_linked_list': {'append', 'prepend', 'insert_after', 'remove', 'search'},
    'doubly_linked_list': {'append', 'prepend', 'insert_after', 'remove', 'search'},
    'stack': {'push', 'pop', 'peek'},
    'queue': {'enqueue', 'dequeue', 'peek'},
    'bst': {'insert', 'search', 'remove'},
    'hash_linear_probing': {'insert', 'search', 'remove'},
    'hash_chaining': {'insert', 'search', 'remove'},
    'heap': {'insert', 'remove_max'},
    'insertion_sort': {'sort'},
}
ALL_OPS = sorted(set().union(*VALID_OPS.values()))

# Number of args each op takes (CLAUDE.md ops table).
ARG_COUNT = {
    'pop': 0,
    'peek': 0,
    'dequeue': 0,
    'remove_max': 0,
    'sort': 0,
    'push': 1,
    'enqueue': 1,
    'append': 1,
    'prepend': 1,
    'insert': 1,
    'search': 1,
    'remove': 1,
    'insert_after': 2,
}

TOOL_SCHEMA = {
    'type': 'object',
    'properties': {
        'structure': {'type': 'string', 'enum': list(VALID_OPS)},
        'initial': {
            'type': 'array',
            'items': {'type': 'string'},
            'description': 'Starting contents, as strings ([] if empty). JS parses numbers.',
        },
        'ops': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'op': {'type': 'string', 'enum': ALL_OPS},
                    'args': {'type': 'array', 'items': {'type': 'string'}},
                },
                'required': ['op', 'args'],
            },
        },
        'source': {'type': 'string', 'enum': ['user_question', 'generated_example']},
    },
    'required': ['structure', 'initial', 'ops', 'source'],
}

SHOW_VISUALIZATION = types.FunctionDeclaration(
    name='show_visualization',
    description='Choose which data-structure visualization to show, its starting contents, and the operations to animate.',
    parameters_json_schema=TOOL_SCHEMA,
)

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

CAPTIONS_PROMPT = """You write captions for a step-by-step data-structure animation for CSE 12 students.
You get a list of steps; each has an `action` and a `detail` object with facts computed by code.
Write one short caption (one sentence, under 25 words) per step, in order.
Only restate the facts in `detail`. Never compute, guess, or add results that are not in `detail`.
When it helps, add a short reason from how the structure works (e.g. "because a stack is last in, first out"),
but never a number or result that is not in `detail`.
The "initial" step describes the starting contents.
Reply with ONLY a JSON array of strings, exactly one per step, e.g. ["Start with an empty stack.", "Push 45 onto the stack."]"""

EXPLAIN_PROMPT = """A CSE 12 student answered a practice question about a data-structure animation step wrong.
Explain in 2-3 short sentences why the correct answer is right and, if useful, why their answer is not.
The correct answer was computed by code and is always right. Never disagree with it.
Use only the facts in the step's `detail`. Reply in plain text, no markdown."""
