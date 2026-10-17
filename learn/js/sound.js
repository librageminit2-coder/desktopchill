// Hiệu ứng âm thanh tổng hợp bằng Web Audio (không cần file âm thanh)
let ctx = null, master = null;
export const sound = { on: true };
function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    ctx = new C(); master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(f, t0, dur, { type = 'sine', vol = 0.3, attack = 0.005, glide = 0, detune = 0 } = {}) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, c.currentTime + t0); o.detune.value = detune;
  if (glide) o.frequency.exponentialRampToValueAtTime(f * glide, c.currentTime + t0 + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
  o.connect(g); g.connect(master); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.05);
}
function noise(t0, dur, { vol = 0.15, freq = 2000, q = 1 } = {}) {
  const c = ac(); if (!c) return;
  const n = c.sampleRate * dur, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource(); s.buffer = b;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start(c.currentTime + t0);
}
const N = (m) => 440 * Math.pow(2, (m - 69) / 12);
export function sfx(name) {
  if (!sound.on) return;
  try {
    switch (name) {
      case 'tap': tone(N(84), 0, 0.05, { type: 'triangle', vol: 0.12 }); break;
      case 'tile': noise(0, 0.05, { vol: 0.12, freq: 3200, q: 2 }); tone(N(79), 0, 0.06, { type: 'triangle', vol: 0.08 }); break;
      case 'ok': tone(N(76), 0, 0.16, { type: 'triangle', vol: 0.22 }); tone(N(83), 0.09, 0.32, { type: 'triangle', vol: 0.22 }); tone(N(88), 0.09, 0.4, { type: 'sine', vol: 0.08 }); break;
      case 'bad': tone(N(52), 0, 0.22, { type: 'sawtooth', vol: 0.06, glide: 0.8 }); tone(N(47), 0.08, 0.26, { type: 'triangle', vol: 0.16, glide: 0.85 }); break;
      case 'flip': noise(0, 0.18, { vol: 0.1, freq: 1400, q: 0.7 }); break;
      case 'pop': tone(N(81), 0, 0.09, { type: 'sine', vol: 0.18, glide: 1.5 }); break;
      case 'combo': [76, 79, 83, 88].forEach((m, i) => tone(N(m), i * 0.06, 0.18, { type: 'triangle', vol: 0.16 })); break;
      case 'done': {
        [72, 76, 79, 84].forEach((m, i) => tone(N(m), i * 0.11, 0.5, { type: 'triangle', vol: 0.2 }));
        [84, 88, 91, 96].forEach((m, i) => tone(N(m), 0.5 + i * 0.07, 0.6, { type: 'sine', vol: 0.09 }));
        noise(0.5, 0.6, { vol: 0.05, freq: 7000, q: 0.5 }); break;
      }
      case 'build': [60, 67].forEach((m, i) => tone(N(m), i * 0.12, 0.25, { type: 'square', vol: 0.04 })); noise(0, 0.08, { vol: 0.1, freq: 900, q: 3 }); break;
      case 'open': tone(N(72), 0, 0.07, { type: 'sine', vol: 0.12, glide: 1.6 }); noise(0, 0.06, { vol: 0.05, freq: 2400, q: 1 }); break;
      case 'quest': [79, 84, 91].forEach((m, i) => tone(N(m), i * 0.08, 0.3, { type: 'triangle', vol: 0.15 })); break;
      case 'rec': tone(N(88), 0, 0.08, { vol: 0.15 }); break;
      case 'stop': tone(N(81), 0, 0.08, { vol: 0.15 }); tone(N(76), 0.07, 0.1, { vol: 0.12 }); break;
    }
  } catch (e) { /* bỏ qua */ }
}
export function unlockAudio() { ac(); }
