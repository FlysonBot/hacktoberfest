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
