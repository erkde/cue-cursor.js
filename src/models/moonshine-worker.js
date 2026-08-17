import { applyRuntimeOptions } from './runtime-options.js';

let recognizer = null;
let loading = null;
let runtime = null;
let preparationDiagnostic = null;
let preparationPhase = 'download';

function loadRuntime(runtimeUrl) {
  if (runtimeUrl) return import(/* @vite-ignore */ runtimeUrl);
  return import('@huggingface/transformers');
}

async function prepare(options) {
  if (recognizer) return preparationDiagnostic;
  if (loading) return loading;

  loading = (async () => {
    const startedAt = performance.now();
    let warmupStartedAt = null;
    let sawDownloadProgress = false;
    preparationPhase = 'download';
    runtime ??= loadRuntime(options.runtimeUrl);
    const { env, pipeline } = await runtime;
    const runtimeDiagnostic = applyRuntimeOptions(env, options, self);
    recognizer = await pipeline('automatic-speech-recognition', options.modelId, {
      device: 'wasm',
      dtype: options.dtype,
      revision: options.revision,
      session_options: { graphOptimizationLevel: 'basic' },
      progress_callback(progress) {
        if (progress.status !== 'progress' || !progress.loaded) return;
        sawDownloadProgress = true;
        self.postMessage({
          type: 'progress',
          file: progress.file?.split('/').pop(),
          loadedBytes: progress.loaded,
          totalBytes: progress.total || undefined,
        });
      },
    });
    preparationPhase = 'warmup';
    warmupStartedAt = performance.now();
    self.postMessage({ type: 'progress', phase: 'warmup' });
    await recognizer(new Float32Array(options.sampleRate));
    const readyAt = performance.now();
    preparationDiagnostic = Object.freeze({
      kind: 'model-ready',
      cached: !sawDownloadProgress,
      totalMs: Math.round(readyAt - startedAt),
      downloadMs: Math.round(warmupStartedAt - startedAt),
      warmupMs: Math.round(readyAt - warmupStartedAt),
      model: {
        id: options.modelId,
        revision: options.revision,
        dtype: options.dtype,
      },
      runtime: runtimeDiagnostic,
    });
    return preparationDiagnostic;
  })();

  try {
    await loading;
  } finally {
    loading = null;
  }
}

self.onmessage = async (event) => {
  const { id, type } = event.data;
  try {
    if (type === 'prepare') {
      const diagnostic = await prepare(event.data.options);
      self.postMessage({ type: 'prepared', id, diagnostic });
    } else if (type === 'transcribe') {
      if (!recognizer) throw new Error('Moonshine has not been prepared');
      const startedAt = performance.now();
      const result = await recognizer(event.data.audio);
      self.postMessage({
        type: 'result',
        id,
        text: result.text.trim(),
        inferenceMs: Math.round(performance.now() - startedAt),
      });
    } else if (type === 'dispose') {
      await loading?.catch(() => {});
      await recognizer?.dispose?.();
      recognizer = null;
      preparationDiagnostic = null;
      self.postMessage({ type: 'disposed', id });
      self.close();
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      phase:
        type === 'prepare' ? preparationPhase : type === 'transcribe' ? 'inference' : 'dispose',
      message: String(error?.message ?? error),
    });
  }
};
