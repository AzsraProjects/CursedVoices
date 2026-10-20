import { useEffect, useRef, useState } from "react";
import { Keyboard, Music2, Pencil, Plus, Repeat, Square, Trash2, Upload } from "lucide-react";
import { engine } from "../audio/engine";
import { ColorPicker, Empty, HotkeyInput, MidiLearn, Modal, PageHeader, Slider, Switch } from "../components/ui";
import { formatAccelerator } from "../lib/hotkey";
import { useT } from "../lib/i18n";
import { imageToLogo } from "../lib/image";
import { formatBinding } from "../lib/midi";
import { useEngineTick, useStore } from "../lib/store";
import type { Sound, SoundMode } from "../lib/types";

const ACCEPT = ".mp3,.wav,.ogg,.oga,.flac,.m4a,.aac,.opus,.webm,audio/*";

export function Soundboard() {
  const t = useT();
  const { data, setSettings, importSounds, playSound, reorderSounds } = useStore();
  const s = data.settings;
  const [editing, setEditing] = useState<Sound | null>(null);
  const [dropping, setDropping] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEngineTick();

  const onFiles = (list: FileList | null) => {
    const files = [...(list ?? [])].filter((f) => /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|webm)$/i.test(f.name) || f.type.startsWith("audio/"));
    if (files.length) void importSounds(files);
  };

  return (
    <div
      className="space-y-6"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropping(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDropping(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      <PageHeader title={t("sb.title")} subtitle={t("sb.subtitle")}>
        <button className="btn-danger" onClick={() => engine.stopAll()}><Square size={14} /> {t("sb.stopAll")}</button>
        <button className="btn-primary" onClick={() => input.current?.click()}><Plus size={16} /> {t("sb.add")}</button>
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      </PageHeader>

      <div className="card flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="flex min-w-[260px] flex-1 items-center gap-3">
          <span className="label shrink-0">{t("sb.volume")}</span>
          <div className="flex-1">
            <Slider value={Math.round(s.sfxVolume * 100)} min={0} max={150} step={1} onChange={(v) => setSettings({ sfxVolume: v / 100 })} format={(v) => `${v} %`} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <Switch checked={s.sfxToStream} onChange={(v) => setSettings({ sfxToStream: v })} /> {t("sb.toStream")}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <Switch checked={s.sfxToMonitor} onChange={(v) => setSettings({ sfxToMonitor: v })} /> {t("sb.toMonitor")}
        </label>
      </div>

      {dropping && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-void-950/70">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-curse-400 px-16 py-12 text-curse-300">
            <Upload size={36} />
            <div className="title-display text-xl text-curse-300">{t("sb.drop")}</div>
          </div>
        </div>
      )}

      {data.sounds.length === 0 ? (
        <Empty title={t("sb.emptyTitle")} text={t("sb.emptyText")}>
          <button className="btn-primary" onClick={() => input.current?.click()}><Plus size={16} /> {t("sb.add")}</button>
        </Empty>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
          {data.sounds.map((sound) => (
            <Pad
              key={sound.id}
              sound={sound}
              dragging={dragId === sound.id}
              onPlay={() => playSound(sound.id)}
              onEdit={() => setEditing(sound)}
              onDragStart={() => setDragId(sound.id)}
              onDragEnter={() => {
                if (!dragId || dragId === sound.id) return;
                const ids = data.sounds.map((x) => x.id);
                const from = ids.indexOf(dragId);
                const to = ids.indexOf(sound.id);
                ids.splice(from, 1);
                ids.splice(to, 0, dragId);
                reorderSounds(ids);
              }}
              onDragEnd={() => setDragId(null)}
            />
          ))}
        </div>
      )}

      {editing && <SoundEditor sound={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Pad(p: {
  sound: Sound; dragging: boolean; onPlay: () => void; onEdit: () => void;
  onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void;
}) {
  const { sound } = p;
  const playing = engine.isPlaying(sound.id);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = engine.progress(sound.id);
      if (ring.current) ring.current.style.width = `${Math.max(0, v) * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, sound.id]);

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; p.onDragStart(); }}
      onDragEnter={p.onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={p.onDragEnd}
      onClick={p.onPlay}
      onContextMenu={(e) => { e.preventDefault(); p.onEdit(); }}
      className={`group relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 p-3 text-center transition active:scale-95 ${
        p.dragging ? "opacity-50" : ""
      }`}
      style={{
        borderColor: playing ? sound.color : `${sound.color}55`,
        background: `radial-gradient(circle at 50% 30%, ${sound.color}${playing ? "55" : "26"}, #10132a 75%)`,
        boxShadow: playing ? `0 0 26px ${sound.color}88` : undefined,
      }}
    >
      <button
        className="absolute right-1.5 top-1.5 rounded-md bg-void-900/80 p-1.5 text-slate-400 opacity-0 transition hover:text-white group-hover:opacity-100"
        onClick={(e) => { e.stopPropagation(); p.onEdit(); }}
      >
        <Pencil size={13} />
      </button>
      {sound.loop && <Repeat size={13} className="absolute left-2 top-2 text-slate-400" />}
      {sound.image ? (
        <img src={sound.image} alt="" className="h-14 w-14 rounded-lg object-cover" draggable={false} />
      ) : (
        <span className="text-4xl leading-none">{sound.emoji || "🔊"}</span>
      )}
      <div className="w-full truncate text-sm font-semibold text-white">{sound.name}</div>
      <div className="flex flex-wrap justify-center gap-1">
        {sound.hotkey && <span className="chip flex items-center gap-1 bg-void-900/70 text-[10px]"><Keyboard size={10} />{formatAccelerator(sound.hotkey)}</span>}
        {sound.midi && <span className="chip flex items-center gap-1 bg-void-900/70 text-[10px]"><Music2 size={10} />{formatBinding(sound.midi)}</span>}
      </div>
      <div className="absolute bottom-0 left-0 h-1 w-full bg-void-900/60">
        <div ref={ring} className="h-full" style={{ background: sound.color, width: playing ? undefined : 0 }} />
      </div>
    </div>
  );
}

const EMOJIS = ["🔊", "💥", "😂", "👏", "🎺", "🥁", "💨", "🚨", "☠️", "😱", "🤡", "🐐", "🦆", "💸", "🔔", "🎉"];

function SoundEditor({ sound, onClose }: { sound: Sound; onClose: () => void }) {
  const t = useT();
  const { saveSound, deleteSound, playSound } = useStore();
  const [d, setD] = useState<Sound>(sound);
  const file = useRef<HTMLInputElement>(null);
  const patch = (p: Partial<Sound>) => {
    const next = { ...d, ...p };
    setD(next);
    saveSound(next);
  };
  const modes: SoundMode[] = ["restart", "toggle", "overlap"];

  return (
    <Modal title={t("sb.edit")} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <div className="label mb-1.5">{t("sb.name")}</div>
          <input type="text" className="w-full" value={d.name} maxLength={32} onChange={(e) => patch({ name: e.target.value })} />
        </div>

        <div>
          <div className="label mb-1.5">{t("sb.emoji")} / {t("sb.image")}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => patch({ emoji: e, image: undefined })}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-lg ${d.emoji === e && !d.image ? "border-curse-400" : "border-void-600 hover:border-nexus-400"}`}
              >
                {e}
              </button>
            ))}
            <button className="btn-ghost py-1" onClick={() => file.current?.click()}>{t("sb.image")}…</button>
            {d.image && <button className="text-xs text-rose-300 hover:underline" onClick={() => patch({ image: undefined })}>{t("sb.removeImage")}</button>}
            <input
              ref={file}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) patch({ image: await imageToLogo(f, 160) });
              }}
            />
          </div>
        </div>

        <div>
          <div className="label mb-1.5">{t("sb.color")}</div>
          <ColorPicker value={d.color} onChange={(color) => patch({ color })} />
        </div>

        <div>
          <div className="label mb-1.5">{t("sb.soundVolume")}</div>
          <Slider value={Math.round(d.volume * 100)} min={0} max={150} step={1} onChange={(v) => patch({ volume: v / 100 })} format={(v) => `${v} %`} />
        </div>

        <div>
          <div className="label mb-1.5">{t("sb.mode")}</div>
          <div className="inline-flex rounded-lg border border-void-600 bg-void-800 p-0.5">
            {modes.map((m) => (
              <button
                key={m}
                onClick={() => patch({ mode: m })}
                className={`rounded-md px-3 py-1 text-xs transition ${d.mode === m ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
              >
                {t(`sb.mode.${m}`)}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
            <Switch checked={d.loop} onChange={(loop) => patch({ loop })} /> {t("sb.loop")}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="label mb-1.5">{t("lab.hotkey")}</div>
            <HotkeyInput value={d.hotkey} onChange={(hotkey) => patch({ hotkey })} />
          </div>
          <div>
            <div className="label mb-1.5">{t("lab.midi")}</div>
            <MidiLearn value={d.midi} onChange={(midi) => patch({ midi })} />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-void-700 pt-4">
          <button
            className="btn-danger"
            onClick={() => {
              if (window.confirm(t("sb.confirmDelete", { name: d.name }))) {
                deleteSound(d.id);
                onClose();
              }
            }}
          >
            <Trash2 size={14} /> {t("sb.delete")}
          </button>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => playSound(d.id)}>{t("sb.test")}</button>
            <button className="btn-primary" onClick={onClose}>{t("common.close")}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
