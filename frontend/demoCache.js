// Matches the student's typed question against the 3 demo questions in
// docs/DEMO.md so the demo video never depends on a live Gemma call. Text
// is copied exactly from docs/DEMO.md — keep both in sync if either changes.

export const DEMO_QUESTIONS = [
  {
    text: "Given an empty stack numStack, what are the stack's contents after these operations? Push(numStack, 45), Push(numStack, 56), Push(numStack, 11), Pop(numStack)",
    file: './demo/plan_stack.json',
  },
  {
    text: 'numList is a doubly-linked list: 12 ⇄ 30. ListInsertAfter(numList, node 30, node 8); ListInsertAfter(numList, node 12, node 45); ListInsertAfter(numList, node 45, node 76)',
    file: './demo/plan_doubly_linked_list.json',
  },
  {
    text: "Which nodes are visited when searching for 65 in this BST? The root is 21. 21's left child is 12 and right child is 91. 12's children are 11 (left) and 19 (right). 91's children are 65 (left) and 96 (right).",
    file: './demo/plan_bst.json',
  },
];

// Lowercase letters and digits only (same as backend/demo_cache.py's key), so curly quotes,
// punctuation, and spacing from copy-paste still hit the cache instead of a live Gemma call.
export function normalizeQuestionText(text) {
  return (String(text ?? '').toLowerCase().match(/[a-z0-9]+/g) || []).join(' ');
}

export function matchDemoQuestion(text) {
  const normalized = normalizeQuestionText(text);
  return DEMO_QUESTIONS.find((q) => normalizeQuestionText(q.text) === normalized) || null;
}
