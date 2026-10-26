// Parses and validates the student's typed sandbox ops (e.g. "push 5, pop")
// into the same { op, args } shape the backend's show_visualization tool
// produces. Pure parsing/validation only — no algorithm logic, no network.
// Mirrors the per-structure ops table in CLAUDE.md exactly; keep in sync.

export const OPS_BY_STRUCTURE = {
  singly_linked_list: { append: 1, prepend: 1, insert_after: 2, remove: 1, search: 1 },
  doubly_linked_list: { append: 1, prepend: 1, insert_after: 2, remove: 1, search: 1 },
  stack: { push: 1, pop: 0, peek: 0 },
  queue: { enqueue: 1, dequeue: 0, peek: 0 },
  bst: { insert: 1, search: 1, remove: 1 },
  hash_linear_probing: { insert: 1, search: 1, remove: 1 },
  hash_chaining: { insert: 1, search: 1, remove: 1 },
  heap: { insert: 1, remove_max: 0 },
  insertion_sort: { sort: 0 },
};

// One realistic example per structure, in that structure's own vocabulary
// (so a BST hint never says "push", a stack hint never says "insert", etc.)
// for the sandbox UI's placeholder/hint text and error messages.
const EXAMPLE_OPS_TEXT = {
  singly_linked_list: 'append 5, remove 3',
  doubly_linked_list: 'append 5, remove 3',
  stack: 'push 5, pop',
  queue: 'enqueue 5, dequeue',
  bst: 'insert 5, search 3',
  hash_linear_probing: 'insert 5, search 3',
  hash_chaining: 'insert 5, search 3',
  heap: 'insert 5, remove_max',
  insertion_sort: 'sort',
};

// Falls back to building one from the ops table for any structure not
// listed above, so this never goes stale if a new structure is added.
export function exampleOpsText(structure) {
  if (EXAMPLE_OPS_TEXT[structure]) return EXAMPLE_OPS_TEXT[structure];
  const table = OPS_BY_STRUCTURE[structure];
  if (!table) return '';
  return Object.entries(table)
    .slice(0, 2)
    .map(([op, argCount]) => (argCount > 0 ? `${op} 5` : op))
    .join(', ');
}

// Returns { ops } on success, or { error } (a message naming the bad phrase)
// on failure. All-or-nothing: an invalid phrase anywhere rejects the whole
// batch rather than applying a partial prefix.
export function parseSandboxOps(text, structure) {
  const table = OPS_BY_STRUCTURE[structure];
  if (!table) {
    return { error: `No known operations for structure "${structure}".` };
  }

  const phrases = String(text ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (phrases.length === 0) {
    return { error: `Type at least one operation, e.g. "${exampleOpsText(structure)}".` };
  }

  const ops = [];
  for (const phrase of phrases) {
    const tokens = phrase.split(/\s+/);
    const op = tokens[0].toLowerCase();
    const args = tokens.slice(1);

    if (!(op in table)) {
      const allowed = Object.keys(table).join(', ');
      return { error: `"${phrase}" — unknown operation "${op}" for this structure. Valid: ${allowed}.` };
    }
    const expectedArgs = table[op];
    if (args.length !== expectedArgs) {
      return {
        error: `"${phrase}" — ${op} takes ${expectedArgs} argument${expectedArgs === 1 ? '' : 's'}, got ${args.length}.`,
      };
    }
    ops.push({ op, args });
  }

  return { ops };
}
