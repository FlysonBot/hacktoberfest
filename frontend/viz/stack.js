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

const BOX_W = 160, BOX_H = 60, GAP = 6, PAD = 24, LABEL_W = 110, FONT = 28;

export function render(container, step) {
  const { items, top } = step.state;
  const hl = new Set(step.highlights);
  const popped = step.action === 'pop' && !step.detail.empty ? step.detail.value : null;

  const rows = items.length + (popped !== null ? 1 : 0);
  const width = PAD * 2 + LABEL_W + BOX_W;
  const height = PAD * 2 + Math.max(rows, 1) * (BOX_H + GAP) + 40;
  const x = PAD + LABEL_W;
  const baseY = height - PAD - 40; // bottom edge of the stack
  const parts = [];

  // Base line and "bottom" label.
  parts.push(`<line x1="${x - 12}" y1="${baseY + 4}" x2="${x + BOX_W + 12}" y2="${baseY + 4}" style="stroke:var(--text,#1D1D1F)" stroke-width="4"/>`);
  parts.push(`<text x="${x + BOX_W / 2}" y="${baseY + 34}" text-anchor="middle" font-size="${FONT * 0.7}" style="fill:var(--text-secondary,#6E6E73)">bottom</text>`);

  items.forEach((value, i) => {
    const y = baseY - (i + 1) * (BOX_H + GAP);
    const on = hl.has(i);
    parts.push(
      `<rect x="${x}" y="${y}" width="${BOX_W}" height="${BOX_H}" rx="8" stroke-width="3" ` +
        `style="fill:${on ? 'var(--accent,#C4B1FF)' : 'var(--surface,#FFFFFF)'};stroke:${on ? 'var(--accent-strong,#7B5CE6)' : 'var(--line-strong,#C9C6BF)'}"/>`,
      `<text x="${x + BOX_W / 2}" y="${y + BOX_H / 2}" text-anchor="middle" dominant-baseline="central" font-size="${FONT}" font-weight="600" style="fill:var(--text,#1D1D1F)">${esc(value)}</text>`
    );
    if (i === top) {
      parts.push(
        `<text x="${x - 20}" y="${y + BOX_H / 2}" text-anchor="end" dominant-baseline="central" font-size="${FONT * 0.8}" font-weight="700" style="fill:var(--accent-text,#5B3CC4)">top →</text>`
      );
    }
  });

  if (popped !== null) {
    // Ghost box above the stack for the value that was just popped.
    const y = baseY - (items.length + 1) * (BOX_H + GAP);
    parts.push(
      `<rect x="${x}" y="${y}" width="${BOX_W}" height="${BOX_H}" rx="8" stroke-width="3" stroke-dasharray="8 6" style="fill:none;stroke:var(--collision-border,#E8913A)"/>`,
      `<text x="${x + BOX_W / 2}" y="${y + BOX_H / 2}" text-anchor="middle" dominant-baseline="central" font-size="${FONT}" style="fill:var(--collision-text,#A64B00)">${esc(popped)}</text>`,
      `<text x="${x - 20}" y="${y + BOX_H / 2}" text-anchor="end" dominant-baseline="central" font-size="${FONT * 0.7}" style="fill:var(--collision-text,#A64B00)">popped</text>`
    );
  }

  if (!items.length && popped === null) {
    parts.push(
      `<text x="${x + BOX_W / 2}" y="${baseY - BOX_H / 2}" text-anchor="middle" dominant-baseline="central" font-size="${FONT * 0.8}" style="fill:var(--text-secondary,#6E6E73)">(empty)</text>`
    );
  }

  container.innerHTML =
    `<svg viewBox="0 0 ${width} ${height}" width="100%" style="max-height:70vh;font-family:var(--font,sans-serif)" ` +
    `role="img" aria-label="Stack: ${esc(items.join(', ') || 'empty')}">${parts.join('')}</svg>`;
}
