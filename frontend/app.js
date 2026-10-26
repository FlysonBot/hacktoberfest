import { postPlan, postCaptions, postExplain, ApiError } from './api.js';
import { Player } from './player.js';
import { isCorrectChoice, getCorrectChoiceText, describeChoice } from './answerAdapter.js';
import { fallbackCaption, formatActionTitle } from './captions.js';
import { parseSandboxOps, exampleOpsText } from './sandbox.js';
import { matchDemoQuestion } from './demoCache.js';
import { formatPlanSummary } from './planSummary.js';

const PLAN_TIMEOUT_MS = 20000;
const SLOW_TEXT_DELAY_MS = 5000;
const DEFAULT_GENERATING_TEXT = 'This usually takes a few seconds.';
const SLOW_GENERATING_TEXT = 'Gemma is thinking… this can take up to 15 seconds.';

// Tier 1 + Tier 2 structures from CLAUDE.md's show_visualization enum. A
// structure is only ever loaded from here, as frontend/viz/<structure>.js —
// never from a path the backend supplies directly.
const ALLOWED_STRUCTURES = [
  'singly_linked_list',
  'doubly_linked_list',
  'stack',
  'queue',
  'bst',
  'hash_linear_probing',
  'hash_chaining',
  'heap',
  'insertion_sort',
];

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const els = {
  brandLink: document.getElementById('brand-link'),
  newLessonBtn: document.getElementById('new-lesson-btn'),

  startScreen: document.getElementById('start-screen'),
  composer: document.getElementById('composer'),
  questionInput: document.getElementById('question-input'),
  screenshotRow: document.getElementById('screenshot-row'),
  screenshotPreviewImg: document.getElementById('screenshot-preview-img'),
  screenshotFilename: document.getElementById('screenshot-filename'),
  screenshotSub: document.getElementById('screenshot-sub'),
  screenshotRemove: document.getElementById('screenshot-remove'),
  screenshotError: document.getElementById('screenshot-error'),
  screenshotInput: document.getElementById('screenshot-input'),
  attachBtn: document.getElementById('attach-btn'),
  planErrorBanner: document.getElementById('plan-error-banner'),
  planErrorBody: document.getElementById('plan-error-body'),
  planErrorCode: document.getElementById('plan-error-code'),
  generateBtn: document.getElementById('generate-btn'),
  generateBtnLabel: document.getElementById('generate-btn-label'),

  workspaceScreen: document.getElementById('workspace-screen'),
  wsQuestionInput: document.getElementById('ws-question-input'),
  wsScreenshotChip: document.getElementById('ws-screenshot-chip'),
  regenerateBtn: document.getElementById('regenerate-btn'),
  titleSkeleton: document.getElementById('title-skeleton'),
  titleRow: document.getElementById('title-row'),
  planSummary: document.getElementById('plan-summary'),
  lessonEyebrow: document.getElementById('lesson-eyebrow'),
  lessonTitle: document.getElementById('lesson-title'),
  lessonMeta: document.getElementById('lesson-meta'),

  stageCard: document.getElementById('stage-card'),
  vizContainer: document.getElementById('viz-container'),
  generatingOverlay: document.getElementById('generating-overlay'),
  generatingSub: document.getElementById('generating-sub'),
  cancelGenerateBtn: document.getElementById('cancel-generate-btn'),
  stageErrorBanner: document.getElementById('stage-error-banner'),
  stageErrorBody: document.getElementById('stage-error-body'),

  captionsLoadingChip: document.getElementById('captions-loading-chip'),
  stepBadge: document.getElementById('step-badge'),
  stepTag: document.getElementById('step-tag'),
  captionText: document.getElementById('caption-text'),

  progressRow: document.getElementById('progress-row'),
  btnBack: document.getElementById('btn-back'),
  btnNext: document.getElementById('btn-next'),
  btnRestart: document.getElementById('btn-restart'),
  stepCounter: document.getElementById('step-counter'),

  textFallback: document.getElementById('text-fallback'),
  textBody: document.getElementById('text-body'),

  practicePanel: document.getElementById('practice-panel'),
  practiceStepLabel: document.getElementById('practice-step-label'),
  practicePrompt: document.getElementById('practice-prompt'),
  practiceContext: document.getElementById('practice-context'),
  practiceChoices: document.getElementById('practice-choices'),
  practiceActions: document.getElementById('practice-actions'),
  practiceFeedbackSlot: document.getElementById('practice-feedback-slot'),

  completePanel: document.getElementById('complete-panel'),
  completeSub: document.getElementById('complete-sub'),
  completeStats: document.getElementById('complete-stats'),
  replayBtn: document.getElementById('replay-btn'),
  completeNewLessonBtn: document.getElementById('complete-new-lesson-btn'),

  sandboxPanel: document.getElementById('sandbox-panel'),
  sandboxHint: document.getElementById('sandbox-hint'),
  sandboxForm: document.getElementById('sandbox-form'),
  sandboxInput: document.getElementById('sandbox-input'),
  sandboxError: document.getElementById('sandbox-error'),

  lessonOutline: document.getElementById('lesson-outline'),
  outlineMeta: document.getElementById('outline-meta'),
  outlineList: document.getElementById('outline-list'),

  devMode: document.getElementById('dev-mode'),
  devStatus: document.getElementById('dev-status'),
  devPlanPreview: document.getElementById('dev-plan-preview'),
  devErrors: document.getElementById('dev-errors'),
  devJsonInput: document.getElementById('dev-json-input'),
  devJsonExample: document.getElementById('dev-json-example'),
  devJsonLoad: document.getElementById('dev-json-load'),
  devJsonError: document.getElementById('dev-json-error'),
  devStepDetail: document.getElementById('dev-step-detail'),
};

const state = {
  lessonId: 0,
  structure: null,
  initial: [],
  ops: [],
  planOps: [],
  vizModule: null,
  steps: [],
  questions: [],
  answers: new Map(), // stepIndex -> { phase: 'ask'|'wrong'|'right', selectedIndex, explanation, pending, attempts, token }
  screenshot: { file: null, base64: null, previewUrl: null },
  planRequestToken: 0,
  planAbortController: null,
  planTimedOut: false,
  captionsRequestToken: 0,
  captionsSettled: true,
  explainTokenSeq: 0,
  mode: 'live',
  screen: 'start', // 'start' | 'workspace'
  workspacePhase: 'generating', // 'generating' | 'lesson' | 'text'
  textMessage: '',
};

const player = new Player({ onChange: onPlayerChange });

init();

function init() {
  els.brandLink.addEventListener('click', newLesson);
  els.newLessonBtn.addEventListener('click', newLesson);

  document.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      els.questionInput.value = btn.dataset.example;
      els.questionInput.focus();
      syncGenerateDisabled();
      autoGrowTextarea(els.questionInput);
    });
  });

  els.questionInput.addEventListener('input', () => {
    syncGenerateDisabled();
    autoGrowTextarea(els.questionInput);
  });
  els.questionInput.addEventListener('paste', onQuestionPaste);
  els.generateBtn.addEventListener('click', () => onGenerateClick());
  els.regenerateBtn.addEventListener('click', () => onGenerateClick(els.wsQuestionInput.value));
  els.cancelGenerateBtn.addEventListener('click', cancelGenerate);

  els.attachBtn.addEventListener('click', () => els.screenshotInput.click());
  els.screenshotInput.addEventListener('change', onScreenshotChange);
  els.screenshotRemove.addEventListener('click', onScreenshotRemove);

  els.btnBack.addEventListener('click', () => player.back());
  els.btnNext.addEventListener('click', () => player.next());
  els.btnRestart.addEventListener('click', onRestartClick);

  els.replayBtn.addEventListener('click', onRestartClick);
  els.completeNewLessonBtn.addEventListener('click', newLesson);

  els.sandboxForm.addEventListener('submit', onSandboxSubmit);

  document.addEventListener('keydown', onKeyDown);

  els.devJsonExample.addEventListener('click', () => {
    els.devJsonInput.value = JSON.stringify(
      {
        structure: 'bst',
        initial: [],
        ops: [
          { op: 'insert', args: ['50'] },
          { op: 'insert', args: ['30'] },
          { op: 'insert', args: ['70'] },
          { op: 'insert', args: ['20'] },
        ],
        source: 'user_question',
      },
      null,
      2
    );
  });
  els.devJsonLoad.addEventListener('click', onLoadManualJson);

  syncGenerateDisabled();
  renderPracticePanel();
  renderCompletePanel();
  renderOutline();
}

// ---------- Screen / phase management ----------

function setScreen(screen) {
  state.screen = screen;
  els.startScreen.hidden = screen !== 'start';
  els.workspaceScreen.hidden = screen !== 'workspace';
  els.newLessonBtn.hidden = screen !== 'workspace';
}

function setWorkspacePhase(phase) {
  state.workspacePhase = phase;
  const isGenerating = phase === 'generating';
  const isLesson = phase === 'lesson';
  const isText = phase === 'text';

  els.titleSkeleton.hidden = !isGenerating;
  els.titleRow.hidden = isGenerating;
  els.stageCard.hidden = !(isGenerating || isLesson);
  els.generatingOverlay.hidden = !isGenerating;
  els.vizContainer.hidden = isGenerating;
  els.textFallback.hidden = !isText;
  els.lessonOutline.hidden = !isLesson;
  els.sandboxPanel.hidden = !isLesson;

  if (isGenerating) {
    // A new attempt starting must not show a stale error or caption left
    // over from whatever the previous attempt was showing.
    hideStageError();
    updateCaption(null);
  }

  renderPracticePanel();
  renderCompletePanel();
}

function newLesson() {
  if (state.planAbortController) state.planAbortController.abort();
  ++state.planRequestToken;
  resetLesson();
  els.questionInput.value = '';
  autoGrowTextarea(els.questionInput);
  releasePreviewUrl();
  state.screenshot = { file: null, base64: null, previewUrl: null };
  els.screenshotInput.value = '';
  setScreenshotRowVisible(false);
  hidePlanError();
  setScreen('start');
  syncGenerateDisabled();
}

function cancelGenerate() {
  if (state.planAbortController) state.planAbortController.abort();
  ++state.planRequestToken;
  setScreen('start');
}

// ---------- Plan submission ----------

function autoGrowTextarea(el) {
  el.style.height = 'auto'; // collapse first so scrollHeight reflects the new content, not the old height
  el.style.height = `${el.scrollHeight}px`;
}

function syncGenerateDisabled() {
  els.generateBtn.disabled = !els.questionInput.value.trim();
}

async function onGenerateClick(queryOverride) {
  const text = (queryOverride ?? els.questionInput.value).trim();
  if (!text) return;

  hidePlanError();
  els.wsQuestionInput.value = text;

  const demoMatch = matchDemoQuestion(text);
  if (demoMatch) {
    const usedCache = await tryLoadCachedDemo(demoMatch);
    if (usedCache) return;
    // Cache file failed to load (e.g. missing) — fall through to the live call below.
  }

  state.planAbortController = new AbortController();
  state.planTimedOut = false;
  setScreen('workspace');
  setWorkspacePhase('generating');

  const token = ++state.planRequestToken;
  const payload = { text };
  if (state.screenshot.base64) payload.image_base64 = state.screenshot.base64;

  const timeoutId = setTimeout(() => {
    state.planTimedOut = true;
    state.planAbortController.abort();
  }, PLAN_TIMEOUT_MS);

  els.generatingSub.textContent = DEFAULT_GENERATING_TEXT;
  const slowTextTimer = setTimeout(() => {
    els.generatingSub.textContent = SLOW_GENERATING_TEXT;
  }, SLOW_TEXT_DELAY_MS);

  devSetStatus('POST /api/plan — sending…');
  try {
    const response = await postPlan(payload, { signal: state.planAbortController.signal });
    clearTimeout(timeoutId);
    clearTimeout(slowTextTimer);
    if (token !== state.planRequestToken) return; // superseded
    devSetStatus('POST /api/plan — 200 OK');
    setMode('live');
    await handlePlanResponse(response);
  } catch (err) {
    clearTimeout(timeoutId);
    clearTimeout(slowTextTimer);
    if (token !== state.planRequestToken) return;
    if (err && err.name === 'AbortError') {
      if (!state.planTimedOut) return; // user clicked Cancel; cancelGenerate() already reset the screen
      const timeoutErr = new Error(`/api/plan did not respond within ${PLAN_TIMEOUT_MS / 1000} seconds.`);
      handleApiError('/api/plan', timeoutErr);
      setScreen('start');
      showPlanError(`${timeoutErr.message} Please retry.`);
      return;
    }
    handleApiError('/api/plan', err);
    setScreen('start');
    showPlanError(describeError(err), err instanceof ApiError ? err.status : null);
  }
}

// Demo safety net: the 3 questions in docs/DEMO.md load instantly from a
// local cached plan instead of calling the (possibly slow or rate-limited)
// live /api/plan, so the demo video never depends on Gemma being up.
// Captions still come from the live /api/captions as normal.
async function tryLoadCachedDemo(demoMatch) {
  setScreen('workspace');
  setWorkspacePhase('generating');
  devSetStatus(`Loading cached demo plan — ${demoMatch.file}`);
  try {
    const res = await fetch(demoMatch.file);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    setMode('cached');
    devSetStatus(`Cached demo plan loaded — ${demoMatch.file}`);
    await handlePlanResponse(json, { source: 'cached' });
    return true;
  } catch (err) {
    devLogError('demo cache', `Failed to load ${demoMatch.file}: ${err.message}`);
    return false;
  }
}

async function handlePlanResponse(response, { source = 'live' } = {}) {
  // Record the raw response for the backend teammate before anything else,
  // so /api/plan is inspectable even if no viz module exists yet.
  devShowPlanPreview(response, source);

  if (!response || typeof response !== 'object') {
    setScreen('start');
    showPlanError('The plan response was not a valid JSON object.');
    return;
  }

  if (response.structure === null) {
    if (typeof response.message !== 'string') {
      setScreen('start');
      showPlanError('Backend said there is no structure but did not include a message.');
      return;
    }
    resetLesson();
    state.textMessage = response.message;
    setWorkspacePhase('text');
    renderTitleRow();
    renderTextFallback();
    return;
  }

  const { structure, initial, ops } = response;
  if (typeof structure !== 'string' || !ALLOWED_STRUCTURES.includes(structure)) {
    setScreen('start');
    showPlanError(`Backend returned an unsupported structure: "${structure}".`);
    return;
  }
  if (!Array.isArray(initial) || !Array.isArray(ops)) {
    setScreen('start');
    showPlanError('Backend response is missing a valid "initial" or "ops" array.');
    return;
  }

  await loadStructure(structure, initial, ops);
}

async function loadStructure(structure, initial, ops) {
  const lessonId = ++state.lessonId;
  resetLesson();
  state.structure = structure;
  state.initial = initial;
  state.ops = ops.slice();
  state.planOps = ops.slice(); // the ops exactly as read from the plan — never mutated by the sandbox

  let mod;
  try {
    mod = await import(`./viz/${structure}.js`);
  } catch {
    if (lessonId !== state.lessonId) return;
    setWorkspacePhase('lesson');
    renderTitleRow();
    showStageError(
      `Visualization module for "${structure}" isn't available yet (frontend/viz/${structure}.js). ` +
        'The backend request worked — ask the visualization teammate to add that module.'
    );
    return;
  }
  if (lessonId !== state.lessonId) return; // a newer plan started while importing

  if (typeof mod.run !== 'function' || typeof mod.render !== 'function' || typeof mod.questions !== 'function') {
    setWorkspacePhase('lesson');
    renderTitleRow();
    showStageError(`frontend/viz/${structure}.js is missing a run/render/questions export.`);
    return;
  }

  let steps;
  try {
    steps = mod.run(initial, ops);
  } catch (err) {
    setWorkspacePhase('lesson');
    renderTitleRow();
    showStageError(`${structure}'s run() threw an error: ${err.message}`);
    devLogError(`viz/${structure}.js run()`, err.message);
    return;
  }

  if (!Array.isArray(steps) || steps.length === 0) {
    setWorkspacePhase('lesson');
    renderTitleRow();
    showStageError(`${structure}'s run() produced no steps for this input.`);
    return;
  }

  state.vizModule = mod;
  state.steps = steps;

  let questions = [];
  try {
    const result = mod.questions(steps);
    if (Array.isArray(result)) questions = result;
  } catch (err) {
    devLogError(`viz/${structure}.js questions()`, err.message);
  }
  state.questions = questions;

  hideStageError();
  setWorkspacePhase('lesson');
  renderTitleRow();
  player.load(steps); // displays step 0 with a local fallback caption immediately
  requestCaptions(structure, state.steps, lessonId, 0);
}

function resetLesson() {
  state.structure = null;
  state.initial = [];
  state.ops = [];
  state.planOps = [];
  state.vizModule = null;
  state.steps = [];
  state.questions = [];
  state.answers = new Map();
  state.textMessage = '';
  state.captionsSettled = true;
  player.load([]);
  els.vizContainer.replaceChildren();
  hideStageError();
  hideTextFallback();
  renderTitleRow();
  renderPracticePanel();
  renderCompletePanel();
  renderOutline();
}

async function requestCaptions(structure, steps, lessonId, fromIndex) {
  const slice = steps.slice(fromIndex);
  if (slice.length === 0) return;

  state.captionsSettled = false;
  updateCaption(player.currentStep);

  const token = ++state.captionsRequestToken;
  const payload = { structure, steps: slice.map((s) => ({ action: s.action, detail: s.detail })) };

  devSetStatus('POST /api/captions — sending…');
  try {
    const response = await postCaptions(payload);
    if (lessonId !== state.lessonId || token !== state.captionsRequestToken) return; // stale
    const captions = response && response.captions;
    const valid = Array.isArray(captions) && captions.length === slice.length && captions.every((c) => typeof c === 'string');
    if (valid) {
      // Mutate the existing step objects in place rather than replacing the
      // array: `player` holds the same array reference from player.load(),
      // so a new array here would silently desync player.currentStep from
      // these captions.
      for (let i = fromIndex; i < state.steps.length; i++) {
        state.steps[i].caption = captions[i - fromIndex];
      }
      devSetStatus('POST /api/captions — 200 OK');
    } else {
      devSetStatus('POST /api/captions — invalid shape, keeping fallback captions');
      devLogError('/api/captions', 'Response did not contain exactly one string caption per new step.');
    }
  } catch (err) {
    if (lessonId !== state.lessonId || token !== state.captionsRequestToken) return;
    handleApiError('/api/captions', err);
    // Fallback captions already shown; the lesson stays usable.
  } finally {
    if (lessonId === state.lessonId && token === state.captionsRequestToken) {
      state.captionsSettled = true;
      updateCaption(player.currentStep);
      renderOutline();
      renderPracticePanel();
    }
  }
}

function renderTitleRow() {
  const label = state.structure
    ? state.structure.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '';
  els.lessonEyebrow.textContent = label;
  els.lessonTitle.textContent = els.wsQuestionInput.value || label;
  els.lessonMeta.textContent = state.steps.length ? `${state.steps.length} steps` : '';

  if (state.structure) {
    els.planSummary.hidden = false;
    els.planSummary.textContent = formatPlanSummary({ structure: state.structure, initial: state.initial, ops: state.planOps });
  } else {
    els.planSummary.hidden = true;
    els.planSummary.textContent = '';
  }

  renderSandboxHint();
}

function renderSandboxHint() {
  // Each structure gets an example in its own vocabulary — a BST hint
  // should never say "push", a stack hint should never say "insert".
  const example = state.structure ? exampleOpsText(state.structure) : 'push 5, pop';
  const code = document.createElement('code');
  code.textContent = example;
  els.sandboxHint.replaceChildren('Type comma-separated ops for this structure, e.g. ', code, '.');
  els.sandboxInput.placeholder = example;
}

function showStageError(message) {
  els.stageErrorBanner.hidden = false;
  els.stageErrorBody.textContent = message;
}

function hideStageError() {
  els.stageErrorBanner.hidden = true;
  els.stageErrorBody.textContent = '';
}

function renderTextFallback() {
  els.textBody.textContent = state.textMessage;
}

function hideTextFallback() {
  els.textBody.textContent = '';
}

// ---------- Player wiring ----------

function onPlayerChange({ index, length, step, canGoBack, canGoNext }) {
  els.btnBack.disabled = !canGoBack;
  els.btnNext.disabled = !canGoNext;
  els.btnRestart.disabled = length === 0;
  els.stepCounter.textContent = length ? `Step ${index + 1} of ${length}` : '';
  els.stepCounter.classList.toggle('is-off', length === 0);

  renderProgressSegments(index, length);
  updateCaption(step);

  if (length === 0) {
    els.vizContainer.replaceChildren();
  } else if (state.vizModule && step) {
    try {
      state.vizModule.render(els.vizContainer, step);
    } catch (err) {
      devLogError(`viz/${state.structure}.js render()`, err.message);
    }
  }

  renderPracticePanel();
  renderCompletePanel();
  renderOutline();
}

function renderProgressSegments(index, length) {
  els.progressRow.replaceChildren();
  els.progressRow.setAttribute('aria-valuemax', String(Math.max(length, 1)));
  els.progressRow.setAttribute('aria-valuenow', String(length ? index + 1 : 0));
  els.progressRow.style.gridTemplateColumns = `repeat(${Math.max(length, 1)}, minmax(0, 1fr))`;
  for (let i = 0; i < length; i++) {
    const span = document.createElement('span');
    span.className = 'progress-segment' + (i <= index ? ' is-done' : '');
    els.progressRow.appendChild(span);
  }
}

function updateCaption(step) {
  if (!step) {
    els.stepBadge.textContent = '';
    els.stepTag.textContent = '';
    els.captionText.textContent = 'Generate a lesson to see it animated here.';
    els.captionsLoadingChip.hidden = true;
    els.devStepDetail.textContent = '—';
    return;
  }
  const hasRealCaption = typeof step.caption === 'string' && step.caption.trim().length > 0;
  els.stepBadge.textContent = String(player.index + 1);
  els.stepTag.textContent = formatActionTitle(step.action);
  els.captionText.textContent = hasRealCaption ? step.caption : fallbackCaption(step);
  els.captionsLoadingChip.hidden = state.captionsSettled;
  // Raw detail facts are debug info for teammates, not shown to students —
  // kept in Developer tools instead of under the caption.
  els.devStepDetail.textContent = JSON.stringify({ action: step.action, detail: step.detail }, null, 2);
}

function onRestartClick() {
  state.answers = new Map();
  player.restart();
}

function onKeyDown(e) {
  const target = e.target;
  const tag = target && target.tagName;
  const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || (target && target.isContentEditable);
  if (isEditable) return;
  if (state.screen !== 'workspace') return;

  if (e.key === 'ArrowLeft') {
    player.back();
  } else if (e.key === 'ArrowRight') {
    player.next();
  } else if (e.key === 'r' || e.key === 'R') {
    onRestartClick();
  } else if (/^[1-9]$/.test(e.key)) {
    const question = findQuestionForStep(player.index);
    const record = state.answers.get(player.index);
    if (question && (!record || record.phase === 'ask')) {
      const choiceIndex = Number(e.key) - 1;
      if (Array.isArray(question.choices) && choiceIndex < question.choices.length) {
        onChoiceSelected(player.index, question, choiceIndex);
      }
    }
  } else if (e.key === 'Enter') {
    const record = state.answers.get(player.index);
    if (record && record.phase === 'ask' && record.selectedIndex !== null && record.selectedIndex !== undefined) {
      onCheckAnswer(player.index, findQuestionForStep(player.index));
    }
  }
}

// ---------- Practice questions ----------

function findQuestionForStep(index) {
  return state.questions.find((q) => q && q.stepIndex === index);
}

function getOrInitAnswer(stepIndex) {
  if (!state.answers.has(stepIndex)) {
    state.answers.set(stepIndex, { phase: 'ask', selectedIndex: null, explanation: null, pending: false, attempts: 0, token: 0 });
  }
  return state.answers.get(stepIndex);
}

function correctChoiceIndex(question) {
  if (typeof question.answer === 'number') return question.answer;
  if (Array.isArray(question.choices)) {
    return question.choices.findIndex((c) => c === question.answer || JSON.stringify(c) === JSON.stringify(question.answer));
  }
  return -1;
}

function renderPracticePanel() {
  const index = player.index;
  const question = findQuestionForStep(index);
  const ready = state.workspacePhase === 'lesson' && state.captionsSettled;

  if (!question || !ready) {
    els.practicePanel.hidden = true;
    return;
  }

  els.practicePanel.hidden = false;
  const record = getOrInitAnswer(index);

  els.practiceStepLabel.textContent = `Step ${index + 1}`;
  els.practicePrompt.textContent = question.prompt || '';
  if (question.context) {
    els.practiceContext.hidden = false;
    els.practiceContext.textContent = question.context;
  } else {
    els.practiceContext.hidden = true;
  }

  const choices = Array.isArray(question.choices) ? question.choices : [];
  const correctIdx = correctChoiceIndex(question);

  els.practiceChoices.replaceChildren();
  choices.forEach((choice, choiceIndex) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice-button';
    btn.textContent = typeof choice === 'string' || typeof choice === 'number' ? String(choice) : JSON.stringify(choice);

    if (record.phase === 'ask') {
      if (choiceIndex === record.selectedIndex) btn.classList.add('is-selected');
      btn.setAttribute('aria-pressed', choiceIndex === record.selectedIndex ? 'true' : 'false');
      btn.addEventListener('click', () => onChoiceSelected(index, question, choiceIndex));
    } else if (record.phase === 'wrong') {
      btn.disabled = true;
      if (choiceIndex === record.selectedIndex) {
        btn.classList.add('is-incorrect');
        appendMark(btn, '×', 'mark-incorrect');
      } else {
        btn.classList.add('is-dimmed');
      }
    } else if (record.phase === 'right') {
      btn.disabled = true;
      if (choiceIndex === correctIdx) {
        btn.classList.add('is-correct');
        appendMark(btn, '✓', 'mark-correct');
      } else {
        btn.classList.add('is-dimmed');
      }
    }
    els.practiceChoices.appendChild(btn);
  });

  renderPracticeActions(index, question, record);
}

function appendMark(button, symbol, cls) {
  const mark = document.createElement('span');
  mark.className = `choice-mark ${cls}`;
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = symbol;
  button.appendChild(mark);
}

function renderPracticeActions(index, question, record) {
  els.practiceActions.replaceChildren();
  els.practiceFeedbackSlot.replaceChildren();

  if (record.phase === 'ask') {
    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'primary-pill';
    checkBtn.textContent = 'Check answer';
    checkBtn.disabled = record.selectedIndex === null || record.selectedIndex === undefined;
    checkBtn.addEventListener('click', () => onCheckAnswer(index, question));

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'text-link-button';
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', () => {
      player.pause();
      player.next();
    });

    els.practiceActions.append(checkBtn, skipBtn);
    return;
  }

  const box = document.createElement('div');
  box.setAttribute('role', 'status');

  if (record.phase === 'wrong') {
    box.className = 'feedback-box is-wrong';
    const head = document.createElement('div');
    head.className = 'feedback-head';
    head.innerHTML =
      '<svg class="icon-wrong" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M9 9l6 6M15 9l-6 6"></path></svg>' +
      '<strong class="feedback-title">Not quite.</strong>';
    const body = document.createElement('p');
    body.className = 'feedback-body';
    body.textContent = record.pending ? 'Checking with the explainer…' : record.explanation || `The correct answer is: ${getCorrectChoiceText(question)}.`;
    box.append(head, body);
    els.practiceFeedbackSlot.appendChild(box);

    const tryAgainBtn = document.createElement('button');
    tryAgainBtn.type = 'button';
    tryAgainBtn.className = 'secondary-button';
    tryAgainBtn.textContent = 'Try again';
    tryAgainBtn.addEventListener('click', () => {
      record.phase = 'ask';
      record.selectedIndex = null;
      renderPracticePanel();
    });

    const showMeBtn = document.createElement('button');
    showMeBtn.type = 'button';
    showMeBtn.className = 'primary-pill';
    showMeBtn.textContent = 'Show me';
    showMeBtn.addEventListener('click', () => {
      player.pause();
      player.next();
    });

    els.practiceActions.append(tryAgainBtn, showMeBtn);
  } else if (record.phase === 'right') {
    box.className = 'feedback-box is-right';
    const head = document.createElement('div');
    head.className = 'feedback-head';
    head.innerHTML =
      '<svg class="icon-right" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M8 12.5l2.8 2.8L16.5 9.5"></path></svg>' +
      '<strong class="feedback-title">Correct!</strong>';
    const body = document.createElement('p');
    body.className = 'feedback-body';
    body.textContent = 'Nice work — on to the next step.';
    box.append(head, body);
    els.practiceFeedbackSlot.appendChild(box);

    const continueBtn = document.createElement('button');
    continueBtn.type = 'button';
    continueBtn.className = 'primary-pill';
    continueBtn.style.width = '100%';
    continueBtn.textContent = 'Continue';
    continueBtn.addEventListener('click', () => {
      player.pause();
      player.next();
    });
    els.practiceActions.appendChild(continueBtn);
  }
}

function onChoiceSelected(stepIndex, question, choiceIndex) {
  player.pause();
  const record = getOrInitAnswer(stepIndex);
  if (record.phase !== 'ask') return;
  record.selectedIndex = choiceIndex;
  renderPracticePanel();
}

function onCheckAnswer(stepIndex, question) {
  const record = getOrInitAnswer(stepIndex);
  if (record.selectedIndex === null || record.selectedIndex === undefined) return;
  record.attempts += 1;
  const correct = isCorrectChoice(question, record.selectedIndex);
  record.phase = correct ? 'right' : 'wrong';

  if (correct) {
    renderPracticePanel();
    return;
  }

  record.pending = true;
  const token = ++state.explainTokenSeq;
  record.token = token;
  renderPracticePanel();

  const structure = state.structure;
  const step = state.steps[stepIndex];
  const payload = {
    structure,
    step: { action: step.action, detail: step.detail },
    prompt: question.prompt,
    user_answer: describeChoice(question, record.selectedIndex),
    correct_answer: getCorrectChoiceText(question),
  };

  devSetStatus('POST /api/explain — sending…');
  postExplain(payload)
    .then((response) => {
      const current = state.answers.get(stepIndex);
      if (!current || current.token !== token || state.structure !== structure) return; // superseded
      current.pending = false;
      current.explanation =
        response && typeof response.explanation === 'string' ? response.explanation : `The correct answer is: ${getCorrectChoiceText(question)}.`;
      devSetStatus('POST /api/explain — 200 OK');
      renderPracticePanel();
    })
    .catch((err) => {
      const current = state.answers.get(stepIndex);
      if (!current || current.token !== token || state.structure !== structure) return; // superseded
      current.pending = false;
      current.explanation = `The correct answer is: ${getCorrectChoiceText(question)}.`;
      handleApiError('/api/explain', err);
      renderPracticePanel();
    });
}

// ---------- Lesson complete ----------

function renderCompletePanel() {
  const ready = state.workspacePhase === 'lesson' && state.captionsSettled;
  const atLastStep = player.length > 0 && player.index === player.length - 1;
  const hasQuestionHere = !!findQuestionForStep(player.index);

  if (!ready || !atLastStep || hasQuestionHere) {
    els.completePanel.hidden = true;
    return;
  }

  els.completePanel.hidden = false;
  els.completeSub.textContent = `You stepped through all ${state.steps.length} steps.`;

  const totalQuestions = state.questions.length;
  const correctFirstTry = Array.from(state.answers.values()).filter((a) => a.phase === 'right' && a.attempts === 1).length;
  const answeredCorrectly = Array.from(state.answers.values()).filter((a) => a.phase === 'right').length;

  els.completeStats.replaceChildren();
  addStatTile('Steps', String(state.steps.length));
  if (totalQuestions > 0) {
    addStatTile('Practice questions', String(totalQuestions));
    addStatTile('Correct', `${answeredCorrectly}/${totalQuestions}`);
    addStatTile('First try', String(correctFirstTry));
  }
}

function addStatTile(label, value) {
  const div = document.createElement('div');
  div.className = 'stat-tile';
  const dt = document.createElement('dt');
  dt.className = 'stat-label';
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.className = 'stat-value';
  dd.textContent = value;
  div.append(dt, dd);
  els.completeStats.appendChild(div);
}

// ---------- Lesson outline ----------

function renderOutline() {
  if (state.workspacePhase !== 'lesson' || state.steps.length === 0) {
    els.outlineList.replaceChildren();
    els.outlineMeta.textContent = '';
    return;
  }

  els.outlineMeta.textContent = state.captionsSettled ? `${player.index + 1} of ${state.steps.length}` : `${state.steps.length} steps`;
  els.outlineList.replaceChildren();

  state.steps.forEach((step, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    const isCurrent = i === player.index;
    const isDone = i < player.index;
    btn.className = 'outline-row' + (isCurrent ? ' is-current' : '') + (isDone ? ' is-done' : '');
    if (isCurrent) btn.setAttribute('aria-current', 'step');
    btn.addEventListener('click', () => player.goTo(i));

    const num = document.createElement('span');
    num.className = 'outline-num';
    num.setAttribute('aria-hidden', 'true');
    num.textContent = isDone ? '✓' : String(i + 1);

    const label = document.createElement('span');
    label.className = 'outline-label';
    const caption = typeof step.caption === 'string' && step.caption.trim() ? step.caption : fallbackCaption(step);
    label.textContent = caption;

    btn.append(num, label);

    if (findQuestionForStep(i)) {
      const pill = document.createElement('span');
      pill.className = 'outline-quick-pill';
      pill.textContent = 'Quick check';
      btn.appendChild(pill);
    }

    li.appendChild(btn);
    els.outlineList.appendChild(li);
  });
}

// ---------- Sandbox ----------

function onSandboxSubmit(e) {
  e.preventDefault();
  hideSandboxError();

  if (!state.structure || !state.vizModule) {
    showSandboxError('Load a lesson first.');
    return;
  }

  const { ops: newOps, error } = parseSandboxOps(els.sandboxInput.value, state.structure);
  if (error) {
    showSandboxError(error);
    return;
  }

  const combinedOps = [...state.ops, ...newOps];
  let newSteps;
  try {
    newSteps = state.vizModule.run(state.initial, combinedOps);
  } catch (err) {
    showSandboxError(`Running these operations failed: ${err.message}`);
    devLogError(`viz/${state.structure}.js run() (sandbox)`, err.message);
    return;
  }
  if (!Array.isArray(newSteps) || newSteps.length === 0) {
    showSandboxError('That produced no steps.');
    return;
  }

  const firstNewIndex = state.steps.length;
  state.ops = combinedOps;
  state.steps = newSteps;

  let questions = [];
  try {
    const result = state.vizModule.questions(newSteps);
    if (Array.isArray(result)) questions = result;
  } catch (err) {
    devLogError(`viz/${state.structure}.js questions() (sandbox)`, err.message);
  }
  state.questions = questions;

  els.sandboxInput.value = '';
  player.load(newSteps);
  player.goTo(Math.min(firstNewIndex, newSteps.length - 1));
  renderTitleRow();
  requestCaptions(state.structure, state.steps, state.lessonId, firstNewIndex);
}

function showSandboxError(msg) {
  els.sandboxError.textContent = msg;
  els.sandboxError.hidden = false;
}

function hideSandboxError() {
  els.sandboxError.hidden = true;
  els.sandboxError.textContent = '';
}

// ---------- Screenshot handling ----------

function onScreenshotChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  handleScreenshotFile(file);
}

function onQuestionPaste(e) {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  const imageItem = Array.from(items).find((item) => item.type && item.type.startsWith('image/'));
  if (!imageItem) return; // let plain text paste through as normal
  const file = imageItem.getAsFile();
  if (!file) return;
  e.preventDefault(); // this paste is the screenshot, not text for the textarea
  handleScreenshotFile(file);
}

function handleScreenshotFile(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    showScreenshotError('Please choose a PNG, JPEG, WEBP, or GIF image.');
    els.screenshotInput.value = '';
    return;
  }
  if (file.size > MAX_SCREENSHOT_BYTES) {
    showScreenshotError('Image is too large (max 5 MB).');
    els.screenshotInput.value = '';
    return;
  }
  hideScreenshotError();

  const reader = new FileReader();
  reader.onload = () => {
    const base64 = String(reader.result).split(',').pop();
    setScreenshot(file, base64);
  };
  reader.onerror = () => {
    showScreenshotError('Could not read that image file.');
  };
  reader.readAsDataURL(file);
}

function setScreenshotRowVisible(visible) {
  els.screenshotRow.classList.toggle('is-visible', visible);
  els.screenshotRow.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function setScreenshot(file, base64) {
  releasePreviewUrl();
  const previewUrl = URL.createObjectURL(file);
  state.screenshot = { file, base64, previewUrl };
  els.screenshotPreviewImg.src = previewUrl;
  els.screenshotFilename.textContent = file.name;
  els.screenshotSub.textContent = `Screenshot · ${Math.max(1, Math.round(file.size / 1024))} KB`;
  setScreenshotRowVisible(true);
  els.wsScreenshotChip.hidden = false;
  els.wsScreenshotChip.textContent = file.name;
}

function onScreenshotRemove() {
  releasePreviewUrl();
  state.screenshot = { file: null, base64: null, previewUrl: null };
  els.screenshotInput.value = '';
  setScreenshotRowVisible(false);
  els.screenshotPreviewImg.removeAttribute('src');
  els.wsScreenshotChip.hidden = true;
}

function releasePreviewUrl() {
  if (state.screenshot.previewUrl) URL.revokeObjectURL(state.screenshot.previewUrl);
}

function showScreenshotError(msg) {
  els.screenshotError.textContent = msg;
  els.screenshotError.hidden = false;
}

function hideScreenshotError() {
  els.screenshotError.hidden = true;
  els.screenshotError.textContent = '';
}

// ---------- Composer error banner ----------

function showPlanError(text, status) {
  els.composer.classList.add('has-error');
  els.planErrorBanner.hidden = false;
  els.planErrorBody.textContent = text;
  els.planErrorCode.textContent = status ? `Error ${status}` : '';
  els.generateBtnLabel.textContent = 'Retry';
}

function hidePlanError() {
  els.composer.classList.remove('has-error');
  els.planErrorBanner.hidden = true;
  els.planErrorBody.textContent = '';
  els.planErrorCode.textContent = '';
  els.generateBtnLabel.textContent = 'Visualize';
}

// ---------- Developer tools ----------

const MODE_LABELS = { live: 'Live API', manual: 'Manual JSON', cached: 'Cached demo response' };

function setMode(mode) {
  state.mode = mode;
  els.devMode.textContent = MODE_LABELS[mode] || mode;
}

function devSetStatus(text) {
  els.devStatus.textContent = `${text} — ${new Date().toLocaleTimeString()}`;
}

function devShowPlanPreview(response, source) {
  const labels = {
    manual: '[manual test input, not from the live backend]\n',
    cached: '[cached demo response, not a live /api/plan call]\n',
  };
  els.devPlanPreview.textContent = (labels[source] || '') + JSON.stringify(response, null, 2);
}

function devLogError(source, message) {
  const li = document.createElement('li');
  li.textContent = `[${new Date().toLocaleTimeString()}] ${source}: ${message}`;
  els.devErrors.prepend(li);
  while (els.devErrors.children.length > 20) {
    els.devErrors.removeChild(els.devErrors.lastChild);
  }
}

function handleApiError(path, err) {
  const status = err instanceof ApiError ? err.status : 0;
  devSetStatus(`${path} — ${status ? `HTTP ${status}` : 'network/parse error'}`);
  devLogError(path, describeError(err));
}

function describeError(err) {
  if (err instanceof ApiError) return err.message;
  return err && err.message ? err.message : String(err);
}

function onLoadManualJson() {
  hideDevJsonError();
  let parsed;
  try {
    parsed = JSON.parse(els.devJsonInput.value);
  } catch {
    showDevJsonError('That is not valid JSON.');
    return;
  }
  if (!parsed || typeof parsed !== 'object') {
    showDevJsonError('Expected a JSON object.');
    return;
  }
  const hasNullShape = parsed.structure === null && typeof parsed.message === 'string';
  const hasStructureShape = typeof parsed.structure === 'string' && Array.isArray(parsed.initial) && Array.isArray(parsed.ops);
  if (!hasNullShape && !hasStructureShape) {
    showDevJsonError('Expected { structure, initial, ops, source } or { structure: null, message }.');
    return;
  }

  setMode('manual');
  ++state.planRequestToken; // invalidate any in-flight live /api/plan request
  devSetStatus('Manual plan response loaded');
  setScreen('workspace');
  handlePlanResponse(parsed, { source: 'manual' });
}

function showDevJsonError(msg) {
  els.devJsonError.textContent = msg;
  els.devJsonError.hidden = false;
}

function hideDevJsonError() {
  els.devJsonError.hidden = true;
  els.devJsonError.textContent = '';
}
