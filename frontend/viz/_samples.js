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
};
