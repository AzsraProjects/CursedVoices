// Offline measurement of every voice: renders each effect chain on a quiet noise floor
// and on a voice-like signal, and reports the output levels. Run by the smoke test, so
// a preset that hisses or jumps in loudness is caught before a release.

import type { VoiceProfile } from "../lib/types";
import { createEffect } from "./effects";

const SR = 48000;
const SECONDS = 2.5;

function signal(kind: "floor" | "voice"): AudioBuffer {
  const buf = new AudioBuffer({ numberOfChannels: 1, length: SR * SECONDS, sampleRate: SR });
  const d = buf.getChannelData(0);
  let seed = 7;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const noise = rand() * Math.pow(10, -66 / 20);
    if (kind === "floor") { d[i] = noise; continue; }
    // A "spoken" harmonic tone at -20 dBFS with syllable-like amplitude bursts.
    const f0 = 120 + 15 * Math.sin(2 * Math.PI * 0.7 * t);
    let s = 0;
    for (let h = 1; h < 25; h++) s += Math.sin(2 * Math.PI * f0 * h * t) / h;
    const syllable = Math.max(0, Math.sin(2 * Math.PI * 3 * t));
    d[i] = 0.1 * s * syllable + noise;
  }
  return buf;
}

async function render(effects: VoiceProfile["effects"], input: AudioBuffer): Promise<{ rms: number; peak: number }> {
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: input.length, sampleRate: SR });
  for (const w of ["worklets/pitch-shifter.js", "worklets/dynamics.js"]) {
    await ctx.audioWorklet.addModule(new URL(w, document.baseURI).href);
  }
  const src = ctx.createBufferSource();
  src.buffer = input;
  let last: AudioNode = src;
  for (const fx of effects) {
    if (!fx.enabled) continue;
    const inst = createEffect(ctx, fx);
    last.connect(inst.input);
    last = inst.output;
  }
  last.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  let sum = 0, peak = 0, n = 0;
  const skip = Math.floor(SR * 0.5); // ignore the start (gate, vocoder latency)
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    const d = out.getChannelData(ch);
    for (let i = skip; i < d.length; i++) {
      sum += d[i] * d[i];
      peak = Math.max(peak, Math.abs(d[i]));
      n++;
    }
  }
  const db = (x: number) => (x > 0 ? Math.round(20 * Math.log10(x) * 10) / 10 : -120);
  return { rms: db(Math.sqrt(sum / n)), peak: db(peak) };
}

export async function measureVoices(voices: VoiceProfile[]) {
  const floor = signal("floor");
  const voice = signal("voice");
  const dry = await render([], voice);
  const rows = [{ name: "(dry)", floorRms: (await render([], floor)).rms, voiceRms: dry.rms, voicePeak: dry.peak }];
  for (const v of voices) {
    const f = await render(v.effects, floor);
    const s = await render(v.effects, voice);
    rows.push({ name: v.name, floorRms: f.rms, voiceRms: s.rms, voicePeak: s.peak });
  }
  return rows;
}
