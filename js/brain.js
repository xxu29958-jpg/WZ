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
//   ZAZEN       true meditation, reached by staying perfectly still. Kon first
//               tries to make you flinch (GOTCHA if you do), then the ensō
//               paints itself; any input breaks it
//   SATORI      enlightenment: Kon floats for a few seconds, then drops
//   DROWSY → SLEEPING → WAKING   after enlightenment wears Kon out
//   JUDGE       grading a circle you raked in the sand
//   DIZZY, PETTED, BOOPED, ADMIRE   easter-egg reactions

import { clamp, lerp, smoothstep, bump, damp, Bag, randRange, pick, TAU, wrapAngle } from './math.js';
import { ACTS, PRETEND_ACTS, IDLE_ACTS, TEMPT_ACTS, ACTIVITIES } from './acts.js';
import { POIS, SAND_TOP, BOUNDS, randomSpot, pushOut } from './world.js';
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
    float: 0, sign: null,
    posture: null,             // 'sit' | 'stand' (null: decided from movement)
    move: null,                // a wish for the mover: { to, seat, gait, face, tol, leap }
    fx: { notes: 0, zzz: 0, bubble: 0, hearts: 0 },
    impulses: [],
  };
}

const REACTIVE = new Set(['IDLE', 'WATCH', 'PRETENDING', 'RESUMING', 'RELAXING', 'DROWSY']);
const ZAZEN_AFTER = 7;      // seconds of total stillness before true meditation begins
const PAINT_SECONDS = 16;   // how long the ensō takes to paint itself
const ACTIVITY_EVENTS = new Set(['down', 'tap', 'focus', 'input', 'boop', 'pat', 'rakeStart', 'submit']);
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

    this.zen = null;           // progress of the current meditation
    this.zenArmed = true;      // re-armed by any activity after a satori
    this.zenBreak = false;
    this.satoriCount = 0;
    this.temptBag = new Bag(TEMPT_ACTS, rng);
    this.greet = null;         // a hello queued for a returning visitor

    // a life of its own: what Kon is up to when nobody is watching
    this.life = { act: null, restUntil: 4, lastVisit: {}, leafSeen: {} };
    this.stalkT = 0;
    this.approaching = false;
    this.standUntil = 0;
  }

  /** What the garden needs to know to paint the live ensō. */
  zenInfo() {
    const st = this.state;
    return {
      state: st,
      paint: st === 'ZAZEN' && this.zen ? this.zen.paint : st === 'SATORI' ? 1 : 0,
      satoriCount: this.satoriCount,
    };
  }

  sayText(text, key = 'custom') {
    this.caption = { text, key, at: this.now };
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
    this.caption = { text: line, key, at: this.now, hold: force ? 2.6 : 1.4 };
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
      body: () => this.s.body,
      facing: this.s.self ? this.s.self.faceDir : 1,
      night: !!this.s.night,
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
      this.life.restUntil = s.now + 5; // sit a while before wandering off
      this.say('intro');
    }

    this.sense(dt, s);
    for (const ev of s.events) this.onEvent(ev, s);
    this.arbitrate(dt, s);
    if (this.reactive()) this.detect(dt, s);

    const tick = this['tick' + this.state];
    tick.call(this, dt, s, P);
    // stand while moving and for a moment after; otherwise sit down
    if (s.self) {
      if (s.self.moving) this.standUntil = this.now + 1.1;
      if (P.posture == null) P.posture = this.now < this.standUntil ? 'stand' : 'sit';
    }

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
    if (this.ptrActive || this.typeActive) {
      this.lastActive = now;
      this.zenArmed = true;
    }
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
    const stalking = this.attn.src === 'pointer' && this.ptrActive && this.speedN < 0.12 && this.cur > 0.18 ? 1 : 0;
    this.stalk = damp(this.stalk, stalking, stalking ? 3.5 : 4, dt);
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
    if (ACTIVITY_EVENTS.has(ev.type)) {
      this.zenArmed = true;
      if (this.state === 'ZAZEN') this.zenBreak = true;
    }
    switch (ev.type) {
      case 'down':
        this.lastActive = this.now;
        break;
      case 'rakeStart':
        this.lastActive = this.now;
        if (asleep || this.state === 'DROWSY') this.go('WAKING');
        break;
      case 'rakeEnd':
        this.lastActive = this.now;
        if (['SATORI', 'SLEEPING', 'WAKING', 'STARTLED'].includes(this.state)) break;
        if (ev.shape === 'circle') this.go('JUDGE', { score: ev.score, x: ev.x, y: ev.y });
        else if (ev.shape === 'spiral' && !this.reduced) this.go('DIZZY', { spiral: true });
        break;
      case 'arrive': {
        const n = ev.visits || 1;
        if (n >= 2) {
          let text;
          if (ev.awayHours > 20) text = 'Kon kept your spot warm. For hours. (Kon did not move.)';
          else if (n === 2) text = 'You came back. Kon pretends not to be happy about it.';
          else if (n < 6) text = `Visit ${n}. Kon has stopped counting. (Kon has not stopped counting.)`;
          else text = `Visit ${n}. A regular. Kon bows. Slightly.`;
          this.greet = { at: 1.0, kind: n >= 6 ? 'greetBow' : 'greetWave', text, doodle: !!ev.doodle };
        } else if (ev.doodle) {
          this.greet = { at: 1.0, kind: 'doodleProud', text: 'Kon raked you a little something.', doodle: false };
        }
        break;
      }
      case 'daytime':
        if (ev.period === 'night') this.say('lateNight', true);
        else if (ev.period === 'dusk') this.say('dusk', true);
        else if (ev.period === 'dawn') this.say('dawn', true);
        break;
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
    const watching = this.life.act && this.life.act.id === 'shishi' && this.life.act.phase === 'do';
    this.impulse({ type: watching ? 'jolt' : 'flinch', s: watching ? 0.8 : ev.user ? 0.7 : 0.45 });
    this.impulse({ type: 'earFlick', side: ev.x < 800 ? 'l' : 'r' });
    this.flash = { x: ev.x, y: ev.y, until: this.now + 0.85 };
    if (watching) this.say('lifeShishiClack', true);
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
    this.life.act = null;
    this.life.restUntil = Math.max(this.life.restUntil, this.now + 2);
    this.nextIdleAt = randRange(this.rng, 2.2, 4.5);
    this.say('idle');
  }

  tickIDLE(dt, s, P) {
    if (this.ptrActive && this.ptrBurst > 0.08) { this.dropLife(); this.go('WATCH', { from: 'idle' }); return; }
    const fresh = s.typing.focused && this.now - s.typing.focusAt < 3;
    if (this.typeActive || (fresh && this.typeI > 0.24)) { this.dropLife(); this.go('WATCH', { from: 'idle' }); return; }
    const self = s.self || { seat: 'cushion' };
    const home = self.seat === 'cushion' && !self.airborne;
    const resting = !this.life.act || (this.life.act.id === 'home' && this.life.act.phase === 'do');
    // sleepiness: after enlightenment, or after a very long quiet spell — but only at home
    const sleepy = (this.arg.afterSatori && this.idleFor > 26 && this.stateT > 6) || (!this.zenArmed && !this.arg.afterSatori && this.idleFor > 40);
    if (sleepy && !this.idleAct && resting) {
      if (home) { this.dropLife(); this.go('DROWSY'); return; }
      this.goHome('sleep');
    }
    // perfect stillness → true meditation, starting from rest on the cushion
    if (this.zenArmed && this.idleFor > ZAZEN_AFTER && this.stateT > 1 && !s.typing.focused && !this.greet) {
      if (home && resting) {
        const act = this.idleAct ? this.idleAct.name : '';
        if (!act || ['lookAround', 'viewer', 'earTwitch', 'meditateAttempt'].includes(act)) { this.dropLife(); this.go('ZAZEN'); return; }
      } else if (!home && !this.life.act && this.idleFor > 16) {
        // Kon finished what it was doing and the garden is still: time to go home
        this.goHome('zen');
      }
    }

    // a returning visitor gets a hello
    if (this.greet && this.stateT > this.greet.at && !this.idleAct && !this.life.act) {
      const g = this.greet;
      this.idleAct = this.makeAct(g.kind, { dur: g.kind === 'doodleProud' ? 2.8 : 2.4 });
      this.sayText(g.text, 'greet');
      this.greet = g.doodle ? { at: this.stateT + 2.6, kind: 'doodleProud', text: 'While you were away, Kon raked you a little something.', doodle: false } : null;
      this.lastActive = Math.max(this.lastActive, this.now - 2);
      this.life.restUntil = this.now + 6;
    }

    this.tickLife(dt, s, P);

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

  // ------------------------------------------------------------------ a life in the garden
  /** Head back to the cushion — to meditate, or because Kon is sleepy. */
  goHome(why) {
    const a = this.life.act;
    if (a && a.id === 'home' && a.why === why) return;
    this.life.act = { id: 'home', def: ACTIVITIES[0], phase: 'go', zen: why === 'zen', why, t: 0, dur: 1, gait: why === 'sleep' ? 'stroll' : 'walk' };
    this.idleAct = null;
    this.say(why === 'sleep' ? 'homeForSleep' : 'homeForZen', true);
  }

  dropLife(rest = randRange(this.rng, 2, 4)) {
    this.life.act = null;
    this.life.restUntil = this.now + rest;
  }

  /** Resting in place: the small idle behaviors (stretch, yawn, scratch, look around…). */
  restIdle(dt, s, P) {
    if (!this.idleAct && this.stateT > this.nextIdleAt) {
      let name = this.idleBag.next(this.idleFor < 10 ? ['yawn'] : []);
      if (this.idleFor > 16 && this.rng() < 0.35) name = 'yawn';
      if (name === 'flowerSniff' && !this.near(s, POIS.flower.stand, 150)) name = 'lookAround';
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
  }

  near(s, pt, r) {
    return !!s.self && Math.hypot(s.self.x - pt.x, s.self.y - pt.y) < r;
  }

  /** Choose somewhere to go: novelty (boredom wears off), a bit of whim, and distance. */
  pickActivity(s) {
    const self = s.self;
    let best = null, bestU = -1;
    for (const d of ACTIVITIES) {
      if (d.id === 'home' && self.seat === 'cushion') continue;
      if (d.id === 'rock' && self.seat === 'rock') continue;
      const last = this.life.lastVisit[d.id] ?? -1e9;
      const novelty = 1 - Math.exp(-(this.now - last) / 50);
      let w = s.night && d.nightWeight ? d.nightWeight : d.weight;
      if (d.id === 'home' && this.idleFor > 12) w *= 3; // a quiet garden draws Kon back to the cushion
      const at = d.id === 'home' ? { x: 800, y: 870 } : d.id === 'rock' ? { x: 1079, y: 940 } : d.id === 'wander' ? { x: 800, y: 900 } : POIS[d.id].stand;
      const dist = Math.hypot(at.x - self.x, at.y - self.y);
      const u = w * novelty * (0.55 + this.rng() * 0.9) / (1 + dist / 1100);
      if (u > bestU) { bestU = u; best = d; }
    }
    const far = best.id === 'home' ? 0 : 1;
    return {
      id: best.id, def: best, phase: 'go', t: 0,
      dur: randRange(this.rng, best.dur[0], best.dur[1]),
      gait: far && this.rng() < 0.25 ? 'trot' : 'walk',
    };
  }

  /** Where an activity happens and how to hold position there. */
  activityDest(a, s) {
    const g = a.gait || 'walk';
    if (a.id === 'home') return { move: { seat: 'cushion', gait: a.gait || 'walk' }, hold: { seat: 'cushion' }, seat: 'cushion' };
    if (a.id === 'rock') return { move: { seat: 'rock', gait: g }, hold: { seat: 'rock' }, seat: 'rock', look: POIS.rock.look };
    if (a.id === 'wander') {
      a.spot = a.spot || randomSpot(this.rng);
      return { move: { to: a.spot, gait: 'walk' }, hold: null, to: a.spot };
    }
    if (a.id === 'leaf') {
      const leaf = (s.objects || []).find((o) => o.id === a.leafId);
      if (!leaf) return null;
      return { move: { to: this.toward(leaf, s.self, 140), gait: 'trot' }, to: leaf, look: leaf, leaf };
    }
    const poi = POIS[a.id];
    return { move: { to: poi.stand, gait: g, face: poi.face }, hold: { to: poi.stand, face: poi.face }, to: poi.stand, look: poi.look };
  }

  /** A point `dist` away from `from`, on the way toward `to` (on the ground). */
  toward(to, from, dist) {
    const dx = from.x - to.x, dy = (from.y - to.y) * 1.6;
    const d = Math.hypot(dx, dy) || 1;
    return pushOut({ x: to.x + (dx / d) * dist, y: to.y + (dy / d) * dist / 1.6 });
  }

  tickLife(dt, s, P) {
    const L = this.life;
    const self = s.self;
    if (!self) { this.restIdle(dt, s, P); return; }
    if (!L.act) {
      this.restIdle(dt, s, P);
      const fresh = this.reachableLeaf(s);
      if (fresh && fresh.byVisitor && !this.greet) { L.leafSeen[fresh.id] = true; L.act = { id: 'leaf', phase: 'go', leafId: fresh.id, t: 0 }; this.idleAct = null; return; }
      if (this.now > L.restUntil && !this.idleAct && !this.greet) {
        const leaf = this.reachableLeaf(s);
        if (leaf) {
          L.leafSeen[leaf.id] = true;
          // leaves you shook loose are irresistible; stray ones only sometimes
          if (leaf.byVisitor || this.rng() < 0.6) { L.act = { id: 'leaf', phase: 'go', leafId: leaf.id, t: 0 }; return; }
        }
        L.act = this.pickActivity(s);
      }
      return;
    }
    // a leaf just landed: that beats any casual plan (but not going home to meditate)
    if (!L.act.zen && L.act.id !== 'leaf') {
      const leaf = this.reachableLeaf(s);
      if (leaf) {
        L.leafSeen[leaf.id] = true;
        if (leaf.byVisitor || this.rng() < 0.6) { L.act = { id: 'leaf', phase: 'go', leafId: leaf.id, t: 0 }; this.idleAct = null; }
      }
    }
    const a = L.act;
    a.t += dt;
    const dest = this.activityDest(a, s);
    if (!dest) { this.dropLife(1); return; }
    if (a.phase === 'go') {
      P.move = dest.move;
      P.gaze = dest.look || null;
      P.headFollow = 0.5;
      if (a.id === 'leaf') {
        if (Math.hypot(dest.leaf.x - self.x, (dest.leaf.y - self.y) * 1.6) < 175 || a.t > 6) {
          this.go('POUNCE', { target: 'leaf', id: a.leafId, x: dest.leaf.x, y: dest.leaf.y });
        }
        return;
      }
      const arrived = dest.seat ? self.seat === dest.seat : self.arrived && Math.hypot(self.x - dest.to.x, self.y - dest.to.y) < 16;
      if (arrived) {
        a.phase = 'do';
        a.t = 0;
        this.idleAct = null;
        if (a.def.act) {
          a.run = this.makeAct(a.def.act, { dur: a.dur });
          this.say(ACTS[a.def.act].caption);
        } else if (!a.zen) {
          this.say('lifeHome');
        }
      } else if (a.t > 18) {
        this.dropLife(2); // got stuck somewhere: never mind
      }
      return;
    }
    P.move = dest.hold;
    if (a.run) this.runAct(a.run, dt, P);
    else this.restIdle(dt, s, P);
    if (a.why && a.t > 8) { this.dropLife(3); return; } // arrived home and nothing happened after all
    if (a.t > a.dur && !a.why) {
      L.lastVisit[a.id] = this.now;
      this.idleAct = null;
      this.dropLife(a.id === 'home' ? randRange(this.rng, 6, 12) : randRange(this.rng, 3, 7));
    }
  }

  /** A freshly landed leaf that Kon can actually get to. */
  reachableLeaf(s) {
    return (s.objects || []).find((o) => o.kind === 'leafGround' && !this.life.leafSeen[o.id] &&
      o.x > BOUNDS.x0 - 30 && o.x < BOUNDS.x1 + 40 && o.y > BOUNDS.y0 && o.y < BOUNDS.y1 + 40);
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
  enterDIZZY(arg) {
    this.say(arg.spiral ? 'spiral' : 'dizzy', true);
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
        this.say('pounce', true);
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
      }
      return;
    }
    const lt = t - a.landT;
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
