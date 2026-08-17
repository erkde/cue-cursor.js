import assert from 'node:assert/strict';
import test from 'node:test';

import { applyRuntimeOptions, isIOSPlatform } from '../src/models/runtime-options.js';

const asyncifyPaths = {
  mjs: 'https://cdn.example/ort-wasm-simd-threaded.asyncify.mjs',
  wasm: 'https://cdn.example/ort-wasm-simd-threaded.asyncify.wasm',
};

function runtimeEnv() {
  return {
    backends: {
      onnx: {
        wasm: { wasmPaths: { ...asyncifyPaths }, simd: true },
      },
    },
    version: '4.2.0',
  };
}

test('recognizes every iOS browser shell', () => {
  assert.equal(
    isIOSPlatform({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/151.0',
    }),
    true,
  );
});

test('forces standard ONNX WASM paths on Chrome for iOS', () => {
  const env = runtimeEnv();
  const diagnostic = applyRuntimeOptions(
    env,
    { threads: 4 },
    {
      navigator: { userAgent: 'iPhone CriOS/151.0', hardwareConcurrency: 6 },
      crossOriginIsolated: true,
    },
  );

  assert.deepEqual(env.backends.onnx.wasm.wasmPaths, {
    mjs: 'https://cdn.example/ort-wasm-simd-threaded.mjs',
    wasm: 'https://cdn.example/ort-wasm-simd-threaded.wasm',
  });
  assert.equal(diagnostic.wasmBinary, 'standard');
  assert.equal(diagnostic.version, '4.2.0');
  assert.equal(diagnostic.threads, 4);
  assert.equal(diagnostic.ios, true);
});

test('reports the runtime-provided Transformers version', () => {
  const env = runtimeEnv();
  env.version = '4.3.0';

  const diagnostic = applyRuntimeOptions(env, { threads: 1 }, {});

  assert.equal(diagnostic.version, '4.3.0');
});

test('keeps the runtime-selected binary outside iOS and limits unisolated threads', () => {
  const env = runtimeEnv();
  const diagnostic = applyRuntimeOptions(
    env,
    { threads: 4 },
    {
      navigator: { userAgent: 'Firefox', hardwareConcurrency: 8 },
      crossOriginIsolated: false,
    },
  );

  assert.deepEqual(env.backends.onnx.wasm.wasmPaths, asyncifyPaths);
  assert.equal(diagnostic.wasmBinary, 'asyncify');
  assert.equal(diagnostic.threads, 1);
  assert.equal(diagnostic.ios, false);
});

test('respects an explicit WASM file mapping', () => {
  const env = runtimeEnv();
  const wasmPaths = {
    mjs: 'https://self.example/custom.mjs',
    wasm: 'https://self.example/custom.wasm',
  };
  const diagnostic = applyRuntimeOptions(
    env,
    { threads: 1, wasmPaths },
    {
      navigator: { userAgent: 'iPhone' },
      crossOriginIsolated: false,
    },
  );

  assert.equal(env.backends.onnx.wasm.wasmPaths, wasmPaths);
  assert.equal(diagnostic.wasmBinary, 'runtime-default');
});
