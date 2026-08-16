import test from 'node:test';
import assert from 'node:assert/strict';
import { enoughAudioForAsr, rmsGateOpen } from '../src/speech-gate.js';

function signal(sampleRate, seconds, amplitude) {
  return new Float32Array(Math.floor(sampleRate * seconds)).fill(amplitude);
}

test('the RMS gate uses the caller sample rate', () => {
  const sampleRate = 8_000;
  assert.equal(rmsGateOpen(signal(sampleRate, 0.25, 0), { sampleRate }), false);
  assert.equal(rmsGateOpen(signal(sampleRate, 0.25, 0.02), { sampleRate }), true);
});

test('minimum audio duration uses the model input requirements', () => {
  const input = { sampleRate: 8_000, minimumSeconds: 2 };
  assert.equal(enoughAudioForAsr(15_999, input), false);
  assert.equal(enoughAudioForAsr(16_000, input), true);
});
