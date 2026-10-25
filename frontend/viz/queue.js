// Queue visualization: run / render / questions (CLAUDE.md contract 4).
// JS decides every step and every answer; Gemma only writes captions.
import { num, step, errorStep, argError, sortChoices, onePerStep, C, BOX_W, BOX_H, GAP, SMALL, PILL_H, text, box, pill, svg } from './_shared.js';

const ARGS = { enqueue: 1, dequeue: 0, peek: 0 };

// items run front -> back.
function snapshot(items) {
  return { items: items.slice(), front: items.length ? 0 : null, back: items.length ? items.length - 1 : null };
}

export function run(initial, ops) {
  const items = (initial || []).map(num);
  const steps = [step(snapshot(items), [], 'initial', { values: items.slice() })];

  for (const { op, args = [] } of ops || []) {
    if (!(op in ARGS)) {
      steps.push(errorStep(snapshot(items), op, args, `unknown operation "${op}" for a queue`));
      continue;
    }
    const bad = argError(op, args, ARGS[op]);
    if (bad) {
      steps.push(errorStep(snapshot(items), op, args, bad));
      continue;
    }
    let highlights = [];
    let detail;
    if (op === 'enqueue') {
      const value = num(args[0]);
      items.push(value);
      highlights = [items.length - 1];
      detail = { value, size: items.length };
    } else if (!items.length) {
      detail = { value: null, size: 0, empty: true };
    } else if (op === 'dequeue') {
      const value = items.shift();
      highlights = items.length ? [0] : [];
      detail = { value, size: items.length, new_front: items.length ? items[0] : null };
    } else {
      highlights = [0];
      detail = { value: items[0], size: items.length };
    }
    steps.push(step(snapshot(items), highlights, op, detail));
  }
  return steps;
}

// Choices are strings and `answer` is the correct choice's string (not an index).
export function questions(steps) {
  const qs = [];
  steps.forEach((s, i) => {
    if (i === 0 || s.detail.empty || (s.action !== 'dequeue' && s.action !== 'peek')) return;
    const choices = sortChoices([...new Set(steps[i - 1].state.items.map(String))]);
    if (choices.length < 2) return;
    const prompt = s.action === 'dequeue' ? 'Which value does dequeue remove?' : 'Which value does peek return?';
    qs.push({ stepIndex: i, prompt, choices, answer: String(s.detail.value) });
  });
  return onePerStep(qs);
}

const PAD = 10;
const GHOST_X = PAD; // dequeued value, faded, to the left of the front
const LEFT = GHOST_X + BOX_W + 24; // x of the front item
const ROW_Y = PAD + PILL_H + 8;

export function render(container, s) {
  const { items, front, back } = s.state;
  const hl = new Set(s.highlights);
  const dequeued = s.action === 'dequeue' && !s.detail.empty ? s.detail.value : null;
  const xOf = (i) => LEFT + i * (BOX_W + GAP);
  const width = Math.max(xOf(Math.max(items.length, 1)) - GAP + PAD, LEFT + BOX_W * 2 + PAD);
  const height = ROW_Y + BOX_H + PAD;
  const parts = [];

  items.forEach((value, i) => {
    parts.push(box(xOf(i), ROW_Y, value, { on: hl.has(i) }));
    const tag = [i === front && 'front', i === back && 'back'].filter(Boolean).join(' · ');
    if (tag) parts.push(pill(xOf(i) + BOX_W / 2, PAD, tag));
  });

  if (!items.length) parts.push(text(LEFT + BOX_W / 2, ROW_Y + BOX_H / 2, 'empty', { size: SMALL + 1, color: C.muted }));

  if (dequeued !== null) {
    parts.push(
      box(GHOST_X, ROW_Y, dequeued, { ghost: true }),
      text(GHOST_X + BOX_W / 2, PAD + PILL_H / 2, 'dequeued', { size: SMALL, color: C.muted })
    );
  }

  container.innerHTML = svg(width, height, `Queue (front to back): ${items.join(', ') || 'empty'}`, parts);
}
