export type CueScriptWord = string | { text: string; key?: string | number };
export type CueScript = string | readonly CueScriptWord[];

export interface CueWord {
  readonly index: number;
  readonly text: string;
  readonly normalized: string;
  readonly key?: string | number;
}

export interface CueModelProgress {
  phase?: 'download' | 'warmup';
  file?: string;
  loadedBytes?: number;
  totalBytes?: number;
}

export interface CueModelResult {
  text: string;
  inferenceMs?: number;
}

export interface CueModelInput {
  readonly sampleRate: number;
  readonly windowSeconds: number;
  readonly minimumSeconds: number;
  readonly intervalMs: number;
}

export interface CueModel {
  readonly input: CueModelInput;
  prepare(options?: { onProgress?: (progress: CueModelProgress) => void }): Promise<void>;
  transcribe(audio: Float32Array): Promise<CueModelResult>;
  dispose(): Promise<void>;
}

export type CueState =
  | { status: 'idle' }
  | ({ status: 'preparing' } & CueModelProgress)
  | { status: 'ready' }
  | { status: 'listening' }
  | { status: 'error'; error: unknown }
  | { status: 'destroyed' };

export interface CueStateEvent extends Event {
  readonly detail: CueState;
}

export interface CueTranscriptEvent extends Event {
  readonly detail: CueModelResult;
}

export interface CuePositionEvent extends Event {
  readonly detail: {
    position: number;
    previousPosition: number;
    source: 'speech' | 'seek';
    transcript?: string;
  };
}

export interface Cue extends EventTarget {
  readonly state: CueState;
  readonly words: readonly CueWord[];
  readonly position: number;

  setScript(script: CueScript): readonly CueWord[];
  prepare(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  seek(position: number): number;
  destroy(): Promise<void>;

  addEventListener(type: 'statechange', listener: (event: CueStateEvent) => void): void;
  addEventListener(type: 'transcript', listener: (event: CueTranscriptEvent) => void): void;
  addEventListener(type: 'positionchange', listener: (event: CuePositionEvent) => void): void;
}

export function createCue(options: { script?: CueScript; model: CueModel }): Cue;
