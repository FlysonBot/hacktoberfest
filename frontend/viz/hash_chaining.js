// Hash table with chaining: run / render / questions (CLAUDE.md contract 4).
// initial[0] = table size, rest = keys already in the table; hash = key % size.
// JS decides every step and every answer; Gemma only writes captions.
import { num, step, errorStep, argError, sortChoices, onePerStep, C, SMALL, PILL_H, STROKE, U, esc, fitFont, text, pill, pillW, arrowDefs, line, svg } from './_shared.js';
import { parseTable, hashOf } from './hash_linear_probing.js';

const ARGS = { insert: 1, search: 1, remove: 1 };

export function run(initial, ops) {
  const { size, keys, error } = parseTable(initial);
  const buckets = Array.from({ length: size }, () => []);
  const snapshot = () => ({ size, buckets: buckets.map((c) => c.slice()) });
  for (const k of keys) {
    const chain = buckets[hashOf(k, size)];
    if (!chain.includes(k)) chain.push(k);
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
    const chain = buckets[hash];

    if (op === 'insert') {
      const at = chain.indexOf(k);
      if (at !== -1) {
        push(op, [hash], { key: k, hash, position: at, duplicate: true });
        continue;
      }
      chain.push(k); // append to the end of the bucket's list
      push(op, [hash], { key: k, hash, position: chain.length - 1, chain_length: chain.length });
      continue;
    }

    // search / remove: one step per chain node visited.
    let found = false;
    for (let p = 0; p < chain.length && !found; p++) {
      found = chain[p] === k;
      push(op, [hash], { key: k, hash, position: p, current: chain[p], found });
      if (found && op === 'remove') {
        chain.splice(p, 1);
        push(op, [hash], { key: k, hash, position: p, removed: true });
      }
    }
    if (!found) push(op, [hash], { key: k, hash, position: null, current: null, found: false });
  }
  return steps;
}

// "Which bucket's chain does X go into?" asked on the step before each insert.
export function questions(steps) {
  const qs = [];
  steps.forEach((s, i) => {
    if (s.action !== 'insert' || s.detail.duplicate || i === 0) return;
    const { key, hash } = s.detail;
    const size = s.state.size;
    const choices = sortChoices([...new Set([hash, (hash + 1) % size, (hash - 1 + size) % size, (key % 10) % size].map(String))]);
    if (choices.length < 2) return;
    qs.push({ stepIndex: i - 1, prompt: `Which bucket's chain does ${key} go into?`, choices, answer: String(hash) });
  });
  return onePerStep(qs);
}

const COL_W = 40 * U, GAP = 6 * U, PAD = 8 * U, NODE_H = 32 * U, LINK = 14 * U, CELL_H = 18 * U;
const IDX_Y = PAD + PILL_H + 10 * U; // bucket index labels
const CELL_Y = IDX_Y + SMALL * 0.6 + 4 * U; // bucket cells
const ARROW = 'chain-arrow';

export function render(container, s) {
  const { size, buckets } = s.state;
  const d = s.detail || {};
  const hb = s.highlights.length ? s.highlights[0] : null;
  // Node being acted on: the visited/inserted one (not after a removal, when it's gone).
  const curPos = hb !== null && !d.removed && Number.isInteger(d.position) ? d.position : null;
  const xOf = (i) => PAD + i * (COL_W + GAP);
  const longest = Math.max(1, ...buckets.map((c) => c.length));
  const nodeY = (p) => CELL_Y + CELL_H + LINK + p * (NODE_H + LINK);
  const width = Math.max(xOf(Math.max(size, 1)) - GAP + PAD, 260);
  const height = nodeY(longest - 1) + NODE_H + PAD;
  const parts = [arrowDefs(ARROW)];

  if (!size) parts.push(text(width / 2, CELL_Y + 20, 'no table (invalid size)', { size: SMALL + 1, color: C.muted }));

  buckets.forEach((chain, i) => {
    const x = xOf(i), cx = x + COL_W / 2;
    const on = i === hb;
    parts.push(
      text(cx, IDX_Y, String(i), { size: SMALL - 1, color: on ? C.tagText : C.muted, weight: on ? 600 : 400 }),
      `<rect x="${x}" y="${CELL_Y}" width="${COL_W}" height="${CELL_H}" rx="${4 * U}" stroke-width="${STROKE}" style="fill:${on ? C.hiFill : C.box};stroke:${on ? C.hiLine : C.line}"/>`
    );
    chain.forEach((v, p) => {
      const y = nodeY(p);
      const isCur = on && p === curPos;
      parts.push(
        line(cx, y - LINK + 1, cx, y - 1, { arrow: ARROW }),
        `<rect x="${x}" y="${y}" width="${COL_W}" height="${NODE_H}" rx="${6 * U}" stroke-width="${isCur ? STROKE + 0.5 : STROKE}" style="fill:${isCur ? C.strong : C.box};stroke:${isCur || on ? C.hiLine : C.line}"/>`,
        text(cx, y + NODE_H / 2, esc(v), { size: fitFont(v, COL_W), weight: 500 })
      );
    });
  });

  if (hb !== null && d.key !== undefined) {
    const label = `${s.action} ${d.key}`;
    const w = pillW(label);
    const cx = Math.min(Math.max(xOf(hb) + COL_W / 2, PAD + w / 2), width - PAD - w / 2);
    parts.push(pill(cx, PAD, label));
  }

  container.innerHTML = svg(width, height, `Hash table (chaining), size ${size}: ${buckets.map((c, i) => `${i}: [${c.join(', ')}]`).join('; ')}`, parts);
}
