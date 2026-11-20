// Records the microphone and produces a WAV Blob.
//
// Why not just use MediaRecorder? Because MediaRecorder outputs
// webm/opus-compressed audio, and our C++ engine reads raw WAV via
// libsndfile. So instead we tap the raw PCM samples straight out of the
// Web Audio graph and encode a WAV file by hand -- it's more explicit
// than it sounds, a WAV file is just a small header plus raw samples.
// A class is a blueprint for objects. "this" means the current recorder
export class WavRecorder {
  constructor() {
    this.audioContext = null;
    this.processor = null;
    this.input = null;
    this.stream = null;
    // Recorded chunks of raw audio samples
    this.samples = [];
    this.sampleRate = 44100;
  }

  async start() {
    this.samples = [];
    // Ask the user for microphone permission
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // The AudioContext is the workspace for browser audio
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    // Sample rate depends on the sound card (often 44100 or 48000)
    this.sampleRate = this.audioContext.sampleRate;

    this.input = this.audioContext.createMediaStreamSource(this.stream);
    // ScriptProcessorNode is deprecated in favor of AudioWorklet, but it's
    // far simpler to read and needs no extra worklet file -- good enough
    // for a learning project.
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    // Called every time a new chunk of audio is ready
    this.processor.onaudioprocess = (e) => {
      const channelData = e.inputBuffer.getChannelData(0);
      // Copy the chunk because the browser reuses its buffer
      this.samples.push(new Float32Array(channelData));
    };

    this.input.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  stop() {
    this.processor.disconnect();
    this.input.disconnect();
    // Turn off the microphone
    this.stream.getTracks().forEach((t) => t.stop());
    this.audioContext.close();

    // Join all chunks into one array
    const totalLength = this.samples.reduce((sum, arr) => sum + arr.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const arr of this.samples) {
      merged.set(arr, offset);
      offset += arr.length;
    }

    // Convert the samples to a WAV file
    return this._encodeWav(merged, this.sampleRate);
  }

  _encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    // Standard 44-byte WAV header for 16-bit mono PCM.
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Write the samples after the header (16-bit)
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      // Scale a float (-1 to 1) to a 16-bit integer
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    // A Blob is binary data the browser can upload
    return new Blob([buffer], { type: 'audio/wav' });
  }
}
