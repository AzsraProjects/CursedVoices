import { useEffect, useState } from "react";
import { AppWindow, Cable, CheckCircle2, Download, Keyboard, Loader2, RefreshCw, SlidersHorizontal, XCircle, type LucideIcon } from "lucide-react";
import { Card, HotkeyInput, Meter, MidiLearn, PageHeader, Row, Slider, Switch } from "../components/ui";
import { UpdateButton } from "../components/UpdateButton";
import { cv } from "../lib/bridge";
import { CABLE_PATTERN, isVirtualMic, useDevices } from "../lib/devices";
import { LANGUAGES, useT, type Key } from "../lib/i18n";
import { midi } from "../lib/midi";
import { useStore } from "../lib/store";
import type { GlobalAction } from "../lib/types";

type Tab = "audio" | "obs" | "controls" | "app";

const TABS: { id: Tab; label: Key; icon: LucideIcon }[] = [
  { id: "audio", label: "settings.tab.audio", icon: SlidersHorizontal },
  { id: "obs", label: "settings.tab.obs", icon: Cable },
  { id: "controls", label: "settings.tab.controls", icon: Keyboard },
  { id: "app", label: "settings.tab.app", icon: AppWindow },
];

export function Settings() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("audio");
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title={t("settings.title")} />
      <div className="flex flex-wrap gap-2 border-b border-void-700 pb-3">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
              tab === id ? "bg-gradient-to-r from-nexus-700/70 to-storm-700/40 text-white shadow-glow" : "text-slate-400 hover:bg-void-800 hover:text-white"
            }`}
          >
            <Icon size={15} className="text-gold-400" /> {t(label)}
          </button>
        ))}
      </div>
      {tab === "audio" && <AudioTab />}
      {tab === "obs" && <ObsTab />}
      {tab === "controls" && <ControlsTab />}
      {tab === "app" && <AppTab />}
    </div>
  );
}

function AudioTab() {
  const t = useT();
  const { data, setSettings } = useStore();
  const s = data.settings;
  const { inputs, outputs, defaultInputLabel, refresh } = useDevices();
  const cable = outputs.find((o) => CABLE_PATTERN.test(o.label));
  const micLabel = s.inputDeviceId === "default" ? defaultInputLabel : inputs.find((d) => d.deviceId === s.inputDeviceId)?.label ?? "";
  const same = !!s.monitorOutputId && (s.monitorOutputId === s.streamOutputId || (!s.streamOutputId && s.monitorOutputId === cable?.deviceId));
  return (
    <div className="space-y-6">
      <Card title={t("settings.devices")} action={<button className="btn-ghost py-1 text-xs" onClick={refresh}><RefreshCw size={12} /> {t("settings.refresh")}</button>}>
        <Row title={t("settings.input")}>
          <select className="w-80" value={s.inputDeviceId} onChange={(e) => setSettings({ inputDeviceId: e.target.value })}>
            <option value="default">{t("settings.default")}</option>
            {inputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>)}
          </select>
        </Row>
        <Row title={t("settings.streamOut")} help={t("settings.streamOutHelp")}>
          <select className="w-80" value={s.streamOutputId} onChange={(e) => setSettings({ streamOutputId: e.target.value })}>
            <option value="">{t("settings.auto")}{cable ? ` → ${cable.label}` : ""}</option>
            {outputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>)}
          </select>
        </Row>
        <Row title={t("settings.monitorOut")}>
          <select className="w-80" value={s.monitorOutputId} onChange={(e) => setSettings({ monitorOutputId: e.target.value })}>
            <option value="">{t("settings.default")}</option>
            {outputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>)}
          </select>
        </Row>
        {isVirtualMic(micLabel) && <p className="mt-3 text-xs text-amber-300">{t("settings.virtualMic")}</p>}
        {same && <p className="mt-3 text-xs text-amber-300">{t("settings.sameDevice")}</p>}
      </Card>

      <Card title={t("settings.processing")}>
        <Row title={t("settings.inputGain")}>
          <div className="w-80">
            <Slider value={s.inputGainDb} min={-12} max={24} step={0.5} onChange={(v) => setSettings({ inputGainDb: v })} format={(v) => `${v > 0 ? "+" : ""}${v} dB`} />
          </div>
        </Row>
        <div className="mb-3 ml-auto w-80"><Meter which="input" /></div>
        <Row title={t("settings.noise")} help={t("settings.noiseHelp")}>
          <Switch checked={s.noiseSuppression} onChange={(v) => setSettings({ noiseSuppression: v })} />
        </Row>
      </Card>
    </div>
  );
}

function ObsTab() {
  const t = useT();
  const { outputs, refresh } = useDevices();
  const { status } = useStore();
  const cable = outputs.find((o) => CABLE_PATTERN.test(o.label));
  const [state, setState] = useState<"idle" | "busy" | "ok" | "failed" | "cancelled">("idle");

  const install = async () => {
    setState("busy");
    const code = await cv().cable.install();
    setState(code === 0 ? "ok" : code === 3 ? "cancelled" : "failed");
    refresh();
  };

  return (
    <div className="space-y-6">
      <Card title={t("obs.cable")}>
        <div className="flex items-start gap-4">
          {cable ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" /> : <XCircle className="mt-0.5 shrink-0 text-rose-400" />}
          <div className="flex-1 space-y-3">
            <p className="text-sm text-slate-200">{cable ? t("obs.cableOk") : t("obs.cableMissing")}</p>
            {!cable && (
              <button className="btn-gold" onClick={() => void install()} disabled={state === "busy"}>
                {state === "busy" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {t("obs.install")}
              </button>
            )}
            {state === "busy" && <p className="text-xs text-curse-300">{t("obs.installing")}</p>}
            {state === "ok" && <p className="text-xs text-emerald-300">{t("obs.installed")}</p>}
            {state === "failed" && <p className="text-xs text-rose-300">{t("obs.installFailed")}</p>}
            {state === "cancelled" && <p className="text-xs text-amber-300">{t("obs.cancelled")}</p>}
            <p className="text-xs text-slate-500">{t("obs.credit")}</p>
          </div>
        </div>
        {status.stream === "ok" && (
          <div className="mt-4 flex items-center gap-3 border-t border-void-700 pt-4">
            <span className="label shrink-0">{t("obs.live")}</span>
            <Meter which="output" />
          </div>
        )}
      </Card>

      <Card title={t("obs.stepsTitle")}>
        <ol className="space-y-3">
          {(["obs.step1", "obs.step2", "obs.step3", "obs.step4"] as Key[]).map((k, i) => (
            <li key={k} className="flex gap-3 text-sm text-slate-200">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-nexus-600 to-curse-600 text-xs font-bold text-white">{i + 1}</span>
              <span className="pt-0.5">{t(k)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 border-t border-void-700 pt-4 text-xs text-slate-400">{t("obs.discord")}</p>
      </Card>
    </div>
  );
}

const ACTIONS: GlobalAction[] = ["voice.toggle", "monitor.toggle", "mic.mute", "sounds.stop"];

function ControlsTab() {
  const t = useT();
  const { data, setSettings } = useStore();
  const s = data.settings;
  const [devices, setDevices] = useState<string[]>([]);
  useEffect(() => {
    void midi.init().then(() => setDevices(midi.devices()));
    return midi.onDevicesChange(() => setDevices(midi.devices()));
  }, []);
  return (
    <div className="space-y-6">
      <Card title={t("controls.global")}>
        <p className="mb-4 text-xs text-slate-500">{t("controls.globalHelp")}</p>
        <div className="mb-2 grid grid-cols-[1fr_170px_170px] gap-3 text-[10px] uppercase tracking-widest text-slate-500">
          <span />
          <span>{t("controls.keyboard")}</span>
          <span>MIDI</span>
        </div>
        {ACTIONS.map((a) => (
          <div key={a} className="grid grid-cols-[1fr_170px_170px] items-center gap-3 border-t border-void-700 py-2.5">
            <span className="text-sm text-slate-100">{t(`action.${a}`)}</span>
            <HotkeyInput value={s.hotkeys[a]} onChange={(v) => setSettings({ hotkeys: { ...s.hotkeys, [a]: v } })} />
            <MidiLearn value={s.midi[a]} onChange={(v) => setSettings({ midi: { ...s.midi, [a]: v } })} />
          </div>
        ))}
        <p className="mt-4 text-xs text-slate-400">{t("controls.perItem")}</p>
      </Card>
      <Card title={t("midi.devices")}>
        {devices.length ? (
          <ul className="space-y-1.5">
            {devices.map((d) => (
              <li key={d} className="flex items-center gap-2 text-sm text-slate-200">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> {d}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">{t("midi.noDevice")}</p>
        )}
      </Card>
    </div>
  );
}

function AppTab() {
  const t = useT();
  const { data, setSettings, restorePresets, toast } = useStore();
  const s = data.settings;
  return (
    <div className="space-y-6">
      <Card title={t("app.language")}>
        <div className="inline-flex rounded-lg border border-void-600 bg-void-800 p-0.5">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              onClick={() => setSettings({ language: l.id })}
              className={`rounded-md px-4 py-1.5 text-sm transition ${s.language === l.id ? "bg-white/10 text-white" : "text-slate-400 opacity-70 hover:text-white"}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </Card>
      <Card title={t("app.window")}>
        <Row title={t("app.closeToTray")} help={t("app.closeToTrayHelp")}>
          <Switch checked={s.closeToTray} onChange={(v) => setSettings({ closeToTray: v })} />
        </Row>
        <Row title={t("app.startWithWindows")}>
          <Switch checked={s.startWithWindows} onChange={(v) => setSettings({ startWithWindows: v })} />
        </Row>
        <Row title={t("app.startMinimized")}>
          <Switch checked={s.startMinimized} onChange={(v) => setSettings({ startMinimized: v })} />
        </Row>
      </Card>
      <Card title={t("app.updates")}>
        <UpdateButton full />
      </Card>
      <Card title={t("app.data")}>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => void cv().app.openData()}>{t("app.openData")}</button>
          <button className="btn-ghost" onClick={() => { restorePresets(); toast("app.restored"); }}>{t("app.restore")}</button>
          <button className="btn-danger ml-auto" onClick={() => void cv().app.quit()}>{t("app.quit")}</button>
        </div>
      </Card>
    </div>
  );
}
