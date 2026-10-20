/**
 * Cursed Voices, main process.
 * The audio itself runs in the renderer (Web Audio); this process owns the window, the
 * tray, global shortcuts, files, the virtual cable installer and updates.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, powerSaveBlocker, session, shell, Tray,
} from "electron";
import { defaultLanguage, setLanguage, t, type Lang } from "./i18n";
import { dataDir, deleteSound, loadData, readSound, saveData, saveSound } from "./store";
import { checkForUpdates, downloadUpdate, getUpdateStatus, initUpdater, installUpdate } from "./updater";

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let prefs = { closeToTray: true, startWithWindows: false, startMinimized: false };
let trayState = { voiceEnabled: true, monitorEnabled: false, voiceName: "" };
let trayHintShown = false;

const startHidden = process.argv.includes("--hidden");

// The smoke test runs on a throwaway data folder, past the welcome screen.
if (process.env.CV_SMOKE) {
  const dir = path.join(process.env.CV_SMOKE, "userdata");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "data.json");
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ settings: { firstRunDone: true } }));
  app.setPath("userData", dir);
}

function iconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.join(__dirname, "..", "build", "icon.ico");
}

function logError(scope: string, err: unknown): void {
  try {
    const dir = path.join(dataDir(), "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "main.log"), `[${new Date().toISOString()}] ${scope}: ${String((err as Error)?.stack ?? err)}\n`);
  } catch {
    /* logging must never crash the app */
  }
}

process.on("uncaughtException", (err) => logError("uncaught", err));
process.on("unhandledRejection", (err) => logError("unhandled", err));

function send(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function showWindow(): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    backgroundColor: "#0b0d1a",
    title: "Cursed Voices",
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // the voice keeps running when the window is hidden
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else void win.loadFile(path.join(__dirname, "..", "dist", "index.html"));

  win.once("ready-to-show", () => {
    if (!(startHidden || prefs.startMinimized)) win?.show();
  });

  // Smoke test (CI and local checks): CV_SMOKE=<folder> starts the app, records console
  // errors and a screenshot of each page, then quits with code 1 if anything failed.
  const smoke = process.env.CV_SMOKE;
  if (smoke) {
    const errors: string[] = [];
    win.webContents.on("console-message", (_e, level, message) => {
      if (level >= 3) errors.push(message);
    });
    win.webContents.once("did-finish-load", async () => {
      fs.mkdirSync(smoke, { recursive: true });
      const pages = (process.env.CV_SMOKE_PAGES ?? "voices").split(",");
      await new Promise((r) => setTimeout(r, 3500));
      for (const p of pages) {
        if (!win) break;
        await win.webContents.executeJavaScript(`window.__cvNavigate && window.__cvNavigate(${JSON.stringify(p)})`);
        await new Promise((r) => setTimeout(r, 1200));
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(smoke, `${p}.png`), img.toPNG());
      }
      if (process.env.CV_SMOKE_SELFTEST && win) {
        const report = await win.webContents.executeJavaScript("window.__cvSelfTest()");
        fs.writeFileSync(path.join(smoke, "selftest.json"), JSON.stringify(report, null, 1));
        // Every voice must stay within 6 dB of the dry voice, never hiss, never clip.
        const rows = report as { name: string; floorRms: number; voiceRms: number; voicePeak: number }[];
        const dry = rows[0];
        for (const r of rows.slice(1)) {
          if (Math.abs(r.voiceRms - dry.voiceRms) > 6) errors.push(`selftest: ${r.name} loudness ${r.voiceRms} dB`);
          if (r.floorRms > -60) errors.push(`selftest: ${r.name} noise floor ${r.floorRms} dB`);
          if (r.voicePeak > -1) errors.push(`selftest: ${r.name} clips (${r.voicePeak} dB)`);
        }
      }
      if (process.env.CV_SMOKE_SELFTEST && win) {
        const engine = await win.webContents.executeJavaScript("window.__cvEngineInfo && window.__cvEngineInfo()");
        fs.writeFileSync(path.join(smoke, "engine.json"), JSON.stringify(engine, null, 1));
      }
      fs.writeFileSync(path.join(smoke, "errors.txt"), errors.join("\n"));
      quitting = true;
      // Device errors are expected on a build server with no sound card: not fatal.
      app.exit(errors.some((e) => !e.startsWith("[engine]")) ? 1 : 0);
    });
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://") && !url.startsWith(process.env.VITE_DEV_SERVER_URL ?? "\u0000")) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });

  // If the page ever dies, bring it back: the audio graph restarts with it.
  win.webContents.on("render-process-gone", (_e, details) => {
    logError("renderer", details.reason);
    if (!quitting && details.reason !== "clean-exit") setTimeout(() => win?.webContents.reload(), 1000);
  });

  win.on("close", (e) => {
    if (!quitting && prefs.closeToTray) {
      e.preventDefault();
      win?.hide();
      if (!trayHintShown && tray) {
        trayHintShown = true;
        tray.displayBalloon({ title: "Cursed Voices", content: t("stillRunning"), iconType: "info" });
      }
    }
  });
  win.on("closed", () => {
    win = null;
  });
}

function buildTrayMenu(): void {
  if (!tray) return;
  tray.setToolTip(trayState.voiceName ? `Cursed Voices · ${trayState.voiceName}` : "Cursed Voices");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t("open"), click: showWindow },
      { type: "separator" },
      { label: t("voice"), type: "checkbox", checked: trayState.voiceEnabled, click: () => send("action", "voice.toggle") },
      { label: t("monitor"), type: "checkbox", checked: trayState.monitorEnabled, click: () => send("action", "monitor.toggle") },
      { label: t("stopSounds"), click: () => send("action", "sounds.stop") },
      { type: "separator" },
      { label: t("quit"), click: () => { quitting = true; app.quit(); } },
    ]),
  );
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(iconPath()));
  tray.on("click", showWindow);
  buildTrayMenu();
}

// ------------------------------------------------------------------ shortcuts

function registerShortcuts(list: { accelerator: string; action: string }[]): string[] {
  globalShortcut.unregisterAll();
  const failed: string[] = [];
  const seen = new Set<string>();
  for (const { accelerator, action } of list) {
    if (!accelerator || seen.has(accelerator)) continue;
    seen.add(accelerator);
    try {
      const ok = globalShortcut.register(accelerator, () => send("action", action));
      if (!ok) failed.push(accelerator);
    } catch {
      failed.push(accelerator);
    }
  }
  return failed;
}

// ------------------------------------------------------------------ cable

function runCableScript(check: boolean): Promise<number> {
  const script = app.isPackaged
    ? path.join(process.resourcesPath, "scripts", "install-vbcable.ps1")
    : path.join(__dirname, "..", "scripts", "install-vbcable.ps1");
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", script];
  if (check) args.push("-Check");
  return new Promise((resolve) => {
    execFile("powershell.exe", args, { windowsHide: true, timeout: 15 * 60 * 1000 }, (err) => {
      const code = err ? Number((err as NodeJS.ErrnoException & { code?: number }).code ?? 2) : 0;
      resolve(Number.isFinite(code) ? code : 2);
    });
  });
}

// ------------------------------------------------------------------ ipc

function registerIpc(): void {
  ipcMain.handle("store:load", () => ({ data: loadData(), language: defaultLanguage() }));
  ipcMain.handle("store:save", (_e, data: unknown) => {
    try {
      saveData(data);
      return true;
    } catch (err) {
      logError("save", err);
      return false;
    }
  });
  ipcMain.handle("sounds:save", (_e, name: string, bytes: Uint8Array) => saveSound(name, bytes));
  ipcMain.handle("sounds:read", (_e, file: string) => readSound(file));
  ipcMain.handle("sounds:delete", (_e, file: string) => deleteSound(file));

  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:set-language", (_e, lang: Lang) => {
    setLanguage(lang);
    buildTrayMenu();
  });
  ipcMain.handle("app:prefs", (_e, next: typeof prefs) => {
    prefs = { ...prefs, ...next };
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: prefs.startWithWindows, args: ["--hidden"] });
    }
  });
  ipcMain.handle("app:open-data", () => shell.openPath(dataDir()));
  ipcMain.handle("app:show", () => showWindow());
  ipcMain.handle("app:quit", () => { quitting = true; app.quit(); });
  ipcMain.handle("tray:state", (_e, state: typeof trayState) => {
    trayState = state;
    buildTrayMenu();
  });
  ipcMain.handle("shortcuts:set", (_e, list: { accelerator: string; action: string }[]) => registerShortcuts(list));
  ipcMain.handle("cable:check", () => runCableScript(true));
  ipcMain.handle("cable:install", () => runCableScript(false));

  ipcMain.handle("updater:status", () => getUpdateStatus());
  ipcMain.handle("updater:check", () => checkForUpdates());
  ipcMain.handle("updater:download", () => downloadUpdate());
  ipcMain.handle("updater:install", () => {
    quitting = true;
    installUpdate();
  });
}

// ------------------------------------------------------------------ boot

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.setAppUserModelId("com.azsraprojects.cursedvoices");

  app.whenReady().then(() => {
    setLanguage(defaultLanguage());
    const allowed = new Set(["media", "midi", "midiSysex", "speaker-selection"]);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
    powerSaveBlocker.start("prevent-app-suspension");

    registerIpc();
    createWindow();
    createTray();
    if (win) initUpdater(win);
  });

  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("window-all-closed", () => {
    if (quitting || !prefs.closeToTray) app.quit();
  });
}
