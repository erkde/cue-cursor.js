const DEFAULT_OPTIONS = Object.freeze({
  modelId: 'onnx-community/moonshine-tiny-ONNX',
  revision: 'a6da1241cd305dcd64eab1edbd615f2bb9aabb95',
  dtype: 'q8',
  sampleRate: 16_000,
  windowSeconds: 3,
  minimumSeconds: 1.5,
  intervalMs: 180,
  threads: 1,
});

class DetailEvent extends Event {
  constructor(type, detail) {
    super(type);
    this.detail = detail;
  }
}

class MoonshineModel extends EventTarget {
  constructor(options) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.input = Object.freeze({
      sampleRate: this.options.sampleRate,
      windowSeconds: this.options.windowSeconds,
      minimumSeconds: this.options.minimumSeconds,
      intervalMs: this.options.intervalMs,
    });
    this.worker = null;
    this.workerPromise = null;
    this.nextId = 1;
    this.pending = new Map();
    this.progressCallback = null;
    this.prepared = false;
    this.workerGeneration = 0;
  }

  async ensureWorker() {
    if (this.worker) return this.worker;
    if (!this.workerPromise) {
      const generation = this.workerGeneration;
      // Keep the model runtime out of both the Cue core and the model adapter
      // chunk. Vite turns this worker import into a separate production asset,
      // fetched only when the model is prepared.
      this.workerPromise = import('./moonshine-worker.js?worker')
        .then(({ default: MoonshineWorker }) => {
          const worker = new MoonshineWorker();
          if (generation !== this.workerGeneration) {
            worker.terminate();
            throw new Error('Moonshine worker was terminated');
          }
          this.worker = worker;
          worker.addEventListener('message', (event) => this.onMessage(event.data));
          worker.addEventListener('error', (event) => {
            const message = event.message || 'Moonshine worker failed';
            this.emitDiagnostic({ kind: 'worker-error', phase: 'boot', message });
            this.resetWorker(message);
          });
          return worker;
        })
        .catch((error) => {
          if (generation === this.workerGeneration) this.workerPromise = null;
          throw error;
        });
    }
    return this.workerPromise;
  }

  async request(type, data = {}, transfer = []) {
    const worker = await this.ensureWorker();
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ type, id, ...data }, transfer);
    });
  }

  onMessage(message) {
    if (message.type === 'progress') {
      this.progressCallback?.(message);
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.type === 'error') {
      this.emitDiagnostic({
        kind: 'worker-error',
        phase: message.phase ?? 'unknown',
        message: message.message,
      });
      const error = new Error(message.message);
      error.phase = message.phase ?? 'unknown';
      pending.reject(error);
    } else {
      if (message.diagnostic) this.emitDiagnostic(message.diagnostic);
      pending.resolve(message);
    }
  }

  emitDiagnostic(detail) {
    this.dispatchEvent(new DetailEvent('diagnostic', Object.freeze(detail)));
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  async prepare({ onProgress } = {}) {
    if (this.prepared) return;
    this.progressCallback = onProgress ?? null;
    try {
      await this.request('prepare', { options: this.options });
      this.prepared = true;
    } finally {
      this.progressCallback = null;
    }
  }

  async transcribe(audio) {
    const message = await this.request('transcribe', { audio }, [audio.buffer]);
    return { text: message.text, inferenceMs: message.inferenceMs };
  }

  async dispose() {
    if (!this.worker) return;
    try {
      await this.request('dispose');
    } finally {
      this.resetWorker('Moonshine was disposed', 'dispose');
    }
  }

  terminate() {
    this.resetWorker('Moonshine was terminated', 'pagehide');
  }

  resetWorker(message, reason) {
    const worker = this.worker;
    const existed = Boolean(worker || this.workerPromise);
    this.workerGeneration += 1;
    this.worker = null;
    this.workerPromise = null;
    this.prepared = false;
    this.progressCallback = null;
    worker?.terminate();
    this.rejectAll(new Error(message));
    if (existed && reason) this.emitDiagnostic({ kind: 'worker-terminated', reason });
  }
}

export function moonshine(options = {}) {
  return new MoonshineModel(options);
}
