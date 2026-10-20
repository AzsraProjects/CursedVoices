import { useCallback, useEffect, useState } from "react";

export interface Devices {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
  /** Label of the Windows default microphone ("" until permission is granted). */
  defaultInputLabel: string;
}

/** Audio devices, kept fresh when something is plugged or unplugged. */
export function useDevices(): Devices & { refresh: () => void } {
  const [devices, setDevices] = useState<Devices>({ inputs: [], outputs: [], defaultInputLabel: "" });
  const refresh = useCallback(() => {
    void navigator.mediaDevices.enumerateDevices().then((list) => {
      const real = (d: MediaDeviceInfo) => d.deviceId !== "default" && d.deviceId !== "communications";
      const def = list.find((d) => d.kind === "audioinput" && d.deviceId === "default");
      setDevices({
        inputs: list.filter((d) => d.kind === "audioinput" && real(d)),
        outputs: list.filter((d) => d.kind === "audiooutput" && real(d)),
        defaultInputLabel: def?.label ?? "",
      });
    });
  }, []);
  useEffect(() => {
    refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    // Labels arrive once the microphone permission is granted: ask again shortly after start.
    const timer = setTimeout(refresh, 1500);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", refresh);
      clearTimeout(timer);
    };
  }, [refresh]);
  return { ...devices, refresh };
}

export const CABLE_PATTERN = /cable input|vb-audio virtual cable/i;

/** Microphones made by other software (voice changers, the cable itself): not a real voice. */
const VIRTUAL_MIC = /voicemod|cable output|vb-audio|voicemeeter|virtual|clownfish|morphvox/i;

export const isVirtualMic = (label: string): boolean => VIRTUAL_MIC.test(label);

/**
 * The microphone to start with: the Windows default if it is a real one, otherwise the
 * best real microphone: an audio interface or headset, then a denoiser such as NVIDIA
 * Broadcast (the real mic, with extra latency), then a webcam.
 */
export function pickRealMic(inputs: MediaDeviceInfo[], defaultLabel: string): string | null {
  if (defaultLabel && !isVirtualMic(defaultLabel)) return "default";
  const rank = (label: string) => (/webcam|camera|c9\d\d/i.test(label) ? 2 : /broadcast|krisp/i.test(label) ? 1 : 0);
  const real = inputs.filter((d) => d.label && !isVirtualMic(d.label)).sort((a, b) => rank(a.label) - rank(b.label));
  return real[0]?.deviceId ?? null;
}
