// A sparrow that visits the garden now and then.
//
// It flies in on an arc, perches somewhere (the lantern roof, the wish rack,
// the rock, the basin rim, a patch of sand — or the head of a fox who is being
// very still), hops, pecks, cocks its head, and flies off when something gets
// too close or too sudden. Kon can watch it, stalk it and pounce. The bird
// always gets away.
//
// Without a `parent` element nothing is drawn, so the behavior can be tested.

import { clamp, lerp } from '../math.js';
import { svgEl, f2 } from '../util.js';
import { depthScale, randomSpot } from './world.js';

// x, y: where the feet go; groundY: where that spot meets the ground (for size and depth)
const PERCHES = [
  { id: 'lantern', x: 351, y: 513, groundY: 810, weight: 1 },
  { id: 'rack', x: 1262, y: 591, groundY: 838, weight: 1 },
  { id: 'rock', x: 1094, y: 847, groundY: 888, weight: 0.9 },
  { id: 'basin', x: 416, y: 884, groundY: 905, weight: 0.8, face: 1 },
  { id: 'cushion', x: 836, y: 778, groundY: 826, weight: 0.7, needsEmpty: true },
];
export const GROUND_PERCH = 'sand';
const CLACK_AT = { x: 630, y: 905 };   // where the bamboo strikes its stone

const FLEE = {
  cursorNear: 55,     // the cursor right on top of it
  cursorFast: 120,    // a quick cursor this close
  konWalking: 140,    // Kon walking up to it
  konSneaking: 420,   // Kon creeping up: within this, noticed now and then…
  sneakNotice: 0.07,  // …at this chance per second (most hunts get to the pounce)
  pounce: 420,
};

export class Birds {
  constructor({ parent = null, rng = Math.random, reduced = false, auto = true } = {}) {
    this.rng = rng;
    this.reduced = reduced;
    this.auto = auto;            // visits on its own (scripted checks turn this off)
    this.sneakNotice = FLEE.sneakNotice;
    this.lastFlee = null;
    this.t = 0;
    this.state = 'away';
    this.nextVisit = 24 + rng() * 24;
    this.x = -100;
    this.y = 300;
    this.dir = 1;
    this.scale = 1;
    this.cock = 0;
    this.peck = 0;
    this.events = [];
    this.visits = 0;
    this.el = parent ? this.build(parent) : null;
    if (this.el) this.el.style.display = 'none';
  }

  build(parent) {
    const g = svgEl('g', { id: 'sparrow', class: 'sparrow', 'aria-hidden': 'true' }, parent);
    this.flip = svgEl('g', {}, g);
    this.body = svgEl('g', {}, this.flip);
    this.legs = svgEl('path', { d: 'M -2,-4 L -3.5,0 M 2,-4 L 2.5,0', class: 'bird-legs' }, this.body);
    this.tail = svgEl('path', { d: 'M -7,-12 L -19,-18 L -18,-10 Z', class: 'bird-tail ink-thin' }, this.body);
    svgEl('ellipse', { cx: 0, cy: -11, rx: 10.5, ry: 8, class: 'bird-body ink-thin' }, this.body);
    svgEl('path', { d: 'M -3,-5 C 1,-3 6,-4 9,-8 C 8,-4 3,-3 -3,-4 Z', class: 'bird-belly' }, this.body);
    this.wing = svgEl('path', { d: 'M -8,-13 C -3,-19 5,-18 7,-12 C 2,-9 -4,-9 -8,-13 Z', class: 'bird-wing ink-thin' }, this.body);
    this.head = svgEl('g', {}, this.body);
    svgEl('circle', { r: 6, class: 'bird-head ink-thin' }, this.head);
    svgEl('path', { d: 'M -5,-2.5 C -2,-6 3,-6 5.5,-3 C 2,-4.2 -2,-4.2 -5,-2.5 Z', class: 'bird-cap' }, this.head);
    svgEl('path', { d: 'M -0.5,1.6 C 1.5,4.4 4.6,4.2 5.6,1.4 C 3.6,2.4 1.2,2.4 -0.5,1.6 Z', class: 'bird-cheek' }, this.head);
    svgEl('path', { d: 'M 5.2,-1.3 L 9.4,0 L 5.2,1.3 Z', class: 'bird-beak' }, this.head);
    svgEl('circle', { cx: 2.6, cy: -0.8, r: 1.3, class: 'bird-eye' }, this.head);
    svgEl('circle', { cx: 3, cy: -1.25, r: 0.45, class: 'bird-glint' }, this.head);
    return g;
  }

  /** What Kon can see of it (null while it is away). */
  object() {
    if (this.state === 'away') return null;
    const onKon = this.perch?.id === 'kon';
    let sal = 0.7;
    if (this.state === 'perched') {
      // new and fidgety is interesting; a bird that just sits there fades into the garden
      const fresh = Math.exp(-(this.t - this.perchedAt) / 5);
      sal = onKon ? 0.05 : 0.32 + 0.3 * fresh + (this.hop || this.peck > 0 ? 0.12 : 0);
    }
    return {
      id: 'bird', kind: 'bird', x: this.x, y: this.y - 10 * this.scale, sal,
      state: this.state, perch: this.perch?.id ?? null, visit: this.visits,
      perchedFor: this.state === 'perched' ? this.t - this.perchedAt : 0,
      ground: this.perch?.id === GROUND_PERCH, groundY: this.perch?.groundY ?? this.y,
    };
  }

  /** Depth-sorting key: just in front of its perch (or of Kon, when riding on Kon). */
  depthKey(konKey) {
    if (!this.perch) return 2000;
    if (this.perch.id === 'kon') return konKey + 0.01;
    return this.perch.groundY + 0.6;
  }

  /**
   * Bring a visitor now (scripted checks and demos), optionally to a given perch
   * ('lantern', 'rack', 'rock', 'basin', 'cushion', 'sand', 'kon'); `at` picks the spot on the sand.
   */
  visit(perchId = null, at = null, ctx = this.ctx) {
    if (this.state !== 'away' || !ctx) return false;
    this.arrive(ctx, perchId, at);
    return true;
  }

  pickPerch(ctx, want, at = null) {
    if (ctx.konCrown && ((want === 'kon' && ctx.konStill) || (!want && ctx.konStill && this.rng() < 0.7))) return { id: 'kon' };
    if (at) return { id: GROUND_PERCH, x: at.x, y: at.y, groundY: at.y };
    if (want === GROUND_PERCH || (!want && this.rng() < 0.4)) {
      for (let i = 0; i < 6; i++) {
        const p = randomSpot(this.rng);
        // somewhere open, not right next to Kon
        if (p.y > 868 && (!ctx.kon || Math.hypot(p.x - ctx.kon.x, p.y - ctx.kon.y) > 300)) return { id: GROUND_PERCH, x: p.x, y: p.y, groundY: p.y };
      }
    }
    const ok = PERCHES.filter((p) => (!want || p.id === want) && !(p.needsEmpty && ctx.kon && ctx.kon.seat === 'cushion'));
    const pool = ok.length ? ok : PERCHES.slice(0, 1);
    let r = this.rng() * pool.reduce((s, p) => s + p.weight, 0);
    for (const p of pool) { r -= p.weight; if (r <= 0) return { ...p }; }
    return { ...pool[0] };
  }

  arrive(ctx, want = null, at = null) {
    this.visits += 1;
    this.perch = this.pickPerch(ctx, want, at);
    const target = this.perchPoint(ctx);
    const fromLeft = target.x > (ctx.view.x + ctx.view.w / 2) ? this.rng() < 0.3 : this.rng() < 0.7;
    const vb = ctx.view;
    this.from = { x: fromLeft ? vb.x - 50 : vb.x + vb.w + 50, y: vb.y + 60 + this.rng() * 140 };
    this.ctrl = { x: lerp(this.from.x, target.x, 0.55), y: Math.min(this.from.y, target.y) - 90 };
    this.to = target;
    this.flightT = 0;
    this.flightDur = 1.3 + Math.hypot(target.x - this.from.x, target.y - this.from.y) / 560;
    this.x = this.from.x;
    this.y = this.from.y;
    this.state = 'flyIn';
    if (this.el) this.el.style.display = '';
    this.events.push({ type: 'birdArrive', perch: this.perch.id });
  }

  perchPoint(ctx) {
    if (this.perch.id === 'kon') return { x: ctx.konCrown.x, y: ctx.konCrown.y };
    return { x: this.perch.x, y: this.perch.y };
  }

  fly(reason) {
    if (this.state !== 'perched' && this.state !== 'flyIn') return;
    // away from whatever spooked it, and up over the wall
    const away = this.spookX != null ? (Math.sign(this.x - this.spookX) || this.dir) : (this.rng() < 0.5 ? -1 : 1);
    this.dir = away;
    this.state = 'flyAway';
    this.from = { x: this.x, y: this.y };
    this.to = { x: this.x + away * (650 + this.rng() * 350), y: this.y - 560 - this.rng() * 200 };
    this.ctrl = { x: this.x + away * 140, y: this.y - 30 };
    this.flightT = 0;
    this.flightDur = 1.15 + this.rng() * 0.4;
    this.spookX = null;
    this.lastFlee = reason;
    this.events.push({ type: 'birdFlee', reason, perch: this.perch?.id, x: this.x, y: this.y });
  }

  /**
   * @param ctx { view: the visible part of the world {x,y,w,h},
   *              pointer: the input tracker's pointer,
   *              kon: mover state, konCrown: world point on top of Kon's head,
   *              konStill: deep meditation or sleep, konPouncing, clack, night }
   * @returns events: birdArrive, birdLand, birdFlee, birdChirp
   */
  update(dt, ctx) {
    this.t += dt;
    this.events = [];
    this.ctx = ctx;
    this.konY = ctx.kon ? ctx.kon.y : null;
    if (this.state === 'away') {
      // sparrows keep daylight hours
      if (this.auto && !this.reduced && !ctx.night && this.t > this.nextVisit) this.arrive(ctx);
      if (this.state === 'away') return this.events;
    }
    if (this.state === 'flyIn' || this.state === 'flyAway') this.flight(dt, ctx);
    else if (this.state === 'perched') this.perched(dt, ctx);
    this.draw();
    return this.events;
  }

  flight(dt, ctx) {
    this.flightT += dt;
    const u = clamp(this.flightT / this.flightDur);
    if (this.state === 'flyIn' && this.perch.id === 'kon') {
      if (!ctx.konStill) { this.perch = this.pickPerch({ ...ctx, konStill: false }, null); this.to = this.perchPoint(ctx); }
      else this.to = this.perchPoint(ctx);
    }
    // arriving: fast, then braking; leaving: a quick start that keeps accelerating
    const e = this.state === 'flyIn' ? 1 - (1 - u) ** 2.2 : u ** 1.6;
    const px = this.x;
    this.x = (1 - e) ** 2 * this.from.x + 2 * (1 - e) * e * this.ctrl.x + e * e * this.to.x;
    this.y = (1 - e) ** 2 * this.from.y + 2 * (1 - e) * e * this.ctrl.y + e * e * this.to.y;
    // sparrows bound along: a burst of flaps, a short glide with wings tucked
    if (u < 0.85) this.y += Math.sin(this.flightT * 9) * 6;
    if (Math.abs(this.x - px) > 0.3) this.dir = Math.sign(this.x - px);
    this.landing = this.state === 'flyIn' && u > 0.8;
    if (u < 1) return;
    if (this.state === 'flyIn') {
      this.state = 'perched';
      this.perchedAt = this.t;
      this.stay = this.perch.id === 'kon' ? 1e9 : 9 + this.rng() * 14;
      this.nextMove = this.t + 0.5;
      this.hop = null;
      this.peck = 0;
      this.landing = false;
      this.hopKick = 1;
      if (this.perch.face) this.dir = this.perch.face;
      this.events.push({ type: 'birdLand', perch: this.perch.id, x: this.x, y: this.y });
    } else {
      this.state = 'away';
      this.perch = null;
      if (this.el) this.el.style.display = 'none';
      this.nextVisit = this.t + 45 + this.rng() * 50;
    }
  }

  perched(dt, ctx) {
    const p = ctx.pointer;
    const sc = this.scale;
    const onKon = this.perch.id === 'kon';
    // riding on Kon: sit still on the head; leave the moment Kon stirs
    if (onKon) {
      if (!ctx.konStill || !ctx.konCrown) { this.spookX = ctx.kon ? ctx.kon.x : null; this.fly('kon stirred'); return; }
      this.x = ctx.konCrown.x;
      this.y = ctx.konCrown.y;
    }
    // too close, too sudden, too loud
    if (p && p.present) {
      const d = Math.hypot(p.x - this.x, p.y - (this.y - 10 * sc));
      if (d < FLEE.cursorNear * sc || (d < FLEE.cursorFast * sc && p.speed > 260)) { this.spookX = p.x; this.fly('cursor'); return; }
    }
    if (ctx.kon && !onKon) {
      const k = ctx.kon;
      // distance on the ground, with depth counting extra
      const kd = Math.hypot(k.x - this.x, (k.y - this.perch.groundY) * 1.6);
      const spook = (why) => { this.spookX = k.x; this.fly(why); };
      if (ctx.konPouncing && kd < FLEE.pounce) return spook('pounce');
      if (k.moving && k.gait !== 'sneak' && kd < FLEE.konWalking) return spook('kon');
      if (k.moving && k.gait === 'sneak' && kd < FLEE.konSneaking && this.rng() < dt * this.sneakNotice) return spook('spotted kon');
    }
    // the bamboo's TOK: right next to it, always a fright; across the garden, only sometimes
    if (ctx.clack && !onKon && (Math.hypot(this.x - CLACK_AT.x, this.y - CLACK_AT.y) < 320 || this.rng() < 0.25)) { this.spookX = CLACK_AT.x; this.fly('clack'); return; }
    if (ctx.night && !onKon) { this.fly('night'); return; }
    if (this.t - this.perchedAt > this.stay) { this.fly('done'); return; }
    if (this.rng() < dt * 0.12) this.events.push({ type: 'birdChirp', x: this.x, y: this.y });

    // a sparrow's little business: hop, peck, cock the head, turn around
    this.hopKick = Math.max(0, (this.hopKick || 0) - dt * 4);
    if (this.hop) {
      const h = this.hop;
      h.t += dt;
      const u = clamp(h.t / h.dur);
      this.x = lerp(h.fx, h.tx, u);
      this.y = lerp(h.fy, h.ty, u) - Math.sin(u * Math.PI) * 8 * sc;
      if (u >= 1) { this.hop = null; this.hopKick = 1; if (this.perch.id === GROUND_PERCH) { this.perch.x = this.x; this.perch.y = this.y; this.perch.groundY = this.y; } }
    } else if (this.t > this.nextMove) {
      const r = this.rng();
      const ground = this.perch.id === GROUND_PERCH;
      if (ground && r < 0.35) {
        const dx = (this.rng() < 0.65 ? this.dir : -this.dir) * (12 + this.rng() * 20);
        const ty = clamp(this.y + (this.rng() * 2 - 1) * 6, 872, 960);
        this.dir = Math.sign(dx);
        this.hop = { t: 0, dur: 0.2, fx: this.x, fy: this.y, tx: clamp(this.x + dx, 230, 1150), ty };
      } else if (r < (onKon ? 0.3 : 0.62)) {
        this.peck = 0.3;
      } else if (r < 0.85) {
        this.cock = (this.rng() * 2 - 1) * 22;
      } else if (!onKon || this.rng() < 0.3) {
        this.dir = -this.dir;
      }
      this.nextMove = this.t + 0.4 + this.rng() * 1.2;
    }
    this.peck = Math.max(0, this.peck - dt);
  }

  draw() {
    // size and depth from where its perch meets the ground
    const groundY = this.perch?.id === 'kon' && this.konY ? this.konY : this.state === 'perched' || this.landing ? this.perch.groundY : 820;
    this.scale = clamp(depthScale(groundY), 0.75, 1.45);
    if (!this.el) return;
    const sc = this.scale * 1.15;
    this.el.setAttribute('transform', `translate(${f2(this.x)} ${f2(this.y)}) scale(${f2(sc)})`);
    this.flip.setAttribute('transform', this.dir < 0 ? 'scale(-1 1)' : '');
    const flying = this.state !== 'perched';
    const pk = this.peck > 0 ? Math.sin(((0.3 - this.peck) / 0.3) * Math.PI) : 0;
    const tilt = flying ? -8 : pk * 38 - (this.hopKick || 0) * 6;
    this.body.setAttribute('transform', `rotate(${f2(tilt)} 2 -6)`);
    this.head.setAttribute('transform', `translate(8 -18) rotate(${f2(flying ? 0 : this.cock * (1 - pk))})`);
    this.tail.setAttribute('transform', `rotate(${f2(flying ? -6 : (this.hopKick || 0) * 14)} -7 -12)`);
    this.legs.style.opacity = flying && !this.landing ? '0' : '1';
    if (flying) {
      // a burst of beats, then a short glide (wings tucked); spread wide to land
      const beating = this.landing || Math.sin(this.flightT * 9) > -0.35;
      const w = beating ? Math.sin(this.flightT * 44) : -0.2;
      this.wing.setAttribute('transform', `translate(0 -12) scale(1 ${f2(this.landing ? -1.5 : -1.7 * w)}) translate(0 12)`);
    } else {
      this.wing.removeAttribute('transform');
    }
  }
}

/** The bird's view of the world this frame, assembled from the brain, mover and rig. */
export function birdContext({ brain, kon, body, view, pointer, clack = false, night = false }) {
  return {
    view,
    pointer,
    kon,
    konCrown: body.crown,
    konStill: brain.isStill(),
    konPouncing: brain.isPouncing(),
    clack,
    night,
  };
}
