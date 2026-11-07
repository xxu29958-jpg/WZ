// SandRake — drag across the sand to rake real grooves into it.
//
// The sand canvas covers the raked area in world units (it pans with the
// camera through a CSS transform, so nothing is redrawn while Kon walks). It
// sits just above the sand and below every object, so stones, the cushion and
// Kon stand in front of the grooves. It slowly fades (destination-out), so the
// garden smooths itself back over half a minute or so. Kon's paw prints go
// into the same sand.
//
// When a stroke ends it is analyzed: a closed loop is a circle to be judged,
// many turns make a spiral. The result goes to the brain as a 'rake' event.

import { clamp, TAU, wrapAngle } from '../math.js';

const SAND_TOP = 714;            // world y where the raked sand begins
const TINE_GAP = 7;              // world units between the rake's tines
const RAKE_TINES = [-2, -1, 0, 1, 2];
const FADE_EVERY = 0.25;         // seconds
const FADE_ALPHA = 0.018;        // per fade step → ~10% left after 30 s
const SQUASH = 0.52;             // the ground plane is seen at an angle

const NO_RAKE = '.clickable, #kon, #kon-head, #wish, .corner, .hints, #flower, button, input';

const AREA = { x: -340, y: 700, w: 2280, h: 420 }; // the sand the canvas covers, in world units

export class SandRake {
  constructor({ canvas, scene, emit }) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.scene = scene;
    this.emit = emit;
    this.strokes = [];
    this.prints = [];
    this.active = null;
    this.fadeT = 0;
    this.t = 0;
    this.res = 0;
  }

  /** Pick a canvas resolution for this screen; reallocate (and redraw) only if it changed a lot. */
  layout() {
    const sc = this.scene;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const res = clamp(sc.scale * dpr, 1.2, 2.2);
    if (Math.abs(res - this.res) < 0.25) return;
    this.res = res;
    this.cv.width = Math.round(AREA.w * res);
    this.cv.height = Math.round(AREA.h * res);
    this.applyTransform();
    this.redraw();
  }

  applyTransform() {
    const r = this.res;
    this.g.setTransform(r, 0, 0, r, -AREA.x * r, -AREA.y * r);
  }

  /** Follow the camera: a CSS transform only. */
  place() {
    const sc = this.scene;
    if (!this.res || !sc.vb) return;
    const p = sc.baseToScreen(AREA.x, AREA.y); // inside the moving world layer
    this.cv.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) scale(${(sc.scale / this.res).toFixed(5)})`;
  }

  // ---------------------------------------------------------------- input
  /** Called on pointerdown; returns true when this press starts raking. */
  tryBegin(e, world) {
    if (world.y < SAND_TOP + 4) return false;
    if (e.target && e.target.closest && e.target.closest(NO_RAKE)) return false;
    if (e.pointerType === 'mouse' && e.button !== 0) return false;
    this.active = { id: e.pointerId, pts: [world], born: this.t, len: 0 };
    this.emit({ type: 'rakeStart', x: world.x, y: world.y });
    return true;
  }

  extend(e, world) {
    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    const p = { x: world.x, y: Math.max(SAND_TOP, world.y) };
    const last = a.pts[a.pts.length - 1];
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    if (d < 3.5) return;
    a.pts.push(p);
    a.len += d;
    this.drawSegments(a.pts, a.pts.length - 1, { alpha: 1 });
  }

  end(e) {
    const a = this.active;
    if (!a || (e && e.pointerId !== a.id)) return;
    this.active = null;
    a.ended = this.t;
    if (a.pts.length > 1) this.strokes.push(a);
    const shape = analyzeStroke(a.pts);
    this.emit({ type: 'rakeEnd', ...(shape || { shape: 'none' }) });
  }

  /** Where the rake is right now (for Kon's eyes), or null. */
  tip() {
    const a = this.active;
    return a ? a.pts[a.pts.length - 1] : null;
  }

  // ---------------------------------------------------------------- drawing
  /**
   * Draw segment k of a polyline (from pts[k-1] to pts[k]). The smoothing band
   * is drawn first; then the grooves of the last few segments are redrawn so the
   * band's round cap never erases fresh grooves behind it.
   */
  drawSegments(pts, k, { alpha = 1, tines = RAKE_TINES, gap = TINE_GAP, band = 36 } = {}) {
    const g = this.g;
    const a = pts[k - 1], b = pts[k];
    g.save();
    g.globalAlpha = alpha;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#ece1c9';
    g.lineWidth = band;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
    let back = 0;
    let j = k;
    while (j > 1 && back < band * 0.6) {
      back += Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y);
      j--;
    }
    for (let i = Math.max(1, j); i <= k; i++) this.grooves(pts[i - 1], pts[i], tines, gap);
    g.restore();
  }

  grooves(a, b, tines, gap) {
    const g = this.g;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = (dx / len) * SQUASH;
    g.lineWidth = 1.9;
    g.strokeStyle = 'rgba(192, 168, 124, .95)';
    g.beginPath();
    for (const k of tines) {
      const ox = nx * k * gap, oy = ny * k * gap;
      g.moveTo(a.x + ox, a.y + oy + 0.9);
      g.lineTo(b.x + ox, b.y + oy + 0.9);
    }
    g.stroke();
    g.lineWidth = 1.4;
    g.strokeStyle = 'rgba(253, 249, 240, .95)';
    g.beginPath();
    for (const k of tines) {
      const ox = nx * k * gap, oy = ny * k * gap;
      g.moveTo(a.x + ox, a.y + oy - 1.2);
      g.lineTo(b.x + ox, b.y + oy - 1.2);
    }
    g.stroke();
  }

  drawStroke(stroke, alpha) {
    const opts = { alpha, ...(stroke.style || {}) };
    for (let k = 1; k < stroke.pts.length; k++) this.drawSegments(stroke.pts, k, opts);
  }

  redraw() {
    const g = this.g;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.restore();
    const fade = (t0) => Math.pow(1 - FADE_ALPHA, (this.t - t0) / FADE_EVERY);
    for (const s of this.strokes) {
      const alpha = fade(s.ended ?? this.t);
      if (alpha > 0.03) this.drawStroke(s, alpha);
    }
    for (const p of this.prints) {
      const alpha = fade(p.t);
      if (alpha > 0.03) this.drawPrint(p, alpha);
    }
    if (this.active && this.active.pts.length > 1) this.drawStroke(this.active, 1);
  }

  // ---------------------------------------------------------------- paw prints
  /** A small paw print where Kon's foot came down. */
  pawPrint(x, y, foot, dir, ds) {
    if (y < SAND_TOP + 6) return;
    const p = { x: x + (foot === 'l' ? -7 : 7) * ds * (dir > 0 ? 0.5 : -0.5) , y: y + (foot === 'l' ? -2 : 2) * ds, dir, ds, t: this.t };
    this.prints.push(p);
    if (this.prints.length > 160) this.prints.shift();
    this.drawPrint(p, 1);
  }

  drawPrint(p, alpha) {
    const g = this.g;
    const s = 4.2 * p.ds;
    g.save();
    g.globalAlpha = alpha;
    g.translate(p.x, p.y);
    g.scale(1, SQUASH);
    g.rotate(p.dir > 0 ? 0.2 : -0.2);
    const blob = (cx, cy, rx, ry, dark) => {
      g.fillStyle = dark ? 'rgba(186, 161, 118, .75)' : 'rgba(250, 245, 232, .8)';
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      g.fill();
    };
    // a little highlight on the far rim, then the pad and three toes
    blob(0, -0.8 * s, 1.25 * s, 1.0 * s, false);
    blob(0, 0, 1.2 * s, 0.95 * s, true);
    for (const k of [-1, 0, 1]) blob(k * 1.05 * s + p.dir * 0.35 * s, -1.55 * s + Math.abs(k) * 0.35 * s, 0.42 * s, 0.38 * s, true);
    g.restore();
  }

  update(dt) {
    this.t += dt;
    this.fadeT += dt;
    if (this.fadeT >= FADE_EVERY) {
      this.fadeT -= FADE_EVERY;
      const g = this.g;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = `rgba(0, 0, 0, ${FADE_ALPHA})`;
      g.fillRect(0, 0, this.cv.width, this.cv.height);
      g.restore();
      this.strokes = this.strokes.filter((s) => this.t - s.ended < 70);
      this.prints = this.prints.filter((p) => this.t - p.t < 70);
    }
  }

  // ---------------------------------------------------------------- Kon's doodles
  /** A little drawing Kon "raked while you were away", centered at (cx, cy). */
  doodle(kind, cx, cy, size = 1) {
    const shapes = DOODLES[kind] || DOODLES.fox;
    const s = 46 * size;
    for (const line of shapes) {
      const pts = line.map(([x, y]) => ({ x: cx + x * s, y: cy + y * s * SQUASH }));
      const stroke = { pts, ended: this.t, style: { tines: [-0.5, 0.5], gap: 5, band: 16 } };
      this.strokes.push(stroke);
      this.drawStroke(stroke, 1);
    }
  }
}

const circlePts = (n, r = 1, cx = 0, cy = 0, a0 = 0, a1 = TAU) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });

const DOODLES = {
  // a fox face: ears, cheeks, chin, two eyes and a nose
  fox: [
    [[-1.1, 0.1], [-0.95, -1.1], [-0.42, -0.45], [0.42, -0.45], [0.95, -1.1], [1.1, 0.1], [0.62, 0.72], [0, 1.0], [-0.62, 0.72], [-1.1, 0.1]],
    [[-0.5, 0.02], [-0.3, 0.1]],
    [[0.3, 0.1], [0.5, 0.02]],
    [[-0.1, 0.5], [0.1, 0.5], [0, 0.62], [-0.1, 0.5]],
  ],
  heart: [
    [[0, 1.0], [-0.95, 0.05], [-0.95, -0.55], [-0.5, -0.85], [0, -0.45], [0.5, -0.85], [0.95, -0.55], [0.95, 0.05], [0, 1.0]],
  ],
  enso: [circlePts(26, 1, 0, 0, 2.1, 2.1 + TAU * 0.88)],
  paw: [
    circlePts(14, 0.48, 0, 0.35),
    circlePts(8, 0.2, -0.62, -0.32),
    circlePts(8, 0.2, -0.22, -0.68),
    circlePts(8, 0.2, 0.22, -0.68),
    circlePts(8, 0.2, 0.62, -0.32),
  ],
};
export const DOODLE_KINDS = Object.keys(DOODLES);

/**
 * Classify a finished stroke.
 *   circle → { shape, score 1–10, x, y, r }   spiral → { shape, x, y }   otherwise null
 */
export function analyzeStroke(raw) {
  if (!raw || raw.length < 8) return null;
  // resample at even spacing so fast and slow drawing score the same
  const pts = [raw[0]];
  let carry = 0;
  for (let i = 1; i < raw.length; i++) {
    let a = pts[pts.length - 1];
    const b = raw[i];
    let d = Math.hypot(b.x - a.x, b.y - a.y);
    while (carry + d >= 6) {
      const u = (6 - carry) / d;
      const p = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      pts.push(p);
      a = p;
      d = Math.hypot(b.x - a.x, b.y - a.y);
      carry = 0;
    }
    carry += d;
  }
  const L = (pts.length - 1) * 6;
  if (L < 220) return null;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  // A circle on the ground is seen as a flattened oval, and some people draw a
  // screen circle instead — so stretch the shape back to round before judging.
  const sx = Math.sqrt(pts.reduce((s2, p) => s2 + (p.x - cx) ** 2, 0) / pts.length);
  const sy = Math.sqrt(pts.reduce((s2, p) => s2 + (p.y - cy) ** 2, 0) / pts.length);
  const aspect = sy / (sx || 1);
  if (aspect < 0.3 || aspect > 2.2) return null;
  const k = sx / (sy || 1);
  const norm = pts.map((p) => ({ x: p.x, y: cy + (p.y - cy) * k }));
  const rs = norm.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const R = rs.reduce((s, r) => s + r, 0) / rs.length;
  const sd = Math.sqrt(rs.reduce((s, r) => s + (r - R) ** 2, 0) / rs.length);
  const cv = sd / (R || 1);
  let sweep = 0;
  let prev = Math.atan2(norm[0].y - cy, norm[0].x - cx);
  for (let i = 1; i < norm.length; i++) {
    const a = Math.atan2(norm[i].y - cy, norm[i].x - cx);
    sweep += wrapAngle(a - prev);
    prev = a;
  }
  const turns = Math.abs(sweep) / TAU;
  const last = norm[norm.length - 1];
  const closure = Math.hypot(last.x - norm[0].x, last.y - norm[0].y) / (TAU * (R || 1));
  if (turns > 2.2 && L > 800) return { shape: 'spiral', x: cx, y: cy, turns };
  if (turns > 0.86 && turns < 1.45 && R > 34 && closure < 0.35) {
    const roundness = clamp(1 - cv / 0.3);
    const closed = clamp(1 - closure / 0.35);
    const q = roundness * 0.82 + closed * 0.18;
    const score = clamp(Math.round(1 + 9 * Math.pow(q, 1.35)), 1, 10);
    return { shape: 'circle', score, x: cx, y: cy, r: sx * Math.SQRT2 };
  }
  return null;
}
