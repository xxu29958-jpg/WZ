// EnsoBrush — a procedural sumi brush that paints one ensō stroke.
//
// The stroke is ~84 bristles following the same circular path, each with its
// own ink load and point where it starts to run dry. Because every bristle's
// visibility depends only on (bristle, position), the circle can be painted all
// at once or a little more each frame — the meditation uses the second mode.

import { makeRng, noise1, DEG, TAU } from '../math.js';

const STEPS = 560;
const BRISTLES = 84;

export class EnsoBrush {
  constructor(size, seed = 70) {
    this.size = size;
    this.steps = STEPS;
    const rng = makeRng(seed);
    this.cx = size / 2;
    this.cy = size / 2;
    this.R = size * 0.4537; // 245 world units on a 540-unit canvas
    this.start = 116 * DEG;
    this.sweep = 306 * DEG;
    this.brushW = size * 0.034;
    this.bristles = [];
    for (let b = 0; b < BRISTLES; b++) {
      const o = (b / (BRISTLES - 1)) * 2 - 1;
      this.bristles.push({
        b, o,
        ink: 0.6 + 0.4 * rng(),
        dryStart: 0.2 + 0.55 * rng() * (1 - Math.abs(o) * 0.7),
      });
    }
  }

  width(t) {
    return this.brushW * (0.7 + 0.45 * Math.sin(Math.min(1, t * 4) * Math.PI * 0.5)) * (1 - 0.62 * Math.pow(t, 1.4));
  }

  /** Center of the brush at stroke position t ∈ [0, 1] → [x, y, angle]. */
  at(t) {
    const a = this.start + this.sweep * t;
    const r = this.R * (1 + 0.011 * Math.sin(t * 8.5 + 1) + 0.005 * Math.sin(t * 21)) + t * this.size * 0.008;
    return [this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r, a];
  }

  bristlePoint(br, i) {
    const t = i / STEPS;
    const [x, y, a] = this.at(t);
    const w = this.width(t) * (1 + 0.1 * noise1(t * 14, br.b + 3));
    const dryness = t > br.dryStart ? (t - br.dryStart) * 2.4 : 0;
    const visible = !(noise1(t * 46 + br.b * 2.7, br.b) > 1 - dryness);
    return [x + Math.cos(a) * br.o * w, y + Math.sin(a) * br.o * w, visible];
  }

  /**
   * Paint the part of the stroke between step indices (i0, i1].
   * Returns i1 so callers can continue from there next frame.
   */
  paintSteps(g, i0, i1, { pool = false } = {}) {
    i0 = Math.max(0, Math.floor(i0));
    i1 = Math.min(STEPS, Math.floor(i1));
    if (i1 <= i0) return i0;
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // soft ink bleed underneath
    for (let i = i0 + 1; i <= i1; i++) {
      if (i % 2) continue;
      const t = (i - 2) / STEPS;
      const [x, y] = this.at(Math.max(0, t));
      const [x2, y2] = this.at(i / STEPS);
      g.strokeStyle = `rgba(40, 30, 26, ${0.05 * (1 - t)})`;
      g.lineWidth = this.width(t) * 2.6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x2, y2);
      g.stroke();
    }

    // bristles
    g.lineWidth = (this.brushW * 2 / BRISTLES) * 2.2;
    for (const br of this.bristles) {
      g.strokeStyle = `rgba(34, 24, 20, ${(0.56 * br.ink).toFixed(3)})`;
      g.beginPath();
      let prev = this.bristlePoint(br, Math.max(0, i0));
      for (let i = Math.max(1, i0 + 1); i <= i1; i++) {
        const cur = this.bristlePoint(br, i);
        if (prev[2] && cur[2]) {
          g.moveTo(prev[0], prev[1]);
          g.lineTo(cur[0], cur[1]);
        }
        prev = cur;
      }
      g.stroke();
    }

    // ink pooling where the brush landed
    if (pool || i0 === 0) {
      const [sx, sy, sa] = this.at(0.004);
      g.fillStyle = 'rgba(30, 22, 18, .85)';
      g.beginPath();
      g.ellipse(sx, sy, this.brushW * 0.8, this.brushW * 1.05, sa, 0, TAU);
      g.fill();
    }
    return i1;
  }

  paintAll(g) {
    this.paintSteps(g, 0, STEPS);
  }
}
