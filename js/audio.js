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

  env(node, t, a, peak, d, pan = 0) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g);
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  tone(freq, t, { type = 'sine', a = 0.005, d = 0.3, peak = 0.3, glide = 0, pan = 0 } = {}) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + a + d);
    this.env(o, t, a, peak, d, pan);
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

  /**
   * The garden's own soft sounds, called every frame: crickets after dark,
   * and by day a bird now and then somewhere beyond the wall.
   */
  ambient(dt, { dark = false } = {}) {
    if (!this.on || !this.ctx) return;
    this.ambT = (this.ambT ?? 2) - dt;
    if (this.ambT > 0) return;
    const t = this.ctx.currentTime + 0.02;
    const pan = Math.random() * 1.3 - 0.65;
    if (dark) {
      // a cricket: a few quick, high pulses (and sometimes another one answers)
      const f = 4100 + Math.random() * 700;
      const n = 3 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) this.tone(f, t + i * 0.052, { d: 0.024, peak: 0.014, pan });
      if (Math.random() < 0.3) for (let i = 0; i < 3; i++) this.tone(f * 0.93, t + 0.42 + i * 0.05, { d: 0.022, peak: 0.009, pan: -pan });
      this.ambT = 0.8 + Math.random() * 1.9;
    } else {
      const f = 2500 + Math.random() * 1000;
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) this.tone(f * (1 + i * 0.07), t + i * 0.17, { d: 0.07, peak: 0.011, glide: 1.2, pan });
      this.ambT = 7 + Math.random() * 13;
    }
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
      case 'gust': { // a soft rush of air that swells and fades
        const d = 3.6;
        const len = Math.ceil(this.ctx.sampleRate * d);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 0.6;
        f.frequency.setValueAtTime(380, t);
        f.frequency.linearRampToValueAtTime(1100, t + 1.1);
        f.frequency.linearRampToValueAtTime(520, t + d);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.06 * Math.min(1.4, k), t + 0.9);
        g.gain.linearRampToValueAtTime(0.0001, t + d);
        src.connect(f).connect(g).connect(this.master);
        src.start(t);
        break;
      }
      case 'mochi': // pon… pon… pon: the moon rabbit's mallet, very far away
        for (let i = 0; i < 3; i++) this.tone(220, t + i * 0.36, { type: 'triangle', d: 0.12, peak: 0.07, glide: 0.7 });
        break;
      case 'leaves':
        this.noise(t, { d: 0.35, peak: 0.07, freq: 4500, q: 0.5 });
        break;
      case 'flutter': // little wings: a few soft, quick beats
        for (let i = 0; i < 5; i++) this.noise(t + i * 0.045, { d: 0.035, peak: 0.05 * k, freq: 2400 + i * 200, q: 0.9 });
        break;
      case 'chirp': // a sparrow's two-note cheep
        this.tone(3900, t, { d: 0.05, peak: 0.05, glide: 1.25 });
        this.tone(4400, t + 0.09, { d: 0.06, peak: 0.045, glide: 0.85 });
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
