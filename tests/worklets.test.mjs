// Runs the AudioWorklet processors in plain Node with a minimal shim.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function load(file) {
  const registry = {};
  const sandbox = {
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage() {}, onmessage: null }; } },
    registerProcessor: (name, cls) => { registry[name] = cls; },
    sampleRate: 48000,
  };
  new Function(...Object.keys(sandbox), fs.readFileSync(new URL(`../public/worklets/${file}`, import.meta.url), "utf8"))(...Object.values(sandbox));
  return registry;
}

function run(proc, params, gen, blocks = 600) {
  let sumIn = 0, sumOut = 0, peak = 0, peakIn = 0;
  for (let b = 0; b < blocks; b++) {
    const input = new Float32Array(128), output = new Float32Array(128);
    for (let i = 0; i < 128; i++) input[i] = gen((b * 128 + i) / 48000);
    proc.process([[input]], [[output]], params);
    if (b > 100) for (let i = 0; i < 128; i++) { sumIn += input[i] ** 2; sumOut += output[i] ** 2; peak = Math.max(peak, Math.abs(output[i])); peakIn = Math.max(peakIn, Math.abs(input[i])); }
  }
  return { gain: Math.sqrt(sumOut / sumIn), peak, peakIn };
}

const voice = (t) => {
  let s = 0;
  for (let h = 1; h < 30; h++) s += Math.sin(2 * Math.PI * 140 * h * t) / h;
  return 0.3 * s;
};

const { "cv-pitch-shifter": Pitch } = load("pitch-shifter.js");
const { "cv-noise-gate": Gate, "cv-bitcrusher": Crusher } = load("dynamics.js");

test("pitch shifter is transparent at 0 / 0", () => {
  const { gain } = run(new Pitch(), { pitch: [0], formant: [0] }, voice);
  assert.ok(Math.abs(gain - 1) < 0.02, `gain ${gain}`);
});

test("pitch shifter keeps loudness within 3 dB across the range", () => {
  for (const [pitch, formant] of [[-12, 0], [-7, -4], [-5, -6], [3, 2], [7, 5], [12, 0]]) {
    const { gain, peak, peakIn } = run(new Pitch(), { pitch: [pitch], formant: [formant] }, voice);
    const db = 20 * Math.log10(gain);
    assert.ok(Math.abs(db) < 3, `pitch ${pitch} formant ${formant}: ${db.toFixed(1)} dB`);
    // Peaks may grow a little (phases are re-synthesised) but never explode.
    const peakDb = 20 * Math.log10(peak / peakIn);
    assert.ok(peakDb < 7, `pitch ${pitch} peaks +${peakDb.toFixed(1)} dB`);
  }
});

test("pitch shifter survives NaN input", () => {
  const p = new Pitch();
  run(p, { pitch: [-5], formant: [0] }, () => NaN, 20);
  const { gain } = run(p, { pitch: [-5], formant: [0] }, voice);
  assert.ok(Number.isFinite(gain) && gain > 0.5, `gain ${gain}`);
});

test("processors stop after dispose", () => {
  for (const P of [Pitch, Gate, Crusher]) {
    const p = new P();
    p.port.onmessage({ data: { dispose: true } });
    const params = { pitch: [0], formant: [0], threshold: [-50], release: [150], bits: [8], downsample: [4] };
    assert.equal(p.process([[new Float32Array(128)]], [[new Float32Array(128)]], params), false);
  }
});

test("noise gate silences the noise floor and lets speech through", () => {
  const params = { threshold: [-50], release: [100] };
  const floor = run(new Gate(), params, () => (Math.random() * 2 - 1) * 0.0005);
  assert.ok(floor.peak < 0.0001, `floor peak ${floor.peak}`);
  const speech = run(new Gate(), params, voice);
  assert.ok(speech.gain > 0.95, `speech gain ${speech.gain}`);
});
