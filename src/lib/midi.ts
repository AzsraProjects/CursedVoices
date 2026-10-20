// MIDI controllers through Web MIDI. Note-on and CC (value >= 64, rising edge) trigger
// actions; "learn" captures the next pad you hit.

import type { MidiBinding } from "./types";

type Handler = (b: MidiBinding) => void;

class Midi {
  private access?: MIDIAccess;
  private handlers = new Set<Handler>();
  private learner?: (b: MidiBinding) => void;
  private ccHigh = new Set<string>();
  private changeListeners = new Set<() => void>();
  error: string | null = null;

  async init(): Promise<void> {
    if (this.access || !navigator.requestMIDIAccess) return;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => {
        this.wire();
        this.changeListeners.forEach((l) => l());
      };
      this.wire();
    } catch (err) {
      this.error = String(err);
    }
  }

  private wire(): void {
    this.access?.inputs.forEach((input) => {
      input.onmidimessage = (e) => this.onMessage(e.data);
    });
  }

  private onMessage(data: Uint8Array | null): void {
    if (!data || data.length < 3) return;
    const status = data[0] & 0xf0;
    const channel = data[0] & 0x0f;
    let binding: MidiBinding | null = null;
    if (status === 0x90 && data[2] > 0) binding = { kind: "note", channel, number: data[1] };
    if (status === 0xb0) {
      const key = `${channel}:${data[1]}`;
      if (data[2] >= 64 && !this.ccHigh.has(key)) {
        this.ccHigh.add(key);
        binding = { kind: "cc", channel, number: data[1] };
      } else if (data[2] < 64) this.ccHigh.delete(key);
    }
    if (!binding) return;
    if (this.learner) {
      const done = this.learner;
      this.learner = undefined;
      done(binding);
      return;
    }
    this.handlers.forEach((h) => h(binding!));
  }

  devices(): string[] {
    const names: string[] = [];
    this.access?.inputs.forEach((i) => names.push(i.name ?? "MIDI"));
    return names;
  }

  onTrigger(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  onDevicesChange(l: () => void): () => void {
    this.changeListeners.add(l);
    return () => this.changeListeners.delete(l);
  }

  learn(): Promise<MidiBinding> {
    return new Promise((resolve) => {
      this.learner = resolve;
    });
  }

  cancelLearn(): void {
    this.learner = undefined;
  }
}

export const midi = new Midi();

export const sameBinding = (a?: MidiBinding, b?: MidiBinding): boolean =>
  !!a && !!b && a.kind === b.kind && a.channel === b.channel && a.number === b.number;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function formatBinding(b: MidiBinding): string {
  if (b.kind === "cc") return `CC ${b.number} · ch${b.channel + 1}`;
  return `${NOTE_NAMES[b.number % 12]}${Math.floor(b.number / 12) - 1} · ch${b.channel + 1}`;
}
