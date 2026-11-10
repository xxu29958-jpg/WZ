// Behavior tests: drive the Brain with simulated pointer and typing input
// (no DOM, deterministic random numbers) and check the state transitions.

import { Brain } from '../js/kon/brain.js';
import { makeRng } from '../js/math.js';
import { PLACES } from '../js/garden/world.js';
import { analyzeStroke } from '../js/garden/rake.js';
import { Mover } from '../js/kon/mover.js';
import { bodyAt, isFree, planPath, POIS, OBSTACLES } from '../js/garden/world.js';
import { TAU } from '../js/math.js';
import { CAPTIONS } from '../js/kon/captions.js';
import { VOICE } from '../js/kon/voice.js';
import { Birds, birdContext } from '../js/garden/birds.js';
import { Sky, paletteAt, isNightHour } from '../js/garden/sky.js';
import { Weather, PUDDLES, puddleFill } from '../js/garden/weather.js';
import { Ball } from '../js/garden/toys.js';
import { Spirits, spiritContext } from '../js/garden/spirits.js';
import { Frog, Butterfly } from '../js/garden/critters.js';

const HEAD = { x: 800, y: 612 };
const BODY = {
  head: HEAD,
  restHead: { x: 800, y: 615 },
  nose: { x: 800, y: 640 },
  mouth: { x: 800, y: 652 },
  tail: { x: 926, y: 662 },
  bib: { x: 800, y: 696 },
  scale: 1.15,
};
const PLAQUE = { x: 1300, y: 722 };
const DT = 1 / 60;

class Sim {
  constructor(seed = 1) {
    this.brain = new Brain({ rng: makeRng(seed) });
    this.t = 5;
    this.ptr = { present: false, x: 800, y: 300, lastMove: -1e9, vx: 0, vy: 0, isTouch: false };
    this.typing = { focused: false, lastInput: -1e9, lastKey: -1e9, focusAt: -1e9, chars: 0 };
    this.events = [];
    this.states = [];
    this.bad = [];
    this.mover = new Mover({ seat: 'cushion' });
    this.objects = [];
    this.layout = 'wide';
    this.track = [];
    this.emitted = [];      // everything the brain asked the garden for
    this.weather = null;    // what the brain senses of the weather (tests set it)
    this.spiritLog = [];
  }
  /** Weather as the brain senses it: a kind, and whatever else the test wants to say about it. */
  setWeather(kind, extra = {}) {
    const rain = kind === 'rain' ? 1 : kind === 'sunshower' ? 0.6 : 0;
    this.weather = { kind, rain, snow: kind === 'snow' ? 1 : 0, cover: 0.5, wet: 0, white: 0, falling: rain ? kind : kind === 'snow' ? 'snow' : null, bow: null, puddles: [], ...extra };
  }
  get self() { return this.mover.state(); }
  /** Add a sparrow (it only comes when called, via sim.bird.visit). */
  withBird(seed = 3) {
    this.bird = new Birds({ rng: makeRng(seed), auto: false });
    this.birdLog = [];
    this.step();
    return this.bird;
  }
  get head() { const k = this.self; return bodyAt(k.x, k.y, k.h).head; }
  step() {
    const p = this.ptr;
    if (this.t - p.lastMove > 0.05) { p.vx *= 0.85; p.vy *= 0.85; }
    const self = this.mover.state();
    const bird = this.bird && this.bird.object();
    const extra = [this.ball && this.ball.object(), this.frog && this.frog.object(), this.spirits && this.spirits.object(self)].filter(Boolean);
    const s = {
      now: this.t,
      pointer: { ...p, speed: Math.hypot(p.vx, p.vy) },
      typing: { ...this.typing, anchor: PLAQUE },
      events: this.events.splice(0),
      self,
      body: bodyAt(self.x, self.y, self.h),
      objects: [...this.objects, ...(bird ? [bird] : []), ...extra],
      places: PLACES,
      night: false,
      layout: this.layout,
    };
    if (this.weather) s.weather = this.weather;
    const P = this.brain.update(DT, s);
    this.mover.command(P.move);
    this.mover.update(DT);
    const k = this.mover.state();
    for (const e of this.brain.emits) {
      this.emitted.push({ t: this.t, ...e });
      if (e.type === 'ballBat' && this.ball) { const d = Math.hypot(e.data.dx, e.data.dy) || 1; this.ball.kick((e.data.dx / d) * e.data.power, (e.data.dy / d) * e.data.power * 1.5, 120, 'kon'); }
    }
    if (this.ball) for (const ev of this.ball.update(DT, { pointer: s.pointer, kon: k })) this.events.push(ev);
    if (this.spirits) {
      const ctx = spiritContext({ brain: this.brain, kon: k, view: { x: 0, y: 0, w: 1600, h: 1000 }, pointer: s.pointer, now: this.t });
      for (const ev of this.spirits.update(DT, ctx)) { this.spiritLog.push({ t: this.t, ...ev }); this.events.push(ev); }
    }
    if (this.frog) for (const ev of this.frog.update(DT, { pointer: s.pointer, kon: k, wet: this.weather ? this.weather.wet : 0, raining: !!this.weather && this.weather.rain > 0.2 })) this.events.push(ev);
    if (this.bird) {
      const ctx = birdContext({ brain: this.brain, kon: k, body: bodyAt(k.x, k.y, k.h), view: { x: 0, y: 0, w: 1600, h: 1000 }, pointer: s.pointer });
      for (const ev of this.bird.update(DT, ctx)) { this.events.push(ev); this.birdLog.push({ t: this.t, ...ev }); }
    }
    if (!k.seat && !k.airborne) this.track.push({ x: k.x, y: k.y });
    for (const [k, v] of Object.entries(P)) {
      if (typeof v === 'number' && !Number.isFinite(v)) this.bad.push(`${k}=${v} @${this.t.toFixed(2)} in ${this.brain.state}`);
    }
    if (P.gaze && !(Number.isFinite(P.gaze.x) && Number.isFinite(P.gaze.y))) this.bad.push(`gaze NaN in ${this.brain.state}`);
    const st = this.brain.state;
    if (this.states[this.states.length - 1] !== st) this.states.push(st);
    this.t += DT;
    return P;
  }
  moveTo(x, y) {
    const p = this.ptr;
    if (p.present) {
      p.vx = (x - p.x) / DT;
      p.vy = (y - p.y) / DT;
    }
    if (Math.hypot(x - p.x, y - p.y) > 0.35) p.lastMove = this.t;
    p.x = x; p.y = y; p.present = true;
  }
  run(seconds, fn, after) {
    const n = Math.round(seconds / DT);
    let poses = [];
    for (let i = 0; i < n; i++) {
      if (fn) fn(i * DT, this);
      const P = this.step();
      if (after) after(P, this);
      poses.push(P);
    }
    return poses;
  }
  sweep(seconds, { cx = 800, cy = 300, ax = 430, ay = 40, w = 1.3 } = {}) {
    const t0 = this.t;
    return this.run(seconds, () => {
      const t = this.t - t0;
      this.moveTo(cx + ax * Math.sin(t * w), cy + ay * Math.sin(t * w * 1.7));
    });
  }
  still(seconds) { return this.run(seconds); }
  focus() { this.typing.focused = true; this.typing.focusAt = this.t; this.events.push({ type: 'focus' }); }
  blur() { this.typing.focused = false; this.events.push({ type: 'blur' }); }
  type(seconds, every = 0.14) {
    let next = 0;
    const t0 = this.t;
    return this.run(seconds, () => {
      if (this.t - t0 >= next) {
        this.typing.lastInput = this.t;
        this.typing.chars++;
        this.events.push({ type: 'input', del: false });
        next += every;
      }
    });
  }
  /** fly the cursor straight at Kon from a far point */
  approach(from = null, speed = 1500) {
    const h0 = this.head;
    from = from || { x: h0.x + 550, y: h0.y };
    this.moveTo(from.x, from.y);
    this.step();
    let x = from.x, y = from.y;
    for (let i = 0; i < 120; i++) {
      const H = this.head;
      const dx = H.x - x, dy = H.y - y;
      const d = Math.hypot(dx, dy);
      if (d < 30 || this.brain.state === 'STARTLED') break;
      x += (dx / d) * speed * DT;
      y += (dy / d) * speed * DT;
      this.moveTo(x, y);
      this.step();
    }
  }
  sawSince(i0, state) { return this.states.slice(i0).includes(state); }
  get history() { return this.brain.history; }
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('starts idle and stays alive without input', (sim) => {
  const poses = sim.still(5);
  const blinksOrActs = sim.history.length >= 0;
  const st = sim.brain.state;
  return { ok: st === 'IDLE' && blinksOrActs, info: `state=${st}, idle act seen=${!!sim.brain.idleAct || sim.brain.nextIdleAt < 8}` };
});

test('mouse tracking: eyes target the cursor; curiosity builds OBSERVING → PEEKING', (sim) => {
  sim.still(1);
  const labels = new Set();
  let gazeOk = 0, frames = 0, maxLean = 0;
  const t0 = sim.t;
  sim.run(3.4, () => {
    const t = sim.t - t0;
    sim.moveTo(800 + 430 * Math.sin(t * 1.3), 300 + 40 * Math.sin(t * 2.2));
  }, (P) => {
    if (sim.brain.state === 'WATCH') {
      labels.add(sim.brain.label);
      frames++;
      if (P.gaze && Math.hypot(P.gaze.x - sim.ptr.x, P.gaze.y - sim.ptr.y) < 1e-6) gazeOk++;
      maxLean = Math.max(maxLean, P.bodyFollow);
    }
  });
  const ok = labels.has('OBSERVING') && labels.has('PEEKING') && gazeOk > frames * 0.95;
  return { ok, info: `labels=${[...labels].join('→')} gaze-on-cursor=${gazeOk}/${frames} bodyFollow max=${maxLean.toFixed(2)}` };
});

test('slow vs fast movement: slow crouches (stalk), fast widens eyes', (sim) => {
  sim.still(0.5);
  sim.sweep(1.5, { w: 1.2 });
  // slow drift
  let crouch = 0;
  const t0 = sim.t;
  const x0 = sim.ptr.x;
  const slow = sim.run(1.5, () => sim.moveTo(x0 + (sim.t - t0) * 90, 300));
  for (const P of slow) crouch = Math.max(crouch, P.crouch);
  let eye = 0;
  const t1 = sim.t;
  const fast = sim.run(1.0, () => sim.moveTo(800 + 480 * Math.sin((sim.t - t1) * 5), 280));
  for (const P of fast) eye = Math.max(eye, P.eyeOpen);
  return { ok: crouch > 0.15 && eye > 1.06, info: `slow crouch=${crouch.toFixed(2)} fast eyeOpen=${eye.toFixed(2)}` };
});

test('stopping after watching → NOTICED → PRETENDING (innocence act)', (sim) => {
  sim.still(0.5);
  sim.sweep(3);
  const i0 = sim.states.length;
  sim.still(1.4);
  const ok = sim.sawSince(i0, 'NOTICED') && sim.brain.state === 'PRETENDING';
  return { ok, info: `${sim.states.slice(i0 - 1).join(' → ')} act=${sim.brain.act?.name}` };
});

test('resuming movement → cautious RESUMING → WATCH', (sim) => {
  sim.still(0.5);
  sim.sweep(3);
  sim.still(1.6);
  const i0 = sim.states.length;
  sim.sweep(3.2);
  const ok = sim.sawSince(i0, 'RESUMING') && sim.brain.state === 'WATCH';
  return { ok, info: sim.states.slice(i0 - 1).join(' → ') };
});

test('freezing again mid-resume snaps back into the act', (sim) => {
  sim.still(0.5);
  sim.sweep(3);
  sim.still(1.6);
  // move until Kon starts peeking out of the act, a moment more, then freeze
  let x = 400;
  for (let i = 0; i < 240 && sim.brain.state !== 'RESUMING'; i++) { x += 8; sim.moveTo(x, 300); sim.step(); }
  sim.run(0.2, () => { x += 8; sim.moveTo(x, 300); });
  const wasResuming = sim.brain.state === 'RESUMING';
  const i0 = sim.states.length;
  sim.still(0.6);
  const back = sim.brain.state === 'PRETENDING' && sim.brain.caption.key === 'snapback';
  return { ok: wasResuming && back, info: `resuming=${wasResuming} then ${sim.states.slice(i0 - 1).join(' → ')} caption=${sim.brain.caption.key}` };
});

test('repeated stop/start cycles vary the innocence act', (sim) => {
  sim.still(0.5);
  const acts = [];
  for (let i = 0; i < 6; i++) {
    sim.sweep(3.2);
    sim.still(1.5);
    if (sim.brain.state === 'PRETENDING') acts.push(sim.brain.act.name);
    sim.still(5); // let the act finish
  }
  let repeats = 0;
  for (let i = 1; i < acts.length; i++) if (acts[i] === acts[i - 1]) repeats++;
  return { ok: acts.length === 6 && repeats === 0 && new Set(acts).size >= 4, info: acts.join(', ') };
});

test('rapid jittery start/stop does not spam reactions', (sim) => {
  sim.still(0.5);
  const i0 = sim.states.length;
  let x = 500;
  for (let k = 0; k < 20; k++) {
    sim.run(0.18, () => { x += 6; sim.moveTo(x, 300); });
    sim.still(0.16);
  }
  const noticed = sim.states.slice(i0).filter((s) => s === 'NOTICED').length;
  return { ok: noticed === 0 && sim.bad.length === 0, info: `states=${sim.states.slice(i0).join(' → ')} noticed=${noticed}` };
});

test('cursor rushing at Kon → STARTLED, with escalating variants on repeats', (sim) => {
  sim.still(0.5);
  const variants = [];
  for (let i = 0; i < 4; i++) {
    sim.approach();
    if (sim.brain.state === 'STARTLED') variants.push(sim.brain.arg.variant);
    // retreat and wait for the reaction to finish
    sim.run(0.5, () => sim.moveTo(1350, 615));
    sim.still(4.5);
  }
  const ok = variants.join() === 'classic,cover,pout,bleh';
  return { ok, info: variants.join(' → ') };
});

test('startle does not re-trigger while the cursor stays near', (sim) => {
  sim.still(0.5);
  sim.approach();
  const i0 = sim.states.length;
  const t0 = sim.t;
  sim.run(4, () => sim.moveTo(800 + 60 * Math.sin((sim.t - t0) * 3), 560));
  const startles = sim.states.slice(i0).filter((s) => s === 'STARTLED').length;
  return { ok: startles === 0, info: sim.states.slice(i0 - 1).join(' → ') };
});

test('input focus: Kon notices and leans toward the plaque', (sim) => {
  sim.still(1);
  sim.focus();
  const poses = sim.still(2.5);
  const P = poses[poses.length - 1];
  const ok = sim.brain.state === 'WATCH' && sim.brain.attn.src === 'typing' && P.gaze && P.gaze.x === PLAQUE.x && P.bodyFollow > 0.2;
  return { ok, info: `state=${sim.brain.state} attn=${sim.brain.attn.src} bodyFollow=${P.bodyFollow.toFixed(2)}` };
});

test('typing → peeks; typing stops → NOTICED → PRETENDING; resumes → RESUMING → WATCH', (sim) => {
  sim.still(0.5);
  sim.focus();
  sim.still(0.4);
  let peak = 0;
  for (const P of sim.type(3)) peak = Math.max(peak, P.bodyFollow);
  const i0 = sim.states.length;
  sim.still(1.8);
  const pretended = sim.sawSince(i0, 'NOTICED') && sim.brain.state === 'PRETENDING';
  const i1 = sim.states.length;
  sim.type(3);
  const resumed = sim.sawSince(i1, 'RESUMING') && sim.brain.state === 'WATCH';
  return { ok: pretended && resumed && peak > 0.6, info: `lean peak=${peak.toFixed(2)} stop: ${sim.states.slice(i0 - 1, i1).join(' → ')} | resume: ${sim.states.slice(i1 - 1).join(' → ')}` };
});

test('independent sources: typing pause while the mouse moves does not fake innocence', (sim) => {
  sim.still(0.5);
  sim.focus();
  sim.type(2.5);
  const i0 = sim.states.length;
  sim.sweep(2.5);   // typing stopped, mouse keeps moving
  const noticed = sim.sawSince(i0, 'NOTICED');
  const attn = sim.brain.attn.src;
  return { ok: !noticed && attn === 'pointer' && sim.brain.state === 'WATCH', info: `attention moved to ${attn}; states: ${sim.states.slice(i0 - 1).join(' → ')}` };
});

test('independent sources: mouse stops while typing continues → keeps reading, no innocence', (sim) => {
  sim.still(0.5);
  sim.focus();
  sim.sweep(2);
  const i0 = sim.states.length;
  let glances = 0, last = null;
  const poses = sim.type(3);
  const noticed = sim.sawSince(i0, 'NOTICED');
  return { ok: !noticed && sim.brain.attn.src === 'typing' && sim.brain.state === 'WATCH', info: `attention=${sim.brain.attn.src} states: ${sim.states.slice(i0 - 1).join(' → ')}` };
});

test('both at once: typing with a moving mouse gives brief glances, not flicker', (sim) => {
  sim.still(0.5);
  sim.focus();
  let switches = 0, prev = null, toPtr = 0;
  const t0 = sim.t;
  let next = 0;
  const poses = sim.run(5, () => {
    const t = sim.t - t0;
    sim.moveTo(800 + 400 * Math.sin(t * 1.4), 320);
    if (t >= next) { sim.typing.lastInput = sim.t; sim.events.push({ type: 'input' }); next += 0.15; }
  });
  for (const P of poses) {
    const onPtr = P.gaze && Math.abs(P.gaze.x - PLAQUE.x) > 1;
    if (prev !== null && onPtr !== prev) switches++;
    if (onPtr) toPtr++;
    prev = onPtr;
  }
  // glances are short: most of the time Kon reads the plaque, switching a handful of times
  return { ok: switches >= 2 && switches <= 12 && toPtr < poses.length * 0.45, info: `gaze switches=${switches} pointer-share=${(toPtr / poses.length).toFixed(2)} state=${sim.brain.state}` };
});

test('repeated focus/blur recovers cleanly', (sim) => {
  sim.still(0.5);
  for (let i = 0; i < 6; i++) {
    sim.focus();
    sim.type(0.6);
    sim.blur();
    sim.still(0.4);
  }
  sim.still(4);
  return { ok: sim.bad.length === 0 && ['IDLE', 'RELAXING', 'PRETENDING', 'WATCH'].includes(sim.brain.state), info: `end state=${sim.brain.state}; path ${sim.states.slice(-6).join(' → ')}` };
});

test('long quiet → ZAZEN → SATORI → DROWSY → SLEEPING; movement → WAKING', (sim) => {
  sim.still(75);
  const path = ['ZAZEN', 'SATORI', 'DROWSY'].every((st) => sim.states.includes(st));
  const slept = path && sim.brain.state === 'SLEEPING';
  const i0 = sim.states.length;
  sim.sweep(1.5);
  const woke = sim.sawSince(i0, 'WAKING');
  return { ok: slept && woke, info: `${sim.states.join(' → ')}` };
});

test('fast circles around Kon → DIZZY', (sim) => {
  sim.still(0.5);
  const t0 = sim.t;
  sim.run(3, () => {
    const a = (sim.t - t0) * 8;
    sim.moveTo(800 + Math.cos(a) * 260, 615 + Math.sin(a) * 260);
  });
  return { ok: sim.states.includes('DIZZY'), info: sim.states.join(' → ') };
});

test('rubbing over the head → PETTED, then "that did not happen"', (sim) => {
  sim.still(0.5);
  sim.approach();      // the first approach startles (disarms)
  sim.still(4);
  const t0 = sim.t;
  sim.run(2.5, () => sim.moveTo(800 + Math.sin((sim.t - t0) * 9) * 40, 590));
  const petted = sim.states.includes('PETTED');
  sim.run(0.3, () => sim.moveTo(1300, 300));
  sim.still(1.5);
  return { ok: petted && sim.brain.caption.key === 'pettedAfter', info: `${sim.states.slice(-5).join(' → ')} caption=${sim.brain.caption.key}` };
});

test('boop on the nose → BOOPED → recovers', (sim) => {
  sim.still(1);
  sim.events.push({ type: 'boop' });
  sim.still(0.2);
  const booped = sim.brain.state === 'BOOPED';
  sim.still(4);
  return { ok: booped && ['IDLE', 'RELAXING'].includes(sim.brain.state), info: sim.states.join(' → ') };
});

test('submitting a wish → ADMIRE → pretends it did not read it', (sim) => {
  sim.focus();
  sim.type(1.2);
  sim.events.push({ type: 'submit' });
  sim.still(0.2);
  const admired = sim.brain.state === 'ADMIRE';
  sim.still(3.6);
  return { ok: admired && sim.brain.state === 'PRETENDING' && sim.brain.caption.key === 'admireAfter', info: sim.states.join(' → ') };
});

test('no NaN or broken targets anywhere in a long random session', (sim) => {
  const rng = makeRng(99);
  for (let k = 0; k < 60; k++) {
    const r = rng();
    if (r < 0.35) sim.sweep(0.5 + rng() * 2, { w: 0.5 + rng() * 4, ax: 200 + rng() * 400 });
    else if (r < 0.5) sim.approach();
    else if (r < 0.6) { sim.focus(); sim.type(rng() * 2); }
    else if (r < 0.65) sim.blur();
    else if (r < 0.7) sim.events.push({ type: rng() < 0.5 ? 'boop' : 'pat' });
    else if (r < 0.74) sim.events.push({ type: 'clack', x: 630, y: 890 });
    else sim.still(rng() * 3);
  }
  return { ok: sim.bad.length === 0, info: `${sim.bad.length} bad values; visited ${new Set(sim.states).size} states: ${[...new Set(sim.states)].join(', ')}` };
});

// ---------------------------------------------------------------- stillness
const stillUntil = (sim, pred, max = 60) => {
  for (let i = 0; i < max * 60 && !pred(); i++) sim.step();
};

test('perfect stillness → ZAZEN (with a temptation) → the ensō paints → SATORI', (sim) => {
  sim.still(1);
  let maxPaint = 0, tempted = null;
  stillUntil(sim, () => sim.brain.state === 'SATORI', 45);
  for (const h of sim.history) if (h.to === 'ZAZEN') tempted = true;
  const z = sim.brain.zen;
  maxPaint = z ? z.paint : 0;
  const temptName = z && z.tempt ? z.tempt.name : null;
  const ok = sim.states.join() === 'IDLE,ZAZEN,SATORI' && maxPaint >= 1 && sim.brain.satoriCount === 1 && !!temptName;
  return { ok, info: `${sim.states.join(' → ')} temptation=${temptName} paint=${maxPaint.toFixed(2)} satori=${sim.brain.satoriCount} at ${sim.t.toFixed(1)}s` };
});

test('flinching at the temptation → GOTCHA (Kon wins)', (sim) => {
  sim.still(1);
  stillUntil(sim, () => sim.brain.state === 'ZAZEN' && sim.brain.zen.tempt && sim.brain.stateT > sim.brain.zen.temptAt + 0.8, 20);
  const tempting = sim.brain.zen.tempt.name;
  sim.sweep(0.4);
  return { ok: sim.states.includes('GOTCHA'), info: `tempted with ${tempting}; ${sim.states.join(' → ')}` };
});

test('moving while the ensō paints breaks it; staying still again restarts it', (sim) => {
  sim.still(1);
  stillUntil(sim, () => sim.brain.zen && sim.brain.zen.paint > 0.3, 30);
  const paint = sim.brain.zen.paint;
  sim.sweep(0.5);
  const broke = sim.brain.state === 'WATCH' && sim.brain.caption.key === 'zazenBroken';
  stillUntil(sim, () => sim.brain.state === 'ZAZEN', 25);
  const again = sim.brain.state === 'ZAZEN';
  return { ok: broke && again, info: `broke at ${(paint * 100).toFixed(0)}% → ${broke ? 'WATCH/zazenBroken' : sim.brain.state}; staying still again: ${sim.brain.state}` };
});

test('a tiny jitter (a few pixels) does not break meditation', (sim) => {
  sim.moveTo(500, 300);
  sim.still(1);
  stillUntil(sim, () => sim.brain.zen && sim.brain.zen.paint > 0.2, 30);
  sim.run(0.2, (t) => sim.moveTo(500 + (t > 0.1 ? 2 : 0), 300));
  sim.still(0.5);
  return { ok: sim.brain.state === 'ZAZEN', info: `state after a 2-unit nudge: ${sim.brain.state}` };
});

test('focusing the plaque breaks meditation', (sim) => {
  sim.still(1);
  stillUntil(sim, () => sim.brain.zen && sim.brain.zen.paint > 0.1, 30);
  sim.focus();
  sim.still(0.3);
  return { ok: sim.brain.state === 'WATCH', info: `state=${sim.brain.state} attn=${sim.brain.attn.src}` };
});

test('after satori Kon rests instead of meditating again right away', (sim) => {
  sim.still(1);
  stillUntil(sim, () => sim.brain.state === 'SATORI', 45);
  sim.still(12);
  const zazens = sim.states.filter((x) => x === 'ZAZEN').length;
  return { ok: zazens === 1 && sim.brain.state !== 'ZAZEN', info: sim.states.join(' → ') };
});

// ---------------------------------------------------------------- sand
const circle = (n, r, wobble = 0, turns = 1, cx = 900, cy = 950) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * TAU * turns;
    const rr = r * (1 + wobble * Math.sin(a * 3 + 1)) * (turns > 1.5 ? 0.35 + 0.65 * (i / n) : 1);
    return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr };
  });

test('stroke analysis: round circle scores high, wobbly lower, line nothing, spiral spiral', () => {
  const round = analyzeStroke(circle(80, 90));
  const wobbly = analyzeStroke(circle(80, 90, 0.18));
  const line = analyzeStroke(Array.from({ length: 60 }, (_, i) => ({ x: 600 + i * 8, y: 900 + Math.sin(i / 5) * 6 })));
  const spiral = analyzeStroke(circle(200, 120, 0, 3.2));
  // a circle raked "on the ground" looks like a flattened oval — still a circle
  const oval = analyzeStroke(circle(80, 90).map((p) => ({ x: p.x, y: 950 + (p.y - 950) * 0.55 })));
  const ok = round?.shape === 'circle' && round.score >= 9 && wobbly?.shape === 'circle' && wobbly.score < round.score &&
    oval?.shape === 'circle' && oval.score >= 9 && line === null && spiral?.shape === 'spiral';
  return { ok, info: `round=${round?.score} oval=${oval?.score} wobbly=${wobbly?.score} line=${line} spiral=${spiral?.shape}` };
});

test('a raked circle → JUDGE holding up a score card; a spiral → DIZZY', (sim) => {
  sim.still(1);
  sim.events.push({ type: 'rakeStart', x: 900, y: 900 });
  sim.still(0.1);
  sim.events.push({ type: 'rakeEnd', shape: 'circle', score: 7, x: 900, y: 950, r: 80 });
  let sign = null;
  sim.run(7, null, (P) => { if (P.sign !== null) sign = P.sign; });
  const judged = sim.states.includes('JUDGE') && sign === 7;
  sim.still(3);
  sim.events.push({ type: 'rakeEnd', shape: 'spiral', x: 900, y: 950 });
  sim.still(0.2);
  return { ok: judged && sim.brain.state === 'DIZZY' && sim.brain.caption.key === 'spiral', info: `card=${sign}; ${sim.states.join(' → ')}` };
});

test('raking breaks meditation', (sim) => {
  sim.still(1);
  stillUntil(sim, () => sim.brain.zen && sim.brain.zen.paint > 0.1, 30);
  sim.events.push({ type: 'rakeStart', x: 900, y: 900 });
  sim.still(0.1);
  return { ok: sim.brain.state !== 'ZAZEN', info: `state=${sim.brain.state}` };
});

// ---------------------------------------------------------------- memory
test('a returning visitor is greeted (and shown the doodle after a long absence)', (sim) => {
  sim.events.push({ type: 'arrive', visits: 3, awayHours: 5, doodle: true });
  const seen = [];
  sim.run(6, null, () => {
    const a = sim.brain.idleAct;
    if (a && seen[seen.length - 1] !== a.name) seen.push(a.name);
  });
  const ok = seen[0] === 'greetWave' && seen.includes('doodleProud');
  return { ok, info: `idle acts: ${seen.join(', ')}; caption key=${sim.brain.caption.key}` };
});

// ---------------------------------------------------------------- a body in the world
const away = (sim) => Math.hypot(sim.self.x - 800, sim.self.y - 826);

test('left alone, Kon gets up and goes somewhere (then home to meditate)', (sim) => {
  let maxAway = 0, visited = new Set();
  sim.run(40, null, () => {
    maxAway = Math.max(maxAway, away(sim));
    const a = sim.brain.life.act;
    if (a && a.phase === 'do') visited.add(a.id);
  });
  const zenSeat = sim.brain.history.find((h) => h.to === 'ZAZEN') ? 'cushion' : '?';
  const ok = maxAway > 70 && visited.size >= 1 && sim.states.includes('ZAZEN');
  return { ok, info: `went ${maxAway.toFixed(0)} units from the cushion; did: ${[...visited].join(', ') || 'nothing'}; states: ${sim.states.join(' → ')}` };
});

test('walking never passes through scenery', (sim) => {
  const m = new Mover({ seat: null, x: POIS.basin.stand.x, y: POIS.basin.stand.y });
  const legs = [POIS.rack.stand, POIS.snail.stand, POIS.shishi.stand, POIS.maple.stand, POIS.flower.stand, POIS.basin.stand];
  let bad = 0, frames = 0, reached = 0;
  for (const goal of legs) {
    for (let i = 0; i < 60 * 25; i++) {
      m.command({ to: goal, gait: 'walk' });
      m.update(DT);
      frames++;
      if (!isFree(m.state(), null)) bad++;
      if (m.state().arrived && Math.hypot(m.x - goal.x, m.y - goal.y) < 10) { reached++; break; }
    }
  }
  return { ok: bad === 0 && reached === legs.length, info: `reached ${reached}/${legs.length} spots in ${(frames / 60).toFixed(1)} s; frames inside an obstacle: ${bad}` };
});

test('hops down from the cushion to walk, and back up to sit', (sim) => {
  const m = new Mover({ seat: 'cushion' });
  const kinds = [];
  for (let i = 0; i < 60 * 12; i++) {
    m.command({ to: { x: 1000, y: 930 }, gait: 'walk' });
    for (const ev of m.update(DT)) if (ev.type === 'takeoff') kinds.push(ev.kind);
  }
  const walked = !m.seat && Math.hypot(m.x - 1000, m.y - 930) < 12;
  for (let i = 0; i < 60 * 12; i++) {
    m.command({ seat: 'cushion' });
    for (const ev of m.update(DT)) if (ev.type === 'takeoff') kinds.push(ev.kind);
  }
  return { ok: walked && m.seat === 'cushion' && kinds.join() === 'hopDown,hopUp', info: `jumps: ${kinds.join(', ')}; seat=${m.seat}` };
});

test('momentum: Kon speeds up and slows down instead of jumping to full speed', (sim) => {
  const m = new Mover({ seat: null, x: 300, y: 900 });
  const speeds = [];
  for (let i = 0; i < 60 * 10; i++) {
    m.command({ to: { x: 1000, y: 900 }, gait: 'walk' });
    m.update(DT);
    speeds.push(m.state().speed);
  }
  const first = speeds[2], peak = Math.max(...speeds), last = speeds[speeds.length - 1];
  return { ok: first < peak * 0.3 && peak > 80 && last < 5, info: `speed after 3 frames ${first.toFixed(0)}, peak ${peak.toFixed(0)}, at the end ${last.toFixed(1)}` };
});

test('typing → Kon walks over to the plaque to read', (sim) => {
  sim.still(0.5);
  sim.focus();
  sim.type(7);
  const d = Math.hypot(sim.self.x - POIS.rack.stand.x, sim.self.y - POIS.rack.stand.y);
  return { ok: d < 25 && sim.brain.attn.src === 'typing', info: `${d.toFixed(0)} units from the reading spot; state=${sim.brain.state}` };
});

test('slow cursor on the sand → Kon stalks it; cursor stops → POUNCE → nothing there → pretends', (sim) => {
  sim.still(0.5);
  // creep the cursor slowly across the sand in front of Kon
  let x = 1100;
  sim.run(3.2, () => { x -= 1.1; sim.moveTo(x, 905); });
  const stalked = sim.brain.stalkT > 0.9;
  sim.still(4.5);
  const ok = stalked && sim.states.includes('POUNCE') && sim.brain.state === 'PRETENDING' && sim.brain.caption.key === 'pounceMiss';
  return { ok, info: `stalked=${stalked}; ${sim.states.join(' → ')}; caption=${sim.brain.caption.key}` };
});

test('a leaf lands on the sand → Kon trots over and pounces on it', (sim) => {
  sim.still(3);
  sim.objects = [{ id: 'leafA', kind: 'leafGround', x: 1000, y: 920, sal: 0.05 }];
  let scattered = false;
  sim.run(10, null, () => { for (const e of sim.brain.emits) if (e.type === 'scatterLeaf') scattered = true; });
  return { ok: sim.states.includes('POUNCE') && scattered, info: `${sim.states.join(' → ')}; leaf scattered=${scattered}` };
});

test('a raked circle → Kon walks over before judging it', (sim) => {
  sim.still(1);
  sim.events.push({ type: 'rakeEnd', shape: 'circle', score: 8, x: 1000, y: 930, r: 70 });
  let maxAway = 0, sign = null;
  sim.run(9, null, (P) => { maxAway = Math.max(maxAway, away(sim)); if (P.sign !== null) sign = P.sign; });
  return { ok: maxAway > 80 && sign === 8, info: `walked ${maxAway.toFixed(0)} units; card=${sign}; ${sim.states.join(' → ')}` };
});

// ---------------------------------------------------------------- living and resting together
const awayAt = (sim, poi, act) => {
  sim.mover = new Mover({ seat: null, x: POIS[poi].stand.x, y: POIS[poi].stand.y });
  sim.brain.life.restUntil = 0;
  sim.brain.life.act = { id: poi, def: { act }, phase: 'do', t: 0, dur: 5, run: sim.brain.makeAct ? null : null };
};

test('being still while Kon is busy elsewhere: Kon finishes, walks home, then meditates', (sim) => {
  sim.still(0.1);
  awayAt(sim, 'basin', null);
  let zazenSeat = null;
  sim.run(60, null, () => { if (sim.brain.state === 'ZAZEN' && zazenSeat === null) zazenSeat = sim.self.seat; });
  const homeGoing = sim.brain.history.findIndex((h) => h.to === 'ZAZEN');
  return { ok: zazenSeat === 'cushion', info: `meditation began on: ${zazenSeat}; ${sim.states.join(' → ')}` };
});

test('getting sleepy away from home: Kon walks home before dozing off', (sim) => {
  sim.still(0.1);
  sim.brain.zenArmed = false; // already meditated today
  awayAt(sim, 'shishi', null);
  let drowsySeat = null;
  sim.run(70, null, () => { if (sim.brain.state === 'DROWSY' && drowsySeat === null) drowsySeat = sim.self.seat; });
  return { ok: drowsySeat === 'cushion', info: `dozed off on: ${drowsySeat}; ${sim.states.join(' → ')}` };
});

test('a click counts as activity (meditation waits)', (sim) => {
  sim.still(5);
  sim.events.push({ type: 'down', x: 300, y: 300 });
  sim.still(5);
  return { ok: !sim.states.includes('ZAZEN') && sim.brain.idleFor < 6, info: `idleFor=${sim.brain.idleFor.toFixed(1)}; ${sim.states.join(' → ')}` };
});

test('a leaf that lands out of reach is ignored', (sim) => {
  sim.still(3);
  sim.objects = [{ id: 'far', kind: 'leafGround', x: 1420, y: 900, sal: 0.05 }];
  sim.still(6);
  return { ok: !sim.states.includes('POUNCE'), info: sim.states.join(' → ') };
});

test('an important line is not talked over right away', (sim) => {
  sim.still(1);
  sim.events.push({ type: 'night', on: true });
  sim.sweep(1.5);
  const key = sim.brain.caption.key;
  return { ok: key === 'night', info: `caption after 1.5 s of watching: ${key}` };
});

// ---------------------------------------------------------------- Kon's voice
test('the narrator and Kon never say the same line for a moment', () => {
  const alias = { lifeRack: 'readPlaques', classic: 'startled', cover: 'startled', pout: 'startled', bleh: 'startled', admireAfter: 'typingStop' };
  const clashes = [];
  for (const [key, lines] of Object.entries(CAPTIONS)) {
    const v = VOICE[alias[key] || key];
    if (!v) continue;
    for (const l of lines) if (v.lines.some((x) => x.toLowerCase().replace(/[!.…?]/g, '') === l.toLowerCase().replace(/[!.…?]/g, ''))) clashes.push(`${key}: "${l}"`);
  }
  return { ok: clashes.length === 0, info: clashes.join('; ') || 'no shared lines' };
});

test('Kon speaks at key moments, one bubble at a time (urgent reactions may interrupt)', (sim) => {
  const urgent = new Set(['startled', 'gotcha', 'sneeze', 'booped', 'satoriEnd', 'pounceMiss', 'typingWalk', 'typingStop']);
  const said = [];
  let last = -1;
  const watch = () => { const v = sim.brain.voice; if (v.at !== last) { last = v.at; said.push({ ...v }); } };
  sim.run(1, null, watch);
  sim.run(3.2, () => sim.moveTo(800 + 430 * Math.sin(sim.t * 1.3), 300), watch);
  sim.run(2, null, watch);
  sim.approach();
  sim.run(3, null, watch);
  sim.events.push({ type: 'boop' });
  sim.run(3, null, watch);
  let piled = 0;
  for (let i = 1; i < said.length; i++) {
    if (said[i].at - said[i - 1].at < said[i - 1].dur && !urgent.has(said[i].key)) piled++;
  }
  const keys = said.map((v) => v.key);
  return { ok: said.length >= 3 && piled === 0 && keys.includes('startled'), info: `said: ${said.map((v) => `${v.key}"${v.text}"`).join(', ')}; piled up: ${piled}` };
});

// ------------------------------------------------------------------ the sparrow
const fled = (sim) => sim.birdLog.filter((e) => e.type === 'birdFlee').map((e) => e.reason);
const untilPerched = (sim, max = 6) => { for (let i = 0; i < max * 60 && sim.bird.state !== 'perched'; i++) sim.step(); };

test('sparrow: a still cursor far away is fine; a fast one close by sends it off, away from the cursor', (sim) => {
  const b = sim.withBird();
  sim.brain.zenArmed = false;
  b.visit('lantern');
  untilPerched(sim);
  sim.moveTo(900, 300);
  sim.run(3);
  const stayed = b.state === 'perched';
  // swoop in from the right
  sim.run(0.5, (t) => sim.moveTo(900 - t * 1100, 420 + t * 160));
  const reasons = fled(sim);
  const dir = b.dir;
  return { ok: stayed && reasons[0] === 'cursor' && dir < 0, info: `stayed while still: ${stayed}; fled: ${reasons.join(',') || 'no'}; flew ${dir < 0 ? 'left (away)' : 'right (toward)'}` };
});

test('sparrow: lands on Kon only during deep meditation, and leaves the moment Kon stirs', (sim) => {
  const b = sim.withBird();
  b.visit('kon');
  const refused = b.perch && b.perch.id !== 'kon';   // Kon is not meditating: picks somewhere else
  sim.run(8);
  sim.bird.fly('test');
  sim.run(3);
  for (let i = 0; i < 40 * 60 && !sim.brain.isStill(); i++) sim.step();
  const still = sim.brain.isStill();
  sim.bird.nextVisit = 0;
  b.visit('kon');
  untilPerched(sim);
  const onHead = b.state === 'perched' && b.perch.id === 'kon';
  const head = sim.brain.s.body.crown;
  const sitting = onHead && Math.hypot(b.x - head.x, b.y - head.y) < 2;
  const stayedState = sim.brain.state;
  sim.run(3);
  const stillThere = b.state === 'perched';
  // the visitor moves: meditation breaks, Kon stirs, the bird is gone
  sim.sweep(1.2);
  const gone = b.state !== 'perched';
  return { ok: refused && still && onHead && sitting && stillThere && stayedState === 'ZAZEN' && gone && fled(sim).includes('kon stirred'),
    info: `awake Kon refused: ${refused}; meditating: ${still}; on head: ${onHead} (on the crown: ${sitting}); stayed 3 s: ${stillThere}; fled when Kon stirred: ${gone}` };
});

test('Kon stalks a sparrow on the sand and pounces; the sparrow always gets away', (sim) => {
  const outcomes = [];
  for (const [seed, spot] of [[3, { x: 420, y: 960 }], [4, { x: 1130, y: 955 }], [5, { x: 330, y: 930 }], [6, { x: 520, y: 965 }]]) {
    const s2 = new Sim(seed);
    const b = s2.withBird(seed);
    s2.brain.zenArmed = false;
    b.visit('sand', spot);
    let sneaked = 0, pounced = false, caught = false, crouch = 0;
    s2.run(18, null, (P, sm) => {
      const a = sm.brain.life.act;
      if (a && a.id === 'bird' && sm.self.moving && sm.self.gait === 'sneak') { sneaked += DT; crouch = Math.max(crouch, P.crouch); }
      if (sm.brain.state === 'POUNCE') pounced = true;
      if (sm.brain.state === 'POUNCE' && sm.brain.arg.phase === 'land' && b.state === 'perched') caught = true;
    });
    outcomes.push({ sneaked, pounced, caught, crouch, fled: fled(s2), bad: s2.bad.length });
  }
  const pounces = outcomes.filter((o) => o.pounced).length;
  const ok = pounces >= 3 && outcomes.every((o) => !o.caught && o.fled.length && !o.bad) && outcomes.filter((o) => o.pounced).every((o) => o.sneaked > 0.8 && o.crouch > 0.3);
  return { ok, info: outcomes.map((o) => `${o.pounced ? 'pounced' : 'no pounce'} after ${o.sneaked.toFixed(1)} s creeping (crouch ${o.crouch.toFixed(2)}), bird: ${o.fled.join(',')}`).join(' | ') };
});

test('Kon watches a bird out of reach from below (no pounce), and leaves it alone while you type', (sim) => {
  const runs = [];
  for (const [seed, perch, at] of [[7, 'rack', { x: 1262, y: 838 }], [8, 'lantern', { x: 351, y: 810 }], [9, 'rack', { x: 1262, y: 838 }], [10, 'lantern', { x: 351, y: 810 }]]) {
    const s1 = new Sim(seed);
    const b = s1.withBird(seed);
    s1.brain.zenArmed = false;
    b.visit(perch);
    const r = { watched: false, pounced: false, chatter: 0, dist: 0 };
    s1.run(14, null, (P, sm) => {
      const a = sm.brain.life.act;
      if (a && a.id === 'bird' && a.phase === 'do') { r.watched = true; r.chatter = Math.max(r.chatter, P.mouthOpen); r.dist = Math.hypot(sm.self.x - at.x, sm.self.y - at.y); }
      if (sm.brain.state === 'POUNCE') r.pounced = true;
    });
    runs.push(r);
  }
  const watchers = runs.filter((r) => r.watched);
  const watched = watchers.length >= 2;
  const pounced = runs.some((r) => r.pounced);
  const chatter = Math.min(...watchers.map((r) => r.chatter));
  const dist = Math.max(...watchers.map((r) => r.dist));
  // now someone is typing: the bird is not more interesting than that
  const s2 = new Sim(9);
  const b2 = s2.withBird(9);
  s2.typing.focused = true;
  s2.typing.focusAt = s2.t;
  b2.visit('sand', { x: 420, y: 960 });
  let chased = false;
  s2.run(8, (t, sm) => { if (Math.floor(t * 7) !== Math.floor((t - DT) * 7)) { sm.typing.lastInput = sm.t; sm.typing.chars++; } }, (P, sm) => {
    const a = sm.brain.life.act;
    if ((a && a.id === 'bird') || sm.brain.state === 'POUNCE') chased = true;
  });
  return { ok: watched && !pounced && chatter > 0.1 && dist < 420 && !chased, info: `watched in ${watchers.length}/4 visits, from ≤ ${dist.toFixed(0)} px, chattering ≥ ${chatter.toFixed(2)}, pounced: ${pounced}; chased while typing: ${chased}` };
});


// ---------------------------------------------------------------- the sky, the clock and small wonders
test('the sky has a sensible palette at every hour (sun by day, moon and stars by night)', () => {
  const bad = [];
  for (let h = 0; h < 24; h += 0.05) {
    const p = paletteAt(h);
    const nums = [...p.sky.flat(), ...p.ridge.flat(), ...p.amb, ...p.ambSun, p.vig, p.stars, p.rays, p.lamp, p.dapple, p.lift, p.sun.y, p.moon.y];
    if (nums.some((v) => !Number.isFinite(v) || v < -1000 || v > 1000)) bad.push(`${h.toFixed(2)}: not finite`);
    const night = isNightHour(h);
    if (night && p.stars < 0.5 && h > 19.6) bad.push(`${h.toFixed(2)}: night without stars`);
    if (!night && h > 8 && h < 15 && (p.stars > 0.01 || p.lamp > 0.01)) bad.push(`${h.toFixed(2)}: daytime stars or lamp`);
    if (h > 7 && h < 18 && !p.sun.up) bad.push(`${h.toFixed(2)}: no sun`);
    if ((h > 20 || h < 5) && !p.moon.up) bad.push(`${h.toFixed(2)}: no moon`);
  }
  return { ok: bad.length === 0, info: bad.slice(0, 4).join('; ') || 'checked 480 moments of the day' };
});

test('the lantern time-lapse lingers through golden hour and sunset, and can run back', () => {
  const root = { style: { setProperty() {} } };
  const sky = new Sky({ root, hour: 12 });
  sky.lapseTo(22.6, 8);
  let t = 0, colorful = 0, prev = sky.hour, backwards = 0;
  while (sky.lapsing && t < 20) {
    sky.update(1 / 60);
    t += 1 / 60;
    if (sky.hour >= 16.4 && sky.hour <= 19.8) colorful += 1 / 60;
    if (sky.hour < prev - 1e-6 && prev - sky.hour < 12) backwards++;
    prev = sky.hour;
  }
  const end = sky.hour;
  // halfway into a lapse to morning, the lantern is clicked again: it rewinds
  sky.lapseTo(7.9, 6);
  for (let i = 0; i < 120; i++) sky.update(1 / 60);
  const mid = sky.hour;
  sky.lapseTo(end, 2, { back: true });
  while (sky.lapsing) sky.update(1 / 60);
  // those hours are a third of the span; they should get clearly more than a third of the time
  const share = colorful / t, hoursShare = (19.8 - 16.4) / 10.6;
  const ok = Math.abs(t - 8) < 0.1 && Math.abs(end - 22.6) < 0.01 && share > hoursShare * 1.3 && backwards === 0 && Math.abs(sky.hour - end) < 0.01 && mid !== end;
  return { ok, info: `lapse ${t.toFixed(2)} s; golden hour to dusk is ${(100 * hoursShare).toFixed(0)}% of the hours and ${(100 * share).toFixed(0)}% of the time; ends at ${end.toFixed(2)}; rewound to ${sky.hour.toFixed(2)}` };
});

/** Kon resting on the cushion, with nothing planned. */
const resting = (sim) => {
  sim.still(1);
  sim.brain.zenArmed = false;
  sim.brain.life.restUntil = 1e9;
  sim.still(1);
  return sim.brain.state === 'IDLE' && !sim.brain.life.act;
};

test('a gust: resting Kon turns into the wind and enjoys it; a sleeping Kon sleeps on', () => {
  let enjoyed = 0, tries = 0;
  for (const seed of [2, 5, 8, 13, 21, 34]) {
    const sim = new Sim(seed);
    if (!resting(sim)) continue;
    tries++;
    sim.events.push({ type: 'gust', k: 1 });
    sim.still(0.5);
    if (sim.brain.idleAct && sim.brain.idleAct.name === 'breeze' && sim.brain.caption.key === 'breeze') enjoyed++;
  }
  const s2 = new Sim(3);
  s2.still(1);
  s2.brain.go('SLEEPING');
  s2.still(0.5);
  s2.events.push({ type: 'gust', k: 1.2 });
  s2.still(2);
  return { ok: tries >= 4 && enjoyed >= 2 && enjoyed < tries + 1 && s2.brain.state === 'SLEEPING', info: `enjoyed the breeze ${enjoyed}/${tries} times; asleep through a gust: ${s2.brain.state === 'SLEEPING'}` };
});

test('a shooting star: Kon makes a wish (but not in the middle of real meditation)', (sim) => {
  resting(sim);
  sim.events.push({ type: 'meteor', x: 1000, y: 250 });
  let wished = false, lookedUp = false;
  sim.run(3, null, (P) => {
    if (sim.brain.idleAct && sim.brain.idleAct.name === 'wishStar') wished = true;
    if (P.gaze && P.gaze.y < 400) lookedUp = true;
  });
  const s2 = new Sim(7);
  s2.still(1);
  s2.brain.go('ZAZEN');
  s2.still(0.5);
  s2.events.push({ type: 'meteor', x: 1000, y: 250 });
  s2.still(1);
  return { ok: wished && lookedUp && sim.brain.caption.key === 'meteor' && s2.brain.state === 'ZAZEN', info: `wished=${wished} looked up=${lookedUp}; zazen undisturbed: ${s2.brain.state}` };
});

test('a firefly on the nose: a long cross-eyed stare, then a sneeze that sends it off', (sim) => {
  resting(sim);
  sim.events.push({ type: 'fireflyNose' });
  let stared = 0, sneezed = -1, sentOff = false;
  sim.run(4.5, null, (P) => {
    const nose = sim.brain.s.body.nose;
    if (sim.brain.state === 'BOOPED' && P.gaze && Math.hypot(P.gaze.x - nose.x, P.gaze.y - nose.y) < 20) stared += DT;
    for (const e of sim.brain.emits) {
      if (e.type === 'fireflyGo') sentOff = true;
      if (e.type === 'sfx' && e.data === 'sneeze' && sneezed < 0) sneezed = sim.t;
    }
  });
  return { ok: stared > 1.5 && sneezed > 0 && sentOff, info: `stared at its nose for ${stared.toFixed(1)} s; sneezed: ${sneezed > 0}; firefly sent off: ${sentOff}` };
});

test('a leaf on the head: Kon looks up at it, then blows it away', (sim) => {
  resting(sim);
  sim.events.push({ type: 'leafOnHead' });
  let up = false, blew = false;
  sim.run(3.5, null, (P) => {
    if (P.gaze && P.gaze.y < sim.brain.s.body.head.y - 40) up = true;
    for (const e of sim.brain.emits) if (e.type === 'blowLeaf') blew = true;
  });
  return { ok: up && blew && sim.brain.caption.key === 'leafHat', info: `looked up=${up} blew=${blew} caption=${sim.brain.caption.key}` };
});

test('the moon rabbit and the lantern time-lapse each get a reaction', (sim) => {
  resting(sim);
  sim.events.push({ type: 'moonPoke', x: 640, y: 280 });
  let waved = false;
  sim.run(2, null, () => { if (sim.brain.idleAct && sim.brain.idleAct.name === 'moonWave') waved = true; });
  const moonKey = sim.brain.caption.key;
  sim.still(4);
  sim.events.push({ type: 'lapse', to: 'night', x: 1300, y: 330 });
  sim.still(0.4);
  const lapseKey = sim.brain.caption.key;
  const looking = sim.brain.flash && sim.brain.flash.x === 1300;
  return { ok: waved && moonKey === 'moonRabbit' && lapseKey === 'lapseNight' && looking, info: `waved=${waved} captions: ${moonKey}, ${lapseKey}; watching the sky=${!!looking}` };
});

// ---------------------------------------------------------------- weather, and the garden's other residents
test('weather: clouds gather, it rains, puddles fill, and it clears with a rainbow', () => {
  const w = new Weather({ rng: makeRng(3), auto: false });
  const log = [];
  const run = (secs, ctx = { night: false, sunUp: true }) => { for (let i = 0; i < secs * 30; i++) for (const e of w.update(1 / 30, ctx)) log.push(e.type + (e.kind ? ':' + e.kind : '')); };
  run(20);
  const quiet = log.length === 0 && w.rain === 0 && w.cover < 0.2;
  w.set('cloudy', 15, [['rain', 60], ['cloudy', 10]]);
  run(40);
  const raining = w.kind === 'rain' && w.rain > 0.9 && w.cover > 0.8;
  run(40);
  const fullest = PUDDLES.map((P) => puddleFill(P, w.wet));
  run(30);
  const bow = w.bow;
  run(260);
  const dry = PUDDLES.every((P) => puddleFill(P, w.wet) === 0);
  const order = ['weather:cloudy', 'weather:rain', 'rainStart:rain', 'weather:cloudy', 'rainStop:rain', 'rainbow', 'weather:clear'];
  let at = -1;
  const inOrder = order.every((k) => (at = log.indexOf(k, at + 1)) >= 0);
  const ok = quiet && raining && fullest[0] > 0.9 && fullest.every((f) => f > 0.3) && bow > 0.8 && w.kind === 'clear' && w.bow < 0.05 && dry && inOrder;
  return { ok, info: `quiet before=${quiet}; raining=${raining}; puddles ${fullest.map((f) => f.toFixed(2)).join(' ')}; rainbow ${bow.toFixed(2)} → ${w.bow.toFixed(2)}; dry again=${dry}; ${log.join(' → ')}` };
});

test('weather on its own: something happens within a few minutes; snow only falls at night; no rainbow after dark', () => {
  let changed = 0, daySnow = 0, nightSnow = 0, nightBow = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const night = seed % 2 === 0;
    const w = new Weather({ rng: makeRng(seed) });
    let first = -1;
    for (let i = 0; i < 400 * 10; i++) {
      for (const e of w.update(0.1, { night, sunUp: !night })) {
        if (e.type === 'weather' && first < 0) first = w.t;
        if (e.type === 'rainStart' && e.kind === 'snow') night ? nightSnow++ : daySnow++;
        if (e.type === 'rainbow' && night) nightBow++;
      }
      if (![w.cover, w.rain, w.snow, w.wet, w.white, w.bow].every((v) => v >= 0 && v <= 1)) return { ok: false, info: `out of range at seed ${seed}` };
    }
    if (first > 0 && first < 200) changed++;
  }
  return { ok: changed === 24 && daySnow === 0 && nightSnow > 0 && nightBow === 0, info: `${changed}/24 skies changed within 200 s; snow by day ${daySnow}, by night ${nightSnow}; rainbows after dark ${nightBow}` };
});

test('rain: Kon notices, then holds up a leaf; when it stops the leaf goes away and Kon shakes itself dry', (sim) => {
  resting(sim);
  sim.setWeather('rain');
  sim.events.push({ type: 'rainStart', kind: 'rain' });
  let noticed = false, upAt = -1;
  const t0 = sim.t;
  sim.run(8, null, (P) => {
    if (sim.brain.idleAct && sim.brain.idleAct.name === 'rainNotice') noticed = true;
    if (P.umbrella && upAt < 0) upAt = sim.t - t0;
  });
  const key = sim.brain.caption.key;
  sim.setWeather('clear');
  sim.events.push({ type: 'rainStop', kind: 'rain' });
  let down = false, shook = false;
  sim.run(9, null, (P) => {
    if (!P.umbrella) down = true;
    if (sim.brain.idleAct && sim.brain.idleAct.name === 'shakeDry') shook = true;
  });
  const drops = sim.emitted.some((e) => e.type === 'shakeDrops');
  return { ok: noticed && upAt > 2 && upAt < 6 && down && shook && drops, info: `noticed=${noticed}; umbrella up after ${upAt.toFixed(1)} s (${key}); put away=${down}; shook dry=${shook} (drops flew: ${drops})` };
});

test('rain does not interrupt true meditation (no umbrella), and it wakes a sleeping fox', (sim) => {
  sim.still(1);
  stillUntil(sim, () => sim.brain.isStill() && sim.brain.state === 'ZAZEN', 40);
  sim.setWeather('rain');
  sim.events.push({ type: 'rainStart', kind: 'rain' });
  let umbrella = false;
  sim.run(6, null, (P) => { if (P.umbrella) umbrella = true; });
  const stillZen = sim.brain.state === 'ZAZEN';
  const sim2 = new Sim(7);
  sim2.brain.zenArmed = false;
  sim2.still(1);
  sim2.brain.go('SLEEPING');
  sim2.still(1);
  sim2.setWeather('rain');
  sim2.events.push({ type: 'rainStart', kind: 'rain' });
  sim2.still(0.2);
  const woke = sim2.states.includes('WAKING');
  return { ok: stillZen && !umbrella && woke, info: `still meditating=${stillZen}, umbrella=${umbrella}; the sleeper woke=${woke}` };
});

test('a puddle: Kon runs over, leaps in (a splash), stomps, and is delighted', (sim) => {
  resting(sim);
  sim.brain.zenArmed = false;
  sim.setWeather('rain', { wet: 1, puddles: [{ id: 'a', x: 880, y: 950, rx: 62, fill: 1 }] });
  sim.still(5);   // (long enough for the leaf to come out)
  sim.brain.startLife('puddle');
  stillUntil(sim, () => sim.brain.state === 'POUNCE' && sim.brain.arg.phase === 'land', 20);
  const k = sim.self;
  const inPuddle = Math.hypot(k.x - 880, k.y - 950) < 30;
  sim.still(3.2);
  const splashes = sim.emitted.filter((e) => e.type === 'splash').length;
  return { ok: inPuddle && splashes >= 3 && sim.brain.caption.key === 'puddleAfter' && sim.states.includes('RELAXING'), info: `landed in the puddle=${inPuddle} (${k.x.toFixed(0)}, ${k.y.toFixed(0)}); splashes=${splashes}; "${sim.brain.caption.text}"` };
});

test('the ball: it rolls, bounces off the scenery, stays in the garden and comes to rest', () => {
  const b = new Ball({ rng: makeRng(4) });
  let bad = '';
  let kicks = 0;
  const rng = makeRng(9);
  for (let n = 0; n < 40; n++) {
    const a = rng() * TAU;
    b.kick(Math.cos(a) * 520, Math.sin(a) * 520, rng() * 300, 'user');
    kicks++;
    for (let i = 0; i < 60 * 7; i++) {
      b.update(DT, {});
      if (!(b.x >= 215 && b.x <= 1139 && b.y >= 755 && b.y <= 961 && b.h >= 0)) bad = `left the garden at (${b.x.toFixed(0)}, ${b.y.toFixed(0)}, h=${b.h.toFixed(0)})`;
    }
    if (b.speed > 0.01 || b.h > 0.01) bad = `still moving 7 s after kick ${n}`;
    for (const o of OBSTACLES) if (Math.hypot((b.x - o.x) / o.rx, (b.y - o.y) / o.ry) < 0.98) bad = `came to rest inside the ${o.id}`;
    if (bad) break;
  }
  return { ok: !bad, info: bad || `${kicks} kicks in every direction: always back to rest, on open sand` };
});

test('you kick the ball: Kon chases it (cursor or no cursor) and bats it back toward you', (sim) => {
  sim.ball = new Ball({ rng: makeRng(4) });
  sim.weather = null;
  sim.sweep(1.5);
  // the cursor brushes through the ball
  const c = sim.ball.center();
  sim.run(0.25, (t) => sim.moveTo(c.x + 60 - t * 480, c.y));
  const kicked = sim.ball.kickedBy === 'user';
  let chased = false, bat = null, watching = false;
  sim.run(9, () => sim.moveTo(520 + Math.sin(sim.t * 2) * 30, 900), () => {
    const a = sim.brain.life.act;
    if (a && a.id === 'ball' && sim.brain.state === 'IDLE') chased = true;
    if (sim.brain.state === 'WATCH' && a) watching = true;
    const e = sim.brain.emits.find((x) => x.type === 'ballBat');
    if (e && !bat) bat = { ...e.data, bx: sim.ball.x };
  });
  const towardYou = bat && Math.sign(bat.dx) === Math.sign(520 - bat.bx);
  return { ok: kicked && chased && !!bat && towardYou && !watching, info: `kicked by the cursor=${kicked}; Kon gave chase=${chased}; batted=${!!bat}${bat ? ` (dx ${bat.dx.toFixed(0)}, toward the cursor: ${towardYou})` : ''}` };
});

const spiritSim = (sim) => {
  sim.spirits = new Spirits({ rng: makeRng(5), auto: false });
  sim.brain.zenArmed = false;
  sim.brain.life.lastVisit.tsubu = 1e9;   // (Kon minds its own business)
  sim.still(0.5);
  return sim.spirits;
};
const moved = (a, b) => a.reduce((m, s, i) => Math.max(m, Math.hypot(s.x - b[i].x, s.y - b[i].y, s.h - b[i].h)), 0);
const snap = (sp) => sp.list.map((s) => ({ x: s.x, y: s.y, h: s.h }));

test('pebble spirits: they move only while nobody is watching; one cursor move and they are stones', (sim) => {
  const sp = spiritSim(sim);
  sp.outing('parade', sp.ctx, { x: 868, y: 922 });
  sim.still(5);
  const a = snap(sp);
  sim.still(3);
  const whileAlone = moved(snap(sp), a);
  // the visitor stirs
  sim.run(0.5, (t) => sim.moveTo(300 + t * 80, 500));
  const b = snap(sp);
  const stones = sp.out.every((s) => s.stone > 0.9);
  sim.run(4, (t) => sim.moveTo(340 + Math.sin(t * 3) * 60, 500));
  const whileWatched = moved(snap(sp), b);
  // …and holds still again
  sim.still(4);
  const again = moved(snap(sp), b);
  const awake = sp.out.some((s) => s.stone < 0.2);
  return { ok: sp.out.length === 5 && whileAlone > 30 && stones && whileWatched < 0.01 && again > 20 && awake, info: `alone they moved ${whileAlone.toFixed(0)}; watched: stones=${stones}, moved ${whileWatched.toFixed(2)}; left alone again: ${again.toFixed(0)}` };
});

test('pebble spirits: never out while the cursor is busy; they go home on their own; a tap sends one under', (sim) => {
  const sp = new Spirits({ rng: makeRng(5) });
  sim.spirits = sp;
  sim.brain.zenArmed = false;
  sim.brain.life.lastVisit.tsubu = 1e9;
  sim.sweep(40);
  const hidWhileWatched = sp.troupe.mode === 'under' && !sim.spiritLog.length;
  sim.ptr.present = false;
  stillUntil(sim, () => sp.troupe.mode !== 'under', 30);
  const cameOut = sp.out.length === 5;
  sim.still(8);
  const s0 = sp.out[0];
  const tapped = sp.tap(s0.x, s0.y - 10);
  const four = sp.out.length === 4;
  stillUntil(sim, () => sp.troupe.mode === 'under', 150);
  const home = sp.troupe.mode === 'under' && sp.out.length === 0;
  const inScenery = sim.spiritLog.filter((e) => e.type === 'tsubuStep' && !isFree(e)).length;
  return { ok: hidWhileWatched && cameOut && tapped && four && home && inScenery === 0, info: `hidden while you moved=${hidWhileWatched}; came out when you left=${cameOut}; tap → under=${tapped && four}; all home by ${sim.t.toFixed(0)} s=${home}; hops into scenery=${inScenery}` };
});

test('pebble spirits: a tower of five; when Kon meditates they come and sit with it, and scatter when it stirs', (sim) => {
  const sp = spiritSim(sim);
  sp.outing('tower', sp.ctx, { x: 868, y: 922 });
  stillUntil(sim, () => sp.troupe.phase === 'hold', 40);
  const hs = sp.list.map((s) => Math.round(s.h)).sort((a, b) => a - b);
  const tower = sp.troupe.phase === 'hold' && hs[0] === 0 && hs[4] > 50 && sp.list.every((s) => Math.abs(s.x - sp.troupe.G.x) < 1);
  // now a fox in deep meditation
  const sim2 = new Sim(7);
  sim2.still(1);
  stillUntil(sim2, () => sim2.brain.isStill(), 40);
  const sp2 = new Spirits({ rng: makeRng(5), auto: false });
  sim2.spirits = sp2;
  sim2.still(0.2);
  sp2.outing(null, sp2.ctx, { x: 868, y: 922 });
  stillUntil(sim2, () => sp2.troupe.mode === 'zen' && sp2.out.every((s) => s.sit), 30);
  const sitting = sp2.troupe.mode === 'zen' && sp2.out.length === 5 && sp2.out.every((s) => s.sit);
  const zenHeld = sim2.brain.state === 'ZAZEN' || sim2.brain.state === 'SATORI';
  sim2.sweep(1.2);
  sim2.ptr.present = false;
  sim2.still(3);
  const scattered = ['scatter', 'under', 'home'].includes(sp2.troupe.mode);
  return { ok: tower && sitting && zenHeld && scattered, info: `tower heights ${hs.join(',')} (${tower}); sat down around a meditating Kon=${sitting} (without disturbing it: ${zenHeld}); scattered when it stirred=${scattered} (${sp2.troupe.mode})` };
});

test('Kon goes to look at a pebble that moved: it holds perfectly still, gets poked, and stays a pebble', (sim) => {
  const sp = spiritSim(sim);
  sim.weather = null;
  sp.outing('parade', sp.ctx, { x: 868, y: 922 });
  sim.still(6);
  sim.brain.startLife('tsubu');
  let poked = false, movedWhileInspected = 0, inspected = false;
  let prev = null;
  sim.run(22, null, () => {
    const a = sim.brain.life.act;
    if (a && a.id === 'tsubu' && a.phase === 'do') {
      inspected = true;
      const now = snap(sp);
      if (prev) movedWhileInspected = Math.max(movedWhileInspected, moved(now, prev));
      prev = now;
    }
    if (sim.brain.emits.some((e) => e.type === 'tsubuPoke')) poked = true;
  });
  return { ok: inspected && poked && movedWhileInspected < 0.01 && sp.out.length === 5, info: `Kon inspected=${inspected}, poked one=${poked}; they moved ${movedWhileInspected.toFixed(2)} under its nose; all five still there=${sp.out.length === 5}` };
});

test('the frog: comes out in the rain, croaks, leaps from a cursor, dives when pressed, leaves when it dries', () => {
  const f = new Frog({ rng: makeRng(6) });
  const log = [];
  const ptr = { present: false, x: 0, y: 0, speed: 0 };
  const run = (secs, wet, raining) => { for (let i = 0; i < secs * 60; i++) for (const e of f.update(DT, { pointer: ptr, wet, raining })) log.push(e.type); };
  run(5, 0, false);
  const stayedIn = f.state === 'away';
  run(8, 0.6, true);
  const out = f.state === 'sit';
  run(12, 0.6, true);
  const croaks = log.filter((e) => e === 'frogCroak').length;
  // a cursor right on top of it
  Object.assign(ptr, { present: true, x: f.x, y: f.y - 8, speed: 0 });
  run(0.2, 0.6, true);
  const leapt = f.state === 'hop';
  ptr.present = false;
  run(1.5, 0.6, true);
  // …and again, wherever it landed: that's enough, into the water
  Object.assign(ptr, { present: true, x: f.x, y: f.y - 8, speed: 0 });
  run(0.2, 0.6, true);
  ptr.present = false;
  run(3, 0.6, true);
  const dived = log.includes('frogDive');
  run(8, 0.6, true);
  run(40, 0.05, false);
  return { ok: stayedIn && out && croaks >= 2 && leapt && dived && f.state === 'away', info: `dry: away=${stayedIn}; rain: out=${out}, croaks=${croaks}; cursor on it: leapt=${leapt}, into the basin=${dived}; dry again: ${f.state}` };
});

test('Kon and the frog: every croak gets an answer', (sim) => {
  resting(sim);
  sim.brain.zenArmed = false;
  sim.setWeather('rain', { wet: 0.7 });
  sim.frog = new Frog({ rng: makeRng(6), auto: false });
  sim.still(4);
  sim.frog.appear();
  stillUntil(sim, () => sim.frog.state === 'sit', 10);
  sim.brain.startLife('frog');
  let croaks = 0, answers = 0, lastKey = '';
  sim.run(22, null, () => {
    if (sim.brain.caption.key === 'frogRibbit' && lastKey !== 'frogRibbit') answers++;
    lastKey = sim.brain.caption.key;
  });
  croaks = sim.emitted.filter((e) => e.type === 'sfx' && e.data === 'croak').length;
  return { ok: answers >= 1 && croaks >= 1, info: `Kon answered ${croaks} croak(s) in its best frog` };
});

test('the butterfly: lands on a cursor that holds still, rides along gently, and leaves when it jerks', () => {
  const b = new Butterfly({ rng: makeRng(8), auto: false });
  const view = { x: 0, y: 0, w: 1600, h: 1000 };
  const ptr = { present: true, isTouch: false, x: 1100, y: 620, lastMove: 0, speed: 0 };
  let now = 10;
  const log = [];
  const run = (secs, fn) => { for (let i = 0; i < secs * 60; i++) { now += DT; if (fn) fn(); for (const e of b.update(DT, { now, view, pointer: ptr, day: true, clear: true })) log.push(e.type); } };
  run(0.1);
  b.visit();
  run(25);
  const landed = b.state === 'cursor' && Math.hypot(b.x - ptr.x, b.y - (ptr.y - 6)) < 4;
  run(3, () => { ptr.x += 0.6; ptr.lastMove = now; ptr.speed = 36; });
  const rode = b.state === 'cursor' && Math.hypot(b.x - ptr.x, b.y - (ptr.y - 6)) < 14;
  run(0.3, () => { ptr.x -= 16; ptr.lastMove = now; ptr.speed = 960; });
  const fled = b.state === 'fly';
  return { ok: landed && rode && fled && log.includes('butterflyCursor'), info: `landed on the still cursor=${landed}; rode along=${rode}; fled the jerk=${fled}` };
});

test('every new moment has words: captions for each key the outdoors can say', () => {
  const keys = ['rainStart', 'sunshower', 'snowStart', 'rainZen', 'umbrella', 'rainStop', 'snowStop', 'rainOver', 'shakeDry', 'rainbow', 'puddleSee', 'puddleJump', 'puddleAfter',
    'rainListen', 'catchDrops', 'catchFlake', 'snowAwe', 'cloudPoke', 'cloudPokeKon', 'cloudFox', 'cloudFish', 'cloudRabbit', 'foxWedding', 'snowfoxBuild', 'snowfoxDone',
    'ballChase', 'ballBat', 'ballDone', 'frogMeet', 'frogRibbit', 'frogGone', 'tsubuSee', 'tsubuInspect', 'tsubuGone', 'tsubuPop', 'tsubuCaught', 'tsubuZen', 'tailChase', 'tailDizzy',
    'butterflyCursor', 'butterflyNose', 'dream'];
  const missing = keys.filter((k) => !CAPTIONS[k] || !CAPTIONS[k].length || !VOICE[k]);
  return { ok: missing.length === 0, info: missing.length ? `missing: ${missing.join(', ')}` : `${keys.length} moments, each with a narrator's line and a line of Kon's own` };
});

test('a long wet, snowy, busy session: every pose stays finite, and Kon ends up dry and at rest', (sim) => {
  sim.ball = new Ball({ rng: makeRng(4) });
  sim.spirits = new Spirits({ rng: makeRng(5) });
  sim.frog = new Frog({ rng: makeRng(6) });
  const w = new Weather({ rng: makeRng(2), auto: false });
  const seen = new Set();
  const kinds = [['rain', 40], ['clear', 20], ['snow', 50], ['sunshower', 30], ['clear', 30]];
  for (const [kind, secs] of kinds) {
    w.set(kind, 1e6);
    sim.run(secs, (t) => {
      for (const e of w.update(DT, { night: kind === 'snow', sunUp: kind !== 'snow' })) sim.events.push(e);
      sim.weather = { kind: w.kind, rain: w.rain, snow: w.snow, cover: w.cover, wet: w.wet, white: w.white, falling: w.falling, bow: w.bow > 0.3 ? { x: 600, y: 300 } : null,
        puddles: PUDDLES.map((P) => ({ id: P.id, x: P.x, y: P.y, rx: P.rx, fill: puddleFill(P, w.wet) })).filter((p) => p.fill > 0.45) };
      if (Math.floor(t) % 13 === 5) sim.moveTo(400 + Math.sin(t * 3) * 200, 500 + Math.cos(t * 2) * 100);
    }, () => {
      const a = sim.brain.life.act;
      if (a) seen.add(a.id);
      if (sim.brain.idleAct) seen.add(sim.brain.idleAct.name);
    });
  }
  const o = sim.brain.out;
  return { ok: !o.umbrella && seen.has('puddle') && seen.size > 6, info: `umbrella away=${!o.umbrella}; Kon got up to: ${[...seen].join(', ')}` };
});

export function runAll() {
  const results = [];
  for (const { name, fn } of tests) {
    const sim = new Sim(7);
    let r;
    try {
      r = fn(sim);
      if (sim.bad.length) { r.ok = false; r.info += ` | NaN: ${sim.bad.slice(0, 3).join('; ')}`; }
    } catch (e) {
      r = { ok: false, info: 'threw: ' + e.message + '\n' + e.stack };
    }
    results.push({ name, ...r });
  }
  return results;
}
