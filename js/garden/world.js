// World — the garden as a place: a ground plane with perspective, the things
// standing on it, where Kon may walk, and how to get around obstacles.
//
// Coordinates are the same "world units" as the SVG art. A point on the ground
// is (x, y), where y is the screen row of its contact point: larger y is closer
// to the viewer. Things closer are bigger (depthScale), and moving toward or
// away from the viewer covers fewer screen units than moving sideways.

import { clamp } from '../math.js';

export const HORIZON = 400;   // where the ground would vanish
export const HOME_Y = 826;    // the cushion's ground row: depthScale = 1 here
export const KON_SCALE = 1.15;
export const SAND_TOP = 714;

export const depthScale = (y) => (y - HORIZON) / (HOME_Y - HORIZON);
export const konScale = (y) => KON_SCALE * depthScale(y);
/** Screen row of Kon's feet at ground (x, y) when lifted h units off the ground. */
export const footY = (y, h = 0) => y - h * depthScale(y);

/** Where Kon may stand at all. */
export const BOUNDS = { x0: 195, x1: 1160, y0: 742, y1: 966 };

/** Kon's footprint on the ground (half-widths). */
const KON_R = { x: 26, y: 9 };

/** Things on the ground, as ellipses around their contact area. */
export const OBSTACLES = [
  { id: 'lantern', x: 330, y: 810, rx: 118, ry: 22 },
  { id: 'cushion', x: 800, y: 826, rx: 166, ry: 30, platform: 'cushion' },
  { id: 'flower', x: 662, y: 828, rx: 16, ry: 7 },
  { id: 'rock', x: 1079, y: 888, rx: 70, ry: 40, platform: 'rock' },
  { id: 'basin', x: 471, y: 905, rx: 74, ry: 38 },
  { id: 'posts', x: 559, y: 902, rx: 22, ry: 42 },
  { id: 'strike', x: 630, y: 912, rx: 28, ry: 20 },
  { id: 'pipePost', x: 360, y: 838, rx: 9, ry: 5 },
  { id: 'rack', x: 1300, y: 838, rx: 120, ry: 14 },
];

/** Raised places Kon can hop onto: ground point, height, and where to jump from. */
export const PLATFORMS = {
  cushion: { x: 800, y: 826, h: 38, approach: { x: 800, y: 878 } },
  rock: { x: 1079, y: 884, h: 42, approach: { x: 1079, y: 942 } },
};

/** Spots worth visiting: where to stand, which way to face, what to look at. */
export const POIS = {
  flower: { stand: { x: 720, y: 874 }, face: -1, look: { x: 670, y: 774 } },
  basin: { stand: { x: 364, y: 914 }, face: 1, look: { x: 471, y: 884 } },
  lantern: { stand: { x: 474, y: 848 }, face: -1, look: { x: 330, y: 584 } },
  snail: { stand: { x: 424, y: 844 }, face: -1, look: { x: 352, y: 744 } },
  rack: { stand: { x: 1060, y: 828 }, face: 1, look: { x: 1300, y: 690 } },
  shishi: { stand: { x: 704, y: 944 }, face: -1, look: { x: 520, y: 862 } },
  maple: { stand: { x: 1010, y: 762 }, face: 1, look: { x: 1180, y: 300 } },
  rock: { platform: 'rock', look: { x: 1180, y: 320 } },
  home: { platform: 'cushion' },
};

/** Things Kon likes to look at (world points above the ground). */
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

/** Draw order of the scenery (the row where each thing meets the ground). */
export const SORT_Y = { lantern: 810, rack: 838, cushion: 826, flower: 828, rock: 888, shishi: 905 };

const expanded = (o) => ({ x: o.x, y: o.y, rx: o.rx + KON_R.x, ry: o.ry + KON_R.y });

/** 0 at the center of an (expanded) obstacle, 1 on its edge. */
const ellDist = (o, p) => Math.hypot((p.x - o.x) / o.rx, (p.y - o.y) / o.ry);

export function clampToBounds(p) {
  return { x: clamp(p.x, BOUNDS.x0, BOUNDS.x1), y: clamp(p.y, BOUNDS.y0, BOUNDS.y1) };
}

export function isFree(p, ignore = null) {
  if (p.x < BOUNDS.x0 || p.x > BOUNDS.x1 || p.y < BOUNDS.y0 || p.y > BOUNDS.y1) return false;
  return OBSTACLES.every((o) => o.id === ignore || ellDist(expanded(o), p) >= 1);
}

/** Nudge a point out of any obstacle and back inside the bounds — to the nearest free spot. */
export function pushOut(p, ignore = null) {
  let q = clampToBounds(p);
  if (isFree(q, ignore)) return q;
  // the simple way: straight out of whatever we are inside of
  for (let pass = 0; pass < 3; pass++) {
    for (const o0 of OBSTACLES) {
      if (o0.id === ignore) continue;
      const o = expanded(o0);
      const d = ellDist(o, q);
      if (d < 1) {
        const k = 1.002 / Math.max(d, 1e-3);
        q = clampToBounds(d < 1e-3 ? { x: o.x, y: o.y - o.ry * 1.01 } : { x: o.x + (q.x - o.x) * k, y: o.y + (q.y - o.y) * k });
      }
    }
    if (isFree(q, ignore)) return q;
  }
  // squeezed between things (or against the edge): search outward in rings
  for (let r = 6; r <= 160; r += 6) {
    let best = null, bestD = Infinity;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const c = clampToBounds({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.6 });
      if (!isFree(c, ignore)) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best) return best;
  }
  return q;
}

/** First obstacle the segment a→b passes through (in each obstacle's unit-circle space). */
function firstHit(a, b, ignore) {
  let best = null;
  for (const o0 of OBSTACLES) {
    if (o0.id === ignore) continue;
    const o = expanded(o0);
    if (ellDist(o, a) < 1 || ellDist(o, b) < 1) continue; // starting or ending inside: let pushOut handle it
    const ax = (a.x - o.x) / o.rx, ay = (a.y - o.y) / o.ry;
    const dx = (b.x - a.x) / o.rx, dy = (b.y - a.y) / o.ry;
    const A = dx * dx + dy * dy;
    if (A < 1e-9) continue;
    const B = 2 * (ax * dx + ay * dy);
    const C = ax * ax + ay * ay - 1;
    const disc = B * B - 4 * A * C;
    if (disc <= 0) continue;
    const t = (-B - Math.sqrt(disc)) / (2 * A);
    if (t > 0 && t < 1 && (!best || t < best.t)) best = { t, o };
  }
  return best;
}

/**
 * Waypoints from a to b that go around obstacles (a few detours at most).
 * Good enough for a small garden; no grid, no search.
 */
export function planPath(a, b, ignore = null, depth = 0) {
  const hit = firstHit(a, b, ignore);
  if (!hit || depth > 3) return [b];
  const o = hit.o;
  // go around the side of the obstacle, perpendicular to the direction of travel
  const ux = (b.x - a.x) / o.rx, uy = (b.y - a.y) / o.ry;
  const ul = Math.hypot(ux, uy) || 1;
  const nx = -uy / ul, ny = ux / ul;
  const cands = [1, -1].map((s) => {
    const raw = { x: o.x + s * nx * o.rx * 1.3, y: o.y + s * ny * o.ry * 1.6 };
    const c = pushOut(clampToBounds(raw), ignore);
    // a detour squeezed against the edge of the garden is worse than going the long way
    const squeezed = Math.hypot(c.x - raw.x, c.y - raw.y) > 40 ? 400 : 0;
    return { c, cost: Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y) + squeezed };
  }).sort((p, q) => p.cost - q.cost);
  const via = cands[0].c;
  if (Math.hypot(via.x - a.x, via.y - a.y) < 4) return [b];
  return [...planPath(a, via, ignore, depth + 1), ...planPath(via, b, ignore, depth + 1)];
}

/** A random free spot on open sand, preferring the middle of the garden. */
export function randomSpot(rng) {
  for (let i = 0; i < 30; i++) {
    const p = {
      x: BOUNDS.x0 + 60 + rng() * (BOUNDS.x1 - BOUNDS.x0 - 120),
      y: BOUNDS.y0 + 10 + rng() * (BOUNDS.y1 - BOUNDS.y0 - 20),
    };
    if (isFree(p)) return p;
  }
  return { x: 900, y: 900 };
}

/** Rough body landmarks for a Kon standing at ground (x, y) — used by tests. */
export function bodyAt(x, y, h = 0) {
  const s = konScale(y);
  const fy = footY(y, h);
  return {
    head: { x, y: fy - 150 * s },
    crown: { x: x - 16 * s, y: fy - 204 * s },
    restHead: { x, y: fy - 150 * s },
    nose: { x, y: fy - 120 * s },
    mouth: { x, y: fy - 108 * s },
    tail: { x: x + 110 * s, y: fy - 110 * s },
    bib: { x, y: fy - 80 * s },
    center: { x, y: fy - 70 * s },
    scale: s,
  };
}
