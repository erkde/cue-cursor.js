let recognizer = null;
let loading = null;
let runtime = null;

function loadRuntime(runtimeUrl) {
  if (runtimeUrl) return import(/* @vite-ignore */ runtimeUrl);
  return import('@huggingface/transformers');
}

function applyRuntimeOptions(env, options) {
  env.allowLocalModels = false;
  if (options.modelBaseUrl) {
    env.remoteHost = options.modelBaseUrl.endsWith('/')
      ? options.modelBaseUrl
      : `${options.modelBaseUrl}/`;
  }
  if (options.wasmBaseUrl) {
    env.backends.onnx.wasm.wasmPaths = options.wasmBaseUrl.endsWith('/')
      ? options.wasmBaseUrl
      : `${options.wasmBaseUrl}/`;
  }
  env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? options.threads : 1;
}

async function prepare(options) {
  if (recognizer) return;
  if (loading) return loading;

  loading = (async () => {
    runtime ??= loadRuntime(options.runtimeUrl);
    const { env, pipeline } = await runtime;
    applyRuntimeOptions(env, options);
    recognizer = await pipeline('automatic-speech-recognition', options.modelId, {
      device: 'wasm',
      dtype: options.dtype,
      revision: options.revision,
      session_options: { graphOptimizationLevel: 'basic' },
      progress_callback(progress) {
        if (progress.status !== 'progress' || !progress.loaded) return;
        self.postMessage({
          type: 'progress',
          file: progress.file?.split('/').pop(),
          loadedBytes: progress.loaded,
          totalBytes: progress.total || undefined,
        });
      },
    });
    self.postMessage({ type: 'progress', phase: 'warmup' });
    await recognizer(new Float32Array(options.sampleRate));
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
      await prepare(event.data.options);
      self.postMessage({ type: 'prepared', id });
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
      self.postMessage({ type: 'disposed', id });
      self.close();
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      message: String(error?.message ?? error),
    });
  }
};
