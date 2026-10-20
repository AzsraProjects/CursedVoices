/**
 * Updates: checks the GitHub Releases of AzsraProjects/CursedVoices, downloads and
 * installs on demand (the "Update" button), without a manual reinstall.
 */
import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

export interface UpdateStatus {
  state: "idle" | "checking" | "available" | "none" | "downloading" | "ready" | "error";
  current: string;
  version?: string;
  percent?: number;
  message?: string;
}

let status: UpdateStatus = { state: "idle", current: app.getVersion() };
let target: BrowserWindow | null = null;

function emit(next: Partial<UpdateStatus>): void {
  status = { ...status, ...next, current: app.getVersion() };
  if (target && !target.isDestroyed()) target.webContents.send("updater:status", status);
}

export function initUpdater(win: BrowserWindow): void {
  target = win;
  if (!app.isPackaged) return; // no updates in development
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => emit({ state: "checking" }));
  autoUpdater.on("update-available", (info) => emit({ state: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => emit({ state: "none" }));
  autoUpdater.on("download-progress", (p) => emit({ state: "downloading", percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (info) => emit({ state: "ready", version: info.version }));
  autoUpdater.on("error", (err) => emit({ state: "error", message: String(err?.message ?? err) }));
  setTimeout(() => void checkForUpdates(), 5_000);
  setInterval(() => void checkForUpdates(), 30 * 60 * 1000);
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return { ...status, state: "none", message: "dev" };
  // Never interrupt a download in progress or an update waiting for a restart.
  if (status.state === "downloading" || status.state === "ready") return status;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    emit({ state: "error", message: String((err as Error)?.message ?? err) });
  }
  return status;
}

export async function downloadUpdate(): Promise<void> {
  emit({ state: "downloading", percent: 0 });
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    emit({ state: "error", message: String((err as Error)?.message ?? err) });
  }
}

export function installUpdate(): void {
  // Restarts on the new version (silent install, the app relaunches by itself).
  autoUpdater.quitAndInstall(true, true);
}

export const getUpdateStatus = (): UpdateStatus => status;
