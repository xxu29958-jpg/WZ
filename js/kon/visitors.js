// Visitors — Kon and the sparrow.
//
// A bird on the sand is prey: Kon creeps up (low, slow, eyes locked) and
// pounces. A bird somewhere out of reach gets watched from below, with the
// tail twitching and the jaw chattering the way hunting cats and foxes do.
// A bird on Kon's head during meditation is an honor, and must not be moved.
// Mixed into Brain (see brain.js); `this` is the brain.

import { clamp, smoothstep } from '../math.js';
import { pushOut } from '../garden/world.js';

const NOTICE_AFTER = 1.2;   // seconds a bird must sit before Kon makes plans
const POUNCE_RANGE = 205;   // ground distance (depth counts 1.6×) to leap from
const WATCH_FROM = 250;

export class Visitors {
  /** The sparrow, if it is around. */
  bird(s = this.s) {
    return (s.objects || []).find((o) => o.kind === 'bird') || null;
  }

  /** Kon is in deep meditation or asleep: a good perch. */
  isStill() {
    if (this.state === 'SLEEPING') return true;
    return this.state === 'ZAZEN' && !!this.zen && this.zen.settleAt > 0 && this.stateT - this.zen.settleAt > 1.5;
  }

  isPouncing() {
    return this.state === 'POUNCE' && this.arg.phase === 'air';
  }

  /** A bird just settled somewhere: maybe go after it. Returns true if Kon made a plan. */
  noticeBird(s) {
    const b = this.bird(s);
    const L = this.life;
    if (!b || b.state !== 'perched' || b.perch === 'kon' || b.perchedFor < NOTICE_AFTER) return false;
    if (L.birdSeen === b.visit || this.greet || (s.self && s.self.airborne)) return false;
    L.birdSeen = b.visit;
    // on the sand it's prey; up on something it gets watched (or, sometimes, ignored)
    const mode = b.ground ? 'hunt' : this.rng() < 0.7 ? 'watch' : null;
    if (!mode) return false;
    L.act = { id: 'bird', mode, phase: 'go', t: 0, visit: b.visit };
    this.idleAct = null;
    this.say(mode === 'hunt' ? 'birdHunt' : 'birdWatch', true);
    return true;
  }

  /** Where to stand: `dist` short of the bird's spot on the ground, on Kon's side of it. */
  standoff(b, self, dist) {
    const gy = b.groundY;
    const dx = self.x - b.x;
    const dy = (self.y - gy) * 1.6;
    const d = Math.hypot(dx, dy) || 1;
    const side = Math.abs(dx) > 30 ? Math.sign(dx) : self.x < 700 ? -1 : 1;
    // approach mostly from the side, so Kon is seen in profile, creeping
    const ux = d > 1 ? dx / d : side;
    const uy = d > 1 ? dy / d / 1.6 : 0;
    return pushOut({ x: b.x + ux * dist, y: gy + uy * dist * 0.5 });
  }

  tickBird(dt, s, P) {
    const a = this.life.act;
    const self = s.self;
    const b = this.bird(s);
    a.t += dt;
    const here = b && b.visit === a.visit && b.state === 'perched';
    if (a.phase !== 'gone' && !here) {
      // it flew off before Kon got there
      a.phase = 'gone';
      a.t = 0;
      this.say(a.mode === 'hunt' ? 'birdEscaped' : 'birdGone', true);
    }
    if (a.phase === 'gone') {
      P.gaze = b ? { x: b.x, y: b.y } : this.headAway(self.faceDir * 300, -320);
      P.headFollow = 0.8;
      P.posture = 'stand';
      P.eyeOpen = 1.1;
      P.earPerk = 0.7;
      P.mouthOpen = a.t < 1 ? 0.3 : 0.05;
      P.smile = 0;
      P.pout = smoothstep(0.8, 1.4, a.t) * 0.6;
      P.tailAmp = 0.3;
      if (a.t > 2.4) { this.life.lastVisit.bird = this.now; this.dropLife(3); }
      return;
    }
    const target = { x: b.x, y: b.y };
    const dist = Math.hypot(b.x - self.x, (b.groundY - self.y) * 1.6);
    P.gaze = target;
    P.headFollow = 0.95;
    P.pupil = 1.4;
    P.earPerk = 1;
    P.blink = this.rng() < 0.5;
    P.smile = 0;

    const face = Math.sign(b.x - self.x) || 1;
    // (the mover's `arrived` may still describe the last trip, so check the spot itself)
    const at = (p, r) => !self.seat && !self.airborne && Math.hypot(self.x - p.x, self.y - p.y) < r;
    if (a.mode === 'hunt') {
      // low, slow, eyes locked; the tail tip flicks
      P.posture = 'stand';
      P.crouch = 0.42;
      P.tailAmp = 0.35;
      P.tailSpeed = 3;
      P.tailBase = 10;
      const spot = this.standoff(b, self, POUNCE_RANGE - 30);
      // off the cushion at a walk; after that, creeping
      P.move = { to: spot, gait: self.seat || a.t < 0.6 ? 'walk' : 'sneak', face, tol: 24 };
      if ((dist < POUNCE_RANGE && !self.seat && !self.airborne) || at(spot, 30) || a.t > 14) {
        this.go('POUNCE', { target: 'bird', x: b.x, y: b.groundY, look: target });
      }
      return;
    }
    // out of reach: watch from below, chattering
    if (a.phase === 'go') {
      a.spot = a.spot || this.standoff(b, self, WATCH_FROM);
      P.move = { to: a.spot, gait: 'stroll', face, tol: 24 };
      if (at(a.spot, 30) || a.t > 12) { a.phase = 'do'; a.t = 0; }
      return;
    }
    P.move = self.seat ? { seat: self.seat } : { to: { x: self.x, y: self.y }, face, tol: 400 };
    P.posture = 'sit';
    P.tailAmp = 0.5;
    P.tailSpeed = 2.6;
    // bursts of chattering: the jaw trembles, the whiskers go
    const burst = Math.sin(a.t * 1.7) > 0.45;
    P.mouthOpen = burst ? 0.16 + 0.12 * Math.abs(Math.sin(a.t * 38)) : 0.04;
    P.eyeOpen = 1.12;
    P.pupil = 1.55;
    P.tilt = Math.sin(a.t * 0.6) * 8;
    P.pitch = -0.32 * clamp((s.body.head.y - b.y) / 300); // chin up for a bird up high
    if (burst && !a.chattered) { a.chattered = true; this.say('birdChatter'); }
    if (a.t > 12) { this.life.lastVisit.bird = this.now; this.dropLife(4); }
  }

  /** After a pounce at the bird: it's gone, of course. */
  pounceBirdAfter(lt, s, P) {
    const b = this.bird(s);
    P.gaze = b ? { x: b.x, y: b.y } : this.headAway(0, -320);
    P.headFollow = 1;
    P.posture = 'stand';
    if (lt < 1.4) {
      P.eyeOpen = 1.15;
      P.mouthOpen = 0.35;
      P.earPerk = 0.9;
      P.crouch = 0.3 * (1 - lt / 1.4);
    } else {
      P.pout = 0.8;
      P.earL = P.earR = -0.25;
      P.tailAmp = 0.5;
      P.tailSpeed = 2;
      P.browTiltL = P.browTiltR = -0.4;
    }
    if (lt > 0.3 && !this.arg.said) { this.arg.said = true; this.say('pounceBird', true); }
    if (lt > 2.8) { this.life.lastVisit.bird = this.now; this.go('RELAXING', { quiet: true }); }
  }

  /** During deep meditation with a bird on the head: one eye sneaks open to look up. */
  birdOnHeadFace(t, P) {
    const cyc = t % 5.5;
    const look = smoothstep(2.2, 2.6, cyc) * (1 - smoothstep(3.9, 4.3, cyc));
    P.smile = Math.max(P.smile, 0.5);
    P.blush = Math.max(P.blush, 0.35);
    if (look > 0) {
      P.shutR = clamp(1 - look * 0.75);
      P.lidR = 0.35;
      P.gaze = this.headAway(-8, -400);
      P.headFollow = 0.08;
    }
  }
}
