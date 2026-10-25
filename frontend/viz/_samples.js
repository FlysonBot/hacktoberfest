// Inline copies of samples/plan_<structure>.json for preview.html, which can't fetch ../../samples/
// when the backend serves frontend/ at /. eval/test_viz.mjs checks these stay identical to samples/.
export const PLANS = {
  stack: {
    structure: 'stack',
    initial: [],
    ops: [
      { op: 'push', args: ['45'] },
      { op: 'push', args: ['56'] },
      { op: 'push', args: ['11'] },
      { op: 'pop', args: [] },
    ],
    source: 'user_question',
  },
  doubly_linked_list: {
    structure: 'doubly_linked_list',
    initial: ['12', '30'],
    ops: [
      { op: 'insert_after', args: ['30', '8'] },
      { op: 'insert_after', args: ['12', '45'] },
      { op: 'insert_after', args: ['45', '76'] },
    ],
    source: 'user_question',
  },
  bst: {
    structure: 'bst',
    initial: ['21', '12', '91', '11', '19', '65', '96'],
    ops: [{ op: 'search', args: ['65'] }],
    source: 'user_question',
  },
  queue: {
    structure: 'queue',
    initial: [],
    ops: [
      { op: 'enqueue', args: ['7'] },
      { op: 'enqueue', args: ['14'] },
      { op: 'enqueue', args: ['21'] },
      { op: 'dequeue', args: [] },
      { op: 'enqueue', args: ['28'] },
      { op: 'peek', args: [] },
    ],
    source: 'user_question',
  },
  singly_linked_list: {
    structure: 'singly_linked_list',
    initial: ['5', '9'],
    ops: [
      { op: 'append', args: ['12'] },
      { op: 'prepend', args: ['3'] },
      { op: 'insert_after', args: ['9', '7'] },
      { op: 'remove', args: ['5'] },
      { op: 'search', args: ['12'] },
    ],
    source: 'user_question',
  },
  hash_linear_probing: {
    structure: 'hash_linear_probing',
    initial: ['10'],
    ops: [
      { op: 'insert', args: ['45'] },
      { op: 'insert', args: ['25'] },
      { op: 'insert', args: ['35'] },
      { op: 'search', args: ['35'] },
      { op: 'remove', args: ['25'] },
      { op: 'search', args: ['35'] },
      { op: 'insert', args: ['55'] },
    ],
    source: 'user_question',
  },
  hash_chaining: {
    structure: 'hash_chaining',
    initial: ['7'],
    ops: [
      { op: 'insert', args: ['10'] },
      { op: 'insert', args: ['17'] },
      { op: 'insert', args: ['3'] },
      { op: 'insert', args: ['24'] },
      { op: 'insert', args: ['5'] },
      { op: 'search', args: ['3'] },
      { op: 'remove', args: ['17'] },
      { op: 'search', args: ['99'] },
    ],
    source: 'user_question',
  },
};
