// Checks frontend/viz modules against samples/ and the CLAUDE.md viz contract.
// Run from the repo root: node eval/test_viz.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const stripCaptions = (steps) => steps.map(({ caption, ...rest }) => rest);
const { isCorrectChoice } = await import('../frontend/answerAdapter.js');
const { PLANS } = await import('../frontend/viz/_samples.js');

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

const STRUCTURES = ['stack', 'doubly_linked_list', 'bst', 'queue', 'singly_linked_list', 'hash_linear_probing', 'hash_chaining']
  .filter((s) => { try { readFileSync(new URL(`../frontend/viz/${s}.js`, import.meta.url)); return true; } catch { return false; } });
const mods = {};

// Junk a student could type into the sandbox: none of it may crash run().
const JUNK_OPS = [
  { op: 'frobnicate', args: ['1'] },
  { op: 'push', args: [] },
  { op: 'insert', args: [] },
  { op: 'insert', args: [''] },
  { op: 'insert_after', args: ['1'] },
  { op: 'remove', args: ['999'] },
  { op: 'search', args: ['abc'] },
  { op: 'pop', args: ['x'] },
  { op: 'dequeue', args: [] },
  { op: 'insert', args: ['-7'] },
];

for (const structure of STRUCTURES) {
  const mod = (mods[structure] = await import(`../frontend/viz/${structure}.js`));
  const plan = load(`samples/plan_${structure}.json`);
  const expected = load(`samples/steps_${structure}.json`);

  test(`${structure}: run() matches samples/steps_${structure}.json`, () => {
    const steps = mod.run(plan.initial, plan.ops);
    assert.deepStrictEqual(stripCaptions(steps), stripCaptions(expected.steps));
    assert.equal(steps[0].action, 'initial');
    assert.ok(steps.every((s) => s.caption === ''), 'captions must be empty from JS');
  });

  test(`${structure}: preview's inline plan (frontend/viz/_samples.js) matches samples/plan_${structure}.json`, () => {
    assert.deepStrictEqual(PLANS[structure], plan);
  });

  test(`${structure}: questions() are valid and work with the frontend's answerAdapter`, () => {
    const qs = mod.questions(mod.run(plan.initial, plan.ops));
    assert.ok(qs.length > 0, 'expected at least one question for the sample');
    const stepIdx = new Set();
    for (const q of qs) {
      assert.ok(!stepIdx.has(q.stepIndex), `two questions on step ${q.stepIndex}`);
      stepIdx.add(q.stepIndex);
      assert.ok(q.choices.length >= 2 && q.choices.every((c) => typeof c === 'string'), 'choices must be >= 2 strings');
      assert.equal(typeof q.answer, 'string', 'answer must be a string (frontend treats numbers as indexes)');
      assert.ok(q.choices.includes(q.answer), `answer ${q.answer} not in choices ${q.choices}`);
      assert.deepStrictEqual(q.choices.map((_, i) => isCorrectChoice(q, i)), q.choices.map((c) => c === q.answer));
    }
  });

  test(`${structure}: render() draws every sample step as SVG`, () => {
    for (const s of expected.steps) {
      const container = { innerHTML: '' };
      mod.render(container, s);
      assert.match(container.innerHTML, /^<svg[\s\S]*<\/svg>$/);
    }
  });

  test(`${structure}: junk sandbox ops never crash run()/render()/questions()`, () => {
    const steps = mod.run(plan.initial, [...plan.ops, ...JUNK_OPS]);
    assert.ok(steps.length > 1);
    for (const s of steps) mod.render({ innerHTML: '' }, s);
    mod.questions(steps);
    const errs = steps.filter((s) => s.action === 'error');
    assert.ok(errs.length >= 1 && errs.every((s) => typeof s.detail.error === 'string'), 'bad ops should become error steps');
    // Also from an empty start.
    const empty = mod.run([], JUNK_OPS);
    for (const s of empty) mod.render({ innerHTML: '' }, s);
  });

  test(`${structure}: render() escapes HTML in values`, () => {
    const container = { innerHTML: '' };
    const evil = '<img src=x onerror=alert(1)>';
    const steps = structure.startsWith('hash')
      ? mod.run(['5'], [{ op: 'insert', args: [evil] }])
      : mod.run([evil], [{ op: 'search', args: [evil] }, { op: 'push', args: [evil] }, { op: 'enqueue', args: [evil] }]);
    for (const s of steps) {
      mod.render(container, s);
      assert.ok(!container.innerHTML.includes('<img'), 'raw HTML leaked into SVG');
    }
  });
}

const { stack, doubly_linked_list: dll } = mods;

test('stack: demo question is "Which value does Pop remove?" with answer 11', () => {
  const plan = load('samples/plan_stack.json');
  const q = stack.questions(stack.run(plan.initial, plan.ops)).find((x) => x.prompt === 'Which value does Pop remove?');
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
  const of = (action) => steps.filter((s) => s.action === action);
  assert.deepStrictEqual(steps[1].state, { nodes: [12, 30, 40], head: 0, tail: 2 });
  assert.deepStrictEqual(steps[2].state, { nodes: [1, 12, 30, 40], head: 0, tail: 3 });
  assert.deepStrictEqual(steps[3].state, { nodes: [1, 12, 40], head: 0, tail: 2 });
  const search40 = of('search').filter((s) => s.detail.target === 40);
  assert.deepStrictEqual(search40.map((s) => s.detail.current), [1, 12, 40]);
  assert.equal(search40.at(-1).detail.found, true);
  assert.equal(of('search').at(-1).detail.found, false);
  assert.equal(steps.at(-1).detail.found, false, 'insert_after a missing node should not throw');
});

test('unknown op becomes an error step and leaves state unchanged', () => {
  const s = stack.run(['1'], [{ op: 'enqueue', args: ['2'] }]);
  assert.equal(s[1].action, 'error');
  assert.deepStrictEqual(s[1].state, s[0].state);
  const d = dll.run([], [{ op: 'push', args: ['1'] }]);
  assert.equal(d[1].action, 'error');
});

// ---- module-specific tests ----
const { bst } = mods;
const SAMPLE_BST = ['21', '12', '91', '11', '19', '65', '96'];
const ins = (v) => ({ op: 'insert', args: [String(v)] });
const rem = (v) => ({ op: 'remove', args: [String(v)] });
const find = (v) => ({ op: 'search', args: [String(v)] });
const node = (value, left = null, right = null) => ({ value, left, right });

if (bst) {
  test('bst: insert walks down then places (70 goes right of 65)', () => {
    const s = bst.run(SAMPLE_BST, [ins(70)]);
    assert.deepStrictEqual(s.slice(1).map((x) => x.detail.current ?? x.detail.phase), [21, 91, 65, 'placed']);
    assert.deepStrictEqual(s.at(-1).detail, { value: 70, phase: 'placed', parent: 65, side: 'right', path: [21, 91, 65, 70] });
    assert.deepStrictEqual(s.at(-1).state.nodes.find((n) => n.value === 65), node(65, null, 70));
  });

  test('bst: remove leaf, one child, two children (successor), hand-computed', () => {
    const s = bst.run(SAMPLE_BST, [ins(70), rem(11), rem(65), rem(21)]);
    const removed = s.filter((x) => x.detail.phase === 'removed').map((x) => [x.detail.case, x.detail.replaced_with]);
    assert.deepStrictEqual(removed, [['leaf', null], ['one_child', 70], ['two_children', 70]]);
    const succ = s.find((x) => x.detail.phase === 'successor');
    assert.deepStrictEqual([succ.detail.successor, succ.detail.successor_path], [70, [91, 70]]);
    assert.deepStrictEqual(s.at(-1).state, {
      root: 70,
      nodes: [node(70, 12, 91), node(12, null, 19), node(91, null, 96), node(19), node(96)],
    });
  });

  test('bst: search miss, duplicate insert, empty tree, remove root leaf', () => {
    const miss = bst.run(['70', '12', '91', '19'], [find(50)]);
    assert.deepStrictEqual(miss.at(-1).detail, { target: 50, current: null, comparison: null, next: null, found: false, path: [70, 12, 19] });
    const dup = bst.run(SAMPLE_BST, [ins(19)]);
    assert.equal(dup.at(-1).detail.duplicate, true);
    assert.deepStrictEqual(dup.at(-1).state, dup[0].state);
    const empty = bst.run([], [ins(5), find(5), rem(5), find(5)]);
    assert.deepStrictEqual(empty[1].detail, { value: 5, phase: 'placed', parent: null, side: null, path: [5] });
    assert.deepStrictEqual(empty.at(-1).state, { root: null, nodes: [] });
  });

  test('bst: sample questions (path on step 0, "visited next" on search steps)', () => {
    const plan = load('samples/plan_bst.json');
    const qs = bst.questions(bst.run(plan.initial, plan.ops));
    const path = qs.find((q) => q.stepIndex === 0);
    assert.equal(path.answer, '21 → 91 → 65');
    assert.ok(path.choices.length >= 3);
    const nexts = qs.filter((q) => q.prompt === 'Which node is visited next?').map((q) => [q.stepIndex, q.answer, q.choices]);
    assert.deepStrictEqual(nexts, [[1, '91', ['12', '91', 'none (search ends)']], [2, '65', ['65', '96', 'none (search ends)']]]);
  });
}

const { queue } = mods;
if (queue) {
  test('queue: FIFO order, dequeue/peek on empty, dequeue question answer is the front', () => {
    const s = queue.run(['1'], [{ op: 'dequeue', args: [] }, { op: 'dequeue', args: [] }, { op: 'peek', args: [] }, { op: 'enqueue', args: ['2'] }]);
    assert.deepStrictEqual(s[1].detail, { value: 1, size: 0, new_front: null });
    assert.deepStrictEqual(s[2].detail, { value: null, size: 0, empty: true });
    assert.deepStrictEqual(s[3].detail, { value: null, size: 0, empty: true });
    assert.deepStrictEqual(s[4].state, { items: [2], front: 0, back: 0 });
    const plan = load('samples/plan_queue.json');
    const q = queue.questions(queue.run(plan.initial, plan.ops)).find((x) => x.prompt === 'Which value does dequeue remove?');
    assert.deepStrictEqual([q.stepIndex, q.answer, q.choices], [4, '7', ['7', '14', '21']]);
  });
}

const probing = mods.hash_linear_probing;
if (probing) {
  test('hash_linear_probing: sample questions ask where each insert lands', () => {
    const plan = load('samples/plan_hash_linear_probing.json');
    const qs = probing.questions(probing.run(plan.initial, plan.ops)).map((q) => [q.stepIndex, q.prompt, q.answer, q.choices]);
    assert.deepStrictEqual(qs, [
      [0, 'Which bucket does 45 end up in?', '5', ['5', '6', '7']],
      [1, 'Which bucket does 25 end up in?', '6', ['5', '6', '7']],
      [3, 'Which bucket does 35 end up in?', '7', ['5', '6', '7']],
      [14, 'Which bucket does 55 end up in?', '6', ['5', '6', '7']],
    ]);
  });

  test('hash_linear_probing: wraparound, full table, negative key, duplicate, bad size', () => {
    const wrap = probing.run(['5', '9'], [ins(4)]); // 9 sits in bucket 4, so 4 wraps to bucket 0
    assert.deepStrictEqual(wrap.at(-1).detail, { key: 4, hash: 4, probes: [4, 0], placed: 0 });
    const full = probing.run(['2', '1', '2'], [ins(3), find(5)]);
    assert.equal(full.find((s) => s.detail.full).detail.placed, null);
    assert.equal(full.at(-1).detail.stopped, 'full');
    assert.equal(probing.run(['7'], [ins(-3)]).at(-1).detail.hash, 4);
    assert.equal(probing.run(['7', '10'], [ins(10)]).at(-1).detail.duplicate, true);
    const bad = probing.run(['0'], [ins(3)]);
    assert.equal(bad[0].detail.error.includes('positive integer'), true);
    assert.equal(bad[1].action, 'error');
  });
}

console.log(failures ? `\n${failures} failed` : '\nAll viz tests passed');
process.exit(failures ? 1 : 0);
