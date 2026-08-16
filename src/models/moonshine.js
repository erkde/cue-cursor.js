import defaultRuntimeUrl from '@huggingface/transformers?url&no-inline';

const DEFAULT_OPTIONS = Object.freeze({
  modelId: 'onnx-community/moonshine-tiny-ONNX',
  revision: 'a6da1241cd305dcd64eab1edbd615f2bb9aabb95',
  dtype: 'q8',
  runtimeUrl: defaultRuntimeUrl,
  sampleRate: 16_000,
  windowSeconds: 3,
  minimumSeconds: 1.5,
  intervalMs: 180,
  threads: 1,
});

class MoonshineModel {
  constructor(options) {
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
  }

  async ensureWorker() {
    if (this.worker) return this.worker;
    if (!this.workerPromise) {
      // Keep the model runtime out of both the Cue core and the model adapter
      // chunk. Vite turns this worker import into a separate production asset,
      // fetched only when the model is prepared.
      this.workerPromise = import('./moonshine-worker.js?worker')
        .then(({ default: MoonshineWorker }) => {
          this.worker = new MoonshineWorker();
          this.worker.addEventListener('message', (event) => this.onMessage(event.data));
          this.worker.addEventListener('error', (event) => {
            this.rejectAll(new Error(event.message || 'Moonshine worker failed'));
          });
          return this.worker;
        })
        .catch((error) => {
          this.workerPromise = null;
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
    if (message.type === 'error') pending.reject(new Error(message.message));
    else pending.resolve(message);
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  async prepare({ onProgress } = {}) {
    if (this.prepared) return;
    this.progressCallback = onProgress ?? null;
    await this.request('prepare', { options: this.options });
    this.prepared = true;
    this.progressCallback = null;
  }

  async transcribe(audio) {
    const message = await this.request('transcribe', { audio }, [audio.buffer]);
    return { text: message.text, inferenceMs: message.inferenceMs };
  }

  async dispose() {
    if (!this.worker) return;
    const worker = this.worker;
    try {
      await this.request('dispose');
    } finally {
      worker.terminate();
      this.worker = null;
      this.workerPromise = null;
      this.prepared = false;
      this.rejectAll(new Error('Moonshine was disposed'));
    }
  }
}

export function moonshine(options = {}) {
  return new MoonshineModel(options);
}
