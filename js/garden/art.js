// Garden art — the parts of the garden that are generated once at load:
// paper grain, ink-wash hills and mist, the ensō, raked sand and ripple rings,
// maple leaves, fireflies. Mixed into Scene (see scene.js); `this` is the scene.

import { TAU, DEG, makeRng, noise1 } from '../math.js';
import { $, f2, svgEl } from '../util.js';
import { EnsoBrush } from './enso.js';

export const LEAF_COLORS = ['#e2483a', '#ec6a3a', '#f08a3c', '#e9a13a', '#d6402e', '#f2b04a'];

export class GardenArt {
  // ------------------------------------------------------------------ generated art
  buildSky() {
    const host = $('sky');
    const ridge = (seed, base, amp, cls, step = 30) => {
      let d = `M -1500,560 L -1500,${base}`;
      for (let x = -1500; x <= 3100; x += step) {
        const n = 0.5 + 0.5 * noise1(x * 0.0019, seed);
        const peak = Math.pow(Math.max(0, noise1(x * 0.0047, seed + 3)), 1.6);
        d += ` L ${x},${f2(base - amp * (0.35 + 0.65 * n) - amp * 0.8 * peak)}`;
      }
      svgEl('path', { d: d + ' L 3100,560 Z', class: cls }, host);
    };
    ridge(4, 440, 120, 'hill-far');
    svgEl('path', { d: 'M -1500,372 Q 300,352 1100,368 T 3100,360 L 3100,384 Q 1700,396 900,388 T -1500,392 Z', class: 'mist' }, host);
    ridge(9, 470, 90, 'hill-near', 26);
    svgEl('path', { d: 'M -1500,428 Q 500,414 1300,428 T 3100,420 L 3100,446 Q 1800,456 1000,446 T -1500,450 Z', class: 'mist' }, host);
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
