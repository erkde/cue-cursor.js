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
  terminate?(): void;
  addEventListener?(type: 'diagnostic', listener: (event: CueModelDiagnosticEvent) => void): void;
  removeEventListener?(
    type: 'diagnostic',
    listener: (event: CueModelDiagnosticEvent) => void,
  ): void;
}

export type CueDiagnostic =
  | {
      readonly version: 1;
      readonly kind: 'model-ready';
      readonly cached: boolean;
      readonly totalMs: number;
      readonly downloadMs: number;
      readonly warmupMs: number;
      readonly model: {
        readonly id: string;
        readonly revision: string;
        readonly dtype: string;
      };
      readonly runtime: {
        readonly name: string;
        readonly version: string;
        readonly backend: 'wasm';
        readonly wasmBinary: 'standard' | 'asyncify' | 'runtime-default';
        readonly threads: number;
        readonly isolated: boolean;
        readonly cores: number | null;
        readonly simd: boolean | null;
        readonly ios: boolean;
      };
    }
  | {
      readonly version: 1;
      readonly kind: 'inference';
      readonly inferenceMs: number;
      readonly audioMs: number;
      readonly outcome: 'empty' | 'duplicate' | 'transcript' | 'discarded';
      readonly moved: boolean;
    }
  | {
      readonly version: 1;
      readonly kind: 'worker-error';
      readonly phase: 'boot' | 'download' | 'warmup' | 'inference' | 'dispose' | 'unknown';
      readonly message: string;
    }
  | {
      readonly version: 1;
      readonly kind: 'worker-terminated';
      readonly reason: 'dispose' | 'pagehide';
    }
  | {
      readonly version: 1;
      readonly kind: 'capture-started' | 'capture-stopped';
    };

export interface CueModelDiagnosticEvent extends Event {
  readonly detail: CueModelDiagnostic;
}

type WithoutVersion<Diagnostic> = Diagnostic extends { version: 1 }
  ? Omit<Diagnostic, 'version'>
  : never;

export type CueModelDiagnostic = WithoutVersion<CueDiagnostic>;

export interface CueDiagnosticEvent extends Event {
  readonly detail: CueDiagnostic;
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

export type CueMatchOutcome = 'unmatched' | 'held' | 'stationary' | 'moved';

export interface CueMatchObservation {
  readonly previousPosition: number;
  readonly candidatePosition: number | null;
  readonly position: number;
  readonly outcome: CueMatchOutcome;
}

export interface CueTranscriptEvent extends Event {
  readonly detail: CueModelResult & {
    readonly match: CueMatchObservation;
  };
}

export interface CueCaptureEvent extends Event {
  readonly detail: {
    readonly active: boolean;
  };
}

export interface CueSpeechActivityEvent extends Event {
  readonly detail: {
    readonly active: boolean;
    readonly position: number;
  };
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
  terminate(): void;

  addEventListener(type: 'statechange', listener: (event: CueStateEvent) => void): void;
  addEventListener(type: 'capturechange', listener: (event: CueCaptureEvent) => void): void;
  addEventListener(
    type: 'speechactivitychange',
    listener: (event: CueSpeechActivityEvent) => void,
  ): void;
  addEventListener(type: 'transcript', listener: (event: CueTranscriptEvent) => void): void;
  addEventListener(type: 'positionchange', listener: (event: CuePositionEvent) => void): void;
  addEventListener(type: 'diagnostic', listener: (event: CueDiagnosticEvent) => void): void;
}

export function createCue(options: { script?: CueScript; model: CueModel }): Cue;
