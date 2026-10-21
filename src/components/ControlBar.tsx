// The control bar at the bottom of every page, after Voicemod's:
// power | the glowing medallion of the live voice | hear myself | more.

import { useEffect, useRef, useState } from "react";
import { ChevronUp, Ear, EarOff, Headphones, Mic, MicOff, Power, Square } from "lucide-react";
import { engine } from "../audio/engine";
import { useDevices } from "../lib/devices";
import { useT } from "../lib/i18n";
import { useEngineTick, useStore } from "../lib/store";
import { MicSensitivity } from "./MicSensitivity";
import { Meter, Slider, VoiceLogo } from "./ui";

export function ControlBar({ previewing, onOpenVoices }: { previewing: boolean; onOpenVoices: () => void }) {
  const t = useT();
  const { data, setSettings, liveVoice: activeVoice, status } = useStore();
  const s = data.settings;
  const [open, setOpen] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  const { outputs } = useDevices();
  useEngineTick();
  const anyPlaying = data.sounds.some((x) => engine.isPlaying(x.id));

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (pop.current && !pop.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const live = s.voiceEnabled && !!activeVoice;
  const color = live ? activeVoice!.color : "#2a3060";
  const streamText =
    status.stream === "ok"
      ? t("status.stream.ok", { device: (status.streamDeviceLabel ?? "").replace(/\s*\(.*\)$/, "") || "OK" })
      : t(`status.stream.${status.stream}`);

  return (
    <div className="relative z-30 border-t border-void-700 bg-void-950/95 px-6 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6">
        {/* left: what is live */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            onClick={() => setSettings({ micMuted: !s.micMuted })}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
              s.micMuted ? "border-rose-600 bg-rose-900/40 text-rose-300" : "border-void-600 text-slate-300 hover:border-nexus-500 hover:text-white"
            }`}
            title={s.micMuted ? t("control.unmute") : t("control.mute")}
          >
            {s.micMuted ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-white">
                {s.micMuted ? t("control.muted") : live ? activeVoice!.name : t("control.natural")}
              </span>
              {previewing && <span className="chip border-curse-500/60 text-curse-300">{t("control.previewing")}</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="w-9 text-[10px] uppercase tracking-widest text-slate-500">{t("control.input")}</span>
              <Meter which="input" className="max-w-[180px]" />
            </div>
            <div className="mt-1 text-[11px] text-slate-500">{t("control.latency", { ms: status.latencyMs })}</div>
          </div>
        </div>

        {/* centre: the Voicemod cluster */}
        <div className="flex items-center gap-4 rounded-full border border-void-700 bg-void-900/80 px-3 py-2">
          <button
            onClick={() => setSettings({ voiceEnabled: !s.voiceEnabled })}
            className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition ${
              s.voiceEnabled ? "border-curse-400 text-curse-300 shadow-curse" : "border-void-600 text-slate-500 hover:text-slate-200"
            }`}
            title={s.voiceEnabled ? t("control.on") : t("control.off")}
            aria-pressed={s.voiceEnabled}
          >
            <Power size={22} />
          </button>
          <button onClick={onOpenVoices} className="-my-6 rounded-full transition hover:scale-105" title={activeVoice?.name}>
            {activeVoice ? (
              <VoiceLogo logo={activeVoice.logo} color={live ? color : "#475569"} size={84} glow={live} />
            ) : (
              <div className="flex h-[84px] w-[84px] items-center justify-center rounded-full border-2 border-void-600 bg-void-850">
                <Mic className="text-slate-500" />
              </div>
            )}
          </button>
          <button
            onClick={() => setSettings({ monitorEnabled: !s.monitorEnabled })}
            className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition ${
              s.monitorEnabled ? "border-curse-400 text-curse-300 shadow-curse" : "border-void-600 text-slate-500 hover:text-slate-200"
            }`}
            title={t("control.monitor")}
            aria-pressed={s.monitorEnabled}
          >
            {s.monitorEnabled ? <Ear size={22} /> : <EarOff size={22} />}
          </button>
          <div className="relative" ref={pop}>
            <button
              onClick={() => setOpen((o) => !o)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:text-white ${open ? "rotate-180" : ""}`}
              aria-expanded={open}
            >
              <ChevronUp size={18} />
            </button>
            {open && (
              <div className="absolute bottom-12 left-1/2 w-96 -translate-x-1/2 animate-rise rounded-xl border border-void-600 bg-void-850 p-4 shadow-2xl">
                <div className="label mb-2 flex items-center gap-2">
                  <Headphones size={14} /> {t("control.monitorVolume")}
                </div>
                <Slider
                  value={Math.round(s.monitorVolume * 100)}
                  min={0}
                  max={150}
                  step={1}
                  onChange={(v) => setSettings({ monitorVolume: v / 100 })}
                  format={(v) => `${v} %`}
                  label={t("control.monitorVolume")}
                />
                <div className="label mb-2 mt-4">{t("control.monitorDevice")}</div>
                <select className="w-full" value={s.monitorOutputId} onChange={(e) => setSettings({ monitorOutputId: e.target.value })}>
                  <option value="">{t("settings.default")}</option>
                  {outputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>
                  ))}
                </select>
                <p className="mt-3 text-xs text-amber-300/90">{t("control.headphones")}</p>
                <div className="mt-4 border-t border-void-700 pt-4"><MicSensitivity compact /></div>
              </div>
            )}
          </div>
        </div>

        {/* right: where it goes */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          <div className="min-w-0 flex-1 text-right">
            <div className={`truncate text-xs ${status.stream === "ok" ? "text-emerald-300" : "text-rose-300"}`}>
              <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${status.stream === "ok" ? "bg-emerald-400" : "bg-rose-500"}`} />
              {streamText}
            </div>
            <div className="mt-1.5 flex items-center justify-end gap-2">
              <Meter which="output" className="max-w-[180px]" />
              <span className="w-12 text-[10px] uppercase tracking-widest text-slate-500">{t("control.output")}</span>
            </div>
          </div>
          <button
            onClick={() => engine.stopAll()}
            disabled={!anyPlaying}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-void-600 text-slate-300 transition hover:border-rose-500 hover:text-rose-300 disabled:opacity-30"
            title={t("control.stopSounds")}
          >
            <Square size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
