const workletUrl = new URL('./pcm-worklet.js', import.meta.url);

let primedContext = null;
const CONTEXT_CLOSE_TIMEOUT_MS = 1000;

function withPhase(error, phase) {
  const wrapped = new Error(String(error?.message ?? error), { cause: error });
  wrapped.name = error?.name ?? 'Error';
  wrapped.phase = phase;
  return wrapped;
}

export class Microphone {
  static async prime() {
    try {
      if (!primedContext || primedContext.state === 'closed') {
        primedContext = new AudioContext();
      }
      if (primedContext.state === 'suspended') await primedContext.resume();
    } catch (error) {
      throw withPhase(error, 'audio-prime');
    }
  }

  static async releasePrime() {
    const context = primedContext;
    primedContext = null;
    await context?.close();
  }

  constructor({ sampleRate, bufferSeconds }) {
    this.sampleRate = sampleRate;
    this.buffer = new Float32Array(sampleRate * bufferSeconds);
    this.writeIndex = 0;
    this.total = 0;
    this.context = null;
    this.stream = null;
    this.source = null;
    this.node = null;
    this.sink = null;
  }

  async start() {
    this.context = primedContext;
    primedContext = null;
    if (!this.context || this.context.state === 'closed') this.context = new AudioContext();

    try {
      if (this.context.state === 'suspended') await this.context.resume();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      await this.context.audioWorklet.addModule(workletUrl);
      this.source = this.context.createMediaStreamSource(this.stream);
      this.node = new AudioWorkletNode(this.context, 'cue-pcm-capture', {
        processorOptions: { outputRate: this.sampleRate },
      });
      this.node.port.onmessage = (event) => this.push(event.data.samples);
      this.node.port.postMessage({
        type: 'configure',
        inputRate: this.context.sampleRate,
        outputRate: this.sampleRate,
      });
      this.sink = this.context.createGain();
      this.sink.gain.value = 0;
      this.source.connect(this.node);
      this.node.connect(this.sink).connect(this.context.destination);
    } catch (error) {
      await this.stop();
      throw withPhase(error, 'microphone');
    }
  }

  push(samples) {
    for (let i = 0; i < samples.length; i += 1) {
      this.buffer[this.writeIndex] = samples[i];
      this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
    }
    this.total += samples.length;
  }

  latest(seconds) {
    const length = Math.min(Math.floor(seconds * this.sampleRate), this.total, this.buffer.length);
    const samples = new Float32Array(length);
    let index = (this.writeIndex - length + this.buffer.length) % this.buffer.length;
    for (let i = 0; i < length; i += 1) {
      samples[i] = this.buffer[index];
      index = (index + 1) % this.buffer.length;
    }
    return samples;
  }

  async stop() {
    this.source?.disconnect();
    this.node?.disconnect();
    this.sink?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    const context = this.context;
    if (context) {
      await Promise.race([
        context.close().catch(() => {}),
        new Promise((resolve) => {
          setTimeout(resolve, CONTEXT_CLOSE_TIMEOUT_MS);
        }),
      ]);
    }
    this.context = null;
    this.stream = null;
    this.source = null;
    this.node = null;
    this.sink = null;
    this.total = 0;
    this.writeIndex = 0;
  }
}
