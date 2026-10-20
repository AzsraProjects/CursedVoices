// The effect catalogue: what each effect exposes in the Lab, and how it is wired in Web Audio.
// Every instance is a box with one input and one output; the engine chains them.

import type { EffectState, EffectType } from "../lib/types";
import { reverbImpulse } from "./impulse";

export type Category = "voice" | "space" | "color" | "motion" | "tools";

export interface ParamDef {
  key: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: "dB" | "ms" | "Hz" | "st" | "%" | "s" | "x" | "bits" | "";
  log?: boolean; // logarithmic slider (frequencies)
  choices?: string[]; // discrete choice, value is the index
}

export interface EffectDef {
  type: EffectType;
  category: Category;
  params: ParamDef[];
}

export interface EffectInstance {
  input: AudioNode;
  output: AudioNode;
  set(key: string, value: number): void;
  dispose(): void;
}

const mix: ParamDef = { key: "mix", min: 0, max: 100, step: 1, default: 100, unit: "%" };

export const EFFECTS: EffectDef[] = [
  { type: "pitch", category: "voice", params: [
    { key: "pitch", min: -12, max: 12, step: 0.5, default: 0, unit: "st" },
    { key: "formant", min: -12, max: 12, step: 0.5, default: 0, unit: "st" },
  ] },
  { type: "robot", category: "voice", params: [
    { key: "freq", min: 20, max: 600, step: 1, default: 90, unit: "Hz", log: true },
    { ...mix, default: 80 },
  ] },
  { type: "vibrato", category: "voice", params: [
    { key: "rate", min: 0.5, max: 12, step: 0.1, default: 5, unit: "Hz" },
    { key: "depth", min: 0, max: 100, step: 1, default: 30, unit: "%" },
  ] },
  { type: "reverb", category: "space", params: [
    { key: "decay", min: 0.2, max: 10, step: 0.1, default: 2.2, unit: "s" },
    { key: "predelay", min: 0, max: 200, step: 1, default: 15, unit: "ms" },
    { key: "tone", min: 800, max: 16000, step: 10, default: 6000, unit: "Hz", log: true },
    { ...mix, default: 30 },
  ] },
  { type: "delay", category: "space", params: [
    { key: "time", min: 20, max: 1500, step: 1, default: 280, unit: "ms" },
    { key: "feedback", min: 0, max: 95, step: 1, default: 35, unit: "%" },
    { key: "tone", min: 500, max: 16000, step: 10, default: 5000, unit: "Hz", log: true },
    { ...mix, default: 30 },
  ] },
  { type: "distortion", category: "color", params: [
    { key: "drive", min: 0, max: 100, step: 1, default: 40, unit: "%" },
    { key: "tone", min: 500, max: 16000, step: 10, default: 6000, unit: "Hz", log: true },
    { ...mix, default: 100 },
  ] },
  { type: "bitcrusher", category: "color", params: [
    { key: "bits", min: 1, max: 16, step: 1, default: 8, unit: "bits" },
    { key: "downsample", min: 1, max: 40, step: 1, default: 4, unit: "x" },
    { ...mix, default: 100 },
  ] },
  { type: "eq", category: "color", params: [
    { key: "low", min: -15, max: 15, step: 0.5, default: 0, unit: "dB" },
    { key: "mid", min: -15, max: 15, step: 0.5, default: 0, unit: "dB" },
    { key: "midFreq", min: 200, max: 6000, step: 10, default: 1000, unit: "Hz", log: true },
    { key: "high", min: -15, max: 15, step: 0.5, default: 0, unit: "dB" },
  ] },
  { type: "filter", category: "color", params: [
    { key: "mode", min: 0, max: 2, step: 1, default: 1, choices: ["lowpass", "highpass", "bandpass"] },
    { key: "freq", min: 40, max: 18000, step: 1, default: 300, unit: "Hz", log: true },
    { key: "q", min: 0.1, max: 18, step: 0.1, default: 0.7, unit: "" },
  ] },
  { type: "chorus", category: "motion", params: [
    { key: "rate", min: 0.1, max: 8, step: 0.1, default: 1.2, unit: "Hz" },
    { key: "depth", min: 0, max: 100, step: 1, default: 50, unit: "%" },
    { ...mix, default: 50 },
  ] },
  { type: "flanger", category: "motion", params: [
    { key: "rate", min: 0.05, max: 5, step: 0.05, default: 0.3, unit: "Hz" },
    { key: "depth", min: 0, max: 100, step: 1, default: 60, unit: "%" },
    { key: "feedback", min: 0, max: 90, step: 1, default: 50, unit: "%" },
    { ...mix, default: 50 },
  ] },
  { type: "tremolo", category: "motion", params: [
    { key: "rate", min: 0.5, max: 20, step: 0.1, default: 6, unit: "Hz" },
    { key: "depth", min: 0, max: 100, step: 1, default: 60, unit: "%" },
  ] },
  { type: "gate", category: "tools", params: [
    { key: "threshold", min: -80, max: -10, step: 1, default: -50, unit: "dB" },
    { key: "release", min: 20, max: 1000, step: 5, default: 150, unit: "ms" },
  ] },
  { type: "compressor", category: "tools", params: [
    { key: "threshold", min: -60, max: 0, step: 1, default: -24, unit: "dB" },
    { key: "ratio", min: 1, max: 20, step: 0.5, default: 4, unit: "x" },
    { key: "attack", min: 1, max: 100, step: 1, default: 5, unit: "ms" },
    { key: "release", min: 20, max: 1000, step: 5, default: 150, unit: "ms" },
    { key: "makeup", min: 0, max: 24, step: 0.5, default: 6, unit: "dB" },
  ] },
  { type: "gain", category: "tools", params: [
    { key: "gain", min: -24, max: 24, step: 0.5, default: 0, unit: "dB" },
  ] },
];

export const effectDef = (type: EffectType): EffectDef => EFFECTS.find((e) => e.type === type)!;

export function defaultParams(type: EffectType): Record<string, number> {
  return Object.fromEntries(effectDef(type).params.map((p) => [p.key, p.default]));
}

// ---------------------------------------------------------------- wiring

const SMOOTH = 0.02;
const dbToLin = (db: number) => Math.pow(10, db / 20);

function ramp(param: AudioParam, value: number, ctx: BaseAudioContext): void {
  if (!Number.isFinite(value)) return;
  param.setTargetAtTime(value, ctx.currentTime, SMOOTH);
}

/** Dry/wet wrapper with an equal-power crossfade. */
function wetDry(ctx: BaseAudioContext, wetIn: AudioNode, wetOut: AudioNode, mixPct: number) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  input.connect(dry).connect(output);
  input.connect(wetIn);
  wetOut.connect(wet).connect(output);
  const setMix = (pct: number) => {
    const m = Math.min(1, Math.max(0, pct / 100));
    ramp(dry.gain, Math.cos((m * Math.PI) / 2), ctx);
    ramp(wet.gain, Math.sin((m * Math.PI) / 2), ctx);
  };
  dry.gain.value = Math.cos((Math.min(1, mixPct / 100) * Math.PI) / 2);
  wet.gain.value = Math.sin((Math.min(1, mixPct / 100) * Math.PI) / 2);
  return { input, output, setMix, nodes: [input, output, dry, wet] as AudioNode[] };
}

function disconnectAll(nodes: AudioNode[]): void {
  for (const n of nodes) {
    try {
      n.disconnect();
    } catch {
      /* already gone */
    }
  }
}

function worklet(ctx: BaseAudioContext, name: string, params: Record<string, number>): AudioWorkletNode {
  return new AudioWorkletNode(ctx, name, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 1,
    channelCountMode: "explicit",
    parameterData: params,
  });
}

function stopWorklet(node: AudioWorkletNode): void {
  node.port.postMessage({ dispose: true });
}

const driveK = (drive: number) => 1 + (drive / 100) * 60;

// Odd length so that x = 0 lands exactly on a point: an even table puts silence between
// two samples and produces a DC offset that later stages amplify into hiss.
function distortionCurve(drive: number): Float32Array {
  const k = driveK(drive);
  const n = 4097;
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

/** Output trim so more drive means more grit, not more volume (small-signal gain k/tanh k). */
const driveTrim = (drive: number) => {
  const k = driveK(drive);
  return 0.85 / Math.sqrt(k / Math.tanh(k));
};

/** A delay line swept by an LFO: the heart of chorus, flanger and vibrato. */
function modulatedDelay(ctx: BaseAudioContext, baseMs: number, depthMs: number, rate: number) {
  const delay = ctx.createDelay(0.1);
  delay.delayTime.value = baseMs / 1000;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const depth = ctx.createGain();
  depth.gain.value = depthMs / 1000;
  lfo.connect(depth).connect(delay.delayTime);
  lfo.start();
  return { delay, lfo, depth };
}

export function createEffect(ctx: BaseAudioContext, state: EffectState): EffectInstance {
  const p = { ...defaultParams(state.type), ...state.params };
  switch (state.type) {
    case "gain": {
      const g = ctx.createGain();
      g.gain.value = dbToLin(p.gain);
      return { input: g, output: g, set: (k, v) => k === "gain" && ramp(g.gain, dbToLin(v), ctx), dispose: () => disconnectAll([g]) };
    }
    case "gate": {
      const w = worklet(ctx, "cv-noise-gate", { threshold: p.threshold, release: p.release });
      return {
        input: w, output: w,
        set: (k, v) => { const prm = w.parameters.get(k); if (prm) prm.value = v; },
        dispose: () => { stopWorklet(w); disconnectAll([w]); },
      };
    }
    case "compressor": {
      const c = ctx.createDynamicsCompressor();
      const makeup = ctx.createGain();
      c.knee.value = 6;
      c.threshold.value = p.threshold;
      c.ratio.value = p.ratio;
      c.attack.value = p.attack / 1000;
      c.release.value = p.release / 1000;
      makeup.gain.value = dbToLin(p.makeup);
      c.connect(makeup);
      return {
        input: c, output: makeup,
        set: (k, v) => {
          if (k === "threshold") ramp(c.threshold, v, ctx);
          else if (k === "ratio") ramp(c.ratio, v, ctx);
          else if (k === "attack") ramp(c.attack, v / 1000, ctx);
          else if (k === "release") ramp(c.release, v / 1000, ctx);
          else if (k === "makeup") ramp(makeup.gain, dbToLin(v), ctx);
        },
        dispose: () => disconnectAll([c, makeup]),
      };
    }
    case "eq": {
      const low = ctx.createBiquadFilter();
      const mid = ctx.createBiquadFilter();
      const high = ctx.createBiquadFilter();
      low.type = "lowshelf"; low.frequency.value = 160; low.gain.value = p.low;
      mid.type = "peaking"; mid.Q.value = 1; mid.frequency.value = p.midFreq; mid.gain.value = p.mid;
      high.type = "highshelf"; high.frequency.value = 5500; high.gain.value = p.high;
      low.connect(mid).connect(high);
      return {
        input: low, output: high,
        set: (k, v) => {
          if (k === "low") ramp(low.gain, v, ctx);
          else if (k === "mid") ramp(mid.gain, v, ctx);
          else if (k === "midFreq") ramp(mid.frequency, v, ctx);
          else if (k === "high") ramp(high.gain, v, ctx);
        },
        dispose: () => disconnectAll([low, mid, high]),
      };
    }
    case "filter": {
      const f = ctx.createBiquadFilter();
      const modes: BiquadFilterType[] = ["lowpass", "highpass", "bandpass"];
      f.type = modes[Math.round(p.mode)] ?? "highpass";
      f.frequency.value = p.freq;
      f.Q.value = p.q;
      return {
        input: f, output: f,
        set: (k, v) => {
          if (k === "mode") f.type = modes[Math.round(v)] ?? "highpass";
          else if (k === "freq") ramp(f.frequency, v, ctx);
          else if (k === "q") ramp(f.Q, v, ctx);
        },
        dispose: () => disconnectAll([f]),
      };
    }
    case "pitch": {
      const w = worklet(ctx, "cv-pitch-shifter", { pitch: p.pitch, formant: p.formant });
      return {
        input: w, output: w,
        set: (k, v) => { const prm = w.parameters.get(k); if (prm) prm.value = v; },
        dispose: () => { stopWorklet(w); disconnectAll([w]); },
      };
    }
    case "reverb": {
      const pre = ctx.createDelay(0.5);
      pre.delayTime.value = p.predelay / 1000;
      const conv = ctx.createConvolver();
      conv.buffer = reverbImpulse(ctx.sampleRate, p.decay, p.tone);
      pre.connect(conv);
      const wd = wetDry(ctx, pre, conv, p.mix);
      let decay = p.decay, tone = p.tone;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const rebuild = () => {
        clearTimeout(timer);
        timer = setTimeout(() => { conv.buffer = reverbImpulse(ctx.sampleRate, decay, tone); }, 120);
      };
      return {
        input: wd.input, output: wd.output,
        set: (k, v) => {
          if (k === "mix") wd.setMix(v);
          else if (k === "predelay") ramp(pre.delayTime, v / 1000, ctx);
          else if (k === "decay") { decay = v; rebuild(); }
          else if (k === "tone") { tone = v; rebuild(); }
        },
        dispose: () => { clearTimeout(timer); disconnectAll([pre, conv, ...wd.nodes]); },
      };
    }
    case "delay": {
      const d = ctx.createDelay(2);
      const fb = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      d.delayTime.value = p.time / 1000;
      fb.gain.value = p.feedback / 100;
      lp.frequency.value = p.tone;
      d.connect(lp).connect(fb).connect(d);
      const wd = wetDry(ctx, d, lp, p.mix);
      return {
        input: wd.input, output: wd.output,
        set: (k, v) => {
          if (k === "mix") wd.setMix(v);
          else if (k === "time") ramp(d.delayTime, v / 1000, ctx);
          else if (k === "feedback") ramp(fb.gain, Math.min(0.95, v / 100), ctx);
          else if (k === "tone") ramp(lp.frequency, v, ctx);
        },
        dispose: () => disconnectAll([d, fb, lp, ...wd.nodes]),
      };
    }
    case "chorus": {
      const a = modulatedDelay(ctx, 18, (p.depth / 100) * 6, p.rate);
      const b = modulatedDelay(ctx, 26, (p.depth / 100) * 7, p.rate * 0.83);
      const sum = ctx.createGain();
      sum.gain.value = 0.6;
      const split = ctx.createGain();
      split.connect(a.delay).connect(sum);
      split.connect(b.delay).connect(sum);
      const wd = wetDry(ctx, split, sum, p.mix);
      return {
        input: wd.input, output: wd.output,
        set: (k, v) => {
          if (k === "mix") wd.setMix(v);
          else if (k === "rate") { ramp(a.lfo.frequency, v, ctx); ramp(b.lfo.frequency, v * 0.83, ctx); }
          else if (k === "depth") { ramp(a.depth.gain, (v / 100) * 0.006, ctx); ramp(b.depth.gain, (v / 100) * 0.007, ctx); }
        },
        dispose: () => { a.lfo.stop(); b.lfo.stop(); disconnectAll([a.delay, a.lfo, a.depth, b.delay, b.lfo, b.depth, sum, split, ...wd.nodes]); },
      };
    }
    case "flanger": {
      const m = modulatedDelay(ctx, 3, (p.depth / 100) * 2.5, p.rate);
      const fb = ctx.createGain();
      fb.gain.value = p.feedback / 100;
      m.delay.connect(fb).connect(m.delay);
      const wd = wetDry(ctx, m.delay, m.delay, p.mix);
      return {
        input: wd.input, output: wd.output,
        set: (k, v) => {
          if (k === "mix") wd.setMix(v);
          else if (k === "rate") ramp(m.lfo.frequency, v, ctx);
          else if (k === "depth") ramp(m.depth.gain, (v / 100) * 0.0025, ctx);
          else if (k === "feedback") ramp(fb.gain, Math.min(0.9, v / 100), ctx);
        },
        dispose: () => { m.lfo.stop(); disconnectAll([m.delay, m.lfo, m.depth, fb, ...wd.nodes]); },
      };
    }
    case "vibrato": {
      const m = modulatedDelay(ctx, 8, (p.depth / 100) * 5, p.rate);
      return {
        input: m.delay, output: m.delay,
        set: (k, v) => {
          if (k === "rate") ramp(m.lfo.frequency, v, ctx);
          else if (k === "depth") ramp(m.depth.gain, (v / 100) * 0.005, ctx);
        },
        dispose: () => { m.lfo.stop(); disconnectAll([m.delay, m.lfo, m.depth]); },
      };
    }
    case "tremolo": {
      const g = ctx.createGain();
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      const d = p.depth / 100;
      g.gain.value = 1 - d / 2;
      depth.gain.value = d / 2;
      lfo.frequency.value = p.rate;
      lfo.connect(depth).connect(g.gain);
      lfo.start();
      return {
        input: g, output: g,
        set: (k, v) => {
          if (k === "rate") ramp(lfo.frequency, v, ctx);
          else if (k === "depth") { ramp(g.gain, 1 - v / 200, ctx); ramp(depth.gain, v / 200, ctx); }
        },
        dispose: () => { lfo.stop(); disconnectAll([g, lfo, depth]); },
      };
    }
    case "distortion": {
      const pre = ctx.createBiquadFilter();
      pre.type = "highpass";
      pre.frequency.value = 80;
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(p.drive);
      shaper.oversample = "4x";
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = p.tone;
      const dc = ctx.createBiquadFilter();
      dc.type = "highpass";
      dc.frequency.value = 25;
      const level = ctx.createGain();
      level.gain.value = driveTrim(p.drive);
      pre.connect(shaper).connect(lp).connect(dc).connect(level);
      const wd = wetDry(ctx, pre, level, p.mix);
      return {
        input: wd.input, output: wd.output,
        set: (k, v) => {
          if (k === "mix") wd.setMix(v);
          else if (k === "drive") { shaper.curve = distortionCurve(v); ramp(level.gain, driveTrim(v), ctx); }
          else if (k === "tone") ramp(lp.frequency, v, ctx);
        },
        dispose: () => disconnectAll([pre, shaper, lp, dc, level, ...wd.nodes]),
      };
    }
    case "bitcrusher": {
      const w = worklet(ctx, "cv-bitcrusher", { bits: p.bits, downsample: p.downsample });
      const wd = wetDry(ctx, w, w, p.mix);
      return {
        input: wd.input, output: wd.output,
        set: (k, v) => {
          if (k === "mix") wd.setMix(v);
          else { const prm = w.parameters.get(k); if (prm) prm.value = v; }
        },
        dispose: () => { stopWorklet(w); disconnectAll([w, ...wd.nodes]); },
      };
    }
    case "robot": {
      // Ring modulation: the voice multiplied by a sine.
      const ring = ctx.createGain();
      ring.gain.value = 0;
      const osc = ctx.createOscillator();
      osc.frequency.value = p.freq;
      osc.connect(ring.gain);
      osc.start();
      const wd = wetDry(ctx, ring, ring, p.mix);
      return {
        input: wd.input, output: wd.output,
        set: (k, v) => {
          if (k === "mix") wd.setMix(v);
          else if (k === "freq") ramp(osc.frequency, v, ctx);
        },
        dispose: () => { osc.stop(); disconnectAll([ring, osc, ...wd.nodes]); },
      };
    }
  }
}
