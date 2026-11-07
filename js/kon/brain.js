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

import { clamp, lerp, damp, Bag, pick, TAU, wrapAngle, makeRng } from '../math.js';
import { ACTS, PRETEND_ACTS, IDLE_ACTS, TEMPT_ACTS } from './acts.js';
import { pushOut } from '../garden/world.js';
import { CAPTIONS } from './captions.js';
import { VOICE, voiceDuration } from './voice.js';
import { mixin } from '../util.js';
import { Life } from './life.js';
import { Social } from './social.js';
import { Stillness } from './stillness.js';
import { Play } from './play.js';

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

// narrator keys that map to a different voice key, and voice lines that may interrupt
const VOICE_ALIAS = { lifeRack: 'readPlaques', classic: 'startled', cover: 'startled', pout: 'startled', bleh: 'startled', admireAfter: 'typingStop' };
const URGENT_VOICE = new Set(['startled', 'gotcha', 'sneeze', 'booped', 'satoriEnd', 'pounceMiss', 'typingWalk', 'typingStop']);
const REACTIVE = new Set(['IDLE', 'WATCH', 'PRETENDING', 'RESUMING', 'RELAXING', 'DROWSY']);
const ACTIVITY_EVENTS = new Set(['down', 'tap', 'focus', 'input', 'boop', 'pat', 'rakeStart', 'submit']);

export class Brain {
  impulse(imp) { this.P.impulses.push(imp); }
  emit(type, data) { this.emits.push({ type, data }); }
  reactive() { return REACTIVE.has(this.state); }

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
    this.voice = { text: '', key: '', at: -10, dur: 0 };  // Kon's own speech bubble
    this.voiceRng = makeRng(17);                         // separate, so talking never changes behavior
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
    this.speak(key);
  }

  /**
   * Maybe say something in Kon's own voice for this moment. One bubble at a
   * time, except for reactions that can't wait (a startle, a sneeze).
   */
  speak(key) {
    const k = VOICE_ALIAS[key] || key;
    const v = VOICE[k];
    if (!v) return;
    const cur = this.voice;
    const busy = this.now - cur.at < cur.dur + 0.35;
    if (busy && !URGENT_VOICE.has(k)) return;
    if (this.voiceRng() > v.chance) return;
    let line = pick(this.voiceRng, v.lines);
    if (v.lines.length > 1 && line === cur.text) line = v.lines[(v.lines.indexOf(line) + 1) % v.lines.length];
    this.voice = { text: line, key: k, at: this.now, dur: voiceDuration(line) };
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
    this.speak(key);
  }

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

  near(s, pt, r) {
    return !!s.self && Math.hypot(s.self.x - pt.x, s.self.y - pt.y) < r;
  }

  /** A point `dist` away from `from`, on the way toward `to` (on the ground). */
  toward(to, from, dist) {
    const dx = from.x - to.x, dy = (from.y - to.y) * 1.6;
    const d = Math.hypot(dx, dy) || 1;
    return pushOut({ x: to.x + (dx / d) * dist, y: to.y + (dy / d) * dist / 1.6 });
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

// The states live in focused modules; their methods join the Brain class here.
mixin(Brain, Life, Social, Stillness, Play);
