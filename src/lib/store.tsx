// The app state: settings, voices, sounds. Loaded from and saved to the main process,
// and mirrored into the audio engine, the global shortcuts, MIDI and the tray.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { engine, type EngineStatus } from "../audio/engine";
import { cv, toArrayBuffer } from "./bridge";
import { midi, sameBinding } from "./midi";
import { presetVoices } from "./presets";
import type { AppData, GlobalAction, MidiBinding, Settings, Sound, VoiceProfile } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  language: "fr",
  firstRunDone: false,
  inputDeviceId: "default",
  streamOutputId: "",
  monitorOutputId: "",
  voiceEnabled: true,
  monitorEnabled: false,
  micMuted: false,
  monitorVolume: 0.8,
  activeVoiceId: "",
  inputGainDb: 0,
  noiseSuppression: false,
  micGate: true,
  micGateDb: -48,
  sfxVolume: 0.8,
  sfxToStream: true,
  sfxToMonitor: true,
  hotkeys: {},
  midi: {},
  closeToTray: true,
  startWithWindows: false,
  startMinimized: false,
};

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
}

interface Store {
  ready: boolean;
  data: AppData;
  status: EngineStatus;
  toasts: Toast[];
  activeVoice: VoiceProfile | null;
  /** What is heard right now: the Lab draft while editing, otherwise the active voice. */
  liveVoice: VoiceProfile | null;
  setSettings(patch: Partial<Settings>): void;
  saveVoice(v: VoiceProfile): void;
  deleteVoice(id: string): void;
  activateVoice(id: string): void;
  restorePresets(): void;
  previewVoice(v: VoiceProfile | null): void;
  saveSound(s: Sound): void;
  deleteSound(id: string): void;
  reorderSounds(ids: string[]): void;
  importSounds(files: File[]): Promise<void>;
  playSound(id: string): void;
  toast(text: string, kind?: Toast["kind"]): void;
  dismiss(id: number): void;
  runAction(action: string): void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider missing");
  return s;
}

/** Re-renders on every engine change (status, sounds starting and stopping). */
export function useEngineTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => engine.subscribe(() => setN((x) => x + 1)), []);
  return n;
}

function normalize(raw: unknown, language: Settings["language"]): AppData {
  const d = (raw ?? {}) as Partial<AppData>;
  const settings: Settings = { ...DEFAULT_SETTINGS, language, ...(d.settings ?? {}) };
  settings.hotkeys = { ...(d.settings?.hotkeys ?? {}) };
  settings.midi = { ...(d.settings?.midi ?? {}) };
  const voices = Array.isArray(d.voices) ? d.voices : presetVoices();
  const sounds = Array.isArray(d.sounds) ? d.sounds : [];
  if (!voices.some((v) => v.id === settings.activeVoiceId)) settings.activeVoiceId = voices[0]?.id ?? "";
  return { settings, voices, sounds };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<AppData>({ settings: DEFAULT_SETTINGS, voices: [], sounds: [] });
  const [status, setStatus] = useState<EngineStatus>(engine.status);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [preview, setPreview] = useState<VoiceProfile | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  // ---------------------------------------------------------- load / save
  useEffect(() => {
    void cv().store.load().then(({ data: raw, language }) => {
      const d = normalize(raw, language);
      setData(d);
      setReady(true);
    });
    return engine.subscribe(() => setStatus(engine.status));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void cv().store.save(data).then((ok) => {
        if (!ok) toast("toast.saveFailed", "error");
      });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ready]);

  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((l) => [...l.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), 4500);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((l) => l.filter((x) => x.id !== id)), []);

  // ---------------------------------------------------------- engine
  const { settings } = data;
  const activeVoice = data.voices.find((v) => v.id === settings.activeVoiceId) ?? null;

  useEffect(() => {
    if (ready) void engine.apply(settings);
  }, [ready, settings]);

  useEffect(() => {
    if (ready) engine.setVoice(preview ?? activeVoice);
  }, [ready, preview, activeVoice]);

  // Decode every soundboard file once, so a hit plays instantly.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      for (const s of data.sounds) {
        if (cancelled || engine.hasBuffer(s.file)) continue;
        try {
          await engine.apply(dataRef.current.settings);
          const bytes = await cv().sounds.read(s.file);
          await engine.load(s.file, toArrayBuffer(bytes));
        } catch (err) {
          console.error("[sounds] cannot load", s.file, err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, data.sounds]);

  // ---------------------------------------------------------- side channels
  useEffect(() => {
    if (!ready) return;
    void cv().app.setLanguage(settings.language);
    document.documentElement.lang = settings.language;
  }, [ready, settings.language]);

  useEffect(() => {
    if (!ready) return;
    void cv().app.setPrefs({
      closeToTray: settings.closeToTray,
      startWithWindows: settings.startWithWindows,
      startMinimized: settings.startMinimized,
    });
  }, [ready, settings.closeToTray, settings.startWithWindows, settings.startMinimized]);

  useEffect(() => {
    if (!ready) return;
    void cv().app.trayState({
      voiceEnabled: settings.voiceEnabled,
      monitorEnabled: settings.monitorEnabled,
      voiceName: activeVoice?.name ?? "",
    });
  }, [ready, settings.voiceEnabled, settings.monitorEnabled, activeVoice?.name]);

  const shortcutList = useMemo(() => {
    const list: { accelerator: string; action: string }[] = [];
    for (const [action, acc] of Object.entries(settings.hotkeys)) if (acc) list.push({ accelerator: acc, action });
    for (const v of data.voices) if (v.hotkey) list.push({ accelerator: v.hotkey, action: `voice:${v.id}` });
    for (const s of data.sounds) if (s.hotkey) list.push({ accelerator: s.hotkey, action: `sound:${s.id}` });
    return list;
  }, [settings.hotkeys, data.voices, data.sounds]);
  const shortcutKey = JSON.stringify(shortcutList);

  useEffect(() => {
    if (!ready) return;
    void cv().shortcuts.set(shortcutList).then((failed) => {
      if (failed.length) toast(`toast.shortcutTaken|${failed.join(", ")}`, "error");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, shortcutKey]);

  // ---------------------------------------------------------- mutations
  const update = useCallback((fn: (d: AppData) => AppData) => setData((d) => fn(d)), []);

  const setSettings = useCallback(
    (patch: Partial<Settings>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
    [update],
  );

  const saveVoice = useCallback((v: VoiceProfile) => {
    update((d) => {
      const exists = d.voices.some((x) => x.id === v.id);
      const next = { ...v, updatedAt: Date.now() };
      return { ...d, voices: exists ? d.voices.map((x) => (x.id === v.id ? next : x)) : [...d.voices, next] };
    });
  }, [update]);

  const deleteVoice = useCallback((id: string) => {
    update((d) => {
      const voices = d.voices.filter((v) => v.id !== id);
      const activeVoiceId = d.settings.activeVoiceId === id ? voices[0]?.id ?? "" : d.settings.activeVoiceId;
      return { ...d, voices, settings: { ...d.settings, activeVoiceId } };
    });
  }, [update]);

  const activateVoice = useCallback(
    (id: string) => setSettings({ activeVoiceId: id, voiceEnabled: true }),
    [setSettings],
  );

  const restorePresets = useCallback(() => {
    update((d) => {
      const names = new Set(d.voices.map((v) => v.name));
      const missing = presetVoices().filter((p) => !names.has(p.name));
      return { ...d, voices: [...d.voices, ...missing] };
    });
  }, [update]);

  const saveSound = useCallback((s: Sound) => {
    update((d) => {
      const exists = d.sounds.some((x) => x.id === s.id);
      return { ...d, sounds: exists ? d.sounds.map((x) => (x.id === s.id ? s : x)) : [...d.sounds, s] };
    });
  }, [update]);

  const deleteSound = useCallback((id: string) => {
    const s = dataRef.current.sounds.find((x) => x.id === id);
    if (s) {
      engine.stop(id);
      engine.forget(s.file);
      void cv().sounds.remove(s.file);
    }
    update((d) => ({ ...d, sounds: d.sounds.filter((x) => x.id !== id) }));
  }, [update]);

  const reorderSounds = useCallback((ids: string[]) => {
    update((d) => {
      const byId = new Map(d.sounds.map((s) => [s.id, s]));
      return { ...d, sounds: ids.map((id) => byId.get(id)!).filter(Boolean) };
    });
  }, [update]);

  const importSounds = useCallback(async (files: File[]) => {
    const palette = ["#8b5cf6", "#2ee6d6", "#f5c451", "#ef4444", "#46a8ff", "#ec4899", "#16a34a", "#f97316"];
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await engine.apply(dataRef.current.settings);
        await engine.load(`__probe:${file.name}`, toArrayBuffer(bytes)); // refuses files that do not decode
        engine.forget(`__probe:${file.name}`);
        const stored = await cv().sounds.save(file.name, bytes);
        await engine.load(stored, toArrayBuffer(bytes));
        const n = dataRef.current.sounds.length;
        saveSound({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: file.name.replace(/\.[^.]+$/, "").slice(0, 32),
          file: stored,
          color: palette[n % palette.length],
          volume: 1,
          mode: "restart",
          loop: false,
        });
      } catch (err) {
        console.error("[sounds] import", file.name, err);
        toast(`toast.importFailed|${file.name}`, "error");
      }
    }
  }, [saveSound, toast]);

  const playSound = useCallback((id: string) => {
    const s = dataRef.current.sounds.find((x) => x.id === id);
    if (s) engine.play(s);
  }, []);

  // ---------------------------------------------------------- actions (shortcuts, MIDI, tray)
  const runAction = useCallback((action: string) => {
    const d = dataRef.current;
    const s = d.settings;
    if (action === "voice.toggle") setSettings({ voiceEnabled: !s.voiceEnabled });
    else if (action === "monitor.toggle") setSettings({ monitorEnabled: !s.monitorEnabled });
    else if (action === "mic.mute") setSettings({ micMuted: !s.micMuted });
    else if (action === "sounds.stop") engine.stopAll();
    else if (action.startsWith("voice:")) {
      const id = action.slice(6);
      // Hitting the key of the voice already on switches the voice off, like a pedal.
      if (s.activeVoiceId === id && s.voiceEnabled) setSettings({ voiceEnabled: false });
      else activateVoice(id);
    } else if (action.startsWith("sound:")) playSound(action.slice(6));
  }, [setSettings, activateVoice, playSound]);

  useEffect(() => cv().onAction(runAction), [runAction]);

  useEffect(() => {
    void midi.init();
    return midi.onTrigger((b: MidiBinding) => {
      const d = dataRef.current;
      for (const [action, binding] of Object.entries(d.settings.midi)) {
        if (sameBinding(binding, b)) runAction(action as GlobalAction);
      }
      for (const v of d.voices) if (sameBinding(v.midi, b)) runAction(`voice:${v.id}`);
      for (const s of d.sounds) if (sameBinding(s.midi, b)) runAction(`sound:${s.id}`);
    });
  }, [runAction]);

  const value: Store = {
    ready, data, status, toasts, activeVoice, liveVoice: preview ?? activeVoice,
    setSettings, saveVoice, deleteVoice, activateVoice, restorePresets, previewVoice: setPreview,
    saveSound, deleteSound, reorderSounds, importSounds, playSound, toast, dismiss, runAction,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
