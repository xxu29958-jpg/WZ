// Light — how the garden is lit, drawn on two small canvases over everything.
//
//  · the shade map (a quarter of screen resolution): the ambient color of the
//    hour, warmer toward the sun (or the moon); the lantern's pool of light;
//    fireflies; a soft lift around Kon after dark; leaf shade with flecks of sun
//    under the maple (komorebi), swaying with the branch; a vignette.
//    From golden hour to dawn it is multiplied over the garden. In daylight the
//    light is nearly white, so it is drawn as a plain see-through overlay instead:
//    blending a whole screen is costly where there is no GPU to do it.
//  · the sun layer (half resolution, plain alpha): shafts of light falling from
//    the sun through the maple, a bloom where the sun is, and slow dust motes
//    that only show while they drift through a shaft.
//
// They are redrawn every other frame (soft light needs no more), and they are
// tiny: a few gradients and sprites each.

import { clamp, noise1, makeRng, smoothstep } from '../math.js';

const SHADE_RES = 1 / 4;
const SUN_RES = 1 / 2;

const rgba = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp(a).toFixed(3)})`;

/** A soft round spot of one color, drawn once on a little canvas. */
function sprite(color, stops) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [o, a] of stops) g.addColorStop(o, rgba(color, a));
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  return cv;
}

export class Light {
  constructor({ shade, sun, scene, reduced = false }) {
    this.shade = shade;
    this.sunCv = sun;
    this.sx = shade.getContext('2d');
    this.ux = sun.getContext('2d');
    this.scene = scene;
    this.reduced = reduced;
    this.t = 0;
    this.W = 0;
    this.H = 0;
    this.sunShown = true;
    this.mode = '';
    this.frame = 0;
    this.acc = 0;
    // soft round spots, drawn once and stamped where needed
    this.fleckSprite = sprite([255, 238, 196], [[0, 1], [0.5, 0.85], [0.8, 0.3], [1, 0]]);
    this.clumpSprite = sprite([255, 255, 255], [[0, 1], [0.5, 0.7], [1, 0]]);
    this.flySprite = sprite([190, 230, 120], [[0, 1], [1, 0]]);
    this.lampSprite = sprite([255, 196, 120], [[0, 1], [0.15, 0.85], [0.4, 0.25], [1, 0]]);
    // the maple's shadow on the sand: clumps of leaves, and flecks of sun between them
    const rng = makeRng(31);
    this.clumps = [];
    for (let i = 0; i < 14; i++) {
      this.clumps.push({
        x: 1000 + rng() * 560, y: 760 + rng() * 150, r: 60 + rng() * 80, seed: rng() * 50, k: 0.6 + rng() * 0.4,
      });
    }
    this.flecks = [];
    for (let i = 0; i < 30; i++) {
      this.flecks.push({
        x: 990 + rng() * 580, y: 752 + Math.pow(rng(), 0.9) * 180,
        r: 12 + rng() * 20, seed: rng() * 50, k: 0.6 + rng() * 0.4,
      });
    }
    // dust motes, in screen fractions (they live in the light, not in the world)
    this.motes = [];
    for (let i = 0; i < 54; i++) {
      this.motes.push({ u: rng(), v: rng(), s: 0.6 + rng() * 1.4, seed: rng() * 100, sp: 0.004 + rng() * 0.01 });
    }
  }

  layout(W, H) {
    this.W = W;
    this.H = H;
    const size = (cv, k) => {
      const w = Math.max(8, Math.ceil(W * k)), h = Math.max(8, Math.ceil(H * k));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } // (resizing clears a canvas)
    };
    size(this.shade, SHADE_RES);
    size(this.sunCv, SUN_RES);
    // redraw right away: in the test mode's virtual time, the next frame may be a while
    if (this.last) this.update(0, ...this.last);
  }

  /**
   * @param p      the sky palette for this moment (sky.js)
   * @param ctx    { kon: {x, y}, fireflies: [{x, y, on}], sway (deg), lampFlicker, wind }
   */
  update(dt, p, ctx) {
    this.t += dt;
    this.acc += dt;
    this.last = [p, ctx];
    if (!this.W) return;
    // every other frame (and at once after a layout, when dt is 0)
    if (dt > 0 && this.frame++ % 2) return;
    this.drawShade(p, ctx);
    this.drawSun(this.acc, p, ctx);
    this.acc = 0;
  }

  drawShade(p, ctx) {
    const sc = this.scene;
    const c = this.sx;
    const k = SHADE_RES;
    const w = this.shade.width, h = this.shade.height;
    const S = sc.scale * k; // world units → shade pixels
    const at = (x, y) => { const q = sc.toStage(x, y); return [q.x * k, q.y * k]; };

    // daylight is close to white: draw a see-through overlay instead of a multiply
    const minAmb = Math.min(...p.amb, ...p.ambSun);
    const mode = minAmb >= 214 && p.lamp < 0.01 && p.stars < 0.01 ? 'over' : 'mul';
    if (mode !== this.mode) {
      this.mode = mode;
      this.shade.style.mixBlendMode = mode === 'mul' ? 'multiply' : 'normal';
    }
    if (mode === 'over') { this.drawDaylight(c, p, ctx, at, S, w, h); return; }

    // ambient, and brighter toward where the light comes from (the sun, or the moon)
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = rgba(p.amb);
    c.fillRect(0, 0, w, h);
    const src = sc.farToStage(p.src.x, p.src.y, 0.22);
    const sx = src.x * k, sy = Math.max(src.y, -this.H * 0.6) * k;
    const RS = Math.hypot(w, h) * 1.1;
    const g = c.createRadialGradient(sx, sy, 0, sx, sy, RS);
    g.addColorStop(0, rgba(p.ambSun));
    g.addColorStop(0.45, rgba(p.ambSun, 0.6));
    g.addColorStop(1, rgba(p.ambSun, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // the sky is lit from above as well as by the sun: lift the light toward white up there
    if (p.lift > 0.01) {
      const y0 = at(0, 200)[1], y1 = at(0, 440)[1];
      const lg = c.createLinearGradient(0, y0, 0, y1);
      lg.addColorStop(0, rgba([255, 255, 255], p.lift));
      lg.addColorStop(1, rgba([255, 255, 255], 0));
      c.globalCompositeOperation = 'screen';
      c.fillStyle = lg;
      c.fillRect(0, 0, w, Math.max(0, y1));
      c.globalCompositeOperation = 'source-over';
    }

    // leaf shade under the maple, with flecks of sun (komorebi)
    if (p.dapple > 0.01) this.drawDapples(c, p, ctx, at, S, 'mul');

    // lights: screened on, so they brighten without blowing out
    c.globalCompositeOperation = 'screen';
    if (p.lamp > 0.01) {
      const fl = ctx.lampFlicker ?? 1;
      const [lx, ly] = at(330, 590);
      // its light reaches across the garden, but not down into the valley below the terrace
      const R = 540 * S;
      const lg = c.createRadialGradient(lx, ly, 0, lx, ly, R);
      lg.addColorStop(0, rgba([255, 200, 125], 1 * p.lamp * fl));
      lg.addColorStop(0.22, rgba([240, 156, 84], 0.62 * p.lamp * fl));
      lg.addColorStop(0.6, rgba([190, 110, 60], 0.18 * p.lamp * fl));
      lg.addColorStop(1, rgba([160, 90, 50], 0));
      const edge = at(0, 640)[1];
      c.save();
      c.beginPath();
      c.rect(0, edge, w, h);
      c.clip();
      c.fillStyle = lg;
      c.fillRect(lx - R, ly - R, R * 2, R * 2);
      c.restore();
      // (above that, just the glow around the lantern itself)
      const R2 = 190 * S;
      const lg2 = c.createRadialGradient(lx, ly, 0, lx, ly, R2);
      lg2.addColorStop(0, rgba([255, 200, 125], 0.95 * p.lamp * fl));
      lg2.addColorStop(1, rgba([200, 120, 60], 0));
      c.save();
      c.beginPath();
      c.rect(0, 0, w, edge);
      c.clip();
      c.fillStyle = lg2;
      c.fillRect(lx - R2, ly - R2, R2 * 2, R2 * 2);
      c.restore();
      // and the pool it throws on the sand
      const [gx, gy] = at(330, 830);
      c.save();
      c.translate(gx, gy);
      c.scale(1, 0.34);
      const pg = c.createRadialGradient(0, 0, 0, 0, 0, 380 * S);
      pg.addColorStop(0, rgba([255, 190, 110], 0.6 * p.lamp * fl));
      pg.addColorStop(1, rgba([255, 160, 90], 0));
      c.fillStyle = pg;
      c.fillRect(-380 * S, -380 * S, 760 * S, 760 * S);
      c.restore();
    }
    const dark = clamp(p.stars);
    if (dark > 0.01) {
      // a soft lift around Kon, so the fox never disappears into the night
      if (ctx.kon) {
        const [kx, ky] = at(ctx.kon.x, ctx.kon.y - 120);
        const R = 330 * S;
        const kg = c.createRadialGradient(kx, ky, 0, kx, ky, R);
        kg.addColorStop(0, rgba([110, 104, 130], 0.6 * dark));
        kg.addColorStop(1, rgba([110, 104, 130], 0));
        c.fillStyle = kg;
        c.fillRect(kx - R, ky - R, R * 2, R * 2);
      }
      const R = 70 * S;
      for (const f of ctx.fireflies || []) {
        if (!(f.on > 0.05) || f.cx === undefined) continue;
        const [fx, fy] = at(f.cx, f.cy);
        c.globalAlpha = clamp(0.55 * f.on * dark);
        c.drawImage(this.flySprite, fx - R, fy - R, R * 2, R * 2);
      }
      c.globalAlpha = 1;
      for (const L of ctx.lights || []) {
        const [x, y] = at(L.x, L.y);
        const R = L.r * S;
        const lg = c.createRadialGradient(x, y, 0, x, y, R);
        lg.addColorStop(0, rgba(L.color, L.a * dark));
        lg.addColorStop(1, rgba(L.color, 0));
        c.fillStyle = lg;
        c.fillRect(x - R, y - R, R * 2, R * 2);
      }
    }

    // vignette: the corners fall off a little, more after dark
    c.globalCompositeOperation = 'multiply';
    const R0 = Math.hypot(w, h) * 0.5;
    const vg = c.createRadialGradient(w * 0.5, h * 0.48, R0 * 0.42, w * 0.5, h * 0.48, R0 * 1.05);
    const vc = p.stars > 0.5 ? [30, 34, 80] : p.lift > 0.5 && p.rays < 0.7 ? [150, 140, 130] : [120, 84, 70];
    vg.addColorStop(0, rgba(vc, 0));
    vg.addColorStop(1, rgba(vc, p.vig));
    c.fillStyle = vg;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
  }

  /** Daylight, as a see-through overlay: a faint warm haze, the leaf shade, a vignette. */
  drawDaylight(c, p, ctx, at, S, w, h) {
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    // white light × ambient ≈ a haze of color K at alpha a (exact for white paper)
    const amb = [0, 1, 2].map((i) => (p.amb[i] + p.ambSun[i]) / 2);
    const a = 1 - Math.min(...amb) / 255;
    if (a > 0.004) {
      const K = amb.map((v) => clamp((v - (1 - a) * 255) / a, 0, 255));
      // (the sky's own colors already account for this: fade it out up there)
      const y0 = at(0, 200)[1], y1 = at(0, 440)[1];
      const g = c.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, rgba(K, a * (1 - p.lift)));
      g.addColorStop(1, rgba(K, a));
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    if (p.dapple > 0.01) this.drawDapples(c, p, ctx, at, S, 'over');
    const R0 = Math.hypot(w, h) * 0.5;
    const vg = c.createRadialGradient(w * 0.5, h * 0.48, R0 * 0.42, w * 0.5, h * 0.48, R0 * 1.05);
    vg.addColorStop(0, 'rgba(96,84,78,0)');
    vg.addColorStop(1, rgba([96, 84, 78], p.vig * 0.6));
    c.fillStyle = vg;
    c.fillRect(0, 0, w, h);
  }

  drawDapples(c, p, ctx, at, S, mode) {
    const t = this.t;
    const sway = ctx.sway || 0;
    const wind = ctx.wind || 0;
    // the canopy's shadow: a long soft patch on the sand to the right
    // (shade is lit by the blue sky, so it's a little cool)
    const over = mode === 'over';
    // the clumps are drawn as one mask on a scratch canvas, then tinted, so overlaps don't pile up
    const sc = this.scratch || (this.scratch = document.createElement('canvas'));
    if (sc.width !== c.canvas.width || sc.height !== c.canvas.height) { sc.width = c.canvas.width; sc.height = c.canvas.height; }
    const m = sc.getContext('2d');
    m.globalCompositeOperation = 'source-over';
    m.clearRect(0, 0, sc.width, sc.height);
    for (const cl of this.clumps) {
      const dx = sway * 30 * cl.k + noise1(t * 0.12, cl.seed) * 10 * (1 + wind * 2);
      const [x, y] = at(cl.x + dx, cl.y);
      const r = cl.r * S;
      m.globalAlpha = 0.75;
      m.drawImage(this.clumpSprite, x - r, y - r * 0.4, r * 2, r * 0.8);
    }
    m.globalAlpha = 1;
    m.globalCompositeOperation = 'source-in';
    m.fillStyle = over ? rgba([70, 84, 140], 0.11 * p.dapple) : rgba([190, 186, 206], p.dapple);
    m.fillRect(0, 0, sc.width, sc.height);
    c.globalCompositeOperation = over ? 'source-over' : 'multiply';
    c.drawImage(sc, 0, 0);
    // flecks of sun through the leaves: they drift with the branch and shimmer
    c.globalCompositeOperation = over ? 'source-over' : 'screen';
    const kf = over ? 0.55 : 0.8;
    for (const f of this.flecks) {
      const shimmer = 0.5 + 0.5 * noise1(t * (0.35 + wind) + f.seed, f.seed);
      const dx = sway * 26 * f.k + noise1(t * 0.3, f.seed + 3) * 8 * (1 + wind * 3);
      const [x, y] = at(f.x + dx, f.y);
      const r = f.r * S;
      c.globalAlpha = clamp(kf * shimmer * p.dapple);
      c.drawImage(this.fleckSprite, x - r, y - r * 0.42, r * 2, r * 0.84);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  drawSun(dt, p, ctx) {
    const c = this.ux;
    const night = clamp((p.stars - 0.1) / 0.5);
    const show = p.rays > 0.01 || night > 0;
    if (show !== this.sunShown) {
      this.sunShown = show;
      this.sunCv.style.display = show ? '' : 'none';
    }
    if (!show) return;
    const w = this.sunCv.width, h = this.sunCv.height;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    c.globalCompositeOperation = 'lighter';
    if (this.scene.lakeOpen) this.drawValley(c, p, night);
    if (p.rays > 0.01) this.drawShafts(c, dt, p, ctx, w, h);
  }

  /**
   * Light down in the valley: the moon's (or the low sun's) glittering path across
   * the lake, and after dark the village's windows and the lamps on the torii path.
   */
  drawValley(c, p, night) {
    const sc = this.scene;
    const k = SUN_RES;
    const t = this.t;
    const S = sc.scale * k;
    const V = 0.4; // the valley's parallax
    const at = (x, y) => { const q = sc.farToStage(x, y, V); return [q.x * k, q.y * k]; };
    const toValleyX = (sx) => (sx / k - sc.shiftAt(V).x) / sc.scale + sc.baseVb.x + sc.camX * V;
    const shore = sc.lakeShore;
    // a path of light on the water, under the moon or a low sun
    const path = (src, color, a) => {
      const sx = sc.farToStage(src.x, src.y, 0.22).x * k;
      const vx = toValleyX(sx);
      const bottom = Math.min(sc.lakeOpen(vx), shore + 210);
      if (bottom < shore + 8) return;
      const y0 = at(0, shore + 3)[1], y1 = at(0, bottom)[1];
      // many small glints, thicker toward the middle of the path, breaking up as they come closer
      const N = 64;
      for (let i = 0; i < N; i++) {
        const u = ((i * 0.618034) % 1);
        const y = y0 + Math.pow(u, 1.25) * (y1 - y0);
        const spread = (6 + 34 * u) * S;
        const off = noise1(t * 0.35 + i * 3.7, i) * spread * 0.9;
        const width = (2 + 14 * u) * S * (0.4 + 0.6 * Math.abs(noise1(t * 0.8 + i * 1.3, i + 2)));
        const fl = Math.max(0, noise1(t * 2.1 + i * 2.1, i + 5));
        const core = 1 - Math.min(1, Math.abs(off) / spread);
        c.fillStyle = rgba(color, a * fl * (0.4 + 0.6 * core) * (1 - u * 0.5) * (1 - smoothstep(0.8, 1, u)));
        c.fillRect(sx + off - width / 2, y, width, Math.max(0.8, 1.3 * S));
      }
    };
    if (night > 0 && p.moon.up) path(p.moon, [255, 244, 214], 0.75 * night);
    if (p.sun.up && p.sun.alt < 0.4 && p.rays > 0.2) path(p.sun, p.glow, 0.5 * p.rays * (1 - smoothstep(0.25, 0.4, p.sun.alt)));
    if (night <= 0) return;
    // windows in the village, and their reflections (someone goes to bed now and then)
    const R = 7 * S + 2;
    for (const v of sc.village || []) {
      const on = v.on && noise1(t * 0.02 + v.seed * 7, v.seed) > -0.55;
      if (!on) continue;
      const [x, y] = at(v.x, v.y);
      const fl = 0.8 + 0.2 * noise1(t * 3 + v.seed, v.seed);
      c.globalAlpha = night * fl;
      c.drawImage(this.lampSprite, x - R, y - R, R * 2, R * 2);
      c.fillStyle = rgba([255, 205, 130], 0.4 * night * fl);
      c.fillRect(x - 0.6, at(0, shore + 3)[1], 1.2, (6 + v.seed % 4) * S);
    }
    // lamps along the torii path (the ones not hidden behind the old pine)
    for (const l of sc.toriiLamps || []) {
      if (l.x < 340) continue;
      const [x, y] = at(l.x, l.y);
      c.globalAlpha = night * (0.75 + 0.25 * noise1(t * 2.5 + l.seed, l.seed));
      c.drawImage(this.lampSprite, x - R * 0.8, y - R * 0.8, R * 1.6, R * 1.6);
    }
    c.globalAlpha = 1;
  }

  drawShafts(c, dt, p, ctx, w, h) {
    const k = SUN_RES;
    const sc = this.scene;
    const s = sc.farToStage(p.sun.x, p.sun.y, 0.22);
    // in the middle of the day the sun is high above the frame, toward the side it's on
    const sx = s.x * k, sy = Math.max(s.y, -this.H * 0.9) * k;
    const glow = p.glow;
    const a = p.rays;
    // bloom
    const R = Math.max(w, h) * 0.55;
    const bg = c.createRadialGradient(sx, sy, 0, sx, sy, R);
    bg.addColorStop(0, rgba(glow, 0.5 * a));
    bg.addColorStop(0.2, rgba(glow, 0.16 * a));
    bg.addColorStop(1, rgba(glow, 0));
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    // shafts: long soft wedges fanning away from the sun
    const t = this.t;
    const aim = Math.atan2(h * 0.95 - sy, w * 0.45 - sx);
    const L = Math.hypot(w, h) * 1.25;
    for (let i = 0; i < 7; i++) {
      const ang = aim + (i - 3) * 0.085 + noise1(t * 0.05, i * 7) * 0.03;
      const breathe = 0.35 + 0.65 * Math.max(0, noise1(t * 0.13 + i * 3.1, i));
      const width = 0.018 + 0.016 * ((i * 37) % 5) / 4;
      const x1 = sx + Math.cos(ang - width) * L, y1 = sy + Math.sin(ang - width) * L;
      const x2 = sx + Math.cos(ang + width) * L, y2 = sy + Math.sin(ang + width) * L;
      const lg = c.createLinearGradient(sx, sy, sx + Math.cos(ang) * L, sy + Math.sin(ang) * L);
      lg.addColorStop(0, rgba(glow, 0));
      lg.addColorStop(0.12, rgba(glow, 0.2 * a * breathe));
      lg.addColorStop(0.55, rgba(glow, 0.07 * a * breathe));
      lg.addColorStop(1, rgba(glow, 0));
      c.fillStyle = lg;
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(x1, y1);
      c.lineTo(x2, y2);
      c.closePath();
      c.fill();
    }
    // dust motes, catching the light
    if (this.reduced) return;
    const wind = ctx.wind || 0;
    for (const m of this.motes) {
      m.u = (m.u + (m.sp * (0.4 + wind * 4) + noise1(t * 0.2, m.seed) * 0.004) * dt + 1) % 1;
      m.v = (m.v + (0.006 + noise1(t * 0.17, m.seed + 4) * 0.01) * dt + 1) % 1;
      const x = m.u * w, y = m.v * h;
      // how much sun is here: near a shaft's axis, and not too far from the sun
      const ang = Math.atan2(y - sy, x - sx);
      let lit = 0;
      for (let i = 0; i < 7; i++) {
        const d = Math.abs(ang - (aim + (i - 3) * 0.085));
        lit = Math.max(lit, 1 - d / 0.05);
      }
      lit = clamp(lit) * 0.6 + 0.15;
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + m.seed);
      c.fillStyle = rgba([255, 246, 220], a * lit * tw * 0.9);
      c.beginPath();
      c.arc(x, y, m.s, 0, Math.PI * 2);
      c.fill();
    }
  }
}

