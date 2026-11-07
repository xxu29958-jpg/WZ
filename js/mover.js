// Mover — Kon's body in the world: where it stands, how it walks, how it jumps.
//
// The brain only says where it wants to be ("go to the flower, walking",
// "sit on the cushion", "pounce there"). The mover turns that into motion with
// momentum: it accelerates and brakes with limited force, plans around
// obstacles, slows on arrival, hops onto platforms, and flies ballistic arcs.
// It reports footfalls and landings so the rig can squash and the sand can
// take paw prints. Pure logic — no DOM — so tests can drive it too.

import { clamp, lerp } from './math.js';
import { depthScale, planPath, pushOut, clampToBounds, PLATFORMS } from './world.js';

/** speed (world units/s at depthScale 1), stride per step, and how hard it can accelerate */
export const GAITS = {
  walk: { speed: 95, stride: 26, accel: 420 },
  trot: { speed: 235, stride: 42, accel: 900 },
  sneak: { speed: 42, stride: 18, accel: 260 },
  stroll: { speed: 58, stride: 21, accel: 300 },
};
const DEPTH_K = 0.8; // walking toward/away from you covers fewer screen units

export class Mover {
  constructor({ seat = 'cushion', x = 800, y = 880 } = {}) {
    const p = seat ? PLATFORMS[seat] : null;
    this.x = p ? p.x : x;
    this.y = p ? p.y : y;
    this.h = p ? p.h : 0;
    this.seat = p ? seat : null;
    this.mx = 0;
    this.my = 0;
    this.speed = 0;
    this.facing = 0;
    this.faceDir = 1;
    this.phase = 0;
    this.stepCount = 0;
    this.path = [];
    this.goalKey = '';
    this.jump = null;
    this.lastLeapKey = '';
    this.arrived = true;
    this.cmd = null;
    this.gait = 'walk';
    this.events = [];
  }

  /** The brain's wish for this frame: null (stay), or { to, seat, gait, face, tol, leap }. */
  command(cmd) {
    this.cmd = cmd || null;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.events = [];
    const cmd = this.cmd;
    if (this.jump) {
      this.updateJump(dt);
    } else if (cmd && cmd.leap && cmd.leap.key !== this.lastLeapKey) {
      this.lastLeapKey = cmd.leap.key;
      const t = pushOut(cmd.leap);
      this.startJump(t.x, t.y, 0, cmd.leap.apex ?? 110, cmd.leap.dur, 'pounce', null);
    } else if (cmd && (cmd.to || cmd.seat)) {
      this.followGoal(dt, cmd);
    } else {
      this.brake(dt);
    }
    this.stepCycle(dt);
    this.updateFacing(dt, cmd);
    return this.events;
  }

  followGoal(dt, cmd) {
    const seatGoal = cmd.seat || null;
    if (seatGoal && this.seat === seatGoal) {
      this.arrived = true;
      this.brake(dt);
      return;
    }
    // sitting up on something but asked to go elsewhere: hop down first
    if (this.seat && this.seat !== seatGoal) {
      const p = PLATFORMS[this.seat];
      this.startJump(p.approach.x, p.approach.y, 0, 24, 0.42, 'hopDown', null);
      return;
    }
    const final = seatGoal ? PLATFORMS[seatGoal].approach : pushOut(clampToBounds(cmd.to));
    const key = `${Math.round(final.x / 6)},${Math.round(final.y / 6)},${seatGoal || ''}`;
    if (key !== this.goalKey) {
      this.goalKey = key;
      this.path = planPath({ x: this.x, y: this.y }, final);
    }
    const tol = cmd.tol ?? 7;
    const dFinal = Math.hypot(final.x - this.x, final.y - this.y);
    if (dFinal < tol) {
      if (seatGoal) {
        const p = PLATFORMS[seatGoal];
        this.startJump(p.x, p.y, p.h, 30, 0.46, 'hopUp', seatGoal);
        return;
      }
      this.arrived = true;
      this.brake(dt);
      return;
    }
    this.arrived = false;
    // stuck against something? plan again from here; after a while, give up
    this.stuckT = this.speed < 8 ? (this.stuckT || 0) + dt : 0;
    if (this.stuckT > 0.7 && this.stuckT - dt <= 0.7) this.path = planPath({ x: this.x, y: this.y }, final);
    if (this.stuckT > 3) { this.arrived = true; this.stuck = true; this.brake(dt); return; }
    this.stuck = false;
    let wp = this.path[0] || final;
    while (this.path.length > 1 && Math.hypot(wp.x - this.x, wp.y - this.y) < 12) {
      this.path.shift();
      wp = this.path[0];
    }
    const gait = GAITS[cmd.gait] || GAITS.walk;
    this.gait = cmd.gait || 'walk';
    const ds = depthScale(this.y);
    // desired velocity, in ground units (undoing perspective)
    const ex = (wp.x - this.x) / ds;
    const ey = (wp.y - this.y) / (ds * ds * DEPTH_K);
    const el = Math.hypot(ex, ey) || 1;
    const want = gait.speed * clamp(dFinal / ds / 70, 0.22, 1);
    this.accelerate(dt, (ex / el) * want, (ey / el) * want, gait.accel);
    this.integrate(dt);
  }

  accelerate(dt, tx, ty, accel) {
    const dvx = tx - this.mx, dvy = ty - this.my;
    const dv = Math.hypot(dvx, dvy);
    const max = accel * dt;
    if (dv > max) {
      this.mx += (dvx / dv) * max;
      this.my += (dvy / dv) * max;
    } else {
      this.mx = tx;
      this.my = ty;
    }
  }

  brake(dt) {
    this.accelerate(dt, 0, 0, GAITS.walk.accel * 1.4);
    this.integrate(dt);
  }

  integrate(dt) {
    if (this.seat) { this.mx = this.my = 0; return; }
    const ds = depthScale(this.y);
    const nx = this.x + this.mx * ds * dt;
    const ny = this.y + this.my * ds * ds * DEPTH_K * dt;
    const q = pushOut({ x: nx, y: ny });
    // bumping into something soaks up the velocity in that direction
    if (Math.abs(q.x - nx) > 0.01) this.mx *= 0.3;
    if (Math.abs(q.y - ny) > 0.01) this.my *= 0.3;
    this.x = q.x;
    this.y = q.y;
  }

  stepCycle(dt) {
    this.speed = Math.hypot(this.mx, this.my);
    if (this.jump) return;
    const stride = (GAITS[this.gait] || GAITS.walk).stride;
    this.phase += (dt * this.speed / stride) * Math.PI;
    const n = Math.floor(this.phase / Math.PI);
    if (n > this.stepCount) {
      this.stepCount = n;
      if (this.speed > 10 && this.h === 0) {
        this.events.push({ type: 'step', x: this.x, y: this.y, foot: n % 2 ? 'r' : 'l', dir: Math.sign(this.mx) || this.faceDir, gait: this.gait });
      }
    }
  }

  updateFacing(dt, cmd) {
    if (this.speed > 16 && Math.abs(this.mx) > 12) this.faceDir = Math.sign(this.mx);
    let target;
    if (this.jump) target = this.faceDir;
    else if (this.speed > 16) target = this.faceDir * clamp(Math.abs(this.mx) / this.speed * 1.6, 0.35, 1);
    else if (cmd && cmd.face && this.arrived) { this.faceDir = cmd.face; target = cmd.face * 0.75; }
    else target = 0; // at rest, Kon turns back toward the viewer
    this.facing += (target - this.facing) * (1 - Math.exp(-dt * 6));
  }

  startJump(tx, ty, toH, apex, dur, kind, seat) {
    const d = Math.hypot(tx - this.x, ty - this.y);
    if (Math.abs(tx - this.x) > 8) this.faceDir = Math.sign(tx - this.x);
    this.jump = {
      fx: this.x, fy: this.y, fh: this.h,
      tx, ty, th: toH, apex,
      dur: dur ?? 0.5 + d / 1300,
      t: 0, kind, seat,
    };
    if (kind === 'hopDown') this.seat = null;
    this.events.push({ type: 'takeoff', kind });
  }

  updateJump(dt) {
    const j = this.jump;
    j.t += dt;
    const u = Math.min(1, j.t / j.dur);
    const px = this.x, py = this.y;
    this.x = lerp(j.fx, j.tx, u);
    this.y = lerp(j.fy, j.ty, u);
    this.h = lerp(j.fh, j.th, u) + j.apex * 4 * u * (1 - u);
    const ds = depthScale(this.y);
    this.mx = (this.x - px) / ds / Math.max(dt, 1e-4);
    this.my = (this.y - py) / (ds * ds * DEPTH_K) / Math.max(dt, 1e-4);
    if (u >= 1) {
      this.h = j.th;
      this.seat = j.seat || null;
      this.jump = null;
      const impact = j.kind === 'pounce' ? 1 : 0.5;
      this.mx *= j.kind === 'pounce' ? 0 : 0.2;
      this.my *= j.kind === 'pounce' ? 0 : 0.2;
      this.events.push({ type: 'land', kind: j.kind, impact, x: this.x, y: this.y });
      this.arrived = j.kind !== 'hopDown';
      this.goalKey = '';
    }
  }

  state() {
    const j = this.jump;
    // the surface under Kon (a cushion or rock top, or the sand), for the shadow
    const surfaceH = this.seat ? PLATFORMS[this.seat].h : j ? lerp(j.fh, j.th, Math.min(1, j.t / j.dur)) : 0;
    return {
      x: this.x,
      y: this.y,
      h: this.h,
      surfaceH,
      seat: this.seat,
      speed: this.speed,
      moving: this.speed > 10 || !!j,
      airborne: !!j,
      jumpKind: j ? j.kind : null,
      jumpU: j ? Math.min(1, j.t / j.dur) : 0,
      facing: this.facing,
      faceDir: this.faceDir,
      phase: this.phase,
      gait: this.gait,
      arrived: this.arrived && !j,
      stuck: !!this.stuck,
      ds: depthScale(this.y),
    };
  }
}
