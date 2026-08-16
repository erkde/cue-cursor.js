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
