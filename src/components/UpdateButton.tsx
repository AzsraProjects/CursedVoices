// Same update flow as HOTS REVIVAL: a gold banner on top of every page when a version is
// out, and the button at the bottom of the sidebar.

import { useEffect, useState } from "react";
import { ArrowUpCircle, X } from "lucide-react";
import { cv } from "../lib/bridge";
import { useT } from "../lib/i18n";
import type { UpdateStatus } from "../lib/types";

export function useUpdater(): [UpdateStatus, () => void] {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle", current: "" });
  useEffect(() => {
    void cv().updater.status().then(setStatus);
    return cv().updater.onStatus(setStatus);
  }, []);
  const act = () => {
    if (status.state === "available" || status.state === "error") void cv().updater.download();
    else if (status.state === "ready") void cv().updater.install();
    else void cv().updater.check().then(setStatus);
  };
  return [status, act];
}

export function UpdateBanner() {
  const t = useT();
  const [status, act] = useUpdater();
  const [hidden, setHidden] = useState<string | undefined>();
  const show = ["available", "downloading", "ready"].includes(status.state) && hidden !== `${status.state}${status.version}`;
  if (!show) return null;
  return (
    <div className="mb-6 flex animate-rise items-center gap-4 rounded-xl border border-gold-500/60 bg-gradient-to-r from-gold-500/20 to-void-850 px-5 py-4 shadow-gold">
      <ArrowUpCircle className="shrink-0 text-gold-400" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-white">
          {status.state === "available" && t("update.available", { v: status.version ?? "" })}
          {status.state === "downloading" && t("update.downloading", { p: status.percent ?? 0 })}
          {status.state === "ready" && t("update.ready", { v: status.version ?? "" })}
        </div>
        {status.state === "downloading" && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-void-700">
            <div className="h-full rounded-full bg-gold-400 transition-all" style={{ width: `${status.percent ?? 0}%` }} />
          </div>
        )}
      </div>
      {status.state === "available" && <button className="btn-gold" onClick={act}>{t("update.now")}</button>}
      {status.state === "ready" && <button className="btn-gold" onClick={act}>{t("update.restart")}</button>}
      {status.state !== "downloading" && (
        <button className="text-slate-400 hover:text-white" onClick={() => setHidden(`${status.state}${status.version}`)} title={t("update.later")}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export function UpdateButton({ full = false }: { full?: boolean }) {
  const t = useT();
  const [status, act] = useUpdater();
  if (status.state === "available") {
    return <button className="btn-gold w-full justify-center" onClick={act}>{t("update.buttonAvailable", { v: status.version ?? "" })}</button>;
  }
  if (status.state === "ready") {
    return <button className="btn-gold w-full justify-center" onClick={act}>{t("update.buttonReady", { v: status.version ?? "" })}</button>;
  }
  if (status.state === "downloading") {
    return <div className="text-xs text-gold-400">{t("update.downloading", { p: status.percent ?? 0 })}</div>;
  }
  if (full) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-ghost" onClick={act} disabled={status.state === "checking"}>{t("app.check")}</button>
        <span className={`text-xs ${status.state === "error" ? "text-rose-300" : "text-emerald-300"}`}>
          {status.state === "checking" && t("update.checking")}
          {status.state === "none" && (status.message === "dev" ? t("update.dev") : t("update.none"))}
          {status.state === "error" && t("update.error", { m: status.message ?? "" })}
        </span>
      </div>
    );
  }
  return (
    <button className="text-left text-xs text-slate-500 hover:text-slate-300" onClick={act}>
      v{status.current} · {status.state === "checking" ? t("update.checking") : `${t("update.upToDate")} / ${t("update.check")}`}
    </button>
  );
}
