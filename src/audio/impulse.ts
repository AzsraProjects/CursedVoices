// Synthetic reverb impulse: stereo decorrelated noise, exponential decay, damped highs.
// Seeded so the same settings always give the same room. Cached because the stream
// graph and the monitor graph ask for the same one.

const cache = new Map<string, AudioBuffer>();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function reverbImpulse(sampleRate: number, decay: number, tone: number): AudioBuffer {
  const key = `${sampleRate}:${decay.toFixed(2)}:${Math.round(tone)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const length = Math.max(1, Math.floor(sampleRate * Math.min(10, decay) * 1.1));
  const buffer = new AudioBuffer({ numberOfChannels: 2, length, sampleRate });
  // One-pole low-pass whose cutoff drops over the tail: highs die first, like a real room.
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    const rand = rng(1234 + ch * 777);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const env = Math.pow(10, (-3 * t) / decay); // -60 dB at `decay` seconds
      const cutoff = tone * (1 - 0.7 * Math.min(1, t / decay));
      const a = Math.exp((-2 * Math.PI * cutoff) / sampleRate);
      lp = (1 - a) * (rand() * 2 - 1) + a * lp;
      const fadeIn = Math.min(1, i / (0.004 * sampleRate));
      data[i] = lp * env * fadeIn;
    }
  }
  // Normalise to unit energy so long rooms are not louder than short ones.
  let energy = 0;
  for (let ch = 0; ch < 2; ch++) for (const v of buffer.getChannelData(ch)) energy += v * v;
  const norm = 1 / Math.sqrt(energy / 2 + 1e-9);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] *= norm * 0.8;
  }
  if (cache.size > 24) cache.clear();
  cache.set(key, buffer);
  return buffer;
}
