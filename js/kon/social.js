// Social — how Kon reacts to you: watching, the "uh-oh" when you stop,
// innocence acts and peeking out of them, getting caught, stalking and
// pouncing on the cursor, and walking over to judge a raked circle.
// Mixed into Brain (see brain.js); `this` is the brain.

import { clamp, lerp, smoothstep, bump, damp, randRange, pick } from '../math.js';
import { POIS, SAND_TOP, BOUNDS, pushOut } from '../garden/world.js';

const STARTLE_VARIANTS = ['classic', 'cover', 'pout', 'bleh'];

export class Social {
  startle(reason) {
    let v;
    if (reason === 'return') v = 'classic';
    else if (this.caught < STARTLE_VARIANTS.length) v = STARTLE_VARIANTS[this.caught];
    else v = pick(this.rng, STARTLE_VARIANTS.filter((x) => x !== this.lastVariant));
    this.caught += 1;
    this.lastCaughtAt = this.now;
    this.lastVariant = v;
    const p = this.s.pointer;
    const target = reason === 'return' || !p.present ? null : { x: p.x, y: p.y };
    this.go('STARTLED', { variant: v, reason, target });
  }

  /** Where Kon goes to read over your shoulder. */
  peekSpot(s) {
    return s.layout === 'wide' ? { ...POIS.rack.stand, face: 1 } : { x: 800, y: 936, face: 0 };
  }

  pickPretend(exclude = []) {
    const s = this.s;
    const ex = [...exclude];
    if (!this.near(s, POIS.flower.stand, 170)) ex.push('flower');
    if (this.near(s, POIS.rack.stand, 120) && this.rng() < 0.7) return 'readPlaques';
    return this.pretendBag.next(ex);
  }

  // ------------------------------------------------------------------ WATCH
  enterWATCH(arg) {
    this.stopDelay = randRange(this.rng, 0.32, 0.52);
    this.tiltSide = this.rng() < 0.5 ? -1 : 1;
    if (arg.cautious) {
      if (this.attn.src === 'typing') this.typeI = Math.min(this.typeI, 0.14);
      else this.ptrI = Math.min(this.ptrI, 0.14);
      this.cur = Math.min(this.cur, 0.14);
    } else {
      this.impulse({ type: 'earFlick', side: 'l', s: 0.5 });
      this.impulse({ type: 'earFlick', side: 'r', s: 0.5 });
    }
    this.label = '';
    this.watchSince = this.now;
  }

  tickWATCH(dt, s, P) {
    const a = this.attn;
    const p = s.pointer;
    if (a.src === 'none' || a.src === 'object' && !this.ptrActive && !this.typeActive && this.stateT > 1) {
      this.go('RELAXING', { quiet: true });
      return;
    }
    const src = a.src;
    const interest = src === 'typing' ? this.typeI : src === 'pointer' ? this.ptrI : 0.35;
    this.cur = damp(this.cur, interest, 2.4, dt);
    const c = this.cur;
    const peek = smoothstep(0.2, 0.95, c);

    let target = { x: a.x, y: a.y };
    // while reading the plaque, glance at a moving cursor now and then
    if (src === 'typing' && this.ptrActive && this.speedN > 0.06) {
      if (this.now > this.glance.next) {
        this.glance.until = this.now + 0.45;
        this.glance.next = this.now + randRange(this.rng, 1.3, 2.8);
      }
    }
    const glancing = src === 'typing' && this.now < this.glance.until;
    if (glancing) target = { x: p.x, y: p.y };

    const fast = src === 'pointer' && this.ptrActive ? smoothstep(0.45, 0.95, this.speedN) : 0;
    const stalk = this.stalk;

    // ---- moving about: walk over to read, creep closer, or stalk the cursor
    const self = s.self;
    const onGround = p.present && p.y > SAND_TOP + 14 && p.y < BOUNDS.y1 + 70;
    const kd = self ? Math.hypot(p.x - self.x, (p.y - self.y) * 1.7) : 1e9;
    let stalking = false;
    if (self && src === 'typing') {
      const spot = this.peekSpot(s);
      P.move = { to: spot, gait: 'walk', face: spot.face, tol: 10 };
      if (!this.arg.walkSaid && Math.hypot(self.x - spot.x, self.y - spot.y) > 90) { this.arg.walkSaid = true; this.say('typingWalk', true); }
    } else if (self && src === 'pointer') {
      stalking = this.stalk > 0.5 && onGround && !this.reduced;
      if (stalking) {
        this.stalkT += dt;
        if (this.stalkT > 0.4 && kd > 240) P.move = { to: this.toward(p, self, 210), gait: 'sneak' };
        if (this.stalkT > 0.8 && !this.arg.stalkSaid) { this.arg.stalkSaid = true; this.say('stalk', true); }
      } else {
        this.stalkT = Math.max(0, this.stalkT - dt * 1.5);
        // curiosity pulls Kon a few steps closer to something moving on the sand
        if (peek > 0.55 && onGround) {
          if (kd > 430) this.approaching = true;
          else if (kd < 330) this.approaching = false;
          if (this.approaching) P.move = { to: this.toward(p, self, 310), gait: 'walk' };
        } else this.approaching = false;
      }
    }

    P.gaze = target;
    P.headFollow = glancing ? 0.25 : 0.45 + 0.4 * peek - fast * 0.15;
    P.bodyFollow = glancing ? 0.12 : 0.12 + 0.88 * peek;
    P.reachY = -peek * 36 + stalk * 8;
    P.stretch = peek * 0.75 * (1 - stalk * 0.6);
    P.crouch = stalk * 0.38;
    P.pitch = stalk * 0.12;
    P.tilt = this.tiltSide * peek * 11 * (1 - fast * 0.5);
    P.eyeOpen = 1 + 0.07 * peek + 0.07 * fast;
    P.pupil = 1 + 0.3 * stalk - 0.14 * fast;
    P.lidL = P.lidR = 0.1 + stalk * 0.12 - fast * 0.05;
    P.browL = P.browR = 0.15 + 0.45 * peek + fast * 0.2;
    P.earPerk = clamp(0.3 + 0.55 * peek + 0.35 * fast);
    P.mouthOpen = peek > 0.75 ? (peek - 0.75) * 0.55 : 0;
    P.smile = 0.2 - peek * 0.15;
    P.tailAmp = 0.15 + 0.45 * peek + 0.25 * fast;
    P.tailSpeed = stalk > 0.5 ? 0.35 : 0.8 + 1.2 * peek;
    if (stalk > 0.5) P.tailAmp = 0.5; // slow, tense swish of a hunter
    if (stalking) { P.posture = 'stand'; P.crouch = Math.max(P.crouch, 0.42); P.pupil = 1.4; P.earPerk = 1; }
    if (src === 'typing' && self && !self.moving) P.posture = 'stand';
    // a pointer that is far above makes Kon rise on tiptoe
    if (src === 'pointer' && p.y < s.body.restHead.y - 150) P.stretch = Math.min(1, P.stretch + 0.25 * peek);

    // the first moment of noticing something
    if (this.stateT < 0.45 && !this.arg.cautious) {
      P.browL = P.browR = 0.75;
      P.earPerk = 0.85;
    }
    if (this.arg.cautious && this.stateT < 1) {
      P.lidL = P.lidR = lerp(0.36, P.lidL, smoothstep(0, 1, this.stateT));
    }
    if (this.noticeAt && this.now - this.noticeAt < 0.5) P.browL = P.browR = 0.8;

    // narrator
    const label = c < 0.3 ? 'OBSERVING' : c < 0.66 ? 'CURIOUS' : 'PEEKING';
    // never talk over a line that was just said (e.g. "So close.")
    if (label !== this.label && this.now - this.labelAt > 1.3 && this.now - this.caption.at > (this.caption.hold || 1.4)) {
      this.label = label;
      this.labelAt = this.now;
      const key = (src === 'typing' ? 'typing' : '') + (src === 'typing' ? label[0] + label.slice(1).toLowerCase() : label.toLowerCase());
      this.say(key);
    }

    this.lastWatch = {
      gaze: target, headFollow: P.headFollow, bodyFollow: P.bodyFollow,
      reachY: P.reachY, stretch: P.stretch, tilt: P.tilt, crouch: P.crouch,
    };

    // the cursor froze while Kon was hunting it: instinct wins over shyness
    if (src === 'pointer' && !this.ptrActive && this.ptrStill > 0.28 && this.stalkT > 1.0 && onGround && kd < 360 && !this.reduced) {
      this.go('POUNCE', { target: 'cursor', x: p.x, y: p.y });
      return;
    }
    // the visitor stopped — did they notice Kon?
    if (src === 'pointer' && !this.ptrActive && this.ptrStill > this.stopDelay && c > 0.28 && this.ptrBurst > 0.6 && !this.typeActive) {
      this.go('NOTICED', { src: 'pointer' });
      return;
    }
    if (src === 'typing' && !this.typeActive && this.typeStill > 0.95 && c > 0.3 && this.typeBurst >= 3 && !this.ptrActive) {
      this.go('NOTICED', { src: 'typing' });
      return;
    }
    // or simply lost interest
    if (!this.ptrActive && !this.typeActive && this.idleFor > 2.4 && c < 0.3 && !s.typing.focused) {
      this.go('RELAXING', { quiet: true });
      return;
    }
    if (s.typing.focused && !this.typeActive && !this.ptrActive && this.idleFor > 14) {
      this.go('RELAXING', { quiet: true });
    }
    this.applyFlash(P, true);
  }

  // ------------------------------------------------------------------ NOTICED
  enterNOTICED() {
    if (this.arg.src === 'typing') this.speak('typingStop');
    this.arg.dur = randRange(this.rng, 0.2, 0.36);
    this.impulse({ type: 'flinch', s: 0.6 });
    this.say('noticed', true);
  }

  tickNOTICED(dt, s, P) {
    Object.assign(P, this.lastWatch || {});
    P.eyeOpen = 1.2;
    P.iris = 0.78;
    P.pupil = 0.72;
    P.browL = P.browR = 1;
    P.earPerk = 1;
    P.mouthOpen = 0.12;
    P.blink = false;
    P.tailAmp = 0;
    if (this.stateT > this.arg.dur) this.go('PRETENDING', { act: this.pickPretend() });
  }

  // ------------------------------------------------------------------ PRETENDING
  enterPRETENDING(arg) {
    if (!arg.continue || !this.act) {
      this.act = this.makeAct(arg.act || this.pickPretend());
    }
    this.arg.minT = randRange(this.rng, 1.0, 1.4);
    this.arg.dur = randRange(this.rng, 3.4, 5.2);
    this.ptrI *= 0.3;
    this.typeI *= 0.3;
    this.cur *= 0.3;
    this.ptrBurst = 0;
    this.typeBurst = 0;
    this.say(arg.caption || this.act.def.caption, true);
  }

  tickPRETENDING(dt, s, P) {
    P.snap = this.arg.continue ? 0.6 : 1 - smoothstep(0.2, 0.7, this.stateT);
    this.runAct(this.act, dt, P);
    P.blush = Math.max(P.blush, (this.arg.blush ?? 0.32) * (1 - smoothstep(2, 5, this.stateT)));
    if (this.arg.sweat) P.sweat = Math.max(P.sweat, 1 - smoothstep(2.5, 4, this.stateT));
    if (this.arg.continue && this.stateT < 0.5) {
      // snapped back into the act: a hurried look away
      P.browL = P.browR = 0.8;
    }
    // something happened right next to Kon: one eye opens
    if (this.flash && this.now < this.flash.until) {
      if (P.shutL > 0.5) P.shutL = 0.35;
      this.applyFlash(P, true);
    }

    if ((this.ptrActive || this.typeActive) && this.stateT > this.arg.minT) {
      this.go('RESUMING');
      return;
    }
    if (this.stateT > this.arg.dur && !this.ptrActive) this.go('RELAXING');
  }

  // ------------------------------------------------------------------ RESUMING
  enterRESUMING() {
    this.arg.dur = randRange(this.rng, 0.85, 1.5);
    this.arg.quietFor = 0;
    this.say('resuming');
  }

  tickRESUMING(dt, s, P) {
    const t = this.stateT;
    const u = t / this.arg.dur;
    this.runAct(this.act, dt, P);

    // keep the head where the act put it, but let the eyes slide to the target
    const head = s.body.head;
    let actYaw = 0, actPitch = 0;
    if (P.gaze) {
      actYaw = Math.tanh((P.gaze.x - head.x) / 320) * P.headFollow;
      actPitch = Math.tanh((P.gaze.y - head.y) / 280) * P.headFollow * 0.85;
    }
    const turn = smoothstep(0.55, 1, u);
    P.yaw += lerp(actYaw, 0, turn);
    P.pitch += lerp(actPitch, 0, turn);
    P.headFollow = 0.5 * turn;
    P.gaze = this.attnPoint() || P.gaze;
    const eyesOpen = smoothstep(0, 0.25, u);
    P.shutL = P.shutL * (1 - eyesOpen);
    P.shutR = P.shutR * (1 - eyesOpen);
    P.lidL = P.lidR = lerp(0.42, 0.18, turn);
    P.browTiltL = -0.3;
    P.browTiltR = -0.1;
    P.pucker *= 1 - turn;
    P.fx.notes = 0;
    P.fx.zzz = 0;
    if (turn > 0.3) { P.armL = null; P.armR = null; }

    // the visitor froze again: snap back into the act, quickly
    if (!this.ptrActive && !this.typeActive) this.arg.quietFor += dt;
    else this.arg.quietFor = 0;
    if (this.arg.quietFor > 0.26 && u < 0.92) {
      this.impulse({ type: 'flinch', s: 0.4 });
      this.go('PRETENDING', { continue: true, caption: 'snapback' });
      return;
    }
    if (u >= 1) this.go('WATCH', { cautious: true });
  }

  // ------------------------------------------------------------------ STARTLED
  enterSTARTLED(arg) {
    this.impulse({ type: 'jolt', s: arg.variant === 'classic' ? 1 : 0.7 });
    this.emit('sfx', 'startle');
    this.say('startled', true);
    this.act = null;
    this.ptrBurst = 0;
    this.typeBurst = 0;
  }

  tickSTARTLED(dt, s, P) {
    const t = this.stateT;
    const v = this.arg.variant;
    const target = this.arg.target;
    const shockDur = { classic: 0.45, cover: 0.32, pout: 0.3, bleh: 0.26 }[v];
    P.gaze = target;
    P.headFollow = 0.6;
    P.blush = 0.65;

    if (t < shockDur) {
      P.eyeOpen = 1.28;
      P.iris = 0.62;
      P.pupil = 0.65;
      P.browL = P.browR = 1.1;
      P.earPerk = 1;
      P.shock = 1;
      P.mouthOpen = 0.45;
      P.blink = false;
      P.ahoge = -6;
      P.tailAmp = 0;
      P.stretch = 0.25;
      if (t > shockDur * 0.5 && v !== 'classic') this.say(v);
      return;
    }

    const awaySide = target ? -Math.sign(target.x - s.body.head.x) || 1 : 1;
    if (v === 'classic') {
      const actName = this.pickPretend(['fakesleep', 'sky', 'readPlaques']);
      this.go('PRETENDING', { act: actName, caption: this.arg.reason === 'return' ? 'returned' : 'classic', blush: 0.75, sweat: true });
      return;
    }
    if (v === 'cover') {
      P.armL = { x: -36, y: -2, space: 'head' };
      P.armR = { x: 36, y: -2, space: 'head' };
      P.shutL = P.shutR = 1;
      P.shutStyle = 'squeeze';
      P.blush = 1;
      P.pitch = 0.18;
      P.earPerk = -0.6;
      P.crouch = 0.15;
      P.tailAmp = 0.05;
      P.headFollow = 0.2;
      const k1 = bump(1.0, 1.9, t), k2 = bump(2.2, 2.9, t);
      if (k1 > 0) { P.armR = { x: 36, y: -2 + 24 * k1, space: 'head' }; P.shutR = 1 - k1; P.shutStyle = 'calm'; }
      if (k2 > 0) { P.armL = { x: -36, y: -2 + 24 * k2, space: 'head' }; P.shutL = 1 - k2; P.shutStyle = 'calm'; }
      if (t > 3.2) this.go('RELAXING', { blush: true });
      return;
    }
    if (v === 'pout') {
      P.gaze = this.headAway(awaySide * 320, -60);
      P.headFollow = 0.85;
      P.shutL = P.shutR = 1;
      P.shutStyle = 'calm';
      P.browTiltL = P.browTiltR = -0.7;
      P.pout = 1;
      P.blush = 0.85;
      P.armL = { x: 20, y: -62, space: 'body' };
      P.armR = { x: -20, y: -57, space: 'body' };
      P.tilt = -awaySide * 6;
      P.lean = awaySide * 3;
      P.smile = -0.3;
      const k = bump(1.4, 2.2, t);
      if (k > 0) {
        // a side-eye check: still offended?
        if (awaySide > 0) P.shutL = 1 - k; else P.shutR = 1 - k;
        P.lidL = P.lidR = 0.4;
        const head = s.body.head;
        P.yaw = Math.tanh((P.gaze.x - head.x) / 320) * 0.85;
        P.gaze = target;
        P.headFollow = 0;
      }
      if (t > 3.0) this.go('RELAXING', { blush: true });
      return;
    }
    if (v === 'bleh') {
      if (t < 1.8) {
        P.armR = { x: 37, y: 20, space: 'head' };
        P.shutL = 1;
        P.shutStyle = 'happy';
        P.tongue = 1;
        P.mouthOpen = 0.12;
        P.tilt = 10;
        P.blush = 0.4;
        P.eyeOpen = 1.1;
        P.smile = 0.4;
      } else {
        // giggle
        P.shutL = P.shutR = 1;
        P.shutStyle = 'happy';
        P.smile = 1;
        P.mouthOpen = 0.32;
        P.lean = Math.sin(t * 30) * 1.6;
        P.blush = 0.55;
        P.armL = { x: -10, y: 36, space: 'head' };
      }
      if (t > 2.7) this.go('RELAXING');
    }
  }

  // ------------------------------------------------------------------ RELAXING
  enterRELAXING(arg) {
    this.arg.dur = arg.quiet ? 0.6 : 1.3;
    if (!arg.quiet) this.say('relaxing', true);
    this.act = null;
  }

  tickRELAXING(dt, s, P) {
    const t = this.stateT;
    P.gaze = null;
    P.headFollow = 0.3;
    if (!this.arg.quiet && t < 0.6) {
      P.shutL = P.shutR = 0.75;
      P.shutStyle = 'calm';
      P.mouthOpen = 0.12;
      P.crouch = 0.1;
      P.breath = 1.6;
      P.earPerk = -0.2;
    }
    if (this.arg.blush) P.blush = 0.6 * (1 - smoothstep(0, 1.3, t));
    if ((this.ptrActive || this.typeActive) && t > 0.35) { this.go('WATCH', { cautious: true }); return; }
    if (this.attn.src === 'object') this.applyObjectGaze(P);
    this.applyFlash(P);
    if (t > this.arg.dur) this.go('IDLE');
  }

  applyObjectGaze(P) {
    if (this.attn.src === 'object' && this.attn.sal >= 0.4) {
      P.gaze = this.attnPoint();
      P.headFollow = 0.75;
    }
  }

  // ------------------------------------------------------------------ JUDGE (a raked circle)
  enterJUDGE(arg) {
    arg.phase = this.s && this.s.self ? 'walk' : 'judge';
    arg.jt0 = 0;
    this.say(arg.phase === 'walk' ? 'judgeWalk' : 'judgeLook', true);
    this.act = null;
    this.dropLife();
  }

  tickJUDGE(dt, s, P) {
    const a = this.arg;
    if (a.phase === 'walk') {
      // walk over to inspect the circle up close
      const self = s.self;
      if (!a.stand) {
        const dx = self.x - a.x, dy = (self.y - a.y) * 1.6;
        const d = Math.hypot(dx, dy) || 1;
        const r = a.r || 60;
        a.stand = pushOut({ x: a.x + (dx / d) * (r * 1.15 + 60), y: a.y + ((dy / d) * (r * 0.62 + 34)) / 1.6 });
      }
      P.move = { to: a.stand, gait: 'walk', face: Math.sign(a.x - a.stand.x) || 1, tol: 10 };
      P.gaze = { x: a.x, y: a.y };
      P.headFollow = 0.6;
      if ((self.arrived && !self.moving && Math.hypot(self.x - a.stand.x, self.y - a.stand.y) < 18) || this.stateT > 5) {
        a.phase = 'judge';
        a.jt0 = this.stateT;
        this.say('judgeLook', true);
      }
      return;
    }
    if (a.stand) P.move = { to: a.stand, face: Math.sign(a.x - a.stand.x) || 1, tol: 30 };
    const t = this.stateT - a.jt0;
    P.gaze = { x: a.x, y: a.y };
    P.headFollow = 0.9;
    P.bodyFollow = 0.35;
    if (t < 1.3) {
      // hmm…
      P.armL = { x: -10, y: 52 + Math.sin(t * 9) * 2, space: 'head' };
      P.lidL = P.lidR = 0.34;
      P.browTiltL = -0.4;
      P.browTiltR = 0.15;
      P.tilt = 8 * Math.sin(t * 2);
      P.smile = 0;
      return;
    }
    if (!a.shown) {
      a.shown = true;
      this.emit('ensoScore', a.score);
      this.say(a.score >= 9 ? 'judgeGreat' : a.score >= 6 ? 'judgeGood' : 'judgeMeh', true);
    }
    P.sign = a.score;
    P.armR = { x: 74, y: -14, space: 'head' };
    if (t > 1.6) { P.gaze = null; P.headFollow = 0; }
    if (a.score >= 9) {
      P.sparkle = 1;
      P.smile = 1;
      P.mouthOpen = 0.35;
      P.eyeOpen = 1.1;
      const bow = bump(2.4, 3.5, t);
      if (bow > 0) { P.pitch = 0.5 * bow; P.shutL = P.shutR = bow; P.shutStyle = 'happy'; }
      if (t > 2.6 && !a.hearts) { a.hearts = true; this.impulse({ type: 'hearts', n: 3 }); }
    } else if (a.score >= 6) {
      P.smile = 0.6;
      P.pitch = t < 2.2 ? Math.sin((t - 1.3) * 9) * 0.14 : 0;
      if (t > 2.2 && t < 2.8) { P.shutL = P.shutR = 1; P.shutStyle = 'happy'; }
    } else {
      P.smile = -0.4;
      P.lidL = P.lidR = 0.42;
      P.sweat = 0.6;
      P.tilt = -8;
      P.browTiltL = P.browTiltR = 0.45;
    }
    if (t > 3.9) {
      if (this.ptrActive) this.go('WATCH', { cautious: true });
      else this.go('RELAXING', { quiet: true });
    }
  }

  // ------------------------------------------------------------------ POUNCE (the fox "mousing" leap)
  enterPOUNCE(arg) {
    arg.phase = 'wiggle';
    arg.key = 'pounce' + Math.round(this.now * 1000);
    this.idleAct = null;
    this.life.act = null;
    this.stalkT = 0;
    this.ptrBurst = 0;
    this.act = null;
    const self = this.s.self;
    arg.from = self ? { x: self.x, y: self.y } : { x: 800, y: 880 };
    arg.dist = Math.hypot(arg.x - arg.from.x, arg.y - arg.from.y);
  }

  tickPOUNCE(dt, s, P) {
    const a = this.arg;
    const self = s.self;
    const t = this.stateT;
    const target = { x: a.x, y: a.y };
    P.posture = 'stand';
    if (a.phase === 'wiggle') {
      // crouch, lock on, wiggle the hips
      P.move = { to: a.from, face: Math.sign(target.x - a.from.x) || 1, tol: 40 };
      P.crouch = 0.58;
      P.lean = Math.sin(t * 24) * 3.2;
      P.gaze = target;
      P.headFollow = 1;
      P.pupil = 1.55;
      P.eyeOpen = 1.08;
      P.earPerk = 1;
      P.tailAmp = 0.45;
      P.tailSpeed = 3.2;
      P.blink = false;
      if (t > 0.8) {
        a.phase = 'air';
        this.say(a.target === 'puddle' ? 'puddleJump' : 'pounce', true);
        this.emit('sfx', 'boop');
      }
      return;
    }
    if (a.phase === 'air') {
      P.move = { leap: { x: target.x, y: target.y, apex: 105 + a.dist * 0.12, key: a.key } };
      P.gaze = target;
      P.headFollow = 1;
      P.eyeOpen = 1.15;
      P.earPerk = 0.6;
      P.ahoge = -10;
      const u = self ? self.jumpU : 1;
      P.pitch = 0.6 * smoothstep(0.35, 0.9, u);
      P.stretch = 0.5;
      P.armL = { x: target.x - 16, y: target.y, space: 'world' };
      P.armR = { x: target.x + 16, y: target.y, space: 'world' };
      if ((self && !self.airborne && t > 0.95) || t > 4) {
        a.phase = 'land';
        a.landT = t;
        if (a.target === 'leaf') this.emit('scatterLeaf', a.id);
        if (a.target === 'puddle') this.emit('splash', { x: a.x, y: a.y, k: 1.25 });
      }
      return;
    }
    const lt = t - a.landT;
    if (a.target === 'bird') { this.pounceBirdAfter(lt, s, P); return; }
    if (a.target === 'puddle') { this.puddleAfter(lt, s, P); return; }
    if (a.target === 'leaf') {
      // the leaf leaps away: Kon is delighted anyway
      const leaf = (s.objects || []).find((o) => o.kind === 'leaf');
      P.gaze = leaf ? { x: leaf.x, y: leaf.y } : this.headAway(0, -200);
      P.headFollow = 0.9;
      P.smile = 1;
      P.mouthOpen = 0.35;
      P.eyeOpen = 1.12;
      P.sparkle = 0.6;
      P.tailAmp = 0.8;
      P.tailSpeed = 2.4;
      if (lt > 0.2 && !a.said) { a.said = true; this.say('pounceLeaf', true); }
      if (lt > 2.4) { this.life.lastVisit.leaf = this.now; this.go('RELAXING', { quiet: true }); }
      return;
    }
    // the cursor: nothing under the paws
    if (lt < 0.3) {
      P.crouch = 0.45;
      P.armL = { x: target.x - 16, y: target.y, space: 'world' };
      P.armR = { x: target.x + 16, y: target.y, space: 'world' };
      return;
    }
    if (!a.under) a.under = this.makeAct('lookUnder');
    this.runAct(a.under, dt, P);
    if (lt > 1.9) this.go('PRETENDING', { act: pick(this.rng, ['groom', 'whistle', 'sky']), caption: 'pounceMiss', blush: 0.7, sweat: true });
  }
}
