// Hash table with linear probing: run / render / questions (CLAUDE.md contract 4).
// initial[0] = table size, rest = keys already in the table; hash = key % size.
// JS decides every step and every answer; Gemma only writes captions.
import { num, step, errorStep, argError, sortChoices, onePerStep, C, BOX_H, SMALL, PILL_H, STROKE, U, esc, fitFont, text, pill, pillW, svg } from './_shared.js';

const ARGS = { insert: 1, search: 1, remove: 1 };
export const DELETED = 'DELETED'; // tombstone: empty-after-removal

// Shared by both hash modules: parses initial into { size, keys } or { error }.
export function parseTable(initial) {
  const size = num((initial || [])[0]);
  if (!Number.isInteger(size) || size <= 0) return { size: 0, keys: [], error: `table size must be a positive integer, got "${(initial || [])[0] ?? ''}"` };
  const keys = (initial || []).slice(1).map(num).filter((k) => Number.isInteger(k));
  return { size, keys };
}

export const hashOf = (k, size) => ((k % size) + size) % size;

export function run(initial, ops) {
  const { size, keys, error } = parseTable(initial);
  const buckets = new Array(size).fill(null);
  const snapshot = () => ({ size, buckets: buckets.slice() });
  for (const k of keys) {
    for (let i = 0; i < size; i++) {
      const j = (hashOf(k, size) + i) % size;
      if (buckets[j] === null || buckets[j] === DELETED) {
        buckets[j] = k;
        break;
      }
    }
  }
  const steps = [step(snapshot(), [], 'initial', error ? { size, keys, error } : { size, keys })];
  const push = (action, highlights, detail) => steps.push(step(snapshot(), highlights, action, detail));

  for (const { op, args = [] } of ops || []) {
    if (!(op in ARGS)) {
      steps.push(errorStep(snapshot(), op, args, `unknown operation "${op}" for a hash table`));
      continue;
    }
    const k = num(args[0]);
    const bad = error || argError(op, args, ARGS[op]) || (Number.isInteger(k) ? null : `keys must be integers, got "${args[0]}"`);
    if (bad) {
      steps.push(errorStep(snapshot(), op, args, bad));
      continue;
    }
    const hash = hashOf(k, size);
    const probes = [];
    let done = false;
    for (let i = 0; i < size && !done; i++) {
      const j = (hash + i) % size;
      probes.push(j);
      const cell = buckets[j];
      const base = { key: k, hash, probes: probes.slice() };
      if (op === 'insert') {
        if (cell === k) {
          push(op, [j], { ...base, placed: j, duplicate: true });
          done = true;
        } else if (cell === null || cell === DELETED) {
          buckets[j] = k;
          push(op, [j], { ...base, placed: j });
          done = true;
        } else {
          push(op, [j], { ...base, placed: null, occupied_by: cell });
        }
      } else if (cell === k) {
        if (op === 'remove') buckets[j] = DELETED;
        push(op, [j], op === 'remove' ? { ...base, found: true, index: j, removed: true } : { ...base, found: true, index: j });
        done = true;
      } else if (cell === null) {
        push(op, [j], { ...base, found: false, index: null, stopped: 'empty' });
        done = true;
      } else {
        push(op, [j], { ...base, found: null, index: null, skipped: cell === DELETED ? 'deleted' : cell });
      }
    }
    if (!done) {
      // Probed every bucket.
      push(op, [], op === 'insert'
        ? { key: k, hash, probes: probes.slice(), placed: null, full: true }
        : { key: k, hash, probes: probes.slice(), found: false, index: null, stopped: 'full' });
    }
  }
  return steps;
}

// "Which bucket does X end up in?" asked on the step before each insert starts.
export function questions(steps) {
  const qs = [];
  steps.forEach((s, i) => {
    if (s.action !== 'insert' || s.detail.probes.length !== 1 || i === 0) return; // first probe of an insert
    let end = i;
    while (end + 1 < steps.length && steps[end + 1].action === 'insert' && steps[end + 1].detail.key === s.detail.key && steps[end].detail.placed === null && !steps[end].detail.full) end++;
    const { placed, hash, key } = steps[end].detail;
    if (placed === null || placed === undefined || steps[end].detail.duplicate) return;
    const size = s.state.size;
    const choices = sortChoices([...new Set([hash, (hash + 1) % size, (hash + 2) % size, placed].map(String))]);
    if (choices.length < 2) return;
    qs.push({ stepIndex: i - 1, prompt: `Which bucket does ${key} end up in?`, choices, answer: String(placed) });
  });
  return onePerStep(qs);
}

const CELL_W = 40 * U, CELL_H = BOX_H, GAP = 4 * U, PAD = 8 * U, TOP = PAD + PILL_H + 8 * U;
const IDX = SMALL + 6 * U; // room for the index labels under the buckets

export function render(container, s) {
  const { size, buckets } = s.state;
  const d = s.detail || {};
  const probes = new Set(d.probes || []);
  const current = s.highlights.length ? s.highlights[0] : null;
  const xOf = (i) => PAD + i * (CELL_W + GAP);
  const width = Math.max(xOf(Math.max(size, 1)) - GAP + PAD, 260);
  const height = TOP + CELL_H + IDX + PAD;
  const parts = [];

  if (!size) parts.push(text(width / 2, TOP + CELL_H / 2, 'no table (invalid size)', { size: SMALL + 1, color: C.muted }));

  buckets.forEach((v, i) => {
    const x = xOf(i);
    const isCur = i === current, on = probes.has(i);
    const tomb = v === DELETED;
    parts.push(
      `<rect x="${x}" y="${TOP}" width="${CELL_W}" height="${CELL_H}" rx="${6 * U}" stroke-width="${isCur ? STROKE + 0.5 : STROKE}"${tomb ? ' stroke-dasharray="4 4"' : ''} ` +
        `style="fill:${isCur ? C.strong : on ? C.hiFill : C.box};stroke:${isCur || on ? C.hiLine : C.line}"/>`,
      text(x + CELL_W / 2, TOP + CELL_H + IDX / 2 + 2, String(i), { size: SMALL - 1, color: C.muted })
    );
    if (tomb) parts.push(text(x + CELL_W / 2, TOP + CELL_H / 2, 'del', { size: SMALL, color: C.muted }));
    else if (v !== null) parts.push(text(x + CELL_W / 2, TOP + CELL_H / 2, esc(v), { size: fitFont(v, CELL_W), weight: 500 }));
  });

  // Pill above the bucket being probed, e.g. "insert 35".
  if (current !== null && d.key !== undefined) {
    const label = `${s.action} ${d.key}`;
    const w = pillW(label);
    const cx = Math.min(Math.max(xOf(current) + CELL_W / 2, PAD + w / 2), width - PAD - w / 2);
    parts.push(pill(cx, PAD, label));
  }

  container.innerHTML = svg(width, height, `Hash table (linear probing), size ${size}: ${buckets.map((v) => v ?? '_').join(', ')}`, parts);
}
