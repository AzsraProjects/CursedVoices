// The Lab: build a voice from effects while hearing yourself live. The draft is played
// on stream and in the headphones as you edit (the control bar shows "Lab preview").

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, Bot, ChevronsUpDown, Ear, GripVertical, Plus, RotateCcw, Save, SlidersHorizontal, Trash2,
  Waves, Wind, Wrench, Palette, type LucideIcon,
} from "lucide-react";
import { engine } from "../audio/engine";
import { EFFECTS, defaultParams, effectDef, type Category, type ParamDef } from "../audio/effects";
import { LogoPicker } from "../components/LogoPicker";
import { Card, ColorPicker, HotkeyInput, MidiLearn, PageHeader, Switch } from "../components/ui";
import { useT, type Key } from "../lib/i18n";
import { cloneVoice, fx, uid } from "../lib/presets";
import { useStore } from "../lib/store";
import type { EffectState, EffectType, VoiceProfile } from "../lib/types";

const CATEGORIES: { id: Category; icon: LucideIcon }[] = [
  { id: "voice", icon: Bot },
  { id: "space", icon: Waves },
  { id: "color", icon: Palette },
  { id: "motion", icon: Wind },
  { id: "tools", icon: Wrench },
];

function blankVoice(name: string): VoiceProfile {
  const now = Date.now();
  return {
    id: uid(), name, color: "#8b5cf6", logo: { kind: "icon", icon: "mic" },
    effects: [fx("gate"), fx("pitch", { pitch: -3 })], createdAt: now, updatedAt: now,
  };
}

const snapshot = (v: VoiceProfile) => JSON.stringify({ ...v, updatedAt: 0 });

export function Lab({ voiceId, onPickVoice }: { voiceId: string | null; onPickVoice: (id: string | null) => void }) {
  const t = useT();
  const { data, saveVoice, previewVoice, setSettings, toast } = useStore();
  const source = data.voices.find((v) => v.id === voiceId) ?? null;
  const [draft, setDraft] = useState<VoiceProfile>(() => (source ? structuredClone(source) : blankVoice(t("lab.newVoiceName"))));
  const [saved, setSaved] = useState(() => (source ? snapshot(source) : ""));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dirty = snapshot(draft) !== saved;

  // Switching the voice to edit from the picker.
  const lastVoiceId = useRef(voiceId);
  useEffect(() => {
    if (lastVoiceId.current === voiceId) return;
    lastVoiceId.current = voiceId;
    const v = data.voices.find((x) => x.id === voiceId);
    const next = v ? structuredClone(v) : blankVoice(t("lab.newVoiceName"));
    setDraft(next);
    setSaved(v ? snapshot(v) : "");
  }, [voiceId, data.voices, t]);

  // Live preview of the draft, released when leaving the Lab.
  useEffect(() => {
    previewVoice(draft);
  }, [draft, previewVoice]);
  useEffect(() => () => previewVoice(null), [previewVoice]);

  const patch = (p: Partial<VoiceProfile>) => setDraft((d) => ({ ...d, ...p }));
  const setEffects = (fn: (list: EffectState[]) => EffectState[]) => setDraft((d) => ({ ...d, effects: fn(d.effects) }));
  const setParam = (id: string, key: string, value: number) =>
    setEffects((l) => l.map((e) => (e.id === id ? { ...e, params: { ...e.params, [key]: value } } : e)));

  const save = () => {
    saveVoice(draft);
    setSaved(snapshot(draft));
    setSettings({ activeVoiceId: draft.id });
    if (voiceId !== draft.id) {
      lastVoiceId.current = draft.id;
      onPickVoice(draft.id);
    }
    toast(`lab.saved|${draft.name}`);
  };

  const saveAsNew = () => {
    const copy = cloneVoice(draft, draft.name);
    saveVoice(copy);
    setSettings({ activeVoiceId: copy.id });
    lastVoiceId.current = copy.id;
    onPickVoice(copy.id);
    setDraft(copy);
    setSaved(snapshot(copy));
    toast(`lab.saved|${copy.name}`);
  };

  const revert = () => {
    if (source) setDraft(structuredClone(source));
    else setDraft(blankVoice(t("lab.newVoiceName")));
  };

  const pick = (id: string | null) => {
    if (dirty && !window.confirm(t("lab.leaveUnsaved"))) return;
    onPickVoice(id);
  };

  const move = (from: number, to: number) =>
    setEffects((l) => {
      if (to < 0 || to >= l.length || from === to) return l;
      const next = [...l];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });

  const voiceOptions = useMemo(() => data.voices.map((v) => ({ id: v.id, name: v.name })), [data.voices]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("lab.title")} subtitle={t("lab.subtitle")}>
        <div className="relative">
          <select className="w-56 pr-8" value={voiceId ?? ""} onChange={(e) => pick(e.target.value || null)} aria-label={t("lab.pick")}>
            <option value="">{`+ ${t("lab.newVoice")}`}</option>
            {voiceOptions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      </PageHeader>

      {!data.settings.monitorEnabled ? (
        <div className="flex items-center gap-4 rounded-xl border border-curse-500/50 bg-gradient-to-r from-curse-700/25 to-void-850 px-5 py-3">
          <Ear className="shrink-0 text-curse-300" />
          <p className="flex-1 text-sm text-slate-200">{t("lab.monitorHint")}</p>
          <button className="btn-primary" onClick={() => setSettings({ monitorEnabled: true })}>{t("control.monitor")}</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-curse-300">
          <span className="h-2 w-2 animate-breathe rounded-full bg-curse-400" /> {t("lab.monitorOn")}
        </div>
      )}

      <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-6">
        {/* left column: identity + palette */}
        <div className="space-y-6">
          <Card title={t("lab.identity")}>
            <div className="flex items-center gap-4">
              <LogoPicker logo={draft.logo} color={draft.color} onChange={(logo) => patch({ logo })} />
              <input
                type="text"
                className="min-w-0 flex-1 text-base font-semibold"
                value={draft.name}
                maxLength={32}
                aria-label={t("lab.name")}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </div>
            <div className="label mb-2 mt-4">{t("lab.color")}</div>
            <ColorPicker value={draft.color} onChange={(color) => patch({ color })} />
            <div className="label mb-2 mt-4">{t("lab.hotkey")}</div>
            <HotkeyInput value={draft.hotkey} onChange={(hotkey) => patch({ hotkey })} />
            <div className="label mb-2 mt-4">{t("lab.midi")}</div>
            <MidiLearn value={draft.midi} onChange={(midi) => patch({ midi })} />
          </Card>

          <Card title={t("lab.add")}>
            <div className="space-y-4">
              {CATEGORIES.map(({ id, icon: Icon }) => (
                <div key={id}>
                  <div className="label mb-1.5 flex items-center gap-1.5"><Icon size={12} className="text-gold-400" /> {t(`cat.${id}`)}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {EFFECTS.filter((e) => e.category === id).map((e) => (
                      <button
                        key={e.type}
                        title={t(`fxd.${e.type}`)}
                        className="flex items-center gap-1 rounded-full border border-void-600 px-2.5 py-1 text-xs text-slate-300 transition hover:border-curse-400 hover:text-white"
                        onClick={() => setEffects((l) => [...l, fx(e.type)])}
                      >
                        <Plus size={11} /> {t(`fx.${e.type}`)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* right column: the chain */}
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-gold" onClick={save} disabled={!draft.name.trim()}>
              <Save size={16} /> {t("lab.save")}
            </button>
            <button className="btn-ghost" onClick={saveAsNew} disabled={!draft.name.trim()}>{t("lab.saveAsNew")}</button>
            <button className="btn-ghost" onClick={revert} disabled={!dirty}><RotateCcw size={14} /> {t("lab.revert")}</button>
            <button
              className="btn-ghost ml-auto select-none active:border-curse-400 active:text-curse-300"
              onPointerDown={() => engine.setBypass(true)}
              onPointerUp={() => engine.setBypass(false)}
              onPointerLeave={() => engine.setBypass(false)}
            >
              <ChevronsUpDown size={14} /> {t("lab.compare")}
            </button>
          </div>
          {dirty && <div className="text-xs text-amber-300">● {t("lab.unsaved")}</div>}

          <div>
            <h2 className="card-title mb-1">{t("lab.chain")}</h2>
            <p className="mb-3 text-xs text-slate-500">{t("lab.chainHelp")}</p>
          </div>

          {draft.effects.length === 0 && (
            <div className="card py-10 text-center text-sm text-slate-400">{t("lab.chainEmpty")}</div>
          )}

          {draft.effects.map((e, i) => (
            <EffectCard
              key={e.id}
              effect={e}
              index={i}
              count={draft.effects.length}
              dragging={dragIndex === i}
              onDragStart={() => setDragIndex(i)}
              onDragEnter={() => {
                if (dragIndex !== null && dragIndex !== i) {
                  move(dragIndex, i);
                  setDragIndex(i);
                }
              }}
              onDragEnd={() => setDragIndex(null)}
              onToggle={(on) => setEffects((l) => l.map((x) => (x.id === e.id ? { ...x, enabled: on } : x)))}
              onRemove={() => setEffects((l) => l.filter((x) => x.id !== e.id))}
              onReset={() => setEffects((l) => l.map((x) => (x.id === e.id ? { ...x, params: defaultParams(x.type) } : x)))}
              onMove={(d) => move(i, i + d)}
              onParam={(k, v) => setParam(e.id, k, v)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface CardProps {
  effect: EffectState;
  index: number;
  count: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onToggle: (on: boolean) => void;
  onRemove: () => void;
  onReset: () => void;
  onMove: (delta: number) => void;
  onParam: (key: string, value: number) => void;
}

function EffectCard(p: CardProps) {
  const t = useT();
  const def = effectDef(p.effect.type as EffectType);
  return (
    <section
      className={`rounded-xl border bg-void-850/90 transition ${p.dragging ? "border-curse-400 opacity-60" : "border-void-700"} ${
        p.effect.enabled ? "" : "opacity-55"
      }`}
      onDragEnter={p.onDragEnter}
      onDragOver={(e) => e.preventDefault()}
    >
      <header
        className="flex cursor-grab items-center gap-3 border-b border-void-700 px-4 py-2.5 active:cursor-grabbing"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          p.onDragStart();
        }}
        onDragEnd={p.onDragEnd}
      >
        <GripVertical size={16} className="text-slate-600" />
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-void-700 text-[11px] font-bold text-slate-300">{p.index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{t(`fx.${def.type}`)}</div>
          <div className="truncate text-xs text-slate-500">
            {t(`fxd.${def.type}`)}
            {def.type === "pitch" && <span className="text-amber-300/80"> · {t("lab.latencyNote")}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 text-slate-500">
          <button className="p-1 hover:text-white disabled:opacity-30" disabled={p.index === 0} onClick={() => p.onMove(-1)} title={t("lab.moveUp")}>
            <ArrowUp size={14} />
          </button>
          <button className="p-1 hover:text-white disabled:opacity-30" disabled={p.index === p.count - 1} onClick={() => p.onMove(1)} title={t("lab.moveDown")}>
            <ArrowDown size={14} />
          </button>
          <button className="p-1 hover:text-white" onClick={p.onReset} title={t("lab.reset")}><SlidersHorizontal size={14} /></button>
          <button className="p-1 hover:text-rose-300" onClick={p.onRemove} title={t("lab.remove")}><Trash2 size={14} /></button>
        </div>
        <Switch checked={p.effect.enabled} onChange={p.onToggle} label={t("lab.toggle")} />
      </header>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 px-4 py-4">
        {def.params.map((param) => (
          <ParamControl key={param.key} def={param} value={p.effect.params[param.key] ?? param.default} onChange={(v) => p.onParam(param.key, v)} />
        ))}
      </div>
    </section>
  );
}

function formatValue(def: ParamDef, v: number): string {
  switch (def.unit) {
    case "Hz": return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kHz` : `${Math.round(v)} Hz`;
    case "st": return `${v > 0 ? "+" : ""}${v} st`;
    case "dB": return `${v > 0 ? "+" : ""}${v} dB`;
    case "ms": return `${Math.round(v)} ms`;
    case "s": return `${v.toFixed(1)} s`;
    case "%": return `${Math.round(v)} %`;
    case "x": return `${v}×`;
    case "bits": return `${v} bits`;
    default: return String(v);
  }
}

// Logarithmic sliders map 0..1000 onto min..max.
const toLog = (d: ParamDef, v: number) => (Math.log(v / d.min) / Math.log(d.max / d.min)) * 1000;
const fromLog = (d: ParamDef, x: number) => d.min * Math.pow(d.max / d.min, x / 1000);

function ParamControl({ def, value, onChange }: { def: ParamDef; value: number; onChange: (v: number) => void }) {
  const t = useT();
  const label = t(`p.${def.key}` as Key);
  if (def.choices) {
    return (
      <div className="col-span-2">
        <div className="label mb-1.5">{label}</div>
        <div className="inline-flex rounded-lg border border-void-600 bg-void-800 p-0.5">
          {def.choices.map((c, i) => (
            <button
              key={c}
              onClick={() => onChange(i)}
              className={`rounded-md px-3 py-1 text-xs transition ${Math.round(value) === i ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
            >
              {t(`choice.${c}` as Key)}
            </button>
          ))}
        </div>
      </div>
    );
  }
  const bipolar = def.min < 0 && def.max > 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="label">{label}</span>
        <button
          className="text-xs tabular-nums text-curse-300 hover:text-white"
          onDoubleClick={() => onChange(def.default)}
          title="↺"
        >
          {formatValue(def, value)}
        </button>
      </div>
      <input
        type="range"
        className="range"
        aria-label={label}
        min={def.log ? 0 : def.min}
        max={def.log ? 1000 : def.max}
        step={def.log ? 1 : def.step}
        value={def.log ? toLog(def, value) : value}
        onDoubleClick={() => onChange(def.default)}
        onChange={(e) => {
          const raw = Number(e.target.value);
          const v = def.log ? Math.round(fromLog(def, raw) / def.step) * def.step : raw;
          onChange(bipolar && Math.abs(v) < def.step / 2 ? 0 : v);
        }}
      />
    </div>
  );
}
