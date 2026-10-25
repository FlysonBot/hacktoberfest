// Builds the "Here's what I read: ..." line shown above the animation, so a
// student can spot a misread screenshot/question before trusting the steps.
// Generic by design: it only echoes structure/initial/ops, never anything
// structure-specific.

export function formatPlanSummary({ structure, initial, ops }) {
  const label = String(structure ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const startPart = Array.isArray(initial) && initial.length ? `start with ${initial.join(', ')}` : 'start empty';

  const opsPart = Array.isArray(ops) && ops.length
    ? ops.map((o) => [o.op, ...(o.args || [])].join(' ')).join(', ')
    : '';

  const parts = [label, startPart];
  if (opsPart) parts.push(opsPart);

  return `Here's what I read: ${parts.join(' · ')}`;
}
