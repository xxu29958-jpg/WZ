// Brain — Kon's behavior. Pure logic: it reads a "senses" snapshot each frame
// and returns a pose (a set of targets for the rig). No DOM access, so it can be
// driven by simulated input in tests/behavior.html.
//
// States
//   IDLE        nobody around: breathing, blinking, small idle acts
//   WATCH       secretly following the cursor or the typing. Sub-labels
//               OBSERVING → CURIOUS → PEEKING come from a continuous curiosity
//               value, so posture blends smoothly instead of switching.
//   NOTICED     the visitor stopped: a short "uh-oh" freeze
//   PRETENDING  playing an innocence act (meditate, whistle, groom, …)
//   RESUMING    side-eyeing out of the act before watching again
//   STARTLED    caught by an approaching cursor (four escalating variants)
//   RELAXING    exhale, settle back to neutral
//   DROWSY → SLEEPING → WAKING   after a long quiet spell
//   DIZZY, PETTED, BOOPED, ADMIRE   easter-egg reactions

import { clamp, lerp, smoothstep, bump, damp, Bag, randRange, pick, TAU, wrapAngle } from './math.js';
import { ACTS, PRETEND_ACTS, IDLE_ACTS } from './acts.js';
import { CAPTIONS } from './captions.js';

export function neutralPose() {
  return {
    gaze: null, headFollow: 0.45, bodyFollow: 0,
    yaw: 0, pitch: 0, tilt: 0,
    lean: 0, reachX: 0, reachY: 0, stretch: 0, crouch: 0, headScale: 1, pout: 0,
    eyeOpen: 1, iris: 1, pupil: 1,
    lidL: 0.1, lidR: 0.1, shutL: 0, shutR: 0, shutStyle: 'calm', smileEyes: 0,
    browL: 0, browR: 0, browTiltL: 0, browTiltR: 0,
    earL: 0, earR: 0, earPerk: 0, ahoge: 0,
    mouthOpen: 0, smile: 0.2, pucker: 0, tongue: 0,
    blush: 0, sweat: 0, shock: 0, spiral: 0, sparkle: 0,
    armL: null, armR: null,
    tailAmp: 0.15, tailSpeed: 0.6, tailBase: 0, tailCurl: 0,
    breath: 1, snap: 0, blink: true, sleepy: false,
    fx: { notes: 0, zzz: 0, bubble: 0, hearts: 0 },
    impulses: [],
  };
}

const REACTIVE = new Set(['IDLE', 'WATCH', 'PRETENDING', 'RESUMING', 'RELAXING', 'DROWSY']);
const STARTLE_VARIANTS = ['classic', 'cover', 'pout', 'bleh'];

export class Brain {
  constructor({ rng = Math.random, reducedMotion = false } = {}) {
    this.rng = rng;
    this.reduced = reducedMotion;
    this.state = 'IDLE';
    this.stateT = 0;
    this.arg = {};
    this.now = 0;
    this.started = false;

    this.ptrI = 0;         // interest in the pointer
    this.typeI = 0;        // interest in the typing
    this.cur = 0;          // curiosity actually expressed (smoothed)
    this.ptrBurst = 0;     // seconds of pointer movement since Kon last "got caught"
    this.typeBurst = 0;    // keystrokes since Kon last "got caught"
    this.moveAccum = 0;    // recent pointer travel, used to wake from sleep
    this.stalk = 0;

    this.attn = { src: 'none', id: null, x: 800, y: 500, since: 0 };
    this.lastActive = 0;
    this.flash = null;     // brief glance at a sound or event

    this.caught = 0;
    this.lastCaughtAt = -1e9;
    this.armed = true;
    this.lastVariant = null;
    this.prevDist = null;
    this.approachV = 0;
    this.spin = 0;
    this.prevAngle = null;
    this.petTimes = [];
    this.prevVxSign = 0;
    this.petLast = 0;

    this.act = null;
    this.idleAct = null;
    this.nextIdleAt = 2.5;
    this.idleLook = { point: null, until: 0 };
    this.glance = { next: 0, until: 0 };
    this.tiltSide = 1;
    this.stopDelay = 0.4;
    this.label = 'IDLE';
    this.labelAt = -10;

    this.pretendBag = new Bag(PRETEND_ACTS, rng);
    this.idleBag = new Bag(IDLE_ACTS.flatMap(([n, w]) => Array(Math.round(w * 2)).fill(n)), rng);
    this.caption = { text: '', key: '', at: 0 };
    this.lastLines = {};
    this.history = [];
    this.emits = [];
  }

  // ------------------------------------------------------------------ helpers
  go(state, arg = {}) {
    const from = this.state;
    this.state = state;
    this.stateT = 0;
    this.arg = arg;
    this.history.push({ t: +this.now.toFixed(2), from, to: state, ...(arg.variant ? { variant: arg.variant } : {}), ...(arg.act ? { act: arg.act } : {}) });
    if (this.history.length > 200) this.history.shift();
    const enter = this['enter' + state];
    if (enter) enter.call(this, arg);
  }

  say(key, force = false) {
    const lines = CAPTIONS[key];
    if (!lines) return;
    if (!force && this.caption.key === key) return;
    let line = pick(this.rng, lines);
    if (lines.length > 1 && line === this.lastLines[key]) line = lines[(lines.indexOf(line) + 1) % lines.length];
    this.lastLines[key] = line;
    this.caption = { text: line, key, at: this.now };
  }

  impulse(imp) { this.P.impulses.push(imp); }
  emit(type, data) { this.emits.push({ type, data }); }

  headAway(dx, dy) {
    const h = this.s.body.head;
    return { x: h.x + dx, y: h.y + dy };
  }

  /** Start an authored act with a fresh context. */
  makeAct(name, extra = {}) {
    const s = this.s;
    const head = s.body.head;
    const target = this.attnPoint() || { x: head.x, y: head.y + 200 };
    const targetSide = Math.sign(target.x - head.x) || 1;
    const done = new Set();
    const ctx = {
      side: -targetSide,
      targetSide,
      seed: this.rng(),
      target,
      away: (dx, dy) => this.headAway(dx, dy),
      place: (n) => this.place(n),
      object: (kind) => (this.s.objects || []).find((o) => o.kind === kind) || null,
      once: (key, fn) => { if (!done.has(key)) { done.add(key); fn(); } },
      emit: (type, data) => this.emit(type, data),
      impulse: (imp) => this.impulse(imp),
      spots: this.lookSpots(),
      ...extra,
    };
    return { name, def: ACTS[name], ctx, t: 0, dur: extra.dur ?? 4 };
  }

  runAct(act, dt, P) {
    act.t += dt;
    act.def.pose(act.t, P, act.ctx);
  }

  place(name) {
    const pl = this.s.places || {};
    if (name === 'bib') return this.s.body.bib || this.headAway(0, 120);
    if (name === 'tail') return this.s.body.tail;
    return pl[name] || this.headAway(0, 200);
  }

  lookSpots() {
    const pl = this.s.places || {};
    const pool = [pl.lantern, pl.maple, pl.bamboo, pl.rack, pl.sky, this.headAway(-380, 60), this.headAway(360, 40)].filter(Boolean);
    const out = [];
    for (let i = 0; i < 3; i++) out.push(pick(this.rng, pool));
    if (this.s.pointer.present && this.rng() < 0.5) out[2] = { x: this.s.pointer.x, y: this.s.pointer.y };
    return out;
  }

  attnPoint() {
    if (this.attn.src === 'none') return null;
    return { x: this.attn.x, y: this.attn.y };
  }

  reactive() { return REACTIVE.has(this.state); }

  // ------------------------------------------------------------------ update
  update(dt, s) {
    dt = Math.min(dt, 0.1);
    this.s = s;
    this.now = s.now;
    this.stateT += dt;
    const P = neutralPose();
    this.P = P;
    this.emits = [];
    if (!this.started) {
      this.started = true;
      this.lastActive = s.now;
      this.say('intro');
    }

    this.sense(dt, s);
    for (const ev of s.events) this.onEvent(ev, s);
    this.arbitrate(dt, s);
    if (this.reactive()) this.detect(dt, s);

    const tick = this['tick' + this.state];
    tick.call(this, dt, s, P);

    if (this.now - this.lastCaughtAt > 24) this.caught = 0;
    this.applyReducedMotion(P);
    if (P.gaze && !(Number.isFinite(P.gaze.x) && Number.isFinite(P.gaze.y))) P.gaze = null;
    return P;
  }

  applyReducedMotion(P) {
    if (!this.reduced) return;
    P.spiral = 0;
    P.fx.hearts = 0;
  }

  sense(dt, s) {
    const p = s.pointer;
    const now = s.now;
    this.ptrStill = p.present ? now - p.lastMove : 1e9;
    this.ptrActive = p.present && this.ptrStill < 0.16;
    this.speedN = clamp(p.speed / 1500);
    const h = s.body.restHead;
    this.ptrDist = p.present ? Math.hypot(p.x - h.x, p.y - h.y) : 1e9;
    const ty = s.typing;
    this.typeStill = now - Math.max(ty.lastInput, ty.lastKey ?? -1e9);
    this.typeActive = ty.focused && this.typeStill < 0.5;
    if (this.ptrActive || this.typeActive) this.lastActive = now;
    this.idleFor = now - this.lastActive;

    // interest grows independently for each source
    if (this.ptrActive) {
      const prox = 0.6 + 0.4 * (1 - clamp(this.ptrDist / 900));
      this.ptrI += dt * (0.2 + 0.34 * this.speedN) * prox;
      this.ptrBurst += dt;
      this.moveAccum += p.speed * dt;
    } else {
      this.ptrI -= dt * (this.ptrStill < 2 ? 0.05 : 0.22);
      if (this.ptrStill > 3) this.ptrBurst = 0;
    }
    this.moveAccum *= Math.exp(-dt * 1.4);
    if (ty.focused) {
      if (this.typeActive) this.typeI += dt * 0.1;
      else if (this.typeI < 0.55) this.typeI += dt * 0.09;  // a focused field is interesting on its own
      else this.typeI -= dt * 0.03;
    } else {
      this.typeI -= dt * 0.5;
      this.typeBurst = 0;
    }
    this.ptrI = clamp(this.ptrI);
    this.typeI = clamp(this.typeI);

    // slow pointer movement = hunting crouch; fast = alert
    const stalking = this.attn.src === 'pointer' && this.ptrActive && this.speedN < 0.12 && this.cur > 0.25 ? 1 : 0;
    this.stalk = damp(this.stalk, stalking, stalking ? 2 : 4, dt);
  }

  arbitrate(dt, s) {
    const p = s.pointer;
    const ty = s.typing;
    const now = s.now;
    const cands = [];
    const salP = !p.present ? 0 : this.ptrActive ? 0.55 + 0.45 * this.speedN : Math.max(0, 0.55 - (this.ptrStill - 0.16) * 0.3);
    if (salP > 0) cands.push({ src: 'pointer', id: 'pointer', sal: salP, x: p.x, y: p.y });
    const salT = !ty.focused ? 0 : this.typeActive ? 0.92 : Math.max(0.42, 0.92 - (this.typeStill - 0.5) * 0.25);
    if (salT > 0) cands.push({ src: 'typing', id: 'typing', sal: salT, x: ty.anchor.x, y: ty.anchor.y });
    for (const o of s.objects || []) cands.push({ src: 'object', id: o.id, kind: o.kind, sal: o.sal, x: o.x, y: o.y });

    let cur = cands.find((c) => c.id === this.attn.id);
    let best = null;
    for (const c of cands) if (!best || c.sal > best.sal) best = c;
    if (!best) {
      this.attn.src = 'none';
      this.attn.id = null;
      return;
    }
    const dwell = now - this.attn.since;
    if (!cur || cur.sal < 0.06 || (best.sal > cur.sal + 0.12 && dwell > 0.3)) {
      if (!cur || best.id !== cur.id) {
        this.attn.since = now;
        cur = best;
      }
    }
    this.attn.src = cur.src;
    this.attn.id = cur.id;
    this.attn.kind = cur.kind;
    this.attn.x = cur.x;
    this.attn.y = cur.y;
    this.attn.sal = cur.sal;
  }

  detect(dt, s) {
    const p = s.pointer;
    const sc = s.body.scale;
    const now = s.now;
    if (!p.present) { this.prevDist = null; this.prevAngle = null; return; }
    const dist = this.ptrDist;

    // --- getting caught: the cursor approaches Kon on purpose
    if (dist > 270 * sc) this.armed = true;
    if (this.prevDist != null) {
      const v = (this.prevDist - dist) / Math.max(dt, 1e-3);
      this.approachV = lerp(this.approachV, v, 1 - Math.exp(-dt * 14));
    }
    this.prevDist = dist;
    if (this.armed && this.ptrActive && !p.isTouch && now - this.lastCaughtAt > 1.2) {
      const near = dist < 165 * sc && this.approachV > 240;
      const veryNear = dist < 100 * sc;
      if (near || veryNear) {
        this.armed = false;
        this.startle('pointer');
        return;
      }
    }

    // --- circling quickly around Kon's head → dizzy
    const hd = s.body.head;
    const ang = Math.atan2(p.y - hd.y, p.x - hd.x);
    if (this.prevAngle != null && this.ptrActive && dist < 480 * sc && dist > 50 * sc && this.speedN > 0.2) {
      this.spin += wrapAngle(ang - this.prevAngle);
    }
    this.prevAngle = ang;
    this.spin *= Math.exp(-dt * (this.ptrActive ? 0.25 : 2.5));
    if (Math.abs(this.spin) > 2.2 * TAU) {
      this.spin = 0;
      this.go('DIZZY');
      return;
    }

    // --- rubbing back and forth over the head → petting
    if (this.overHead(s) && this.ptrActive) {
      const sg = Math.abs(p.vx) > 70 ? Math.sign(p.vx) : 0;
      if (sg && sg !== this.prevVxSign) {
        if (this.prevVxSign) this.petTimes.push(now);
        this.prevVxSign = sg;
      }
    }
    this.petTimes = this.petTimes.filter((t) => now - t < 1.4);
    if (this.petTimes.length >= 3) {
      this.petTimes = [];
      this.go('PETTED');
    }
  }

  overHead(s) {
    const p = s.pointer;
    const h = s.body.head;
    const sc = s.body.scale;
    return p.present && Math.hypot(p.x - h.x, p.y - h.y) < 86 * sc;
  }

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

  onEvent(ev, s) {
    const asleep = this.state === 'SLEEPING';
    switch (ev.type) {
      case 'boop':
        this.lastActive = this.now;
        if (asleep) this.go('WAKING', { boop: true });
        else this.go('BOOPED');
        break;
      case 'pat':
        this.lastActive = this.now;
        if (asleep) this.go('WAKING');
        else if (this.state !== 'PETTED') this.go('PETTED', { pat: true });
        break;
      case 'tap': {
        this.lastActive = this.now;
        if (asleep || this.state === 'DROWSY') { this.go('WAKING'); break; }
        if (ev.touch && this.reactive() && this.now - this.lastCaughtAt > 1.2) {
          const h = s.body.restHead;
          if (Math.hypot(ev.x - h.x, ev.y - h.y) < 230 * s.body.scale) this.startle('tap');
        }
        break;
      }
      case 'focus':
        this.lastActive = this.now;
        this.typeI = Math.max(this.typeI, 0.3);
        this.impulse({ type: 'earFlick', side: 'r' });
        this.noticeAt = this.now;
        if (asleep || this.state === 'DROWSY') this.go('WAKING');
        break;
      case 'input':
        this.lastActive = this.now;
        this.typeI = clamp(this.typeI + 0.065);
        this.typeBurst += 1;
        if (asleep || this.state === 'DROWSY') this.go('WAKING');
        break;
      case 'submit':
        this.lastActive = this.now;
        this.typeBurst = 0;
        if (this.state !== 'SLEEPING') this.go('ADMIRE');
        break;
      case 'clack':
        this.onClack(ev);
        break;
      case 'night':
        if (!asleep) {
          this.flash = { x: s.places.lantern.x, y: s.places.lantern.y, until: this.now + 1.6, sparkle: ev.on };
          this.say(ev.on ? 'night' : 'day', true);
        }
        break;
      case 'return':
        if (ev.away > 4 && this.state !== 'SLEEPING') {
          this.startle('return');
        }
        break;
      case 'enter':
        if (!asleep) this.impulse({ type: 'earFlick', side: this.rng() < 0.5 ? 'l' : 'r', s: 0.6 });
        break;
      case 'leave':
        this.leftAt = this.now;
        break;
      case 'notice':
        if (!asleep) this.flash = { x: ev.x, y: ev.y, until: this.now + 1.1 };
        break;
      default:
        break;
    }
  }

  onClack(ev) {
    const st = this.state;
    if (st === 'SLEEPING') {
      this.impulse({ type: 'flinch', s: 0.4 });
      this.impulse({ type: 'earFlick', side: ev.x < 800 ? 'l' : 'r' });
      return;
    }
    if (st === 'DROWSY') { this.go('WAKING'); return; }
    this.impulse({ type: 'flinch', s: ev.user ? 0.7 : 0.45 });
    this.impulse({ type: 'earFlick', side: ev.x < 800 ? 'l' : 'r' });
    this.flash = { x: ev.x, y: ev.y, until: this.now + 0.85 };
  }

  /** Brief glance toward a sound or event, layered over any state. */
  applyFlash(P, eyesOnly = false) {
    if (!this.flash || this.now > this.flash.until) { this.flash = null; return false; }
    P.gaze = { x: this.flash.x, y: this.flash.y };
    if (!eyesOnly) P.headFollow = 0.6;
    P.browL = P.browR = 0.5;
    P.earPerk = Math.max(P.earPerk, 0.5);
    if (this.flash.sparkle) P.sparkle = 1;
    return true;
  }

  // ------------------------------------------------------------------ IDLE
  enterIDLE() {
    this.idleAct = null;
    this.nextIdleAt = randRange(this.rng, 2.2, 4.5);
    this.say('idle');
  }

  tickIDLE(dt, s, P) {
    if (this.ptrActive && this.ptrBurst > 0.08) { this.go('WATCH', { from: 'idle' }); return; }
    const fresh = s.typing.focused && this.now - s.typing.focusAt < 3;
    if (this.typeActive || (fresh && this.typeI > 0.24)) { this.go('WATCH', { from: 'idle' }); return; }
    if (this.idleFor > 26 && !this.idleAct) { this.go('DROWSY'); return; }

    if (!this.idleAct && this.stateT > this.nextIdleAt) {
      let name = this.idleBag.next(this.idleFor < 10 ? ['yawn'] : []);
      if (this.idleFor > 16 && this.rng() < 0.35) name = 'yawn';
      const def = IDLE_ACTS.find(([n]) => n === name);
      this.idleAct = this.makeAct(name, { dur: def[2] });
    }
    if (this.idleAct) {
      this.runAct(this.idleAct, dt, P);
      if (this.idleAct.t > this.idleAct.dur) {
        this.idleAct = null;
        this.nextIdleAt = this.stateT + randRange(this.rng, 3.2, 7.5);
      }
    } else {
      this.idleGaze(P, s);
    }

    // a falling leaf or a dragonfly is always worth a look
    if (this.attn.src === 'object' && this.attn.sal >= 0.4) {
      P.gaze = this.attnPoint();
      P.headFollow = 0.75;
      P.browL = P.browR = 0.45;
      P.earPerk = 0.4;
      if (P.shutL > 0.5 && P.shutR > 0.5) { P.shutR = 0.2; P.lidR = 0.3; }
    }
    this.applyFlash(P);
  }

  idleGaze(P, s) {
    const L = this.idleLook;
    if (this.now > L.until) {
      const r = this.rng();
      if (r < 0.55) L.point = null;
      else if (r < 0.8 || !s.pointer.present) L.point = this.headAway(randRange(this.rng, -320, 320), randRange(this.rng, -160, 140));
      else L.point = { x: s.pointer.x, y: s.pointer.y };
      L.until = this.now + randRange(this.rng, 1.8, 4.2);
    }
    P.gaze = L.point;
    P.headFollow = 0.35;
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
    if (label !== this.label && this.now - this.labelAt > 1.3) {
      this.label = label;
      this.labelAt = this.now;
      const key = (src === 'typing' ? 'typing' : '') + (src === 'typing' ? label[0] + label.slice(1).toLowerCase() : label.toLowerCase());
      this.say(key);
    }

    this.lastWatch = {
      gaze: target, headFollow: P.headFollow, bodyFollow: P.bodyFollow,
      reachY: P.reachY, stretch: P.stretch, tilt: P.tilt, crouch: P.crouch,
    };

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
    if (this.stateT > this.arg.dur) this.go('PRETENDING', { act: this.pretendBag.next() });
  }

  // ------------------------------------------------------------------ PRETENDING
  enterPRETENDING(arg) {
    if (!arg.continue || !this.act) {
      this.act = this.makeAct(arg.act || this.pretendBag.next());
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
      const actName = this.pretendBag.next(['fakesleep', 'sky']);
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

  // ------------------------------------------------------------------ DROWSY / SLEEPING / WAKING
  enterDROWSY() { this.say('drowsy'); }

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

  // ------------------------------------------------------------------ easter eggs
  enterDIZZY() {
    this.say('dizzy', true);
    this.emit('sfx', 'dizzy');
    this.act = null;
  }

  tickDIZZY(dt, s, P) {
    const t = this.stateT;
    P.gaze = null;
    P.headFollow = 0;
    if (t < 2.6) {
      P.spiral = 1;
      const w = t * 7;
      P.tilt = Math.sin(w) * 13;
      P.yaw = Math.cos(w) * 0.35;
      P.pitch = Math.sin(w) * 0.1;
      P.lean = Math.sin(t * 3.5) * 5;
      P.mouthOpen = 0.2 + 0.1 * Math.sin(t * 5);
      P.smile = -0.3;
      P.earPerk = -0.5;
      P.earL = Math.sin(w) * 10;
      P.earR = -Math.sin(w) * 10;
      P.ahoge = Math.sin(t * 9) * 25;
      P.sweat = 0.6;
      P.blink = false;
    } else {
      const u = (t - 2.6) / 0.8;
      P.yaw = Math.sin((t - 2.6) * 28) * 0.55 * (1 - u);
      P.shutL = P.shutR = 1;
      P.shutStyle = 'squeeze';
      P.mouthOpen = 0.1;
    }
    if (t > 3.4) this.go('RELAXING');
  }

  enterPETTED(arg) {
    this.petLast = this.now;
    this.say('petted', true);
    this.impulse({ type: 'hearts', n: arg.pat ? 2 : 1 });
    if (arg.pat) this.impulse({ type: 'hop', s: 0.4 });
    this.emit('sfx', 'purr');
    this.act = null;
  }

  tickPETTED(dt, s, P) {
    const t = this.stateT;
    const p = s.pointer;
    if (this.overHead(s) && this.ptrActive) this.petLast = this.now;
    P.gaze = null;
    P.headFollow = 0;
    P.shutL = P.shutR = 1;
    P.shutStyle = 'happy';
    P.smileEyes = 0.8;
    P.earPerk = -0.65;
    P.earL = 8;
    P.earR = 8;
    P.blush = 0.75;
    P.smile = 0.95;
    P.mouthOpen = 0.14;
    const h = s.body.head;
    P.tilt = p.present ? clamp((p.x - h.x) / 40, -1, 1) * 10 : 0;
    P.pitch = -0.1;
    P.tailAmp = 0.7;
    P.tailSpeed = 2.2;
    P.crouch = 0.1;
    P.fx.hearts = !this.arg.pat && t > 0.6 ? 1 : 0;
    P.blink = false;
    const over = this.arg.pat ? t > 1.1 : this.now - this.petLast > 0.9;
    if (over) {
      this.act = this.makeAct('groom');
      this.go('PRETENDING', { continue: true, caption: 'pettedAfter', blush: 0.85, sweat: true });
    }
  }

  enterBOOPED() {
    this.impulse({ type: 'flinch', s: 0.8 });
    this.arg.sneeze = this.rng() < 0.65;
    this.say('booped', true);
    this.emit('sfx', 'boop');
    this.act = null;
  }

  tickBOOPED(dt, s, P) {
    const t = this.stateT;
    P.headFollow = 0;
    if (t < 0.14) {
      P.shutL = P.shutR = 1;
      P.shutStyle = 'squeeze';
      P.pitch = -0.25;
      P.smile = -0.2;
      P.earPerk = 1;
      P.shock = 0.4;
    } else if (t < 0.75) {
      // cross-eyed look at its own nose
      const n = s.body.nose;
      P.gaze = { x: n.x, y: n.y + 6 };
      P.eyeOpen = 1.1;
      P.browL = P.browR = 0.6;
      P.mouthOpen = 0.05;
      P.blink = false;
    } else if (this.arg.sneeze) {
      if (t < 1.05) {
        P.pitch = -0.35;
        P.shutL = P.shutR = 0.7;
        P.shutStyle = 'squeeze';
        P.mouthOpen = 0.4;
        P.stretch = 0.25;
        P.browTiltL = P.browTiltR = 0.6;
      } else if (t < 1.4) {
        if (!this.arg.sneezed) {
          this.arg.sneezed = true;
          this.impulse({ type: 'sneeze' });
          this.emit('sfx', 'sneeze');
          this.say('sneeze', true);
        }
        P.shutL = P.shutR = 1;
        P.shutStyle = 'squeeze';
        P.pitch = 0.3;
        P.mouthOpen = 0.6;
      } else {
        P.blush = 0.8;
        P.armL = { x: -6 + Math.sin(t * 20) * 5, y: 24, space: 'head' };
        P.smile = 0.3;
        P.lidL = P.lidR = 0.3;
      }
    } else {
      P.shutL = P.shutR = 1;
      P.shutStyle = 'happy';
      P.smile = 1;
      P.mouthOpen = 0.25;
      P.lean = Math.sin(t * 28) * 1.5;
      P.blush = 0.6;
    }
    if (t > 2.2) {
      if (this.ptrActive) this.go('WATCH', { cautious: true });
      else this.go('RELAXING');
    }
  }

  enterADMIRE() {
    this.say('admire', true);
    this.act = null;
  }

  tickADMIRE(dt, s, P) {
    const t = this.stateT;
    const crane = (s.objects || []).find((o) => o.kind === 'crane');
    P.gaze = crane ? { x: crane.x, y: crane.y } : this.attnPoint();
    P.headFollow = 0.85;
    P.bodyFollow = 0.4;
    P.sparkle = 1;
    P.eyeOpen = 1.12;
    P.pupil = 1.35;
    P.smile = 0.9;
    P.mouthOpen = 0.3;
    P.earPerk = 0.9;
    P.tailAmp = 0.8;
    P.tailSpeed = 2.4;
    P.reachY = -14;
    P.stretch = 0.3;
    if (t > 0.2 && t < 1.4) {
      const c = Math.abs(Math.sin(t * 9));
      P.armL = { x: -6 - 8 * c, y: -72, space: 'body' };
      P.armR = { x: 6 + 8 * c, y: -72, space: 'body' };
    }
    if (t > 3.4) {
      this.go('PRETENDING', { act: 'whistle', caption: 'admireAfter', blush: 0.7, sweat: true });
    }
  }

  // ------------------------------------------------------------------ debug
  debug() {
    return {
      state: this.state,
      label: this.state === 'WATCH' ? this.label : '',
      act: this.act ? this.act.name : this.idleAct ? this.idleAct.name : '',
      variant: this.arg.variant || '',
      cur: this.cur,
      ptrI: this.ptrI,
      typeI: this.typeI,
      attn: this.attn.src + (this.attn.kind ? ':' + this.attn.kind : ''),
      ptrActive: this.ptrActive,
      typeActive: this.typeActive,
      caught: this.caught,
      idleFor: this.idleFor,
    };
  }
}
