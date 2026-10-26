import re
from collections import Counter

from google.genai import types

from backend import demo_cache, gemma
from backend.prompts import ARG_COUNT, SYSTEM_PROMPT, VALID_OPS

NUMBER = re.compile(r'-?\d+')
PLAIN_VALUE = re.compile(r'-?[\w.]+')  # one number or word; rejects junk like "// empty stack"
SOURCES = ('user_question', 'generated_example')

# Plain JSON reply, no tool call (see gemma.call_tool). minimal thinking: 3/3 correct in 2-14s on 2026-10-25;
# high was 4/4 correct but 10-20s, too close to the frontend's 20s limit.
config = types.GenerateContentConfig(
    system_instruction=SYSTEM_PROMPT,
    thinking_config=types.ThinkingConfig(thinking_level='minimal'),
    http_options=types.HttpOptions(timeout=18_000),  # ms; under the frontend's 20s PLAN_TIMEOUT_MS
)


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
        'ops': [
            # Ops that take no value get [] even if Gemma garbled an empty list into junk like ["[],"].
            # Safe: JS ignores their args, so this can't change a step or an answer.
            {'op': o.get('op'), 'args': [] if ARG_COUNT.get(o.get('op')) == 0 else [str(a).strip() for a in o.get('args') or []]}
            for o in ops
        ],
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
    if not ops and not initial:  # eval: 26b returned initial [] and ops [] for the BST demo question
        problems.append('empty plan: a specific question needs starting contents or operations')
    # insert_after's first arg must already be in the list at that point (eval: swapped or dropped initial values).
    if structure in ('singly_linked_list', 'doubly_linked_list'):
        present = set(initial)
        for op, op_args in ops:
            if op == 'insert_after' and len(op_args) == 2 and op_args[0] not in present:
                problems.append(f"insert_after {op_args}: node {op_args[0]} isn't in the list at that point")
            if op in ('append', 'prepend', 'insert_after') and op_args:
                present.add(op_args[-1])
            elif op == 'remove' and op_args:
                present.discard(op_args[0])
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
        # order: each op's LAST arg (the value pushed/inserted/searched) must appear in the question in op order.
        # Last arg only: "insert 8 after 30" lists 8 first but args are ["30", "8"]. Not initial: BST level order.
        remaining = iter(NUMBER.findall(text))
        if not all(
            n in remaining
            for n in NUMBER.findall(' '.join(op_args[-1] for _, op_args in ops if op_args))
        ):
            problems.append("ops are not in the question's order")
    return problems


def retry_note(problems: list[str]) -> str:
    """Tells Gemma what was wrong with its last answer (same wording as eval/eval_plan.py)."""
    if not problems:
        return ('Your previous JSON reply did not match the question. Re-read the question and '
                'copy its data structure, starting contents, and operations exactly.')
    lines = '\n'.join(f'- {p}' for p in problems)
    return f'Your previous JSON reply was invalid:\n{lines}\nReply again with the fixed JSON object.'


def number_hint(text: str) -> str:
    """Small models copy values better when told them up front (teammate suggestion)."""
    numbers = NUMBER.findall(text)
    if not numbers:
        return ''
    return (f'\n\nThe numbers in the question, in order, are: {", ".join(numbers)}. '
            'Use exactly these values; never change, translate, or reorder them.')


def make_plan(text: str, image_base64: str | None = None) -> dict:
    """Raises gemma.GemmaUnavailable if the API is down and there's no cached demo answer."""
    cached = demo_cache.lookup(text) if not image_base64 else None
    note = None
    for _ in range(2):  # retry once on invalid output, telling Gemma what was wrong
        try:
            prompt = text + ('' if image_base64 else number_hint(text))
            args = gemma.call_tool(
                prompt if note is None else f'{prompt}\n\n{note}',
                config,
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
        print(f'plan rejected: {problems} args={args}')
        note = retry_note(problems if args is not None else [])
    if cached:
        print('Gemma output invalid twice; serving cached demo plan')
        return cached
    return {
        'structure': None,
        'message': "Sorry, I couldn't turn that into a visualization.",
    }
