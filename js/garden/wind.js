// Wind — a breeze that never quite stops, and now and then a gust that runs
// through the whole garden from the right: the maple tosses and lets go of a
// handful of leaves that sail across, the pampas grass bows, curls of wind
// draw themselves through the air like brush strokes, fallen leaves skitter
// over the sand, the plaque swings, and Kon's ears and tail stream.
// Mixed into Scene (see scene.js); `this` is the scene.

import { clamp, lerp, smoothstep, noise1, makeRng, TAU } from '../math.js';
import { $, f2, svgEl } from '../util.js';

const GUST_LEN = 4.8;

// clumps of pampas grass (susuki): base point, how many stems, size
const SUSUKI = [
  { x: 200, y: 716, n: 7, s: 1.0, seed: 3 },
  { x: 1096, y: 712, n: 6, s: 0.92, seed: 7 },
  { x: 1520, y: 724, n: 7, s: 1.05, seed: 11 },
];

export class GardenWind {
  buildSusuki() {
    this.susuki = [];
    const host = $('susuki');
    for (const C of SUSUKI) {
      const rng = makeRng(C.seed);
      const clump = svgEl('g', { transform: `translate(${C.x} ${C.y})` }, host);
      // leaves first: long arching blades from the base
      let blades = '';
      for (let i = 0; i < 7; i++) {
        const side = i % 2 ? 1 : -1;
        const len = (60 + rng() * 60) * C.s;
        const tipX = side * len * (0.55 + rng() * 0.4), tipY = -len * (0.45 + rng() * 0.35);
        const cx = side * len * 0.15, cy = -len * 0.95;
        blades += `M ${f2(-2 * side)},0 Q ${f2(cx)},${f2(cy)} ${f2(tipX)},${f2(tipY)} Q ${f2(cx + side * 9)},${f2(cy + 12)} ${f2(4 * side)},0 Z `;
      }
      svgEl('path', { d: blades, class: 'susuki-blade' }, clump);
      for (let i = 0; i < C.n; i++) {
        const H = (120 + rng() * 70) * C.s;
        const lean = (i - (C.n - 1) / 2) * 5 + (rng() - 0.5) * 6;
        const g = svgEl('g', {}, clump);
        svgEl('path', { d: `M 0,0 Q ${f2(3 + rng() * 4)},${f2(-H * 0.5)} 0,${f2(-H)}`, class: 'susuki-stem' }, g);
        // the plume: a soft feathery tuft that droops to one side
        const plume = svgEl('g', { transform: `translate(0 ${f2(-H)})` }, g);
        const L = (46 + rng() * 22) * C.s;
        svgEl('path', {
          d: `M 1,4 C -5,${f2(-L * 0.25)} -9,${f2(-L * 0.6)} -17,${f2(-L)} C -7,${f2(-L * 0.78)} 6,${f2(-L * 0.45)} 5,0 Z`,
          class: 'susuki-plume',
        }, plume);
        let strands = '';
        for (let k = 0; k < 4; k++) {
          const sx = -2 + k * 1.5, ex = -18 + k * 5 + rng() * 4, ey = -L * (0.62 + rng() * 0.3);
          strands += `M ${f2(sx)},0 Q ${f2(sx - 2)},${f2(ey * 0.5)} ${f2(ex)},${f2(ey)} `;
        }
        svgEl('path', { d: strands, class: 'susuki-strand' }, plume);
        this.susuki.push({ g, plume, H, lean, seed: rng() * 20, s: C.s });
      }
    }
  }

  /** A gust from the right (strength 0–1.5). */
  gust(strength = 1) {
    if (this.gustNow) return;
    this.gustNow = { t: 0, k: strength };
    this.emit({ type: 'gust', k: strength });
    this.emit({ type: 'sfx', name: 'gust', k: strength });
    this.mapleShake.v += 1.4 * strength;
    this.nudgeEma(0.9 * strength);
    this.pokeFlower(0.8);
    if (this.reduced) return;
    // the maple lets go of a handful of leaves, and the wind takes them
    const n = 3 + Math.floor(this.rng() * 3 * strength);
    for (let i = 0; i < n; i++) {
      const sp = this.mapleSpots[Math.floor(this.rng() * this.mapleSpots.length)];
      const spot = this.mapleToWorld(sp[0], sp[1]);
      this.dropLeaf(spot.x, spot.y, 0.35 + i * 0.22);
    }
    // curls of wind, drawn through the air like brush strokes
    for (let i = 0; i < 3; i++) this.windCurl(0.15 + i * 0.45 + this.rng() * 0.2);
    // and sometimes one leaf comes tumbling right past the lens
    if (this.rng() < 0.55 && this.sky.p.stars < 0.3) this.lensAt = this.t + 0.7 + this.rng() * 0.6;
  }

  /** A big, out-of-focus leaf tumbling past the camera, from the top right across and down. */
  lensLeaf() {
    const el = $('lens-leaf');
    if (!el.firstChild) {
      const { d, v } = this.leafPath(52);
      el.innerHTML = `<svg viewBox="-64 -64 128 128"><path d="${d}" fill="#cf5530"/><path d="${v}" fill="none" stroke="rgba(90,30,15,.5)" stroke-width="2.4"/></svg>`;
    }
    const W = this.W, H = this.H;
    const size = Math.max(160, Math.min(W, H) * 0.32);
    el.style.width = el.style.height = `${f2(size)}px`;
    this.lens = { t: 0, dur: 2.6, size, x0: W * (0.75 + this.rng() * 0.2), y0: -size * 0.8, x1: W * (0.1 + this.rng() * 0.3), y1: H + size * 0.2, spin: (this.rng() < 0.5 ? -1 : 1) * (200 + this.rng() * 160) };
    el.style.display = 'block';
  }

  updateLens(dt) {
    if (this.lensAt && this.t > this.lensAt) { this.lensAt = 0; this.lensLeaf(); }
    const L = this.lens;
    if (!L) return;
    L.t += dt;
    const u = clamp(L.t / L.dur);
    const e = u * u * (3 - 2 * u);
    const x = lerp(L.x0, L.x1, e) + Math.sin(u * 7) * L.size * 0.35;
    const y = lerp(L.y0, L.y1, u) - Math.sin(u * 7 + 1) * L.size * 0.08;
    const flip = Math.cos(u * 9);
    $('lens-leaf').style.transform = `translate(${f2(x - L.size / 2)}px, ${f2(y - L.size / 2)}px) rotate(${f2(L.spin * u)}deg) scale(${f2(1)}, ${f2(0.35 + 0.65 * Math.abs(flip))})`;
    if (u >= 1) { this.lens = null; $('lens-leaf').style.display = 'none'; }
  }

  windCurl(delay) {
    const vb = this.vb;
    const y = 520 + this.rng() * 260;
    const x0 = vb.x + vb.w * (0.85 + this.rng() * 0.2);
    const len = vb.w * (0.45 + this.rng() * 0.25);
    const amp = 10 + this.rng() * 16;
    const ph = this.rng() * TAU;
    // a long wave, then a little curl at the end
    let d = `M ${f2(x0)},${f2(y)}`;
    let x = x0, yy = y;
    for (let i = 1; i <= 24; i++) {
      const u = i / 24;
      x = x0 - len * u;
      yy = y + Math.sin(u * 5 + ph) * amp * (1 - u * 0.4) + u * 24;
      d += ` L ${f2(x)},${f2(yy)}`;
    }
    const r0 = 26 + this.rng() * 10;
    for (let i = 1; i <= 18; i++) {
      const a = (i / 18) * TAU * 1.15;
      const r = r0 * (1 - (i / 18) * 0.65);
      d += ` L ${f2(x - Math.sin(a) * r)},${f2(yy - r0 + Math.cos(a) * r)}`;
    }
    const el = svgEl('path', { d, class: 'wind-curl' }, $('fx-world'));
    const L = el.getTotalLength ? el.getTotalLength() : 1200;
    el.style.strokeDasharray = `${f2(L * 0.42)} ${f2(L * 2)}`;
    el.style.strokeDashoffset = f2(L * 0.42);
    el.style.opacity = '0';
    (this.curls || (this.curls = [])).push({ el, L, t: -delay });
  }

  updateWind(dt) {
    const t = this.t;
    // the breeze, plus a gust now and then
    let wind = 0.07 + 0.05 * noise1(t * 0.21, 4);
    const G = this.gustNow;
    if (G) {
      G.t += dt;
      wind += G.k * smoothstep(0, 0.8, G.t) * (1 - smoothstep(2.2, GUST_LEN, G.t));
      if (G.t > GUST_LEN) this.gustNow = null;
    } else if (t > this.nextGustAt) {
      this.nextGustAt = t + 32 + this.rng() * 40;
      if (this.autoGusts) this.gust(0.7 + this.rng() * 0.5);
    }
    this.wind = wind;
    this.updateLens(dt);

    // pampas grass: a slow sway, bowing to the left in a gust
    for (const st of this.susuki || []) {
      const sway = (Math.sin(t * 0.9 + st.seed) * 1.6 + noise1(t * 0.6, st.seed) * 2.2) * (1 + wind * 2.5);
      const bow = -wind * 22 * (0.8 + 0.2 * Math.sin(st.seed));
      const flutter = this.reduced ? 0 : Math.sin(t * (6 + st.seed % 3) + st.seed) * wind * 3;
      st.g.setAttribute('transform', `rotate(${f2(st.lean + (this.reduced ? 0 : sway) + bow + flutter)})`);
      st.plume.setAttribute('transform', `translate(0 ${f2(-st.H)}) rotate(${f2(bow * 0.6 + flutter * 2)})`);
    }

    // the wind's brush strokes: draw on, then fly off
    if (this.curls) {
      for (let i = this.curls.length - 1; i >= 0; i--) {
        const c = this.curls[i];
        c.t += dt;
        if (c.t < 0) continue;
        const u = clamp(c.t / 1.9);
        c.el.style.strokeDashoffset = f2(lerp(c.L * 0.42, -c.L * 1.02, u));
        c.el.style.opacity = f2(0.75 * smoothstep(0, 0.12, u) * (1 - smoothstep(0.7, 1, u)));
        if (u >= 1) { c.el.remove(); this.curls.splice(i, 1); }
      }
    }
  }
}
