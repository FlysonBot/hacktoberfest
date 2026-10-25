// Stack visualization: run / render / questions (CLAUDE.md contract 4).
// JS decides every step and every answer; Gemma only writes captions.

const num = (s) => (s !== '' && !isNaN(Number(s)) ? Number(s) : String(s));

function snapshot(items) {
  return { items: items.slice(), top: items.length ? items.length - 1 : null };
}

export function run(initial, ops) {
  const items = (initial || []).map(num);
  const steps = [
    { state: snapshot(items), highlights: [], action: 'initial', detail: { values: items.slice() }, caption: '' },
  ];

  for (const { op, args = [] } of ops || []) {
    let highlights = [];
    let detail;
    if (op === 'push') {
      const value = num(args[0]);
      items.push(value);
      highlights = [items.length - 1];
      detail = { value, size: items.length };
    } else if (op === 'pop') {
      if (!items.length) {
        detail = { value: null, size: 0, empty: true };
      } else {
        const value = items.pop();
        highlights = items.length ? [items.length - 1] : [];
        detail = { value, size: items.length, new_top: items.length ? items[items.length - 1] : null };
      }
    } else if (op === 'peek') {
      highlights = items.length ? [items.length - 1] : [];
      detail = items.length ? { value: items[items.length - 1], size: items.length } : { value: null, size: 0, empty: true };
    } else {
      throw new Error(`stack: unknown op "${op}"`);
    }
    steps.push({ state: snapshot(items), highlights, action: op, detail, caption: '' });
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
    if (i === 0 || step.detail.empty) return;
    const before = steps[i - 1].state.items;
    const choices = sortChoices([...new Set(before.map(String))]);
    if (choices.length < 2) return;
    if (step.action === 'pop') {
      qs.push({ stepIndex: i, prompt: 'Which value does Pop remove?', choices, answer: String(step.detail.value) });
    } else if (step.action === 'peek') {
      qs.push({ stepIndex: i, prompt: 'Which value does Peek return?', choices, answer: String(step.detail.value) });
    }
  });
  return qs;
}

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Compact, zyBooks-like sizing (px at 1:1; the SVG only ever shrinks, capped at 420px wide).
const BOX_W = 64, BOX_H = 36, GAP = 6, PAD = 10, FONT = 18, SMALL = 11;
const TAG_W = 34, TAG_H = 18; // "top" pill
const LEFT = PAD + TAG_W + 8; // x of the stack column
const RIGHT = LEFT + BOX_W + 28; // x of the popped column
const WIDTH = RIGHT + BOX_W + PAD;

const C = {
  text: 'var(--text,#1D1D1F)',
  muted: 'var(--text-3,#6B6965)',
  box: 'var(--surface,#FFFFFF)',
  line: 'var(--line-strong,#C9C6BF)',
  hiFill: 'var(--accent-tint,#F1EBFF)',
  hiLine: 'var(--accent-strong,#7B5CE6)',
  tagText: 'var(--accent-text,#5B3CC4)',
};

const box = (x, y, value, on) =>
  `<rect x="${x}" y="${y}" width="${BOX_W}" height="${BOX_H}" rx="6" stroke-width="1.5" style="fill:${on ? C.hiFill : C.box};stroke:${on ? C.hiLine : C.line}"/>` +
  `<text x="${x + BOX_W / 2}" y="${y + BOX_H / 2}" text-anchor="middle" dominant-baseline="central" font-size="${FONT}" font-weight="500" style="fill:${C.text}">${esc(value)}</text>`;

export function render(container, step) {
  const { items, top } = step.state;
  const hl = new Set(step.highlights);
  const popped = step.action === 'pop' && !step.detail.empty ? step.detail.value : null;

  // The popped value sits to the right, at the slot it was popped from (one above the new top).
  const rows = Math.max(items.length + (popped !== null ? 1 : 0), 1);
  const height = PAD + SMALL + 6 + rows * (BOX_H + GAP) + 18 + PAD;
  const baseY = height - PAD - 18; // y of the base line
  const rowY = (i) => baseY - GAP - (i + 1) * BOX_H - i * GAP;
  const parts = [];

  parts.push(
    `<line x1="${LEFT - 8}" y1="${baseY}" x2="${LEFT + BOX_W + 8}" y2="${baseY}" stroke-width="1.5" style="stroke:${C.muted}"/>`,
    `<text x="${LEFT + BOX_W / 2}" y="${baseY + 13}" text-anchor="middle" font-size="${SMALL}" style="fill:${C.muted}">bottom</text>`
  );

  items.forEach((value, i) => {
    parts.push(box(LEFT, rowY(i), value, hl.has(i)));
    if (i === top) {
      const y = rowY(i) + (BOX_H - TAG_H) / 2;
      parts.push(
        `<rect x="${PAD}" y="${y}" width="${TAG_W}" height="${TAG_H}" rx="${TAG_H / 2}" style="fill:${C.hiFill};stroke:${C.hiLine}" stroke-width="1"/>`,
        `<text x="${PAD + TAG_W / 2}" y="${y + TAG_H / 2}" text-anchor="middle" dominant-baseline="central" font-size="${SMALL}" font-weight="600" style="fill:${C.tagText}">top</text>`
      );
    }
  });

  if (!items.length) {
    parts.push(
      `<text x="${LEFT + BOX_W / 2}" y="${rowY(0) + BOX_H / 2}" text-anchor="middle" dominant-baseline="central" font-size="${SMALL + 1}" style="fill:${C.muted}">empty</text>`
    );
  }

  if (popped !== null) {
    const y = rowY(items.length);
    parts.push(
      `<g opacity="0.5">` +
        `<rect x="${RIGHT}" y="${y}" width="${BOX_W}" height="${BOX_H}" rx="6" stroke-width="1.5" stroke-dasharray="4 3" style="fill:${C.box};stroke:${C.line}"/>` +
        `<text x="${RIGHT + BOX_W / 2}" y="${y + BOX_H / 2}" text-anchor="middle" dominant-baseline="central" font-size="${FONT}" style="fill:${C.text}">${esc(popped)}</text>` +
        `</g>`,
      `<text x="${RIGHT + BOX_W / 2}" y="${y - 5}" text-anchor="middle" font-size="${SMALL}" style="fill:${C.muted}">popped</text>`
    );
  }

  container.innerHTML =
    `<svg viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" ` +
    `style="display:block;margin:0 auto;max-width:min(100%,420px);height:auto;font-family:var(--font,sans-serif)" ` +
    `role="img" aria-label="Stack: ${esc(items.join(', ') || 'empty')}">${parts.join('')}</svg>`;
}
