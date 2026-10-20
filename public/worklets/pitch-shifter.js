// Phase-vocoder pitch shifter with spectral-envelope (formant) preservation.
//
// Pitch and formants are independent:
//   pitch   : semitones the voice moves (the note)
//   formant : semitones the timbre moves (the size of the throat)
// Formant 0 keeps the speaker's own timbre, so a pitched voice does not sound
// like a chipmunk. Formant equal to pitch reproduces a plain resampling shift (chipmunk).
//
// Frame 1024, overlap 8 (hop 128 = one render quantum). Latency: 896 samples.

const N = 1024;
const OSAMP = 8;
const HOP = N / OSAMP;
const HALF = N / 2;
const LATENCY = N - HOP;
const LIFTER = 28; // cepstral coefficients kept for the envelope
const TWO_PI = Math.PI * 2;

class FFT {
  constructor(n) {
    this.n = n;
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float32Array(n / 2);
    this.sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((TWO_PI * i) / n);
      this.sin[i] = Math.sin((TWO_PI * i) / n);
    }
  }
  // In-place complex FFT. inverse=true computes the unscaled inverse.
  run(re, im, inverse) {
    const n = this.n, rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    const sign = inverse ? 1 : -1;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < half; j++) {
          const k = j * step;
          const wr = this.cos[k], wi = sign * this.sin[k];
          const a = i + j, b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }
}

class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'pitch', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' },
      { name: 'formant', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.fft = new FFT(N);
    this.window = new Float32Array(N);
    for (let i = 0; i < N; i++) this.window[i] = 0.5 - 0.5 * Math.cos((TWO_PI * i) / N);
    this.inFifo = new Float32Array(N);
    this.outFifo = new Float32Array(N);
    this.accum = new Float32Array(2 * N);
    this.lastPhase = new Float32Array(HALF + 1);
    this.sumPhase = new Float32Array(HALF + 1);
    this.anaPhase = new Float32Array(HALF + 1);
    this.best = new Float32Array(HALF + 1);
    this.src = new Int32Array(HALF + 1); // analysis bin each synthesis bin comes from
    this.peaks = new Int32Array(HALF + 1);
    this.started = false;
    this.anaMag = new Float32Array(HALF + 1);
    this.anaFreq = new Float32Array(HALF + 1);
    this.synMag = new Float32Array(HALF + 1);
    this.synFreq = new Float32Array(HALF + 1);
    this.env = new Float32Array(HALF + 1);
    this.re = new Float32Array(N);
    this.im = new Float32Array(N);
    this.cre = new Float32Array(N);
    this.cim = new Float32Array(N);
    this.rover = LATENCY;
    this.preserve = true;
    this.alive = true;
    this.port.onmessage = (e) => { if (e.data && e.data.dispose) this.alive = false; };
    this.port.postMessage({ latency: LATENCY });
  }

  // Smooth spectral envelope by cepstral liftering of the log magnitude.
  envelope() {
    const cre = this.cre, cim = this.cim, mag = this.anaMag, env = this.env;
    for (let k = 0; k <= HALF; k++) {
      const l = Math.log(mag[k] + 1e-9);
      cre[k] = l; cim[k] = 0;
      if (k > 0 && k < HALF) { cre[N - k] = l; cim[N - k] = 0; }
    }
    this.fft.run(cre, cim, false);
    for (let k = LIFTER; k <= N - LIFTER; k++) { cre[k] = 0; cim[k] = 0; }
    this.fft.run(cre, cim, true);
    for (let k = 0; k <= HALF; k++) env[k] = Math.exp(cre[k] / N);
  }

  envAt(pos) {
    if (pos >= HALF) return this.env[HALF] * 1e-3;
    const i = pos | 0, f = pos - i;
    return this.env[i] * (1 - f) + this.env[i + 1] * f;
  }

  frame(pitchRatio, formantRatio, sampleRate) {
    const re = this.re, im = this.im, win = this.window;
    const freqPerBin = sampleRate / N;
    const expct = (TWO_PI * HOP) / N;

    for (let k = 0; k < N; k++) { re[k] = this.inFifo[k] * win[k]; im[k] = 0; }
    this.fft.run(re, im, false);

    for (let k = 0; k <= HALF; k++) {
      const r = re[k], i = im[k];
      const mag = 2 * Math.sqrt(r * r + i * i);
      const phase = Math.atan2(i, r);
      let tmp = phase - this.lastPhase[k];
      this.lastPhase[k] = phase;
      tmp -= k * expct;
      let qpd = Math.trunc(tmp / Math.PI);
      if (qpd >= 0) qpd += qpd & 1; else qpd -= qpd & 1;
      tmp -= Math.PI * qpd;
      tmp = (OSAMP * tmp) / TWO_PI;
      this.anaMag[k] = mag;
      this.anaPhase[k] = phase;
      this.anaFreq[k] = k * freqPerBin + tmp * freqPerBin;
    }

    const shapeFormants = Math.abs(formantRatio - pitchRatio) > 1e-4 && this.preserve;
    if (shapeFormants) this.envelope();

    this.synMag.fill(0);
    this.synFreq.fill(0);
    this.best.fill(0);
    for (let k = 0; k <= HALF; k++) {
      const idx = Math.round(k * pitchRatio);
      if (idx > HALF) break;
      const m = shapeFormants ? this.anaMag[k] / (this.env[k] + 1e-9) : this.anaMag[k];
      if (m >= this.best[idx]) {
        this.best[idx] = m;
        this.synFreq[idx] = this.anaFreq[k] * pitchRatio;
        this.src[idx] = k;
      }
      this.synMag[idx] += m;
    }
    if (shapeFormants) {
      for (let k = 0; k <= HALF; k++) this.synMag[k] *= this.envAt(k / formantRatio);
    }

    // Identity phase locking (Laroche & Dolson): only spectral peaks advance their phase
    // freely; the bins around a peak keep the phase offsets they had in the input. The
    // harmonics stay coherent, so the voice does not turn phasey or metallic.
    const mag = this.synMag, sum = this.sumPhase, ana = this.anaPhase, src = this.src;
    const advance = (k) => {
      let tmp = mag[k] === 0 ? k * freqPerBin : this.synFreq[k];
      tmp = (tmp - k * freqPerBin) / freqPerBin;
      tmp = (TWO_PI * tmp) / OSAMP + k * expct;
      let s = sum[k] + tmp;
      s -= TWO_PI * Math.floor(s / TWO_PI);
      sum[k] = s;
    };
    let np = 0;
    for (let k = 1; k < HALF; k++) {
      if (mag[k] > 1e-7 && mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) this.peaks[np++] = k;
    }
    if (np === 0) {
      for (let k = 0; k <= HALF; k++) advance(k);
    } else {
      for (let i = 0; i < np; i++) {
        const k = this.peaks[i];
        if (this.started) advance(k);
        else sum[k] = ana[src[k]]; // first frame: start from the input's own phases
      }
      this.started = true;
      let p = 0;
      for (let k = 0; k <= HALF; k++) {
        while (p < np - 1 && Math.abs(k - this.peaks[p + 1]) < Math.abs(k - this.peaks[p])) p++;
        const pk = this.peaks[p];
        if (k !== pk) {
          let s = sum[pk] + ana[src[k]] - ana[src[pk]];
          s -= TWO_PI * Math.floor(s / TWO_PI);
          sum[k] = s;
        }
      }
    }
    for (let k = 0; k <= HALF; k++) {
      re[k] = mag[k] * Math.cos(sum[k]);
      im[k] = mag[k] * Math.sin(sum[k]);
    }
    for (let k = HALF + 1; k < N; k++) { re[k] = 0; im[k] = 0; }
    this.fft.run(re, im, true);

    // Hann analysis + synthesis window at overlap 8: calibrated for unity gain at pitch 0.
    // Upward shifts spread the energy over fewer bins: compensate so loudness holds.
    const scale = (4 / (3 * HALF * OSAMP)) * (pitchRatio > 1 ? Math.pow(pitchRatio, 0.75) : 1);
    for (let k = 0; k < N; k++) this.accum[k] += win[k] * re[k] * scale;
    for (let k = 0; k < HOP; k++) this.outFifo[k] = this.accum[k];
    this.accum.copyWithin(0, HOP, HOP + N);
    this.accum.fill(0, N);
    this.inFifo.copyWithin(0, HOP, N);
  }

  process(inputs, outputs, params) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0][0];
    if (!output) return this.alive;
    const pitchRatio = Math.pow(2, params.pitch[0] / 12);
    const formantRatio = Math.pow(2, params.formant[0] / 12);
    for (let i = 0; i < output.length; i++) {
      let x = input ? input[i] : 0;
      if (!(x === x)) x = 0; // NaN guard: one bad sample must never poison the vocoder state
      this.inFifo[this.rover] = x;
      output[i] = this.outFifo[this.rover - LATENCY];
      this.rover++;
      if (this.rover >= N) {
        this.rover = LATENCY;
        this.frame(pitchRatio, formantRatio, sampleRate);
      }
    }
    return this.alive;
  }
}

registerProcessor('cv-pitch-shifter', PitchShifter);
