// Weather — the sky has moods of its own.
//
// A few fair-weather clouds are always drifting over. Now and then more of them
// gather, the light goes soft and grey, and it rains: streaks through the air,
// rings on the sand, puddles that fill and slowly dry. When the sun comes back
// there is a rainbow. Some showers fall out of a bright sky (a sunshower: in
// the old stories that means a fox is getting married, and if you watch the far
// shore you can see the lanterns of the procession). On some nights it snows.
// Poke a cloud and it lets go of a little rain of its own.
//
// `Weather` is the logic (no DOM, so tests can run it); `GardenWeather` draws
// it, mixed into Scene (see scene.js; `this` is the scene).

import { clamp, lerp, smoothstep, noise1, makeRng, Spring, TAU } from '../math.js';
import { $, f2, svgEl } from '../util.js';
import { depthScale, OBSTACLES } from './world.js';

export const CLOUD_DEPTH = 0.26;   // the clouds' parallax (between the hills and the mist)
const VALLEY_DEPTH = 0.4;

/** Hollows in the sand where the rain collects (th: how wet the ground must be before each starts to fill). */
export const PUDDLES = [
  { id: 'a', x: 880, y: 950, rx: 62, th: 0.12 },
  { id: 'b', x: 250, y: 906, rx: 40, th: 0.26 },
  { id: 'c', x: 965, y: 776, rx: 34, th: 0.36 },
];

const KINDS = {
  clear: { cover: 0.14, rain: 0, snow: 0 },
  cloudy: { cover: 0.72, rain: 0, snow: 0 },
  rain: { cover: 0.94, rain: 1, snow: 0 },
  sunshower: { cover: 0.3, rain: 0.62, snow: 0 },
  snow: { cover: 0.82, rain: 0, snow: 1 },
};
export const WEATHER_KINDS = Object.keys(KINDS);

export class Weather {
  constructor({ rng = Math.random, auto = true } = {}) {
    this.rng = rng;
    this.auto = auto;             // weather of its own accord (scripted checks turn this off)
    this.t = 0;
    this.kind = 'clear';
    this.kindT = 0;
    this.kindDur = Infinity;
    this.queue = [];
    this.cover = KINDS.clear.cover;
    this.rain = 0;
    this.snow = 0;
    this.wet = 0;                 // how wet the ground is (puddles)
    this.white = 0;               // how much snow lies
    this.bow = 0;                 // the rainbow, 0–1
    this.bowT = 0;
    this.falling = null;          // 'rain' | 'sunshower' | 'snow' while something is coming down
    this.nextAt = 55 + rng() * 45;
    this.events = [];
  }

  /** Change the weather now; `then` is what follows: [[kind, seconds], …] (clear, after that). */
  set(kind, dur = 60, then = []) {
    if (!KINDS[kind]) return;
    const from = this.kind;
    this.kind = kind;
    this.kindT = 0;
    this.kindDur = kind === 'clear' && !then.length ? Infinity : dur;
    this.queue = then.slice();
    if (kind !== from) this.events.push({ type: 'weather', kind, from });
  }

  /** A little weather story: clouds gather, something falls (or doesn't), and it clears. */
  plan({ night = false } = {}) {
    const r = this.rng();
    if (!night && r < 0.2) return [['sunshower', 44 + this.rng() * 20]];
    if (r < 0.68) {
      const what = night && this.rng() < 0.45 ? 'snow' : 'rain';
      return [['cloudy', 20 + this.rng() * 10], [what, what === 'snow' ? 85 + this.rng() * 40 : 58 + this.rng() * 34], ['cloudy', 12]];
    }
    return [['cloudy', 60 + this.rng() * 50]];
  }

  /**
   * @param ctx { night, sunUp }: the hour, as far as the weather cares
   * @returns events: weather {kind, from}, rainStart {kind}, rainStop {kind}, rainbow
   */
  update(dt, ctx = {}) {
    this.t += dt;
    const out = this.events;
    this.events = [];
    this.kindT += dt;
    if (this.kindT > this.kindDur) {
      const next = this.queue.shift();
      if (next) this.set(next[0], next[1], this.queue);
      else { this.set('clear'); this.nextAt = this.t + 150 + this.rng() * 170; }
    } else if (this.auto && this.kind === 'clear' && this.t > this.nextAt) {
      const story = this.plan(ctx);
      this.set(story[0][0], story[0][1], story.slice(1));
    }
    out.push(...this.events);
    this.events = [];

    const K = KINDS[this.kind];
    this.cover += (K.cover - this.cover) * (1 - Math.exp(-dt / (this.kind === 'clear' ? 9 : 6.5)));
    this.rain += (K.rain - this.rain) * (1 - Math.exp(-dt / 3.5));
    this.snow += (K.snow - this.snow) * (1 - Math.exp(-dt / 5));

    // something starts to fall; something stops
    const falling = this.rain > 0.1 ? (this.kind === 'sunshower' ? 'sunshower' : 'rain') : this.snow > 0.1 ? 'snow' : null;
    if (falling && !this.falling) { this.falling = falling; this.fallT = 0; out.push({ type: 'rainStart', kind: falling }); }
    else if (!falling && this.falling && this.rain < 0.06 && this.snow < 0.06) {
      out.push({ type: 'rainStop', kind: this.falling });
      // the sun comes back onto wet air: a rainbow
      if (this.falling !== 'snow' && ctx.sunUp && !this.bowT) this.startBow(out);
      this.falling = null;
    }
    if (this.falling) this.fallT += dt;
    // (a sunshower has the sun out all along: its rainbow doesn't wait for the end)
    if (this.falling === 'sunshower' && this.fallT > 9 && ctx.sunUp && !this.bowT && this.bow < 0.01) this.startBow(out);
    if (this.bowT > 0) this.bowT = Math.max(0, this.bowT - dt);
    this.bow += ((this.bowT > 0 && ctx.sunUp !== false ? 1 : 0) - this.bow) * (1 - Math.exp(-dt / 2.4));

    // the ground remembers: puddles fill and dry, snow settles and melts
    this.wet = clamp(this.wet + (this.rain > 0.05 ? (this.rain * dt) / 40 : -dt / 170));
    this.white = clamp(this.white + (this.snow > 0.05 ? (this.snow * dt) / 50 : -dt / (ctx.night ? 260 : 80)) - (this.rain * dt) / 12);
    return out;
  }

  startBow(out) {
    this.bowT = 48;
    out.push({ type: 'rainbow' });
  }

  get raining() { return this.rain > 0.1; }
  get snowing() { return this.snow > 0.1; }
}

/** How full a puddle is (0–1) for a given wetness of the ground. */
export const puddleFill = (P, wet) => clamp((wet - P.th) / 0.42);

// ---------------------------------------------------------------- drawing
// lumps of a cloud along its flat base: [x, r]
function lumps(rng) {
  const n = 4 + Math.floor(rng() * 3);
  const out = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const r = (24 + rng() * 16) * (0.55 + 0.65 * Math.sin(u * Math.PI));
    out.push([x, r]);
    x += r * (0.95 + rng() * 0.4);
  }
  const mid = (out[0][0] + out[n - 1][0]) / 2;
  return out.map(([lx, r]) => [lx - mid, r]);
}

const circle = (x, y, rx, ry = rx) => `M ${f2(x - rx)},${f2(y)} a ${f2(rx)},${f2(ry)} 0 1 0 ${f2(rx * 2)},0 a ${f2(rx)},${f2(ry)} 0 1 0 ${f2(-rx * 2)},0 `;

/** A polygon wound the same way as circle() (shapes of one path must agree, or their overlaps turn into holes). */
function poly(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; }
  const p = a > 0 ? pts.slice().reverse() : pts;
  return `M ${p.map(([x, y]) => `${f2(x)},${f2(y)}`).join(' L ')} Z `;
}

/** A cloud's outline (its base is the line y = 0) and the light on its tops. */
function cloudShape(rng, kind) {
  let L, extra = '', hiExtra = '';
  if (kind === 'fox') {
    // a round head and two pointed ears (and, if you want to see it, a tail)
    L = [[-36, 26], [0, 38], [36, 26], [78, 17]];
    extra = poly([[-42, -40], [-30, -92], [-6, -52]]) + poly([[6, -52], [30, -92], [42, -40]]);
    hiExtra = poly([[-34, -56], [-29, -80], [-18, -58]]);
  } else if (kind === 'fish') {
    L = [[-30, 24], [0, 30], [30, 24]];
    extra = poly([[44, -16], [92, -46], [80, -16], [92, -2], [60, -2]]);
  } else if (kind === 'rabbit') {
    L = [[-18, 30], [20, 24], [48, 13]];
    extra = `${circle(-30, -70, 8, 30)}${circle(-10, -74, 8, 30)}`;
  } else L = lumps(rng);
  let body = extra, hi = hiExtra;
  const x0 = L[0][0] - L[0][1] * 0.8, x1 = L[L.length - 1][0] + L[L.length - 1][1] * 0.8;
  for (const [x, r] of L) {
    body += circle(x, -r * 0.5, r);
    hi += circle(x - r * 0.16, -r * 0.5 - r * 0.46, r * 0.62, r * 0.3);
  }
  body += poly([[x0, 0], [x0, -10], [x1, -10], [x1, 0]]);
  const belly = poly([[x0, 0], [x0, -8], [x1, -8], [x1, 0]]);
  const w = Math.max(-L[0][0] + L[0][1], L[L.length - 1][0] + L[L.length - 1][1]);
  const h = Math.max(...L.map(([, r]) => r * 1.5)) + (extra ? 30 : 0);
  return { body, hi, belly, w, h };
}

const RANKS = [0.02, 0.5, 0.07, 0.3, 0.66, 0.11, 0.4, 0.8, 0.22, 0.58, 0.74, 0.9];
const SHAPES = ['fox', 'fish', 'rabbit'];

export class GardenWeather {
  buildWeather() {
    const host = $('clouds');
    const defs = svgEl('defs', {}, host.ownerSVGElement);
    const clip = svgEl('clipPath', { id: 'cloud-clip' }, defs);
    svgEl('rect', { x: -400, y: -300, width: 800, height: 300 }, clip);
    const rng = makeRng(97);
    this.cloudRng = rng;
    this.clouds = [];
    for (let i = 0; i < RANKS.length; i++) {
      const g = svgEl('g', { class: 'cloud' }, host);
      const inner = svgEl('g', { 'clip-path': 'url(#cloud-clip)' }, g);
      const c = {
        g, inner, i, rank: RANKS[i], u: (i + rng() * 0.7) / RANKS.length, v: rng(),
        s: 0.75 + rng() * 0.7, speed: 3.2 + rng() * 3.4, x: 0, y: 0, drawn: null, shown: -1,
        squish: new Spring(0, 2.6, 0.3), wrung: 0, kind: null,
      };
      this.shapeCloud(c);
      this.clouds.push(c);
    }
    this.cloudsPlaced = false;

    // puddles: a darker rim of wet sand, the sky in the water, a line of light
    const ph = $('puddles');
    this.puddles = PUDDLES.map((P) => {
      const g = svgEl('g', { transform: `translate(${P.x} ${P.y})` }, ph);
      const inner = svgEl('g', {}, g);
      svgEl('ellipse', { rx: f2(P.rx * 1.14), ry: f2(P.rx * 0.275), class: 'puddle-rim' }, inner);
      svgEl('ellipse', { rx: P.rx, ry: f2(P.rx * 0.225), class: 'puddle-water' }, inner);
      svgEl('path', { d: `M ${f2(-P.rx * 0.62)},${f2(-P.rx * 0.05)} Q ${f2(-P.rx * 0.1)},${f2(-P.rx * 0.17)} ${f2(P.rx * 0.46)},${f2(-P.rx * 0.1)}`, class: 'puddle-hi' }, inner);
      g.style.display = 'none';
      return { ...P, g, inner, fill: 0, drawn: -1, wob: new Spring(0, 3.2, 0.25) };
    });

    // the rainbow: bands of color, standing on the far shore
    const bow = $('rainbow');
    const colors = ['#e8584a', '#f0913f', '#f3cf4f', '#7fc27a', '#5aa6d6', '#7a78c8'];
    this.bowArcs = colors.map((c, i) => svgEl('path', { class: 'bow-band', stroke: c }, bow));
    this.bowDrawn = '';

    this.wx = {
      cv: $('weather'), g: $('weather').getContext('2d'), drops: [], flakes: [], rings: [], spray: [], sprinkles: [],
      shown: false, rng: makeRng(131), fishAt: 40 + this.rng() * 40, fish: null, wedding: null,
    };
  }

  /** Give a cloud a (new) shape. Now and then one looks remarkably like something. */
  shapeCloud(c, kind = null) {
    const sh = cloudShape(this.cloudRng, kind);
    c.kind = kind;
    c.w = sh.w;
    c.h = sh.h;
    c.inner.textContent = '';
    svgEl('path', { d: sh.body, class: 'cloud-body' }, c.inner);
    svgEl('path', { d: sh.belly, class: 'cloud-belly' }, c.inner);
    svgEl('path', { d: sh.hi, class: 'cloud-hi' }, c.inner);
  }

  layoutWeather() {
    const wx = this.wx;
    if (!wx) return;
    const W = this.W, H = this.H;
    if (wx.cv.width !== W || wx.cv.height !== H) { wx.cv.width = W; wx.cv.height = H; }
    const n = Math.round(clamp((W * H) / 5200, 90, 300));
    wx.drops = [];
    for (let i = 0; i < n; i++) wx.drops.push(this.newDrop({}, true));
    const m = Math.round(clamp((W * H) / 6500, 70, 220));
    wx.flakes = [];
    for (let i = 0; i < m; i++) {
      const z = 0.4 + Math.pow(wx.rng(), 1.6) * 1.5;
      wx.flakes.push({ x: wx.rng() * W, y: wx.rng() * H, z, ph: wx.rng() * TAU, r: (1 + wx.rng() * 1.5) * z, vy: (34 + wx.rng() * 36) * z });
    }
    this.cloudsPlaced = false;
    this.bowDrawn = '';
  }

  /** The span of the cloud layer the camera can ever see, in its own coordinates. */
  cloudSpan() {
    const b = this.baseVb, M = this.camMargin + 120;
    return { x0: b.x - M, x1: b.x + b.w + M, top: b.y - 30, low: 322 };
  }

  newDrop(d, anywhere = false) {
    const wx = this.wx, W = this.W, H = this.H, S = this.scale, r = wx.rng;
    const far = r() < 0.3;
    if (far) {
      d.z = 0.42 + r() * 0.2;
      d.end = H * (0.3 + r() * 0.4);
      d.ring = false;
    } else {
      // it lands somewhere on the terrace: nearer rows are bigger and faster
      const bottom = this.vb.y + this.vb.h;
      const wy = 716 + Math.pow(r(), 1.15) * Math.max(40, bottom - 716);
      d.wy = wy;
      d.z = clamp(depthScale(wy), 0.7, 1.7);
      d.end = (wy - this.vb.y) * S + this.tilt;
      d.ring = true;
    }
    d.x = -W * 0.1 + r() * W * 1.35;
    d.vy = (820 + r() * 320) * d.z * Math.max(0.7, S);
    d.len = (15 + r() * 14) * d.z * Math.max(0.7, S);
    d.y = anywhere ? r() * d.end : -d.len - r() * H * 0.3;
    return d;
  }

  // ------------------------------------------------------------------ what Kon (and the rest) can know
  weatherInfo() {
    const w = this.weather;
    return {
      kind: w.kind, rain: w.rain, snow: w.snow, cover: w.cover, wet: w.wet, white: w.white,
      falling: w.falling, bow: w.bow > 0.3 ? this.bowAt : null,
      puddles: this.puddles.filter((p) => p.fill > 0.45).map((p) => ({ id: p.id, x: p.x, y: p.y, rx: p.rx, fill: p.fill })),
    };
  }

  /** Force the weather (demos, tests, ?weather=): 'clear', 'cloudy', 'rain', 'sunshower', 'snow'. */
  setWeather(kind, { dur = 70, instant = false, then = [] } = {}) {
    const w = this.weather;
    w.set(kind, dur, then);
    if (instant) {
      const K = { clear: [0.14, 0, 0], cloudy: [0.72, 0, 0], rain: [0.94, 1, 0], sunshower: [0.3, 0.62, 0], snow: [0.82, 0, 1] }[kind];
      [w.cover, w.rain, w.snow] = K;
      if (kind === 'rain' || kind === 'sunshower') w.wet = Math.max(w.wet, 0.75);
      if (kind === 'snow') w.white = Math.max(w.white, 0.8);
    }
  }

  /** The hour's palette as the weather leaves it: softer, greyer light under cloud. */
  weatherLight(p) {
    const w = this.weather;
    const k = smoothstep(0.2, 0.95, w.cover) * (w.kind === 'sunshower' ? 0.35 : 1);
    if (k < 0.01) return p;
    const grey = (c, f, dim) => {
      const l = c[0] * 0.3 + c[1] * 0.5 + c[2] * 0.2;
      return [lerp(c[0], l * 0.88, f) * dim, lerp(c[1], l * 0.92, f) * dim, lerp(c[2], l * 1.02, f) * dim];
    };
    return {
      ...p,
      amb: grey(p.amb, 0.7 * k, 1 - 0.17 * k), ambSun: grey(p.ambSun, 0.9 * k, 1 - 0.21 * k),
      rays: p.rays * (1 - k) * (1 - k), dapple: p.dapple * (1 - k), vig: p.vig + 0.1 * k, lift: p.lift * (1 - 0.35 * k),
    };
  }

  // ------------------------------------------------------------------ things that happen in it
  /** A splash on the ground at (x, y): rings, and drops flying up. k: how big. */
  splash(x, y, k = 1, quiet = false) {
    const wx = this.wx;
    const r = wx.rng;
    wx.rings.push({ wx: x, wy: y, t: 0, dur: 0.55 + 0.3 * k, r: 26 * k }, { wx: x, wy: y, t: -0.12, dur: 0.7 + 0.3 * k, r: 40 * k });
    const n = Math.round(7 + 9 * k);
    for (let i = 0; i < n && wx.spray.length < 120; i++) {
      const a = r() * TAU;
      wx.spray.push({ x: x + Math.cos(a) * 8, y, h: 4, vx: Math.cos(a) * (40 + r() * 90) * k, vy: Math.sin(a) * 14, vh: (130 + r() * 190) * Math.sqrt(k), t: 0, r: 1.6 + r() * 2 });
    }
    const P = this.puddles.find((p) => Math.hypot((x - p.x) / p.rx, (y - p.y) / (p.rx * 0.3)) < 1.3);
    if (P) P.wob.v += 2.2 * k;
    if (!quiet) this.emit({ type: 'sfx', name: 'splash', k });
  }

  /** Kon shakes itself dry: drops fly off in every direction. */
  shakeDrops(at, k = 1) {
    const wx = this.wx;
    const r = wx.rng;
    const ground = this.konAt ? this.konAt.y : at.y + 80;
    for (let i = 0; i < 26 && wx.spray.length < 140; i++) {
      const a = r() * TAU;
      wx.spray.push({ x: at.x + Math.cos(a) * 30, y: ground, h: Math.max(10, ground - at.y + Math.sin(a) * 40), vx: Math.cos(a) * (120 + r() * 160) * k, vy: 0, vh: 60 + Math.sin(a) * 120 + r() * 80, t: 0, r: 1.4 + r() * 1.8 });
    }
  }

  /** The puddle (if any) with water in it at a point on the ground. */
  puddleAt(x, y) {
    return this.puddles.find((p) => p.fill > 0.3 && Math.hypot((x - p.x) / (p.rx * p.fill), (y - p.y) / (p.rx * 0.24 * p.fill)) < 1) || null;
  }

  /** A puff of sand where something small came up (or went under). */
  dustPuff(x, y, k = 1) {
    this.wx.rings.push({ wx: x, wy: y, t: 0, dur: 0.42, r: 17 * k });
  }

  /** Kon's snow fox: how far along it is (0–1). It stands until the snow goes. */
  growSnowfox(k) {
    this.snowfoxT = Math.max(this.snowfoxT || 0, k);
    if (!OBSTACLES.some((o) => o.id === 'snowfox')) OBSTACLES.push({ id: 'snowfox', x: 716, y: 950, rx: 22, ry: 8 });
  }

  updateSnowfox(dt) {
    if (!this.snowfoxT && !this.snowfoxK) return;
    // (once the snow on the ground is nearly gone, it sinks away too)
    if (this.weather.white < 0.1) this.snowfoxT = 0;
    const k0 = this.snowfoxK || 0;
    const k = k0 + clamp(this.snowfoxT - k0, -dt / 14, dt * 1.6);
    this.snowfoxK = k;
    const el = $('snowfox');
    if (k < 0.01) {
      el.style.display = 'none';
      this.snowfoxK = 0;
      const i = OBSTACLES.findIndex((o) => o.id === 'snowfox');
      if (i >= 0) OBSTACLES.splice(i, 1);
      return;
    }
    const key = Math.round(k * 100);
    if (key === this.snowfoxDrawn) return;
    this.snowfoxDrawn = key;
    el.style.display = '';
    $('snowfox-g').setAttribute('transform', `translate(716 950) scale(${f2(1.4 * (0.55 + 0.45 * k))} ${f2(1.4 * (0.55 + 0.45 * k) * (0.5 + 0.5 * smoothstep(0, 0.3, k)))})`);
    $('snowfox-head').style.opacity = f2(smoothstep(0.36, 0.6, k));
    $('snowfox-face').style.opacity = f2(smoothstep(0.7, 0.98, k));
  }

  /** A click on the sky: is there a cloud under it? It gets squeezed, and lets go of a little rain. */
  cloudTap(px, py) {
    if (!this.clouds) return false;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      if (c.shown < 0.5) continue;
      const s = c.s * this.cloudGrow;
      const p = this.farToScreen(c.x, c.y - c.h * s * 0.45, CLOUD_DEPTH);
      const rx = c.w * s * this.scale + 14, ry = c.h * s * 0.55 * this.scale + 14;
      if (Math.hypot((px - p.x) / rx, (py - p.y) / ry) > 1) continue;
      c.squish.v += 3.2;
      c.wrung = 1;
      this.wx.sprinkles.push({ c, t: 0, dur: 3.4 });
      // where it comes down, on the ground (the cloud is far away: use where it shows on screen)
      const g = this.toWorldLocal(p.x, py);
      const onKon = this.konAt && Math.abs(g.x - this.konAt.x) < c.w * s * 0.8 + 40;
      this.emit({ type: 'cloudPoke', x: g.x, y: g.y, onKon: !!onKon });
      this.emit({ type: 'sfx', name: 'squeeze' });
      return true;
    }
    return false;
  }

  /** The fox wedding: a line of lanterns along the far shore, across the water, and through the gate. */
  startWedding() {
    if (this.wx.wedding) return;
    this.wx.wedding = { t: 0, told: false };
  }

  /** Where the wedding lanterns walk: u in 0–1 → a point in the valley. */
  weddingPoint(u) {
    const T = this.lakeTorii || { x: 986, y: 454 };
    if (u < 0.7) return { x: lerp(566, 900, u / 0.7), y: 405, water: false };
    const v = (u - 0.7) / 0.3;
    // …and then, impossibly, out over the lake to the torii standing in the water
    return { x: lerp(900, T.x, v), y: lerp(405, T.y + 20, v * v), water: true };
  }

  // ------------------------------------------------------------------ per frame
  updateWeather(dt) {
    const w = this.weather;
    const p = this.sky.p;
    const sunUp = p.sun.up && p.sun.alt > 0.1;
    for (const ev of w.update(dt, { night: this.dark, sunUp })) {
      this.emit(ev);
      if (ev.type === 'rainStart' && ev.kind === 'sunshower') this.weddingAt = this.t + 7;
    }
    if (this.weddingAt && this.t > this.weddingAt) { this.weddingAt = 0; if (w.kind === 'sunshower') this.startWedding(); }

    // the sky under cloud: tell the palette (a few times a second is plenty)
    const dim = smoothstep(0.2, 0.95, w.cover);
    const sunBlock = dim * (w.kind === 'sunshower' ? 0.3 : 1);
    if (Math.abs(dim - (this.appliedDim ?? -1)) > 0.012 || Math.abs(sunBlock - (this.appliedSunBlock ?? -1)) > 0.012) {
      this.appliedDim = dim;
      this.appliedSunBlock = sunBlock;
      this.sky.overcast = dim;
      this.sky.apply();
      this.updateSkyBodies();   // (a fresh palette: the sun and moon need placing again)
      const st = this.app.style;
      st.setProperty('--clear', (1 - 0.92 * smoothstep(0.3, 0.9, w.cover)).toFixed(3));
      st.setProperty('--sun-a', (1 - sunBlock).toFixed(3));
      st.setProperty('--overcast', (0.78 * smoothstep(0.4, 0.95, w.cover) * (w.kind === 'sunshower' ? 0.3 : 1)).toFixed(3));
    }
    this.updateClouds(dt);
    this.updateGround(dt);
    this.updateSnowfox(dt);
    this.updateBow();
    this.drawWeather(dt);
  }

  updateClouds(dt) {
    if (!this.baseVb) return;
    const w = this.weather;
    const span = this.cloudSpan();
    const width = span.x1 - span.x0;
    if (!this.cloudsPlaced) {
      this.cloudsPlaced = true;
      for (const c of this.clouds) { c.x = span.x0 + c.u * width; c.drawn = null; }
    }
    this.cloudGrow = 1 + 0.55 * smoothstep(0.2, 0.9, w.cover);
    const drift = this.reduced ? 0.25 : 1 + this.wind * 2.4;
    for (const c of this.clouds) {
      c.x -= c.speed * drift * dt;
      const s = c.s * this.cloudGrow;
      if (c.x < span.x0 - c.w * s) {
        // round the far side and come back as a different cloud (once in a while, a familiar shape)
        c.x = span.x1 + c.w * s;
        const special = !this.reduced && w.cover < 0.4 && this.sky.p.stars < 0.3 && this.cloudRng() < 0.16;
        this.shapeCloud(c, special ? SHAPES[Math.floor(this.cloudRng() * SHAPES.length)] : null);
        c.v = this.cloudRng();
        if (special) { c.v = 0.5 + this.cloudRng() * 0.3; c.told = false; }
      }
      // low clouds sit on the horizon's haze; high ones may be cut by the top of the frame
      // (on a very wide screen only a sliver of sky shows: keep at least their bases in it)
      const hi = Math.max(span.top + c.h * 0.6, this.baseVb.y + 26);
      c.y = lerp(hi, Math.max(span.low, hi + 12), Math.pow(c.v, 0.8));
      const shown = c.kind ? 1 : smoothstep(c.rank - 0.1, c.rank + 0.07, w.cover);
      if (Math.abs(shown - c.shown) > 0.01) {
        c.shown = shown;
        c.g.style.display = shown < 0.01 ? 'none' : '';
        c.g.style.opacity = f2(shown * (c.kind ? 0.96 : 0.9));
      }
      const sq = c.squish.step(dt, 0);
      c.wrung = Math.max(0, c.wrung - dt / 5);
      if (shown < 0.01) continue;
      const key = `${Math.round(c.x * 2)}|${Math.round(c.y)}|${Math.round(s * 50)}|${Math.round(sq * 40)}`;
      if (key !== c.drawn) {
        c.drawn = key;
        const k = s * (1 - c.wrung * 0.12);
        c.g.setAttribute('transform', `translate(${f2(c.x)} ${f2(c.y)}) scale(${f2(k * (1 + sq * 0.16))} ${f2(k * (1 - sq * 0.2))})`);
      }
      // a cloud shaped like something drifts into view: worth a look
      if (c.kind && !c.told && this.konSitting) {
        const q = this.farToScreen(c.x, c.y - c.h * s * 0.5, CLOUD_DEPTH);
        if (q.x > this.W * 0.2 && q.x < this.W * 0.72 && q.y > 10) {
          c.told = true;
          const at = this.toWorldLocal(q.x, q.y);
          this.emit({ type: 'cloudShape', shape: c.kind, x: at.x, y: at.y });
        }
      }
    }
  }

  /** Wet sand, puddles, lying snow. */
  updateGround(dt) {
    const w = this.weather;
    const wetKey = Math.round(w.wet * 60);
    if (wetKey !== this.wetKey) { this.wetKey = wetKey; $('wet-sand').style.opacity = f2(w.wet * 0.2); }
    const whiteKey = Math.round(w.white * 80);
    if (whiteKey !== this.whiteKey) {
      this.whiteKey = whiteKey;
      this.app.style.setProperty('--white', w.white.toFixed(3));
      document.body.classList.toggle('is-snowy', w.white > 0.02);
    }
    const wetNow = w.rain > 0.3;
    if (wetNow !== this.wetNow) { this.wetNow = wetNow; document.body.classList.toggle('is-rainy', wetNow); }
    for (const P of this.puddles) {
      const fill = puddleFill(P, w.wet) * (1 - smoothstep(0.3, 0.8, w.white));
      P.fill = fill;
      const wob = P.wob.step(dt, 0);
      const key = Math.round(fill * 80) + Math.round(wob * 60) * 1000;
      if (key === P.drawn) continue;
      P.drawn = key;
      P.g.style.display = fill < 0.02 ? 'none' : '';
      if (fill < 0.02) continue;
      const k = 0.3 + 0.7 * fill;
      P.inner.setAttribute('transform', `scale(${f2(k * (1 + wob * 0.05))} ${f2(k * (1 - wob * 0.12))})`);
      P.g.style.opacity = f2(smoothstep(0, 0.3, fill));
    }
  }

  updateBow() {
    const w = this.weather;
    const host = $('rainbow');
    const on = w.bow > 0.01;
    if (on !== this.bowOn) { this.bowOn = on; host.style.display = on ? '' : 'none'; }
    if (!on || !this.baseVb) return;
    host.style.opacity = f2(w.bow * 0.62);
    // opposite the sun, feet on the far shore
    const b = this.baseVb;
    const side = this.sky.p.sun.fx < 0.5 ? 1 : -1;
    const cx = b.x + b.w * (0.5 + side * (this.mode === 'wide' ? 0.2 : 0.06));
    const R = this.mode === 'wide' ? clamp(404 - b.y - 36, 110, 190) : 190;
    const key = `${Math.round(cx)}|${Math.round(R)}`;
    if (key !== this.bowDrawn) {
      this.bowDrawn = key;
      this.bowArcs.forEach((el, i) => {
        const r = R - i * 4.6;
        el.setAttribute('d', `M ${f2(cx - r)},408 A ${f2(r)},${f2(r)} 0 0 1 ${f2(cx + r)},408`);
      });
    }
    const top = this.farToScreen(cx + side * R * 0.5, 408 - R * 0.86, CLOUD_DEPTH);
    this.bowAt = this.toWorldLocal(top.x, top.y);
  }

  drawWeather(dt) {
    const wx = this.wx;
    const w = this.weather;
    const g = wx.g;
    const W = this.W, H = this.H, S = this.scale;
    if (!W) return;
    // life on the lake, whatever the weather: a fish jumps now and then
    if (!wx.fish && this.t > wx.fishAt && !this.reduced) {
      wx.fishAt = this.t + 45 + this.rng() * 70;
      if (this.autoGusts && this.sky.p.stars < 0.6 && w.white < 0.3) this.fishJump();
    }
    const busy = w.rain > 0.01 || w.snow > 0.01 || wx.rings.length || wx.spray.length || wx.sprinkles.length || wx.fish || wx.wedding;
    if (busy !== wx.shown) {
      wx.shown = busy;
      wx.cv.style.display = busy ? '' : 'none';
      if (!busy) g.clearRect(0, 0, W, H);
    }
    if (!busy) return;
    g.clearRect(0, 0, W, H);
    const night = this.sky.p.stars > 0.5;
    const slant = 0.1 + this.wind * 0.55;

    // ---- the fox wedding, far across the lake (drawn first: the rain falls in front of it)
    if (wx.wedding) this.drawWedding(g, dt);

    // ---- rain
    if (w.rain > 0.01) {
      // (fewer of them when the visitor has asked for less motion)
      const n = Math.floor(wx.drops.length * clamp(w.rain) * (this.reduced ? 0.35 : 1));
      g.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        // far drops are thin and faint, near ones are bright
        g.strokeStyle = pass ? `rgba(${night ? '190,204,240' : '255,255,255'},${night ? 0.34 : 0.5})` : `rgba(${night ? '170,186,226' : '236,242,250'},${night ? 0.2 : 0.3})`;
        g.lineWidth = pass ? Math.max(1, 1.5 * S) : 1;
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const d = wx.drops[i];
          if ((d.z > 0.95) !== !!pass) continue;
          g.moveTo(d.x, d.y);
          g.lineTo(d.x + slant * d.len, d.y - d.len);
        }
        g.stroke();
      }
      for (let i = 0; i < n; i++) {
        const d = wx.drops[i];
        d.y += d.vy * dt;
        d.x -= slant * d.vy * dt;
        if (d.y >= d.end) {
          if (d.ring && wx.rings.length < 70) {
            const ax = this.vb.x + d.x / S;
            const inPuddle = this.puddles.some((P) => P.fill > 0.2 && Math.hypot((ax - P.x) / (P.rx * P.fill), (d.wy - P.y) / (P.rx * 0.22 * P.fill)) < 1);
            wx.rings.push({ wx: ax, wy: d.wy, t: 0, dur: inPuddle ? 0.7 : 0.32, r: inPuddle ? 15 : 7, wet: inPuddle });
          }
          this.newDrop(d);
        }
      }
      // rings on the basin's water, and on the lake far below
      if (wx.rng() < dt * 5 * w.rain) wx.rings.push({ wx: 440 + wx.rng() * 62, wy: 884 + (wx.rng() - 0.5) * 9, t: 0, dur: 0.6, r: 9, wet: true });
      if (this.lakeOpen) {
        g.fillStyle = `rgba(255,255,255,${0.3 * w.rain})`;
        for (let i = 0; i < 14; i++) {
          const lx = this.baseVb.x + wx.rng() * this.baseVb.w, ly = 412 + wx.rng() * 110;
          if (ly > this.lakeOpen(lx)) continue;
          const q = this.farToStage(lx, ly, VALLEY_DEPTH);
          g.fillRect(q.x, q.y, (3 + wx.rng() * 5) * S, 1);
        }
      }
    }

    // ---- a private shower under a cloud that got squeezed
    for (let i = wx.sprinkles.length - 1; i >= 0; i--) {
      const sp = wx.sprinkles[i];
      sp.t += dt;
      if (sp.t > sp.dur) { wx.sprinkles.splice(i, 1); continue; }
      const c = sp.c;
      const s = c.s * (this.cloudGrow || 1);
      const top = this.farToStage(c.x, c.y, CLOUD_DEPTH);
      const half = c.w * s * 0.8 * S;
      const a = smoothstep(0, 0.3, sp.t) * (1 - smoothstep(sp.dur - 1, sp.dur, sp.t));
      const ground = this.toStage(0, 900).y;
      g.strokeStyle = `rgba(255,255,255,${0.5 * a})`;
      g.lineWidth = Math.max(1, 1.3 * S);
      g.beginPath();
      for (let k = 0; k < 26; k++) {
        const u = (k * 0.618034) % 1;
        const ph = ((this.t * (1.6 + (k % 5) * 0.14) + k * 0.37) % 1);
        const x = top.x - half + u * half * 2;
        const y = lerp(top.y, ground + (k % 7) * 9 * S, ph);
        g.moveTo(x, y);
        g.lineTo(x + 1, y - 13 * S);
      }
      g.stroke();
      if (wx.rng() < dt * 16 * a) {
        const at = this.toWorldLocal(top.x - half + wx.rng() * half * 2, ground);
        wx.rings.push({ wx: at.x, wy: 860 + wx.rng() * 90, t: 0, dur: 0.34, r: 8 });
      }
    }

    // ---- rings where drops land
    if (wx.rings.length) {
      g.lineWidth = Math.max(1, 1.2 * S);
      for (let i = wx.rings.length - 1; i >= 0; i--) {
        const r = wx.rings[i];
        r.t += dt;
        if (r.t < 0) continue;
        const u = r.t / r.dur;
        if (u >= 1) { wx.rings.splice(i, 1); continue; }
        const q = this.toStage(r.wx, r.wy);
        const z = depthScale(r.wy);
        const rad = r.r * (0.25 + 0.75 * u) * z * S;
        g.strokeStyle = `rgba(255,255,255,${(r.wet ? 0.7 : 0.5) * (1 - u) * (night ? 0.6 : 1)})`;
        g.beginPath();
        g.ellipse(q.x, q.y, rad, rad * 0.3, 0, 0, TAU);
        g.stroke();
      }
    }

    // ---- drops thrown up by a splash (or a shaken fox)
    if (wx.spray.length) {
      g.fillStyle = night ? 'rgba(214,226,255,0.85)' : 'rgba(255,255,255,0.9)';
      g.beginPath();
      for (let i = wx.spray.length - 1; i >= 0; i--) {
        const d = wx.spray[i];
        d.t += dt;
        d.vh -= 620 * dt;
        d.h += d.vh * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.h <= 0 || d.t > 1.6) { wx.spray.splice(i, 1); continue; }
        const z = depthScale(d.y);
        const q = this.toStage(d.x, d.y - d.h * z);
        g.moveTo(q.x + d.r * z * S, q.y);
        g.arc(q.x, q.y, d.r * z * S, 0, TAU);
      }
      g.fill();
    }

    // ---- a fish jumps in the lake
    if (wx.fish) this.drawFish(g, dt);

    // ---- snow
    if (w.snow > 0.01) {
      const n = Math.floor(wx.flakes.length * clamp(w.snow) * (this.reduced ? 0.4 : 1));
      const t = this.t;
      for (let pass = 0; pass < 2; pass++) {
        // (the nearest flakes are out of focus: big and faint)
        g.fillStyle = pass ? `rgba(${night ? '214,224,250' : '255,255,255'},${night ? 0.3 : 0.4})` : `rgba(${night ? '226,234,255' : '255,255,255'},${night ? 0.8 : 0.92})`;
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const f = wx.flakes[i];
          if ((f.z > 1.45) !== !!pass) continue;
          const r = f.r * Math.max(0.75, S) * (pass ? 1.9 : 1);
          g.moveTo(f.x + r, f.y);
          g.arc(f.x, f.y, r, 0, TAU);
        }
        g.fill();
      }
      for (let i = 0; i < n; i++) {
        const f = wx.flakes[i];
        f.y += f.vy * Math.max(0.75, S) * dt;
        f.x += (Math.sin(t * 0.9 + f.ph) * 16 - this.wind * 150) * f.z * dt;
        if (f.y > H + 6) { f.y = -6; f.x = wx.rng() * W * 1.2; }
        if (f.x < -8) f.x += W + 16;
        else if (f.x > W + 8) f.x -= W + 16;
      }
    }
  }

  fishJump() {
    const b = this.baseVb;
    for (let i = 0; i < 8; i++) {
      const x = b.x + b.w * (0.3 + this.rng() * 0.4), y = 432 + this.rng() * 70;
      // somewhere on open water, and not behind Kon
      if (y > this.lakeOpen(x) - 12 || (this.konAt && Math.abs(x - this.konAt.x) < 120)) continue;
      this.wx.fish = { x, y, t: 0, dir: this.rng() < 0.5 ? -1 : 1 };
      const q = this.farToScreen(x, y, VALLEY_DEPTH);
      const at = this.toWorldLocal(q.x, q.y);
      this.emit({ type: 'notice', x: at.x, y: at.y });
      this.emit({ type: 'sfx', name: 'plip' });
      return;
    }
  }

  drawFish(g, dt) {
    const F = this.wx.fish;
    const S = this.scale;
    F.t += dt;
    const u = F.t / 0.75;
    const q = this.farToStage(F.x, F.y, VALLEY_DEPTH);
    if (u < 1) {
      // a little silver arc out of the water and back in
      const x = q.x + F.dir * (u - 0.5) * 26 * S, y = q.y - Math.sin(u * Math.PI) * 15 * S;
      const a = Math.atan2(-Math.cos(u * Math.PI) * 15, F.dir * 26 / Math.PI * 1.6);
      g.save();
      g.translate(x, y);
      g.rotate(F.dir > 0 ? a : Math.PI + a);
      g.fillStyle = 'rgba(250,246,238,0.95)';
      g.beginPath();
      g.ellipse(0, 0, 5.5 * S, 2 * S, 0, 0, TAU);
      g.moveTo(-5 * S, 0); g.lineTo(-9 * S, -2.6 * S); g.lineTo(-9 * S, 2.6 * S);
      g.fill();
      g.restore();
    }
    g.lineWidth = 1;
    for (const [x0, t0] of [[-13, 0], [13, 0.62]]) {
      const ru = (F.t - t0) / 1.3;
      if (ru <= 0 || ru >= 1) continue;
      g.strokeStyle = `rgba(255,255,255,${0.75 * (1 - ru)})`;
      g.beginPath();
      g.ellipse(q.x + F.dir * x0 * S, q.y, (3 + 13 * ru) * S, (1 + 3 * ru) * S, 0, 0, TAU);
      g.stroke();
    }
    if (F.t > 2) this.wx.fish = null;
  }

  drawWedding(g, dt) {
    const wd = this.wx.wedding;
    const S = this.scale;
    wd.t += dt;
    const head = wd.t / 46;        // how far the first lantern has come
    if (!wd.told && head > 0.16) {
      wd.told = true;
      const q = this.farToScreen(700, 405, VALLEY_DEPTH);
      const at = this.toWorldLocal(q.x, q.y);
      this.emit({ type: 'foxWedding', x: at.x, y: at.y });
      // the camera leans in toward the far shore for a while
      this.weddingFocus = { until: this.t + 10, x: at.x, y: at.y + 40, z: 1.2 };
    }
    let any = false;
    for (let i = 0; i < 11; i++) {
      const u = head - i * 0.034;
      if (u <= 0 || u >= 1) continue;
      any = true;
      const p = this.weddingPoint(u);
      const fade = smoothstep(0, 0.04, u) * (1 - smoothstep(0.95, 1, u));
      const bobY = Math.abs(Math.sin(wd.t * 3.1 + i * 1.7)) * 1.4;
      const q = this.farToStage(p.x, p.y - 5 - bobY, VALLEY_DEPTH);
      const fl = 0.8 + 0.2 * noise1(wd.t * 4 + i * 3, i);
      const R = (7 + (i % 3 === 0 ? 2 : 0)) * S + 2;
      const halo = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, R);
      halo.addColorStop(0, `rgba(255,236,190,${0.95 * fade * fl})`);
      halo.addColorStop(0.3, `rgba(255,176,84,${0.6 * fade * fl})`);
      halo.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = halo;
      g.fillRect(q.x - R, q.y - R, R * 2, R * 2);
      // each lantern's light on the water
      g.fillStyle = `rgba(255,190,110,${0.5 * fade * fl})`;
      g.fillRect(q.x - 0.7, q.y + 6 * S, 1.4, (p.water ? 12 : 7) * S);
    }
    if (head > 1 && !any) this.wx.wedding = null;
  }
}
