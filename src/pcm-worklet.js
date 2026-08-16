class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.inputRate = sampleRate;
    this.outputRate = options?.processorOptions?.outputRate ?? sampleRate;
    this.step = this.inputRate / this.outputRate;
    this.pending = [];
    this.next = 0;
    this.buffer = new Float32Array(2048);
    this.length = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type !== 'configure') return;
      if (Number.isFinite(event.data.inputRate)) this.inputRate = event.data.inputRate;
      if (Number.isFinite(event.data.outputRate)) this.outputRate = event.data.outputRate;
      this.step = this.inputRate / this.outputRate;
    };
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i += 1) this.pending.push(channel[i]);
    while (this.next + 1 < this.pending.length) {
      const index = Math.floor(this.next);
      const fraction = this.next - index;
      this.buffer[this.length] =
        this.pending[index] * (1 - fraction) + this.pending[index + 1] * fraction;
      this.length += 1;
      this.next += this.step;

      if (this.length === this.buffer.length) {
        const samples = this.buffer;
        this.port.postMessage({ samples }, [samples.buffer]);
        this.buffer = new Float32Array(2048);
        this.length = 0;
      }
    }

    const consumed = Math.floor(this.next);
    if (consumed) {
      this.pending.splice(0, consumed);
      this.next -= consumed;
    }
    return true;
  }
}

registerProcessor('cue-pcm-capture', PcmCapture);
