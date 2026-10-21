// Microphone noise filter, Discord-style: the white line on the meter is the threshold;
// below it the microphone stays shut. "Calibrate" listens to the room and sets it.

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { engine } from "../audio/engine";
import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import { Meter, Switch } from "./ui";

export function MicSensitivity({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const { data, setSettings, toast } = useStore();
  const s = data.settings;
  const [busy, setBusy] = useState(false);

  const calibrate = async () => {
    setBusy(true);
    const floor = await engine.measureNoiseFloor();
    setBusy(false);
    // A comfortable margin above the loudest noise, kept in a sane range.
    const db = Math.round(Math.min(-24, Math.max(-70, floor + 9)));
    setSettings({ micGate: true, micGateDb: db });
    toast(`gate.calibrated|${db}`);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Switch checked={s.micGate} onChange={(v) => setSettings({ micGate: v })} label={t("gate.title")} />
        <span className={`${compact ? "label" : "text-sm font-medium text-slate-100"} flex-1`}>{t("gate.title")}</span>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => void calibrate()} disabled={busy} title={t("gate.calibrateHelp")}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} {busy ? t("gate.listening") : t("gate.calibrate")}
        </button>
      </div>
      <Meter which="input" marker={s.micGate ? s.micGateDb : undefined} className="h-2.5" />
      <input
        type="range"
        className="range"
        min={-72}
        max={-20}
        step={1}
        value={s.micGateDb}
        disabled={!s.micGate}
        aria-label={t("gate.title")}
        onChange={(e) => setSettings({ micGateDb: Number(e.target.value) })}
      />
      <p className="text-xs text-slate-500">{busy ? t("gate.calibrateHelp") : t("gate.help", { db: s.micGateDb })}</p>
    </div>
  );
}
