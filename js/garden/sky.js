// Sky — the garden's clock and the color of its light.
//
// The hour follows the visitor's local time. Clicking the lantern runs a
// time-lapse instead of a switch: the sun slides behind the hills, the sky
// burns orange, then violet, the moon climbs out from behind the left ridge.
// (Back to morning, the moon crosses the sky and the sun comes up.)
//
// A palette per key hour is blended for the current hour and handed out as
// CSS variables (the far scenery) and as numbers (the light map, light.js).
// Palette colors are what you SEE: the far scenery sits under the light map's
// multiply, so its paint is divided by the ambient light before it is applied.

import { clamp, lerp, smoothstep, bump } from '../math.js';

// ---- palettes ------------------------------------------------------------
// sky: zenith → horizon · ridge: far → near · mist: [color, opacity]
// amb: ambient light (a multiply over the garden); ambSun: the side facing the sun
// vig: vignette · stars: 0–1 · rays: sun shafts 0–1 · lamp: lantern 0–1
// dapple: leaf shade under the maple 0–1 · water: the basin's reflection
const PAL = {
  night: {
    sky: ['#0b1029', '#141c42', '#22305e', '#34437a'], ridge: ['#26315c', '#1d2650', '#161d40'],
    mist: ['#5d6aa0', 0.22], amb: '#323f75', ambSun: '#4f5f9a', vig: 0.62, stars: 1, rays: 0, lamp: 1, dapple: 0,
    water: '#2f3f72', glow: '#ffd7a0', lift: 0,
  },
  blue: {
    sky: ['#1d2550', '#3b4479', '#7d7aa6', '#d09aa0'], ridge: ['#6a6a98', '#4f5384', '#3a4271'],
    mist: ['#c3b0d0', 0.4], amb: '#8a8bb6', ambSun: '#9c8fb2', vig: 0.45, stars: 0.45, rays: 0, lamp: 0.8, dapple: 0,
    water: '#7b7fae', glow: '#ffd7a0', lift: 0.15,
  },
  sunrise: {
    sky: ['#7187bd', '#b2aac6', '#f1bea4', '#ffd6a0'], ridge: ['#b7a4bf', '#998fb0', '#7b7d9e'],
    mist: ['#fde3cc', 0.7], amb: '#f0d6cc', ambSun: '#ffdcb4', vig: 0.32, stars: 0, rays: 0.7, lamp: 0.25, dapple: 0.5,
    water: '#d6b9bd', glow: '#ffd09a', lift: 0.45,
  },
  morning: {
    sky: ['#86b0cc', '#b5d0d8', '#e9e6d4', '#f7eedb'], ridge: ['#c4cfcc', '#a9b9b2', '#8da293'],
    mist: ['#fbf6ea', 0.85], amb: '#f7f4f2', ambSun: '#fff3e0', vig: 0.18, stars: 0, rays: 0.55, lamp: 0, dapple: 0.85,
    water: '#a9c8cc', glow: '#fff1c9', lift: 0.5,
  },
  day: {
    sky: ['#7ba8c8', '#acc9d5', '#e2e4d6', '#f5efdf'], ridge: ['#c1ccca', '#a6b6ae', '#8b9f8e'],
    mist: ['#fbf8ee', 0.85], amb: '#fbf9f6', ambSun: '#fffaf0', vig: 0.14, stars: 0, rays: 0.4, lamp: 0, dapple: 1,
    water: '#a3c6ca', glow: '#fff3cf', lift: 0.5,
  },
  afternoon: {
    sky: ['#98b5c6', '#c3cfcb', '#ede0c4', '#f7e4c0'], ridge: ['#c8c6ba', '#aeb19f', '#929b83'],
    mist: ['#fcefd6', 0.85], amb: '#f7ecdf', ambSun: '#ffe9c8', vig: 0.2, stars: 0, rays: 0.6, lamp: 0, dapple: 1,
    water: '#b3c4bb', glow: '#ffe7b0', lift: 0.55,
  },
  golden: {
    sky: ['#7690bb', '#b9b3bd', '#f2c995', '#ffd27e'], ridge: ['#c4a9a4', '#a08e98', '#7d7385'],
    mist: ['#ffe0a6', 0.8], amb: '#f2cfb2', ambSun: '#ffd596', vig: 0.34, stars: 0, rays: 1, lamp: 0.15, dapple: 0.9,
    water: '#e3c49a', glow: '#ffd27a', lift: 0.65,
  },
  sunset: {
    sky: ['#4f5d98', '#b0849f', '#ee9b72', '#ffbd6a'], ridge: ['#9e7a96', '#7b6587', '#5c5172'],
    mist: ['#ffc39a', 0.7], amb: '#cf9a9c', ambSun: '#ffb879', vig: 0.42, stars: 0.05, rays: 0.8, lamp: 0.65, dapple: 0.5,
    water: '#d99a8a', glow: '#ffc070', lift: 0.55,
  },
  dusk: {
    sky: ['#1b2250', '#383b72', '#755c8a', '#c48686'], ridge: ['#575281', '#403d69', '#2e2d55'],
    mist: ['#a18db6', 0.38], amb: '#8781ac', ambSun: '#9a86aa', vig: 0.48, stars: 0.55, rays: 0, lamp: 1, dapple: 0,
    water: '#6b6c9c', glow: '#ffd7a0', lift: 0.2,
  },
};

const KEYS = [
  [0, 'night'], [4.7, 'night'], [5.5, 'blue'], [6.3, 'sunrise'], [7.6, 'morning'], [11, 'day'],
  [15, 'afternoon'], [17.3, 'golden'], [18.3, 'sunset'], [19.1, 'dusk'], [20.2, 'night'], [24, 'night'],
];

// the sun is up from 6.2 to 18.6; it rises on the left and sets on the right
const SUNRISE = 6.2, SUNSET = 18.6;
const NIGHT_FROM = 19, NIGHT_TO = 5.5;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const PALRGB = Object.fromEntries(Object.entries(PAL).map(([k, p]) => [k, {
  ...p,
  sky: p.sky.map(hex), ridge: p.ridge.map(hex), mist: [hex(p.mist[0]), p.mist[1]],
  amb: hex(p.amb), ambSun: hex(p.ambSun), water: hex(p.water), glow: hex(p.glow),
}]));

const mixRGB = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c) => `rgb(${c.map((v) => Math.round(clamp(v, 0, 255))).join(' ')})`;
/** Paint that looks like `want` once the ambient light has multiplied it. */
const under = (want, amb) => want.map((v, i) => clamp((v * 255) / Math.max(amb[i], 30), 0, 255));

/** How much the ambient light is lifted toward white at a height of the world (0 at the horizon). */
export const skyLift = (p, y) => p.lift * clamp((440 - y) / 240);

/** How slowly a time-lapse passes through an hour. */
const dwell = (h) => {
  const x = ((h % 24) + 24) % 24;
  return 1 + 4 * bump(16.4, 19.8, x) + 2.5 * bump(4.9, 7.5, x);
};

export const isNightHour = (h) => h >= NIGHT_FROM || h < NIGHT_TO;
export const periodOf = (h) => (isNightHour(h) ? 'night' : h >= 17 ? 'dusk' : h < 7.5 ? 'dawn' : 'day');

/** The blended palette for an hour (0–24). */
export function paletteAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
  const [h0, k0] = KEYS[i], [h1, k1] = KEYS[i + 1];
  const t = smoothstep(0, 1, (h - h0) / (h1 - h0 || 1));
  const a = PALRGB[k0], b = PALRGB[k1];
  const num = (k) => lerp(a[k], b[k], t);
  const p = {
    hour: h,
    sky: a.sky.map((c, j) => mixRGB(c, b.sky[j], t)),
    ridge: a.ridge.map((c, j) => mixRGB(c, b.ridge[j], t)),
    mist: [mixRGB(a.mist[0], b.mist[0], t), lerp(a.mist[1], b.mist[1], t)],
    amb: mixRGB(a.amb, b.amb, t),
    ambSun: mixRGB(a.ambSun, b.ambSun, t),
    water: mixRGB(a.water, b.water, t),
    glow: mixRGB(a.glow, b.glow, t),
    vig: num('vig'), stars: num('stars'), rays: num('rays'), lamp: num('lamp'), dapple: num('dapple'), lift: num('lift'),
  };
  // the sun: an arc from the left horizon to the right one
  const su = (h - SUNRISE) / (SUNSET - SUNRISE);
  const alt = Math.sin(Math.PI * clamp(su, 0, 1));
  // (x is a fraction of the screen's width: the sky is too far away to pan with the camera)
  p.sun = { fx: lerp(0.06, 0.94, su), y: 455 - alt * 720, up: su > -0.02 && su < 1.02, alt, side: su < 0.5 ? -1 : 1 };
  // the moon: the same arc through the night, lower in the sky so it stays in view
  const mu = (((h - SUNSET) % 24) + 24) % 24 / (24 - (SUNSET - SUNRISE));
  const malt = smoothstep(0, 0.27, mu) * (1 - smoothstep(0.73, 1, mu));
  p.moon = { fx: lerp(0.06, 0.94, mu), y: 470 - malt * 190, up: mu > -0.02 && mu < 1.02 };
  // where the light comes from: the sun while it's up, otherwise the moon
  p.src = p.sun.up && p.sun.alt > -0.05 ? p.sun : p.moon;
  return p;
}

export class Sky {
  /**
   * @param root   element that receives the CSS variables (#app)
   * @param hour   starting hour
   * @param reduced  prefers-reduced-motion: time-lapses become short fades
   */
  constructor({ root, hour = 12, reduced = false }) {
    this.root = root;
    this.reduced = reduced;
    this.hour = hour;
    this.lapse = null;
    this.applied = '';
    this.p = paletteAt(hour);
    this.apply(true);
  }

  get night() { return isNightHour(this.hour); }
  get period() { return periodOf(this.hour); }
  get lapsing() { return !!this.lapse; }

  /** Jump to an hour (no animation). */
  set(hour) {
    this.lapse = null;
    this.hour = ((hour % 24) + 24) % 24;
    this.apply();
  }

  /**
   * Run the clock forward to `hour` over `dur` seconds (always forward, so
   * evening goes through sunset and morning through the small hours).
   */
  lapseTo(hour, dur = 6, { back = false } = {}) {
    const from = this.hour;
    let span = (((hour - from) % 24) + 24) % 24;
    if (back && span > 0) span -= 24; // rewinding
    if (Math.abs(span) < 0.01) return;
    // the clock lingers where the light is loveliest: golden hour to dusk, and dawn
    const N = 240;
    const cum = [0];
    for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + dwell(from + (span * (i - 0.5)) / N));
    for (let i = 0; i <= N; i++) cum[i] /= cum[N];
    this.lapse = { from, span, t: 0, dur: this.reduced ? 0.8 : dur, cum, i: 0 };
  }

  update(dt) {
    if (!this.lapse) return false;
    const L = this.lapse;
    L.t += dt;
    const u = clamp(L.t / L.dur);
    const e = u * u * (3 - 2 * u);
    // time → hour, through the dwell table
    const N = L.cum.length - 1;
    while (L.i < N - 1 && L.cum[L.i + 1] < e) L.i++;
    while (L.i > 0 && L.cum[L.i] > e) L.i--;
    const f = clamp((e - L.cum[L.i]) / ((L.cum[L.i + 1] - L.cum[L.i]) || 1));
    this.hour = (((L.from + (L.span * (L.i + f)) / N) % 24) + 24) % 24;
    if (u >= 1) this.lapse = null;
    this.apply();
    return true;
  }

  /** Blend the palette for the current hour and push it to CSS. */
  apply(force = false) {
    const p = (this.p = paletteAt(this.hour));
    // the light that will fall on each height of the sky (see light.js: it lifts toward the top)
    const avg = mixRGB(p.amb, p.ambSun, 0.5);
    const amb = (y) => mixRGB(avg, [255, 255, 255], skyLift(p, y));
    const vars = {
      '--sky0': css(under(p.sky[0], amb(150))), '--sky1': css(under(p.sky[1], amb(280))),
      '--sky2': css(under(p.sky[2], amb(405))), '--sky3': css(under(p.sky[3], amb(470))),
      '--ridge0': css(under(p.ridge[0], amb(330))), '--ridge1': css(under(p.ridge[1], amb(385))), '--ridge2': css(under(p.ridge[2], amb(425))),
      '--mist': css(under(p.mist[0], amb(370))), '--mist-a': p.mist[1].toFixed(3),
      '--water-sky': css(under(p.water, avg)),
      '--stars': p.stars.toFixed(3),
      '--lamp': p.lamp.toFixed(3),
      '--sun-glow': css(p.glow),
    };
    const sig = Object.values(vars).join('|');
    if (!force && sig === this.applied) return;
    this.applied = sig;
    for (const [k, v] of Object.entries(vars)) this.root.style.setProperty(k, v);
  }
}
