// Procedural Web Audio API synthesizer: zero external audio assets, zero network calls.
export function createAudio() {
  let ctx = null;
  let noiseBuffer = null;

  function ensure() {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const len = ctx.sampleRate * 1.0;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freqStart, freqEnd, dur, type = 'triangle', gainPeak = 0.15, delay = 0) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, filterFreq, filterType = 'bandpass', gainPeak = 0.2, delay = 0) {
    const c = ensure();
    if (!c || !noiseBuffer) return;
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, t0);
    const g = c.createGain();
    g.gain.setValueAtTime(gainPeak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  return {
    unlock: ensure,
    shot(weaponId, dist = 0) {
      const att = Math.max(0.04, 1 / (1 + dist * 0.09));
      if (weaponId === 'kestrel') {
        tone(210, 58, 0.09, 'sawtooth', 0.2 * att);
        noiseBurst(0.08, 1750, 'bandpass', 0.24 * att);
      } else if (weaponId === 'vektor') {
        tone(175, 65, 0.065, 'square', 0.14 * att);
        noiseBurst(0.06, 2200, 'highpass', 0.18 * att);
      } else if (weaponId === 'dmr7') {
        tone(145, 36, 0.18, 'sawtooth', 0.28 * att);
        noiseBurst(0.18, 1200, 'lowpass', 0.32 * att);
      } else if (weaponId === 'blade') {
        noiseBurst(0.09, 3200, 'bandpass', 0.14 * att);
      } else {
        tone(165, 44, 0.12, 'sawtooth', 0.24 * att);
        noiseBurst(0.11, 1450, 'bandpass', 0.28 * att);
      }
    },
    reload() {
      tone(520, 320, 0.04, 'square', 0.06, 0);
      tone(420, 690, 0.05, 'triangle', 0.07, 0.18);
    },
    hit(headshot) {
      if (headshot) {
        tone(1420, 980, 0.1, 'sine', 0.19);
        tone(2150, 1780, 0.08, 'triangle', 0.11, 0.015);
      } else {
        tone(220, 110, 0.055, 'triangle', 0.12);
      }
    },
    hurt() {
      tone(120, 52, 0.11, 'sawtooth', 0.16);
      noiseBurst(0.08, 450, 'lowpass', 0.14);
    },
    footstep(crouching) {
      noiseBurst(0.04, crouching ? 320 : 580, 'lowpass', crouching ? 0.03 : 0.065);
    },
    beep(freq = 880, dur = 0.08, gain = 0.11) {
      tone(freq, freq, dur, 'sine', gain);
    },
    explosion(dist = 0) {
      const att = Math.max(0.08, 1 / (1 + dist * 0.06));
      tone(95, 24, 0.45, 'sawtooth', 0.34 * att);
      noiseBurst(0.5, 650, 'lowpass', 0.42 * att);
    },
    smokeHiss(dist = 0) {
      const att = Math.max(0.06, 1 / (1 + dist * 0.08));
      noiseBurst(0.65, 2400, 'bandpass', 0.18 * att);
    },
    flashBang(dist = 0) {
      const att = Math.max(0.1, 1 / (1 + dist * 0.05));
      tone(3400, 2900, 0.45, 'sine', 0.12 * att);
      noiseBurst(0.18, 3800, 'highpass', 0.26 * att);
    },
    uiClick() {
      tone(660, 480, 0.03, 'triangle', 0.06);
    },
  };
}
