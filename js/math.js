// Small numeric helpers shared by the brain, the rig and the scene.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a));
export const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
/** 0 → 1 → 0 bump over [a, b]. */
export const bump = (a, b, v) => {
  if (v <= a || v >= b) return 0;
  return Math.sin(((v - a) / (b - a)) * Math.PI);
};
/** Frame-rate independent exponential approach. */
export const damp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Damped harmonic spring. `freq` is in Hz, `zeta` is the damping ratio
 * (1 = critically damped, < 1 overshoots). Sub-stepped so big frames stay stable.
 */
export class Spring {
  constructor(value = 0, freq = 2, zeta = 0.7) {
    this.x = value;
    this.v = 0;
    this.target = value;
    this.freq = freq;
    this.zeta = zeta;
  }
  step(dt, target = this.target, freqMul = 1, zetaMin = 0) {
    this.target = target;
    const w = TAU * this.freq * freqMul;
    const k = w * w;
    const c = 2 * Math.max(this.zeta, zetaMin) * w;
    const n = Math.max(1, Math.ceil(dt * 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -k * (this.x - target) - c * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    if (!Number.isFinite(this.x) || !Number.isFinite(this.v)) {
      // never let one bad input freeze the character: recover at the target
      this.x = Number.isFinite(target) ? target : 0;
      this.v = 0;
    }
    return this.x;
  }
  snap(value) {
    this.x = value;
    this.v = 0;
    this.target = value;
  }
}

/**
 * Keyframe track: frames = [[t, value], ...] (sorted by t).
 * Values are eased with smoothstep between frames and held at the ends.
 */
export function track(t, frames) {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i];
    if (t <= t1) {
      const [t0, v0] = frames[i - 1];
      const u = (t - t0) / (t1 - t0 || 1);
      return lerp(v0, v1, u * u * (3 - 2 * u));
    }
  }
  return frames[frames.length - 1][1];
}

/** Deterministic PRNG (mulberry32) so behavior tests can be repeated. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randRange = (rng, a, b) => a + (b - a) * rng();
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

/** Shuffle bag: every item comes up once per round, never twice in a row. */
export class Bag {
  constructor(items, rng = Math.random) {
    this.items = items.slice();
    this.rng = rng;
    this.queue = [];
    this.last = null;
  }
  refill() {
    const q = this.items.slice();
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [q[i], q[j]] = [q[j], q[i]];
    }
    if (q.length > 1 && q[0] === this.last) [q[0], q[1]] = [q[1], q[0]];
    this.queue = q;
  }
  next(exclude = []) {
    for (let tries = 0; tries < this.items.length * 2 + 2; tries++) {
      if (!this.queue.length) this.refill();
      const item = this.queue.shift();
      if (!exclude.includes(item) || tries > this.items.length * 2) {
        this.last = item;
        return item;
      }
    }
    return this.items[0];
  }
}

/** Smooth 1-D value noise in [-1, 1]. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => {
    const s = Math.sin((n + seed * 101.7) * 127.1) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u);
}

/** Closed Catmull-Rom spline through points → SVG path data. */
export function closedSpline(pts, tension = 1) {
  const n = pts.length;
  if (n < 3) return '';
  const f = (v) => v.toFixed(1);
  let d = `M ${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension;
    d += ` C ${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + ' Z';
}
