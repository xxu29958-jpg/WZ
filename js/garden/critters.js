// Small neighbors: a frog that comes out in the rain, and a butterfly that
// takes a liking to whatever holds still (the bellflower, Kon's nose, your
// cursor).
//
// Without a `parent` element nothing is drawn, so the behavior can be tested.

import { clamp, lerp, noise1 } from '../math.js';
import { svgEl, f2 } from '../util.js';
import { depthScale } from './world.js';

// ---------------------------------------------------------------- the frog
const BASIN = { x: 480, y: 882 };                       // where it surfaces in the stone basin
// x, y: where it sits; groundY: where that spot meets the ground
const FROG_SPOTS = [
  { id: 'rim', x: 424, y: 889, groundY: 906 },
  { id: 'sandA', x: 330, y: 934, groundY: 934 },
  { id: 'sandB', x: 600, y: 964, groundY: 964 },
  { id: 'sandC', x: 430, y: 968, groundY: 968 },
];

export class Frog {
  constructor({ parent = null, rng = Math.random, auto = true } = {}) {
    this.rng = rng;
    this.auto = auto;
    this.t = 0;
    this.state = 'away';       // away | peek | sit | hop
    this.x = BASIN.x;
    this.y = BASIN.y;
    this.h = 0;
    this.dir = 1;
    this.spot = null;
    this.sac = 0;
    this.croakT = 0;
    this.squash = 0;
    this.bold = 0;             // how many times it has hopped away from Kon already
    this.events = [];
    this.el = parent ? this.build(parent) : null;
  }

  build(parent) {
    const g = svgEl('g', { id: 'frog', class: 'frog', 'aria-hidden': 'true' }, parent);
    g.style.display = 'none';
    this.shadow = svgEl('ellipse', { rx: 12, ry: 3.2, class: 'frog-shadow' }, g);
    this.flip = svgEl('g', {}, g);
    this.whole = svgEl('g', {}, this.flip);
    this.legs = svgEl('g', {}, this.whole);
    svgEl('path', { d: 'M -7,-3 C -15,-9 -14,-14 -7,-11 L -1,-3 Z', class: 'frog-body frog-ink' }, this.legs);
    svgEl('path', { d: 'M -12,-1 l -5,2 M -11,0 l -3,4', class: 'frog-toe' }, this.legs);
    this.sacEl = svgEl('circle', { cx: 10, cy: -4, r: 5, class: 'frog-sac frog-ink' }, this.whole);
    this.bodyEl = svgEl('g', {}, this.whole);
    svgEl('path', { d: 'M -11,-1 C -13,-11 -4,-16 4,-14.5 C 11,-13.5 14.5,-8 13,-3 C 12,0.5 -10,1 -11,-1 Z', class: 'frog-body frog-ink' }, this.bodyEl);
    svgEl('path', { d: 'M -6,-1 C -2,-5.5 8,-5.5 12.4,-2.4 C 8,0.2 -3,0.4 -6,-1 Z', class: 'frog-belly' }, this.bodyEl);
    svgEl('path', { d: 'M -7,-9 q 3,-3 7,-3', class: 'frog-hi' }, this.bodyEl);
    svgEl('path', { d: 'M 6,-3 l 2,4.5 l 4.5,-0.3', class: 'frog-toe' }, this.bodyEl);
    this.eyes = svgEl('g', {}, this.whole);
    svgEl('circle', { cx: 2.6, cy: -15, r: 3.5, class: 'frog-body frog-ink' }, this.eyes);
    svgEl('circle', { cx: 9, cy: -14, r: 3.3, class: 'frog-body frog-ink' }, this.eyes);
    this.pupils = svgEl('g', {}, this.eyes);
    svgEl('ellipse', { cx: 3.4, cy: -15.2, rx: 1.5, ry: 1.7, class: 'frog-pupil' }, this.pupils);
    svgEl('ellipse', { cx: 9.8, cy: -14.2, rx: 1.4, ry: 1.6, class: 'frog-pupil' }, this.pupils);
    svgEl('path', { d: 'M 6,-8 q 4,2.4 7.4,-0.6', class: 'frog-mouth' }, this.bodyEl);
    // peeking out of the basin: only the eyes show, and a ripple around them
    this.ripple = svgEl('path', { d: 'M -9,-9 q 6,-3 12,0 M -5,-6.5 q 8,2.6 22,0', class: 'frog-ripple' }, this.flip);
    return g;
  }

  /** What Kon can see of it (null while it's away). */
  object() {
    if (this.state === 'away') return null;
    return {
      id: 'frog', kind: 'frog', x: this.x, y: this.y - 8 - this.h, groundY: this.spot ? this.spot.groundY : 905,
      state: this.state, sal: this.state === 'peek' ? 0.1 : 0.26 + (this.sac > 0.3 || this.state === 'hop' ? 0.3 : 0),
    };
  }

  depthKey() { return (this.spot ? this.spot.groundY : 905) + 0.7; }

  /** Bring it out now (scripted checks and demos). */
  appear(spotId = 'rim') {
    if (this.state !== 'away') return false;
    this.state = 'peek';
    this.x = BASIN.x; this.y = BASIN.y; this.h = 0;
    this.peekT = 0;
    this.peekFor = 1.6;
    this.next = FROG_SPOTS.find((s) => s.id === spotId) || FROG_SPOTS[0];
    this.spot = null;
    this.bold = 0;
    this.stay = 70;
    this.events.push({ type: 'frogPeek', x: this.x, y: this.y });
    return true;
  }

  hopTo(spot, big = false) {
    this.from = { x: this.x, y: this.y };
    this.to = spot;
    this.hopT = 0;
    this.hopDur = big ? 0.55 : 0.42;
    this.arc = big ? 58 : 34;
    this.state = 'hop';
    this.dir = Math.sign(spot.x - this.x) || this.dir;
    this.events.push({ type: 'frogHop', x: this.x, y: this.y });
  }

  dive(leave = false) {
    this.leaving = leave;
    this.hopTo({ id: 'basin', x: BASIN.x, y: BASIN.y, groundY: 905, water: true }, true);
  }

  otherSpot(ctx, far = false) {
    const k = ctx.kon;
    const pool = FROG_SPOTS.filter((s) => s !== this.spot && (!k || Math.hypot(s.x - k.x, (s.groundY - k.y) * 1.6) > (far ? 190 : 110)));
    return pool.length ? pool[Math.floor(this.rng() * pool.length) % pool.length] : null;
  }

  /** A tap or click at a world point: on the frog? It leaps. */
  tap(wx, wy) {
    if (this.state !== 'sit') return false;
    const sc = depthScale(this.spot.groundY) * 1.25;
    if (Math.hypot(wx - this.x, wy - (this.y - 8 * sc)) > 20 * sc + 8) return false;
    this.flee(this.ctx || {}, true);
    return true;
  }

  flee(ctx, urgent = false) {
    this.frights = (this.t - (this.frightAt || -99) < 7 ? (this.frights || 0) : 0) + 1;
    this.frightAt = this.t;
    const to = this.frights >= 2 ? null : this.otherSpot(ctx, true);
    if (to) this.hopTo(to, urgent); else this.dive();
  }

  /**
   * @param ctx { pointer, kon: mover state, wet: how wet the ground is (0–1), raining }
   * @returns events: frogPeek, frogHop, frogLand, frogCroak, frogDive {x, y}
   */
  update(dt, ctx = {}) {
    this.t += dt;
    this.ctx = ctx;
    const out = this.events;
    this.events = [];
    if (this.state === 'away') {
      // rain brings it out
      if (this.auto && ctx.raining && ctx.wet > 0.3 && this.t > (this.backAt || 0)) { this.appear(); out.push(...this.events.splice(0)); }
      if (this.state === 'away') return out;
    }
    const p = ctx.pointer;
    this.squash = Math.max(0, this.squash - dt * 4);
    if (this.state === 'peek') {
      this.peekT += dt;
      const near = p && p.present && Math.hypot(p.x - this.x, p.y - this.y) < 70;
      if (near) this.peekT = Math.min(this.peekT, this.peekFor - 0.8);   // not while you're looking right at it
      if (this.peekT > this.peekFor) {
        if (ctx.wet < 0.1 && !ctx.raining) { this.state = 'away'; this.backAt = this.t + 20; }
        else this.hopTo(this.next || FROG_SPOTS[0], true);
      }
    } else if (this.state === 'hop') {
      this.hopT += dt;
      const u = clamp(this.hopT / this.hopDur);
      this.x = lerp(this.from.x, this.to.x, u);
      this.y = lerp(this.from.y, this.to.y, u);
      this.h = Math.sin(u * Math.PI) * this.arc;
      if (u >= 1) {
        this.h = 0;
        this.squash = 1;
        if (this.to.water) {
          out.push({ type: 'frogDive', x: BASIN.x, y: BASIN.y });
          if (this.leaving) { this.state = 'away'; this.backAt = this.t + 30; this.spot = null; }
          else { this.state = 'peek'; this.peekT = -1.2; this.peekFor = 3.5; this.spot = null; this.next = FROG_SPOTS[0]; }
        } else {
          this.state = 'sit';
          this.spot = this.to;
          this.sitT = 0;
          this.sitFor = 9 + this.rng() * 7;
          this.croakAt = this.t + 1.2 + this.rng() * 2;
          if (this.spot.id === 'rim') this.dir = 1;
          out.push({ type: 'frogLand', x: this.x, y: this.y });
        }
      }
    } else if (this.state === 'sit') {
      this.sitT += dt;
      this.stay -= dt;
      // croaking: the throat swells, twice
      if (this.t > this.croakAt) {
        this.croakAt = this.t + 3.2 + this.rng() * 3.6;
        this.croakT = 0.62;
        out.push({ type: 'frogCroak', x: this.x, y: this.y - 8 });
      }
      // too close, too sudden
      if (p && p.present) {
        const d = Math.hypot(p.x - this.x, p.y - (this.y - 8));
        if (d < 34 || (d < 90 && p.speed > 320)) { this.flee(ctx, true); out.push(...this.events.splice(0)); return this.finish(out, dt); }
      }
      const k = ctx.kon;
      if (k && k.moving && this.bold < 2 && Math.hypot(k.x - this.x, (k.y - this.spot.groundY) * 1.6) < 104) {
        // Kon coming up: a hop away (twice; after that it holds its ground)
        this.bold += 1;
        const to = this.otherSpot(ctx);
        if (to) { this.hopTo(to); out.push(...this.events.splice(0)); return this.finish(out, dt); }
      }
      if (this.stay < 0 || (ctx.wet < 0.12 && !ctx.raining)) this.dive(true);
      else if (this.sitT > this.sitFor) { const to = this.otherSpot(ctx); if (to) this.hopTo(to); else this.sitT = 0; }
    }
    out.push(...this.events.splice(0));
    return this.finish(out, dt);
  }

  finish(out, dt) {
    this.croakT = Math.max(0, this.croakT - dt);
    // two swells per croak
    this.sac = this.croakT > 0 ? Math.abs(Math.sin((0.62 - this.croakT) / 0.62 * Math.PI * 2)) : 0;
    this.draw();
    return out;
  }

  draw() {
    if (!this.el) return;
    const show = this.state !== 'away';
    if (show !== this.shown) { this.shown = show; this.el.style.display = show ? '' : 'none'; }
    if (!show) return;
    const gy = this.state === 'peek' ? 905 : this.spot && this.state === 'sit' ? this.spot.groundY : this.to ? this.to.groundY : 905;
    const sc = clamp(depthScale(gy), 0.8, 1.5) * 1.25;
    this.el.setAttribute('transform', `translate(${f2(this.x)} ${f2(this.y)}) scale(${f2(sc)})`);
    this.flip.setAttribute('transform', this.dir < 0 ? 'scale(-1 1)' : '');
    const peek = this.state === 'peek';
    const up = peek ? clamp(this.peekT / 0.5) : 1;
    // in the water only the eyes show
    this.bodyEl.style.display = this.legs.style.display = this.sacEl.style.display = peek ? 'none' : '';
    this.ripple.style.display = peek ? '' : 'none';
    this.shadow.style.display = peek ? 'none' : '';
    const air = this.state === 'hop' ? 1 : 0;
    this.whole.setAttribute('transform', `translate(0 ${f2(-this.h + (peek ? 9 + (1 - up) * 8 : 0))}) rotate(${f2(-air * 14)}) scale(${f2(1 + this.squash * 0.16)} ${f2(1 - this.squash * 0.22 + air * 0.1)})`);
    this.sacEl.setAttribute('r', f2(1 + this.sac * 6.5));
    this.shadow.style.opacity = f2(1 - clamp(this.h / 60) * 0.6);
    this.legs.setAttribute('transform', air ? 'rotate(34 -4 -4) translate(-3 2)' : '');
    const blink = Math.sin(this.t * 0.7 + 1) > 0.98;
    this.pupils.setAttribute('transform', `translate(0 -15) scale(1 ${blink ? 0.15 : 1}) translate(0 15)`);
  }
}

// ---------------------------------------------------------------- the butterfly
const FLOWER = { x: 670, y: 770 };

export class Butterfly {
  constructor({ parent = null, rng = Math.random, auto = true, reduced = false } = {}) {
    this.rng = rng;
    this.auto = auto;
    this.reduced = reduced;
    this.t = 0;
    this.state = 'away';       // away | fly | flower | cursor | nose | leave
    this.x = -100;
    this.y = 400;
    this.vx = 0;
    this.vy = 0;
    this.nextAt = 34 + rng() * 30;
    this.seed = rng() * 10;
    this.visitId = 1;          // (it tries your cursor once per visit)
    this.cursorVisits = 0;
    this.events = [];
    this.el = parent ? this.build(parent) : null;
  }

  build(parent) {
    const g = svgEl('g', { id: 'butterfly', class: 'butterfly', 'aria-hidden': 'true' }, parent);
    g.style.display = 'none';
    this.tilt = svgEl('g', {}, g);
    this.wings = [-1, 1].map((side) => {
      const w = svgEl('g', {}, this.tilt);
      const k = svgEl('g', { transform: `scale(${side} 1)` }, w);
      svgEl('path', { d: 'M 0,-1 C 3,-11 13,-15 17,-10 C 19,-5 12,0 0,1 Z', class: 'bfly-wing' }, k);
      svgEl('path', { d: 'M 11,-12 C 15,-13.6 17.6,-11.6 17,-8.6 C 14.6,-8.8 12.4,-10 11,-12 Z', class: 'bfly-tip' }, k);
      svgEl('path', { d: 'M 0,1 C 8,1 13,5 11,10 C 7,12 2,8 0,3 Z', class: 'bfly-wing low' }, k);
      svgEl('circle', { cx: 9, cy: -6, r: 1.5, class: 'bfly-spot' }, k);
      return w;
    });
    svgEl('path', { d: 'M 0,-5 L 0,6', class: 'bfly-body' }, this.tilt);
    svgEl('path', { d: 'M 0,-5 q -2,-4 -4,-5 M 0,-5 q 2,-4 4,-5', class: 'bfly-feeler' }, this.tilt);
    return g;
  }

  object() {
    if (this.state === 'away') return null;
    const perched = this.state === 'flower' || this.state === 'cursor' || this.state === 'nose';
    return { id: 'butterfly', kind: 'butterfly', x: this.x, y: this.y, sal: this.state === 'nose' ? 0 : perched ? 0.3 : 0.62, state: this.state };
  }

  /** Bring one in now (scripted checks and demos). */
  visit(ctx = this.ctx) {
    if (this.state !== 'away' || !ctx) return false;
    const v = ctx.view;
    const left = this.rng() < 0.5;
    this.x = left ? v.x - 40 : v.x + v.w + 40;
    this.y = 520 + this.rng() * 120;
    this.vx = this.vy = 0;
    this.state = 'fly';
    this.goal = { ...FLOWER, kind: 'flower' };
    this.stateT = 0;
    this.visitT = 0;
    this.settled = 0;
    return true;
  }

  /** Whatever it was sitting on moved: off it goes (and, in time, away). */
  flee() {
    if (this.state === 'away') return;
    this.state = 'fly';
    this.goal = { x: this.x + (this.rng() < 0.5 ? -1 : 1) * 160, y: this.y - 150, kind: 'air' };
    this.stateT = 0;
    this.vy -= 160;
  }

  /**
   * @param ctx { now, view, pointer, konNose: world point, konSitting, konCalm, clear: fair weather, day }
   * @returns events: butterflyCursor, butterflyNose, butterflyGone
   */
  update(dt, ctx = {}) {
    this.t += dt;
    this.ctx = ctx;
    const out = this.events;
    this.events = [];
    if (this.state === 'away') {
      if (this.auto && !this.reduced && ctx.day && ctx.clear && this.t > this.nextAt) this.visit(ctx);
      if (this.state === 'away') return out;
    }
    this.stateT += dt;
    this.visitT += dt;
    const p = ctx.pointer;
    const still = p && p.present && !p.isTouch ? ctx.now - p.lastMove : 0;
    if ((!ctx.day || !ctx.clear || this.visitT > 75) && this.state !== 'leave') {
      this.state = 'leave';
      this.goal = { x: ctx.view.x + (this.x < ctx.view.x + ctx.view.w / 2 ? -80 : ctx.view.w + 80), y: 380, kind: 'air' };
    }
    const perched = this.state === 'flower' || this.state === 'cursor' || this.state === 'nose';
    if (this.state === 'fly') {
      // a cursor that holds still is the most interesting flower in the garden
      if (still > 2.4 && this.goal.kind !== 'cursor' && this.cursorVisits !== this.visitId) this.goal = { kind: 'cursor' };
      if (this.goal.kind === 'cursor') {
        if (!p.present || still < 0.3) this.goal = { ...FLOWER, kind: 'flower' };
        else { this.goal.x = p.x; this.goal.y = p.y - 6; }
      } else if (this.goal.kind === 'nose') {
        if (!ctx.konSitting || !ctx.konNose) this.goal = { ...FLOWER, kind: 'flower' };
        else { this.goal.x = ctx.konNose.x; this.goal.y = ctx.konNose.y - 5; }
      }
      const d = Math.hypot(this.goal.x - this.x, this.goal.y - this.y);
      if (d < 9 && this.goal.kind !== 'air') {
        this.state = this.goal.kind;
        this.stateT = 0;
        this.vx = this.vy = 0;
        if (this.state === 'cursor') { this.cursorVisits = this.visitId; out.push({ type: 'butterflyCursor', x: this.x, y: this.y }); }
        if (this.state === 'nose') out.push({ type: 'butterflyNose', x: this.x, y: this.y });
      } else if (d < 30 && this.goal.kind === 'air') {
        // nowhere in particular: think of somewhere else to be
        this.settled += 1;
        if (ctx.konSitting && ctx.konNose && this.settled > 1 && this.rng() < 0.6 && !this.nosed) { this.nosed = true; this.goal = { kind: 'nose', x: ctx.konNose.x, y: ctx.konNose.y }; }
        else if (this.settled > 4) this.goal = { ...FLOWER, kind: 'flower' };
        else this.goal = { x: clamp(this.x + (this.rng() - 0.5) * 520, ctx.view.x + 60, ctx.view.x + ctx.view.w - 60), y: 560 + this.rng() * 260, kind: 'air' };
      }
    } else if (this.state === 'flower') {
      this.x = FLOWER.x; this.y = FLOWER.y;
      if (this.stateT > 6 + this.seed % 4) { this.state = 'fly'; this.settled = 0; this.goal = { x: this.x + 120, y: this.y - 160, kind: 'air' }; }
    } else if (this.state === 'cursor') {
      // it rides along if you move gently; a sudden move and it's off
      if (!p.present || p.speed > 420 || Math.hypot(p.x - this.x, p.y - 6 - this.y) > 70) this.flee();
      else { this.x += (p.x - this.x) * (1 - Math.exp(-dt * 9)); this.y += (p.y - 6 - this.y) * (1 - Math.exp(-dt * 9)); }
      if (this.stateT > 22) { this.state = 'fly'; this.goal = { x: this.x - 140, y: this.y - 120, kind: 'air' }; }
    } else if (this.state === 'nose') {
      if (!ctx.konNose || !ctx.konCalm || this.stateT > 7) this.flee();
      else { this.x = ctx.konNose.x; this.y = ctx.konNose.y - 5; }
    }
    if (this.state === 'fly' || this.state === 'leave') {
      // fluttering: pulled toward the goal, pushed about by nothing at all
      const tx = this.goal.x + noise1(this.t * 1.3, this.seed) * 46;
      const ty = this.goal.y + noise1(this.t * 1.7, this.seed + 4) * 34 + Math.sin(this.t * 9) * 5;
      const k = 3.2;
      this.vx += ((tx - this.x) * k * k - 2 * 0.8 * k * this.vx) * dt;
      this.vy += ((ty - this.y) * k * k - 2 * 0.8 * k * this.vy) * dt;
      const sp = Math.hypot(this.vx, this.vy), max = 210;
      if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.state === 'leave' && (this.x < ctx.view.x - 60 || this.x > ctx.view.x + ctx.view.w + 60)) {
        this.state = 'away';
        this.nextAt = this.t + 70 + this.rng() * 70;
        this.nosed = false;
        this.visitId += 1;
        out.push({ type: 'butterflyGone' });
      }
    }
    this.draw(perched);
    return out;
  }

  draw(perched) {
    if (!this.el) return;
    const show = this.state !== 'away';
    if (show !== this.shown) { this.shown = show; this.el.style.display = show ? '' : 'none'; }
    if (!show) return;
    const sc = clamp(depthScale(this.y + 120), 0.85, 1.5) * 1.1;
    this.el.setAttribute('transform', `translate(${f2(this.x)} ${f2(this.y)}) scale(${f2(sc)})`);
    // flying, the wings beat fast; resting, they open and close slowly
    const flap = perched ? 0.35 + 0.65 * Math.abs(Math.sin(this.t * 1.5)) : Math.abs(Math.sin(this.t * 17));
    this.wings[0].setAttribute('transform', `scale(${f2(Math.max(0.12, flap))} 1)`);
    this.wings[1].setAttribute('transform', `scale(${f2(Math.max(0.12, flap))} 1)`);
    this.tilt.setAttribute('transform', `rotate(${f2(perched ? 0 : clamp(this.vx * 0.12, -28, 28))})`);
  }
}
