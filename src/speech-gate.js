const RMS_WINDOW_SECONDS = 0.25;
const RMS_THRESHOLD = 0.01;

export function rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (samples.length || 1));
}

export function rmsGateOpen(
  samples,
  { sampleRate, windowSeconds = RMS_WINDOW_SECONDS, threshold = RMS_THRESHOLD },
) {
  const requiredSamples = Math.floor(windowSeconds * sampleRate);
  if (samples.length < requiredSamples) return false;
  return rms(samples.subarray(samples.length - requiredSamples)) >= threshold;
}

export function enoughAudioForAsr(sampleCount, { sampleRate, minimumSeconds }) {
  return sampleCount >= minimumSeconds * sampleRate;
}
