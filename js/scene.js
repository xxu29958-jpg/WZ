// Scene — the garden around Kon: responsive framing, generated details
// (ensō, raked sand, maple leaves, paper grain) and the small living things
// you can play with (lantern, shishi-odoshi, maple, snail, flower, crane,
// dragonfly, fireflies). It reports interesting events and objects to the brain.

import { Spring, clamp, lerp, smoothstep, TAU, DEG, makeRng, noise1, randRange } from './math.js';
import { EnsoBrush } from './enso.js';
import { ZenFX } from './zen.js';
import { SandRake } from './rake.js';
import { SORT_Y, depthScale } from './world.js';

const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const f2 = (v) => v.toFixed(2);
const make = (tag, attrs = {}, parent) => {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
};

export const PLACES = {
  lantern: { x: 330, y: 584 },
  bamboo: { x: 470, y: 860 },
  maple: { x: 1220, y: 150 },
  rack: { x: 1300, y: 650 },
  sky: { x: 900, y: 120 },
  flower: { x: 670, y: 774 },
  snail: { x: 352, y: 744 },
  basinWater: { x: 471, y: 884 },
  bambooTube: { x: 500, y: 846 },
};

const LEAF_COLORS = ['#e2483a', '#ec6a3a', '#f08a3c', '#e9a13a', '#d6402e', '#f2b04a'];

export class Scene {
  constructor({ app, svg, back, glow, ema, caption, emit, rng = Math.random, reducedMotion = false }) {
    this.app = app;
    this.svg = svg;
    this.back = back;
    this.glow = glow;
    this.ema = ema;
    this.caption = caption;
    this.emit = emit;
    this.rng = rng;
    this.reduced = reducedMotion;
    this.places = PLACES;
    this.vb = { x: 0, y: 0, w: 1600, h: 1000 };
    this.scale = 1;
    this.mode = 'wide';
    this.night = false;
    this.t = 0;

    this.leaves = [];
    this.waterDrops = [];
    this.dragonfly = null;
    this.crane = null;
    this.fireflies = [];
    this.nextLeafAt = 9 + rng() * 10;
    this.nextDragonflyAt = 45 + rng() * 40;

    this.mapleShake = new Spring(0, 1.4, 0.18);
    this.flowerBob = new Spring(0, 2.2, 0.15);
    this.emaSwing = new Spring(0, 0.9, 0.12);
    this.snailIn = new Spring(0, 3, 0.7);
    this.snailHideUntil = 0;

    this.shishi = { angle: 18, av: 0, fill: 0, phase: 'filling', fillTime: 12, dripT: 0, pourT: 0 };
    this.shishiTube = $('shishi-tube');

    this.buildPaper();
    this.buildSky();
    this.buildEnso();
    this.buildSand();
    this.buildMaple();
    this.buildFireflies();
    this.zen = new ZenFX({ scene: this, brush: this.brush, reducedMotion });
    this.rake = new SandRake({ canvas: $('sand-canvas'), scene: this, emit: (ev) => this.emit(ev) });
    this.cursorGlow = { x: 0, y: 0, trail: [], on: false, built: false };
    // depth: scenery that stands on the ground, sorted by where it meets the ground
    this.depthEl = $('depth');
    this.sortables = Object.entries(SORT_Y).map(([id, y]) => ({ id, y, el: $(id) })).sort((a, b) => a.y - b.y);
    for (const o of this.sortables) this.depthEl.appendChild(o.el);
    this.konBefore = null;
    this.konAt = { x: 800, y: 826, seat: 'cushion' };
    // camera: pans to follow Kon; far layers drift less (parallax)
    this.camX = 0;
    this.camV = 0;
    this.appliedCamX = null;
    this.captionW = 300;
    this.bindInteractions();
  }

  // ------------------------------------------------------------------ layout
  layout({ keyboard = false } = {}) {
    const W = this.app.clientWidth;
    const H = this.app.clientHeight;
    if (!W || !H) return;
    const aspect = W / H;
    let vb;
    const emaW = (px) => px;
    if (keyboard) {
      // phone keyboard is up: keep Kon's face and the plaque, nothing else
      this.mode = 'compact';
      const emaPx = 132;
      const sc = Math.min(W / 470, (H - emaPx - 24) / (868 - 430));
      const w = W / sc, h = H / sc;
      vb = { x: 800 - w / 2, y: 418, w, h };
    } else if (aspect < 0.9) {
      // portrait: brand on top, Kon in the middle, plaque at the bottom — fit all three
      this.mode = 'tall';
      const fw = aspect > 0.62 ? 700 : 520;
      const emaH = this.ema.offsetHeight || 140;
      const topPad = 80, capH = 46, bottomPad = Math.max(22, H * 0.04);
      const avail = H - topPad - emaH - bottomPad - capH;
      const span = 525; // ensō top → cushion bottom, in world units
      const sc = Math.max(0.3, Math.min(W / fw, avail / span));
      const extra = Math.max(0, avail - span * sc);
      const w = W / sc, h = H / sc;
      vb = { x: 800 - w / 2, y: 340 - (topPad + extra * 0.42) / sc, w, h };
    } else {
      this.mode = 'wide';
      const fx0 = W < 1150 ? 300 : 170;
      const f = { x0: fx0, x1: 1450, y0: 300, y1: 950 };
      let w = f.x1 - f.x0, h = f.y1 - f.y0;
      if (w / h < aspect) w = h * aspect; else h = w / aspect;
      const cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
      vb = { x: cx - w / 2, y: cy - h / 2 - (h - (f.y1 - f.y0)) * 0.08, w, h };
    }
    this.baseVb = vb;
    this.scale = W / vb.w;
    this.paintGrain(W, H);
    this.W = W;
    this.H = H;
    this.rake.layout();
    this.applyView();
  }

  /** Where the camera should be, given where Kon is. */
  cameraTarget() {
    const kx = this.konAt.x - 800;
    if (this.mode === 'wide') return clamp(kx * 0.3, -70, 70);
    return clamp(kx, -470, 370);
  }

  /** Point every layer at the current camera position (cheap; no redraws). */
  applyView() {
    const vb = { ...this.baseVb, x: this.baseVb.x + this.camX };
    this.vb = vb;
    this.appliedCamX = this.camX;
    const vbs = `${f2(vb.x)} ${f2(vb.y)} ${f2(vb.w)} ${f2(vb.h)}`;
    for (const el of [this.back, this.svg, this.glow]) {
      el.setAttribute('viewBox', vbs);
      el.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    }
    // parallax: hills barely move, trees a little, the wall almost with the ground
    const c = this.camX;
    $('sky').setAttribute('transform', `translate(${f2(c * 0.78)} 0)`);
    $('trees').setAttribute('transform', `translate(${f2(c * 0.5)} 0)`);
    $('wall').setAttribute('transform', `translate(${f2(c * 0.15)} 0)`);
    $('moon').setAttribute('transform', `translate(${f2(c * 0.9)} 0)`);
    // the ensō canvas sits between the two SVG layers at world (530, 330, 540 × 540)
    const e = this.toScreen(530, 330);
    const enso = $('enso');
    enso.style.transform = `translate(${f2(e.x)}px, ${f2(e.y)}px) scale(${(540 * this.scale / enso.width).toFixed(4)})`;
    // the maple always leans in from the top-right corner of whatever is visible
    const ms = this.mode === 'wide' ? 1 : 0.7;
    // clear the branding on tall screens; with the keyboard up, lift it out of view
    const drop = this.mode === 'wide' ? 0 : this.mode === 'tall' ? 70 : -260;
    this.maple = { s: ms, x: vb.x + vb.w - ms * 1520, y: vb.y + ms * 20 + drop };
    $('maple').setAttribute('transform', `translate(${f2(this.maple.x)} ${f2(this.maple.y)}) scale(${ms})`);
    PLACES.maple = this.mapleToWorld(1220, 150);
    this.positionOverlays();
    this.zen.layout();
    this.rake.place();
  }

  /** Re-sort Kon among the scenery and remember where Kon is (camera, caption). */
  placeKon(st) {
    this.konAt = st;
    const key = st.seat ? SORT_Y[st.seat] + 0.5 : st.y;
    const next = this.sortables.find((o) => o.y > key);
    const id = next ? next.id : 'end';
    if (id !== this.konBefore) {
      this.konBefore = id;
      const before = next ? next.el : null;
      this.depthEl.insertBefore($('aura'), before);
      this.depthEl.insertBefore($('kon'), before);
    }
  }

  /** The narrator's line follows Kon around, just below its feet. */
  placeCaption() {
    const cap = this.caption;
    const k = this.konAt;
    const ds = depthScale(k.y);
    let p = this.toScreen(k.x, k.y + 74 * ds);
    const half = this.captionW / 2 + 14;
    let x = clamp(p.x, half, this.W - half);
    if (half * 2 > this.W) x = this.W / 2;
    let y = p.y;
    if (this.mode !== 'wide') y = Math.min(y, (this.emaPos ? this.emaPos.y : this.H) - 22);
    y = Math.min(y, this.H - 26);
    cap.style.left = `${f2(x)}px`;
    cap.style.top = `${f2(y)}px`;
  }

  mapleToWorld(x, y) {
    const m = this.maple || { s: 1, x: 0, y: 0 };
    return { x: m.x + m.s * x, y: m.y + m.s * y };
  }

  toScreen(x, y) {
    return { x: (x - this.vb.x) * this.scale, y: (y - this.vb.y) * this.scale };
  }

  toWorld = (cx, cy) => {
    const r = this.app.getBoundingClientRect();
    return { x: this.vb.x + (cx - r.left) / this.scale, y: this.vb.y + (cy - r.top) / this.scale };
  };

  positionOverlays() {
    const s = this.scale;
    const ema = this.ema;
    const cap = this.caption;
    let ui;
    if (this.mode === 'wide') {
      ui = clamp((190 * s) / 250, 0.72, 1.3);
      ema.style.setProperty('--ui-scale', ui.toFixed(3));
      const a = this.toScreen(1300, 646);
      this.emaPos = { x: a.x, y: a.y + 12 * ui, cord: true };
      cap.style.setProperty('--ui-scale', clamp(s, 0.85, 1.3).toFixed(3));
    } else {
      ui = clamp(this.W / 390, 0.92, 1.2);
      ema.style.setProperty('--ui-scale', ui.toFixed(3));
      const emaH = ema.offsetHeight || 140;
      const bottomPad = this.mode === 'compact' ? 10 : Math.max(22, this.H * 0.04);
      const top = this.H - emaH - bottomPad;
      this.emaPos = { x: this.W / 2, y: top, cord: false };
      cap.style.setProperty('--ui-scale', '0.92');
    }
    ema.classList.toggle('no-cord', !this.emaPos.cord);
    const inp = ema.querySelector('input');
    inp.placeholder = 250 * ui < 215 ? 'Kon won’t peek…' : 'Kon promises not to peek…';
    this.placeEma(0);
    this.placeCaption();
  }

  placeEma(swing) {
    const p = this.emaPos;
    if (!p) return;
    this.ema.style.transform = `translate(${f2(p.x)}px, ${f2(p.y)}px) translateX(-50%) rotate(${f2(swing)}deg)`;
  }

  /** World-space span of the text line inside the plaque, for Kon's eyes. */
  inputSpan = () => {
    const r = (this._inputRect && this._inputRectAt > this.t - 0.5) ? this._inputRect : this.measureInput();
    return r;
  };

  measureInput() {
    const el = this.ema.querySelector('input');
    const b = el.getBoundingClientRect();
    const a = this.app.getBoundingClientRect();
    const w0 = this.toWorldLocal(b.left - a.left + 8, b.top - a.top + b.height * 0.55);
    const w1 = this.toWorldLocal(b.right - a.left - 8, b.top - a.top + b.height * 0.55);
    this._inputRect = { x0: w0.x, x1: w1.x, y: w0.y };
    this._inputRectAt = this.t;
    return this._inputRect;
  }

  toWorldLocal(px, py) {
    return { x: this.vb.x + px / this.scale, y: this.vb.y + py / this.scale };
  }

  // ------------------------------------------------------------------ generated art
  buildPaper() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const img = g.createImageData(256, 256);
    const rng = makeRng(7);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 200 + rng() * 55;
      img.data[i] = v;
      img.data[i + 1] = v * 0.97;
      img.data[i + 2] = v * 0.92;
      img.data[i + 3] = rng() < 0.5 ? 20 : 8;
    }
    g.putImageData(img, 0, 0);
    // a few paper fibres
    g.strokeStyle = 'rgba(120, 90, 60, .08)';
    g.lineWidth = 0.8;
    for (let i = 0; i < 70; i++) {
      const x = rng() * 256, y = rng() * 256, a = rng() * TAU, l = 6 + rng() * 18;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 0.4) * l * 0.5, y + Math.sin(a + 0.4) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    this.grainTile = c;
  }

  paintGrain(W, H) {
    const cv = $('grain');
    if (!cv || (cv.width === W && cv.height === H)) return;
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = g.createPattern(this.grainTile, 'repeat');
    g.fillRect(0, 0, W, H);
  }

  buildSky() {
    const host = $('sky');
    const ridge = (seed, base, amp, cls, step = 30) => {
      let d = `M -1500,560 L -1500,${base}`;
      for (let x = -1500; x <= 3100; x += step) {
        const n = 0.5 + 0.5 * noise1(x * 0.0019, seed);
        const peak = Math.pow(Math.max(0, noise1(x * 0.0047, seed + 3)), 1.6);
        d += ` L ${x},${f2(base - amp * (0.35 + 0.65 * n) - amp * 0.8 * peak)}`;
      }
      make('path', { d: d + ' L 3100,560 Z', class: cls }, host);
    };
    ridge(4, 440, 120, 'hill-far');
    make('path', { d: 'M -1500,372 Q 300,352 1100,368 T 3100,360 L 3100,384 Q 1700,396 900,388 T -1500,392 Z', class: 'mist' }, host);
    ridge(9, 470, 90, 'hill-near', 26);
    make('path', { d: 'M -1500,428 Q 500,414 1300,428 T 3100,420 L 3100,446 Q 1800,456 1000,446 T -1500,450 Z', class: 'mist' }, host);
  }

  buildEnso() {
    const c = $('enso');
    this.brush = new EnsoBrush(c.width);
    this.brush.paintAll(c.getContext('2d'));
  }

  buildSand() {
    const rake = $('rake');
    const rings = $('rings');
    let dS = '', dH = '';
    let y = 712;
    while (y < 1700) {
      const gap = 9.5 + (y - 700) * 0.017;
      let s = '', h = '';
      for (let x = -1500; x <= 3100; x += 50) {
        const yy = y + Math.sin(x * 0.0042 + y * 0.07) * 1.5 + Math.sin(x * 0.013) * 0.4;
        s += (x === -1500 ? 'M' : 'L') + `${x},${f2(yy)} `;
        h += (x === -1500 ? 'M' : 'L') + `${x},${f2(yy - 1.8)} `;
      }
      dS += s;
      dH += h;
      y += gap;
    }
    make('path', { d: dS, class: 'rake-shadow' }, rake);
    make('path', { d: dH, class: 'rake-hi' }, rake);

    const zones = [
      { cx: 330, cy: 816, rx: 142, n: 4 },
      { cx: 1300, cy: 838, rx: 150, n: 3 },
      { cx: 800, cy: 832, rx: 186, n: 5 },
      { cx: 1079, cy: 894, rx: 84, n: 4 },
      { cx: 470, cy: 912, rx: 88, n: 4 },
      { cx: 630, cy: 914, rx: 40, n: 2 },
    ];
    for (const z of zones) {
      const outer = z.rx + z.n * 15 + 6;
      make('ellipse', { cx: z.cx, cy: z.cy, rx: outer, ry: outer * 0.2, class: 'c-sand' }, rings);
      let ds = '', dh = '';
      for (let i = 0; i < z.n; i++) {
        const rx = z.rx + i * 15;
        const ry = rx * 0.2;
        ds += `M ${z.cx - rx},${z.cy} a ${rx},${ry} 0 1 0 ${rx * 2},0 a ${rx},${ry} 0 1 0 ${-rx * 2},0 `;
        dh += `M ${z.cx - rx},${z.cy - 1.8} a ${rx},${ry} 0 1 0 ${rx * 2},0 a ${rx},${ry} 0 1 0 ${-rx * 2},0 `;
      }
      make('path', { d: ds, class: 'rake-shadow' }, rings);
      make('path', { d: dh, class: 'rake-hi' }, rings);
    }
  }

  leafPath(r) {
    const lobes = [[-196, 0.55], [-140, 0.84], [-90, 1], [-40, 0.84], [16, 0.55]];
    const pts = [];
    pts.push([0, r * 0.18]);
    for (let i = 0; i < lobes.length; i++) {
      const [a, l] = lobes[i];
      const ar = a * DEG;
      if (i > 0) {
        const mid = ((lobes[i - 1][0] + a) / 2) * DEG;
        pts.push([Math.cos(mid) * r * 0.3, Math.sin(mid) * r * 0.3]);
      }
      pts.push([Math.cos(ar - 0.16) * r * l * 0.7, Math.sin(ar - 0.16) * r * l * 0.7]);
      pts.push([Math.cos(ar) * r * l, Math.sin(ar) * r * l]);
      pts.push([Math.cos(ar + 0.16) * r * l * 0.7, Math.sin(ar + 0.16) * r * l * 0.7]);
    }
    let d = `M ${f2(pts[0][0])},${f2(pts[0][1])}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${f2(pts[i][0])},${f2(pts[i][1])}`;
    d += ' Z';
    let v = '';
    for (const [a, l] of lobes) v += `M 0,${f2(r * 0.1)} L ${f2(Math.cos(a * DEG) * r * l * 0.8)},${f2(Math.sin(a * DEG) * r * l * 0.8)} `;
    v += `M 0,${f2(r * 0.18)} q 2,${f2(r * 0.3)} -1,${f2(r * 0.55)}`;
    return { d, v };
  }

  makeLeaf(parent, r, color) {
    const g = make('g', {}, parent);
    const { d, v } = this.leafPath(r);
    make('path', { d, class: 'leaf', style: `fill:${color}` }, g);
    make('path', { d: v, class: 'leaf-vein' }, g);
    return g;
  }

  buildMaple() {
    const host = $('maple-leaves');
    const rng = makeRng(11);
    const clusters = [
      [1078, 186], [1112, 160], [1150, 178], [1196, 130], [1240, 150], [1290, 182], [1318, 112],
      [1372, 92], [1430, 70], [1478, 150], [1520, 40], [1122, 94], [1176, 98], [1590, 22], [1660, -10], [1336, 170],
    ];
    this.mapleLeaves = [];
    this.mapleSpots = clusters;
    for (const [cx, cy] of clusters) {
      const n = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const x = cx + (rng() * 2 - 1) * 26;
        const y = cy + (rng() * 2 - 1) * 18;
        const r = 13 + rng() * 9;
        const g = this.makeLeaf(host, r, LEAF_COLORS[Math.floor(rng() * LEAF_COLORS.length)]);
        const rot = rng() * 360;
        this.mapleLeaves.push({ g, x, y, rot, seed: rng() * 10 });
        g.setAttribute('transform', `translate(${f2(x)} ${f2(y)}) rotate(${f2(rot)})`);
      }
    }
  }

  buildFireflies() {
    const host = $('fireflies');
    const rng = makeRng(23);
    for (let i = 0; i < 14; i++) {
      const el = make('circle', { r: 9, fill: 'url(#firefly)' }, host);
      this.fireflies.push({
        el,
        x: 150 + rng() * 1300,
        y: 560 + rng() * 380,
        seed: rng() * 100,
        speed: 0.15 + rng() * 0.2,
      });
    }
  }

  // ------------------------------------------------------------------ interactions
  bindInteractions() {
    const stop = (e) => e.stopPropagation();
    // raking: press on open sand and drag
    this.app.addEventListener('pointerdown', (e) => {
      if (this.rake.tryBegin(e, this.toWorld(e.clientX, e.clientY))) {
        try { this.app.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      }
    });
    this.app.addEventListener('pointermove', (e) => {
      if (this.rake.active) this.rake.extend(e, this.toWorld(e.clientX, e.clientY));
    });
    const endRake = (e) => { if (this.rake.active) this.rake.end(e); };
    this.app.addEventListener('pointerup', endRake);
    this.app.addEventListener('pointercancel', endRake);
    $('lantern').addEventListener('click', () => this.toggleNight());
    $('shishi').addEventListener('click', () => this.tipShishi(true));
    $('maple').addEventListener('click', (e) => {
      const w = this.toWorld(e.clientX, e.clientY);
      this.shakeMaple(w);
    });
    $('maple').addEventListener('pointerenter', () => { this.mapleShake.v += 0.6; });
    $('flower').addEventListener('pointerenter', () => this.pokeFlower(0.6));
    $('flower').addEventListener('click', () => this.pokeFlower(1));
    $('snail').addEventListener('click', (e) => {
      stop(e);
      this.hideSnail();
      this.emit({ type: 'notice', x: PLACES.snail.x, y: PLACES.snail.y });
      this.emit({ type: 'sfx', name: 'boop' });
    });
    const keyClick = (id, fn) => {
      const el = $(id);
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
      });
    };
    keyClick('lantern', () => this.toggleNight());
    keyClick('shishi', () => this.tipShishi(true));
    keyClick('maple', () => this.shakeMaple(null));
  }

  toggleNight(force) {
    this.night = force ?? !this.night;
    document.body.classList.toggle('is-night', this.night);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', this.night ? '#2a2f4a' : '#f1e7d3');
    this.emit({ type: 'night', on: this.night });
    this.emit({ type: 'sfx', name: 'lantern' });
  }

  tipShishi(user) {
    const sh = this.shishi;
    if (sh.phase === 'filling') {
      sh.fill = 1;
      sh.user = user;
    } else if (sh.phase === 'returning' && user) {
      sh.av -= 30;
    }
  }

  shakeMaple(at) {
    this.mapleShake.v += 2.4;
    this.emit({ type: 'sfx', name: 'leaves' });
    const n = 3 + Math.floor(this.rng() * 3);
    for (let i = 0; i < n; i++) {
      const sp = this.mapleSpots[Math.floor(this.rng() * this.mapleSpots.length)];
      const spot = this.mapleToWorld(sp[0], sp[1]);
      const x = at && i === 0 ? at.x : spot.x;
      const y = at && i === 0 ? at.y : spot.y;
      this.dropLeaf(x + (this.rng() * 2 - 1) * 20, y, i * 0.12);
    }
  }

  dropLeaf(x, y, delay = 0) {
    if (this.leaves.length > 18) {
      const old = this.leaves.find((l) => l.landed);
      if (old) { old.g.remove(); this.leaves.splice(this.leaves.indexOf(old), 1); } else return;
    }
    const color = LEAF_COLORS[Math.floor(this.rng() * LEAF_COLORS.length)];
    const g = this.makeLeaf($('leaves-fx'), 12 + this.rng() * 7, color);
    g.style.opacity = delay > 0 ? '0' : '1';
    // land in front of Kon's cushion, never behind it
    let landY = 868 + this.rng() * 110;
    this.leaves.push({
      g, x, y, vx: (this.rng() * 2 - 1) * 14 - 8, vy: 0, rot: this.rng() * 360,
      seed: this.rng() * 10, delay, landY, landed: false, landedAt: 0, id: 'leaf' + Math.floor(this.rng() * 1e6),
      born: this.t,
    });
  }

  hideSnail() {
    this.snailHideUntil = this.t + 3.2;
  }

  pokeFlower(k = 1) {
    this.flowerBob.v += 120 * k * (this.rng() < 0.5 ? -1 : 1);
  }

  nudgeEma(k = 1) {
    this.emaSwing.v += (this.rng() < 0.5 ? -1 : 1) * 14 * k;
  }

  spawnDragonfly() {
    if (this.dragonfly || this.reduced) return;
    const g = make('g', { class: 'dragonfly' }, $('fx-world'));
    const wings = make('g', {}, g);
    const w1 = make('ellipse', { cx: -2, cy: -11, rx: 4.5, ry: 12, class: 'dragonfly-wing', transform: 'rotate(-20)' }, wings);
    const w2 = make('ellipse', { cx: -2, cy: 11, rx: 4.5, ry: 12, class: 'dragonfly-wing', transform: 'rotate(20)' }, wings);
    const w3 = make('ellipse', { cx: 5, cy: -10, rx: 4, ry: 11, class: 'dragonfly-wing', transform: 'rotate(15)' }, wings);
    const w4 = make('ellipse', { cx: 5, cy: 10, rx: 4, ry: 11, class: 'dragonfly-wing', transform: 'rotate(-15)' }, wings);
    make('path', { d: 'M -28,0 L 4,0', class: 'dragonfly-body' }, g);
    make('circle', { cx: 8, cy: 0, r: 4.2, class: 'dragonfly-head' }, g);
    const fromLeft = this.rng() < 0.5;
    const sx = fromLeft ? this.vb.x - 60 : this.vb.x + this.vb.w + 60;
    const head = { x: 800, y: 620 };
    const side = fromLeft ? -1 : 1;
    this.dragonfly = {
      g, wings: [w1, w2, w3, w4],
      x: sx, y: 380 + this.rng() * 120,
      vx: 0, vy: 0, t: 0,
      way: [
        { x: head.x + side * 230, y: head.y - 170, hold: 1.6 },
        { x: head.x - side * 60, y: head.y - 230, hold: 1.4 },
        { x: head.x + side * 140, y: head.y - 120, hold: 1.0 },
        { x: fromLeft ? this.vb.x + this.vb.w + 120 : this.vb.x - 120, y: 300, hold: 0 },
      ],
      wi: 0, holdT: 0, seed: this.rng() * 10,
    };
  }

  launchCrane() {
    if (this.crane) this.crane.g.remove();
    const g = make('g', {}, $('fx-world'));
    const wingBack = make('path', { d: 'M 0,0 L -8,-30 L 14,-4 Z', class: 'crane-fold' }, g);
    make('path', { d: 'M -26,4 L 0,-6 L 24,2 L 4,10 Z', class: 'crane-body' }, g);
    make('path', { d: 'M 20,2 L 34,-18 L 30,-20 L 40,-22 L 36,-16 L 24,4 Z', class: 'crane-body' }, g);
    make('path', { d: 'M -22,4 L -40,-14 L -16,0 Z', class: 'crane-body' }, g);
    const wing = make('path', { d: 'M -4,0 L -18,-34 L 12,-3 Z', class: 'crane-body' }, g);
    let start = { x: 1300, y: 720 };
    if (this.mode !== 'wide') {
      const r = this.ema.getBoundingClientRect();
      const a = this.app.getBoundingClientRect();
      start = this.toWorldLocal(r.left - a.left + r.width / 2, r.top - a.top + r.height * 0.4);
    }
    this.crane = { g, wing, wingBack, t: 0, dur: 4.2, x: start.x, y: start.y, p0: start, p1: { x: start.x - 120, y: start.y - 420 }, p2: { x: 760, y: 120 }, p3: { x: 380, y: -320 } };
    this.emit({ type: 'sfx', name: 'chime' });
  }

  /** Kon's sand doodle "while you were away" — placed in open sand in front of the cushion. */
  rakeDoodle(kind) {
    const at = this.mode === 'wide' ? { x: 800, y: 968, s: 1 } : { x: 800, y: 882, s: 0.75 };
    this.rake.doodle(kind, at.x, at.y, at.s);
    PLACES.doodle = { x: at.x, y: at.y };
  }

  /** Follow the visitor's local time: dawn, day, dusk or night. */
  setTimeOfDay(hour) {
    const night = hour < 5.5 || hour >= 19;
    const dusk = hour >= 17 && hour < 19;
    const dawn = hour >= 5.5 && hour < 7.5;
    document.body.classList.toggle('is-dusk', dusk);
    document.body.classList.toggle('is-dawn', dawn);
    if (night && !this.night) {
      this.night = true;
      document.body.classList.add('is-night');
      document.querySelector('meta[name="theme-color"]').setAttribute('content', '#2a2f4a');
    }
    return night ? 'night' : dusk ? 'dusk' : dawn ? 'dawn' : 'day';
  }

  /** At night the cursor becomes a firefly, trailing a little light. */
  updateCursor(dt, pointer) {
    const cg = this.cursorGlow;
    if (!this.night || !pointer.present || pointer.isTouch) {
      if (cg.on) { $('cursor-firefly').style.display = 'none'; cg.on = false; }
      return;
    }
    if (!cg.built) {
      const host = $('cursor-firefly');
      for (let i = 0; i < 6; i++) {
        const el = make('circle', { r: f2(10 - i * 1.3), fill: 'url(#firefly)' }, host);
        cg.trail.push({ el, x: pointer.x, y: pointer.y });
      }
      cg.built = true;
    }
    if (!cg.on) { $('cursor-firefly').style.display = ''; cg.on = true; }
    let tx = pointer.x, ty = pointer.y;
    cg.trail.forEach((d, i) => {
      const k = 1 - Math.exp(-dt * (28 - i * 3.6));
      d.x += (tx - d.x) * k;
      d.y += (ty - d.y) * k;
      d.el.setAttribute('cx', f2(d.x));
      d.el.setAttribute('cy', f2(d.y));
      d.el.style.opacity = f2((0.95 - i * 0.13) * (0.8 + 0.2 * Math.sin(this.t * 7 + i)));
      tx = d.x; ty = d.y;
    });
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    this.t += dt;
    const t = this.t;
    this.rake.update(dt);
    // camera follows Kon (critically damped, so it never overshoots)
    if (this.baseVb) {
      const w = 2 * Math.PI * 0.45;
      const target = this.reduced ? Math.round(this.cameraTarget() / 120) * 120 : this.cameraTarget();
      this.camV += (w * w * (target - this.camX) - 2 * w * this.camV) * dt;
      this.camX += this.camV * dt;
      if (this.appliedCamX === null || Math.abs(this.camX - this.appliedCamX) > 0.03) this.applyView();
      else this.placeCaption();
    }
    this.updateShishi(dt);
    this.updateMaple(dt);
    this.updateLeaves(dt);
    this.updateDragonfly(dt);
    this.updateCrane(dt);
    if (this.night) this.updateFireflies(dt);

    // flower
    const fb = this.flowerBob.step(dt, 0);
    $('flower-stem').setAttribute('transform', `translate(660 826) rotate(${f2(fb * 0.12 + Math.sin(t * 1.1) * 1.2)})`);
    $('flower-head').setAttribute('transform', `translate(10 -54) rotate(${f2(fb * 0.3)})`);

    // ema
    const sw = this.emaSwing.step(dt, 0);
    this.placeEma(clamp(sw, -12, 12) + Math.sin(t * 0.8) * 0.5);

    // snail
    const sn = this.snailIn.step(dt, t < this.snailHideUntil ? 1 : 0);
    const crawl = Math.sin(t * 0.3) * 0.5;
    $('snail-body').setAttribute('transform', `translate(${f2(-sn * 6 + crawl)} 0) scale(${f2(1 - sn * 0.75)} ${f2(1 - sn * 0.4)})`);

    // lantern flicker
    if (this.night) {
      const fl = 0.85 + 0.1 * noise1(t * 3.1) + 0.05 * noise1(t * 11, 3);
      $('lantern-halo').setAttribute('r', f2(230 + fl * 20));
      $('lantern-halo').style.opacity = f2(fl);
    }

    // auto events
    if (t > this.nextLeafAt) {
      const sp = this.mapleSpots[Math.floor(this.rng() * this.mapleSpots.length)];
      const spot = this.mapleToWorld(sp[0], sp[1]);
      if (spot.x > this.vb.x && spot.x < this.vb.x + this.vb.w) this.dropLeaf(spot.x, spot.y);
      this.nextLeafAt = t + 16 + this.rng() * 18;
    }
    if (t > this.nextDragonflyAt) {
      this.spawnDragonfly();
      this.nextDragonflyAt = t + 55 + this.rng() * 50;
    }
  }

  updateShishi(dt) {
    const sh = this.shishi;
    if (sh.phase === 'filling') {
      sh.fill += dt / sh.fillTime;
      sh.angle = lerp(sh.angle, 18 - sh.fill * 7, 1 - Math.exp(-dt * 4));
      sh.dripT -= dt;
      if (sh.dripT <= 0) {
        this.spawnDrop(440, 812, 440, 832 - sh.fill * 2);
        sh.dripT = 0.32;
      }
      if (sh.fill >= 1) { sh.phase = 'pouring'; sh.av = 0; }
    } else if (sh.phase === 'pouring') {
      sh.av -= 520 * dt;
      sh.angle += sh.av * dt;
      if (sh.angle <= -14) {
        sh.angle = -14;
        sh.av = 0;
        sh.pourT += dt;
        if (sh.pourT < dt * 1.5) {
          for (let i = 0; i < 6; i++) this.spawnDrop(432 + this.rng() * 10, 896, 440 + (this.rng() * 2 - 1) * 30, 888, true);
          this.emit({ type: 'sfx', name: 'pour' });
        }
        if (sh.pourT > 0.45) { sh.phase = 'returning'; sh.pourT = 0; sh.fill = 0; }
      }
    } else if (sh.phase === 'returning') {
      sh.av += 900 * dt;
      sh.angle += sh.av * dt;
      if (sh.angle >= 18) {
        sh.angle = 18;
        const impact = sh.av;
        sh.av = -sh.av * 0.28;
        if (impact > 60) {
          this.emit({ type: 'clack', x: 630, y: 890, user: !!sh.user });
          this.emit({ type: 'sfx', name: 'clack', k: clamp(impact / 400) });
          sh.user = false;
        }
        if (Math.abs(sh.av) < 30) {
          sh.phase = 'filling';
          sh.av = 0;
          sh.fillTime = 11 + this.rng() * 7;
        }
      }
    }
    this.shishiTube.setAttribute('transform', `translate(560 870) rotate(${f2(sh.angle)})`);
    // drops
    for (let i = this.waterDrops.length - 1; i >= 0; i--) {
      const d = this.waterDrops[i];
      d.t += dt;
      d.vy += 900 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y >= d.ty || d.t > 1.5) {
        d.el.remove();
        this.waterDrops.splice(i, 1);
        continue;
      }
      d.el.setAttribute('transform', `translate(${f2(d.x)} ${f2(d.y)})`);
    }
    const rip = $('basin-ripple');
    rip.setAttribute('transform', `translate(0 ${f2(Math.sin(this.t * 1.7) * 0.8)})`);
  }

  spawnDrop(x, y, tx, ty, splash = false) {
    if (this.waterDrops.length > 16) return;
    const el = make('ellipse', { rx: splash ? 2.4 : 2, ry: splash ? 2.4 : 3, class: 'water-drop' }, $('water-fx'));
    this.waterDrops.push({ el, x, y, vx: splash ? (tx - x) * 2 : 0, vy: splash ? -120 - this.rng() * 80 : 0, ty: splash ? ty + 6 : ty, t: 0 });
  }

  updateMaple(dt) {
    const sk = this.mapleShake.step(dt, 0);
    const t = this.t;
    const sway = Math.sin(t * 0.55) * 0.35 + sk * 1.6;
    $('maple-sway').setAttribute('transform', `rotate(${f2(sway)} 1760 -60)`);
    if (this.reduced) return;
    for (const L of this.mapleLeaves) {
      const r = L.rot + Math.sin(t * 1.6 + L.seed) * 4 + sk * 14 * Math.sin(L.seed * 3);
      L.g.setAttribute('transform', `translate(${f2(L.x)} ${f2(L.y)}) rotate(${f2(r)})`);
    }
  }

  updateLeaves(dt) {
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const L = this.leaves[i];
      if (L.delay > 0) {
        L.delay -= dt;
        if (L.delay <= 0) L.g.style.opacity = '1';
        continue;
      }
      if (!L.landed) {
        const tt = this.t + L.seed;
        L.vy = lerp(L.vy, 62 + Math.sin(tt * 2.2) * 26, 1 - Math.exp(-dt * 3));
        L.x += (L.vx + Math.sin(tt * 1.7) * 38) * dt;
        L.y += L.vy * dt;
        L.rot += Math.sin(tt * 1.3) * 90 * dt;
        if (L.y >= L.landY) {
          L.landed = true;
          L.landedAt = this.t;
        }
        L.g.setAttribute('transform', `translate(${f2(L.x)} ${f2(L.y)}) rotate(${f2(L.rot)}) scale(1 ${f2(0.75 + 0.25 * Math.sin(tt * 3))})`);
      } else {
        const age = this.t - L.landedAt;
        if (age < 0.4) L.g.setAttribute('transform', `translate(${f2(L.x)} ${f2(L.y)}) rotate(${f2(L.rot)}) scale(1 ${f2(lerp(0.75, 0.5, age / 0.4))})`);
        if (age > 16) L.g.style.opacity = f2(1 - (age - 16) / 2);
        if (age > 18) {
          L.g.remove();
          this.leaves.splice(i, 1);
        }
      }
    }
  }

  updateDragonfly(dt) {
    const d = this.dragonfly;
    if (!d) return;
    d.t += dt;
    const w = d.way[d.wi];
    const jx = noise1(d.t * 1.8, d.seed) * 26, jy = noise1(d.t * 2.1, d.seed + 5) * 18;
    const tx = w.x + jx, ty = w.y + jy;
    const k = 5.5;
    d.vx += ((tx - d.x) * k * k - 2 * 0.85 * k * d.vx) * dt;
    d.vy += ((ty - d.y) * k * k - 2 * 0.85 * k * d.vy) * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (Math.hypot(w.x - d.x, w.y - d.y) < 40) {
      d.holdT += dt;
      if (d.holdT > w.hold) {
        d.holdT = 0;
        d.wi++;
        if (d.wi >= d.way.length) {
          d.g.remove();
          this.dragonfly = null;
          return;
        }
      }
    }
    const ang = Math.atan2(d.vy, d.vx) / DEG;
    const flap = 0.35 + 0.65 * Math.abs(Math.sin(d.t * 55));
    for (const wg of d.wings) wg.setAttribute('ry', f2(12 * flap));
    d.g.setAttribute('transform', `translate(${f2(d.x)} ${f2(d.y)}) rotate(${f2(Math.abs(d.vx) + Math.abs(d.vy) > 40 ? ang : 0)})`);
  }

  updateCrane(dt) {
    const c = this.crane;
    if (!c) return;
    c.t += dt;
    const u = clamp(c.t / c.dur);
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const b = (a, b2, c2, d2, t) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b2 + 3 * (1 - t) * t * t * c2 + t ** 3 * d2;
    const x = b(c.p0.x, c.p1.x, c.p2.x, c.p3.x, e);
    const y = b(c.p0.y, c.p1.y, c.p2.y, c.p3.y, e);
    const flap = Math.sin(c.t * 9);
    c.wing.setAttribute('transform', `scale(1 ${f2(flap)})`);
    c.wingBack.setAttribute('transform', `scale(1 ${f2(-flap * 0.8)})`);
    const sc = lerp(0.5, 1.3, smoothstep(0, 0.15, u)) * lerp(1, 0.7, u);
    c.g.setAttribute('transform', `translate(${f2(x)} ${f2(y)}) scale(${f2(-sc)} ${f2(sc)})`);
    c.x = x;
    c.y = y;
    if (u >= 1) {
      c.g.remove();
      this.crane = null;
    }
  }

  updateFireflies(dt) {
    const t = this.t;
    for (const f of this.fireflies) {
      const x = f.x + noise1(t * f.speed, f.seed) * 90;
      const y = f.y + noise1(t * f.speed * 1.2, f.seed + 9) * 60;
      const on = 0.25 + 0.75 * Math.max(0, Math.sin(t * 1.3 + f.seed));
      f.el.setAttribute('cx', f2(x));
      f.el.setAttribute('cy', f2(y));
      f.el.style.opacity = f2(on);
    }
  }

  /** Things in the garden that might catch Kon's eye this frame. */
  objects() {
    const out = [];
    if (this.crane && Number.isFinite(this.crane.x)) out.push({ id: 'crane', kind: 'crane', x: this.crane.x, y: this.crane.y, sal: 1.5 });
    if (this.dragonfly) {
      const d = this.dragonfly;
      if (d.x > this.vb.x - 20 && d.x < this.vb.x + this.vb.w + 20) out.push({ id: 'dragonfly', kind: 'dragonfly', x: d.x, y: d.y, sal: 0.72 });
    }
    let newest = null;
    for (const L of this.leaves) {
      if (L.landed || L.delay > 0) continue;
      if (!newest || L.born > newest.born) newest = L;
    }
    if (newest && newest.y > this.vb.y) out.push({ id: newest.id, kind: 'leaf', x: newest.x, y: newest.y, sal: 0.48 });
    // leaves lying on the sand: not eye-catching, but Kon may go and pounce on one
    for (const L of this.leaves) {
      if (L.landed && this.t - L.landedAt < 14 && !L.scattered) out.push({ id: L.id, kind: 'leafGround', x: L.x, y: L.y, sal: 0.05 });
    }
    return out;
  }

  /** Kon landed on a leaf: it flies up and flutters down again a little way off. */
  scatterLeaf(id) {
    const L = this.leaves.find((l) => l.id === id);
    if (!L) return;
    L.landed = false;
    L.scattered = true;
    L.vy = -170;
    L.vx = (this.rng() * 2 - 1) * 60;
    L.landY = Math.min(990, L.y + 10 + this.rng() * 30);
  }
}
