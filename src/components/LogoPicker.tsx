import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { useT } from "../lib/i18n";
import { imageToLogo } from "../lib/image";
import type { Logo } from "../lib/types";
import { LOGO_ICONS, Modal, VoiceLogo } from "./ui";

const EMOJIS = ["😈", "👹", "💀", "👻", "🤖", "👽", "🐉", "🦇", "🕷️", "🔥", "⚡", "🌙", "👑", "🎃", "🧛", "🧟", "🐺", "🦊", "🐸", "🎤"];

export function LogoPicker({ logo, color, onChange }: { logo: Logo; color: string; onChange: (l: Logo) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const pickFile = async (f?: File) => {
    if (!f) return;
    try {
      onChange({ kind: "image", data: await imageToLogo(f) });
      setOpen(false);
    } catch {
      /* not an image: nothing to do */
    }
  };

  return (
    <>
      <button className="rounded-full transition hover:scale-105" onClick={() => setOpen(true)} title={t("logo.title")}>
        <VoiceLogo logo={logo} color={color} size={72} glow />
      </button>
      {open && (
        <Modal title={t("logo.title")} onClose={() => setOpen(false)}>
          <button className="btn-primary mb-5 w-full justify-center" onClick={() => file.current?.click()}>
            <ImagePlus size={16} /> {t("logo.upload")}
          </button>
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />

          <div className="label mb-2">{t("logo.icons")}</div>
          <div className="mb-5 grid grid-cols-8 gap-2">
            {Object.entries(LOGO_ICONS).map(([name, Icon]) => (
              <button
                key={name}
                onClick={() => { onChange({ kind: "icon", icon: name }); setOpen(false); }}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border transition hover:border-nexus-400 ${
                  logo.kind === "icon" && logo.icon === name ? "border-curse-400 bg-void-700" : "border-void-600"
                }`}
              >
                <Icon size={18} style={{ color }} />
              </button>
            ))}
          </div>

          <div className="label mb-2">{t("logo.emoji")}</div>
          <div className="grid grid-cols-10 gap-1.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => { onChange({ kind: "emoji", value: e }); setOpen(false); }}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-void-600 text-xl hover:border-nexus-400"
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input type="text" className="flex-1" placeholder={t("logo.emojiPlaceholder")} value={emoji} maxLength={8} onChange={(e) => setEmoji(e.target.value)} />
            <button
              className="btn-ghost"
              disabled={!emoji.trim()}
              onClick={() => { onChange({ kind: "emoji", value: emoji.trim() }); setOpen(false); }}
            >
              OK
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
