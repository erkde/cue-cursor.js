import type { CueModel } from '../index.js';

export interface MoonshineOptions {
  modelId?: string;
  revision?: string;
  dtype?: string;
  runtimeUrl?: string;
  sampleRate?: number;
  windowSeconds?: number;
  minimumSeconds?: number;
  intervalMs?: number;
  threads?: number;
  modelBaseUrl?: string;
  wasmBaseUrl?: string;
  wasmPaths?: string | { mjs: string; wasm: string };
}

export function moonshine(options?: MoonshineOptions): CueModel;
