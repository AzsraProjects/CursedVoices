import type { ReactNode } from "react";
import { FlaskConical, LayoutGrid, Mic2, Settings as Cog, type LucideIcon } from "lucide-react";
import type { Key } from "../lib/i18n";
import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import { ControlBar } from "./ControlBar";
import { Toaster } from "./ui";
import { UpdateBanner, UpdateButton } from "./UpdateButton";

export type Page = "voices" | "lab" | "soundboard" | "settings";

const NAV: { id: Page; label: Key; icon: LucideIcon }[] = [
  { id: "voices", label: "nav.voices", icon: Mic2 },
  { id: "lab", label: "nav.lab", icon: FlaskConical },
  { id: "soundboard", label: "nav.soundboard", icon: LayoutGrid },
  { id: "settings", label: "nav.settings", icon: Cog },
];

const SUPPORT_URL = "https://ko-fi.com/azsra";

export function Layout({ page, onNavigate, children }: { page: Page; onNavigate: (p: Page) => void; children: ReactNode }) {
  const t = useT();
  const { status } = useStore();
  const micOk = status.mic === "ok";
  const streamOk = status.stream === "ok";
  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-void-700 bg-void-950/80 p-4">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <img src="./logo.svg" alt="" className="h-11 w-11" draggable={false} />
            <div>
              <div className="title-display text-2xl leading-none">CURSED</div>
              <div className="title-display text-2xl leading-none text-curse-400">VOICES</div>
            </div>
          </div>
          <div className="mt-2 text-[11px] leading-snug text-slate-500">{t("app.tagline")}</div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => {
            const active = page === n.id;
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                onClick={() => onNavigate(n.id)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                  active ? "bg-gradient-to-r from-nexus-700/70 to-storm-700/40 text-white shadow-glow" : "text-slate-400 hover:bg-void-800 hover:text-white"
                }`}
              >
                <Icon size={16} className="text-gold-400" />
                {t(n.label)}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto space-y-3 text-xs text-slate-500">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${micOk ? "bg-emerald-400" : "bg-rose-500"}`} />
              {t(`status.mic.${status.mic}`)}
            </div>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${streamOk ? "bg-emerald-400" : "bg-rose-500"}`} />
              {streamOk ? t("obs.live") : t(`status.stream.${status.stream}`)}
            </div>
          </div>
          <UpdateButton />
          <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="block text-gold-400/80 hover:text-gold-300">
            {t("support")}
          </a>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl">
            <UpdateBanner />
            {children}
          </div>
        </main>
        <ControlBar previewing={page === "lab"} onOpenVoices={() => onNavigate("voices")} />
      </div>
      <Toaster />
    </div>
  );
}
