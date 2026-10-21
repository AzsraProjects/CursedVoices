// Shapes shared by the renderer and persisted by the main process (electron/store.ts).

export type Lang = "fr" | "en";

export type EffectType =
  | "gain"
  | "gate"
  | "compressor"
  | "eq"
  | "filter"
  | "pitch"
  | "reverb"
  | "delay"
  | "chorus"
  | "flanger"
  | "vibrato"
  | "tremolo"
  | "distortion"
  | "bitcrusher"
  | "robot";

export interface EffectState {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number>;
}

/** A voice logo: a built-in icon, an emoji, or an image the user picked (data URL, 256 px max). */
export type Logo =
  | { kind: "icon"; icon: string }
  | { kind: "emoji"; value: string }
  | { kind: "image"; data: string };

export interface MidiBinding {
  kind: "note" | "cc";
  channel: number; // 0-15
  number: number; // note or controller number
}

export interface VoiceProfile {
  id: string;
  name: string;
  color: string; // hex, the glow of the medallion
  logo: Logo;
  effects: EffectState[];
  hotkey?: string; // Electron accelerator
  midi?: MidiBinding;
  createdAt: number;
  updatedAt: number;
}

export type SoundMode = "restart" | "toggle" | "overlap";

export interface Sound {
  id: string;
  name: string;
  file: string; // file name inside the app's sounds folder
  color: string;
  emoji?: string;
  image?: string; // data URL
  volume: number; // 0..1.5
  mode: SoundMode;
  loop: boolean;
  hotkey?: string;
  midi?: MidiBinding;
}

export type GlobalAction = "voice.toggle" | "monitor.toggle" | "mic.mute" | "sounds.stop";

export interface Settings {
  language: Lang;
  firstRunDone: boolean;
  inputDeviceId: string;
  streamOutputId: string; // "" = not chosen yet, auto-picks the virtual cable
  monitorOutputId: string;
  voiceEnabled: boolean;
  monitorEnabled: boolean;
  micMuted: boolean;
  monitorVolume: number; // 0..1
  activeVoiceId: string;
  inputGainDb: number;
  noiseSuppression: boolean;
  micGate: boolean; // noise filter before every voice
  micGateDb: number; // opens above this level (dBFS)
  sfxVolume: number; // 0..1
  sfxToStream: boolean;
  sfxToMonitor: boolean;
  hotkeys: Partial<Record<GlobalAction, string>>;
  midi: Partial<Record<GlobalAction, MidiBinding>>;
  closeToTray: boolean;
  startWithWindows: boolean;
  startMinimized: boolean;
}

export interface AppData {
  settings: Settings;
  voices: VoiceProfile[];
  sounds: Sound[];
}

export interface UpdateStatus {
  state: "idle" | "checking" | "available" | "none" | "downloading" | "ready" | "error";
  current: string;
  version?: string;
  percent?: number;
  message?: string;
}

export interface CableStatus {
  installed: boolean;
  name?: string;
}
