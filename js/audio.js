// Tiny synthesized sounds (Web Audio, no files). Off until the visitor turns them on.

export class Sound {
  constructor() {
    this.on = false;
    this.ctx = null;
    this.last = {};
  }

  setOn(on) {
    this.on = on;
    if (on && !this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.on = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (on && this.ctx.state === 'suspended') this.ctx.resume();
  }

  env(node, t, a, peak, d) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g);
    g.connect(this.master);
    return g;
  }

  tone(freq, t, { type = 'sine', a = 0.005, d = 0.3, peak = 0.3, glide = 0 } = {}) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + a + d);
    this.env(o, t, a, peak, d);
    o.start(t);
    o.stop(t + a + d + 0.05);
    return o;
  }

  noise(t, { d = 0.2, peak = 0.2, freq = 1200, q = 1, type = 'bandpass' } = {}) {
    const len = Math.ceil(this.ctx.sampleRate * (d + 0.05));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f);
    this.env(f, t, 0.004, peak, d);
    src.start(t);
    return src;
  }

  play(name, k = 1) {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.12) return;
    this.last[name] = now;
    const t = now + 0.01;
    switch (name) {
      case 'clack': // bamboo knock on stone
        this.tone(420, t, { type: 'triangle', d: 0.12, peak: 0.5 * k, glide: 0.6 });
        this.tone(1250, t, { type: 'sine', d: 0.05, peak: 0.25 * k });
        this.noise(t, { d: 0.05, peak: 0.25 * k, freq: 2200, q: 3 });
        break;
      case 'pour':
        this.noise(t, { d: 0.5, peak: 0.08, freq: 900, q: 0.7 });
        break;
      case 'startle': // the little bell on Kon's bib
        [1760, 2350, 2960].forEach((f, i) => this.tone(f, t + i * 0.035, { d: 0.35, peak: 0.12 }));
        break;
      case 'pop':
        this.tone(900, t, { d: 0.06, peak: 0.3, glide: 2.2 });
        break;
      case 'boop':
        this.tone(660, t, { type: 'sine', d: 0.15, peak: 0.25, glide: 1.4 });
        break;
      case 'sneeze':
        this.noise(t, { d: 0.18, peak: 0.3, freq: 3000, q: 0.8 });
        this.tone(520, t, { d: 0.1, peak: 0.12, glide: 0.5 });
        break;
      case 'whistle': {
        const notes = [988, 1175, 1319, 1175, 988];
        notes.forEach((f, i) => {
          const o = this.tone(f, t + i * 0.2, { a: 0.03, d: 0.16, peak: 0.08 });
          const lfo = this.ctx.createOscillator();
          const lg = this.ctx.createGain();
          lfo.frequency.value = 6;
          lg.gain.value = 12;
          lfo.connect(lg);
          lg.connect(o.frequency);
          lfo.start(t + i * 0.2);
          lfo.stop(t + i * 0.2 + 0.25);
        });
        break;
      }
      case 'purr':
        this.tone(55, t, { type: 'sawtooth', a: 0.1, d: 0.6, peak: 0.05 });
        break;
      case 'yawn':
        this.tone(420, t, { type: 'triangle', a: 0.2, d: 0.6, peak: 0.06, glide: 0.6 });
        break;
      case 'dizzy':
        this.tone(700, t, { d: 0.5, peak: 0.08, glide: 0.4 });
        break;
      case 'bell': // a temple bowl: low partials, long decay
        [196, 392.7, 588.3, 1017].forEach((f, i) => this.tone(f, t, { a: 0.01, d: 3.2 - i * 0.5, peak: [0.2, 0.09, 0.05, 0.025][i] }));
        break;
      case 'chime':
        [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, t + i * 0.09, { d: 0.8, peak: 0.08 }));
        break;
      case 'leaves':
        this.noise(t, { d: 0.35, peak: 0.07, freq: 4500, q: 0.5 });
        break;
      case 'lantern':
        this.noise(t, { d: 0.25, peak: 0.05, freq: 600, q: 0.6 });
        this.tone(330, t + 0.05, { d: 0.5, peak: 0.04 });
        break;
      default:
        break;
    }
  }
}
