// A temari: a little embroidered ball that lives on the sand.
//
// It rolls with a bit of momentum, bounces off the scenery, and stops. Brush
// the cursor through it (or tap it) and it's kicked. Kon can't see a rolling
// ball without going after it: it bats the ball around on its own, and if you
// were the one who kicked it, bats it back to you.
//
// Without a `parent` element nothing is drawn, so the behavior can be tested.

import { clamp } from '../math.js';
import { svgEl, f2 } from '../util.js';
import { depthScale, OBSTACLES } from './world.js';

const R = 15;                                            // radius, at depthScale 1
const AREA = { x0: 216, x1: 1138, y0: 756, y1: 960 };    // it stays where Kon can reach it
const HOME = { x: 962, y: 886 };
const ROLL_DRAG = 1.15;
const GRAVITY = 900;

export class Ball {
  constructor({ parent = null, rng = Math.random, x = HOME.x, y = HOME.y } = {}) {
    this.rng = rng;
    this.x = x;
    this.y = y;
    this.h = 0;
    this.vx = 0;
    this.vy = 0;
    this.vh = 0;
    this.spin = 0;
    this.t = 0;
    this.kickedAt = -1e9;
    this.kickedBy = null;
    this.nudgeAt = -1e9;
    this.events = [];
    this.el = parent ? this.build(parent) : null;
  }

  build(parent) {
    const g = svgEl('g', { id: 'temari', class: 'temari', 'aria-hidden': 'true' }, parent);
    this.shadow = svgEl('ellipse', { rx: 15, ry: 4.2, class: 'temari-shadow' }, g);
    this.ball = svgEl('g', {}, g);
    svgEl('circle', { r: R, class: 'temari-base ink-thin' }, this.ball);
    this.roll = svgEl('g', {}, this.ball);
    // the stitching: bands of thread crossing at the poles
    for (const [a, cls] of [[0, 'temari-a'], [60, 'temari-b'], [120, 'temari-c']]) {
      svgEl('ellipse', { rx: R - 1.2, ry: 5.2, class: cls, transform: `rotate(${a})` }, this.roll);
    }
    svgEl('circle', { r: 3, class: 'temari-dot' }, this.roll);
    svgEl('circle', { r: R, class: 'temari-rim ink-thin' }, this.ball);
    svgEl('path', { d: 'M -9,-7 Q -5,-12 2,-12', class: 'temari-hi' }, this.ball);
    return g;
  }

  get speed() { return Math.hypot(this.vx, this.vy); }

  /** What Kon can see of it. */
  object() {
    const fresh = Math.exp(-(this.t - this.kickedAt) / 2.2);
    return {
      id: 'ball', kind: 'ball', x: this.x, y: this.y, h: this.h, speed: this.speed,
      sal: this.speed > 25 || this.h > 2 ? 0.62 + 0.4 * fresh : 0.04, kickedBy: this.kickedBy, sinceKick: this.t - this.kickedAt,
    };
  }

  depthKey() { return this.y + 0.3; }

  /** The ball as it shows on screen: its center, in world units. */
  center() {
    const ds = depthScale(this.y);
    return { x: this.x, y: this.y - (R + this.h) * ds, r: R * ds };
  }

  /** Send it off. (vx, vy): direction and strength, vh: how high it hops. */
  kick(vx, vy, vh = 0, by = 'user') {
    const sp = Math.hypot(vx, vy);
    const max = 560;
    const k = sp > max ? max / sp : 1;
    this.vx = vx * k;
    this.vy = vy * k * 0.6;       // toward and away from you covers less ground
    this.vh = Math.max(this.vh, vh);
    this.kickedAt = this.t;
    this.kickedBy = by;
    this.events.push({ type: 'ballKick', by, x: this.x, y: this.y });
  }

  /** A tap or click at a world point: on the ball? Then off it goes, away from the finger. */
  tap(wx, wy) {
    const c = this.center();
    if (Math.hypot(wx - c.x, wy - c.y) > c.r + 14) return false;
    let dx = c.x - wx, dy = (c.y - wy) * 1.4;
    if (Math.hypot(dx, dy) < 4) { dx = this.rng() < 0.5 ? -1 : 1; dy = (this.rng() - 0.5) * 0.6; }
    const d = Math.hypot(dx, dy);
    this.kick((dx / d) * 360, (dy / d) * 360, 250, 'user');
    return true;
  }

  /**
   * @param ctx { pointer: the input tracker's pointer, kon: mover state }
   * @returns events: ballKick {by}, ballBounce {k}
   */
  update(dt, ctx = {}) {
    this.t += dt;
    const out = this.events;
    this.events = [];
    const c = this.center();
    // a cursor brushing through it gives it a push
    const p = ctx.pointer;
    if (p && p.present && !p.isTouch && this.t - this.nudgeAt > 0.3 && p.speed > 130 && Math.hypot(p.x - c.x, p.y - c.y) < c.r + 9) {
      this.nudgeAt = this.t;
      this.kick(p.vx * 0.6, p.vy * 0.6, Math.min(160, p.speed * 0.12), 'user');
      out.push(...this.events.splice(0));
    }
    // Kon walking into it sends it trundling off
    const k = ctx.kon;
    if (k && k.moving && !k.airborne && this.h < 4 && this.t - this.nudgeAt > 0.5 && Math.hypot(k.x - this.x, (k.y - this.y) * 1.8) < 30 && this.speed < 40) {
      this.nudgeAt = this.t;
      this.kick(k.faceDir * (90 + this.rng() * 60), (this.rng() - 0.5) * 80, 40, 'kon');
      out.push(...this.events.splice(0));
    }

    // rolling
    const drag = Math.exp(-dt * (this.h > 1 ? 0.25 : ROLL_DRAG));
    this.vx *= drag;
    this.vy *= drag;
    if (this.h <= 0 && this.speed < 7) this.vx = this.vy = 0;
    const px = this.x;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // bouncing
    if (this.h > 0 || this.vh > 0) {
      this.vh -= GRAVITY * dt;
      this.h += this.vh * dt;
      if (this.h <= 0) {
        this.h = 0;
        if (this.vh < -70) { out.push({ type: 'ballBounce', k: clamp(-this.vh / 300), x: this.x, y: this.y }); this.vh = -this.vh * 0.5; }
        else this.vh = 0;
      }
    }
    // the edges of the garden
    if (this.x < AREA.x0) { this.x = AREA.x0; this.vx = Math.abs(this.vx) * 0.6; }
    else if (this.x > AREA.x1) { this.x = AREA.x1; this.vx = -Math.abs(this.vx) * 0.6; }
    if (this.y < AREA.y0) { this.y = AREA.y0; this.vy = Math.abs(this.vy) * 0.6; }
    else if (this.y > AREA.y1) { this.y = AREA.y1; this.vy = -Math.abs(this.vy) * 0.6; }
    // the scenery: bounce off whatever it runs into
    for (const o of OBSTACLES) {
      const rx = o.rx + 15, ry = o.ry + 7;
      const ux = (this.x - o.x) / rx, uy = (this.y - o.y) / ry;
      const d = Math.hypot(ux, uy);
      if (d >= 1 || d < 1e-4) continue;
      // push out along the ellipse's normal, and reflect what was heading in
      let nx = ux / rx, ny = uy / ry;
      const nl = Math.hypot(nx, ny);
      nx /= nl; ny /= nl;
      this.x = o.x + (ux / d) * rx * 1.01;
      this.y = o.y + (uy / d) * ry * 1.01;
      const vn = this.vx * nx + this.vy * ny;
      if (vn < 0) {
        this.vx -= 1.55 * vn * nx;
        this.vy -= 1.55 * vn * ny;
        if (vn < -60) out.push({ type: 'ballBounce', k: clamp(-vn / 400), x: this.x, y: this.y });
      }
    }
    this.spin += ((this.x - px) / R) * (180 / Math.PI);
    this.draw();
    return out;
  }

  draw() {
    if (!this.el) return;
    const ds = depthScale(this.y);
    const key = `${Math.round(this.x * 4)}|${Math.round(this.y * 4)}|${Math.round(this.h * 4)}|${Math.round(this.spin)}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.el.setAttribute('transform', `translate(${f2(this.x)} ${f2(this.y)}) scale(${f2(ds)})`);
    this.ball.setAttribute('transform', `translate(0 ${f2(-R - this.h)})`);
    this.roll.setAttribute('transform', `rotate(${f2(this.spin)})`);
    const lift = clamp(this.h / 60);
    this.shadow.setAttribute('transform', `scale(${f2(1 - lift * 0.4)})`);
    this.shadow.style.opacity = f2(1 - lift * 0.5);
  }
}
