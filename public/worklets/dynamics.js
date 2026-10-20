// Small DSP processors that Web Audio has no native node for.
// Every processor stops when the engine posts {dispose:true}, so a voice
// switch never leaves a live processor running in the background.

const dbToLin = (db) => Math.pow(10, db / 20);

class NoiseGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -50, minValue: -90, maxValue: 0, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 150, minValue: 10, maxValue: 2000, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.env = 0;
    this.gain = 0;
    this.hold = 0;
    this.alive = true;
    this.port.onmessage = (e) => { if (e.data && e.data.dispose) this.alive = false; };
  }
  process(inputs, outputs, params) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0][0];
    if (!output) return this.alive;
    const open = dbToLin(params.threshold[0]);
    const close = open * 0.5; // hysteresis: no chatter around the threshold
    const envCoef = Math.exp(-1 / (0.005 * sampleRate));
    const attack = 1 - Math.exp(-1 / (0.002 * sampleRate));
    const release = 1 - Math.exp(-1 / ((params.release[0] / 1000) * sampleRate));
    const holdSamples = 0.05 * sampleRate;
    for (let i = 0; i < output.length; i++) {
      const x = input ? input[i] : 0;
      const a = Math.abs(x);
      this.env = a > this.env ? a : this.env * envCoef + a * (1 - envCoef);
      let target;
      if (this.env >= open) { target = 1; this.hold = holdSamples; }
      else if (this.env >= close || this.hold > 0) { target = 1; this.hold--; }
      else target = 0;
      this.gain += (target - this.gain) * (target > this.gain ? attack : release);
      output[i] = x * this.gain;
    }
    return this.alive;
  }
}

class Bitcrusher extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 8, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'downsample', defaultValue: 4, minValue: 1, maxValue: 64, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.phase = 0;
    this.held = 0;
    this.alive = true;
    this.port.onmessage = (e) => { if (e.data && e.data.dispose) this.alive = false; };
  }
  process(inputs, outputs, params) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0][0];
    if (!output) return this.alive;
    const steps = Math.pow(2, params.bits[0] - 1);
    const ds = params.downsample[0];
    for (let i = 0; i < output.length; i++) {
      this.phase += 1;
      if (this.phase >= ds) {
        this.phase -= ds;
        const x = input ? input[i] : 0;
        this.held = Math.round(x * steps) / steps;
      }
      output[i] = this.held;
    }
    return this.alive;
  }
}

registerProcessor('cv-noise-gate', NoiseGate);
registerProcessor('cv-bitcrusher', Bitcrusher);
