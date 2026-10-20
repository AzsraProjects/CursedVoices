import type { CvBridge } from "../../electron/preload";

declare global {
  interface Window {
    cv: CvBridge;
  }
}

export const cv = (): CvBridge => window.cv;

/** Copies an IPC Uint8Array into a standalone ArrayBuffer (decodeAudioData detaches it). */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
