/**
 * Language of the main process (tray, dialogs). The renderer owns the full dictionary;
 * this file only holds the few strings Electron shows itself.
 * First launch: the language picked in the installer (registry, see build/installer.nsh),
 * otherwise the system language.
 */
import { execFileSync } from "node:child_process";
import { app } from "electron";

export type Lang = "fr" | "en";
let current: Lang = "fr";

const STRINGS = {
  fr: {
    open: "Ouvrir Cursed Voices",
    voice: "Voix modifiée",
    monitor: "M'écouter",
    stopSounds: "Couper les sons",
    quit: "Quitter",
    stillRunning: "Cursed Voices tourne toujours ici : ta voix reste active pour le stream.",
  },
  en: {
    open: "Open Cursed Voices",
    voice: "Voice changer",
    monitor: "Hear myself",
    stopSounds: "Stop all sounds",
    quit: "Quit",
    stillRunning: "Cursed Voices is still running here: your voice stays live for the stream.",
  },
} as const;

export type MainKey = keyof (typeof STRINGS)["fr"];

/** LCID written by the installer (1036 = French). */
export function installerLanguage(): Lang | null {
  if (process.platform !== "win32") return null;
  try {
    const out = execFileSync("reg", ["query", "HKCU\\Software\\Cursed Voices", "/v", "InstallerLanguage"], {
      encoding: "utf-8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"],
    });
    const lcid = /InstallerLanguage\s+REG_\w+\s+(\d+)/.exec(out)?.[1];
    return lcid ? (lcid === "1036" ? "fr" : "en") : null;
  } catch {
    return null;
  }
}

export function defaultLanguage(): Lang {
  return installerLanguage() ?? (app.getLocale().toLowerCase().startsWith("fr") ? "fr" : "en");
}

export const setLanguage = (lang: Lang): void => {
  current = lang === "en" ? "en" : "fr";
};

export const t = (key: MainKey): string => STRINGS[current][key];
