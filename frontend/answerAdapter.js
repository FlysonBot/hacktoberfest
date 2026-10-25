// Adapter isolating one ambiguous assumption in the shared contract:
//
//   questions(steps) -> [{ stepIndex, prompt, choices, answer }]
//
// CLAUDE.md does not pin down whether `answer` is the correct entry's index
// into `choices`, or the literal value of the correct choice. No viz module
// or fixture exists yet to settle it. Rather than guessing and baking that
// guess into the player, this file is the single place that interprets
// `answer`, supporting both conventions so the UI keeps working either way.
// If this assumption is wrong for a real module, only this file changes.

export function isCorrectChoice(question, selectedIndex) {
  const { answer, choices } = question || {};
  if (typeof answer === 'number') return selectedIndex === answer;
  if (Array.isArray(choices)) {
    const selectedValue = choices[selectedIndex];
    if (selectedValue === answer) return true;
    try {
      return JSON.stringify(selectedValue) === JSON.stringify(answer);
    } catch {
      return false;
    }
  }
  return false;
}

export function getCorrectChoiceText(question) {
  const { answer, choices } = question || {};
  if (typeof answer === 'number' && Array.isArray(choices)) {
    const value = choices[answer];
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  return typeof answer === 'string' ? answer : JSON.stringify(answer);
}

export function describeChoice(question, choiceIndex) {
  const choice = question && Array.isArray(question.choices) ? question.choices[choiceIndex] : undefined;
  return typeof choice === 'string' ? choice : JSON.stringify(choice);
}
