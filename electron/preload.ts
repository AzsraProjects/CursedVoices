import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { UpdateStatus } from "./updater";

type Lang = "fr" | "en";

function on<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, value: T) => cb(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  store: {
    load: (): Promise<{ data: unknown; language: Lang }> => ipcRenderer.invoke("store:load"),
    save: (data: unknown): Promise<boolean> => ipcRenderer.invoke("store:save", data),
  },
  sounds: {
    save: (name: string, bytes: Uint8Array): Promise<string> => ipcRenderer.invoke("sounds:save", name, bytes),
    read: (file: string): Promise<Uint8Array> => ipcRenderer.invoke("sounds:read", file),
    remove: (file: string): Promise<void> => ipcRenderer.invoke("sounds:delete", file),
  },
  app: {
    version: (): Promise<string> => ipcRenderer.invoke("app:version"),
    setLanguage: (lang: Lang): Promise<void> => ipcRenderer.invoke("app:set-language", lang),
    setPrefs: (p: { closeToTray: boolean; startWithWindows: boolean; startMinimized: boolean }): Promise<void> =>
      ipcRenderer.invoke("app:prefs", p),
    openData: (): Promise<string> => ipcRenderer.invoke("app:open-data"),
    quit: (): Promise<void> => ipcRenderer.invoke("app:quit"),
    trayState: (s: { voiceEnabled: boolean; monitorEnabled: boolean; voiceName: string }): Promise<void> =>
      ipcRenderer.invoke("tray:state", s),
  },
  shortcuts: {
    set: (list: { accelerator: string; action: string }[]): Promise<string[]> => ipcRenderer.invoke("shortcuts:set", list),
  },
  /** Actions from global shortcuts and the tray menu. */
  onAction: (cb: (action: string) => void): (() => void) => on("action", cb),
  cable: {
    check: (): Promise<number> => ipcRenderer.invoke("cable:check"),
    install: (): Promise<number> => ipcRenderer.invoke("cable:install"),
  },
  updater: {
    status: (): Promise<UpdateStatus> => ipcRenderer.invoke("updater:status"),
    check: (): Promise<UpdateStatus> => ipcRenderer.invoke("updater:check"),
    download: (): Promise<void> => ipcRenderer.invoke("updater:download"),
    install: (): Promise<void> => ipcRenderer.invoke("updater:install"),
    onStatus: (cb: (s: UpdateStatus) => void): (() => void) => on("updater:status", cb),
  },
};

contextBridge.exposeInMainWorld("cv", api);
export type CvBridge = typeof api;
