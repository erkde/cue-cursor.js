import test from 'node:test';
import assert from 'node:assert/strict';
import { createCue } from '../src/index.js';

function fakeModel() {
  return {
    input: {
      sampleRate: 16_000,
      windowSeconds: 3,
      minimumSeconds: 1.5,
      intervalMs: 180,
    },
    async prepare({ onProgress } = {}) {
      onProgress?.({ phase: 'warmup' });
    },
    async transcribe() {
      return { text: '' };
    },
    async dispose() {},
  };
}

test('the core requires an explicit model', () => {
  assert.throws(
    () => createCue({ script: 'one two three' }),
    /model must provide input requirements, prepare\(\), transcribe\(\), and dispose\(\)/,
  );
});

test('createCue normalizes a plain-text script', async () => {
  const cue = createCue({ script: 'Hello, brave new world!', model: fakeModel() });
  assert.deepEqual(
    cue.words.map(({ index, text, normalized }) => ({ index, text, normalized })),
    [
      { index: 0, text: 'Hello,', normalized: 'hello' },
      { index: 1, text: 'brave', normalized: 'brave' },
      { index: 2, text: 'new', normalized: 'new' },
      { index: 3, text: 'world!', normalized: 'world' },
    ],
  );
  await cue.destroy();
});

test('explicit script words retain caller keys', async () => {
  const cue = createCue({
    script: [
      { text: 'Hello,', key: 'first' },
      { text: 'world!', key: 'second' },
    ],
    model: fakeModel(),
  });
  assert.equal(cue.words[1].key, 'second');
  await cue.destroy();
});

test('seek emits a positionchange event with the clamped position', async () => {
  const cue = createCue({ script: 'one two three', model: fakeModel() });
  const events = [];
  cue.addEventListener('positionchange', (event) => events.push(event.detail));

  assert.equal(cue.seek(99), 2);
  assert.deepEqual(events, [{ position: 2, previousPosition: 0, source: 'seek' }]);
  await cue.destroy();
});

test('prepare reports model progress and settles ready', async () => {
  const cue = createCue({ script: 'one two', model: fakeModel() });
  const states = [];
  cue.addEventListener('statechange', (event) => states.push(event.detail));
  await cue.prepare();

  assert.deepEqual(
    states.map((state) => [state.status, state.phase]),
    [
      ['preparing', 'download'],
      ['preparing', 'warmup'],
      ['ready', undefined],
    ],
  );
  await cue.destroy();
});

test('forwards privacy-safe model diagnostics with a schema version', async () => {
  const model = Object.assign(new EventTarget(), fakeModel());
  const cue = createCue({ script: 'one two', model });
  const diagnostics = [];
  cue.addEventListener('diagnostic', (event) => diagnostics.push(event.detail));

  const event = new Event('diagnostic');
  Object.defineProperty(event, 'detail', {
    value: { kind: 'worker-error', phase: 'boot', message: 'failed' },
  });
  model.dispatchEvent(event);

  assert.deepEqual(diagnostics, [
    { version: 1, kind: 'worker-error', phase: 'boot', message: 'failed' },
  ]);
  await cue.destroy();
});

test('terminate synchronously delegates to models that support it', () => {
  let terminated = false;
  const model = Object.assign(new EventTarget(), fakeModel(), {
    terminate() {
      terminated = true;
      const event = new Event('diagnostic');
      Object.defineProperty(event, 'detail', {
        value: { kind: 'worker-terminated', reason: 'pagehide' },
      });
      this.dispatchEvent(event);
    },
  });
  const cue = createCue({ script: 'one two', model });
  const diagnostics = [];
  cue.addEventListener('diagnostic', (event) => diagnostics.push(event.detail));

  cue.terminate();
  cue.terminate();

  assert.equal(terminated, true);
  assert.equal(cue.state.status, 'destroyed');
  assert.deepEqual(diagnostics, [{ version: 1, kind: 'worker-terminated', reason: 'pagehide' }]);
});

test('destroy settles in the destroyed state when asynchronous cleanup fails', async () => {
  const model = Object.assign(fakeModel(), {
    async dispose() {
      throw new Error('cleanup failed');
    },
  });
  const cue = createCue({ script: 'one two', model });

  await assert.rejects(cue.destroy(), /cleanup failed/);
  assert.equal(cue.state.status, 'destroyed');
});

test('a terminated model load cannot overwrite the destroyed state', async () => {
  let rejectPrepare;
  const model = Object.assign(fakeModel(), {
    prepare() {
      return new Promise((resolve, reject) => {
        rejectPrepare = reject;
      });
    },
    terminate() {},
  });
  const cue = createCue({ script: 'one two', model });
  const preparing = cue.prepare();

  cue.terminate();
  rejectPrepare(new Error('worker terminated'));

  await assert.rejects(preparing, /worker terminated/);
  assert.equal(cue.state.status, 'destroyed');
});
