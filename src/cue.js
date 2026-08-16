import { Matcher } from './matcher.js';
import { Microphone } from './microphone.js';
import { tokenizeScript } from './script.js';
import { enoughAudioForAsr, rmsGateOpen } from './speech-gate.js';

class DetailEvent extends Event {
  constructor(type, detail) {
    super(type);
    this.detail = detail;
  }
}

function assertModel(model) {
  const input = model?.input;
  if (
    !model ||
    !input ||
    !Number.isFinite(input.sampleRate) ||
    input.sampleRate <= 0 ||
    !Number.isFinite(input.windowSeconds) ||
    input.windowSeconds <= 0 ||
    !Number.isFinite(input.minimumSeconds) ||
    input.minimumSeconds <= 0 ||
    input.minimumSeconds > input.windowSeconds ||
    !Number.isFinite(input.intervalMs) ||
    input.intervalMs < 0 ||
    typeof model.prepare !== 'function' ||
    typeof model.transcribe !== 'function' ||
    typeof model.dispose !== 'function'
  ) {
    throw new TypeError(
      'model must provide input requirements, prepare(), transcribe(), and dispose()',
    );
  }
}

export class Cue extends EventTarget {
  #model;
  #matcher = null;
  #state = Object.freeze({ status: 'idle' });
  #prepared = false;
  #preparing = null;
  #active = false;
  #destroyed = false;
  #microphone = null;
  #captureSync = Promise.resolve();
  #timer = null;
  #positionVersion = 0;
  #lastTranscript = '';
  #visibilityHandler;

  constructor({ script = [], model }) {
    super();
    assertModel(model);
    this.#model = model;
    this.words = Object.freeze([]);
    this.position = -1;
    this.setScript(script);
    this.#visibilityHandler = () => this.#onVisibilityChange();
    globalThis.document?.addEventListener('visibilitychange', this.#visibilityHandler);
  }

  get state() {
    return this.#state;
  }

  setScript(script) {
    this.#assertUsable();
    if (this.#active)
      throw new DOMException('Stop Cue before replacing its script', 'InvalidStateError');
    this.words = tokenizeScript(script);
    this.#matcher = new Matcher(this.words.map((word) => word.normalized));
    this.position = this.words.length ? 0 : -1;
    this.#lastTranscript = '';
    this.#positionVersion += 1;
    return this.words;
  }

  prepare() {
    this.#assertUsable();
    if (this.#prepared) return Promise.resolve();
    if (this.#preparing) return this.#preparing;

    this.#setState({ status: 'preparing', phase: 'download' });
    this.#preparing = this.#model
      .prepare({
        onProgress: (progress) => {
          this.#setState({
            status: 'preparing',
            phase: progress.phase ?? 'download',
            ...(progress.file ? { file: progress.file } : {}),
            ...(progress.loadedBytes == null ? {} : { loadedBytes: progress.loadedBytes }),
            ...(progress.totalBytes == null ? {} : { totalBytes: progress.totalBytes }),
          });
        },
      })
      .then(() => {
        this.#prepared = true;
        if (!this.#active) this.#setState({ status: 'ready' });
      })
      .catch((error) => {
        this.#setState({ status: 'error', error });
        throw error;
      })
      .finally(() => {
        this.#preparing = null;
      });
    return this.#preparing;
  }

  start() {
    this.#assertUsable();
    if (this.#active) return Promise.resolve();
    if (!this.words.length) {
      return Promise.reject(
        new DOMException('Load a script before starting Cue', 'InvalidStateError'),
      );
    }

    // Creating/resuming the AudioContext must happen before the first await and
    // directly in the initiating click/tap stack on Mobile Safari.
    const prime = Microphone.prime();
    this.#active = true;
    return this.#finishStart(prime);
  }

  async #finishStart(prime) {
    try {
      await prime;
      await this.prepare();
      if (!this.#active) {
        await Microphone.releasePrime();
        return;
      }
      await this.#syncCapture();
      if (!this.#active) return;
      this.#setState({ status: 'listening' });
      if (this.#microphone) this.#scheduleInference(0);
    } catch (error) {
      this.#active = false;
      await this.#syncCapture().catch(() => {});
      await Microphone.releasePrime().catch(() => {});
      this.#setState({ status: 'error', error });
      throw error;
    }
  }

  async stop() {
    this.#assertUsable();
    this.#active = false;
    this.#positionVersion += 1;
    clearTimeout(this.#timer);
    this.#timer = null;
    await this.#syncCapture();
    await Microphone.releasePrime();
    if (this.#prepared) this.#setState({ status: 'ready' });
    else if (!this.#preparing) this.#setState({ status: 'idle' });
  }

  seek(position) {
    this.#assertUsable();
    if (!Number.isFinite(position)) throw new TypeError('position must be a finite number');
    const previousPosition = this.position;
    const nextPosition = this.#matcher.seek(position);
    if (nextPosition == null) return -1;

    this.position = nextPosition;
    this.#positionVersion += 1;
    this.#lastTranscript = '';
    if (nextPosition !== previousPosition) {
      this.#emit('positionchange', {
        position: nextPosition,
        previousPosition,
        source: 'seek',
      });
    }
    return nextPosition;
  }

  async destroy() {
    if (this.#destroyed) return;
    await this.stop();
    globalThis.document?.removeEventListener('visibilitychange', this.#visibilityHandler);
    await this.#model.dispose();
    this.#destroyed = true;
    this.#setState({ status: 'destroyed' });
  }

  #assertUsable() {
    if (this.#destroyed) throw new DOMException('Cue has been destroyed', 'InvalidStateError');
  }

  #setState(state) {
    this.#state = Object.freeze(state);
    this.#emit('statechange', this.#state);
  }

  #emit(type, detail) {
    this.dispatchEvent(new DetailEvent(type, detail));
  }

  #isVisible() {
    return !globalThis.document || globalThis.document.visibilityState === 'visible';
  }

  #onVisibilityChange() {
    if (!this.#active) return;
    this.#syncCapture()
      .then(() => {
        if (this.#microphone) this.#scheduleInference(0);
      })
      .catch((error) => this.#fail(error));
  }

  #syncCapture() {
    this.#captureSync = this.#captureSync
      .catch(() => {})
      .then(async () => {
        const wanted = this.#active && this.#prepared && this.#isVisible();
        if (wanted && !this.#microphone) {
          const microphone = new Microphone({
            sampleRate: this.#model.input.sampleRate,
            bufferSeconds: this.#model.input.windowSeconds,
          });
          this.#microphone = microphone;
          try {
            await microphone.start();
          } catch (error) {
            if (this.#microphone === microphone) this.#microphone = null;
            throw error;
          }
          if (!(this.#active && this.#isVisible())) {
            this.#microphone = null;
            await microphone.stop();
          }
        } else if (!wanted && this.#microphone) {
          const microphone = this.#microphone;
          this.#microphone = null;
          clearTimeout(this.#timer);
          this.#timer = null;
          await microphone.stop();
        }
      });
    return this.#captureSync;
  }

  #scheduleInference(delay = this.#model.input.intervalMs) {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#runInference(), delay);
  }

  async #runInference() {
    if (!this.#active || !this.#microphone) return;
    const { sampleRate, windowSeconds, minimumSeconds } = this.#model.input;
    const audio = this.#microphone.latest(windowSeconds);
    if (
      !enoughAudioForAsr(audio.length, { sampleRate, minimumSeconds }) ||
      !rmsGateOpen(audio, { sampleRate })
    ) {
      this.#scheduleInference();
      return;
    }

    const positionVersion = this.#positionVersion;
    try {
      const result = await this.#model.transcribe(audio);
      if (!this.#active || positionVersion !== this.#positionVersion) return;
      this.#acceptTranscript(result);
    } catch (error) {
      await this.#fail(error);
      return;
    }
    if (this.#active && this.#microphone) this.#scheduleInference();
  }

  #acceptTranscript({ text, inferenceMs }) {
    if (!text || text === this.#lastTranscript) return;
    this.#lastTranscript = text;
    this.#emit('transcript', {
      text,
      ...(inferenceMs == null ? {} : { inferenceMs }),
    });

    const previousPosition = this.position;
    const position = this.#matcher.feed(text);
    if (position == null || position === previousPosition) return;
    this.position = position;
    this.#emit('positionchange', {
      position,
      previousPosition,
      source: 'speech',
      transcript: text,
    });
  }

  async #fail(error) {
    this.#active = false;
    clearTimeout(this.#timer);
    this.#timer = null;
    await this.#syncCapture().catch(() => {});
    this.#setState({ status: 'error', error });
  }
}
