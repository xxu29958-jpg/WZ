// Effects — little drawn things that float off Kon: music notes, z's,
// hearts, sneeze puffs, the pop of a sleep bubble.

import { smoothstep } from '../math.js';
import { NS, f2, tr } from '../util.js';

const SHAPES = {
  note: 'M -4.5,3.5 a 4.6,3.6 -20 1 0 9,-2.4 a 4.6,3.6 -20 1 0 -9,2.4 Z M 3.2,1.4 h 2.2 v -17 h -2.2 Z M 5.4,-15.6 q 7,3.6 7.2,11 q -2.2,-5.4 -7.2,-6.4 Z',
  z: 'M -6,-6 h 12 l -12,12 h 12',
  heart: 'M 0,6 C -10,-1 -9,-9 -4,-9 C -1.5,-9 0,-7 0,-5 C 0,-7 1.5,-9 4,-9 C 9,-9 10,-1 0,6 Z',
};

export class FxLayer {
  constructor(layer, rng) {
    this.layer = layer;
    this.rng = rng;
    this.items = [];
    this.timers = { notes: 0, zzz: 0, hearts: 0 };
  }
  spawn(kind, pos, opts = {}) {
    if (this.items.length > 24) return;
    let el;
    if (kind === 'puff' || kind === 'pop') {
      el = document.createElementNS(NS, 'circle');
      el.setAttribute('class', kind === 'puff' ? 'fx-puff' : 'fx-pop');
      el.setAttribute('r', kind === 'puff' ? String(3 + this.rng() * 4) : '6');
    } else {
      el = document.createElementNS(NS, 'path');
      el.setAttribute('d', SHAPES[kind]);
      el.setAttribute('class', kind === 'note' ? 'fx-note' : kind === 'z' ? 'fx-z' : 'fx-heart');
    }
    this.layer.appendChild(el);
    const life = { note: 1.9, z: 2.6, heart: 1.5, puff: 0.7, pop: 0.35 }[kind];
    this.items.push({
      kind, el, life, t: 0,
      x: pos.x, y: pos.y,
      vx: opts.vx ?? 0, vy: opts.vy ?? 0,
      seed: this.rng() * 10,
      side: opts.side ?? 1,
    });
  }
  burst(kind, pos, n) {
    for (let i = 0; i < n; i++) {
      if (kind === 'puff') {
        this.spawn('puff', pos, { vx: (this.rng() * 2 - 1) * 60, vy: 30 + this.rng() * 50 });
      } else if (kind === 'heart') {
        this.spawn('heart', { x: pos.x + (this.rng() * 2 - 1) * 30, y: pos.y }, { vx: (this.rng() * 2 - 1) * 20, vy: -45 - this.rng() * 20 });
      } else {
        this.spawn(kind, pos);
      }
    }
  }
  update(dt, P, rig) {
    const fx = P.fx || {};
    const tm = this.timers;
    if (fx.notes) {
      tm.notes -= dt;
      if (tm.notes <= 0) {
        const m = rig.headToBody(8, 38);
        const side = P.yaw >= 0 ? 1 : -1;
        this.spawn('note', rig.bodyToLocal(m.x + side * 10, m.y), { vx: side * (18 + this.rng() * 12), vy: -38, side });
        tm.notes = 0.5 + this.rng() * 0.25;
      }
    } else tm.notes = 0.15;
    if (fx.zzz) {
      tm.zzz -= dt;
      if (tm.zzz <= 0) {
        const m = rig.headToBody(60, -70);
        this.spawn('z', rig.bodyToLocal(m.x, m.y), { vx: 16, vy: -26 });
        tm.zzz = fx.zzz > 1 ? 0.55 : 1.05;
      }
    } else tm.zzz = 0.4;
    if (fx.hearts) {
      tm.hearts -= dt;
      if (tm.hearts <= 0) {
        const m = rig.headToBody((this.rng() * 2 - 1) * 50, -96);
        this.spawn('heart', rig.bodyToLocal(m.x, m.y), { vx: (this.rng() * 2 - 1) * 18, vy: -42 });
        tm.hearts = 0.42;
      }
    } else tm.hearts = 0.1;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const u = it.t / it.life;
      if (u >= 1) {
        it.el.remove();
        this.items.splice(i, 1);
        continue;
      }
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      let sc = 1, op = 1, rotA = 0;
      if (it.kind === 'note') {
        it.x += Math.sin(it.t * 6 + it.seed) * 0.5;
        sc = 0.6 + 0.5 * smoothstep(0, 0.25, u);
        op = 1 - smoothstep(0.6, 1, u);
        rotA = Math.sin(it.t * 5 + it.seed) * 14;
      } else if (it.kind === 'z') {
        it.x += Math.sin(it.t * 2.4 + it.seed) * 0.3;
        sc = 0.45 + u * 0.9;
        op = smoothstep(0, 0.12, u) * (1 - smoothstep(0.65, 1, u));
        rotA = -12 + Math.sin(it.t * 2) * 8;
      } else if (it.kind === 'heart') {
        it.x += Math.sin(it.t * 7 + it.seed) * 0.4;
        sc = 0.4 + 0.8 * smoothstep(0, 0.3, u);
        op = 1 - smoothstep(0.6, 1, u);
      } else if (it.kind === 'puff') {
        it.vx *= 0.94; it.vy *= 0.94;
        sc = 0.6 + u * 1.2;
        op = 1 - u;
      } else if (it.kind === 'pop') {
        sc = 0.6 + u * 2.2;
        op = 1 - u;
      }
      it.el.setAttribute('transform', `${tr(it.x, it.y)} rotate(${f2(rotA)}) scale(${f2(sc)})`);
      it.el.style.opacity = f2(op);
    }
  }
}
