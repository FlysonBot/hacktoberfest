// Step player: owns navigation (back/next/restart), autoplay timing, and
// boundary state. It knows nothing about algorithms or rendering — it just
// indexes into whatever `steps` array it is given and tells the caller
// (app.js) when the current index/playing state changed, via onChange.

export function clampIndex(index, length) {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index > length - 1) return length - 1;
  return index;
}

export function isAtStart(index) {
  return index <= 0;
}

export function isAtEnd(index, length) {
  return length <= 0 || index >= length - 1;
}

const DEFAULT_INTERVAL_MS = 2000;

export class Player {
  constructor({ onChange, intervalMs = DEFAULT_INTERVAL_MS } = {}) {
    this.steps = [];
    this.index = 0;
    this.playing = false;
    this.intervalMs = intervalMs;
    this.onChange = onChange || (() => {});
    this._timer = null;
  }

  get length() {
    return this.steps.length;
  }

  get currentStep() {
    return this.steps[this.index] ?? null;
  }

  canGoBack() {
    return this.length > 0 && !isAtStart(this.index);
  }

  canGoNext() {
    return this.length > 0 && !isAtEnd(this.index, this.length);
  }

  load(steps) {
    this._clearTimer();
    this.steps = Array.isArray(steps) ? steps : [];
    this.index = 0;
    this.playing = false;
    this._emit();
  }

  back() {
    this.pause();
    if (!this.canGoBack()) return;
    this.index = clampIndex(this.index - 1, this.length);
    this._emit();
  }

  next() {
    this.pause();
    if (!this.canGoNext()) return;
    this.index = clampIndex(this.index + 1, this.length);
    this._emit();
  }

  restart() {
    this.pause();
    this.index = 0;
    this._emit();
  }

  // Jumps to an arbitrary step (lesson outline rows, sandbox landing on the
  // first newly-computed step). Pauses first, like back/next/restart.
  goTo(index) {
    this.pause();
    if (this.length === 0) return;
    this.index = clampIndex(index, this.length);
    this._emit();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this._clearTimer();
    this._emit();
  }

  play() {
    if (this.length === 0) return;
    // Pressing Play at the last step restarts from the beginning.
    if (isAtEnd(this.index, this.length)) this.index = 0;
    this.playing = true;
    this._scheduleTick();
    this._emit();
  }

  togglePlay() {
    if (this.playing) this.pause();
    else this.play();
  }

  destroy() {
    this._clearTimer();
  }

  _scheduleTick() {
    this._clearTimer();
    this._timer = setTimeout(() => this._tick(), this.intervalMs);
  }

  _tick() {
    if (!this.playing) return;
    this.index = clampIndex(this.index + 1, this.length);
    const atEnd = isAtEnd(this.index, this.length);
    this._emit(); // listeners (e.g. a practice question appearing) may call pause() here
    if (!this.playing) return;
    if (atEnd) {
      this.pause();
      return;
    }
    this._scheduleTick();
  }

  _clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _emit() {
    this.onChange({
      index: this.index,
      length: this.length,
      step: this.currentStep,
      playing: this.playing,
      canGoBack: this.canGoBack(),
      canGoNext: this.canGoNext(),
    });
  }
}
