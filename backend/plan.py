import re
from collections import Counter

from google.genai import types

from backend import gemma
from backend.prompts import ARG_COUNT, SHOW_VISUALIZATION, SYSTEM_PROMPT, VALID_OPS

NUMBER = re.compile(r'-?\d+')

config = types.GenerateContentConfig(
    system_instruction=SYSTEM_PROMPT,
    tools=[types.Tool(function_declarations=[SHOW_VISUALIZATION])],
    tool_config=types.ToolConfig(
        function_calling_config=types.FunctionCallingConfig(mode='ANY')
    ),
    thinking_config=types.ThinkingConfig(thinking_level='high'),  # what eval/eval_plan.py tested
)


def validate(text: str, args: dict) -> list[str]:
    """Returns reasons the tool call is invalid (empty list = OK)."""
    problems = []
    structure = args.get('structure')
    if structure not in VALID_OPS:
        return [f'unknown structure {structure!r}']
    initial = [str(v).strip() for v in args.get('initial') or []]
    ops = [
        (o.get('op'), [str(a).strip() for a in o.get('args') or []])
        for o in args.get('ops') or []
    ]
    if not ops:
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
    if structure in ('hash_linear_probing', 'hash_chaining'):  # JS computes key % initial[0]
        if not initial or not initial[0].isdigit() or int(initial[0]) <= 0:
            problems.append(f'initial[0] must be a positive integer table size, got {initial[:1]}')
    if (
        args.get('source') == 'user_question'
    ):  # faithfulness: no number may appear more than in the text
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
    note = None
    for _ in range(2):  # retry once on invalid output, telling Gemma what was wrong
        args = gemma.call_tool(text if note is None else f'{text}\n\n{note}', config, image_base64)
        problems = validate(text, args) if args is not None else []
        note = retry_note(problems)
        if args is not None and not problems:
            return {
                'structure': args['structure'],
                'initial': [str(v).strip() for v in args.get('initial') or []],
                'ops': [
                    {'op': o['op'], 'args': [str(a).strip() for a in o['args']]}
                    for o in args['ops']
                ],
                'source': args['source'],
            }
    return {
        'structure': None,
        'message': "Sorry, I couldn't turn that into a visualization.",
    }
