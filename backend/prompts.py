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
- All values in initial and args are strings."""
