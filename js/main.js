// ZEN70 · 禅道 — wiring.
//
//   InputTracker  (raw DOM events → senses)
//        ↓
//   Brain         (senses → pose: what Kon wants to do)
//        ↓
//   FoxRig        (pose → springs → SVG)        Scene (garden, layout, props)
//
// One requestAnimationFrame loop drives everything; DOM events only record data.
// Around it: ZenFX (the live ensō), SandRake (raking) and a small memory of you.

import { Brain } from './kon/brain.js';
import { FoxRig } from './kon/rig.js';
import { InputTracker } from './input.js';
import { Scene } from './garden/scene.js';
import { Sound } from './audio.js';
import { setClock } from './clock.js';
import { makeRng } from './math.js';
import { runDemo } from './demo.js';
import { arrive, touch, saveMemory } from './memory.js';
import { DOODLE_KINDS } from './garden/rake.js';
import { Mover } from './kon/mover.js';
import { depthScale } from './garden/world.js';
import { Birds, birdContext } from './garden/birds.js';
import { Ball } from './garden/toys.js';
import { Spirits, spiritContext } from './garden/spirits.js';
import { Frog, Butterfly } from './garden/critters.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const wishInput = $('wish-input');
const form = $('wish');
const captionEl = $('caption');
const params = new URLSearchParams(location.search);
const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
const coarseMQ = matchMedia('(pointer: coarse)');
// ?motion=full shows every movement even when the system asks for reduced motion
const reduced = () => params.get('motion') !== 'full' && (reducedMQ.matches || params.has('reduced'));
const demo = params.get('demo');
const manual = params.has('manual') || !!demo;
// scripted checks use repeatable randomness
const rngFor = (k) => (manual ? makeRng((+params.get('seed') || 7) + k) : Math.random);
if (manual) document.body.classList.add('frozen');
// arriving: the garden fades in from the paper (not in tests, not with reduced motion),
// once the fonts are in (or after a moment, whichever is first), so nothing visibly swaps
else if (!reduced()) {
  const body = document.body;
  body.classList.add('arriving');
  const reveal = () => {
    if (!body.classList.contains('arriving')) return;
    body.classList.replace('arriving', 'intro');
    scene.startIntro();
    setTimeout(() => body.classList.remove('intro'), 3400);
  };
  document.fonts?.ready.then(reveal);
  setTimeout(reveal, 1200);
}

const sound = new Sound();
let input; // created after the scene, which it needs for coordinates

const scene = new Scene({
  app,
  svg: $('scene'),
  back: $('scene-back'),
  glow: $('glow'),
  ema: form,
  caption: captionEl,
  reducedMotion: reduced(),
  rng: rngFor(3),
  emit: (ev) => {
    if (ev.type === 'sfx') sound.play(ev.name, ev.k);
    else input.push(ev);
  },
});

input = new InputTracker({
  surface: app,
  toWorld: scene.toWorld,
  input: wishInput,
  form,
  inputSpan: scene.inputSpan,
});

const rig = new FoxRig($('kon'), { reducedMotion: reduced(), rng: rngFor(1) });
const mover = new Mover({ seat: 'cushion' });
const brain = new Brain({ reducedMotion: reduced(), rng: rngFor(2) });
// a sparrow drops by now and then (scripted checks call it in with ?birds or __zen.birds.visit())
const birds = new Birds({ parent: $('depth'), rng: rngFor(5), reduced: reduced(), auto: !manual || params.has('birds') });
scene.visitor = birds;
// the garden's other small residents: a temari ball, the pebble spirits (who come out when nobody is
// watching), a frog for rainy days, a butterfly for fair ones (?spirits, ?frog, ?butterfly in scripted checks)
const ball = new Ball({ parent: $('depth'), rng: rngFor(6) });
const spirits = new Spirits({ parent: $('depth'), rng: rngFor(7), reduced: reduced(), auto: !manual || params.has('spirits') });
const frog = new Frog({ parent: $('depth'), rng: rngFor(8), auto: !manual || params.has('frog') });
const butterfly = new Butterfly({ parent: $('fx-world'), rng: rngFor(9), reduced: reduced(), auto: !manual || params.has('butterfly') });
Object.assign(scene, { ball, spirits, frog, butterfly });
scene.others = [ball, frog, ...spirits.list];
let tinySteps = 0;
// gusts of wind come on their own (scripted checks call them with ?wind or __zen.scene.gust())
scene.autoGusts = !manual || params.has('wind');
// …and so do shooting stars and curious fireflies after dark (?meteors, or __zen.scene.spawnMeteor())
scene.autoMeteors = !manual || params.has('meteors');
// …and the weather changes when it likes (?weather=rain|snow|sunshower|cloudy starts with that)
scene.weather.auto = !manual;
if (params.has('weather')) scene.setWeather(params.get('weather'), { dur: manual ? 1e6 : 80, instant: true });

reducedMQ.addEventListener?.('change', () => {
  rig.setReducedMotion(reduced());
  brain.reduced = reduced();
  scene.reduced = reduced();
  birds.reduced = reduced();
  spirits.reduced = reduced();
  butterfly.reduced = reduced();
});

// --- touching Kon directly: boop the nose, pat the head ---
$('kon-nose-hit').addEventListener('pointerdown', (e) => {
  e.__kon = 'boop';
  input.push({ type: 'boop' });
});
$('kon-head').addEventListener('pointerdown', (e) => {
  if (e.__kon) return;
  input.push({ type: 'pat' });
});

// --- viewport, virtual keyboard ---
let baseH = window.innerHeight;
let lastOrientation = screen.orientation?.type;
function applyViewport() {
  const vv = window.visualViewport;
  // iOS shrinks only the visual viewport for the keyboard; Android may shrink both
  const h = Math.min(vv ? vv.height : Infinity, window.innerHeight);
  const top = vv ? vv.offsetTop : 0;
  const o = screen.orientation?.type;
  if (o !== lastOrientation) { baseH = window.innerHeight; lastOrientation = o; }
  baseH = Math.max(baseH, window.innerHeight);
  document.documentElement.style.setProperty('--vvh', `${h}px`);
  app.style.top = `${top}px`;
  const kb = coarseMQ.matches && document.activeElement === wishInput && h < baseH * 0.82;
  document.body.classList.toggle('kb-open', kb);
  scene.layout({ keyboard: kb });
  input.reproject();
}
window.addEventListener('resize', applyViewport);
window.visualViewport?.addEventListener('resize', applyViewport);
window.visualViewport?.addEventListener('scroll', applyViewport);
wishInput.addEventListener('focus', () => setTimeout(applyViewport, 300));
wishInput.addEventListener('blur', () => setTimeout(applyViewport, 300));
document.fonts?.ready.then(applyViewport);
applyViewport();

// --- controls ---
const soundBtn = $('btn-sound');
soundBtn.addEventListener('click', () => {
  sound.setOn(!sound.on);
  soundBtn.setAttribute('aria-pressed', String(sound.on));
  if (sound.on) sound.play('startle');
});
const hintsBtn = $('btn-hints');
const hints = $('hints');
hintsBtn.addEventListener('click', () => {
  const open = hints.hidden;
  hints.hidden = !open;
  hintsBtn.setAttribute('aria-expanded', String(open));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !hints.hidden) { hints.hidden = true; hintsBtn.setAttribute('aria-expanded', 'false'); }
});

// --- the tab title misses you ---
const baseTitle = document.title;
document.addEventListener('visibilitychange', () => {
  document.title = document.hidden ? 'Kon is not waiting for you · ZEN70' : baseTitle;
});

// --- caption ---
let captionAt = -1;
let captionTimer = 0;
function updateCaption() {
  const c = brain.caption;
  if (c.at === captionAt) return;
  captionAt = c.at;
  const span = captionEl.firstElementChild;
  if (span.textContent === c.text) return;
  if (manual) { span.textContent = c.text; scene.captionW = span.offsetWidth; return; }
  captionEl.classList.add('swap');
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => {
    span.textContent = c.text;
    scene.captionW = span.offsetWidth;
    captionEl.classList.remove('swap');
  }, 200);
}

// --- Kon remembers you (this browser only) ---
// Test modes pass ?visits=, ?away= (hours) and ?hour= instead of reading storage.
let memory;
let awayHours;
if (manual) {
  memory = { visits: +params.get('visits') || 1, satori: +params.get('satori') || 0, bestEnso: 0, last: 0 };
  awayHours = params.has('away') ? +params.get('away') : null;
} else {
  ({ memory, awayHours } = arrive());
  const keepFresh = () => touch(memory);
  setInterval(keepFresh, 30000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) keepFresh(); });
  window.addEventListener('pagehide', keepFresh);
}
brain.satoriCount = memory.satori || 0;
if (memory.satori > 0) scene.zen.stampSeal(memory.satori, { quiet: true });
let doodle = false;
if (awayHours !== null && awayHours >= 1) {
  // while you were away, Kon raked something into the sand
  scene.rakeDoodle(DOODLE_KINDS[(memory.visits || 1) % DOODLE_KINDS.length]);
  doodle = true;
}
input.push({ type: 'arrive', visits: memory.visits, awayHours, doodle });

// the garden follows your local time (dawn, day, dusk, night)
const hourNow = () => {
  if (params.has('hour')) return +params.get('hour');
  if (manual) return 12;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
};
scene.clock = hourNow;
let period = scene.setTimeOfDay(hourNow());
if (period !== 'day') input.push({ type: 'daytime', period });
if (!manual) {
  setInterval(() => {
    const next = scene.setTimeOfDay(hourNow());
    if (next !== period) { period = next; input.push({ type: 'daytime', period }); }
  }, 5 * 60 * 1000);
}

// --- Kon's voice: a speech bubble near the head ---
const saysEl = $('kon-says');
const saysText = saysEl.firstElementChild;
let saysAt = -1;
let saysSize = [0, 0];
function updateVoice(body) {
  const v = brain.voice;
  if (v.at !== saysAt) {
    saysAt = v.at;
    saysText.textContent = v.text;
    saysSize = [saysEl.offsetWidth, saysEl.offsetHeight];
    saysEl.classList.add('show');
  }
  const showing = v.text && brain.now - v.at < v.dur;
  if (!showing) { saysEl.classList.remove('show'); return; }
  scene.placeBubble(saysEl, body.head, rig.scale, saysSize);
}

// --- debug overlay (?debug) ---
const debugEl = $('debug');
const showDebug = params.has('debug');
if (showDebug) debugEl.hidden = false;
let debugAt = 0;

// --- the loop ---
function tick(dt, ts) {
  const senses = input.sample();
  for (const ev of senses.events) {
    if (ev.type === 'input') scene.nudgeEma(ev.del ? 0.4 : 0.7);
    if (ev.type === 'submit') {
      // a wish sent while a caught star still glows leaves on a golden crane
      if (scene.starlit) { ev.star = true; scene.starlitUntil = scene.t + 0.01; }
      scene.launchCrane(ev.star);
      if (coarseMQ.matches) wishInput.blur();
    }
    // back after a while away: the pebbles thought nobody was looking
    if (ev.type === 'return' && ev.away > 8) spirits.caught();
  }
  senses.self = mover.state();
  senses.body = rig.measure();
  senses.objects = scene.objects();
  const bird = birds.object();
  if (bird) senses.objects.push(bird);
  for (const o of [ball.object(), frog.object(), spirits.object(senses.self), butterfly.object()]) if (o) senses.objects.push(o);
  senses.snowfox = (scene.snowfoxT || 0) > 0;
  senses.places = scene.places;
  senses.night = scene.night;
  senses.weather = scene.weatherInfo();
  senses.leafOnHead = !!scene.leafOnKon;
  senses.layout = scene.mode;

  const pose = brain.update(dt, senses);
  // the body follows the brain's wishes, with momentum and gravity
  mover.command(pose.move);
  for (const ev of mover.update(dt)) {
    if (ev.type === 'step') {
      scene.rake.pawPrint(ev.x, ev.y, ev.foot, ev.dir, depthScale(ev.y));
      // paws in a puddle
      if (scene.puddleAt(ev.x, ev.y)) { scene.splash(ev.x, ev.y, 0.32, true); sound.play('plip'); }
      pose.impulses.push({ type: 'step', foot: ev.foot, s: ev.gait === 'sneak' ? 0.3 : ev.gait === 'trot' ? 1.3 : 1 });
    }
    else if (ev.type === 'land') { pose.impulses.push({ type: 'land', s: ev.impact }); if (ev.kind === 'pounce') sound.play('clack', 0.4); }
  }
  const where = mover.state();
  for (const em of brain.emits) {
    if (em.type === 'sfx') sound.play(em.data);
    else if (em.type === 'dragonfly') scene.spawnDragonfly();
    else if (em.type === 'poke') scene.pokeFlower(1);
    else if (em.type === 'satori') { memory.satori = em.data; if (!manual) saveMemory(memory); }
    else if (em.type === 'ensoScore') { memory.bestEnso = Math.max(memory.bestEnso || 0, em.data); if (!manual) saveMemory(memory); }
    else if (em.type === 'scatterLeaf') scene.scatterLeaf(em.data);
    else if (em.type === 'snailPoke') scene.hideSnail();
    else if (em.type === 'blowLeaf') scene.blowLeaf();
    else if (em.type === 'fireflyGo') { scene.fireflyGo(); butterfly.flee(); }
    else if (em.type === 'splash') scene.splash(em.data.x, em.data.y, em.data.k);
    else if (em.type === 'shakeDrops') scene.shakeDrops(senses.body.center);
    else if (em.type === 'ballBat') {
      const d = Math.hypot(em.data.dx, em.data.dy) || 1;
      ball.kick((em.data.dx / d) * em.data.power, (em.data.dy / d) * em.data.power * 1.5, 120, 'kon');
      sound.play('bounce', 0.8);
    }
    else if (em.type === 'tsubuPoke') { spirits.poke(em.data); sound.play('tok', 0.6); }
    else if (em.type === 'snowfox') scene.growSnowfox(em.data);
  }
  rig.wind = scene.wind;
  rig.update(dt, pose, where);
  const body = rig.measure();
  const clack = senses.events.some((e) => e.type === 'clack');
  const wx = scene.weather;
  const falling = wx.rain > 0.2 || wx.snow > 0.2;
  // (sparrows don't sit out in the rain any more than they stay up at night)
  for (const ev of birds.update(dt, birdContext({ brain, kon: where, body, view: scene.vb, pointer: senses.pointer, clack, night: scene.night || falling }))) {
    if (ev.type === 'birdFlee' || ev.type === 'birdArrive') sound.play('flutter', ev.type === 'birdFlee' ? 1 : 0.6);
    else if (ev.type === 'birdChirp') sound.play('chirp');
    input.push(ev);
  }
  for (const ev of ball.update(dt, { pointer: senses.pointer, kon: where })) {
    if (ev.type === 'ballBounce') sound.play('bounce', ev.k);
    else { if (ev.by === 'user') sound.play('bounce', 0.6); input.push(ev); }
  }
  for (const ev of spirits.update(dt, spiritContext({ brain, kon: where, view: scene.vb, pointer: senses.pointer, now: senses.now, night: scene.dark, rain: wx.rain > 0.2, clack }))) {
    if (ev.type === 'tsubuRise') { scene.dustPuff(ev.x, ev.y); sound.play('tok', 0.5); }
    else if (ev.type === 'tsubuPop') { scene.dustPuff(ev.x, ev.y + 8, 1.2); if (ev.by === 'user') sound.play('squeak'); input.push(ev); }
    else if (ev.type === 'tsubuTok') sound.play('tok', 0.8);
    else if (ev.type === 'tsubuStep') { if (tinySteps++ % 2 === 0) scene.rake.pawPrint(ev.x, ev.y, 'l', 1, depthScale(ev.y) * 0.3 * ev.size); }
    else input.push(ev);
  }
  for (const ev of frog.update(dt, { pointer: senses.pointer, kon: where, wet: wx.wet, raining: wx.rain > 0.2 })) {
    if (ev.type === 'frogCroak') sound.play('croak');
    else if (ev.type === 'frogDive') { scene.splash(ev.x, ev.y, 0.6, true); sound.play('plop'); }
    input.push(ev);
  }
  const fair = wx.cover < 0.42 && !falling;
  for (const ev of butterfly.update(dt, { now: senses.now, view: scene.vb, pointer: senses.pointer, konNose: body.nose, konSitting: scene.konSitting, konCalm: scene.konCalm, clear: fair, day: scene.sky.p.stars < 0.15 && scene.sky.p.sun.up })) input.push(ev);
  scene.placeKon(where);
  // what the garden needs to know about Kon: where its head is, and whether it's sitting still
  const settled = !where.moving && !where.airborne;
  scene.konBody = body;
  scene.konMoving = !settled;
  scene.konSitting = settled && !!where.seat && brain.state === 'IDLE' && !brain.life.act;
  scene.konStill = settled && (brain.isStill() || scene.konSitting);
  scene.konDreaming = brain.state === 'SLEEPING' && brain.stateT > 3.5;
  scene.konCalm = settled && !['STARTLED', 'POUNCE', 'DIZZY', 'SATORI', 'WAKING', 'BOOPED', 'JUDGE'].includes(brain.state);
  // the camera pushes in on a moment
  const act = brain.idleAct && brain.idleAct.name;
  const h = body.head;
  scene.camFocus =
    brain.state === 'BOOPED' && brain.arg.firefly ? { x: body.nose.x, y: body.nose.y, z: 1.16 }
    : act === 'leafHat' ? { x: h.x, y: h.y - 30, z: 1.1 }
    : act === 'wishStar' ? { x: h.x, y: h.y - 40, z: 1.07 }
    : act === 'breeze' ? { x: h.x, y: h.y, z: 1.04 }
    : brain.state === 'SATORI' ? { x: h.x, y: h.y + 40, z: 1.06 }
    : scene.weddingFocus && scene.t < scene.weddingFocus.until ? scene.weddingFocus
    : null;
  scene.update(dt);
  scene.zen.update(dt, brain.zenInfo(), body.center);
  scene.updateCursor(dt, input.pointer);
  updateCaption();
  updateVoice(body);
  sound.ambient(dt, { dark: scene.dark, rain: scene.weather.rain, snow: scene.weather.snow });

  if (showDebug && ts - debugAt > 100) {
    debugAt = ts;
    const d = brain.debug();
    debugEl.textContent =
      `state     ${d.state}${d.label ? ' · ' + d.label : ''}\n` +
      `act       ${d.act}${d.variant ? ' · ' + d.variant : ''}\n` +
      `attention ${d.attn}\n` +
      `curiosity ${d.cur.toFixed(2)}  ptr ${d.ptrI.toFixed(2)}  type ${d.typeI.toFixed(2)}\n` +
      `pointer   ${d.ptrActive ? 'moving' : 'still'}   typing ${d.typeActive ? 'yes' : 'no'}\n` +
      `caught    ${d.caught}   idle ${d.idleFor.toFixed(1)}s   mode ${scene.mode}\n` +
      `zen       ${brain.zen && d.state === 'ZAZEN' ? (brain.zen.paint * 100).toFixed(0) + '% painted' : '—'}   satori ${brain.satoriCount}   visit ${memory.visits}`;
  }
}

const zen = { brain, rig, scene, input, sound, mover, birds, ball, spirits, frog, butterfly };

if (manual) {
  // Test mode: time only moves when a script calls __zen.advance(seconds, fn).
  // fn(t) runs before each 60 fps frame and may dispatch input events.
  let T = performance.now() / 1000;
  setClock(() => T);
  zen.advance = (seconds, fn) => {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      if (fn) fn(i / 60);
      T += 1 / 60;
      tick(1 / 60, T * 1000);
    }
    return brain.debug();
  };
} else {
  let last = performance.now();
  const frame = (ts) => {
    let dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.25 || dt <= 0) dt = 1 / 60;
    tick(dt, ts);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// handles for testing from the console / automated checks
window.__zen = zen;

if (demo) {
  const t = params.get('t');
  runDemo(zen, demo, { ...Object.fromEntries(params), act: params.get('act'), t: t ? +t : undefined });
}
