// Singly linked list visualization: run / render / questions (CLAUDE.md contract 4).
// Same operations as the doubly linked list (shared logic); drawn with next pointers only.
import { listRun, listQuestions, C, SMALL, PILL_H, text, box, pill, arrowDefs, line, svg } from './_shared.js';
import { nodeW } from './doubly_linked_list.js';

export const run = listRun;
export const questions = listQuestions;

const BOX_H = 36, GAP = 18, PAD = 6;
const NULL_ZONE = 34; // stub arrow + "null" after the tail
const TOP = PAD + PILL_H + 6;
const ARROW = 'sll-arrow';

export function render(container, step) {
  const { nodes, head, tail } = step.state;
  const hl = new Set(step.highlights);
  const widths = nodes.map(nodeW);
  const xs = [];
  let x = PAD + 18; // room for a "head · tail" pill wider than a one-node list
  for (const w of widths) {
    xs.push(x);
    x += w + GAP;
  }
  const width = nodes.length ? x - GAP + NULL_ZONE + PAD : 240;
  const height = TOP + BOX_H + PAD;
  const midY = TOP + BOX_H / 2;
  const parts = [arrowDefs(ARROW)];

  if (!nodes.length) {
    parts.push(text(width / 2, midY, 'empty list (head = tail = null)', { size: SMALL + 1, color: C.muted }));
  } else {
    const right = xs.at(-1) + widths.at(-1);
    parts.push(
      line(right, midY, right + 12, midY, { arrow: ARROW }),
      text(right + 15, midY, 'null', { size: SMALL - 1, color: C.muted, anchor: 'start' })
    );
  }

  nodes.forEach((value, i) => {
    parts.push(box(xs[i], TOP, value, { w: widths[i], on: hl.has(i) }));
    if (i < nodes.length - 1) parts.push(line(xs[i] + widths[i] + 1, midY, xs[i + 1] - 1, midY, { arrow: ARROW }));
    const tag = [i === head && 'head', i === tail && 'tail'].filter(Boolean).join(' · ');
    if (tag) parts.push(pill(xs[i] + widths[i] / 2, PAD, tag));
  });

  container.innerHTML = svg(width, height, `Singly linked list: ${nodes.join(' -> ') || 'empty'}`, parts);
}
