import test from 'node:test';
import assert from 'node:assert/strict';

import { createCue } from '../src/index.js';

class FakeAudioNode {
  connect(target) {
    return target;
  }

  disconnect() {}
}

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.sampleRate = 48_000;
    this.destination = new FakeAudioNode();
    this.audioWorklet = { addModule: async () => {} };
  }

  async resume() {
    this.state = 'running';
  }

  async close() {
    this.state = 'closed';
  }

  createMediaStreamSource() {
    return new FakeAudioNode();
  }

  createGain() {
    const node = new FakeAudioNode();
    node.gain = { value: 1 };
    return node;
  }
}

let workletNode;
class FakeAudioWorkletNode extends FakeAudioNode {
  constructor() {
    super();
    this.port = { onmessage: null, postMessage() {} };
    workletNode = this;
  }
}

const nextEvent = (target, type) =>
  new Promise((resolve) => {
    target.addEventListener(type, resolve, { once: true });
  });

test('publishes capture, speech activity, and transcript match observations', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalAudioContext = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const originalAudioWorkletNode = Object.getOwnPropertyDescriptor(globalThis, 'AudioWorkletNode');

  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  let trackStopped = false;
  Object.defineProperties(globalThis, {
    navigator: {
      configurable: true,
      value: {
        mediaDevices: {
          async getUserMedia() {
            return {
              getTracks: () => [{ stop: () => (trackStopped = true) }],
            };
          },
        },
      },
    },
    document: { configurable: true, value: document },
    AudioContext: { configurable: true, value: FakeAudioContext },
    AudioWorkletNode: { configurable: true, value: FakeAudioWorkletNode },
  });

  const transcripts = ['alpha bravo charlie', 'words that are nowhere'];
  const model = {
    input: {
      sampleRate: 10,
      windowSeconds: 3,
      minimumSeconds: 1.5,
      intervalMs: 1,
    },
    async prepare() {},
    async transcribe() {
      return { text: transcripts.shift() ?? '' };
    },
    async dispose() {},
  };

  try {
    const cue = createCue({
      script: 'alpha bravo charlie delta echo foxtrot',
      model,
    });
    const capture = [];
    const speech = [];
    cue.addEventListener('capturechange', (event) => capture.push(event.detail));
    cue.addEventListener('speechactivitychange', (event) => speech.push(event.detail));

    await cue.start();
    assert.deepEqual(capture, [{ active: true }]);

    const firstTranscript = nextEvent(cue, 'transcript');
    workletNode.port.onmessage({ data: { samples: new Float32Array(20).fill(0.1) } });
    const firstDetail = (await firstTranscript).detail;
    assert.equal(firstDetail.text, 'alpha bravo charlie');
    assert.ok(Number.isFinite(firstDetail.inferenceMs));
    assert.deepEqual(firstDetail.match, {
      previousPosition: 0,
      candidatePosition: 2,
      position: 2,
      outcome: 'moved',
    });

    const inactive = nextEvent(cue, 'speechactivitychange');
    workletNode.port.onmessage({ data: { samples: new Float32Array(20) } });
    assert.deepEqual((await inactive).detail, { active: false, position: 2 });

    const active = nextEvent(cue, 'speechactivitychange');
    const unmatchedTranscript = nextEvent(cue, 'transcript');
    workletNode.port.onmessage({ data: { samples: new Float32Array(20).fill(0.1) } });
    assert.deepEqual((await active).detail, { active: true, position: 2 });
    assert.deepEqual((await unmatchedTranscript).detail.match, {
      previousPosition: 2,
      candidatePosition: null,
      position: 2,
      outcome: 'unmatched',
    });

    await cue.stop();
    assert.equal(trackStopped, true);
    assert.deepEqual(capture, [{ active: true }, { active: false }]);
    assert.deepEqual(speech, [
      { active: true, position: 0 },
      { active: false, position: 2 },
      { active: true, position: 2 },
      { active: false, position: 2 },
    ]);
    await cue.destroy();
  } finally {
    for (const [name, descriptor] of [
      ['navigator', originalNavigator],
      ['document', originalDocument],
      ['AudioContext', originalAudioContext],
      ['AudioWorkletNode', originalAudioWorkletNode],
    ]) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    workletNode = undefined;
  }
});
