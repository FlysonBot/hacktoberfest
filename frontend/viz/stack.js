// Stack visualization: run / render / questions (CLAUDE.md contract 4).
// JS decides every step and every answer; Gemma only writes captions.
import { num, step, errorStep, argError, sortChoices, onePerStep, C, BOX_W, BOX_H, GAP, SMALL, PILL_H, STROKE, U, text, box, pill, pillW, line, svg } from './_shared.js';

const ARGS = { push: 1, pop: 0, peek: 0 };

function snapshot(items) {
  return { items: items.slice(), top: items.length ? items.length - 1 : null };
}

export function run(initial, ops) {
  const items = (initial || []).map(num);
  const steps = [step(snapshot(items), [], 'initial', { values: items.slice() })];

  for (const { op, args = [] } of ops || []) {
    if (!(op in ARGS)) {
      steps.push(errorStep(snapshot(items), op, args, `unknown operation "${op}" for a stack`));
      continue;
    }
    const bad = argError(op, args, ARGS[op]);
    if (bad) {
      steps.push(errorStep(snapshot(items), op, args, bad));
      continue;
    }
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
    } else {
      highlights = items.length ? [items.length - 1] : [];
      detail = items.length ? { value: items[items.length - 1], size: items.length } : { value: null, size: 0, empty: true };
    }
    steps.push(step(snapshot(items), highlights, op, detail));
  }
  return steps;
}

// Predict-first: asked on the step BEFORE the pop/peek, while the answer isn't shown yet.
// Choices are strings and `answer` is the correct choice's string (not an index).
export function questions(steps) {
  const qs = [];
  steps.forEach((s, i) => {
    if (i === 0 || s.detail.empty || (s.action !== 'pop' && s.action !== 'peek')) return;
    const choices = sortChoices([...new Set(steps[i - 1].state.items.map(String))]);
    if (choices.length < 2) return;
    const prompt = s.action === 'pop' ? 'Which value will Pop remove?' : 'Which value will Peek return?';
    qs.push({ stepIndex: i - 1, prompt, choices, answer: String(s.detail.value) });
  });
  return onePerStep(qs);
}

const PAD = 10 * U, TAG_W = pillW('top');
const LEFT = PAD + TAG_W + 8 * U; // x of the stack column
const RIGHT = LEFT + BOX_W + 28 * U; // x of the popped column
const WIDTH = RIGHT + BOX_W + PAD;
const BASE_LABEL = SMALL + 8 * U; // room under the base line for "bottom"

export function render(container, s) {
  const { items, top } = s.state;
  const hl = new Set(s.highlights);
  const popped = s.action === 'pop' && !s.detail.empty ? s.detail.value : null;

  // The popped value sits to the right, at the slot it was popped from (one above the new top).
  const rows = Math.max(items.length + (popped !== null ? 1 : 0), 1);
  const height = PAD + SMALL + 8 * U + rows * (BOX_H + GAP) + BASE_LABEL + PAD;
  const baseY = height - PAD - BASE_LABEL; // y of the base line
  const rowY = (i) => baseY - GAP - (i + 1) * BOX_H - i * GAP;
  const parts = [
    line(LEFT - 8 * U, baseY, LEFT + BOX_W + 8 * U, baseY, { width: STROKE }),
    text(LEFT + BOX_W / 2, baseY + BASE_LABEL / 2 + 2, 'bottom', { size: SMALL, color: C.muted }),
  ];

  items.forEach((value, i) => {
    parts.push(box(LEFT, rowY(i), value, { on: hl.has(i) }));
    if (i === top) parts.push(pill(PAD + TAG_W / 2, rowY(i) + (BOX_H - PILL_H) / 2, 'top'));
  });

  if (!items.length) parts.push(text(LEFT + BOX_W / 2, rowY(0) + BOX_H / 2, 'empty', { size: SMALL + 1, color: C.muted }));

  if (popped !== null) {
    const y = rowY(items.length);
    parts.push(box(RIGHT, y, popped, { ghost: true }), text(RIGHT + BOX_W / 2, y - SMALL * 0.8, 'popped', { size: SMALL, color: C.muted }));
  }

  container.innerHTML = svg(WIDTH, height, `Stack: ${items.join(', ') || 'empty'}`, parts);
}
