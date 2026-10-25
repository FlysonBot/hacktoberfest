// Doubly linked list visualization: run / render / questions (CLAUDE.md contract 4).
// JS decides every step and every answer; Gemma only writes captions.
import { listRun, listQuestions, C, SMALL, PILL_H, text, box, pill, arrowDefs, line, svg } from './_shared.js';

export const run = listRun;
export const questions = listQuestions;

// Nodes are 48px (not 64) so 6 nodes plus arrows still fit near 420px; long values widen their node.
const BOX_H = 36, MIN_W = 48, GAP = 18, PAD = 6;
const NULL_ZONE = 34; // stub arrow + "null" at each end
const TOP = PAD + PILL_H + 6; // y of the node row (room for head/tail pills)
const ARROW = 'dll-arrow';

export const nodeW = (v) => Math.max(MIN_W, String(v).length * 11 + 16);

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
  const parts = [arrowDefs(ARROW)];

  if (!nodes.length) {
    parts.push(text(width / 2, midY, 'empty list (head = tail = null)', { size: SMALL + 1, color: C.muted }));
  } else {
    // head.prev -> null (left) and tail.next -> null (right).
    const right = xs.at(-1) + widths.at(-1);
    parts.push(
      line(xs[0], midY + 5, xs[0] - 12, midY + 5, { arrow: ARROW }),
      text(xs[0] - 15, midY + 5, 'null', { size: SMALL - 1, color: C.muted, anchor: 'end' }),
      line(right, midY - 5, right + 12, midY - 5, { arrow: ARROW }),
      text(right + 15, midY - 5, 'null', { size: SMALL - 1, color: C.muted, anchor: 'start' })
    );
  }

  nodes.forEach((value, i) => {
    parts.push(box(xs[i], TOP, value, { w: widths[i], on: hl.has(i) }));
    if (i < nodes.length - 1) {
      // next (upper, →) and prev (lower, ←) pointers.
      const a = xs[i] + widths[i], b = xs[i + 1];
      parts.push(line(a + 1, midY - 5, b - 1, midY - 5, { arrow: ARROW }), line(b - 1, midY + 5, a + 1, midY + 5, { arrow: ARROW }));
    }
    const tag = [i === head && 'head', i === tail && 'tail'].filter(Boolean).join(' · ');
    if (tag) parts.push(pill(xs[i] + widths[i] / 2, PAD, tag));
  });

  container.innerHTML = svg(width, height, `Doubly linked list: ${nodes.join(' <-> ') || 'empty'}`, parts);
}
