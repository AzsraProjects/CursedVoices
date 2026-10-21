// The audio engine. Two identical graphs read the same microphone:
//   stream  -> the virtual cable that OBS records as a microphone
//   monitor -> the headphones, so you hear yourself live with the voice on
// Each one runs its own AudioContext bound straight to its device, which keeps both
// paths at the lowest latency Chromium gives. The monitor graph only exists while
// listening is on.
//
// Reliability rules:
// - The stream path never falls back to the default speakers: a missing cable means
//   silence and a red status, never your own voice coming out of the speakers.
// - Voice switches and on/off crossfade over 40 ms: no click on stream.
// - A watchdog resumes suspended contexts and reopens a microphone that went away.

import type { EffectState, Settings, Sound, VoiceProfile } from "../lib/types";
import { isVirtualMic, pickRealMic } from "../lib/devices";
import { createEffect, type EffectInstance } from "./effects";

type Role = "stream" | "monitor";

export type DeviceState = "ok" | "missing" | "denied" | "starting" | "off" | "loop";

export interface EngineStatus {
  mic: DeviceState;
  stream: DeviceState;
  monitor: DeviceState;
  streamDeviceLabel?: string;
  latencyMs: number;
}

const FADE = 0.04;
const PITCH_LATENCY_MS = (896 / 48000) * 1000;
const CABLE_PATTERN = /cable input|vb-audio virtual cable/i;
const LOOP_PATTERN = /cable output|vb-audio virtual cable/i;
const WORKLETS = ["worklets/pitch-shifter.js", "worklets/dynamics.js"];

const dbToLin = (db: number) => Math.pow(10, db / 20);

interface Chain {
  input: GainNode;
  output: GainNode;
  fade: GainNode;
  instances: Map<string, EffectInstance>;
  dispose(): void;
}

function chainSignature(effects: EffectState[]): string {
  return effects.filter((e) => e.enabled).map((e) => `${e.id}:${e.type}`).join("|");
}

function buildChain(ctx: AudioContext, effects: EffectState[]): Chain {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const fade = ctx.createGain();
  fade.gain.value = 0;
  const instances = new Map<string, EffectInstance>();
  let last: AudioNode = input;
  for (const fx of effects) {
    if (!fx.enabled) continue;
    try {
      const inst = createEffect(ctx, fx);
      last.connect(inst.input);
      last = inst.output;
      instances.set(fx.id, inst);
    } catch (err) {
      console.error("[engine] effect skipped", fx.type, err);
    }
  }
  last.connect(output);
  output.connect(fade);
  return {
    input, output, fade, instances,
    dispose() {
      for (const inst of instances.values()) inst.dispose();
      for (const n of [input, output, fade]) {
        try { n.disconnect(); } catch { /* gone */ }
      }
    },
  };
}

class Graph {
  readonly ctx: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private readonly inputGain: GainNode;
  private readonly muteGain: GainNode;
  private readonly dryGain: GainNode;
  private readonly wetGain: GainNode;
  readonly sfxBus: GainNode;
  private readonly master: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  readonly outGain: GainNode;
  readonly inputMeter: AnalyserNode;
  readonly outputMeter: AnalyserNode;
  private chain?: Chain;
  private gate?: AudioWorkletNode;
  private signature = "";
  ready: Promise<void>;

  constructor(readonly role: Role) {
    this.ctx = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
    const c = this.ctx;
    this.inputGain = c.createGain();
    this.muteGain = c.createGain();
    this.dryGain = c.createGain();
    this.wetGain = c.createGain();
    this.sfxBus = c.createGain();
    this.master = c.createGain();
    this.limiter = c.createDynamicsCompressor();
    this.outGain = c.createGain();
    this.inputMeter = c.createAnalyser();
    this.outputMeter = c.createAnalyser();
    this.inputMeter.fftSize = 1024;
    this.outputMeter.fftSize = 1024;
    // Brick-wall-ish safety: a loud sound or a feedback burst never clips the stream.
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;

    this.inputGain.connect(this.inputMeter);
    this.inputGain.connect(this.muteGain);
    this.muteGain.connect(this.dryGain).connect(this.master);
    this.wetGain.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(this.limiter).connect(this.outGain);
    this.outGain.connect(this.outputMeter);
    this.outGain.connect(c.destination);
    this.ready = Promise.all(WORKLETS.map((w) => c.audioWorklet.addModule(new URL(w, document.baseURI).href))).then(() => {
      // Microphone noise filter, before every voice (and the natural mic): breathing, the
      // keyboard and the room stay out of the stream when you are not speaking.
      this.gate = new AudioWorkletNode(c, "cv-noise-gate", {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: "explicit",
        parameterData: { threshold: -90, release: 220 },
      });
      this.inputGain.disconnect(this.muteGain);
      this.inputGain.connect(this.gate).connect(this.muteGain);
    });
  }

  attachMic(stream: MediaStream | null): void {
    try { this.source?.disconnect(); } catch { /* gone */ }
    this.source = undefined;
    if (!stream) return;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.inputGain);
  }

  async setSink(deviceId: string | null): Promise<boolean> {
    const ctx = this.ctx as AudioContext & { setSinkId?: (id: string | { type: "none" }) => Promise<void> };
    if (!ctx.setSinkId) return deviceId !== null;
    try {
      await ctx.setSinkId(deviceId === null ? { type: "none" } : deviceId);
      return true;
    } catch (err) {
      console.error(`[engine] ${this.role} sink`, err);
      try { await ctx.setSinkId({ type: "none" }); } catch { /* nothing more to do */ }
      return false;
    }
  }

  private at(param: AudioParam, value: number, time = FADE): void {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + time);
  }

  setLevels(s: Settings, bypass: boolean, sfxOn: boolean, outVolume: number): void {
    this.at(this.inputGain.gain, dbToLin(s.inputGainDb));
    this.at(this.muteGain.gain, s.micMuted ? 0 : 1);
    const threshold = this.gate?.parameters.get("threshold");
    if (threshold) threshold.value = s.micGate ? s.micGateDb : -90;
    const voiceOn = s.voiceEnabled && !bypass && !!this.chain;
    this.at(this.dryGain.gain, voiceOn ? 0 : 1);
    this.at(this.wetGain.gain, voiceOn ? 1 : 0);
    this.at(this.sfxBus.gain, sfxOn ? s.sfxVolume : 0);
    this.at(this.outGain.gain, outVolume);
  }

  /** Same chain shape: retune live. Different shape: build a new chain and crossfade. */
  setVoice(effects: EffectState[] | null): void {
    const sig = effects ? chainSignature(effects) : "";
    if (effects && this.chain && sig === this.signature) {
      for (const fx of effects) {
        const inst = this.chain.instances.get(fx.id);
        if (inst) for (const [k, v] of Object.entries(fx.params)) inst.set(k, v);
      }
      return;
    }
    const old = this.chain;
    this.signature = sig;
    this.chain = undefined;
    if (effects) {
      const next = buildChain(this.ctx, effects);
      this.muteGain.connect(next.input);
      next.fade.connect(this.wetGain);
      this.at(next.fade.gain, 1);
      this.chain = next;
    }
    if (old) {
      this.at(old.fade.gain, 0);
      setTimeout(() => old.dispose(), FADE * 1000 + 80);
    }
  }

  hasPitch(effects: EffectState[] | null): boolean {
    return !!effects?.some((e) => e.enabled && e.type === "pitch");
  }

  latencyMs(): number {
    const c = this.ctx as AudioContext & { outputLatency?: number };
    return ((c.baseLatency ?? 0) + (c.outputLatency ?? 0)) * 1000;
  }

  close(): void {
    this.gate?.port.postMessage({ dispose: true });
    this.setVoice(null);
    this.attachMic(null);
    void this.ctx.close().catch(() => undefined);
  }
}

interface Playing {
  sources: AudioBufferSourceNode[];
  startedAt: number;
  duration: number;
  loop: boolean;
}

type Listener = () => void;

export class AudioEngine {
  private settings?: Settings;
  private voice: VoiceProfile | null = null;
  private bypass = false;
  private stream?: Graph;
  private monitor?: Graph;
  private mic: MediaStream | null = null;
  private micKey = "";
  private streamSink = "\u0000";
  private monitorSink = "\u0000";
  private buffers = new Map<string, AudioBuffer>();
  private playing = new Map<string, Playing[]>();
  private listeners = new Set<Listener>();
  private watchdog?: ReturnType<typeof setInterval>;
  private applying: Promise<void> = Promise.resolve();
  status: EngineStatus = { mic: "starting", stream: "starting", monitor: "off", latencyMs: 0 };

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(patch: Partial<EngineStatus>): void {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Apply settings; serialized so two quick changes never race on the devices. */
  apply(settings: Settings): Promise<void> {
    this.settings = settings;
    this.applying = this.applying.then(() => this.reconcile()).catch((err) => console.error("[engine]", err));
    return this.applying;
  }

  private async reconcile(): Promise<void> {
    const s = this.settings;
    if (!s) return;
    if (!this.stream) {
      this.stream = new Graph("stream");
      await this.stream.ready;
      this.stream.setVoice(this.voice?.effects ?? null);
      // Plugging any USB device fires this: only what actually changed is reopened, so the
      // stream never glitches because a gamepad was plugged in.
      navigator.mediaDevices.addEventListener("devicechange", () => {
        if (this.settings) void this.apply(this.settings);
      });
      this.watchdog = setInterval(() => this.watch(), 2000);
    }

    if (s.monitorEnabled && !this.monitor) {
      this.monitor = new Graph("monitor");
      await this.monitor.ready;
      this.monitor.setVoice(this.voice?.effects ?? null);
      this.monitor.attachMic(this.mic);
      this.monitorSink = "\u0000";
    } else if (!s.monitorEnabled && this.monitor) {
      this.monitor.close();
      this.monitor = undefined;
      this.emit({ monitor: "off" });
    }

    await this.ensureMic(s);
    await this.ensureSinks(s);
    this.levels();
    this.emit({ latencyMs: this.latency() });
  }

  private async ensureMic(s: Settings): Promise<void> {
    const key = `${s.inputDeviceId}|${s.noiseSuppression}`;
    const wanted = s.inputDeviceId && s.inputDeviceId !== "default" ? s.inputDeviceId : undefined;
    const track = this.mic?.getAudioTracks()[0];
    if (key === this.micKey && track?.readyState === "live") {
      // Running on the default microphone while the chosen one was away: switch back
      // only once it is plugged in again.
      if (!wanted || track.getSettings().deviceId === wanted) return;
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
      if (!devices.some((d) => d.kind === "audioinput" && d.deviceId === wanted)) return;
    }
    this.micKey = key;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    const constraints = (deviceId?: string): MediaStreamConstraints => ({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: s.noiseSuppression,
        channelCount: 1,
        sampleRate: 48000,
      },
      video: false,
    });
    try {
      try {
        this.mic = await navigator.mediaDevices.getUserMedia(constraints(wanted));
      } catch (err) {
        if (!wanted) throw err;
        console.warn("[engine] chosen microphone unavailable, using the default one", err);
        this.mic = await navigator.mediaDevices.getUserMedia(constraints());
      }
      this.mic.getAudioTracks().forEach((t) => t.addEventListener("ended", () => { this.micKey = ""; }));
      // On "Windows default", a virtual default (installing VB-CABLE makes CABLE Output the
      // default microphone) is swapped for the real microphone.
      if (!wanted && this.mic.getAudioTracks().some((t) => isVirtualMic(t.label))) {
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
        const real = pickRealMic(devices.filter((d) => d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications"), "");
        if (real) {
          this.mic.getTracks().forEach((t) => t.stop());
          this.mic = await navigator.mediaDevices.getUserMedia(constraints(real));
          this.mic.getAudioTracks().forEach((t) => t.addEventListener("ended", () => { this.micKey = ""; }));
        }
      }
      // The virtual cable as microphone would feed our own output back in, forever.
      if (this.mic.getAudioTracks().some((t) => LOOP_PATTERN.test(t.label))) {
        this.mic.getTracks().forEach((t) => t.stop());
        this.mic = null;
        this.emit({ mic: "loop" });
      } else {
        this.emit({ mic: "ok" });
      }
    } catch (err) {
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      this.emit({ mic: denied ? "denied" : "missing" });
    }
    this.stream?.attachMic(this.mic);
    this.monitor?.attachMic(this.mic);
  }

  private async ensureSinks(s: Settings): Promise<void> {
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
    const outputs = devices.filter((d) => d.kind === "audiooutput");

    let streamId: string | null = null;
    let label: string | undefined;
    if (s.streamOutputId) {
      const d = outputs.find((o) => o.deviceId === s.streamOutputId);
      if (d) { streamId = d.deviceId; label = d.label; }
    } else {
      const cable = outputs.find((o) => CABLE_PATTERN.test(o.label));
      if (cable) { streamId = cable.deviceId; label = cable.label; }
    }
    const streamKey = streamId ?? "none";
    if (this.stream && streamKey !== this.streamSink) {
      this.streamSink = streamKey;
      const ok = streamId !== null && (await this.stream.setSink(streamId));
      if (!ok && streamId !== null) await this.stream.setSink(null);
      this.emit({ stream: ok ? "ok" : "missing", streamDeviceLabel: label });
    }

    if (this.monitor) {
      const want = s.monitorOutputId && outputs.some((o) => o.deviceId === s.monitorOutputId) ? s.monitorOutputId : "";
      if (want !== this.monitorSink) {
        this.monitorSink = want;
        const ok = await this.monitor.setSink(want);
        this.emit({ monitor: ok ? "ok" : "missing" });
      }
    }
  }

  private levels(): void {
    const s = this.settings;
    if (!s) return;
    this.stream?.setLevels(s, this.bypass, s.sfxToStream, 1);
    this.monitor?.setLevels(s, this.bypass, s.sfxToMonitor, s.monitorVolume);
  }

  private latency(): number {
    const pitch = this.voice && this.settings?.voiceEnabled && this.stream?.hasPitch(this.voice.effects) ? PITCH_LATENCY_MS : 0;
    const g = this.monitor ?? this.stream;
    return Math.round((g?.latencyMs() ?? 0) + pitch + 10);
  }

  private watch(): void {
    for (const g of [this.stream, this.monitor]) {
      if (g && g.ctx.state === "suspended") void g.ctx.resume().catch(() => undefined);
    }
    const dead = !this.mic || this.mic.getAudioTracks().every((t) => t.readyState === "ended");
    if (dead && this.settings && this.status.mic !== "denied" && this.status.mic !== "loop") {
      this.micKey = "";
      void this.apply(this.settings);
    }
  }

  /** The voice heard on stream and in the headphones. null = the plain microphone. */
  setVoice(voice: VoiceProfile | null): void {
    this.voice = voice;
    this.stream?.setVoice(voice?.effects ?? null);
    this.monitor?.setVoice(voice?.effects ?? null);
    this.levels();
    this.emit({ latencyMs: this.latency() });
  }

  /** Hold-to-compare in the Lab: the raw microphone while held. */
  setBypass(on: boolean): void {
    this.bypass = on;
    this.levels();
  }

  /** Listens to the room for ms (stay silent) and returns the loudest noise peak, in dBFS. */
  async measureNoiseFloor(ms = 2500): Promise<number> {
    let loudest = -100;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      loudest = Math.max(loudest, this.meter("input"));
      await new Promise((r) => setTimeout(r, 50));
    }
    return loudest;
  }

  /** Live levels in dBFS for the meters. */
  meter(which: "input" | "output"): number {
    const g = this.stream;
    if (!g) return -100;
    const an = which === "input" ? g.inputMeter : (this.monitor ?? g).outputMeter;
    const buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
    return peak > 0 ? 20 * Math.log10(peak) : -100;
  }

  // ------------------------------------------------------------ soundboard

  hasBuffer(file: string): boolean {
    return this.buffers.has(file);
  }

  async load(file: string, bytes: ArrayBuffer): Promise<AudioBuffer> {
    const hit = this.buffers.get(file);
    if (hit) return hit;
    const ctx = this.stream?.ctx ?? new AudioContext({ sampleRate: 48000 });
    const buf = await ctx.decodeAudioData(bytes);
    this.buffers.set(file, buf);
    return buf;
  }

  forget(file: string): void {
    this.buffers.delete(file);
  }

  isPlaying(id: string): boolean {
    return (this.playing.get(id)?.length ?? 0) > 0;
  }

  /** Progress 0..1 of the most recent instance of a sound, or -1 when silent. */
  progress(id: string): number {
    const list = this.playing.get(id);
    if (!list?.length || !this.stream) return -1;
    const p = list[list.length - 1];
    const t = this.stream.ctx.currentTime - p.startedAt;
    return p.loop ? (t % p.duration) / p.duration : Math.min(1, t / p.duration);
  }

  play(sound: Sound): boolean {
    const buffer = this.buffers.get(sound.file);
    if (!buffer || !this.stream) return false;
    if (this.isPlaying(sound.id)) {
      if (sound.mode === "toggle") { this.stop(sound.id); return false; }
      if (sound.mode === "restart") this.stop(sound.id);
    }
    const sources: AudioBufferSourceNode[] = [];
    for (const g of [this.stream, this.monitor]) {
      if (!g) continue;
      const src = g.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = sound.loop;
      const vol = g.ctx.createGain();
      vol.gain.value = sound.volume;
      src.connect(vol).connect(g.sfxBus);
      src.start();
      sources.push(src);
    }
    const entry: Playing = { sources, startedAt: this.stream.ctx.currentTime, duration: buffer.duration, loop: sound.loop };
    const list = this.playing.get(sound.id) ?? [];
    list.push(entry);
    this.playing.set(sound.id, list);
    sources[0].onended = () => {
      const l = this.playing.get(sound.id)?.filter((x) => x !== entry) ?? [];
      if (l.length) this.playing.set(sound.id, l); else this.playing.delete(sound.id);
      this.listeners.forEach((fn) => fn());
    };
    this.listeners.forEach((fn) => fn());
    return true;
  }

  stop(id: string): void {
    for (const p of this.playing.get(id) ?? []) {
      for (const s of p.sources) {
        try { s.stop(); } catch { /* already stopped */ }
      }
    }
    this.playing.delete(id);
    this.listeners.forEach((fn) => fn());
  }

  stopAll(): void {
    for (const id of [...this.playing.keys()]) this.stop(id);
  }

  /** Diagnostics for the smoke test. */
  info() {
    const lat = (g?: Graph) => g && { state: g.ctx.state, base: g.ctx.baseLatency, output: (g.ctx as AudioContext & { outputLatency?: number }).outputLatency };
    return { status: this.status, stream: lat(this.stream), monitor: lat(this.monitor) };
  }

  dispose(): void {
    clearInterval(this.watchdog);
    this.stopAll();
    this.stream?.close();
    this.monitor?.close();
    this.mic?.getTracks().forEach((t) => t.stop());
  }
}

export const engine = new AudioEngine();
