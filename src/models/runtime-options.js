export const STANDARD_WASM_FILES = Object.freeze({
  mjs: 'ort-wasm-simd-threaded.mjs',
  wasm: 'ort-wasm-simd-threaded.wasm',
});

const withTrailingSlash = (value) => (value.endsWith('/') ? value : `${value}/`);

export function isIOSPlatform(navigatorLike = {}) {
  return (
    /iP(?:hone|ad|od)/.test(navigatorLike.userAgent ?? '') ||
    (navigatorLike.platform === 'MacIntel' && navigatorLike.maxTouchPoints > 1)
  );
}

function standardWasmPaths(source) {
  if (typeof source === 'string') {
    const base = withTrailingSlash(source);
    return {
      mjs: `${base}${STANDARD_WASM_FILES.mjs}`,
      wasm: `${base}${STANDARD_WASM_FILES.wasm}`,
    };
  }
  if (!source || typeof source !== 'object' || !source.mjs || !source.wasm) return null;
  return {
    mjs: source.mjs.replace('.asyncify.mjs', '.mjs'),
    wasm: source.wasm.replace('.asyncify.wasm', '.wasm'),
  };
}

function wasmBinary(paths) {
  const values =
    paths && typeof paths === 'object' ? [paths.mjs, paths.wasm] : [String(paths ?? '')];
  if (values.some((value) => value?.includes('.asyncify.'))) return 'asyncify';
  if (values.some((value) => value?.includes('ort-wasm'))) return 'standard';
  return 'runtime-default';
}

export function applyRuntimeOptions(env, options, scope = globalThis) {
  env.allowLocalModels = false;
  if (options.modelBaseUrl) {
    env.remoteHost = withTrailingSlash(options.modelBaseUrl);
  }

  const wasm = env.backends.onnx.wasm;
  const ios = isIOSPlatform(scope.navigator);
  if (options.wasmPaths) {
    wasm.wasmPaths = options.wasmPaths;
  } else if (ios) {
    const paths = standardWasmPaths(options.wasmBaseUrl ?? wasm.wasmPaths);
    if (paths) wasm.wasmPaths = paths;
  } else if (options.wasmBaseUrl) {
    wasm.wasmPaths = withTrailingSlash(options.wasmBaseUrl);
  }
  wasm.numThreads = scope.crossOriginIsolated ? options.threads : 1;

  return Object.freeze({
    name: 'transformers.js',
    version: String(env.version ?? 'unknown'),
    backend: 'wasm',
    wasmBinary: wasmBinary(wasm.wasmPaths),
    threads: wasm.numThreads,
    isolated: scope.crossOriginIsolated === true,
    cores: scope.navigator?.hardwareConcurrency ?? null,
    simd: wasm.simd ?? null,
    ios,
  });
}
