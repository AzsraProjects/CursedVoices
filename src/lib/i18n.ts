import { useCallback } from "react";
import { en } from "./locales/en";
import { fr, type Key } from "./locales/fr";
import { useStore } from "./store";
import type { Lang } from "./types";

export type { Key };

const DICTS: Record<Lang, Record<Key, string>> = { fr, en };

export const LANGUAGES: { id: Lang; label: string }[] = [
  { id: "fr", label: "Français" },
  { id: "en", label: "English" },
];

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  let text = DICTS[lang]?.[key] ?? fr[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

/** Translates a "key|arg0|arg1" message (toasts carry their arguments this way). */
export function translateMessage(lang: Lang, message: string): string {
  const [key, ...args] = message.split("|");
  if (!(key in fr)) return message;
  return translate(lang, key as Key, Object.fromEntries(args.map((a, i) => [String(i), a])));
}

export function useT() {
  const lang = useStore().data.settings.language;
  return useCallback((key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
}
