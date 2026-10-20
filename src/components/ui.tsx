import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bird, Bot, Cat, Church, Cpu, Crown, Drama, Eye, Flame, Ghost, Heart, Mic, Moon, Mountain, Music, Rabbit, Radio,
  Rocket, Skull, Snowflake, Sparkles, Swords, X, Zap, type LucideIcon,
} from "lucide-react";
import { engine } from "../audio/engine";
import { useT } from "../lib/i18n";
import { formatAccelerator, acceleratorFromEvent } from "../lib/hotkey";
import { formatBinding, midi } from "../lib/midi";
import { translateMessage } from "../lib/i18n";
import { useStore } from "../lib/store";
import type { Logo, MidiBinding } from "../lib/types";

export const LOGO_ICONS: Record<string, LucideIcon> = {
  skull: Skull, bot: Bot, radio: Radio, church: Church, ghost: Ghost, mountain: Mountain, sparkles: Sparkles,
  cpu: Cpu, mic: Mic, flame: Flame, zap: Zap, moon: Moon, crown: Crown, cat: Cat, drama: Drama, swords: Swords,
  eye: Eye, heart: Heart, music: Music, rocket: Rocket, snowflake: Snowflake, rabbit: Rabbit, bird: Bird,
};

export const COLORS = ["#8b5cf6", "#2ee6d6", "#f5c451", "#ef4444", "#46a8ff", "#ec4899", "#16a34a", "#f97316", "#94a3b8", "#e8f4ff"];

/** Round medallion with the voice logo; glows in the voice colour when live. */
export function VoiceLogo({ logo, color, size = 56, glow = false }: { logo: Logo; color: string; size?: number; glow?: boolean }) {
  const style = {
    width: size,
    height: size,
    background: `radial-gradient(circle at 35% 30%, ${color}55, #10132a 70%)`,
    borderColor: color,
    boxShadow: glow ? `0 0 ${size / 2.2}px ${color}aa, inset 0 0 ${size / 5}px ${color}66` : `inset 0 0 ${size / 6}px ${color}33`,
  };
  let inner: ReactNode;
  if (logo.kind === "image") inner = <img src={logo.data} alt="" className="h-full w-full rounded-full object-cover" draggable={false} />;
  else if (logo.kind === "emoji") inner = <span style={{ fontSize: size * 0.48, lineHeight: 1 }}>{logo.value}</span>;
  else {
    const Icon = LOGO_ICONS[logo.icon] ?? Mic;
    inner = <Icon style={{ width: size * 0.48, height: size * 0.48, color }} strokeWidth={1.7} />;
  }
  return (
    <div className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 transition-shadow" style={style}>
      {inner}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <input type="checkbox" className="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />;
}

export function Row({ title, help, children }: { title: ReactNode; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-t border-void-700 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-100">{title}</div>
        {help && <div className="mt-0.5 text-xs text-slate-500">{help}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="card-title mb-0">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="title-display text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Empty({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 py-14 text-center">
      <div className="title-display text-xl">{title}</div>
      <p className="max-w-md text-sm text-slate-400">{text}</p>
      {children}
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void-950/80 p-6" onMouseDown={onClose}>
      <div
        className={`card max-h-[86vh] w-full ${wide ? "max-w-2xl" : "max-w-lg"} animate-rise overflow-y-auto p-6`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="title-display text-2xl">{title}</h2>
          <button className="text-slate-400 hover:text-white" onClick={onClose} aria-label="close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Live level meter fed by the engine (dBFS, -60..0). */
export function Meter({ which, vertical = false, className = "" }: { which: "input" | "output"; vertical?: boolean; className?: string }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let shown = 0;
    const tick = () => {
      const db = engine.meter(which);
      const v = Math.max(0, Math.min(1, (db + 60) / 60));
      shown = v > shown ? v : shown * 0.9 + v * 0.1;
      if (bar.current) {
        if (vertical) bar.current.style.height = `${shown * 100}%`;
        else bar.current.style.width = `${shown * 100}%`;
        bar.current.style.background = db > -3 ? "#f43f5e" : db > -12 ? "#f5c451" : "linear-gradient(90deg,#8b5cf6,#2ee6d6)";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [which, vertical]);
  return (
    <div className={`relative overflow-hidden rounded-full bg-void-700 ${vertical ? "h-full w-1.5" : "h-1.5 w-full"} ${className}`}>
      <div ref={bar} className={`absolute bottom-0 left-0 rounded-full ${vertical ? "w-full" : "h-full"}`} />
    </div>
  );
}

export function Slider({
  value, min, max, step, onChange, format, label,
}: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string; label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        className="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {format && <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-300">{format(value)}</span>}
    </div>
  );
}

/** Captures a global shortcut: click, press the combination, done. */
export function HotkeyInput({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const t = useT();
  const [listening, setListening] = useState(false);
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setListening(false);
      const acc = acceleratorFromEvent(e);
      if (acc) {
        onChange(acc);
        setListening(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, onChange]);
  return (
    <div className="flex items-center gap-1.5">
      <button
        className={`min-w-[120px] rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
          listening ? "animate-breathe border-curse-400 text-curse-300" : "border-void-600 bg-void-800 text-slate-200 hover:border-nexus-500"
        }`}
        title={t("hk.hint")}
        onClick={() => setListening((l) => !l)}
      >
        {listening ? t("hk.press") : value ? formatAccelerator(value) : t("hk.none")}
      </button>
      {value && !listening && (
        <button className="text-slate-500 hover:text-rose-300" onClick={() => onChange(undefined)} aria-label={t("hk.clear")}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function MidiLearn({ value, onChange }: { value?: MidiBinding; onChange: (v: MidiBinding | undefined) => void }) {
  const t = useT();
  const [learning, setLearning] = useState(false);
  useEffect(() => () => midi.cancelLearn(), []);
  const start = async () => {
    if (learning) {
      midi.cancelLearn();
      setLearning(false);
      return;
    }
    setLearning(true);
    await midi.init();
    const b = await midi.learn();
    setLearning(false);
    onChange(b);
  };
  return (
    <div className="flex items-center gap-1.5">
      <button
        className={`min-w-[120px] rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
          learning ? "animate-breathe border-curse-400 text-curse-300" : "border-void-600 bg-void-800 text-slate-200 hover:border-nexus-500"
        }`}
        onClick={() => void start()}
      >
        {learning ? t("midi.waiting") : value ? formatBinding(value) : `${t("midi.learn")}`}
      </button>
      {value && !learning && (
        <button className="text-slate-500 hover:text-rose-300" onClick={() => onChange(undefined)} aria-label={t("hk.clear")}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {COLORS.map((c) => (
        <button
          key={c}
          className={`h-6 w-6 rounded-full border-2 transition ${value === c ? "scale-110 border-white" : "border-transparent hover:scale-110"}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
      <input type="color" className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Toaster() {
  const { toasts, dismiss, data } = useStore();
  return (
    <div className="pointer-events-none fixed bottom-28 right-6 z-50 flex flex-col items-end gap-2">
      {toasts.map((x) => (
        <div
          key={x.id}
          className={`pointer-events-auto flex max-w-md animate-rise items-center gap-3 rounded-xl border bg-void-850 px-4 py-3 text-sm ${
            x.kind === "error" ? "border-rose-700 text-rose-200" : "border-gold-500/50 text-slate-100 shadow-gold"
          }`}
        >
          <span>{translateMessage(data.settings.language, x.text)}</span>
          <button className="text-slate-400 hover:text-white" onClick={() => dismiss(x.id)} aria-label="close">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
