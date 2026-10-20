import { useCallback, useEffect, useState } from "react";

export interface Devices {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
}

/** Audio devices, kept fresh when something is plugged or unplugged. */
export function useDevices(): Devices & { refresh: () => void } {
  const [devices, setDevices] = useState<Devices>({ inputs: [], outputs: [] });
  const refresh = useCallback(() => {
    void navigator.mediaDevices.enumerateDevices().then((list) => {
      const real = (d: MediaDeviceInfo) => d.deviceId !== "default" && d.deviceId !== "communications";
      setDevices({
        inputs: list.filter((d) => d.kind === "audioinput" && real(d)),
        outputs: list.filter((d) => d.kind === "audiooutput" && real(d)),
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
