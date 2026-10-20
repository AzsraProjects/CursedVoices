import { useState } from "react";
import { Copy, FlaskConical, Keyboard, Music2, Plus, Search, Trash2 } from "lucide-react";
import { Empty, PageHeader, VoiceLogo } from "../components/ui";
import { formatAccelerator } from "../lib/hotkey";
import { useT } from "../lib/i18n";
import { formatBinding } from "../lib/midi";
import { cloneVoice } from "../lib/presets";
import { useStore } from "../lib/store";

export function Voices({ onEdit }: { onEdit: (voiceId: string | null) => void }) {
  const t = useT();
  const { data, activateVoice, saveVoice, deleteVoice } = useStore();
  const [query, setQuery] = useState("");
  const { settings } = data;
  const q = query.trim().toLowerCase();
  const voices = data.voices.filter((v) => !q || v.name.toLowerCase().includes(q));

  return (
    <div className="space-y-6">
      <PageHeader title={t("voices.title")} subtitle={t("voices.subtitle")}>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="search" className="w-56 pl-8" placeholder={t("voices.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={() => onEdit(null)}>
          <Plus size={16} /> {t("voices.new")}
        </button>
      </PageHeader>

      {voices.length === 0 ? (
        <Empty title={t("voices.emptyTitle")} text={t("voices.emptyText")} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
          {voices.map((v) => {
            const active = v.id === settings.activeVoiceId;
            const live = active && settings.voiceEnabled;
            return (
              <div
                key={v.id}
                role="button"
                tabIndex={0}
                onClick={() => activateVoice(v.id)}
                onKeyDown={(e) => e.key === "Enter" && activateVoice(v.id)}
                className={`group relative flex cursor-pointer flex-col items-center gap-3 rounded-xl border p-5 text-center transition ${
                  live
                    ? "border-curse-400/70 bg-gradient-to-b from-curse-700/20 to-void-850 shadow-curse"
                    : "border-void-700 bg-void-850/90 hover:-translate-y-0.5 hover:border-nexus-500"
                }`}
              >
                {active && (
                  <span className={`absolute left-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                    live ? "bg-curse-400 text-void-950" : "bg-void-700 text-slate-300"
                  }`}>
                    {t("voices.active")}
                  </span>
                )}
                <div className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <IconBtn title={t("voices.edit")} onClick={() => onEdit(v.id)}><FlaskConical size={14} /></IconBtn>
                  <IconBtn title={t("voices.duplicate")} onClick={() => saveVoice(cloneVoice(v, t("voices.copy", { name: v.name })))}>
                    <Copy size={14} />
                  </IconBtn>
                  <IconBtn
                    title={t("voices.delete")}
                    danger
                    onClick={() => window.confirm(t("voices.confirmDelete", { name: v.name })) && deleteVoice(v.id)}
                  >
                    <Trash2 size={14} />
                  </IconBtn>
                </div>
                <VoiceLogo logo={v.logo} color={v.color} size={88} glow={live} />
                <div className="w-full">
                  <div className="truncate font-semibold text-white">{v.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{t("voices.effects", { n: v.effects.filter((e) => e.enabled).length })}</div>
                </div>
                {(v.hotkey || v.midi) && (
                  <div className="flex flex-wrap justify-center gap-1">
                    {v.hotkey && (
                      <span className="chip flex items-center gap-1"><Keyboard size={11} /> {formatAccelerator(v.hotkey)}</span>
                    )}
                    {v.midi && <span className="chip flex items-center gap-1"><Music2 size={11} /> {formatBinding(v.midi)}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`rounded-md bg-void-900/80 p-1.5 text-slate-400 ${danger ? "hover:text-rose-300" : "hover:text-white"}`}
    >
      {children}
    </button>
  );
}
