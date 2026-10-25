// Binary search tree visualization: run / render / questions (CLAUDE.md contract 4).
// JS decides every step and every answer; Gemma only writes captions.
import { num, step, errorStep, argError, sortChoices, onePerStep, C, SMALL, PILL_H, esc, text, pill, line, svg } from './_shared.js';

const ARGS = { insert: 1, search: 1, remove: 1 };

// Level-order snapshot: { root, nodes: [{ value, left, right }] }.
function snapshot(root) {
  const nodes = [];
  const queue = root ? [root] : [];
  while (queue.length) {
    const n = queue.shift();
    nodes.push({ value: n.value, left: n.left ? n.left.value : null, right: n.right ? n.right.value : null });
    if (n.left) queue.push(n.left);
    if (n.right) queue.push(n.right);
  }
  return { root: root ? root.value : null, nodes };
}

const compare = (t, v) => (t < v ? 'less' : t > v ? 'greater' : 'equal');
const dir = (c) => (c === 'less' ? 'left' : c === 'greater' ? 'right' : null);

export function run(initial, ops) {
  let root = null;
  const values = [];
  // Build the starting tree silently: inserting level-order values rebuilds the pictured tree.
  for (const raw of initial || []) {
    const v = num(raw);
    if (typeof v !== 'number') continue;
    values.push(v);
    if (!root) {
      root = { value: v, left: null, right: null };
      continue;
    }
    let cur = root;
    for (;;) {
      if (v === cur.value) break; // duplicates ignored
      const side = v < cur.value ? 'left' : 'right';
      if (!cur[side]) {
        cur[side] = { value: v, left: null, right: null };
        break;
      }
      cur = cur[side];
    }
  }
  const steps = [step(snapshot(root), [], 'initial', { values })];
  const push = (action, highlights, detail) => steps.push(step(snapshot(root), highlights, action, detail));

  // Walks from the root toward `t`, emitting one step per visited node. Returns { node, parent, path }.
  function walk(action, t, key) {
    const path = [];
    let cur = root, parent = null;
    while (cur) {
      path.push(cur.value);
      const comparison = compare(t, cur.value);
      const found = comparison === 'equal';
      push(action, [...path], { [key]: t, current: cur.value, comparison, next: dir(comparison), found, path: [...path] });
      if (found) return { node: cur, parent, path };
      parent = cur;
      cur = cur[dir(comparison)];
    }
    return { node: null, parent, path };
  }

  for (const { op, args = [] } of ops || []) {
    if (!(op in ARGS)) {
      steps.push(errorStep(snapshot(root), op, args, `unknown operation "${op}" for a BST`));
      continue;
    }
    const bad = argError(op, args, ARGS[op]);
    const v = num(args[0]);
    if (bad || typeof v !== 'number') {
      steps.push(errorStep(snapshot(root), op, args, bad || `BST values must be numbers, got "${args[0]}"`));
      continue;
    }

    if (op === 'search') {
      const { node, path } = walk('search', v, 'target');
      if (!node) push('search', [...path], { target: v, current: null, comparison: null, next: null, found: false, path });
    } else if (op === 'insert') {
      const { node, parent, path } = walk('insert', v, 'value');
      if (node) {
        steps.at(-1).detail.duplicate = true; // already in the tree: nothing to insert
        continue;
      }
      const fresh = { value: v, left: null, right: null };
      const side = parent ? (v < parent.value ? 'left' : 'right') : null;
      if (parent) parent[side] = fresh;
      else root = fresh;
      push('insert', [...path, v], { value: v, phase: 'placed', parent: parent ? parent.value : null, side, path: [...path, v] });
    } else {
      const { node, parent, path } = walk('remove', v, 'target');
      if (!node) {
        push('remove', [...path], { target: v, current: null, comparison: null, next: null, found: false, path });
        continue;
      }
      const replaceChild = (p, oldNode, newNode) => {
        if (!p) root = newNode;
        else if (p.left === oldNode) p.left = newNode;
        else p.right = newNode;
      };
      if (node.left && node.right) {
        // Two children: find the in-order successor (leftmost node of the right subtree).
        const succPath = [];
        let sParent = node, s = node.right;
        succPath.push(s.value);
        while (s.left) {
          sParent = s;
          s = s.left;
          succPath.push(s.value);
        }
        push('remove', [...path, ...succPath], { target: v, phase: 'successor', case: 'two_children', successor: s.value, successor_path: succPath });
        replaceChild(sParent, s, s.right); // unlink successor (it has no left child)
        node.value = s.value; // copy successor's value into the removed node's place
        push('remove', [s.value], { target: v, phase: 'removed', case: 'two_children', replaced_with: s.value, found: true });
      } else {
        const child = node.left || node.right;
        replaceChild(parent, node, child);
        const kase = child ? 'one_child' : 'leaf';
        const hl = child ? [child.value] : parent ? [parent.value] : [];
        push('remove', hl, { target: v, phase: 'removed', case: kase, replaced_with: child ? child.value : null, found: true });
      }
    }
  }
  return steps;
}

const pathText = (p) => p.join(' → ');

// Follows the search rule from `start` (a value) in the level-order snapshot.
function searchPath(byValue, start, target, firstDir = null) {
  const path = [];
  let cur = start, d = firstDir;
  while (cur !== null && cur !== undefined) {
    path.push(cur);
    if (cur === target && !d) break;
    const go = d || (target < cur ? 'left' : 'right');
    d = null;
    cur = byValue.get(cur)[go];
  }
  return path;
}

export function questions(steps) {
  const qs = [];
  steps.forEach((s, i) => {
    if (s.action !== 'search') return;
    const prev = steps[i - 1];
    const firstOfSearch = !(prev && prev.action === 'search' && prev.detail.target === s.detail.target && prev.detail.next);

    // "Which nodes are visited, in order?" asked on the step before the search starts.
    if (firstOfSearch && i > 0) {
      const { nodes, root } = s.state;
      const byValue = new Map(nodes.map((n) => [n.value, n]));
      let end = i;
      while (end + 1 < steps.length && steps[end + 1].action === 'search' && steps[end].detail.next) end++;
      const correct = steps[end].detail.path;
      if (correct.length >= 2) {
        const t = s.detail.target;
        const wrongFirst = searchPath(byValue, root, t, correct.length > 1 ? (dir(compare(t, root)) === 'left' ? 'right' : 'left') : null);
        const beforeLast = correct.at(-2);
        const lastDir = byValue.get(beforeLast).left === correct.at(-1) ? 'right' : 'left';
        const wrongLast = [...correct.slice(0, -1), ...searchPath(byValue, beforeLast, t, lastDir).slice(1)];
        const levelPrefix = nodes.slice(0, correct.length).map((n) => n.value);
        const choices = sortChoices([...new Set([correct, wrongFirst, wrongLast, levelPrefix].map(pathText))]);
        if (choices.length >= 2) {
          qs.push({ stepIndex: i - 1, prompt: `Which nodes are visited, in order, when searching for ${t}?`, choices, answer: pathText(correct) });
        }
      }
    }

    // "Which node is visited next?" on each step that continues to another node.
    const nxt = steps[i + 1];
    if (s.detail.next && nxt && nxt.action === 'search' && nxt.detail.current !== null) {
      const n = s.state.nodes.find((x) => x.value === s.detail.current);
      const choices = sortChoices([...new Set([n.left, n.right].filter((x) => x !== null).map(String).concat('none (search ends)'))]);
      qs.push({ stepIndex: i, prompt: 'Which node is visited next?', choices, answer: String(nxt.detail.current) });
    }
  });
  return onePerStep(qs);
}

// x by in-order index, y by depth (zyBooks BST style).
const R = 19, DX = 44, DY = 54, PAD = 10, TOP = PAD + PILL_H + 10;

export function render(container, s) {
  const { root, nodes } = s.state;
  const byValue = new Map(nodes.map((n) => [n.value, n]));
  const pos = new Map();
  let idx = 0, maxDepth = 0;
  (function inorder(v, depth) {
    if (v === null || v === undefined) return;
    const n = byValue.get(v);
    inorder(n.left, depth + 1);
    pos.set(v, { x: PAD + R + idx++ * DX, y: TOP + R + depth * DY });
    maxDepth = Math.max(maxDepth, depth);
    inorder(n.right, depth + 1);
  })(root, 0);

  const width = Math.max(PAD * 2 + R * 2 + Math.max(nodes.length - 1, 0) * DX, 200);
  const height = TOP + R * 2 + maxDepth * DY + PAD;
  const hl = new Set(s.highlights);
  const d = s.detail || {};
  const current = d.phase === 'successor' ? d.successor : d.phase === 'placed' ? d.value : d.current;
  const parts = [];

  // Small pill naming the operation in progress, e.g. "search 65".
  const opValue = d.target ?? d.value;
  if (s.action !== 'initial' && s.action !== 'error' && opValue !== undefined) {
    const label = `${s.action} ${opValue}`;
    parts.push(pill(PAD + (label.length * 6.2 + 14) / 2, PAD, label));
  }

  if (!nodes.length) parts.push(text(width / 2, TOP + R, 'empty tree', { size: SMALL + 1, color: C.muted }));

  for (const n of nodes) {
    for (const c of [n.left, n.right]) {
      if (c === null) continue;
      const a = pos.get(n.value), b = pos.get(c);
      const onPath = hl.has(n.value) && hl.has(c);
      parts.push(line(a.x, a.y, b.x, b.y, onPath ? { color: C.hiLine, width: 1.75 } : {}));
    }
  }
  for (const n of nodes) {
    const { x, y } = pos.get(n.value);
    const isCur = n.value === current;
    const on = hl.has(n.value);
    parts.push(
      `<circle cx="${x}" cy="${y}" r="${R}" stroke-width="${isCur ? 2 : 1.5}" style="fill:${isCur ? C.strong : on ? C.hiFill : C.box};stroke:${on || isCur ? C.hiLine : C.line}"/>`,
      text(x, y, esc(n.value), { size: String(n.value).length > 2 ? 15 : 18, weight: 500 })
    );
  }

  container.innerHTML = svg(width, height, `BST: ${nodes.map((n) => n.value).join(', ') || 'empty'}`, parts);
}
