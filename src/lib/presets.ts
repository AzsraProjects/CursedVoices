// The voices a fresh install starts with. They are ordinary profiles: editable in the
// Lab, deletable, and restorable from Settings.

import { defaultParams } from "../audio/effects";
import type { EffectState, EffectType, VoiceProfile } from "./types";

export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function fx(type: EffectType, params: Record<string, number> = {}, enabled = true): EffectState {
  return { id: uid(), type, enabled, params: { ...defaultParams(type), ...params } };
}

function voice(name: string, color: string, icon: string, effects: EffectState[]): VoiceProfile {
  const now = Date.now();
  return { id: uid(), name, color, logo: { kind: "icon", icon }, effects, createdAt: now, updatedAt: now };
}

/** Copy with fresh ids, so the engine never mistakes the copy for the original. */
export function cloneVoice(v: VoiceProfile, name?: string): VoiceProfile {
  const now = Date.now();
  return {
    ...v,
    id: uid(),
    name: name ?? v.name,
    hotkey: undefined,
    midi: undefined,
    effects: v.effects.map((e) => ({ ...e, id: uid(), params: { ...e.params } })),
    createdAt: now,
    updatedAt: now,
  };
}

export function presetVoices(): VoiceProfile[] {
  return [
    voice("Démon", "#ef4444", "skull", [
      fx("gate", { threshold: -55 }),
      fx("pitch", { pitch: -7, formant: -4 }),
      fx("distortion", { drive: 18, tone: 4000, mix: 35 }),
      fx("eq", { low: 2, mid: -2, midFreq: 900, high: -3 }),
      fx("gain", { gain: -3 }),
      fx("reverb", { decay: 1.6, mix: 18, tone: 3500 }),
    ]),
    voice("Robot", "#22d3ee", "bot", [
      fx("gate", { threshold: -55 }),
      fx("robot", { freq: 70, mix: 85 }),
      fx("bitcrusher", { bits: 10, downsample: 2, mix: 40 }),
      fx("delay", { time: 18, feedback: 45, mix: 30, tone: 8000 }),
    ]),
    voice("Radio", "#f5c451", "radio", [
      fx("gate", { threshold: -50 }),
      fx("filter", { mode: 2, freq: 1700, q: 0.9 }),
      fx("distortion", { drive: 30, tone: 5000, mix: 60 }),
      fx("compressor", { threshold: -30, ratio: 6, makeup: 2 }),
    ]),
    voice("Cathédrale", "#a87bff", "church", [
      fx("reverb", { decay: 6.5, predelay: 40, tone: 5000, mix: 45 }),
    ]),
    voice("Fantôme", "#94a3b8", "ghost", [
      fx("pitch", { pitch: 3, formant: 2 }),
      fx("flanger", { rate: 0.15, depth: 70, feedback: 60, mix: 45 }),
      fx("reverb", { decay: 4, mix: 40, tone: 7000 }),
      fx("tremolo", { rate: 4, depth: 25 }),
    ]),
    voice("Géant", "#16a34a", "mountain", [
      fx("pitch", { pitch: -5, formant: -6 }),
      fx("eq", { low: 3, mid: 0, midFreq: 400, high: -2 }),
      fx("reverb", { decay: 1.2, mix: 15 }),
    ]),
    voice("Lutin", "#ec4899", "sparkles", [
      fx("pitch", { pitch: 7, formant: 5 }),
      fx("chorus", { rate: 1.5, depth: 30, mix: 25 }),
    ]),
    voice("Androïde", "#46a8ff", "cpu", [
      fx("pitch", { pitch: -2, formant: 0 }),
      fx("vibrato", { rate: 9, depth: 15 }),
      fx("robot", { freq: 140, mix: 30 }),
      fx("chorus", { rate: 0.4, depth: 60, mix: 40 }),
    ]),
    voice("Voix studio", "#e8f4ff", "mic", [
      fx("gate", { threshold: -50 }),
      fx("filter", { mode: 1, freq: 80, q: 0.7 }),
      fx("compressor", { threshold: -22, ratio: 3, makeup: 1.5 }),
      fx("eq", { low: 1.5, mid: -1.5, midFreq: 350, high: 3 }),
    ]),
  ];
}
