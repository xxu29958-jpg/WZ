// Garden art — the parts of the garden that are generated once at load:
// paper grain, ink-wash hills and mist, the ensō, raked sand and ripple rings,
// maple leaves, fireflies. Mixed into Scene (see scene.js); `this` is the scene.

import { TAU, DEG, makeRng, noise1, lerp } from '../math.js';
import { $, f2, svgEl } from '../util.js';
import { EnsoBrush } from './enso.js';

export const LEAF_COLORS = ['#e2483a', '#ec6a3a', '#f08a3c', '#e9a13a', '#d6402e', '#f2b04a'];

export class GardenArt {
  // ------------------------------------------------------------------ generated art
  buildSky() {
    const host = $('sky');
    const X0 = -1500, X1 = 3100, STEP = 20;
    const n = Math.round((X1 - X0) / STEP) + 1;
    const xs = Array.from({ length: n }, (_, i) => X0 + i * STEP);
    const sample = (seed, base, amp, freq = 1, bumps = 0) => xs.map((x) => {
      const m = 0.5 + 0.5 * noise1(x * 0.0019 * freq, seed);
      const peak = Math.pow(Math.max(0, noise1(x * 0.0047 * freq, seed + 3)), 1.6);
      const b = bumps ? Math.abs(noise1(x * 0.035, seed + 7)) * bumps : 0;
      return base - amp * (0.35 + 0.65 * m) - amp * 0.8 * peak - b;
    });
    const far = sample(4, 410, 132, 0.9);
    const mid = sample(9, 432, 84, 1.1);
    const near = sample(17, 452, 40, 1.4, 9);
    const toPath = (ys) => {
      let d = `M ${X0},620 L ${X0},${f2(ys[0])}`;
      for (let i = 1; i < n; i++) d += ` L ${xs[i]},${f2(ys[i])}`;
      return d + ` L ${X1},620 Z`;
    };
    const at = (ys, x) => ys[Math.round((x - X0) / STEP)];
    // far peaks, a mist band, the middle ridge (with a pagoda and pines), mist, the near hills
    svgEl('path', { d: toPath(far), class: 'hill-far' }, host);
    svgEl('path', { d: 'M -1500,372 Q 300,352 1100,368 T 3100,360 L 3100,384 Q 1700,396 900,388 T -1500,392 Z', class: 'mist' }, host);
    const midG = svgEl('g', { class: 'hill-mid' }, host);
    svgEl('path', { d: toPath(mid) }, midG);
    const PAGODA_X = 640;
    const pagodaY = at(mid, PAGODA_X) + 4;
    svgEl('path', { d: this.pagodaPath(PAGODA_X, pagodaY, 1) }, midG);
    for (const x of [538, 572, 712, 1210, 1236, 1262]) svgEl('path', { d: this.pinePath(x, at(mid, x) + 3, 0.55 + ((x * 7) % 5) / 14) }, midG);
    svgEl('path', { d: 'M -1500,416 Q 500,404 1300,416 T 3100,410 L 3100,432 Q 1800,440 1000,432 T -1500,436 Z', class: 'mist' }, host);
    svgEl('path', { d: toPath(near), class: 'hill-near' }, host);
    // the skyline (whatever is highest at each x): stars and the moon are clipped to the sky above it
    let d = `M ${X0},-2000 L ${X0},${f2(Math.min(far[0], mid[0], near[0]))}`;
    for (let i = 1; i < n; i++) {
      let y = Math.min(far[i], mid[i], near[i]);
      if (Math.abs(xs[i] - PAGODA_X) < 26) y = Math.min(y, pagodaY - 96 + Math.abs(xs[i] - PAGODA_X) * 2.6);
      d += ` L ${xs[i]},${f2(y)}`;
    }
    $('above-hills-path').setAttribute('d', d + ` L ${X1},-2000 Z`);
    this.skyline = (x) => Math.min(at(far, x), at(mid, x), at(near, x));
  }

  /** A five-story pagoda, as a silhouette standing on (x, y). */
  pagodaPath(x, y, s) {
    let d = '';
    let yy = y;
    const roofs = 5;
    for (let i = 0; i < roofs; i++) {
      const bw = (13 - i * 1.4) * s, bh = 9 * s;
      const rw = (26 - i * 2.6) * s, rh = 4.2 * s;
      // body
      d += `M ${f2(x - bw)},${f2(yy)} L ${f2(x - bw)},${f2(yy - bh)} L ${f2(x + bw)},${f2(yy - bh)} L ${f2(x + bw)},${f2(yy)} Z `;
      yy -= bh;
      // a roof with upturned eaves
      d += `M ${f2(x - rw)},${f2(yy - rh * 0.2)} Q ${f2(x - rw * 0.55)},${f2(yy + rh * 0.2)} ${f2(x - rw * 0.42)},${f2(yy - rh * 0.5)} ` +
        `L ${f2(x - bw * 0.7)},${f2(yy - rh * 1.6)} L ${f2(x + bw * 0.7)},${f2(yy - rh * 1.6)} L ${f2(x + rw * 0.42)},${f2(yy - rh * 0.5)} ` +
        `Q ${f2(x + rw * 0.55)},${f2(yy + rh * 0.2)} ${f2(x + rw)},${f2(yy - rh * 0.2)} Z `;
      yy -= rh * 1.5;
    }
    // the spire, with its rings
    d += `M ${f2(x - 1.1 * s)},${f2(yy)} L ${f2(x - 0.7 * s)},${f2(yy - 24 * s)} L ${f2(x + 0.7 * s)},${f2(yy - 24 * s)} L ${f2(x + 1.1 * s)},${f2(yy)} Z `;
    for (let i = 0; i < 5; i++) {
      const ry = yy - 4 * s - i * 3.4 * s;
      d += `M ${f2(x - 3 * s)},${f2(ry)} L ${f2(x + 3 * s)},${f2(ry)} L ${f2(x + 3 * s)},${f2(ry - 1.3 * s)} L ${f2(x - 3 * s)},${f2(ry - 1.3 * s)} Z `;
    }
    return d;
  }

  /** A pine on a ridge: a thin trunk and flat, cloud-like layers of needles. */
  pinePath(x, y, s) {
    const H = 46 * s;
    let d = `M ${f2(x - 1.6 * s)},${f2(y)} L ${f2(x - 0.8 * s)},${f2(y - H)} L ${f2(x + 0.8 * s)},${f2(y - H)} L ${f2(x + 1.6 * s)},${f2(y)} Z `;
    const pads = [[0, 1, 15], [-6, 0.74, 12], [5, 0.5, 10], [-2, 0.28, 8]];
    for (const [dx, f, w] of pads) {
      const cx = x + dx * s, cy = y - H * f, ww = w * s, hh = 4.2 * s;
      d += `M ${f2(cx - ww)},${f2(cy)} C ${f2(cx - ww)},${f2(cy - hh * 1.6)} ${f2(cx + ww)},${f2(cy - hh * 1.6)} ${f2(cx + ww)},${f2(cy)} Z `;
    }
    return d;
  }

  /** Stylized mist bands (suyari-gasumi, the clouds of old folding screens), drifting on their own layer. */
  buildKasumi() {
    const host = $('kasumi');
    const defs = svgEl('defs', {}, host.ownerSVGElement);
    const rng = makeRng(17);
    // a long band: rounded ends, a scalloped top, a flat bottom; lit from above, fading downward
    const band = (x0, x1, y, h, i) => {
      const r = h / 2;
      let d = `M ${f2(x0 + r)},${f2(y + r)} A ${f2(r)},${f2(r)} 0 0 1 ${f2(x0 + r)},${f2(y - r)} `;
      let x = x0 + r;
      while (x < x1 - r - h * 1.5) {
        const step = h * (2.2 + rng() * 2.6);
        const nx = Math.min(x + step, x1 - r);
        d += `Q ${f2((x + nx) / 2)},${f2(y - r - h * (0.45 + rng() * 0.5))} ${f2(nx)},${f2(y - r)} `;
        x = nx;
      }
      d += `L ${f2(x1 - r)},${f2(y - r)} A ${f2(r)},${f2(r)} 0 0 1 ${f2(x1 - r)},${f2(y + r)} Z`;
      const g = svgEl('linearGradient', { id: `kasumi-${i}`, gradientUnits: 'userSpaceOnUse', x1: 0, y1: f2(y - r - h), x2: 0, y2: f2(y + r) }, defs);
      svgEl('stop', { offset: 0, class: 'kasumi-stop', 'stop-opacity': 1 }, g);
      svgEl('stop', { offset: 0.55, class: 'kasumi-stop', 'stop-opacity': 0.75 }, g);
      svgEl('stop', { offset: 1, class: 'kasumi-stop', 'stop-opacity': 0.05 }, g);
      svgEl('path', { d, fill: `url(#kasumi-${i})`, class: 'kasumi' }, host);
    };
    const bands = [
      [-900, 240, 322, 18], [430, 1180, 306, 15], [1320, 2300, 296, 17],
      [-500, 640, 402, 13], [880, 1760, 394, 14],
    ];
    bands.forEach(([x0, x1, y, h], i) => band(x0, x1, y, h, i));
  }

  /** The night sky: a hand-made Milky Way, a few hundred stars, the moon. */
  buildStars() {
    const rng = makeRng(41);
    const host = $('stars');
    // the Milky Way: soft clouds of light along a diagonal, in the sky behind the hills
    // (plain gradients, no canvas: some browsers scramble canvas exports)
    const along = (u) => ({ x: lerp(-120, 1500, u), y: lerp(470, -260, u) + Math.sin(u * 5) * 26 });
    const milky = $('milky');
    for (let i = 0; i < 46; i++) {
      const u = rng();
      const p = along(u);
      const off = (rng() - 0.5) * 70;
      svgEl('ellipse', {
        cx: f2(p.x + off * 0.4), cy: f2(p.y + off), rx: f2(60 + rng() * 110), ry: f2(28 + rng() * 40),
        transform: `rotate(-24 ${f2(p.x)} ${f2(p.y)})`, fill: rng() < 0.3 ? 'url(#milky-warm)' : 'url(#milky-cool)',
      }, milky);
    }
    // stars, only above the hills (a third of them crowd along the Milky Way)
    const twinkle = svgEl('g', { class: 'twinkle' }, host);
    let dots = '';
    for (let i = 0; i < 520; i++) {
      let x = -700 + rng() * 2900;
      let y = -300 + Math.pow(rng(), 1.25) * 760;
      if (i % 3 === 0) {
        const p = along(rng());
        const spread = (rng() + rng() + rng() - 1.5) * 90;
        x = p.x + spread * 0.45;
        y = p.y + spread;
      }
      if (y > this.skyline(Math.round(x / 20) * 20) - 8) continue;
      const big = rng();
      const r = big > 0.975 ? 2.3 : big > 0.9 ? 1.5 : 0.5 + rng() * 0.6;
      // only the brightest few twinkle (each one makes the sky redraw while it does)
      if (big > 0.975 && twinkle.childElementCount < 9) {
        const el = svgEl('circle', { cx: f2(x), cy: f2(y), r: f2(r), class: 'star' }, twinkle);
        el.style.animationDelay = `${(-rng() * 6).toFixed(2)}s`;
        el.style.animationDuration = `${(2.5 + rng() * 4).toFixed(2)}s`;
      } else {
        dots += `M ${f2(x - r)},${f2(y)} a ${f2(r)},${f2(r)} 0 1 0 ${f2(r * 2)},0 a ${f2(r)},${f2(r)} 0 1 0 ${f2(-r * 2)},0 `;
      }
    }
    svgEl('path', { d: dots, class: 'star-dust' }, host);
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
    svgEl('path', { d: dS, class: 'rake-shadow' }, rake);
    svgEl('path', { d: dH, class: 'rake-hi' }, rake);

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
      svgEl('ellipse', { cx: z.cx, cy: z.cy, rx: outer, ry: outer * 0.2, class: 'c-sand' }, rings);
      let ds = '', dh = '';
      for (let i = 0; i < z.n; i++) {
        const rx = z.rx + i * 15;
        const ry = rx * 0.2;
        ds += `M ${z.cx - rx},${z.cy} a ${rx},${ry} 0 1 0 ${rx * 2},0 a ${rx},${ry} 0 1 0 ${-rx * 2},0 `;
        dh += `M ${z.cx - rx},${z.cy - 1.8} a ${rx},${ry} 0 1 0 ${rx * 2},0 a ${rx},${ry} 0 1 0 ${-rx * 2},0 `;
      }
      svgEl('path', { d: ds, class: 'rake-shadow' }, rings);
      svgEl('path', { d: dh, class: 'rake-hi' }, rings);
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
    const g = svgEl('g', {}, parent);
    const { d, v } = this.leafPath(r);
    svgEl('path', { d, class: 'leaf', style: `fill:${color}` }, g);
    svgEl('path', { d: v, class: 'leaf-vein' }, g);
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
      const el = svgEl('circle', { r: 9, fill: 'url(#firefly)' }, host);
      this.fireflies.push({
        el,
        x: 150 + rng() * 1300,
        y: 560 + rng() * 380,
        seed: rng() * 100,
        speed: 0.15 + rng() * 0.2,
      });
    }
  }
}
