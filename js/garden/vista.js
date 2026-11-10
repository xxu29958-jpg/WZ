// Vista — what lies beyond the garden. The garden is a terrace high on a
// mountainside. Past its edge the land falls away: the tops of the forest on
// the slope below, a winding path of little red torii gates (this is an Inari
// fox's garden, after all), and far down, a lake at the foot of the hills with
// a village on its shore. Behind it all, a snow-capped peak.
//
// Everything is generated once at load. Colors come from the hour (sky.js).
// Mixed into Scene (see scene.js); `this` is the scene.

import { makeRng, noise1, lerp, smoothstep } from '../math.js';
import { $, f2, svgEl } from '../util.js';

const X0 = -200, X1 = 1800; // the widest the camera ever sees of these layers

/** A row of round tree tops (or bushes) as one path. */
function blobs(list) {
  let d = '';
  for (const [x, y, r, ry = r] of list) {
    d += `M ${f2(x - r)},${f2(y)} a ${f2(r)},${f2(ry)} 0 1 0 ${f2(r * 2)},0 a ${f2(r)},${f2(ry)} 0 1 0 ${f2(-r * 2)},0 `;
  }
  return d;
}

/** A tiny torii gate standing on (x, y), `s` units tall. */
function torii(x, y, s) {
  const w = s * 0.9, t = s * 0.12;
  const post = (px) => `M ${f2(px - t / 2)},${f2(y)} L ${f2(px - t / 2)},${f2(y - s)} L ${f2(px + t / 2)},${f2(y - s)} L ${f2(px + t / 2)},${f2(y)} Z `;
  let d = post(x - w * 0.36) + post(x + w * 0.36);
  // kasagi (the top beam, its ends turned up) and nuki (the tie beam)
  d += `M ${f2(x - w * 0.62)},${f2(y - s * 1.02)} Q ${f2(x)},${f2(y - s * 0.94)} ${f2(x + w * 0.62)},${f2(y - s * 1.02)} L ${f2(x + w * 0.58)},${f2(y - s * 0.86)} L ${f2(x - w * 0.58)},${f2(y - s * 0.86)} Z `;
  d += `M ${f2(x - w * 0.48)},${f2(y - s * 0.74)} L ${f2(x + w * 0.48)},${f2(y - s * 0.74)} L ${f2(x + w * 0.48)},${f2(y - s * 0.66)} L ${f2(x - w * 0.48)},${f2(y - s * 0.66)} Z `;
  return d;
}

export class GardenVista {
  /** The valley: a lake mirroring the peak, a village, a torii in the water, autumn hills, the forest below. */
  buildValley() {
    const host = $('valley');
    const rng = makeRng(57);
    const SHORE = 404;

    // the lake: the sky's colors, a little deeper, and the mountain upside down
    svgEl('rect', { x: X0, y: SHORE - 2, width: X1 - X0, height: 320, fill: 'url(#lake-grad)' }, host);
    svgEl('rect', { x: X0, y: SHORE - 2, width: X1 - X0, height: 320, class: 'lake-deep' }, host);
    if (this.peakY) {
      const PX = this.peakX;
      let d = `M ${X0},${SHORE}`;
      for (let x = X0; x <= X1; x += 10) d += ` L ${x},${f2(2 * SHORE - this.peakY(x) + 6)}`;
      svgEl('path', { d: d + ` L ${X1},${SHORE} Z`, class: 'peak lake-mirror' }, host);
      let sn = `M ${PX - 96},${f2(2 * SHORE - this.peakY(PX - 96) + 6)}`;
      for (let x = PX - 96; x <= PX + 96; x += 6) sn += ` L ${x},${f2(2 * SHORE - this.peakY(x) + 6)}`;
      for (let x = PX + 96; x >= PX - 96; x -= 6) sn += ` L ${x},${f2(2 * SHORE - Math.min(this.peakY(x) + 18 + Math.abs(Math.sin(x * 0.085)) * 14, 340) + 6)}`;
      svgEl('path', { d: sn + ' Z', class: 'snow lake-mirror' }, host);
    }
    let hi = '';
    for (let i = 0; i < 70; i++) {
      const y = SHORE + 5 + Math.pow(rng(), 0.9) * 220;
      const x = X0 + rng() * (X1 - X0);
      const len = 10 + rng() * 40 * (1 + (y - SHORE) / 60);
      hi += `M ${f2(x)},${f2(y)} h ${f2(len)} `;
    }
    svgEl('path', { d: hi, class: 'lake-hi' }, host);

    // the far shore: a strip of trees, and the village
    const shore = [];
    for (let x = X0; x <= X1; x += 7 + rng() * 6) shore.push([x, SHORE - 1, 3 + rng() * 4, 2.4 + rng() * 3]);
    svgEl('path', { d: blobs(shore) + `M ${X0},${SHORE - 1} H ${X1} V ${SHORE + 3} H ${X0} Z`, class: 'shore' }, host);
    let houses = '';
    this.village = [];
    for (const [a, b] of [[430, 560], [1060, 1170]]) {
      for (let x = a; x < b; x += 8 + rng() * 9) {
        if (rng() < 0.2) continue;
        const w = 6 + rng() * 6, h = 4 + rng() * 4, y = SHORE + 1;
        houses += `M ${f2(x)},${f2(y)} v ${f2(-h)} l ${f2(w / 2)},${f2(-h * 0.55)} l ${f2(w / 2)},${f2(h * 0.55)} v ${f2(h)} Z `;
        this.village.push({ x: x + w / 2, y: y - h * 0.5, seed: rng() * 10, on: rng() < 0.8 });
      }
    }
    svgEl('path', { d: houses, class: 'house' }, host);

    // a torii standing in the water, and its reflection
    const TX = 986, TY = 474, TS = 34;
    svgEl('path', { d: torii(TX, TY, TS), class: 'torii lake-mirror', transform: `matrix(1 0 0 -0.85 0 ${f2(TY * 1.85)})` }, host);
    svgEl('path', { d: torii(TX, TY, TS), class: 'torii' }, host);
    svgEl('path', { d: `M ${TX - 24},${TY + 1} h 48`, class: 'lake-hi ripple' }, host);
    this.lakeTorii = { x: TX, y: TY - TS * 0.6 };

    // a little boat, drifting along the far side of the lake
    const boat = svgEl('g', { id: 'boat' }, host);
    svgEl('path', { d: 'M -11,0 L 11,0 L 8,3.4 L -8,3.4 Z M -3,-0.2 L -3,-9 L 4,-1.5 Z', class: 'boat' }, boat);
    svgEl('path', { d: 'M -10,5 L 10,5 L 7,7.5 L -7,7.5 Z', class: 'boat lake-mirror' }, boat);
    svgEl('path', { d: 'M -26,2.6 h 12 M 14,2.6 h 9', class: 'lake-hi wake' }, boat);
    this.boat = { el: boat, x: 470, y: 440, dir: 1, drawn: null };

    // autumn hills down either side of the lake, forested in green, gold and red
    const leftTop = (x) => SHORE + 66 - 150 * (1 - smoothstep(-200, 520, x)) - Math.abs(noise1(x * 0.03, 4)) * 10;
    const rightTop = (x) => SHORE + 70 - 160 * smoothstep(1080, 1800, x) - Math.abs(noise1(x * 0.03, 6)) * 10;
    const hills = (fn, xa, xb) => {
      let d = `M ${xa},720`;
      for (let x = xa; x <= xb; x += 8) d += ` L ${x},${f2(fn(x))}`;
      return d + ` L ${xb},720 Z`;
    };
    svgEl('path', { d: hills(leftTop, X0, 560) + hills(rightTop, 1060, X1), class: 'hill-side' }, host);
    const tones = { far: [], mid: [], red: [], gold: [], rust: [], lit: [], litNear: [] };
    const forest = (fn, xa, xb) => {
      for (let x = xa; x <= xb; x += 7 + rng() * 6) {
        const top = fn(x);
        for (let y = top + 4 + rng() * 6; y < 700; y += 8 + (y - SHORE) * 0.05 + rng() * 5) {
          const r = 5 + (y - SHORE) * 0.06 + rng() * 4;
          // autumn comes in patches: mostly green, some gold, a few fiery reds
          const n = noise1(x * 0.011 + 3, y * 0.017) + (rng() - 0.5) * 0.25;
          const tone = n > 0.5 ? 'red' : n > 0.3 ? 'gold' : n < -0.5 ? 'rust' : y < top + 40 ? 'far' : 'mid';
          tones[tone].push([x + (rng() - 0.5) * 7, y + (rng() - 0.5) * 5, r, r * 0.8]);
          if (rng() < 0.6) tones.lit.push([x - r * 0.2, y - r * 0.32, r * 0.5, r * 0.28]);
        }
      }
    };
    forest(leftTop, X0, 540);
    forest(rightTop, 1080, X1);

    // the torii path winding up the left hill from the lakeshore (Inari's thousand gates, a few of them)
    const path = [];
    for (let i = 0; i <= 44; i++) {
      const u = i / 44;
      // switchbacks up the slope (always on it, never above the trees)
      const x = lerp(440, 40, u) + Math.sin(u * 9) * 34 * (1 - u * 0.4);
      path.push({ x, y: Math.max(lerp(SHORE + 70, 330, u), leftTop(x) + 16) });
    }

    // the forest below the terrace: big crowns rising at the sides, a low row in the middle
    const nearTop = (x) => 662 - (x < 560 ? smoothstep(560, 0, x) : x > 1060 ? smoothstep(1060, 1600, x) : 0) * 150;
    // how far down the lake shows at x (below that, hills or trees hide it): for reflections
    this.lakeOpen = (x) => Math.min(nearTop(x) - 20, x < 560 ? leftTop(x) : 999, x > 1060 ? rightTop(x) : 999);
    this.lakeShore = SHORE;
    const near = [];
    for (let x = X0; x < X1; x += 22 + rng() * 22) {
      const top = nearTop(x) + (rng() - 0.5) * 24;
      for (let y = top; y < 716; y += 26) {
        const r = 22 + (y - 560) * 0.1 + rng() * 14;
        near.push([x, y, r, r * 0.84]);
        if (rng() < 0.7) tones.litNear.push([x - r * 0.2, y - r * 0.34, r * 0.5, r * 0.28]);
      }
    }
    // (the slope goes on below what you normally see: the arrival's camera looks over it)
    svgEl('rect', { x: X0, y: 690, width: X1 - X0, height: 520, class: 'canopy-near below' }, host);
    const nearAccent = { red: [], gold: [] };
    const nearGreen = [];
    for (const b of near) {
      const n = noise1(b[0] * 0.01, 11);
      (n > 0.55 ? nearAccent.red : n < -0.45 ? nearAccent.gold : nearGreen).push(b);
    }
    svgEl('path', { d: blobs(tones.far), class: 'canopy-far' }, host);
    svgEl('path', { d: blobs(tones.mid), class: 'canopy-mid' }, host);
    svgEl('path', { d: blobs(tones.rust), class: 'canopy-rust' }, host);
    svgEl('path', { d: blobs(tones.gold), class: 'canopy-gold' }, host);
    svgEl('path', { d: blobs(tones.red), class: 'canopy-red' }, host);
    svgEl('path', { d: 'M ' + path.map((p) => `${f2(p.x)},${f2(p.y)}`).join(' L '), class: 'torii-path' }, host);
    let gates = '';
    this.toriiLamps = [];
    for (let i = 1; i < path.length - 1; i += 2) {
      const p = path[i];
      const sz = lerp(10, 6, i / path.length);
      gates += torii(p.x, p.y + sz * 0.15, sz);
      if (i % 6 === 1) this.toriiLamps.push({ x: p.x + sz * 0.7, y: p.y - sz * 0.3, seed: rng() * 10 });
    }
    svgEl('path', { d: gates, class: 'torii' }, host);
    svgEl('path', { d: blobs(tones.lit), class: 'canopy-hi' }, host);
    // distance: the far side of the valley fades into the air
    svgEl('rect', { x: X0, y: 300, width: X1 - X0, height: 420, fill: 'url(#valley-haze)' }, host);
    // a sea of clouds filling the valley (thick at dawn, gone by afternoon): the near trees rise out of it
    const sea = svgEl('g', { class: 'unkai' }, host);
    const puffs = [], tops = [];
    for (let x = X0; x < X1; x += 22 + rng() * 30) {
      const y = 448 + Math.abs(noise1(x * 0.004, 8)) * 40 + rng() * 14;
      const r = 30 + rng() * 34;
      puffs.push([x, y, r, r * 0.52]);
      // light catches the top of each billow
      tops.push([x - r * 0.1, y - r * 0.26, r * 0.62, r * 0.2]);
    }
    svgEl('path', { d: `M ${X0},${f2(470)} L ${X1},470 L ${X1},720 L ${X0},720 Z ` + blobs(puffs), fill: 'url(#unkai-grad)' }, sea);
    svgEl('path', { d: blobs(tops), class: 'unkai-top' }, sea);
    svgEl('path', { d: blobs(nearGreen), class: 'canopy-near' }, host);
    svgEl('path', { d: blobs(nearAccent.gold), class: 'canopy-gold near' }, host);
    svgEl('path', { d: blobs(nearAccent.red), class: 'canopy-red near' }, host);
    svgEl('path', { d: blobs(tones.litNear), class: 'canopy-hi' }, host);
  }

  /** Right in front of the lens, out of focus: tall grass at the bottom left, maple leaves at the bottom right. */
  buildNear() {
    const rng = makeRng(83);
    const L = $('near-left'), R = $('near-right');
    // (local coordinates: the corner is at 0,0)
    let blades = '';
    for (let i = 0; i < 7; i++) {
      const bx = -30 + i * 22 + rng() * 14;
      const tipX = 40 + i * 26 + rng() * 50, tipY = -(120 + rng() * 120);
      const w = 9 + rng() * 6;
      blades += `M ${f2(bx)},40 Q ${f2(bx + 10)},${f2(tipY * 0.55)} ${f2(tipX)},${f2(tipY)} Q ${f2(bx + 10 + w * 2)},${f2(tipY * 0.5)} ${f2(bx + w)},40 Z `;
    }
    svgEl('path', { d: blades, class: 'near-blade' }, L);
    let plumes = '';
    for (const [x, y, s] of [[118, -224, 0.9], [176, -190, 0.7]]) {
      plumes += `M ${x},${y} C ${x - 14 * s},${y - 50 * s} ${x - 4 * s},${y - 96 * s} ${x - 30 * s},${y - 120 * s} C ${x + 12 * s},${y - 92 * s} ${x + 22 * s},${y - 46 * s} ${x + 10 * s},${y} Z `;
    }
    svgEl('path', { d: plumes, class: 'near-plume' }, L);
    svgEl('path', { d: 'M 60,60 C -20,-40 -120,-120 -200,-150', class: 'near-twig' }, R);
    const colors = ['#c4462e', '#d8692f', '#e08a34', '#b83c2a'];
    for (let i = 0; i < 6; i++) {
      const u = i / 5;
      const x = lerp(10, -170, u) + (rng() - 0.5) * 40, y = lerp(30, -150, u) + (rng() - 0.5) * 50;
      const g = this.makeLeaf(R, 46 + rng() * 22, colors[i % colors.length]);
      g.setAttribute('transform', `translate(${f2(x)} ${f2(y)}) rotate(${f2(rng() * 360)})`);
      g.querySelector('.leaf').classList.add('near-leaf');
    }
  }

  /** Life down in the valley: the boat drifts, and now and then a flock of birds crosses the sky. */
  updateValley(dt) {
    const B = this.boat;
    if (B) {
      B.x += B.dir * 6 * dt;
      if (B.x > 610) B.dir = -1;
      if (B.x < 400) B.dir = 1;
      if (B.drawn === null || Math.abs(B.x - B.drawn) > 0.3) {
        B.drawn = B.x;
        B.el.setAttribute('transform', `translate(${f2(B.x)} ${f2(B.y)}) scale(${B.dir} 1)`);
      }
    }
    // birds: by day, every minute or two, a loose V heading across (toward home at dusk)
    const p = this.sky.p;
    if (this.flock) {
      const F = this.flock;
      F.t += dt;
      F.x += F.dir * 46 * dt;
      if (F.t > 40) this.flock = null;
    } else if (p.stars < 0.3 && !this.reduced) {
      if (this.nextFlockAt === undefined) this.nextFlockAt = this.t + 25 + this.rng() * 30;
      if (this.t > this.nextFlockAt) {
        this.nextFlockAt = this.t + 70 + this.rng() * 80;
        if (this.autoGusts) this.spawnFlock();
      }
    }
  }

  spawnFlock() {
    const dir = this.rng() < 0.5 ? 1 : -1;
    const b = this.baseVb;
    const n = 5 + Math.floor(this.rng() * 4);
    const birds = [];
    for (let i = 0; i < n; i++) {
      const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      birds.push({ dx: -dir * row * 15 + (this.rng() - 0.5) * 5, dy: side * row * 7 + (this.rng() - 0.5) * 4, ph: this.rng() * 6 });
    }
    this.flock = { x: dir > 0 ? b.x - 120 : b.x + b.w + 120, y: 300 + this.rng() * 60, dir, t: 0, birds };
  }

  /** Pin the out-of-focus corners to the screen's bottom corners (wide screens only: phones need that space). */
  placeNear() {
    // each corner is its own small layer (a whole-screen layer would cost a whole screen to blend)
    const S = this.scale, wide = this.mode === 'wide';
    const box = 440; // world units around each corner
    const px = Math.ceil(box * S);
    for (const [id, gid, left, ox, oy] of [['near-l', 'near-left', true, -20, 10], ['near-r', 'near-right', false, 30, 20]]) {
      const el = $(id);
      el.style.display = wide ? '' : 'none';
      el.setAttribute('viewBox', left ? `0 ${-box} ${box} ${box}` : `${-box} ${-box} ${box} ${box}`);
      el.style.width = el.style.height = `${px}px`;
      el.style.left = left ? '0px' : `${this.W - px}px`;
      el.style.top = `${this.H - px}px`;
      $(gid).setAttribute('transform', `translate(${ox} ${oy})`);
    }
  }

  /** The back edge of the terrace: a low stone border, round-pruned shrubs, an old pine. */
  buildTerrace() {
    const host = $('terrace');
    const rng = makeRng(71);

    // the old pine on the left, leaning over the lantern
    const pine = svgEl('g', { class: 'pine' }, host);
    svgEl('path', {
      d: 'M 70,706 C 64,640 92,590 84,540 C 76,488 104,452 138,424 C 168,400 210,392 236,376 L 244,384 C 214,404 180,414 158,440 C 128,476 112,510 120,556 C 128,604 106,650 116,706 Z',
      class: 'pine-trunk',
    }, pine);
    svgEl('path', { d: 'M 150,436 C 186,446 222,450 262,440 M 120,520 C 150,508 186,512 210,500 M 104,470 C 80,452 58,450 34,456', class: 'pine-branch' }, pine);
    const pads = [[262, 432, 64, 20], [214, 492, 52, 17], [42, 448, 46, 16], [246, 370, 58, 19], [150, 400, 44, 15], [330, 452, 40, 14], [96, 540, 34, 12]];
    let pd = '', ph = '';
    for (const [x, y, rx, ry] of pads) {
      // a cloud-pruned pad: a flat dome with a scalloped underside
      pd += `M ${f2(x - rx)},${f2(y)} C ${f2(x - rx)},${f2(y - ry * 1.5)} ${f2(x + rx)},${f2(y - ry * 1.5)} ${f2(x + rx)},${f2(y)} `;
      const n = 5;
      for (let i = n; i > 0; i--) {
        const x2 = x - rx + ((i - 1) / n) * rx * 2;
        pd += `Q ${f2(x2 + rx / n)},${f2(y + ry * 0.55)} ${f2(x2)},${f2(y)} `;
      }
      pd += 'Z ';
      ph += `M ${f2(x - rx * 0.7)},${f2(y - ry * 0.55)} C ${f2(x - rx * 0.4)},${f2(y - ry * 1.15)} ${f2(x + rx * 0.4)},${f2(y - ry * 1.15)} ${f2(x + rx * 0.62)},${f2(y - ry * 0.7)} C ${f2(x + rx * 0.2)},${f2(y - ry * 0.9)} ${f2(x - rx * 0.3)},${f2(y - ry * 0.85)} ${f2(x - rx * 0.7)},${f2(y - ry * 0.55)} Z `;
    }
    svgEl('path', { d: pd, class: 'pine-pad' }, pine);
    svgEl('path', { d: ph, class: 'pine-pad-hi' }, pine);

    // round-pruned shrubs (karikomi) along the edge, leaving the view behind Kon open
    const shrubs = [[-40, 64, 44], [180, 70, 50], [420, 56, 38], [1010, 52, 36], [1150, 74, 50], [1340, 60, 42], [1560, 80, 54], [1720, 60, 42]];
    let sd = '', sh = '';
    for (const [x, rx, ry] of shrubs) {
      const base = 702;
      // a dome with a scalloped outline: a bump between each pair of points around it
      const pts = [];
      const n = 9;
      for (let i = 0; i <= n; i++) {
        const a = Math.PI - (i / n) * Math.PI;
        const r = 1 + (rng() - 0.5) * 0.12;
        pts.push([x + Math.cos(a) * rx * r, base - Math.sin(a) * ry * r]);
      }
      sd += `M ${f2(pts[0][0])},${base} L ${f2(pts[0][0])},${f2(pts[0][1])} `;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        const nx = mx - x, ny = my - base, nl = Math.hypot(nx, ny) || 1;
        sd += `Q ${f2(mx + (nx / nl) * ry * 0.2)},${f2(my + (ny / nl) * ry * 0.2)} ${f2(bx)},${f2(by)} `;
      }
      sd += 'Z ';
      sh += `M ${f2(x - rx * 0.62)},${f2(base - ry * 0.55)} C ${f2(x - rx * 0.4)},${f2(base - ry * 1.02)} ${f2(x + rx * 0.3)},${f2(base - ry * 1.06)} ${f2(x + rx * 0.5)},${f2(base - ry * 0.82)} C ${f2(x + rx * 0.1)},${f2(base - ry * 0.86)} ${f2(x - rx * 0.3)},${f2(base - ry * 0.78)} ${f2(x - rx * 0.62)},${f2(base - ry * 0.55)} Z `;
    }
    svgEl('path', { d: sd, class: 'shrub' }, host);
    svgEl('path', { d: sh, class: 'shrub-hi' }, host);

    // the terrace wall below the border (only seen while the camera comes down on arrival)
    svgEl('rect', { x: X0, y: 700, width: X1 - X0, height: 160, class: 'terrace-wall' }, host);
    // the stone border the sand meets
    let st = '', moss = '';
    for (let x = X0; x < X1;) {
      const w = 34 + rng() * 46, h = 12 + rng() * 9;
      const y = 703;
      st += `M ${f2(x + 3)},${f2(y)} C ${f2(x)},${f2(y - h * 0.9)} ${f2(x + w * 0.2)},${f2(y - h * 1.05)} ${f2(x + w * 0.5)},${f2(y - h * 1.05)} C ${f2(x + w * 0.85)},${f2(y - h * 1.05)} ${f2(x + w)},${f2(y - h * 0.8)} ${f2(x + w - 3)},${f2(y)} Z `;
      if (rng() < 0.45) moss += `M ${f2(x + w * 0.2)},${f2(y - h * 0.9)} Q ${f2(x + w * 0.5)},${f2(y - h * 1.2)} ${f2(x + w * 0.78)},${f2(y - h * 0.88)} Q ${f2(x + w * 0.5)},${f2(y - h * 0.7)} ${f2(x + w * 0.2)},${f2(y - h * 0.9)} Z `;
      x += w - 2;
    }
    svgEl('path', { d: st, class: 'terrace-stone' }, host);
    svgEl('path', { d: moss, class: 'c-moss' }, host);
  }
}
