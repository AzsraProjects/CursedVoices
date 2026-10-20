/**
 * Everything the user makes lives in %APPDATA%\Cursed Voices:
 *   data.json         settings, voices, soundboard
 *   data.backup.json  the previous good copy
 *   sounds\           the audio files of the soundboard
 * Writes go to a temp file then rename, so a crash or a power cut never leaves a
 * half-written file. A corrupt data.json falls back to the backup.
 */
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export const dataDir = (): string => app.getPath("userData");
export const soundsDir = (): string => path.join(dataDir(), "sounds");
const dataFile = () => path.join(dataDir(), "data.json");
const backupFile = () => path.join(dataDir(), "data.backup.json");

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

export function loadData(): unknown {
  return readJson(dataFile()) ?? readJson(backupFile());
}

export function saveData(data: unknown): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  const file = dataFile();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  if (fs.existsSync(file) && readJson(file) !== null) fs.copyFileSync(file, backupFile());
  fs.renameSync(tmp, file);
}

const AUDIO_EXT = new Set([".mp3", ".wav", ".ogg", ".oga", ".flac", ".m4a", ".aac", ".opus", ".webm"]);

/** Stores an imported sound under a unique, safe name and returns that name. */
export function saveSound(originalName: string, bytes: Uint8Array): string {
  const ext = path.extname(originalName).toLowerCase();
  if (!AUDIO_EXT.has(ext)) throw new Error(`unsupported audio type: ${ext}`);
  fs.mkdirSync(soundsDir(), { recursive: true });
  const base = path.basename(originalName, ext).replace(/[^\w\- ]+/g, "").trim().slice(0, 40) || "sound";
  const name = `${base}-${Date.now().toString(36)}${ext}`;
  fs.writeFileSync(path.join(soundsDir(), name), bytes);
  return name;
}

function safeSoundPath(file: string): string {
  const full = path.join(soundsDir(), path.basename(file));
  if (path.dirname(full) !== soundsDir()) throw new Error("bad path");
  return full;
}

export function readSound(file: string): Uint8Array {
  return fs.readFileSync(safeSoundPath(file));
}

export function deleteSound(file: string): void {
  try {
    fs.unlinkSync(safeSoundPath(file));
  } catch {
    /* already gone */
  }
}
