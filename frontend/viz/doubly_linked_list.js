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

const BOX_W = 96, BOX_H = 64, GAP = 72, PAD = 24, NULL_W = 64, FONT = 28;

export function render(container, step) {
  const { nodes, head, tail } = step.state;
  const hl = new Set(step.highlights);
  const top = PAD + 44; // room for head/tail labels
  const width = PAD * 2 + NULL_W * 2 + Math.max(nodes.length, 1) * BOX_W + Math.max(nodes.length - 1, 0) * GAP + 32;
  const height = top + BOX_H + PAD + 10;
  const x0 = PAD + NULL_W + 16;
  const xOf = (i) => x0 + i * (BOX_W + GAP);
  const midY = top + BOX_H / 2;
  const parts = [
    `<defs><marker id="dll-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
      `<path d="M0,0 L10,5 L0,10 z" style="fill:var(--text,#1D1D1F)"/></marker></defs>`,
  ];
  const label = (x, y, text, size, color, anchor = 'middle', weight = 400) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="central" font-size="${size}" font-weight="${weight}" style="fill:${color}">${text}</text>`;

  if (!nodes.length) {
    parts.push(label(width / 2, midY, '(empty list: head = tail = null)', FONT * 0.75, 'var(--text-secondary,#6E6E73)'));
  } else {
    parts.push(label(PAD + NULL_W / 2, midY, 'null', FONT * 0.65, 'var(--text-secondary,#6E6E73)'));
    parts.push(label(xOf(nodes.length - 1) + BOX_W + 16 + NULL_W / 2, midY, 'null', FONT * 0.65, 'var(--text-secondary,#6E6E73)'));
    // prev pointer of head and next pointer of tail point at null.
    parts.push(`<line x1="${x0}" y1="${midY + 12}" x2="${PAD + NULL_W - 4}" y2="${midY + 12}" stroke-width="2.5" style="stroke:var(--text,#1D1D1F)" marker-end="url(#dll-arrow)"/>`);
    const xt = xOf(nodes.length - 1) + BOX_W;
    parts.push(`<line x1="${xt}" y1="${midY - 12}" x2="${xt + 12}" y2="${midY - 12}" stroke-width="2.5" style="stroke:var(--text,#1D1D1F)" marker-end="url(#dll-arrow)"/>`);
  }

  nodes.forEach((value, i) => {
    const x = xOf(i);
    const on = hl.has(i);
    parts.push(
      `<rect x="${x}" y="${top}" width="${BOX_W}" height="${BOX_H}" rx="8" stroke-width="3" ` +
        `style="fill:${on ? 'var(--accent,#C4B1FF)' : 'var(--surface,#FFFFFF)'};stroke:${on ? 'var(--accent-strong,#7B5CE6)' : 'var(--line-strong,#C9C6BF)'}"/>`,
      label(x + BOX_W / 2, midY, esc(value), FONT, 'var(--text,#1D1D1F)', 'middle', 600)
    );
    if (i < nodes.length - 1) {
      // next (top, →) and prev (bottom, ←) pointers.
      const a = x + BOX_W, b = xOf(i + 1);
      parts.push(
        `<line x1="${a}" y1="${midY - 12}" x2="${b - 2}" y2="${midY - 12}" stroke-width="2.5" style="stroke:var(--text,#1D1D1F)" marker-end="url(#dll-arrow)"/>`,
        `<line x1="${b}" y1="${midY + 12}" x2="${a + 2}" y2="${midY + 12}" stroke-width="2.5" style="stroke:var(--text,#1D1D1F)" marker-end="url(#dll-arrow)"/>`
      );
    }
    const tags = [i === head && 'head', i === tail && 'tail'].filter(Boolean).join(' / ');
    if (tags) parts.push(label(x + BOX_W / 2, top - 22, tags, FONT * 0.7, 'var(--accent-text,#5B3CC4)', 'middle', 700));
  });

  container.innerHTML =
    `<svg viewBox="0 0 ${width} ${height}" width="100%" style="max-height:70vh;font-family:var(--font,sans-serif)" ` +
    `role="img" aria-label="Doubly linked list: ${esc(nodes.join(' <-> ') || 'empty')}">${parts.join('')}</svg>`;
}
