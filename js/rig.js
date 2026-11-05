// FoxRig — turns a pose (targets chosen by the brain) into motion.
//
// Every channel is a spring with its own frequency, so the eyes arrive first,
// the head a beat later and the body last. Secondary motion (ears, the ahoge
// tuft, the bib bell, the tail wave) is driven by the velocities of the
// primary channels. The rig owns the SVG nodes; nothing else writes to them.

import { Spring, clamp, lerp, smoothstep, TAU, DEG, closedSpline } from './math.js';

export const FOX_ORIGIN = { x: 800, y: 788 };
export const FOX_SCALE = 1.15;

const SHOULDER = { x: 40, y: -84 };
const PAW_REST = { x: 23, y: -30 };
const ARM_MAX = 118;
const EYES = { l: { x: -37, y: -4 }, r: { x: 37, y: -4 } };
const TAIL_SEGS = 12;
const TAIL_LEN = 12.5;

const f2 = (v) => (Math.abs(v) < 1e-4 ? '0' : v.toFixed(2));
const tr = (x, y) => `translate(${f2(x)} ${f2(y)})`;

function rot(x, y, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

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
    };

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
      faceX: 0, faceY: 0,
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
  headToBody(x, y) {
    const g = this.g;
    const p = rot(x * g.hsx, y * g.hsy, g.tilt);
    return { x: g.hx + p.x, y: g.hy + p.y };
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
      restHead: this.localToWorld({ x: 0, y: -150 }),
      mouth: this.headToWorld(this.g.faceX, 34 + this.g.faceY),
      tail: this.bodyToWorld(110, -110),
      bib: this.bodyToWorld(0, -80),
      scale: this.scale,
    };
  }

  // ---------- main update ----------
  update(dt, P) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const s = this.s;
    const m = this.motion;
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
    const yaw = s.yaw.step(dt, clamp(gx * hf + P.yaw, -1, 1), snapMul, zMin);
    const pitch = s.pitch.step(dt, clamp(gy * hf * 0.85 + P.pitch, -1, 1), snapMul, zMin);
    const tilt = s.tilt.step(dt, (P.tilt + gx * hf * 3) * m, 1, zMin);

    // ---- body ----
    const bf = P.bodyFollow ?? 0;
    const leanPrev = s.lean.x;
    const lean = s.lean.step(dt, (P.lean + gx * bf * 13) * m, snapMul, zMin);
    const leanV = (lean - leanPrev) / Math.max(dt, 1e-4);
    const reachX = s.reachX.step(dt, (P.reachX + gx * bf * 30) * m, snapMul, zMin);
    const reachY = s.reachY.step(dt, (P.reachY + gy * bf * 10) * m, snapMul, zMin);
    const stretch = s.stretch.step(dt, P.stretch * m, snapMul, zMin);
    const crouch = s.crouch.step(dt, P.crouch * m, snapMul, zMin);
    const hop = s.hop.step(dt, 0, 1, zMin);
    const pout = s.pout.step(dt, P.pout || 0);
    const hScale = s.headScale.step(dt, P.headScale ?? 1);

    const g = this.g;
    g.sy = 1 + stretch * 0.15 - crouch * 0.13 + br * 0.013 * (P.breath ? 1 : 1);
    g.sx = 1 / Math.sqrt(Math.max(0.6, g.sy)) + crouch * 0.03;
    g.lean = lean * DEG;
    g.hop = hop * m;
    g.tilt = tilt * DEG;
    g.hsx = hScale * (1 - Math.abs(yaw) * 0.03 + pout * 0.05);
    g.hsy = hScale * (1 - pout * 0.015);
    g.hx = reachX + yaw * 2;
    g.hy = -110 * g.sy - 35 + reachY + br * 1.1 + crouch * 6;
    g.faceX = yaw * 11;
    g.faceY = pitch * 7;

    const el = this.el;
    el.body.setAttribute('transform', `${tr(0, g.hop)} rotate(${f2(lean)})`);
    el.torso.setAttribute('transform', `scale(${f2(g.sx)} ${f2(g.sy)})`);
    el.bib.setAttribute('transform', `translate(0 ${f2(-110 * (g.sy - 1))}) scale(${f2(g.sx)} 1)`);
    el.head.setAttribute('transform', `${tr(g.hx, g.hy)} rotate(${f2(tilt)}) scale(${f2(g.hsx)} ${f2(g.hsy)})`);
    el.face.setAttribute('transform', tr(g.faceX, g.faceY));
    el.mask.setAttribute('transform', tr(yaw * 7, pitch * 4.5));
    el.snout.setAttribute('transform', tr(yaw * 4, pitch * 2));

    // ---- neck (a stretchy tube between torso and head) ----
    {
      const bl = { x: -25 * g.sx, y: -101 * g.sy };
      const brr = { x: 25 * g.sx, y: -101 * g.sy };
      const tl = this.headToBody(-27, 44);
      const trr = this.headToBody(27, 44);
      const my1 = (bl.y + tl.y) / 2, my2 = (brr.y + trr.y) / 2;
      const p = (v) => `${f2(v.x)},${f2(v.y)}`;
      const left = `C ${f2(bl.x)},${f2(my1)} ${f2(tl.x)},${f2(my1)} ${p(tl)}`;
      const right = `C ${f2(trr.x)},${f2(my2)} ${f2(brr.x)},${f2(my2)} ${p(brr)}`;
      el.neck.setAttribute('d', `M ${p(bl)} ${left} L ${p(trr)} ${right} Z`);
      el.neckOl.setAttribute('d', `M ${p(bl)} ${left} M ${p(trr)} ${right}`);
    }

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

    // ---- eyes ----
    this.updateBlink(dt, P);
    this.updateSaccade(dt, P);
    const eyeOpen = s.eyeOpen.step(dt, P.eyeOpen ?? 1);
    const irisS = s.iris.step(dt, P.iris ?? 1);
    const pupilS = s.pupil.step(dt, P.pupil ?? 1);
    const lidL = s.lidL.step(dt, P.lidL ?? 0.1);
    const lidR = s.lidR.step(dt, P.lidR ?? 0.1);
    const shutL = s.shutL.step(dt, P.shutL || 0);
    const shutR = s.shutR.step(dt, P.shutR || 0);
    const smileEyes = s.smileEyes.step(dt, P.smileEyes || 0);
    const spiral = s.spiral.step(dt, P.spiral || 0);
    const sparkle = s.sparkle.step(dt, P.sparkle || 0);
    this.spiralAngle += dt * 540;

    // closed-eye drawing style crossfade
    this.shutStyle = P.shutStyle || 'calm';
    for (const k of ['calm', 'happy', 'squeeze']) {
      this.styleMix[k] = lerp(this.styleMix[k], k === this.shutStyle ? 1 : 0, 1 - Math.exp(-dt * 18));
    }

    const blinkV = this.blinkValue();
    const limit = 1 + (1 - irisS) * 1.3;
    for (const side of ['l', 'r']) {
      const E = side === 'l' ? el.eyeL : el.eyeR;
      const L = side === 'l';
      let ox = -yaw * 1.4, oy = -pitch * 1.2;
      if (P.gaze) {
        const ew = this.headToWorld(EYES[side].x + g.faceX, EYES[side].y + g.faceY);
        const dx = P.gaze.x - ew.x, dy = P.gaze.y - ew.y;
        const d = rot(dx, dy, -(g.lean + g.tilt));
        const sc = this.scale * g.hsy;
        ox = 5.8 * Math.tanh(d.x / sc / 115) - yaw * 2.2;
        oy = 5.3 * Math.tanh(d.y / sc / 115) - pitch * 1.6;
      }
      ox += this.saccade.x;
      oy += this.saccade.y;
      // anatomical limit: an ellipse that grows a little when the iris shrinks
      const ex = 5.8 * limit, ey = 5.4 * limit;
      const r = Math.hypot(ox / ex, oy / ey);
      if (r > 1) { ox /= r; oy /= r; }
      const ix = (L ? s.ixL : s.ixR).step(dt, ox);
      const iy = (L ? s.iyL : s.iyR).step(dt, oy);

      const shut = Math.max(L ? shutL : shutR, blinkV);
      const lid = clamp(L ? lidL : lidR, 0, 0.75);
      const syE = eyeOpen * (1 - 0.93 * shut);
      const sxE = 1 + (eyeOpen - 1) * 0.55;
      E.squash.setAttribute('transform', `translate(0 ${f2(shut * 7)}) scale(${f2(sxE)} ${f2(Math.max(0.04, syE))})`);
      E.iris.setAttribute('transform', `${tr(ix, iy)} scale(${f2(irisS)})`);
      E.pupil.setAttribute('transform', `scale(${f2(pupilS)})`);
      E.lidUp.setAttribute('transform', tr(0, -17 + lid * 40));
      E.lidLow.setAttribute('transform', tr(0, 26 - smileEyes * 22));
      const vis = smoothstep(0.55, 0.88, shut);
      E.calm.style.opacity = f2(vis * this.styleMix.calm);
      E.happy.style.opacity = f2(vis * this.styleMix.happy);
      E.squeeze.style.opacity = f2(vis * this.styleMix.squeeze);
      E.core.style.opacity = f2(1 - spiral);
      E.spiral.style.opacity = f2(spiral);
      E.spiral.setAttribute('transform', `rotate(${f2(L ? this.spiralAngle : -this.spiralAngle)})`);
      E.sparkle.style.opacity = f2(sparkle);
    }

    // ---- brows ----
    const bL = s.browL.step(dt, P.browL || 0);
    const bR = s.browR.step(dt, P.browR || 0);
    const btL = s.browTL.step(dt, P.browTiltL || 0);
    const btR = s.browTR.step(dt, P.browTiltR || 0);
    el.browL.setAttribute('transform', `${tr(-36, -34 - bL * 6 - pitch * 2)} rotate(${f2(-btL * 16)})`);
    el.browR.setAttribute('transform', `${tr(36, -34 - bR * 6 - pitch * 2)} rotate(${f2(btR * 16)})`);

    // ---- mouth ----
    this.drawMouth(dt, P);

    // ---- cheeks, sweat, shock, bubble ----
    const blush = s.blush.step(dt, P.blush || 0);
    el.blush.setAttribute('opacity', f2(clamp(blush) * 0.92));
    el.blushLines.style.opacity = f2(smoothstep(0.45, 0.9, blush));
    const sweat = s.sweat.step(dt, P.sweat || 0);
    this.sweatSlide = sweat > 0.1 ? Math.min(10, this.sweatSlide + dt * 5) : 0;
    el.sweat.setAttribute('opacity', f2(clamp(sweat)));
    el.sweat.setAttribute('transform', `${tr(86, -48 + this.sweatSlide)} scale(${f2(0.5 + 0.5 * clamp(sweat))})`);
    const shock = s.shock.step(dt, P.shock || 0);
    el.shock.setAttribute('opacity', f2(clamp(shock)));
    el.shock.setAttribute('transform', `scale(${f2(0.82 + 0.22 * clamp(shock, 0, 1.3))})`);
    const bub = s.bubble.step(dt, P.fx?.bubble || 0);
    const bubR = clamp(bub) * (4 + 7 * (0.5 + 0.5 * br));
    el.bubble.setAttribute('r', f2(bubR));
    el.bubble.setAttribute('cx', f2(9 + bubR * 0.55));
    el.bubble.setAttribute('cy', f2(25 + bubR * 0.35));

    // ---- arms ----
    this.drawArm(dt, 'l', P.armL);
    this.drawArm(dt, 'r', P.armR);

    // ---- tail ----
    this.drawTail(dt, P, lean);

    // ---- effects ----
    this.fx.update(dt, P, this);
    this.lastP = P;
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

  // ---------- mouth ----------
  drawMouth(dt, P) {
    const s = this.s;
    const el = this.el;
    const open = clamp(s.mouthOpen.step(dt, P.mouthOpen || 0), 0, 1.3);
    const smile = s.smile.step(dt, P.smile ?? 0.2);
    const pucker = clamp(s.pucker.step(dt, P.pucker || 0));
    const tongue = clamp(s.tongue.step(dt, P.tongue || 0), 0, 1.2);
    const pout = this.s.pout.x;

    const y0 = 27;
    const top = y0 + 3.2;
    const w = 10.5 * (1 - pucker * 0.7) * (1 + smile * 0.12) * (1 - pout * 0.35);
    const corner = y0 + 4.2 - smile * 3.4 + pout * 1.5;
    const dip = y0 + 10 + smile * 1.6 - pout * 3;
    el.mouth.setAttribute('d',
      `M ${f2(-w)},${f2(corner)} Q ${f2(-w * 0.5)},${f2(dip)} 0,${f2(top)} Q ${f2(w * 0.5)},${f2(dip)} ${f2(w)},${f2(corner)} M 0,${f2(y0 - 0.5)} L 0,${f2(top)}`);
    el.mouth.style.opacity = f2(1 - pucker);

    if (open > 0.02) {
      const ow = 4.5 + open * 6.5 + Math.max(0, smile) * 2;
      const oh = open * 17;
      const d = `M ${f2(-ow)},${f2(top + 1)} C ${f2(-ow)},${f2(top + 1 + oh * 1.32)} ${f2(ow)},${f2(top + 1 + oh * 1.32)} ${f2(ow)},${f2(top + 1)} Q 0,${f2(top + 3)} ${f2(-ow)},${f2(top + 1)} Z`;
      el.mouthOpen.setAttribute('d', d);
      el.mouthClip.setAttribute('d', d);
      el.mouthOpen.style.opacity = '1';
      el.tongueIn.setAttribute('cx', '0');
      el.tongueIn.setAttribute('cy', f2(top + 1 + oh * 0.95));
      el.tongueIn.setAttribute('rx', f2(ow * 0.75));
      el.tongueIn.setAttribute('ry', f2(Math.max(2, oh * 0.38)));
    } else {
      el.mouthOpen.style.opacity = '0';
      el.mouthClip.setAttribute('d', 'M 0,0');
    }

    el.pucker.setAttribute('opacity', f2(pucker));
    el.pucker.setAttribute('cy', f2(top + 3.5));

    if (tongue > 0.03) {
      const tl = tongue * 9.5;
      el.blep.setAttribute('d', `M -5.2,${f2(top + 1)} L -5.2,${f2(top + 1 + tl)} Q 0,${f2(top + 7 + tl)} 5.2,${f2(top + 1 + tl)} L 5.2,${f2(top + 1)} Z M 0,${f2(top + 2)} V ${f2(top + tl)}`);
      el.blep.style.opacity = '1';
    } else {
      el.blep.style.opacity = '0';
    }
  }

  // ---------- arms ----------
  resolvePaw(t, side) {
    const sgn = side === 'l' ? -1 : 1;
    if (!t) return { x: sgn * PAW_REST.x, y: PAW_REST.y };
    if (t.space === 'head') return this.headToBody(t.x, t.y);
    if (t.space === 'world') return this.worldToBody(t.x, t.y);
    return { x: t.x, y: t.y };
  }
  drawArm(dt, side, target) {
    const g = this.g;
    const sgn = side === 'l' ? -1 : 1;
    const sh = { x: sgn * SHOULDER.x * g.sx, y: SHOULDER.y * g.sy };
    let p = this.resolvePaw(target, side);
    // keep the paw within reach
    let dx = p.x - sh.x, dy = p.y - sh.y;
    let d = Math.hypot(dx, dy);
    if (d > ARM_MAX) { p = { x: sh.x + (dx / d) * ARM_MAX, y: sh.y + (dy / d) * ARM_MAX }; }
    const L = side === 'l';
    const px = (L ? this.s.pawLx : this.s.pawRx).step(dt, p.x);
    const py = (L ? this.s.pawLy : this.s.pawRy).step(dt, p.y);
    dx = px - sh.x; dy = py - sh.y; d = Math.hypot(dx, dy) || 1;
    // elbow bends outward, more when the paw is close to the shoulder
    let nx = -dy / d, ny = dx / d;
    if (nx * sgn < 0) { nx = -nx; ny = -ny; }
    const bend = 8 + clamp(ARM_MAX - d, 0, 60) * 0.4;
    const c = { x: (sh.x + px) / 2 + nx * bend, y: (sh.y + py) / 2 + ny * bend };
    const arm = `M ${f2(sh.x)},${f2(sh.y)} Q ${f2(c.x)},${f2(c.y)} ${f2(px)},${f2(py)}`;
    // the dark "sock" covers the lower part of the arm
    const t0 = 0.56;
    const q0 = {
      x: (1 - t0) * (1 - t0) * sh.x + 2 * (1 - t0) * t0 * c.x + t0 * t0 * px,
      y: (1 - t0) * (1 - t0) * sh.y + 2 * (1 - t0) * t0 * c.y + t0 * t0 * py,
    };
    const qc = { x: lerp(c.x, px, t0), y: lerp(c.y, py, t0) };
    const E = L ? this.el.armL : this.el.armR;
    E.ol.setAttribute('d', arm);
    E.fur.setAttribute('d', arm);
    E.sock.setAttribute('d', `M ${f2(q0.x)},${f2(q0.y)} Q ${f2(qc.x)},${f2(qc.y)} ${f2(px)},${f2(py)}`);
    const ang = Math.atan2(py - c.y, px - c.x) / DEG;
    E.paw.setAttribute('transform', `${tr(px, py)} rotate(${f2(ang)})`);
  }

  // ---------- tail ----------
  drawTail(dt, P, lean) {
    const s = this.s;
    const g = this.g;
    this.tailSpeed = lerp(this.tailSpeed, P.tailSpeed ?? 0.6, 1 - Math.exp(-dt * 2));
    this.tailPhase += dt * TAU * this.tailSpeed;
    const amp = s.tailAmp.step(dt, (P.tailAmp ?? 0.15) * (this.reduced ? 0.4 : 1));
    const base = s.tailBase.step(dt, P.tailBase || 0);
    const curl = s.tailCurl.step(dt, P.tailCurl || 0);

    const pts = [];
    let x = 34 * g.sx, y = -26 * g.sy;
    let a = (12 + base - lean * 0.5) * DEG;
    pts.push({ x, y, a });
    for (let i = 1; i <= TAIL_SEGS; i++) {
      const u = i / TAIL_SEGS;
      const wave = Math.sin(this.tailPhase - i * 0.5) * amp * 40 * (0.25 + u);
      a += (-13.5 + curl) * DEG + (wave * DEG) / TAIL_SEGS * 2.2;
      x += Math.cos(a) * TAIL_LEN;
      y += Math.sin(a) * TAIL_LEN;
      pts.push({ x, y, a });
    }
    const width = (u) => 31 * Math.pow(Math.sin(Math.PI * (0.13 + 0.87 * u)), 0.72) + 0.6;
    const left = [], right = [];
    for (let i = 0; i <= TAIL_SEGS; i++) {
      const p = pts[i];
      const w = width(i / TAIL_SEGS);
      const nx = -Math.sin(p.a), ny = Math.cos(p.a);
      left.push([p.x + nx * w, p.y + ny * w]);
      right.push([p.x - nx * w, p.y - ny * w]);
    }
    const tip = pts[TAIL_SEGS];
    const cap = [tip.x + Math.cos(tip.a) * 7, tip.y + Math.sin(tip.a) * 7];
    const outline = [...left, cap, ...right.slice().reverse()];
    const d = closedSpline(outline);
    this.el.tail.setAttribute('d', d);
    this.el.tailOl.setAttribute('d', d);

    const k0 = 8;
    const back = pts[k0 - 1];
    const notch = [lerp(pts[k0].x, back.x, 0.55), lerp(pts[k0].y, back.y, 0.55)];
    const tipPts = [...left.slice(k0), cap, ...right.slice(k0).reverse(), notch];
    this.el.tailTip.setAttribute('d', closedSpline(tipPts));
  }
}

// ---------- little drawn effects: notes, z's, hearts, puffs ----------
const NS = 'http://www.w3.org/2000/svg';
const SHAPES = {
  note: 'M -4.5,3.5 a 4.6,3.6 -20 1 0 9,-2.4 a 4.6,3.6 -20 1 0 -9,2.4 Z M 3.2,1.4 h 2.2 v -17 h -2.2 Z M 5.4,-15.6 q 7,3.6 7.2,11 q -2.2,-5.4 -7.2,-6.4 Z',
  z: 'M -6,-6 h 12 l -12,12 h 12',
  heart: 'M 0,6 C -10,-1 -9,-9 -4,-9 C -1.5,-9 0,-7 0,-5 C 0,-7 1.5,-9 4,-9 C 9,-9 10,-1 0,6 Z',
};

class FxLayer {
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
