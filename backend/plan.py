import re
from collections import Counter

from google.genai import types

from backend import demo_cache, gemma
from backend.prompts import ARG_COUNT, SHOW_VISUALIZATION, SYSTEM_PROMPT, VALID_OPS

NUMBER = re.compile(r'-?\d+')
PLAIN_VALUE = re.compile(r'-?[\w.]+')  # one number or word; rejects junk like "// empty stack"
SOURCES = ('user_question', 'generated_example')

config = types.GenerateContentConfig(
    system_instruction=SYSTEM_PROMPT,
    tools=[types.Tool(function_declarations=[SHOW_VISUALIZATION])],
    tool_config=types.ToolConfig(
        function_calling_config=types.FunctionCallingConfig(mode='ANY')
    ),
    thinking_config=types.ThinkingConfig(thinking_level='high'),  # what eval/eval_plan.py tested
    http_options=types.HttpOptions(timeout=90_000),  # ms; real calls took 19-56s
)
# Demo questions have a cached answer, so give up on a slow call sooner and serve that instead.
demo_config = config.model_copy(update={'http_options': types.HttpOptions(timeout=30_000)})


def normalize(args) -> dict:
    """Coerces Gemma's tool args into the /api/plan shape. Raises ValueError if the shape is wrong."""
    if not isinstance(args, dict):
        raise ValueError('tool args are not an object')
    initial, ops = args.get('initial') or [], args.get('ops') or []
    if not isinstance(initial, list) or not isinstance(ops, list):
        raise ValueError('initial and ops must be arrays')
    if not all(isinstance(o, dict) and isinstance(o.get('args') or [], list) for o in ops):
        raise ValueError('each op must be an object with an args array')
    return {
        'structure': args.get('structure'),
        'initial': [str(v).strip() for v in initial],
        'ops': [{'op': o.get('op'), 'args': [str(a).strip() for a in o.get('args') or []]} for o in ops],
        'source': args.get('source'),
    }


def validate(text: str, args, has_image: bool = False) -> list[str]:
    """Returns reasons the tool call is invalid (empty list = OK)."""
    try:
        plan = normalize(args)
    except ValueError as e:
        return [str(e)]
    problems = []
    structure, initial, source = plan['structure'], plan['initial'], plan['source']
    ops = [(o['op'], o['args']) for o in plan['ops']]
    if structure not in VALID_OPS:
        return [f'unknown structure {structure!r}']
    if source not in SOURCES:
        problems.append(f'source must be one of {list(SOURCES)}, got {source!r}')
    if not ops and source == 'generated_example':  # a typed question may only ask to show a structure
        problems.append('no ops')
    for op, op_args in ops:
        if op not in VALID_OPS[structure]:
            problems.append(f'op {op!r} invalid for {structure}')
        elif len(op_args) != ARG_COUNT[op]:
            problems.append(f'op {op!r} takes {ARG_COUNT[op]} args, got {len(op_args)}')
        if '' in op_args:
            problems.append('empty arg')
    if '' in initial:
        problems.append('empty value in initial')
    junk = [v for v in initial + [a for _, op_args in ops for a in op_args] if v and not PLAIN_VALUE.fullmatch(v)]
    if junk:
        problems.append(f'values must be one plain number or word, got {junk}')
    if structure in ('hash_linear_probing', 'hash_chaining'):  # JS computes key % initial[0]
        if not initial or not initial[0].isdigit() or int(initial[0]) <= 0:
            problems.append(f'initial[0] must be a positive integer table size, got {initial[:1]}')
    # The number checks compare against the typed text; with a screenshot the numbers are in the image.
    if source == 'user_question' and not has_image:
        # faithfulness: no number may appear more than in the text
        emitted = initial + [a for _, op_args in ops for a in op_args]
        invented = Counter(n for v in emitted for n in NUMBER.findall(v)) - Counter(
            NUMBER.findall(text)
        )
        if invented:
            problems.append(f'numbers not in the question: {dict(invented)}')
        # order: numbers in ops must appear in the question in the same order (not initial: BST level order)
        remaining = iter(NUMBER.findall(text))
        if not all(
            n in remaining
            for n in NUMBER.findall(' '.join(a for _, op_args in ops for a in op_args))
        ):
            problems.append("ops are not in the question's order")
    return problems


def retry_note(problems: list[str]) -> str:
    """Tells Gemma what was wrong with its last answer (same wording as eval/eval_plan.py)."""
    if not problems:
        return ('Your previous show_visualization call did not match the question. Re-read the question and '
                'copy its data structure, starting contents, and operations exactly.')
    lines = '\n'.join(f'- {p}' for p in problems)
    return f'Your previous show_visualization call was invalid:\n{lines}\nCall show_visualization again and fix these problems.'


def make_plan(text: str, image_base64: str | None = None) -> dict:
    """Raises gemma.GemmaUnavailable if the API is down and there's no cached demo answer."""
    cached = demo_cache.lookup(text) if not image_base64 else None
    note = None
    for _ in range(2):  # retry once on invalid output, telling Gemma what was wrong
        try:
            args = gemma.call_tool(
                text if note is None else f'{text}\n\n{note}',
                demo_config if cached else config,
                image_base64,
            )
        except gemma.GemmaUnavailable:
            if cached:
                print('Gemma unavailable; serving cached demo plan')
                return cached
            raise
        problems = validate(text, args, has_image=bool(image_base64)) if args is not None else ['no tool call']
        if not problems:
            return normalize(args)
        note = retry_note(problems if args is not None else [])
    if cached:
        print('Gemma output invalid twice; serving cached demo plan')
        return cached
    return {
        'structure': None,
        'message': "Sorry, I couldn't turn that into a visualization.",
    }
