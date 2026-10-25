"""Offline tests for plan.validate(): fake Gemma answers in, list of problems out. No API calls."""

import os

os.environ.setdefault('GEMINI_API_KEY', 'dummy')  # importing backend.plan creates the client; never used here

from backend.plan import validate


def ops(*pairs):
    return [{'op': op, 'args': list(args)} for op, *args in pairs]


def answer(structure, initial, op_list, source='user_question'):
    return {'structure': structure, 'initial': initial, 'ops': op_list, 'source': source}


STACK_Q = 'Given numStack is empty: Push 45, Push 56, Push 11, Pop'
BST_Q = 'Insert 50, 30, 70, 20, 40 into an empty BST'


def test_good_stack_passes():
    a = answer('stack', [], ops(('push', '45'), ('push', '56'), ('push', '11'), ('pop',)))
    assert validate(STACK_Q, a) == []


def test_good_insert_after_passes():
    q = 'Doubly linked list 12, 30; ListInsertAfter(30, 8), (12, 45), (45, 76)'
    a = answer('doubly_linked_list', ['12', '30'],
               ops(('insert_after', '30', '8'), ('insert_after', '12', '45'), ('insert_after', '45', '76')))
    assert validate(q, a) == []


def test_unknown_structure():
    a = answer('tree', [], ops(('insert', '50')))
    assert 'unknown structure' in validate(BST_Q, a)[0]


def test_op_invalid_for_structure():
    a = answer('bst', [], ops(('push', '50')))
    assert any('invalid for bst' in p for p in validate(BST_Q, a))


def test_wrong_arg_count():  # eval: 26b returned peek with args ["peek"]
    a = answer('stack', [], ops(('push', '45'), ('peek', 'peek')))
    assert any('takes 0 args' in p for p in validate(STACK_Q, a))


def test_empty_arg():  # eval: args ["", "12"]
    q = 'List 12, 30; ListInsertAfter(12, 5)'
    a = answer('singly_linked_list', ['12', '30'], ops(('insert_after', '', '12')))
    assert 'empty arg' in validate(q, a)


def test_invented_number():  # eval: 26b turned "50, 30, 70, 20, 40" into 50, 30, 40, 20, 40
    a = answer('bst', [], ops(*[('insert', n) for n in ['50', '30', '40', '20', '40']]))
    assert any('not in the question' in p for p in validate(BST_Q, a))


def test_reordered_ops():  # eval: 26b turned "50, 30, 70, 20, 40" into 50, 30, 40, 20, 70
    a = answer('bst', [], ops(*[('insert', n) for n in ['50', '30', '40', '20', '70']]))
    assert "ops are not in the question's order" in validate(BST_Q, a)


def test_generated_example_skips_question_checks():
    a = answer('queue', ['3', '8'], ops(('enqueue', '5'), ('dequeue',)), source='generated_example')
    assert validate('how does a queue work?', a) == []


def test_hash_needs_table_size():  # JS computes key % initial[0]
    q = 'Insert 15 into an empty hash table of size 10'
    assert validate(q, answer('hash_chaining', ['10'], ops(('insert', '15')))) == []
    assert any('table size' in p for p in validate(q, answer('hash_chaining', [], ops(('insert', '15')))))


DLL_PLAN = answer('doubly_linked_list', ['12', '30'],
                  ops(('insert_after', '30', '8'), ('insert_after', '12', '45'), ('insert_after', '45', '76')))


def test_screenshot_skips_number_checks():  # the numbers are in the image, not the typed text
    assert validate('Solve this', DLL_PLAN) != []
    assert validate('Solve this', DLL_PLAN, has_image=True) == []


def test_junk_value_rejected():  # eval: initial ["// empty stack"]
    a = answer('stack', ['// empty stack'], ops(('push', '45'), ('pop',)))
    assert any('plain number or word' in p for p in validate(STACK_Q, a))


def test_bad_shapes_are_problems_not_crashes():
    for bad in [
        answer('stack', [], ['push 45']),  # op is a string
        answer('stack', [], [{'op': 'push', 'args': 45}]),  # args is a number
        answer('stack', '45', []),  # initial is a string
        'not a dict',
    ]:
        assert validate(STACK_Q, bad) != []


def test_source_must_be_valid():
    a = answer('stack', ['999'], ops(('push', '45')), source='whatever')
    assert any('source' in p for p in validate(STACK_Q, a))
    a.pop('source')
    assert any('source' in p for p in validate(STACK_Q, a))


def test_empty_ops_ok_for_typed_question_only():
    q = 'Show me this BST: 50, 30, 70'
    assert validate(q, answer('bst', ['50', '30', '70'], [])) == []
    assert 'no ops' in validate(q, answer('bst', ['50', '30', '70'], [], source='generated_example'))


# make_plan with Gemma mocked out

import pytest  # noqa: E402

from backend import gemma, plan  # noqa: E402

STACK_DEMO_Q = ("Given an empty stack numStack, what are the stack's contents after these operations? "
                'Push(numStack, 45), Push(numStack, 56), Push(numStack, 11), Pop(numStack)')


def fake_gemma(monkeypatch, *replies):
    """Each call returns the next reply; an Exception reply is raised instead."""
    calls = []

    def call_tool(text, config, image_base64=None):
        reply = replies[len(calls)]
        calls.append(text)
        if isinstance(reply, Exception):
            raise reply
        return reply
    monkeypatch.setattr(gemma, 'call_tool', call_tool)
    return calls


def test_pop_without_args_key(monkeypatch):  # used to KeyError -> 500
    fake_gemma(monkeypatch, answer('stack', [], [{'op': 'push', 'args': ['45']}, {'op': 'pop'}]))
    assert plan.make_plan('Push 45, Pop')['ops'] == [{'op': 'push', 'args': ['45']}, {'op': 'pop', 'args': []}]


def test_outage_raises_for_normal_question(monkeypatch):  # main.py turns this into a 503
    calls = fake_gemma(monkeypatch, gemma.GemmaUnavailable())
    with pytest.raises(gemma.GemmaUnavailable):
        plan.make_plan('Push 5, Pop')
    assert len(calls) == 1  # no second round on an outage


def test_outage_serves_cached_demo_plan(monkeypatch):
    fake_gemma(monkeypatch, gemma.GemmaUnavailable())
    assert plan.make_plan(STACK_DEMO_Q.replace(', ', ',\n'))['structure'] == 'stack'  # spacing doesn't matter


def test_invalid_twice_serves_cached_demo_plan(monkeypatch):
    bad = answer('stack', ['// junk'], ops(('pop',)))
    fake_gemma(monkeypatch, bad, bad)
    assert plan.make_plan(STACK_DEMO_Q)['ops'][0] == {'op': 'push', 'args': ['45']}


def test_insert_after_in_student_word_order():  # "insert 8 after 30": text order 8, 30; args ["30", "8"]
    q = 'my hw: list is 12 30, insert 8 after 30, 45 after 12'
    a = answer('doubly_linked_list', ['12', '30'], ops(('insert_after', '30', '8'), ('insert_after', '12', '45')))
    assert validate(q, a) == []
