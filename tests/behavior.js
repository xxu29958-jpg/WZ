// Behavior tests: drive the Brain with simulated pointer and typing input
// (no DOM, deterministic random numbers) and check the state transitions.

import { Brain } from '../js/brain.js';
import { makeRng } from '../js/math.js';
import { PLACES } from '../js/scene.js';

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
  }
  step() {
    const p = this.ptr;
    if (this.t - p.lastMove > 0.05) { p.vx *= 0.85; p.vy *= 0.85; }
    const s = {
      now: this.t,
      pointer: { ...p, speed: Math.hypot(p.vx, p.vy) },
      typing: { ...this.typing, anchor: PLAQUE },
      events: this.events.splice(0),
      body: BODY,
      objects: [],
      places: PLACES,
    };
    const P = this.brain.update(DT, s);
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
  approach(from = { x: 1350, y: 615 }, speed = 1500) {
    this.moveTo(from.x, from.y);
    this.step();
    let x = from.x, y = from.y;
    for (let i = 0; i < 120; i++) {
      const dx = HEAD.x - x, dy = HEAD.y - y;
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
  const poses = sim.still(8);
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

test('long quiet → DROWSY → SLEEPING; movement → WAKING', (sim) => {
  sim.still(40);
  const slept = sim.states.includes('DROWSY') && sim.brain.state === 'SLEEPING';
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
