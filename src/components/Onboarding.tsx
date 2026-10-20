// First launch: language, microphone, virtual cable. Three settings and the voice is live.

import { useState } from "react";
import { CheckCircle2, Download, Loader2, XCircle } from "lucide-react";
import { cv } from "../lib/bridge";
import { CABLE_PATTERN, useDevices } from "../lib/devices";
import { LANGUAGES, useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import { Meter } from "./ui";

export function Onboarding() {
  const t = useT();
  const { data, setSettings } = useStore();
  const s = data.settings;
  const { inputs, outputs, refresh } = useDevices();
  const cable = outputs.find((o) => CABLE_PATTERN.test(o.label));
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void-950/90 p-6">
      <div className="card w-full max-w-xl animate-rise space-y-6 p-8">
        <div className="flex items-center gap-4">
          <img src="./logo.svg" alt="" className="h-16 w-16" />
          <div>
            <h1 className="title-display text-2xl">{t("onboard.title")}</h1>
            <p className="text-sm text-slate-400">{t("onboard.text")}</p>
          </div>
        </div>

        <section>
          <div className="label mb-2">1 · {t("onboard.language")}</div>
          <div className="inline-flex rounded-lg border border-void-600 bg-void-800 p-0.5">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                onClick={() => setSettings({ language: l.id })}
                className={`rounded-md px-4 py-1.5 text-sm ${s.language === l.id ? "bg-white/10 text-white" : "text-slate-400"}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="label mb-2">2 · {t("onboard.mic")}</div>
          <select className="w-full" value={s.inputDeviceId} onChange={(e) => setSettings({ inputDeviceId: e.target.value })}>
            <option value="default">{t("settings.default")}</option>
            {inputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>)}
          </select>
          <Meter which="input" className="mt-3" />
        </section>

        <section>
          <div className="label mb-2">3 · {t("onboard.cable")}</div>
          <div className="flex items-center gap-3 text-sm">
            {cable ? <CheckCircle2 className="text-emerald-400" /> : <XCircle className="text-rose-400" />}
            <span className="flex-1 text-slate-200">{cable ? t("obs.cableOk") : t("obs.cableMissing")}</span>
            {!cable && (
              <button
                className="btn-gold"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await cv().cable.install();
                  setBusy(false);
                  refresh();
                }}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {t("obs.install")}
              </button>
            )}
          </div>
          {busy && <p className="mt-2 text-xs text-curse-300">{t("obs.installing")}</p>}
        </section>

        <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">{t("onboard.headphones")}</p>

        <button className="btn-primary w-full justify-center py-3 text-base" onClick={() => setSettings({ firstRunDone: true })}>
          {t("onboard.start")}
        </button>
      </div>
    </div>
  );
}
