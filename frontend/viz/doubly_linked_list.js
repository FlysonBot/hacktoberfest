// Doubly linked list visualization: run / render / questions (CLAUDE.md contract 4).
// JS decides every step and every answer; Gemma only writes captions.

const num = (s) => (s !== '' && !isNaN(Number(s)) ? Number(s) : String(s));

function snapshot(nodes) {
  return { nodes: nodes.slice(), head: nodes.length ? 0 : null, tail: nodes.length ? nodes.length - 1 : null };
}

const valid = (nodes, idxs) => idxs.filter((i) => i >= 0 && i < nodes.length);

export function run(initial, ops) {
  const nodes = (initial || []).map(num);
  const steps = [
    { state: snapshot(nodes), highlights: [], action: 'initial', detail: { values: nodes.slice() }, caption: '' },
  ];
  const push = (action, highlights, detail) =>
    steps.push({ state: snapshot(nodes), highlights, action, detail, caption: '' });

  for (const { op, args = [] } of ops || []) {
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
    } else {
      throw new Error(`doubly_linked_list: unknown op "${op}"`);
    }
  }
  return steps;
}

// Numbers ascending, words after, so the answer's position gives nothing away.
const sortChoices = (cs) =>
  cs.sort((a, b) => (isNaN(a) || isNaN(b) ? (isNaN(a) - isNaN(b)) || a.localeCompare(b) : a - b));

// Choices are strings and `answer` is the correct choice's string (not an index).
export function questions(steps) {
  const qs = [];
  steps.forEach((step, i) => {
    if (step.action !== 'insert_after' || step.detail.index === null) return;
    const { nodes } = step.state;
    const { after, value, index } = step.detail;
    const next = index + 1 < nodes.length ? String(nodes[index + 1]) : 'null';
    // Distractors: the node it was inserted after (next vs prev mix-up), null, head, tail.
    const pool = [next, String(after), 'null', String(nodes[0]), String(nodes[nodes.length - 1])];
    const choices = sortChoices([...new Set(pool)].filter((c) => c !== String(value)).slice(0, 4));
    if (choices.length < 2) return;
    qs.push({ stepIndex: i, prompt: `After this insert, what is node ${value}'s next?`, choices, answer: next });
  });
  return qs;
}

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Compact, zyBooks-like sizing (px at 1:1; the SVG only ever shrinks, capped at 420px wide).
// Nodes are 48px (not 64) so 6 nodes plus arrows still fit near 420px; long values widen their node.
const BOX_H = 36, MIN_W = 48, GAP = 18, PAD = 6, FONT = 18, SMALL = 10;
const NULL_ZONE = 34; // stub arrow + "null" at each end
const TAG_H = 16;
const TOP = PAD + TAG_H + 6; // y of the node row (room for head/tail tags)

const C = {
  text: 'var(--text,#1D1D1F)',
  muted: 'var(--text-3,#6B6965)',
  box: 'var(--surface,#FFFFFF)',
  line: 'var(--line-strong,#C9C6BF)',
  hiFill: 'var(--accent-tint,#F1EBFF)',
  hiLine: 'var(--accent-strong,#7B5CE6)',
  tagText: 'var(--accent-text,#5B3CC4)',
};

const nodeW = (v) => Math.max(MIN_W, String(v).length * 11 + 16);
const text = (x, y, s, size, color, anchor = 'middle', weight = 400) =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="central" font-size="${size}" font-weight="${weight}" style="fill:${color}">${s}</text>`;
const arrow = (x1, y, x2) =>
  `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke-width="1.25" style="stroke:${C.muted}" marker-end="url(#dll-arrow)"/>`;

export function render(container, step) {
  const { nodes, head, tail } = step.state;
  const hl = new Set(step.highlights);
  const widths = nodes.map(nodeW);
  const xs = [];
  let x = PAD + NULL_ZONE;
  for (const w of widths) {
    xs.push(x);
    x += w + GAP;
  }
  const width = nodes.length ? x - GAP + NULL_ZONE + PAD : 240;
  const height = TOP + BOX_H + PAD;
  const midY = TOP + BOX_H / 2;
  const parts = [
    `<defs><marker id="dll-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">` +
      `<path d="M0,0 L10,5 L0,10 z" style="fill:${C.muted}"/></marker></defs>`,
  ];

  if (!nodes.length) {
    parts.push(text(width / 2, midY, 'empty list (head = tail = null)', SMALL + 2, C.muted));
  } else {
    // head.prev -> null (left) and tail.next -> null (right).
    const right = xs.at(-1) + widths.at(-1);
    parts.push(
      arrow(xs[0], midY + 5, xs[0] - 12),
      text(xs[0] - 15, midY + 5, 'null', SMALL, C.muted, 'end'),
      arrow(right, midY - 5, right + 12),
      text(right + 15, midY - 5, 'null', SMALL, C.muted, 'start')
    );
  }

  nodes.forEach((value, i) => {
    const on = hl.has(i);
    parts.push(
      `<rect x="${xs[i]}" y="${TOP}" width="${widths[i]}" height="${BOX_H}" rx="6" stroke-width="1.5" style="fill:${on ? C.hiFill : C.box};stroke:${on ? C.hiLine : C.line}"/>`,
      text(xs[i] + widths[i] / 2, midY, esc(value), FONT, C.text, 'middle', 500)
    );
    if (i < nodes.length - 1) {
      // next (upper, →) and prev (lower, ←) pointers.
      const a = xs[i] + widths[i], b = xs[i + 1];
      parts.push(arrow(a + 1, midY - 5, b - 1), arrow(b - 1, midY + 5, a + 1));
    }
    const tag = [i === head && 'head', i === tail && 'tail'].filter(Boolean).join(' · ');
    if (tag) {
      const tw = tag.length * 6 + 12, tx = xs[i] + widths[i] / 2 - tw / 2;
      parts.push(
        `<rect x="${tx}" y="${PAD}" width="${tw}" height="${TAG_H}" rx="${TAG_H / 2}" stroke-width="1" style="fill:${C.hiFill};stroke:${C.hiLine}"/>`,
        text(tx + tw / 2, PAD + TAG_H / 2, tag, SMALL, C.tagText, 'middle', 600)
      );
    }
  });

  container.innerHTML =
    `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ` +
    `style="display:block;margin:0 auto;max-width:min(100%,420px);height:auto;font-family:var(--font,sans-serif)" ` +
    `role="img" aria-label="Doubly linked list: ${esc(nodes.join(' <-> ') || 'empty')}">${parts.join('')}</svg>`;
}
