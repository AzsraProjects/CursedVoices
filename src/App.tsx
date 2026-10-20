import { useEffect, useState } from "react";
import { Layout, type Page } from "./components/Layout";
import { Onboarding } from "./components/Onboarding";
import { engine } from "./audio/engine";
import { presetVoices } from "./lib/presets";
import { useStore } from "./lib/store";
import { Lab } from "./pages/Lab";
import { Settings } from "./pages/Settings";
import { Soundboard } from "./pages/Soundboard";
import { Voices } from "./pages/Voices";

export function App() {
  const { ready, data, toast, status } = useStore();
  const [page, setPage] = useState<Page>("voices");
  const [labVoice, setLabVoice] = useState<string | null>(null);

  useEffect(() => {
    if (status.mic === "denied") toast("toast.micDenied", "error");
  }, [status.mic, toast]);

  // Used by the smoke test (electron/main.ts) to visit every page.
  useEffect(() => {
    (window as unknown as { __cvNavigate: (p: Page) => void }).__cvNavigate = (p) => setPage(p);
    (window as unknown as { __cvSelfTest: () => Promise<unknown> }).__cvSelfTest = () =>
      import("./audio/selftest").then((m) => m.measureVoices(presetVoices()));
    (window as unknown as { __cvEngineInfo: () => unknown }).__cvEngineInfo = () => engine.info();
  }, []);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <img src="./logo.svg" alt="" className="h-24 w-24 animate-breathe" />
      </div>
    );
  }

  const navigate = (p: Page) => {
    if (p === "lab" && labVoice === null) setLabVoice(data.settings.activeVoiceId || null);
    setPage(p);
  };

  return (
    <>
      <Layout page={page} onNavigate={navigate}>
        {page === "voices" && <Voices onEdit={(id) => { setLabVoice(id); setPage("lab"); }} />}
        {page === "lab" && <Lab voiceId={labVoice} onPickVoice={setLabVoice} />}
        {page === "soundboard" && <Soundboard />}
        {page === "settings" && <Settings />}
      </Layout>
      {!data.settings.firstRunDone && <Onboarding />}
    </>
  );
}
