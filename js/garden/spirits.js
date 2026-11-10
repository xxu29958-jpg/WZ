// Tsubu — the pebbles that are not pebbles.
//
// Five small stone spirits live under the sand. They come out when nobody is
// watching: when the cursor has been still for a while (or is gone), up they
// pop, one by one, and go about their business: a parade across the sand, a
// wobbly tower, an evening around the warm lantern. When Kon truly meditates
// they come and sit with it. The moment anything moves (your cursor, or Kon
// coming over to look) they are pebbles again: eyes shut, sprout folded flat,
// perfectly still. Hold still and they carry on. Hover over one for too long,
// or tap it, and it squeaks and dives back under the sand.
//
// It's the game Kon plays with you, the other way around.
//
// Without a `parent` element nothing is drawn, so the behavior can be tested.

import { clamp, lerp, smoothstep } from '../math.js';
import { svgEl, f2 } from '../util.js';
import { depthScale, isFree, pushOut } from './world.js';

const N = 5;
const HIDES = [{ x: 262, y: 874 }, { x: 1010, y: 954 }, { x: 596, y: 968 }, { x: 1126, y: 806 }, { x: 868, y: 922 }];
// around the cushion, for sitting with Kon; around the lantern, for a warm evening
const ZEN_SLOTS = [{ x: 604, y: 872 }, { x: 682, y: 898 }, { x: 800, y: 912 }, { x: 922, y: 898 }, { x: 998, y: 872 }];
const LAMP_SLOTS = [{ x: 224, y: 848 }, { x: 284, y: 860 }, { x: 398, y: 862 }, { x: 452, y: 848 }, { x: 340, y: 868 }];
const WAKE_AFTER = 1.3;      // seconds of stillness before the first one dares to move
const STACK_H = 14.5;        // how much taller the tower gets per pebble (local units)

export class Spirits {
  constructor({ parent = null, rng = Math.random, reduced = false, auto = true } = {}) {
    this.rng = rng;
    this.reduced = reduced;
    this.auto = auto;            // outings of their own accord (scripted checks turn this off)
    this.t = 0;
    this.unwatched = 0;
    this.nextOut = 16 + rng() * 14;
    this.troupe = { mode: 'under', clock: 0, done: 0, last: null };
    this.events = [];
    this.list = [];
    for (let i = 0; i < N; i++) {
      this.list.push({
        i, size: [1.12, 0.92, 1.0, 0.84, 1.2][i], tone: i % 3, x: 0, y: 0, h: 0, state: 'under', rise: 0, riseAt: 0,
        stone: 1, eye: 0, shut: 0, hop: null, wait: 0, tx: 0, ty: 0, face: 1, stack: -1, near: 0, wob: 0, wobV: 0, kick: 0, sit: false,
        el: null,
      });
    }
    if (parent) for (const s of this.list) this.build(s, parent);
  }

  build(s, parent) {
    const g = svgEl('g', { id: `tsubu-${s.i}`, class: `tsubu tsubu-t${s.tone}`, 'aria-hidden': 'true' }, parent);
    g.style.display = 'none';
    s.shadow = svgEl('ellipse', { rx: 11.5, ry: 3.2, class: 'tsubu-shadow' }, g);
    s.body = svgEl('g', {}, g);
    svgEl('path', { d: 'M -11,-2 C -12.5,-12 -7,-18.5 0,-18.5 C 8,-18.5 12.5,-11 11,-2 C 10,2 -10,2 -11,-2 Z', class: 'tsubu-body' }, s.body);
    if (s.tone === 1) svgEl('path', { d: 'M -8.6,-12.6 C -5,-19.6 5.6,-19.6 8.8,-12.4 C 3,-15 -3,-15.2 -8.6,-12.6 Z', class: 'tsubu-moss' }, s.body);
    svgEl('path', { d: 'M -7,-13 Q -3,-16.4 2,-16', class: 'tsubu-hi' }, s.body);
    s.faceEl = svgEl('g', {}, s.body);
    s.eyes = svgEl('g', {}, s.faceEl);
    svgEl('ellipse', { cx: -4.2, cy: -8.4, rx: 1.7, ry: 2.3, class: 'tsubu-eye' }, s.eyes);
    svgEl('ellipse', { cx: 4.2, cy: -8.4, rx: 1.7, ry: 2.3, class: 'tsubu-eye' }, s.eyes);
    s.lids = svgEl('path', { d: 'M -6.2,-8.2 q 2,1.7 4,0 M 2.2,-8.2 q 2,1.7 4,0', class: 'tsubu-shut' }, s.faceEl);
    s.cheeks = svgEl('g', {}, s.faceEl);
    svgEl('ellipse', { cx: -7.4, cy: -5.2, rx: 1.9, ry: 1.1, class: 'tsubu-blush' }, s.cheeks);
    svgEl('ellipse', { cx: 7.4, cy: -5.2, rx: 1.9, ry: 1.1, class: 'tsubu-blush' }, s.cheeks);
    // a two-leaf sprout on top (it lies flat when they play pebble)
    s.sprout = svgEl('g', { transform: 'translate(0 -18)' }, s.body);
    svgEl('path', { d: 'M 0,0 q 1,-4 0,-7', class: 'tsubu-stem' }, s.sprout);
    svgEl('path', { d: 'M 0,-7 C -6,-13 -9.5,-8.5 -8,-5.6 C -5,-4.8 -2,-5.8 0,-7 Z M 0,-7 C 6,-13 9.5,-8.5 8,-5.6 C 5,-4.8 2,-5.8 0,-7 Z', class: 'tsubu-leaf' }, s.sprout);
    // in the rain each carries a fallen maple leaf overhead
    s.brolly = svgEl('g', { transform: 'translate(0 -27)' }, s.body);
    svgEl('path', { d: 'M 0,9 L 0,0', class: 'tsubu-stem' }, s.brolly);
    svgEl('path', { d: 'M -13,3 L -8,-2 L -11,-7 L -5,-6 L -3,-12 L 0,-7 L 3,-12 L 5,-6 L 11,-7 L 8,-2 L 13,3 Q 0,-1 -13,3 Z', class: 'tsubu-brolly' }, s.brolly);
    s.brolly.style.display = 'none';
    s.el = g;
    s.depthKey = () => s.y + 0.2 + Math.max(0, s.stack) * 0.01;
  }

  get out() { return this.list.filter((s) => s.state === 'out'); }

  /** What Kon can see of them (null while they are all under the sand). */
  object(kon = null) {
    const out = this.out;
    if (!out.length) return null;
    // the one nearest Kon (or just the first), and whether any of them is on the move
    let pick = out[0];
    if (kon) for (const s of out) if (Math.hypot(s.x - kon.x, s.y - kon.y) < Math.hypot(pick.x - kon.x, pick.y - kon.y)) pick = s;
    const moving = out.some((s) => s.hop) && this.troupe.mode !== 'zen';
    return {
      id: 'tsubu', kind: 'tsubu', x: pick.x, y: pick.y - 10, groundY: pick.y, nearId: pick.i, out: out.length,
      moving, frozen: out.every((s) => s.stone > 0.6), sal: moving ? 0.3 : 0.02, mode: this.troupe.mode,
      reach: pick.y > 760 && pick.x > 230 && pick.x < 1130,
    };
  }

  /** Soft lights for the light map: at night they glow a little. */
  lights() {
    return this.out.filter((s) => s.rise > 0.6).map((s) => ({ x: s.x, y: s.y - 10, r: 46, color: [255, 232, 170], a: 0.42 * (1 - s.stone * 0.5) }));
  }

  /** Call them out now (scripted checks and demos): 'parade', 'tower', 'zen', 'lantern', or whatever they like. */
  outing(mode = null, ctx = this.ctx, at = null) {
    if (this.troupe.mode !== 'under') return false;
    const H = at || this.pickHide(ctx);
    for (const s of this.list) {
      s.state = 'out';
      s.x = H.x + (s.i - 2) * 21 + (this.rng() - 0.5) * 8;
      s.y = H.y + (s.i % 2 ? 9 : -5) + (this.rng() - 0.5) * 4;
      const q = pushOut(s);
      s.x = q.x; s.y = q.y;
      s.h = 0; s.rise = 0; s.riseAt = this.t + 0.25 + s.i * 0.42; s.stack = -1; s.hop = null; s.near = 0; s.sit = false; s.risen = false;
      s.tx = s.x; s.ty = s.y;
    }
    this.troupe = { mode: 'rise', clock: 0, done: 0, last: null, want: mode };
    this.events.push({ type: 'tsubuOut', x: H.x, y: H.y });
    return true;
  }

  /** They thought nobody was there: all five, caught in a tower in the middle of the garden. */
  caught(ctx = this.ctx) {
    if (this.troupe.mode !== 'under' || this.reduced) return false;
    const G = { x: 742, y: 940 };
    for (const s of this.list) {
      s.state = 'out'; s.x = G.x; s.y = G.y; s.rise = 1; s.risen = true; s.riseAt = 0; s.stack = s.i; s.h = s.i * STACK_H;
      s.hop = null; s.near = 0; s.sit = false; s.stone = 1; s.tx = G.x; s.ty = G.y;
    }
    this.troupe = { mode: 'tower', clock: 2.5, done: 1, last: 'parade', G, phase: 'hold', want: null };
    this.unwatched = 0;
    this.events.push({ type: 'tsubuCaught', x: G.x, y: G.y - 40 });
    return true;
  }

  pickHide(ctx) {
    const k = ctx && ctx.kon;
    const v = ctx && ctx.view;
    const ok = HIDES.filter((h) => (!v || (h.x > v.x + 60 && h.x < v.x + v.w - 60)) && (!k || Math.hypot(h.x - k.x, h.y - k.y) > 170));
    const pool = ok.length ? ok : HIDES;
    return pool[Math.floor(this.rng() * pool.length) % pool.length];
  }

  /** One of them dives back under the sand. */
  pop(s, by = 'user') {
    if (s.state !== 'out') return;
    s.state = 'under';
    s.hop = null;
    this.events.push({ type: 'tsubuPop', by, x: s.x, y: s.y - 8 - s.h, id: s.i });
    // a tower with a pebble missing: the ones above drop down a storey
    if (s.stack >= 0) for (const o of this.list) if (o.state === 'out' && o.stack > s.stack) { o.stack -= 1; o.kick = 1; }
    s.stack = -1;
  }

  /** A tap or click at a world point: on a spirit? It's gone. */
  tap(wx, wy) {
    for (const s of this.out) {
      const sc = depthScale(s.y) * s.size * 1.15;
      if (Math.hypot(wx - s.x, wy - (s.y - (9 + s.h) * sc)) < 17 * sc + 8) {
        this.pop(s, 'user');
        for (const o of this.out) o.wobV += 9;   // the others shiver
        return true;
      }
    }
    return false;
  }

  /** Kon poked one: it rocks like a stone that has been poked. Nothing more. */
  poke(id) {
    const s = this.list[id] || this.out[0];
    if (s) s.wobV += 14;
  }

  /**
   * @param ctx { now, pointer, view {x,y,w,h}, kon: mover state, konZen: deep meditation, konFloat: satori,
   *              konInspecting: Kon is on its way to look at them, konBusy: no outings just now,
   *              night, rain, clack }
   * @returns events: tsubuOut, tsubuRise, tsubuStep, tsubuPop {by}, tsubuTok, tsubuZen, tsubuCaught, tsubuHome
   */
  update(dt, ctx = {}) {
    this.t += dt;
    this.ctx = ctx;
    const out = this.events;
    this.events = [];
    const p = ctx.pointer;
    const moving = !!(p && p.present && ctx.now - p.lastMove < 0.45);
    this.unwatched = moving ? 0 : this.unwatched + dt;
    const T = this.troupe;

    if (T.mode === 'under') {
      if (this.auto && !this.reduced && !ctx.konBusy && this.t > this.nextOut && (this.unwatched > 3.6 || !(p && p.present))) this.outing(null, ctx);
      out.push(...this.events.splice(0));
      if (T.mode === 'under') return out;
    }
    const live = this.out;
    if (!live.length) {
      this.troupe = { mode: 'under', clock: 0, done: 0, last: null };
      this.nextOut = this.t + 40 + this.rng() * 45;
      out.push({ type: 'tsubuHome' });
      this.draw(ctx);
      return out;
    }

    // who is being watched? (the cursor's slightest move; Kon walking up)
    const calm = this.unwatched > WAKE_AFTER;
    let anyFree = false;
    for (const s of live) {
      const k = ctx.kon;
      const kd = k ? Math.hypot(k.x - s.x, (k.y - s.y) * 1.6) : 1e9;
      const konWatching = k && T.mode !== 'zen' && ((ctx.konInspecting && kd < 320) || (k.moving && kd < 150));
      s.free = this.unwatched > WAKE_AFTER + s.i * 0.2 && !konWatching;
      if (s.free) anyFree = true;
      s.stone += ((s.free ? 0 : 1) - s.stone) * (1 - Math.exp(-dt * (s.free ? 5 : 16)));
      // a cursor that lingers right on top of one is too much to bear
      if (p && p.present && s.rise > 0.8) {
        const sc = depthScale(s.y) * s.size * 1.15;
        const d = Math.hypot(p.x - s.x, p.y - (s.y - (9 + s.h) * sc));
        if (moving && d < 30 * sc + 10) { s.near += dt; s.wobV += dt * 60 * (this.rng() - 0.5); }
        else s.near = Math.max(0, s.near - dt * 0.6);
        if (s.near > 0.85) this.pop(s, 'user');
      }
      // the bamboo's TOK makes them jump (even pebbles)
      if (ctx.clack) { s.kick = 1; s.wobV += 6; }
    }
    if (anyFree) T.clock += dt;
    this.direct(dt, ctx, T, live, calm);
    for (const s of live) this.move(dt, s, T, ctx);
    out.push(...this.events.splice(0));
    this.draw(ctx);
    return out;
  }

  /** The troupe's current number: where everybody should be. */
  direct(dt, ctx, T, live, calm) {
    const next = () => {
      T.done += 1;
      T.clock = 0;
      const pick = T.want || (ctx.konZen ? 'zen' : ctx.night && this.rng() < 0.75 && T.last !== 'lantern' ? 'lantern'
        : T.done > 2 ? 'home' : T.last === 'parade' ? 'tower' : T.last === 'tower' ? 'parade' : this.rng() < 0.5 ? 'parade' : 'tower');
      T.want = null;
      T.mode = pick;
      T.last = pick;
      T.phase = null;
      for (const s of live) { s.sit = false; if (pick !== 'tower') s.stack = -1; }
      if (pick === 'parade') {
        T.way = [];
        for (let i = 0; i < 3 + Math.floor(this.rng() * 2); i++) T.way.push(this.openSpot(ctx));
      } else if (pick === 'tower') {
        const c = live.reduce((a, s) => ({ x: a.x + s.x / live.length, y: a.y + s.y / live.length }), { x: 0, y: 0 });
        T.G = pushOut({ x: clamp(c.x + (this.rng() - 0.5) * 120, 300, 1080), y: clamp(c.y, 880, 955) });
        T.phase = 'gather';
      } else if (pick === 'home' || pick === 'scatter') {
        T.H = this.pickHide(ctx);
      } else if (pick === 'zen') this.events.push({ type: 'tsubuZen' });
    };

    // Kon has sat down to meditate: go and sit with it. (And when it stirs: scatter!)
    if (ctx.konZen && !['zen', 'rise', 'scatter', 'home'].includes(T.mode) && calm) { T.want = 'zen'; next(); T.done -= 1; }
    if (T.mode === 'zen' && !ctx.konZen && !ctx.konFloat) { T.mode = 'scatter'; T.H = this.pickHide(ctx); T.clock = 0; for (const s of live) { s.sit = false; s.kick = 1; } }

    switch (T.mode) {
      case 'rise':
        if (T.clock > N * 0.42 + 1) next();
        break;
      case 'parade': {
        // follow the leader
        const lead = live[0];
        const w = T.way[0];
        if (!w) { next(); break; }
        lead.tx = w.x; lead.ty = w.y;
        if (Math.hypot(lead.x - w.x, lead.y - w.y) < 14) T.way.shift();
        for (let i = 1; i < live.length; i++) {
          const a = live[i - 1], s = live[i];
          if (Math.hypot(a.x - s.x, a.y - s.y) > 27) { s.tx = a.x; s.ty = a.y; } else { s.tx = s.x; s.ty = s.y; }
        }
        if (T.clock > 30) next();
        break;
      }
      case 'tower': {
        const G = T.G;
        if (T.phase === 'gather' || T.phase === 'hold') {
          let top = -1;
          for (const s of live) if (s.stack > top) top = s.stack;
          // one at a time: the next climbs up once the last has landed
          let turn = live.some((o) => o.stack >= 0 && o.hop) ? null : live.find((o) => o.stack < 0);
          for (const s of live) {
            if (s.stack >= 0) { s.tx = G.x; s.ty = G.y; continue; }
            // wait your turn beside the pile, then up you go
            const slot = { x: G.x + (s.i % 2 ? -1 : 1) * (26 + s.i * 5), y: G.y + 5 };
            if (s === turn && !s.hop && Math.hypot(s.x - slot.x, s.y - slot.y) < 12 && s.free) {
              turn = null;
              s.stack = top + 1;
              s.hop = { fx: s.x, fy: s.y, fh: 0, tx: G.x, ty: G.y, th: s.stack * STACK_H, t: 0, dur: 0.34, arc: 16 + s.stack * 4, tok: true };
            } else { s.tx = slot.x; s.ty = slot.y; }
          }
          if (T.phase === 'gather' && live.every((s) => s.stack >= 0 && !s.hop)) { T.phase = 'hold'; T.clock = 0; }
          if (T.phase === 'hold' && T.clock > 7) { T.phase = 'down'; T.clock = 0; }
          if (T.phase === 'gather' && T.clock > 26) { T.phase = 'down'; T.clock = 0; }
        } else {
          // down again, top first
          const stacked = live.filter((s) => s.stack >= 0).sort((a, b) => b.stack - a.stack);
          const s = stacked[0];
          if (s && !s.hop && T.clock > 0.38) {
            T.clock = 0;
            if (s.stack === 0) s.stack = -1;
            else {
              const to = pushOut({ x: G.x + (s.i % 2 ? -1 : 1) * (24 + s.stack * 9), y: G.y + 7 });
              s.hop = { fx: s.x, fy: s.y, fh: s.h, tx: to.x, ty: to.y, th: 0, t: 0, dur: 0.3, arc: 10 };
              s.tx = to.x; s.ty = to.y;
              s.stack = -1;
            }
          }
          if (!stacked.length) next();
        }
        break;
      }
      case 'zen':
      case 'lantern': {
        const slots = T.mode === 'zen' ? ZEN_SLOTS : LAMP_SLOTS;
        live.forEach((s) => {
          const sl = slots[s.i];
          s.tx = sl.x; s.ty = sl.y;
          s.sit = !s.hop && Math.hypot(s.x - sl.x, s.y - sl.y) < 9;
        });
        if (T.mode === 'lantern' && (T.clock > 34 || !ctx.night)) next();
        break;
      }
      case 'home':
      case 'scatter': {
        for (const s of live) {
          const hx = T.H.x + (s.i - 2) * 16, hy = T.H.y + (s.i % 2 ? 6 : -4);
          s.tx = hx; s.ty = hy;
          if (!s.hop && Math.hypot(s.x - hx, s.y - hy) < 12 && s.free) this.pop(s, 'home');
        }
        if (T.clock > 22) for (const s of live) if (s.free) this.pop(s, 'home');
        break;
      }
      default:
        break;
    }
  }

  openSpot(ctx) {
    const v = ctx.view || { x: 0, w: 1600 };
    for (let i = 0; i < 24; i++) {
      const p = { x: clamp(v.x + 70 + this.rng() * (v.w - 140), 250, 1120), y: 882 + this.rng() * 78 };
      if (isFree(p) && !(ctx.kon && Math.hypot(p.x - ctx.kon.x, p.y - ctx.kon.y) < 150)) return p;
    }
    return { x: 900, y: 930 };
  }

  /** One spirit, one frame: rising out of the sand, hopping toward where it should be. */
  move(dt, s, T, ctx) {
    if (!s.risen) {
      if (this.t > s.riseAt && s.free) {
        if (s.rise === 0) this.events.push({ type: 'tsubuRise', x: s.x, y: s.y });
        s.rise = Math.min(1, s.rise + dt * 3.4);
        if (s.rise >= 1) { s.risen = true; s.kick = 0.7; }
      }
      return;
    }
    s.kick = Math.max(0, s.kick - dt * 3.2);
    s.wait = Math.max(0, s.wait - dt);
    if (s.hop) {
      // (a hop that has begun is finished, watched or not: that's the bit you catch out of the corner of your eye)
      const h = s.hop;
      h.t += dt;
      const u = clamp(h.t / h.dur);
      s.x = lerp(h.fx, h.tx, u);
      s.y = lerp(h.fy, h.ty, u);
      s.h = lerp(h.fh || 0, h.th || 0, u) + Math.sin(u * Math.PI) * h.arc;
      if (u >= 1) {
        s.h = h.th || 0;
        s.hop = null;
        s.wait = 0.05 + this.rng() * 0.13;
        s.kick = 0.6;
        this.events.push(h.tok ? { type: 'tsubuTok', x: s.x, y: s.y } : { type: 'tsubuStep', x: s.x, y: s.y, size: s.size });
      }
      return;
    }
    if (s.stack > 0) { s.h += (s.stack * STACK_H - s.h) * (1 - Math.exp(-dt * 14)); return; }
    if (!s.free || s.wait > 0 || s.stack === 0) return;
    const dx = s.tx - s.x, dy = s.ty - s.y;
    const d = Math.hypot(dx, dy);
    if (d < 5) return;
    const quick = T.mode === 'scatter' ? 1.7 : 1;
    const step = Math.min(d, 15 * quick * depthScale(s.y));
    const to = pushOut({ x: s.x + (dx / d) * step, y: s.y + (dy / d) * step });
    s.face = Math.abs(dx) > 2 ? Math.sign(dx) : s.face;
    s.hop = { fx: s.x, fy: s.y, tx: to.x, ty: to.y, t: 0, dur: 0.2 / Math.sqrt(quick), arc: 8.5 };
  }

  draw(ctx = {}) {
    for (const s of this.list) {
      if (!s.el) continue;
      const show = s.state === 'out' || s.rise > 0.02;
      if (s.state === 'under') s.rise = Math.max(0, s.rise - 0.09);
      if (show !== s.shown) { s.shown = show; s.el.style.display = show ? '' : 'none'; }
      if (!show) continue;
      const sc = depthScale(s.y) * s.size * 1.15;
      // rocking like a stone that has been nudged
      s.wobV += (-s.wob * 180 - s.wobV * 9) * (1 / 60);
      s.wob += s.wobV * (1 / 60);
      const T = this.troupe;
      const float = ctx.konFloat && T.mode === 'zen' && s.sit ? 9 + Math.sin(this.t * 1.8 + s.i) * 3 : 0;
      const sway = s.stack > 0 && s.stone < 0.5 ? Math.sin(this.t * 2.6 + s.stack * 0.8) * s.stack * 1.3 : 0;
      s.el.setAttribute('transform', `translate(${f2(s.x + sway)} ${f2(s.y)}) scale(${f2(sc)})`);
      const air = s.hop ? Math.sin(clamp(s.hop.t / s.hop.dur) * Math.PI) : 0;
      const squash = 1 - s.kick * 0.2 + air * 0.12;
      const breathe = s.sit ? Math.sin(this.t * 1.5 + s.i) * 0.03 : 0;
      s.body.setAttribute('transform', `translate(0 ${f2(-s.h - float)}) rotate(${f2(s.wob)}) scale(${f2((1 + s.kick * 0.12 - air * 0.06) * 1)} ${f2((squash + breathe) * clamp(s.rise, 0.02, 1))})`);
      const lift = clamp((s.h + float) / 40);
      s.shadow.style.opacity = s.stack > 0 ? '0' : f2((1 - lift * 0.6) * smoothstep(0.1, 0.7, s.rise));
      // eyes: wide awake, shut tight as a pebble, or peacefully closed when sitting
      const peace = s.sit && s.stone < 0.5 ? (T.mode === 'zen' ? 1 : 0.55) : 0;
      const blink = Math.sin(this.t * 0.9 + s.i * 2.1) > 0.985 ? 0 : 1;
      const open = clamp((1 - s.stone * 1.4) * (1 - peace) * blink);
      s.eyes.setAttribute('transform', `translate(${f2(s.face * 1.4 * (1 - s.stone))} 0) translate(0 -8.4) scale(1 ${f2(Math.max(0.06, open))}) translate(0 8.4)`);
      s.eyes.style.opacity = f2(clamp(1.3 - s.stone * 1.6) * (peace > 0.9 ? 0 : 1));
      s.lids.style.opacity = f2(peace > 0.9 ? 1 : 0);
      s.cheeks.style.opacity = f2(1 - s.stone);
      // the sprout: perky, bouncing with each hop… or folded flat
      const perk = Math.sin(this.t * 3 + s.i) * 5 * (1 - s.stone) - air * 14 * s.face;
      s.sprout.setAttribute('transform', `translate(0 -18) rotate(${f2(lerp(perk, 84, smoothstep(0.2, 0.9, s.stone)))}) scale(${f2(1 - s.stone * 0.35)})`);
      const wet = !!ctx.rain && s.stone < 0.5;
      if (wet !== s.wet) { s.wet = wet; s.brolly.style.display = wet ? '' : 'none'; }
    }
  }
}

/** The spirits' view of the world this frame. */
export function spiritContext({ brain, kon, view, pointer, now, night = false, rain = false, clack = false }) {
  const st = brain.state;
  return {
    now, pointer, view, kon, night, rain, clack,
    konZen: brain.isStill(),   // deep meditation, or asleep: either way, good company
    konFloat: st === 'SATORI',
    konInspecting: !!(brain.life.act && brain.life.act.id === 'tsubu'),
    konBusy: ['POUNCE', 'STARTLED', 'JUDGE', 'DIZZY', 'WAKING'].includes(st),
  };
}
