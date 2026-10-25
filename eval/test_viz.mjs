// Checks frontend/viz modules against samples/ and the CLAUDE.md viz contract.
// Run from the repo root: node eval/test_viz.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const stripCaptions = (steps) => steps.map(({ caption, ...rest }) => rest);

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL  ${name}\n      ${e.message.split('\n').join('\n      ')}`);
  }
}

for (const structure of ['stack', 'doubly_linked_list']) {
  const mod = await import(`../frontend/viz/${structure}.js`);
  const plan = load(`samples/plan_${structure}.json`);
  const expected = load(`samples/steps_${structure}.json`);

  test(`${structure}: run() matches samples/steps_${structure}.json`, () => {
    const steps = mod.run(plan.initial, plan.ops);
    assert.deepStrictEqual(stripCaptions(steps), stripCaptions(expected.steps));
    assert.ok(steps.every((s) => s.caption === ''), 'captions must be empty from JS');
  });

  test(`${structure}: questions() answers are strings found in choices`, () => {
    const qs = mod.questions(mod.run(plan.initial, plan.ops));
    assert.ok(qs.length > 0, 'expected at least one question');
    for (const q of qs) {
      assert.equal(typeof q.answer, 'string', 'answer must be a string (frontend treats numbers as indexes)');
      assert.ok(q.choices.includes(q.answer), `answer ${q.answer} not in choices ${q.choices}`);
      assert.ok(q.choices.length >= 2, 'need at least 2 choices');
    }
  });

  test(`${structure}: render() draws every sample step as SVG`, () => {
    for (const step of expected.steps) {
      const container = { innerHTML: '' };
      mod.render(container, step);
      assert.match(container.innerHTML, /^<svg[\s\S]*<\/svg>$/);
    }
  });

  test(`${structure}: render() escapes HTML in values`, () => {
    const container = { innerHTML: '' };
    const step = mod.run(['<img src=x onerror=alert(1)>'], [])[0];
    mod.render(container, step);
    assert.ok(!container.innerHTML.includes('<img'), 'raw HTML leaked into SVG');
  });
}

const stack = await import('../frontend/viz/stack.js');
const dll = await import('../frontend/viz/doubly_linked_list.js');

test('stack: demo question is "Which value does Pop remove?" with answer 11', () => {
  const plan = load('samples/plan_stack.json');
  const qs = stack.questions(stack.run(plan.initial, plan.ops));
  const q = qs.find((x) => x.prompt === 'Which value does Pop remove?');
  assert.ok(q, 'missing pop question');
  assert.equal(q.stepIndex, 4);
  assert.deepStrictEqual(q.choices, ['11', '45', '56']);
  assert.equal(q.answer, '11');
});

test('stack: sandbox edge cases (pop/peek on empty, peek)', () => {
  const steps = stack.run([], [{ op: 'pop', args: [] }, { op: 'peek', args: [] }, { op: 'push', args: ['5'] }, { op: 'peek', args: [] }]);
  assert.deepStrictEqual(steps[1].detail, { value: null, size: 0, empty: true });
  assert.deepStrictEqual(steps[2].detail, { value: null, size: 0, empty: true });
  assert.deepStrictEqual(steps[4].detail, { value: 5, size: 1 });
  assert.deepStrictEqual(steps[4].state, { items: [5], top: 0 });
});

test('doubly_linked_list: append / prepend / remove / search', () => {
  const steps = dll.run(['12', '30'], [
    { op: 'append', args: ['40'] },
    { op: 'prepend', args: ['1'] },
    { op: 'remove', args: ['30'] },
    { op: 'search', args: ['40'] },
    { op: 'search', args: ['99'] },
    { op: 'insert_after', args: ['99', '5'] },
  ]);
  const last = (action) => steps.filter((s) => s.action === action);
  assert.deepStrictEqual(steps[1].state, { nodes: [12, 30, 40], head: 0, tail: 2 });
  assert.deepStrictEqual(steps[2].state, { nodes: [1, 12, 30, 40], head: 0, tail: 3 });
  assert.deepStrictEqual(steps[3].state, { nodes: [1, 12, 40], head: 0, tail: 2 });
  const search40 = last('search').filter((s) => s.detail.target === 40);
  assert.deepStrictEqual(search40.map((s) => s.detail.current), [1, 12, 40]);
  assert.equal(search40.at(-1).detail.found, true);
  assert.equal(last('search').at(-1).detail.found, false);
  assert.equal(steps.at(-1).detail.found, false, 'insert_after a missing node should not throw');
});

const { isCorrectChoice } = await import('../frontend/answerAdapter.js');

test("questions() work with the frontend's answerAdapter (only the right choice is correct)", () => {
  for (const [mod, s] of [[stack, 'stack'], [dll, 'doubly_linked_list']]) {
    const plan = load(`samples/plan_${s}.json`);
    for (const q of mod.questions(mod.run(plan.initial, plan.ops))) {
      const correct = q.choices.map((_, i) => isCorrectChoice(q, i));
      assert.deepStrictEqual(correct, q.choices.map((c) => c === q.answer), `${s}: ${q.prompt}`);
    }
  }
});

test('unknown op throws', () => {
  assert.throws(() => stack.run([], [{ op: 'enqueue', args: ['1'] }]));
  assert.throws(() => dll.run([], [{ op: 'push', args: ['1'] }]));
});

console.log(failures ? `\n${failures} failed` : '\nAll viz tests passed');
process.exit(failures ? 1 : 0);
