// Stillness — the meditation game and rest: ZAZEN (Kon tests you, then the
// ensō paints itself), SATORI, GOTCHA, and DROWSY → SLEEPING → WAKING.
// Mixed into Brain (see brain.js); `this` is the brain.

import { smoothstep, bump, randRange } from '../math.js';

const PAINT_SECONDS = 16;   // how long the ensō takes to paint itself

export class Stillness {
  enterDROWSY() { this.say('drowsy'); }

  // ------------------------------------------------------------------ ZAZEN / SATORI / GOTCHA
  enterZAZEN() {
    this.zen = { paint: 0, temptAt: randRange(this.rng, 1.2, 2.6), tempt: null, temptEnd: 0, settleAt: 0, said: {} };
    this.idleAct = null;
    this.zenBreak = false;
    this.moveAccum = 0;
    this.say('zazenStart', true);
  }

  tickZAZEN(dt, s, P) {
    const z = this.zen;
    const t = this.stateT;
    const moved = this.moveAccum > 10 * s.body.scale;
    if (moved || this.typeActive || this.zenBreak) {
      this.zenBreak = false;
      // flinching at Kon's antics means Kon wins
      if (z.tempt && t < z.temptEnd + 1.2) { this.go('GOTCHA'); return; }
      this.say('zazenBroken', true);
      this.go('WATCH', { cautious: true, from: 'zazen' });
      return;
    }
    // first, Kon checks whether you are *really* gone
    if (!z.tempt && t >= z.temptAt) {
      z.tempt = this.makeAct(this.temptBag.next());
      z.temptEnd = t + 3.2;
      this.say(z.tempt.def.caption, true);
    }
    if (z.tempt && t < z.temptEnd) {
      this.runAct(z.tempt, dt, P);
      return;
    }
    if (!z.tempt) {
      // a quiet beat before the test: Kon peeks around
      P.gaze = this.headAway(Math.sin(t * 1.3) * 260, -60);
      P.headFollow = 0.4;
      P.lidL = P.lidR = 0.3;
      return;
    }
    // true meditation: the ensō paints itself
    if (!z.settleAt) { z.settleAt = t; this.say('zazenSettle', true); }
    const st = t - z.settleAt;
    z.paint = Math.min(1, z.paint + dt / PAINT_SECONDS);
    P.gaze = null;
    P.headFollow = 0;
    P.pitch = -0.1;
    P.shutL = P.shutR = smoothstep(0, 0.8, st);
    P.shutStyle = 'calm';
    P.smile = 0.38;
    P.armL = { x: -5, y: -76, space: 'body' };
    P.armR = { x: 5, y: -76, space: 'body' };
    P.breath = 0.42;
    P.tailAmp = 0.03;
    P.earPerk = -0.05;
    P.blink = false;
    P.browL = P.browR = 0.25;
    if (z.paint > 0.55 && !z.said.half) { z.said.half = true; this.say('zazenHalf', true); }
    if (z.paint > 0.85 && !z.said.almost) { z.said.almost = true; this.say('zazenAlmost', true); }
    if (z.paint >= 1) this.go('SATORI');
  }

  enterSATORI() {
    this.satoriCount += 1;
    this.zenArmed = false;
    this.emit('satori', this.satoriCount);
    this.emit('sfx', 'bell');
    this.say('satori', true);
  }

  tickSATORI(dt, s, P) {
    const t = this.stateT;
    P.gaze = null;
    P.headFollow = 0;
    P.shutL = P.shutR = 1;
    P.shutStyle = 'calm';
    P.smile = 0.62;
    P.armL = { x: -5, y: -76, space: 'body' };
    P.armR = { x: 5, y: -76, space: 'body' };
    P.breath = 0.4;
    P.blink = false;
    P.pitch = -0.15;
    P.earPerk = 0.2;
    P.tailBase = -18;
    P.tailAmp = 0.14;
    P.tailSpeed = 0.4;
    P.ahoge = Math.sin(t * 1.2) * 6;
    P.float = t < 4.4 ? -28 + Math.sin(t * 1.6) * 3.5 : 0;
    if (t > 3.5 && t < 4.4) {
      // …wait. Is Kon floating?
      P.shutR = 0.2;
      P.lidR = 0.15;
      P.gaze = this.headAway(0, 260);
      P.eyeOpen = 1.18;
      P.browR = 0.9;
    }
    if (t >= 4.4) {
      P.shutL = P.shutR = 0;
      P.eyeOpen = 1.26;
      P.iris = 0.68;
      P.shock = t < 5 ? 0.8 : 0;
      P.mouthOpen = 0.4;
      P.armL = { x: -62, y: -70, space: 'body' };
      P.armR = { x: 62, y: -70, space: 'body' };
      P.blush = 0.7;
      P.sweat = 0.85;
      if (t > 4.7 && !this.arg.landed) {
        this.arg.landed = true;
        this.impulse({ type: 'jolt', s: 0.45 });
        this.say('satoriEnd', true);
      }
      if (this.arg.landed && t < 5.1) P.crouch = 0.4;
    }
    if (t > 6.6) this.go('IDLE', { afterSatori: true });
  }

  enterGOTCHA() {
    this.say('gotcha', true);
    this.impulse({ type: 'hop', s: 0.5 });
    this.emit('sfx', 'boop');
  }

  tickGOTCHA(dt, s, P) {
    const t = this.stateT;
    const p = s.pointer;
    P.gaze = p.present ? { x: p.x, y: p.y } : null;
    P.headFollow = 0.5;
    P.lidL = P.lidR = 0.4;
    P.smile = 1;
    P.mouthOpen = 0.22;
    P.browTiltL = P.browTiltR = -0.25;
    P.browL = P.browR = 0.3;
    if (t < 1.6) P.armR = { x: 64, y: -24 + Math.sin(t * 14) * 6, space: 'head' };
    P.tailAmp = 0.8;
    P.tailSpeed = 2.4;
    P.earPerk = 0.7;
    P.blush = 0.25;
    if (t > 2.3) this.go('WATCH', { cautious: true });
  }

  // ------------------------------------------------------------------ DROWSY / SLEEPING / WAKING

  tickDROWSY(dt, s, P) {
    const t = this.stateT;
    P.sleepy = true;
    const heavy = 0.32 + 0.3 * smoothstep(0, 8, t);
    P.lidL = P.lidR = heavy;
    // nodding off… and catching itself
    const nod = Math.max(bump(1.8, 3.3, t) * (t < 3.1 ? 1 : 0), bump(5.6, 7.3, t) * (t < 7.1 ? 1 : 0));
    P.pitch = 0.42 * nod;
    if (nod > 0.5) { P.shutL = P.shutR = 0.8; }
    if (t > 3.1 && !this.arg.nodded) { this.arg.nodded = true; this.impulse({ type: 'flinch', s: 0.25 }); }
    // yawn
    const y = bump(3.7, 5.2, t);
    if (y > 0) {
      P.mouthOpen = Math.min(1, y * 1.3);
      P.shutL = P.shutR = y;
      P.shutStyle = 'squeeze';
      P.earPerk = -0.6 * y;
      P.pitch = -0.3 * y;
    }
    P.breath = 0.7;
    P.tailAmp = 0.05;
    P.earPerk = Math.min(P.earPerk, -0.2);
    if (this.ptrActive || this.typeActive) {
      this.impulse({ type: 'flinch', s: 0.5 });
      this.impulse({ type: 'blink' });
      this.go('WATCH', { cautious: true });
      return;
    }
    if (t > 9) this.go('SLEEPING');
  }

  enterSLEEPING() {
    this.say('sleeping');
    this.sleepSide = this.rng() < 0.5 ? -1 : 1;
    this.moveAccum = 0;
  }

  tickSLEEPING(dt, s, P) {
    P.shutL = P.shutR = 1;
    P.shutStyle = 'calm';
    P.blink = false;
    P.pitch = 0.45;
    P.tilt = 13 * this.sleepSide;
    P.crouch = 0.3;
    P.reachY = 10;
    P.earPerk = -0.7;
    P.ahoge = 26 * this.sleepSide;
    P.mouthOpen = 0.08;
    P.smile = 0.3;
    P.breath = 0.45;
    P.tailAmp = 0.03;
    P.tailBase = 26;
    P.tailCurl = 3;
    P.fx.zzz = this.stateT > 1 ? 1 : 0;
    P.fx.bubble = this.stateT > 2 ? 1 : 0;
    P.armL = { x: -14, y: -40, space: 'body' };
    P.armR = { x: 14, y: -42, space: 'body' };
    const shaken = this.moveAccum > 160 * s.body.scale;
    if (shaken || this.typeActive) this.go('WAKING');
  }

  enterWAKING() {
    this.impulse({ type: 'pop' });
    this.impulse({ type: 'jolt', s: 0.8 });
    this.emit('sfx', 'pop');
    this.say('waking', true);
  }

  tickWAKING(dt, s, P) {
    const t = this.stateT;
    if (t < 0.28) {
      P.eyeOpen = 1.25;
      P.iris = 0.7;
      P.shock = 0.8;
      P.earPerk = 1;
      P.mouthOpen = 0.3;
      P.blink = false;
    } else if (t < 0.95) {
      const side = t < 0.6 ? -1 : 1;
      P.gaze = this.headAway(side * 320, -30);
      P.headFollow = 0.7;
      P.lidL = P.lidR = 0.22;
      P.browL = P.browR = 0.6;
    } else {
      P.gaze = s.pointer.present ? { x: s.pointer.x, y: s.pointer.y } : null;
      P.headFollow = 0.5;
      P.blush = 0.8;
      P.sweat = 0.9;
      if (t < 1.7) {
        P.armR = { x: 12 + Math.sin(t * 24) * 5, y: 26, space: 'head' };
        P.shutL = P.shutR = 0.6;
        P.shutStyle = 'squeeze';
      }
    }
    if (t > 2.0) {
      if (this.ptrActive || this.typeActive || s.typing.focused) this.go('WATCH', { cautious: true });
      else this.go('IDLE');
    }
  }
}
