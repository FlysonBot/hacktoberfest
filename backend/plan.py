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
    thinking_config=types.ThinkingConfig(thinking_level='minimal'),
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


def make_plan(text: str, image_base64: str | None = None) -> dict:
    for _ in range(2):  # retry once on invalid output
        args = gemma.call_tool(text, config, image_base64)
        if args is not None and not validate(text, args):
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
