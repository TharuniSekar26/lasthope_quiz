// Tiny synthesised sound effects (Web Audio), so there are no audio files to ship or license.
// Everything is wrapped in try/catch: sound is a nicety and must never break the reveal.
let ctx;

function audio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  ctx ??= new Ctx();
  ctx.resume?.(); // browsers start suspended until a user gesture; the host's click counts
  return ctx;
}

function tone(c, { freq, start, length, type = 'sine', peak = 0.2 }) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

// Snare-like roll that gets louder over `ms`.
export function playDrumroll(ms = 2200) {
  try {
    const c = audio();
    if (!c) return;
    const hits = Math.floor(ms / 55);
    for (let i = 0; i < hits; i++) {
      const loudness = 0.08 + 0.3 * (i / hits);
      tone(c, { freq: 150 + (i % 2) * 25, start: c.currentTime + i * 0.055, length: 0.05, type: 'triangle', peak: loudness });
    }
  } catch {
    /* ignore */
  }
}

// Rising fanfare plus a burst of "applause" noise.
export function playCheer() {
  try {
    const c = audio();
    if (!c) return;
    const t = c.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => tone(c, { freq, start: t + i * 0.09, length: 0.9, type: 'triangle', peak: 0.18 }));

    const length = 1.4;
    const buffer = c.createBuffer(1, Math.floor(c.sampleRate * length), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const gain = c.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    gain.gain.value = 0.25;
    noise.buffer = buffer;
    noise.connect(filter).connect(gain).connect(c.destination);
    noise.start(t + 0.1);
  } catch {
    /* ignore */
  }
}
