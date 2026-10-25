// Shared helpers for frontend/viz/* modules: value parsing, step builders, and the compact
// zyBooks-like SVG drawing kit (64x36 boxes, 1.5px borders, 18px values, small pills,
// frontend CSS variables, one accent color, centered and capped at 420px wide).

export const num = (s) => {
  const t = String(s ?? '').trim();
  return t !== '' && !isNaN(Number(t)) ? Number(t) : t;
};

export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Numbers ascending, words after, so the answer's position gives nothing away.
export const sortChoices = (cs) =>
  cs.sort((a, b) => (isNaN(a) || isNaN(b) ? (isNaN(a) - isNaN(b)) || a.localeCompare(b) : a - b));

// The frontend shows one question per step: keep the first question for each stepIndex.
export const onePerStep = (qs) => {
  const seen = new Set();
  return qs.filter((q) => !seen.has(q.stepIndex) && seen.add(q.stepIndex));
};

export const step = (state, highlights, action, detail) => ({ state, highlights, action, detail, caption: '' });

// Typed sandbox ops must never crash run(): bad ops become an "error" step that leaves the state unchanged.
export const errorStep = (state, op, args, error) => step(state, [], 'error', { op, args: args || [], error });

// Returns an error message if `args` doesn't have exactly `n` non-empty values, else null.
export function argError(op, args, n) {
  const a = (args || []).map((x) => String(x ?? '').trim());
  if (a.length !== n || a.some((x) => x === '')) return `${op} takes ${n} value${n === 1 ? '' : 's'}, got ${JSON.stringify(args || [])}`;
  return null;
}

// ---- drawing kit -------------------------------------------------------------------------

export const BOX_W = 64, BOX_H = 36, GAP = 6, FONT = 18, SMALL = 11, PILL_H = 18;

export const C = {
  text: 'var(--text,#1D1D1F)',
  muted: 'var(--text-3,#6B6965)',
  box: 'var(--surface,#FFFFFF)',
  line: 'var(--line-strong,#C9C6BF)',
  hiFill: 'var(--accent-tint,#F1EBFF)',
  hiLine: 'var(--accent-strong,#7B5CE6)',
  strong: 'var(--accent,#C4B1FF)', // "current" item: same hue, stronger
  tagText: 'var(--accent-text,#5B3CC4)',
};

export const text = (x, y, s, { size = FONT, color = C.text, anchor = 'middle', weight = 400 } = {}) =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="central" font-size="${size}" font-weight="${weight}" style="fill:${color}">${s}</text>`;

// A value box. `on` = highlighted; `current` = the item being acted on right now.
export const box = (x, y, value, { w = BOX_W, h = BOX_H, on = false, current = false, ghost = false } = {}) => {
  const fill = current ? C.strong : on ? C.hiFill : C.box;
  const stroke = on || current ? C.hiLine : C.line;
  const r = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" stroke-width="1.5"${ghost ? ' stroke-dasharray="4 3"' : ''} style="fill:${fill};stroke:${stroke}"/>`;
  const t = value === null || value === undefined ? '' : text(x + w / 2, y + h / 2, esc(value), { weight: 500 });
  return ghost ? `<g opacity="0.5">${r}${t}</g>` : r + t;
};

// Small pill label centered at cx, top edge at y. Returns [svg, width].
export const pill = (cx, y, label) => {
  const w = String(label).length * 6.2 + 14;
  return (
    `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="${PILL_H}" rx="${PILL_H / 2}" stroke-width="1" style="fill:${C.hiFill};stroke:${C.hiLine}"/>` +
    text(cx, y + PILL_H / 2, esc(label), { size: SMALL, color: C.tagText, weight: 600 })
  );
};

export const arrowDefs = (id) =>
  `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">` +
  `<path d="M0,0 L10,5 L0,10 z" style="fill:${C.muted}"/></marker></defs>`;

export const line = (x1, y1, x2, y2, { arrow = null, color = C.muted, width = 1.25 } = {}) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${width}" style="stroke:${color}"${arrow ? ` marker-end="url(#${arrow})"` : ''}/>`;

export const svg = (width, height, label, parts) =>
  `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ` +
  `style="display:block;margin:0 auto;max-width:min(100%,420px);height:auto;font-family:var(--font,sans-serif)" ` +
  `role="img" aria-label="${esc(label)}">${parts.join('')}</svg>`;

// ---- linked lists (shared by singly_linked_list.js and doubly_linked_list.js) ---------------

const LIST_ARGS = { append: 1, prepend: 1, insert_after: 2, remove: 1, search: 1 };

const listSnapshot = (nodes) => ({
  nodes: nodes.slice(),
  head: nodes.length ? 0 : null,
  tail: nodes.length ? nodes.length - 1 : null,
});

const valid = (nodes, idxs) => idxs.filter((i) => i >= 0 && i < nodes.length);

export function listRun(initial, ops) {
  const nodes = (initial || []).map(num);
  const steps = [step(listSnapshot(nodes), [], 'initial', { values: nodes.slice() })];
  const push = (action, highlights, detail) => steps.push(step(listSnapshot(nodes), highlights, action, detail));

  for (const { op, args = [] } of ops || []) {
    if (!(op in LIST_ARGS)) {
      steps.push(errorStep(listSnapshot(nodes), op, args, `unknown operation "${op}" for a linked list`));
      continue;
    }
    const bad = argError(op, args, LIST_ARGS[op]);
    if (bad) {
      steps.push(errorStep(listSnapshot(nodes), op, args, bad));
      continue;
    }
    if (op === 'insert_after') {
      const after = num(args[0]);
      const value = num(args[1]);
      const at = nodes.indexOf(after);
      if (at === -1) {
        push(op, [], { after, value, index: null, new_tail: false, found: false });
        continue;
      }
      const index = at + 1;
      nodes.splice(index, 0, value);
      push(op, [at, index], { after, value, index, new_tail: index === nodes.length - 1 });
    } else if (op === 'append') {
      const value = num(args[0]);
      nodes.push(value);
      const index = nodes.length - 1;
      push(op, valid(nodes, [index - 1, index]), { value, index, new_tail: true });
    } else if (op === 'prepend') {
      const value = num(args[0]);
      nodes.unshift(value);
      push(op, valid(nodes, [0, 1]), { value, index: 0, new_head: true });
    } else if (op === 'remove') {
      const value = num(args[0]);
      const index = nodes.indexOf(value);
      if (index === -1) {
        push(op, [], { value, index: null, found: false });
        continue;
      }
      const wasTail = index === nodes.length - 1;
      nodes.splice(index, 1);
      // Highlight the neighbors that were relinked to each other.
      push(op, valid(nodes, [index - 1, index]), { value, index, found: true, new_head: index === 0, new_tail: wasTail });
    } else if (op === 'search') {
      // One step per node visited, head to tail.
      const target = num(args[0]);
      let found = false;
      for (let i = 0; i < nodes.length && !found; i++) {
        found = nodes[i] === target;
        push(op, [i], { target, current: nodes[i], index: i, found });
      }
      if (!found) push(op, [], { target, current: null, index: null, found: false });
    }
  }
  return steps;
}

// "After this insert, what is node X's next?" for each successful insert_after.
export function listQuestions(steps) {
  const qs = [];
  steps.forEach((s, i) => {
    if (s.action !== 'insert_after' || s.detail.index === null) return;
    const { nodes } = s.state;
    const { after, value, index } = s.detail;
    const next = index + 1 < nodes.length ? String(nodes[index + 1]) : 'null';
    // Distractors: the node it was inserted after (next vs prev mix-up), null, head, tail.
    const pool = [next, String(after), 'null', String(nodes[0]), String(nodes[nodes.length - 1])];
    const choices = sortChoices([...new Set(pool)].filter((c) => c !== String(value)).slice(0, 4));
    if (choices.length < 2) return;
    qs.push({ stepIndex: i, prompt: `After this insert, what is node ${value}'s next?`, choices, answer: next });
  });
  return onePerStep(qs);
}
