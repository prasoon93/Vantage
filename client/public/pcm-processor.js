// AudioWorklet processor — runs in the audio rendering thread
// Buffers 4096 samples before posting to reduce message frequency
// (128 samples/block at 16kHz = 125 msg/sec without buffering → too many)
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._size = 4096;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) this._buf.push(channel[i]);

      if (this._buf.length >= this._size) {
        this.port.postMessage(new Float32Array(this._buf.splice(0, this._size)));
      }
    }
    return true; // keep alive
  }
}

registerProcessor('pcm-processor', PCMProcessor);
