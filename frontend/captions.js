// Builds a readable caption straight from a step's `action`/`detail` fields
// so the lesson is usable the instant steps exist, before /api/captions has
// replied (or if it fails). Generic on purpose: it must work for any topic
// without frontend/viz/* having to know anything about captions.

export function fallbackCaption(step) {
  if (!step) return '';
  const action = step.action ? String(step.action) : 'step';
  const detail = step.detail && typeof step.detail === 'object' ? step.detail : {};
  const parts = Object.entries(detail).map(([key, value]) => {
    const rendered = Array.isArray(value) ? value.join(', ') : value;
    return `${key}: ${rendered}`;
  });
  return parts.length ? `${action} — ${parts.join(', ')}` : action;
}

// "insert_after" -> "Insert after". Used as the small step-tag label and as
// the caption headline before a real caption has arrived.
export function formatActionTitle(action) {
  if (!action) return 'Step';
  return String(action)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// A compact "key: value · key: value" line of a step's raw detail facts,
// shown alongside a real caption for transparency into what JS computed.
export function formatDetailLine(detail) {
  if (!detail || typeof detail !== 'object') return '';
  return Object.entries(detail)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
    .join(' · ');
}
