// Scene — the garden around Kon: framing for any screen shape, the camera
// (parallax and following Kon), depth sorting so Kon walks behind and in front
// of things, and the HTML overlays (plaque, caption). Generated art lives in
// art.js, interactive props in props.js, raking in rake.js, the live ensō in zen.js.

import { Spring, clamp } from '../math.js';
import { mixin, $, f2 } from '../util.js';
import { SORT_Y, depthScale, PLACES } from './world.js';
import { ZenFX } from './zen.js';
import { SandRake } from './rake.js';
import { GardenArt } from './art.js';
import { GardenProps } from './props.js';

export { PLACES };

export class Scene {
  toWorld = (cx, cy) => {
    const r = this.app.getBoundingClientRect();
    return { x: this.vb.x + (cx - r.left) / this.scale, y: this.vb.y + (cy - r.top) / this.scale };
  };
  inputSpan = () => {
    const r = (this._inputRect && this._inputRectAt > this.t - 0.5) ? this._inputRect : this.measureInput();
    return r;
  };

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

    this.buildSky();
    this.buildEnso();
    this.buildSand();
    this.buildMaple();
    this.buildFireflies();
    this.zen = new ZenFX({ scene: this, brush: this.brush, reducedMotion, rng });
    this.rake = new SandRake({ canvas: $('sand-canvas'), scene: this, emit: (ev) => this.emit(ev) });
    this.cursorGlow = { x: 0, y: 0, trail: [], on: false, built: false };
    // depth: scenery that stands on the ground, sorted by where it meets the ground
    this.depthEl = $('depth');
    this.sortables = Object.entries(SORT_Y).map(([id, y]) => ({ id, y, el: $(id) })).sort((a, b) => a.y - b.y);
    for (const o of this.sortables) this.depthEl.appendChild(o.el);
    this.depthSig = '';
    this.auraEl = $('aura');
    this.konEl = $('kon');
    this.visitor = null;
    this.konAt = { x: 800, y: 826, seat: 'cushion' };
    // camera: pans to follow Kon; far layers drift less (parallax)
    this.camX = 0;
    this.camV = 0;
    this.worldLayers = $('world-layers');
    this.farLayers = { hills: $('layer-hills'), trees: $('layer-trees'), wall: $('layer-wall') };
    this.layers = [this.back, this.svg, this.glow, ...Object.values(this.farLayers)];
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
    this.camMargin = this.mode === 'wide' ? 90 : 490;
    this.viewDirty = true;
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
    const S = this.scale;
    if (this.viewDirty) {
      // every layer is wider than the screen by the camera's range on each side
      // (a whole number of pixels, so the art stays on the same pixel grid as before)
      const b = this.baseVb, mpx = Math.round(this.camMargin * S), M = mpx / S;
      const vbs = `${(b.x - M).toFixed(4)} ${f2(b.y)} ${(b.w + 2 * M).toFixed(4)} ${f2(b.h)}`;
      for (const el of this.layers) {
        el.setAttribute('viewBox', vbs);
        el.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        el.style.left = `${-mpx}px`;
        el.style.width = `${this.W + 2 * mpx}px`;
      }
      // canvases inside the moving world layer sit at their base (camera 0) positions
      const e = this.baseToScreen(530, 330);
      const enso = $('enso');
      enso.style.transform = `translate(${f2(e.x)}px, ${f2(e.y)}px) scale(${(540 * S / enso.width).toFixed(4)})`;
      this.zen.layout();
      this.rake.place();
      this.placeMaple();
      this.viewDirty = false;
    }
    // the camera: composited transforms only — far layers drift less (parallax)
    const px = -this.camX * S;
    const slide = (k) => `translate3d(${f2(px * k)}px, 0, 0)`;
    this.worldLayers.style.transform = slide(1);
    this.glow.style.transform = slide(1);
    this.farLayers.hills.style.transform = slide(0.22);
    this.farLayers.trees.style.transform = slide(0.5);
    this.farLayers.wall.style.transform = slide(0.85);
    $('moon').setAttribute('transform', `translate(${f2(this.camX * 0.9)} 0)`);
    PLACES.maple = this.mapleToWorld(1220, 150);
    this.positionOverlays();
    this.zen.placeSeal();
  }

  /**
   * The maple leans in from the top-right corner of the screen, on its own layer
   * (whose user space is the base view: the camera never moves it).
   */
  placeMaple() {
    const b = this.baseVb;
    const ms = this.mode === 'wide' ? 1 : 0.7;
    // clear the branding on tall screens; with the keyboard up, lift it out of view
    const drop = this.mode === 'wide' ? 0 : this.mode === 'tall' ? 70 : -260;
    this.maple = { s: ms, x: b.x + b.w - ms * 1520, y: b.y + ms * 20 + drop };
    const layer = $('layer-maple');
    layer.setAttribute('viewBox', `${f2(b.x)} ${f2(b.y)} ${f2(b.w)} ${f2(b.h)}`);
    $('maple').setAttribute('transform', `translate(${f2(this.maple.x)} ${f2(this.maple.y)}) scale(${ms})`);
    // the branch sways around where it enters the screen
    const pivot = this.baseToScreen(this.maple.x + ms * 1760, this.maple.y - ms * 60);
    layer.style.transformOrigin = `${f2(pivot.x)}px ${f2(pivot.y)}px`;
  }

  /**
   * Put Kon's speech bubble beside its head: try up-right, up-left, then the
   * sides, keeping clear of the caption, branding, buttons and plaque.
   * @param size  [width, height] of the bubble in px (measured when the text changes)
   */
  placeBubble(el, headWorld, konScale, size) {
    const h = this.toScreen(headWorld.x, headWorld.y);
    const R = 92 * konScale * this.scale;           // about the head's radius on screen
    const [bw, bh] = size;
    const pad = 8;
    const avoid = this.protectedRects();
    const fits = (x, y) => x >= pad && y >= pad && x + bw <= this.W - pad && y + bh <= this.H - pad;
    const clear = (x, y) => !avoid.some((r) => x < r.right && x + bw > r.left && y < r.bottom && y + bh > r.top);
    const cands = [
      { x: h.x + R * 0.45, y: h.y - R * 1.15 - bh, tail: 'tail-left' },
      { x: h.x - R * 0.45 - bw, y: h.y - R * 1.15 - bh, tail: 'tail-right' },
      { x: h.x + R * 1.05, y: h.y - R * 0.6 - bh, tail: 'tail-left' },
      { x: h.x - R * 1.05 - bw, y: h.y - R * 0.6 - bh, tail: 'tail-right' },
      { x: h.x + R * 1.1, y: h.y + R * 0.1, tail: 'tail-left below' },
      { x: h.x - R * 1.1 - bw, y: h.y + R * 0.1, tail: 'tail-right below' },
    ];
    let pick = cands.find((c) => fits(c.x, c.y) && clear(c.x, c.y)) || cands.find((c) => fits(c.x, c.y)) || cands[0];
    const x = Math.min(Math.max(pick.x, pad), this.W - bw - pad);
    const y = Math.min(Math.max(pick.y, pad), this.H - bh - pad);
    el.style.left = `${f2(x)}px`;
    el.style.top = `${f2(y)}px`;
    if (el.dataset.tail !== pick.tail) {
      el.classList.remove('tail-left', 'tail-right', 'below');
      el.classList.add(...pick.tail.split(' '));
      el.dataset.tail = pick.tail;
    }
    this.bubbleRect = { left: x, top: y, right: x + bw, bottom: y + bh };
  }

  /** Screen areas the bubble should not cover (cached per layout; caption and plaque move). */
  protectedRects() {
    if (!this.fixedRects || this.fixedRectsFor !== this.W + 'x' + this.H) {
      this.fixedRectsFor = this.W + 'x' + this.H;
      const app = this.app.getBoundingClientRect();
      this.fixedRects = ['.brand', '.corner'].map((q) => document.querySelector(q)).filter(Boolean).map((e) => {
        const r = e.getBoundingClientRect();
        return { left: r.left - app.left - 6, top: r.top - app.top - 6, right: r.right - app.left + 6, bottom: r.bottom - app.top + 6 };
      });
    }
    const out = [...this.fixedRects];
    if (this.captionRect) out.push(this.captionRect);
    if (this.emaPos && this.emaSize) {
      const [w, h] = this.emaSize;
      out.push({ left: this.emaPos.x - w / 2 - 6, top: this.emaPos.y - 20, right: this.emaPos.x + w / 2 + 6, bottom: this.emaPos.y + h + 6 });
    }
    return out;
  }

  /** World → screen for things inside the moving world layer (as if the camera were at 0). */
  baseToScreen(x, y) {
    return { x: (x - this.baseVb.x) * this.scale, y: (y - this.baseVb.y) * this.scale };
  }

  /** Re-sort Kon among the scenery and remember where Kon is (camera, caption). */
  /**
   * Kon (with its aura) and any visitor (the sparrow: anything with `el` and
   * `depthKey(konKey)`) are slotted between the scenery by where they meet the ground.
   */
  placeKon(st) {
    this.konAt = st;
    const konKey = st.seat ? SORT_Y[st.seat] + 0.5 : st.y;
    const items = [{ key: konKey, els: [this.auraEl, this.konEl] }];
    const v = this.visitor;
    if (v && v.el && v.el.style.display !== 'none') items.push({ key: v.depthKey(konKey), els: [v.el] });
    items.sort((a, b) => a.key - b.key);
    const slots = items.map((it) => this.sortables.find((o) => o.y > it.key) || null);
    const sig = items.map((it, i) => `${it.els[it.els.length - 1].id}<${slots[i] ? slots[i].id : 'end'}`).join(' ');
    if (sig === this.depthSig) return;
    this.depthSig = sig;
    // inserting in key order before each slot keeps items that share a slot in order too
    items.forEach((it, i) => { for (const el of it.els) this.depthEl.insertBefore(el, slots[i] ? slots[i].el : null); });
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
    // the caption is centered on (x, y); remember its box so the speech bubble avoids it
    this.captionRect = { left: x - this.captionW / 2 - 6, top: y - 18, right: x + this.captionW / 2 + 6, bottom: y + 18 };
  }

  /** A point on the maple (its own drawing units) → where it is in the world right now. */
  mapleToWorld(x, y) {
    const m = this.maple || { s: 1, x: 0, y: 0 };
    return { x: m.x + m.s * x + this.camX, y: m.y + m.s * y };
  }

  toScreen(x, y) {
    return { x: (x - this.vb.x) * this.scale, y: (y - this.vb.y) * this.scale };
  }

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
    this.emaSize = [ema.offsetWidth || 250, ema.offsetHeight || 140];
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

  /** Kon's sand doodle "while you were away" — placed in open sand in front of the cushion. */
  rakeDoodle(kind) {
    const at = this.mode === 'wide' ? { x: 800, y: 968, s: 1 } : { x: 800, y: 882, s: 0.75 };
    this.rake.doodle(kind, at.x, at.y, at.s);
    PLACES.doodle = { x: at.x, y: at.y };
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
      if (L.landed && this.t - L.landedAt < 14 && !L.scattered) out.push({ id: L.id, kind: 'leafGround', x: L.x, y: L.y, sal: 0.05, byVisitor: L.byVisitor });
    }
    return out;
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
    this.updateProps(dt);
  }
}

mixin(Scene, GardenArt, GardenProps);
