// FoxRig — turns a pose (targets chosen by the brain) into motion.
//
// Every channel is a spring with its own frequency, so the eyes arrive first,
// the head a beat later and the body last. Secondary motion (ears, the ahoge
// tuft, the bib bell, the tail wave) is driven by the velocities of the
// primary channels. The rig owns the SVG nodes; nothing else writes to them.

import { Spring, clamp, lerp, TAU, DEG } from '../math.js';
import { konScale, footY } from '../garden/world.js';
import { f2, tr, rot, mixin } from '../util.js';
import { Face } from './face.js';
import { Limbs, PAW_REST } from './limbs.js';
import { FxLayer } from './effects.js';

export const FOX_ORIGIN = { x: 800, y: 788 };
export const FOX_SCALE = 1.15;

export class FoxRig {
  constructor(root, { reducedMotion = false, rng = Math.random } = {}) {
    this.root = root;
    this.rng = rng;
    this.origin = FOX_ORIGIN;
    this.scale = FOX_SCALE;
    this.setReducedMotion(reducedMotion);

    const q = (s) => root.querySelector(s);
    const eye = (g) => ({
      squash: g.querySelector('.eye-squash'),
      iris: g.querySelector('.iris-g'),
      core: g.querySelector('.iris-core'),
      pupil: g.querySelector('.pupil'),
      sparkle: g.querySelector('.sparkle'),
      spiral: g.querySelector('.spiral'),
      lidUp: g.querySelector('.lid-up'),
      lidLow: g.querySelector('.lid-low'),
      calm: g.querySelector('.shut-calm'),
      happy: g.querySelector('.shut-happy'),
      squeeze: g.querySelector('.shut-squeeze'),
    });
    const arm = (g) => ({
      ol: g.querySelector('.arm-ol'),
      fur: g.querySelector('.arm-fur'),
      sock: g.querySelector('.arm-sock'),
      paw: g.querySelector('.paw'),
    });
    this.el = {
      body: q('#kon-body'),
      torso: q('#kon-torso'),
      tail: q('#kon-tail'),
      tailTip: q('#kon-tail-tip'),
      tailOl: q('#kon-tail-ol'),
      neck: q('#kon-neck'),
      neckOl: q('#kon-neck-ol'),
      bib: q('#kon-bib'),
      bell: q('#kon-bell'),
      head: q('#kon-head'),
      earL: q('#kon-ear-l'),
      earR: q('#kon-ear-r'),
      ahoge: q('#kon-ahoge'),
      face: q('#kon-face'),
      mask: q('#kon-mask'),
      snout: q('#kon-snout'),
      browL: q('#kon-brow-l'),
      browR: q('#kon-brow-r'),
      eyeL: eye(q('#kon-eye-l')),
      eyeR: eye(q('#kon-eye-r')),
      blush: q('#kon-blush'),
      blushLines: q('#kon-blush-lines'),
      mouth: q('#kon-mouth'),
      mouthOpen: q('#kon-mouth-open'),
      mouthClip: document.getElementById('mouth-clip-path'),
      tongueIn: q('#kon-tongue-in'),
      blep: q('#kon-blep'),
      pucker: q('#kon-pucker'),
      bubble: q('#kon-bubble'),
      sweat: q('#kon-sweat'),
      shock: q('#kon-shock'),
      armL: arm(q('#kon-arm-l')),
      armR: arm(q('#kon-arm-r')),
      fx: q('#kon-fx'),
      shadow: q('.kon-shadow'),
      sign: q('#kon-sign'),
      signText: q('#kon-sign-text'),
      upper: q('#kon-upper'),
      belly: q('#kon-belly'),
      legL: { ol: q('#kon-leg-l-ol'), fill: q('#kon-leg-l') },
      legR: { ol: q('#kon-leg-r-ol'), fill: q('#kon-leg-r') },
      footL: q('#kon-foot-l'),
      footR: q('#kon-foot-r'),
    };

    const S = (x, f, z) => new Spring(x, f, z);
    this.s = {
      gx: S(0, 4.2, 0.9), gy: S(0, 4.2, 0.9),
      yaw: S(0, 2.9, 0.72), pitch: S(0, 2.9, 0.72), tilt: S(0, 2.3, 0.58),
      lean: S(0, 1.6, 0.6), reachX: S(0, 1.9, 0.62), reachY: S(0, 1.9, 0.58),
      stretch: S(0, 2.1, 0.5), crouch: S(0, 2.1, 0.6), hop: S(0, 3.4, 0.32),
      headScale: S(1, 3, 0.55), pout: S(0, 5, 0.6),
      eyeOpen: S(1, 6.5, 0.42), iris: S(1, 5.5, 0.6), pupil: S(1, 3.5, 0.8),
      lidL: S(0.1, 8, 0.9), lidR: S(0.1, 8, 0.9),
      shutL: S(0, 11, 1), shutR: S(0, 11, 1), smileEyes: S(0, 6, 0.9),
      ixL: S(0, 9, 0.82), iyL: S(0, 9, 0.82), ixR: S(0, 9, 0.82), iyR: S(0, 9, 0.82),
      browL: S(0, 5, 0.55), browR: S(0, 5, 0.55), browTL: S(0, 5, 0.6), browTR: S(0, 5, 0.6),
      earL: S(-20, 4.2, 0.28), earR: S(20, 4.2, 0.28),
      ahoge: S(0, 5.2, 0.15),
      bell: S(0, 1.5, 0.1),
      mouthOpen: S(0, 8, 0.7), smile: S(0.2, 6, 0.8), pucker: S(0, 7, 0.8), tongue: S(0, 7, 0.7),
      blush: S(0, 1.1, 1), sweat: S(0, 2.6, 0.8), shock: S(0, 7, 0.5),
      spiral: S(0, 2.5, 1), sparkle: S(0, 2.5, 1), bubble: S(0, 1.6, 0.9),
      pawLx: S(-PAW_REST.x, 4.2, 0.72), pawLy: S(PAW_REST.y, 4.2, 0.72),
      pawRx: S(PAW_REST.x, 4.2, 0.72), pawRy: S(PAW_REST.y, 4.2, 0.72),
      tailBase: S(0, 1.1, 0.85), tailCurl: S(0, 1.1, 0.85), tailAmp: S(0.15, 0.9, 1),
      float: S(0, 0.55, 0.62), sign: S(0, 4.5, 0.45),
      stand: S(0, 3.2, 0.72), bodyYaw: S(0, 3.6, 0.85), tailSide: S(1, 1.6, 0.8),
    };
    this.tailSideT = 1;
    this.signValue = null;

    this.t = 0;
    this.breathPhase = 0;
    this.tailPhase = 0;
    this.tailSpeed = 0.6;
    this.spiralAngle = 0;
    this.sweatSlide = 0;
    this.blink = { next: 1.5, t: -1, double: false, lastAt: -10, pending: 0 };
    this.saccade = { x: 0, y: 0, next: 1 };
    this.lastGx = 0;
    this.shutStyle = 'calm';
    this.styleMix = { calm: 1, happy: 0, squeeze: 0 };

    // live geometry, refreshed every frame
    this.g = {
      sx: 1, sy: 1, hx: 0, hy: -145, hsx: 1, hsy: 1, tilt: 0, lean: 0, hop: 0,
      faceX: 0, faceY: 0, upperY: 0, tailSide: 1,
    };

    this.fx = new FxLayer(this.el.fx, rng);
    this.lastP = null;
  }

  setReducedMotion(on) {
    this.reduced = !!on;
    this.motion = on ? 0.35 : 1;
  }

  // ---------- coordinate helpers ----------
  bodyToLocal(x, y) {
    const p = rot(x, y, this.g.lean);
    return { x: p.x, y: p.y + this.g.hop };
  }

  localToWorld(p) {
    return { x: this.origin.x + p.x * this.scale, y: this.origin.y + p.y * this.scale };
  }

  bodyToWorld(x, y) {
    return this.localToWorld(this.bodyToLocal(x, y));
  }

  /** Head space → the upper body's space (it rises on Kon's legs when standing). */
  headToUpper(x, y) {
    const g = this.g;
    const p = rot(x * g.hsx, y * g.hsy, g.tilt);
    return { x: g.hx + p.x, y: g.hy + p.y };
  }

  headToBody(x, y) {
    const p = this.headToUpper(x, y);
    return { x: p.x, y: p.y + this.g.upperY };
  }

  upperToWorld(x, y) {
    return this.bodyToWorld(x, y + this.g.upperY);
  }

  worldToUpper(x, y) {
    const b = this.worldToBody(x, y);
    return { x: b.x, y: b.y - this.g.upperY };
  }

  headToWorld(x, y) {
    const b = this.headToBody(x, y);
    return this.bodyToWorld(b.x, b.y);
  }

  worldToBody(x, y) {
    const lx = (x - this.origin.x) / this.scale;
    const ly = (y - this.origin.y) / this.scale - this.g.hop;
    return rot(lx, ly, -this.g.lean);
  }

  /** Positions the brain needs (world units). */
  measure() {
    return {
      head: this.headToWorld(0, -8),
      nose: this.headToWorld(this.g.faceX * 1.3, 22 + this.g.faceY),
      restHead: this.localToWorld({ x: 0, y: -150 + this.g.upperY }),
      mouth: this.headToWorld(this.g.faceX, 34 + this.g.faceY),
      center: this.upperToWorld(0, -70),
      tail: this.upperToWorld(110 * this.g.tailSide, -110),
      bib: this.upperToWorld(0, -80),
      feet: this.localToWorld({ x: 0, y: 0 }),
      scale: this.scale,
    };
  }

  /**
   * @param P     pose targets from the brain
   * @param loco  the mover's state (where Kon stands, how it walks), optional
   */
  update(dt, P, loco = null) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const f = this.solvePose(dt, P, loco);
    this.drawBody(f);
    this.drawEars(dt, P, f);
    this.drawEyes(dt, P, f);
    this.drawBrows(dt, P, f);
    this.drawMouth(dt, P);
    this.drawCheeks(dt, P, f);
    this.drawLimbs(dt, P, f, loco);
    this.fx.update(dt, P, this);
    this.lastP = P;
  }

  /** Placement, walking, gaze, head and body springs → this frame's shared values. */
  solvePose(dt, P, loco) {
    const s = this.s;
    const m = this.motion;
    if (loco) {
      // stand where the mover says, as big as that depth makes Kon
      this.scale = konScale(loco.y);
      this.origin = { x: loco.x, y: footY(loco.y, loco.h) };
      this.root.setAttribute('transform', `${tr(this.origin.x, this.origin.y)} scale(${this.scale.toFixed(4)})`);
    }
    const walkN = loco && !loco.airborne ? clamp(loco.speed / 110) : 0;
    const phase = loco ? loco.phase : 0;
    const facing = loco ? loco.facing : 0;
    const airborne = !!(loco && loco.airborne);
    const stand = s.stand.step(dt, (loco && (loco.moving || airborne)) || P.posture === 'stand' ? 1 : 0);
    const bodyYaw = s.bodyYaw.step(dt, facing);
    if (facing > 0.3) this.tailSideT = -1;
    else if (facing < -0.3) this.tailSideT = 1;
    this.g.tailSide = s.tailSide.step(dt, this.tailSideT);
    const zMin = this.reduced ? 0.9 : 0;
    const snapMul = 1 + 1.5 * (P.snap || 0);

    for (const imp of P.impulses) this.applyImpulse(imp);

    // breathing
    this.breathPhase += dt * TAU * 0.27 * (P.breath ?? 1);
    const br = Math.sin(this.breathPhase);

    // ---- gaze direction (smoothed, drives head and body) ----
    const head = this.headToWorld(0, -8);
    let gxT = 0, gyT = 0;
    if (P.gaze) {
      gxT = Math.tanh((P.gaze.x - head.x) / 320);
      gyT = Math.tanh((P.gaze.y - head.y) / 280);
    }
    s.gx.step(dt, gxT);
    s.gy.step(dt, gyT);
    const gx = s.gx.x, gy = s.gy.x;

    // gaze-shift blink: big sudden gaze changes come with a blink
    if (Math.abs(gxT - this.lastGx) > 0.9 && this.t - this.blink.lastAt > 1.2 && this.rng() < 0.6) this.startBlink();
    this.lastGx = gxT;

    // ---- head ----
    const hf = P.headFollow ?? 0.5;
    // the head turns with the body (a three-quarter view when walking)
    const yaw = s.yaw.step(dt, clamp(gx * hf + P.yaw + bodyYaw * 0.7, -1, 1), snapMul, zMin);
    const pitch = s.pitch.step(dt, clamp(gy * hf * 0.85 + P.pitch, -1, 1), snapMul, zMin);
    const tilt = s.tilt.step(dt, (P.tilt + gx * hf * 3) * m, 1, zMin);

    // ---- body ----
    const bf = P.bodyFollow ?? 0;
    const leanPrev = s.lean.x;
    const walkLean = facing * walkN * 5 + Math.sin(phase) * 1.8 * walkN;
    const lean = s.lean.step(dt, (P.lean + gx * bf * 13 + walkLean) * m, snapMul, zMin);
    const leanV = (lean - leanPrev) / Math.max(dt, 1e-4);
    // walking, the head leads the body a little
    const reachX = s.reachX.step(dt, (P.reachX + gx * bf * 30 + facing * walkN * 7) * m, snapMul, zMin);
    const reachY = s.reachY.step(dt, (P.reachY + gy * bf * 10) * m, snapMul, zMin);
    const airStretch = airborne && loco.jumpU < 0.55 ? 0.35 : 0;
    const stretch = s.stretch.step(dt, (P.stretch + airStretch) * m, snapMul, zMin);
    const crouch = s.crouch.step(dt, P.crouch * m, snapMul, zMin);
    const hop = s.hop.step(dt, 0, 1, zMin);
    // levitation: a slow rise, a gentle bob, and a fast drop when it ends
    const floatT = (P.float || 0) * m;
    const float = s.float.step(dt, floatT, floatT === 0 && s.float.x < -4 ? 2.6 : 1, zMin);
    const pout = s.pout.step(dt, P.pout || 0);
    const hScale = s.headScale.step(dt, P.headScale ?? 1);

    const g = this.g;
    // a footfall squashes the body a touch; it stretches again between steps
    const contact = walkN * (1 - Math.abs(Math.sin(phase))) * m;
    g.sy = 1 + stretch * 0.15 - crouch * 0.13 + br * 0.013 - contact * 0.035;
    // turned three-quarters, the body reads a little narrower
    g.sx = (1 / Math.sqrt(Math.max(0.6, g.sy)) + crouch * 0.03) * (1 - Math.abs(bodyYaw) * 0.06);
    g.lean = lean * DEG;
    g.hop = hop * m + float;
    g.tilt = tilt * DEG;
    g.hsx = hScale * (1 - Math.abs(yaw) * 0.03 + pout * 0.05);
    g.hsy = hScale * (1 - pout * 0.015);
    g.hx = reachX + yaw * 2;
    g.hy = -110 * g.sy - 35 + reachY + br * 1.1 + crouch * 6;
    g.faceX = yaw * 11;
    g.faceY = pitch * 7;
    // standing up on the legs, with a little bounce on every step
    const bob = walkN > 0 ? -Math.abs(Math.sin(phase)) * (loco.gait === 'trot' ? 8 : 5) * walkN * m : 0;
    g.upperY = -24 * stand + bob;
    g.stand = stand;
    g.bodyYaw = bodyYaw;

    return { m, zMin, snapMul, br, gx, gy, yaw, pitch, tilt, lean, leanV, walkN, phase, facing, airborne, stand, bodyYaw, float };
  }

  /** Body, torso, bib and head transforms, and the stretchy neck. */
  drawBody(f) {
    const { yaw, pitch, tilt, lean, bodyYaw } = f;
    const el = this.el;
    const g = this.g;
    el.body.setAttribute('transform', `${tr(0, g.hop)} rotate(${f2(lean)})`);
    el.upper.setAttribute('transform', tr(0, g.upperY));
    el.torso.setAttribute('transform', `scale(${f2(g.sx)} ${f2(g.sy)})`);
    el.belly.setAttribute('transform', tr(bodyYaw * 15, 0));
    el.bib.setAttribute('transform', `translate(${f2(bodyYaw * 12)} ${f2(-110 * (g.sy - 1))}) scale(${f2(g.sx)} 1)`);
    el.head.setAttribute('transform', `${tr(g.hx, g.hy)} rotate(${f2(tilt)}) scale(${f2(g.hsx)} ${f2(g.hsy)})`);
    el.face.setAttribute('transform', tr(g.faceX, g.faceY));
    el.mask.setAttribute('transform', tr(yaw * 7, pitch * 4.5));
    el.snout.setAttribute('transform', tr(yaw * 4, pitch * 2));

    // ---- neck (a stretchy tube between torso and head) ----
    {
      const bl = { x: -25 * g.sx, y: -101 * g.sy };
      const brr = { x: 25 * g.sx, y: -101 * g.sy };
      const tl = this.headToUpper(-27, 44);
      const trr = this.headToUpper(27, 44);
      const my1 = (bl.y + tl.y) / 2, my2 = (brr.y + trr.y) / 2;
      const p = (v) => `${f2(v.x)},${f2(v.y)}`;
      const left = `C ${f2(bl.x)},${f2(my1)} ${f2(tl.x)},${f2(my1)} ${p(tl)}`;
      const right = `C ${f2(trr.x)},${f2(my2)} ${f2(brr.x)},${f2(my2)} ${p(brr)}`;
      el.neck.setAttribute('d', `M ${p(bl)} ${left} L ${p(trr)} ${right} Z`);
      el.neckOl.setAttribute('d', `M ${p(bl)} ${left} M ${p(trr)} ${right}`);
    }
  }

  /** Ears, the ahoge tuft and the bib bell: secondary motion driven by the body. */
  drawEars(dt, P, f) {
    const s = this.s;
    const { m, yaw, pitch, tilt, lean, leanV } = f;
    const el = this.el;
    // ---- ears with secondary motion ----
    const perk = P.earPerk ?? 0;
    const perkAmt = perk > 0 ? perk * 9 : perk * 22;
    // ears lag behind body lean and head roll
    s.earL.v -= (leanV * 0.55 + s.tilt.v * dt * 18) * m;
    s.earR.v -= (leanV * 0.55 + s.tilt.v * dt * 18) * m;
    const earL = s.earL.step(dt, -20 + perkAmt - (P.earL || 0));
    const earR = s.earR.step(dt, 20 - perkAmt + (P.earR || 0));
    const earSy = 1 + perk * 0.05;
    el.earL.setAttribute('transform', `${tr(-46 - yaw * 5, -50 - pitch * 2)} rotate(${f2(earL)}) scale(1 ${f2(earSy)})`);
    el.earR.setAttribute('transform', `${tr(46 - yaw * 5, -50 - pitch * 2)} rotate(${f2(earR)}) scale(1 ${f2(earSy)})`);

    s.ahoge.v -= leanV * 1.4 * m + s.tilt.v * dt * 30 * m;
    const ahoge = s.ahoge.step(dt, (P.ahoge || 0) - tilt * 0.4);
    el.ahoge.setAttribute('transform', `${tr(2 + yaw * 6, -72 + pitch * 2)} rotate(${f2(ahoge)})`);

    s.bell.v -= leanV * 0.9 * m;
    const bell = s.bell.step(dt, -lean * 0.6);
    el.bell.setAttribute('transform', `rotate(${f2(bell)} 0 -60)`);
  }

  applyImpulse(imp) {
    const s = this.s;
    const m = this.motion;
    const k = imp.s ?? 1;
    switch (imp.type) {
      case 'jolt':
        s.hop.v -= 230 * k * m;
        s.stretch.v += 2.6 * k * m;
        s.earL.v += 520 * k;
        s.earR.v -= 520 * k;
        s.ahoge.v += 900 * k * (this.rng() < 0.5 ? -1 : 1);
        s.eyeOpen.v += 5 * k;
        break;
      case 'flinch':
        s.hop.v -= 90 * k * m;
        s.earL.v += 300 * k;
        s.earR.v -= 300 * k;
        s.ahoge.v += 500 * k;
        break;
      case 'earFlick': {
        const sign = imp.side === 'l' ? -1 : 1;
        (imp.side === 'l' ? s.earL : s.earR).v += sign * 650 * k;
        break;
      }
      case 'sneeze':
        s.pitch.v += 9 * m;
        s.hop.v += 70 * m;
        s.earL.v -= 500;
        s.earR.v += 500;
        s.ahoge.v += 700;
        this.fx.burst('puff', this.bodyToLocal(...Object.values(this.headToBody(0, 30))), 5);
        break;
      case 'pop': {
        const b = this.headToBody(14, 28);
        this.fx.burst('pop', this.bodyToLocal(b.x, b.y), 1);
        s.bubble.snap(0);
        break;
      }
      case 'hop':
        s.hop.v -= 300 * k * m;
        break;
      case 'step': {
        // each footfall jiggles the ears, the tuft and the bell a little
        const k2 = (imp.s ?? 1) * m;
        s.earL.v += 70 * k2;
        s.earR.v -= 70 * k2;
        s.ahoge.v += (imp.foot === 'l' ? 1 : -1) * 160 * k2;
        s.bell.v += (imp.foot === 'l' ? 1 : -1) * 40 * k2;
        break;
      }
      case 'land':
        s.crouch.v += 9 * k * m;
        s.earL.v -= 260 * k;
        s.earR.v += 260 * k;
        s.ahoge.v += 500 * k;
        s.bell.v += 90 * k;
        break;
      case 'shudder':
        s.lean.v += (this.rng() < 0.5 ? -1 : 1) * 40 * k * m;
        break;
      case 'blink':
        this.startBlink();
        break;
      case 'hearts': {
        const b = this.headToBody(0, -90);
        this.fx.burst('heart', this.bodyToLocal(b.x, b.y), imp.n || 3);
        break;
      }
      default:
        break;
    }
  }

  // ---------- blinking ----------
  startBlink(double = false) {
    this.blink.t = 0;
    this.blink.double = double;
    this.blink.lastAt = this.t;
  }

  blinkValue() {
    const t = this.blink.t;
    if (t < 0) return 0;
    const close = 0.065, hold = 0.03, open = 0.11;
    if (t < close) return t / close;
    if (t < close + hold) return 1;
    if (t < close + hold + open) return 1 - (t - close - hold) / open;
    return 0;
  }

  updateBlink(dt, P) {
    const b = this.blink;
    if (b.t >= 0) {
      b.t += dt;
      if (b.t > 0.21) {
        b.t = -1;
        if (b.double) { b.double = false; b.pending = this.t + 0.09; }
      }
    }
    if (b.pending && this.t >= b.pending) { b.pending = 0; this.startBlink(false); }
    const canBlink = P.blink !== false && (P.shutL || 0) < 0.5 && (P.shutR || 0) < 0.5;
    if (this.t >= b.next) {
      if (canBlink && b.t < 0) this.startBlink(this.rng() < 0.2);
      const slow = P.sleepy ? 1.6 : 1;
      b.next = this.t + (2.2 + this.rng() * 3.6) * slow;
    }
  }

  updateSaccade(dt, P) {
    const sc = this.saccade;
    if (this.t >= sc.next) {
      const amp = P.gaze ? 0.55 : 0.9;
      sc.x = (this.rng() * 2 - 1) * amp;
      sc.y = (this.rng() * 2 - 1) * amp * 0.7;
      sc.next = this.t + 0.5 + this.rng() * 1.8;
    }
  }
}

mixin(FoxRig, Face, Limbs);
