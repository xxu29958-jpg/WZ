// Scripted demos for verification screenshots: index.html?demo=<name>
// Runs on the virtual clock (?manual is implied), feeding synthetic pointer and
// typing events through the real InputTracker → Brain → Rig pipeline, then
// freezes on the moment worth looking at. A small drawn cursor shows where
// the "mouse" is, since screenshots don't include the real one.

import { ACTIVITIES } from './kon/acts.js';

export function runDemo(zen, name, opts = {}) {
  const app = document.getElementById('app');
  const input = document.getElementById('wish-input');
  const { brain, rig, scene } = zen;
  const cursor = document.createElement('div');
  cursor.className = 'demo-cursor';
  cursor.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2 L3 19 L8 14.5 L11.5 22 L14.5 20.6 L11 13.4 L18 13.4 Z" fill="#fff" stroke="#1d120c" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  app.appendChild(cursor);

  const head = () => {
    const h = rig.measure().restHead;
    return scene.toScreen(h.x, h.y);
  };
  const H = head();
  const W = app.clientWidth;
  let cx = W * 0.85, cy = H.y - 260;
  const move = (x, y) => {
    cx = x; cy = y;
    app.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerType: 'mouse', bubbles: true }));
  };
  const adv = (s, fn) => zen.advance(s, fn);
  const until = (pred, max = 6, fn) => {
    for (let i = 0; i < max * 60 && !pred(); i++) zen.advance(1 / 60, fn);
  };
  const sweep = (secs, { y = H.y - 230, ax = Math.min(W * 0.32, 440), w = 1.15, phase = 0 } = {}) =>
    adv(secs, (t) => move(H.x + ax * Math.sin(t * w + phase), y + 30 * Math.sin(t * w * 1.8)));
  const typeFor = (secs, every = 0.14) => {
    let next = 0;
    adv(secs, (t) => {
      if (t >= next) {
        input.dispatchEvent(new InputEvent('input', { inputType: 'insertText', bubbles: true }));
        next += every;
      }
    });
  };
  const approach = () => {
    let x = H.x + Math.min(W * 0.42, 520), y = H.y - 40;
    move(x, y);
    adv(0.1);
    for (let i = 0; i < 120 && brain.state !== 'STARTLED'; i++) {
      const dx = H.x - x, dy = H.y - y, d = Math.hypot(dx, dy);
      if (d < 20) break;
      x += (dx / d) * 22; y += (dy / d) * 22;
      zen.advance(1 / 60, () => move(x, y));
    }
  };
  // headless windows may not deliver focus events, so make sure one arrives
  const focusInput = () => {
    input.focus();
    if (!zen.input.typing.focused) input.dispatchEvent(new FocusEvent('focus'));
  };
  const forceAct = (act) => {
    if (!act) return;
    const bag = brain.pretendBag;
    const orig = bag.next.bind(bag);
    bag.next = () => { bag.next = orig; return act; };
  };
  // send Kon somewhere on its own (no meditation interrupting the walk)
  const goDo = (id, extra = {}) => {
    brain.zenArmed = false;
    const def = ACTIVITIES.find((d) => d.id === id) || ACTIVITIES[0];
    brain.life.restUntil = 0;
    brain.life.act = { id, def, phase: 'go', t: 0, dur: 30, gait: opts.gait || 'walk', ...extra };
  };
  // nothing of Kon's own choosing until the demo asks for it
  const stay = () => { brain.zenArmed = false; brain.life.restUntil = 1e9; };
  const pretend = (act) => {
    forceAct(act);
    sweep(3.4);
    until(() => brain.state === 'PRETENDING', 3);
  };

  adv(1);
  switch (name) {
    case 'idle':
      cursor.hidden = true;
      adv(1.5);
      break;
    case 'peek':
      sweep(3.6, { phase: -0.6 });
      break;
    case 'peek-low':
      sweep(3.6, { y: H.y + 160, phase: 1.2 });
      break;
    case 'stalk': {
      sweep(2.4);
      const x0 = cx;
      adv(1.6, (t) => move(x0 - t * 70, cy + t * 20));
      break;
    }
    case 'noticed':
      sweep(3.4);
      until(() => brain.state === 'NOTICED', 2);
      adv(0.16);
      break;
    case 'pretend':
      pretend(opts.act || 'whistle');
      adv(opts.t ?? 1.4);
      break;
    case 'resume':
      pretend(opts.act || 'whistle');
      adv(1.3);
      until(() => brain.state === 'RESUMING', 3, () => move(cx + 4, cy));
      adv(0.45, () => move(cx + 4, cy));
      break;
    case 'startle':
      approach();
      adv(0.18, () => {});
      break;
    case 'cover':
    case 'pout':
    case 'bleh':
      brain.caught = { cover: 1, pout: 2, bleh: 3 }[name];
      brain.lastCaughtAt = -10;
      approach();
      adv({ cover: 1.45, pout: 1.0, bleh: 1.0 }[name]);
      break;
    case 'typing':
      cursor.hidden = true;
      focusInput();
      input.value = 'may the moss grow slowly';
      adv(0.4);
      typeFor(opts.t ?? 7);
      break;
    case 'typing-stop':
      cursor.hidden = true;
      forceAct(opts.act || 'meditate');
      focusInput();
      input.value = 'more naps for everyone';
      adv(0.4);
      typeFor(2.6);
      adv(opts.t ?? 2.4);
      break;
    case 'both':
      focusInput();
      input.value = 'a quiet afternoon';
      adv(0.3);
      {
        let next = 0;
        adv(2.4, (t) => {
          move(H.x - 380 + t * 60, H.y - 200 + Math.sin(t * 3) * 30);
          if (t >= next) { input.dispatchEvent(new InputEvent('input', { inputType: 'insertText', bubbles: true })); next += 0.15; }
        });
      }
      break;
    case 'sleep':
      cursor.hidden = true;
      adv(40);
      break;
    case 'dizzy':
      adv(2.8, (t) => move(H.x + Math.cos(t * 8) * 230, H.y + Math.sin(t * 8) * 230));
      until(() => brain.state === 'DIZZY', 2, (t) => move(H.x + Math.cos(t * 8) * 230, H.y + Math.sin(t * 8) * 230));
      adv(0.8, () => {});
      break;
    case 'pet':
      approach();
      adv(4.2, () => {});
      adv(1.8, (t) => move(H.x + Math.sin(t * 9) * 42, H.y - 30));
      break;
    case 'boop':
      cursor.hidden = false;
      move(H.x, H.y + 30);
      zen.input.push({ type: 'boop' });
      adv(0.02);
      brain.arg.sneeze = true;
      adv(opts.t ?? 1.15);
      break;
    case 'admire':
      cursor.hidden = true;
      focusInput();
      input.value = 'see the sea';
      typeFor(1.2);
      document.getElementById('wish').requestSubmit();
      adv(1.6);
      break;
    case 'sparrow': // a sparrow on a perch (?perch=lantern|rack|rock|basin|cushion); Kon may go and watch
      cursor.hidden = true;
      brain.zenArmed = false;
      zen.birds.visit(opts.perch || 'lantern');
      until(() => zen.birds.state === 'perched', 8);
      adv(opts.t ?? 1.0);
      break;
    case 'sparrow-hunt': { // a sparrow on the sand: Kon creeps up (?phase=creep) and pounces (wiggle|air|land)
      cursor.hidden = true;
      brain.zenArmed = false;
      zen.birds.visit('sand', { x: +opts.x || 420, y: +opts.y || 960 });
      const phase = opts.phase || 'wiggle';
      if (phase === 'creep') until(() => brain.life.act && brain.life.act.id === 'bird' && zen.mover.state().gait === 'sneak' && brain.life.act.t > 2, 25);
      else until(() => brain.state === 'POUNCE' && brain.arg.phase === phase, 25);
      adv(opts.t ?? 0.3);
      break;
    }
    case 'sparrow-head': // deep meditation, and a sparrow takes a seat
      cursor.hidden = true;
      until(() => brain.isStill(), 30);
      zen.birds.visit('kon');
      until(() => zen.birds.state === 'perched', 8);
      adv(opts.t ?? 2.4);
      break;
    case 'tempt':
      cursor.hidden = true;
      until(() => brain.state === 'ZAZEN' && brain.zen.tempt && brain.stateT > brain.zen.temptAt + 1.0, 20);
      break;
    case 'zazen':
      cursor.hidden = true;
      until(() => brain.zen && brain.state === 'ZAZEN' && brain.zen.paint >= (opts.t ?? 0.6), 40);
      break;
    case 'satori':
      cursor.hidden = true;
      until(() => brain.state === 'SATORI', 45);
      adv(opts.t ?? 2.2);
      break;
    case 'gotcha':
      until(() => brain.state === 'ZAZEN' && brain.zen.tempt && brain.stateT > brain.zen.temptAt + 0.8, 20);
      adv(0.3, (t) => move(H.x + 300 + t * 200, H.y - 120));
      adv(0.5);
      break;
    case 'rake':
    case 'judge': {
      // rake a circle into the sand in front of Kon, then let Kon judge it
      const c = scene.toScreen(1010, 952);
      const r = 56 * scene.scale;
      const pe = (type, x, y) => app.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerType: 'mouse', button: 0, buttons: 1, pointerId: 1, bubbles: true }));
      pe('pointerdown', c.x + r, c.y);
      const wob = name === 'rake' ? 0.12 : 0.03;
      adv(1.6, (t) => {
        const a = (t / 1.55) * Math.PI * 2;
        const rr = r * (1 + wob * Math.sin(a * 3));
        const x = c.x + Math.cos(a) * rr, y = c.y + Math.sin(a) * rr * 0.62;
        pe('pointermove', x, y);
        cx = x; cy = y;
      });
      pe('pointerup', cx, cy);
      adv(opts.t ?? 2.0);
      break;
    }
    case 'doodle':
      cursor.hidden = true;
      adv(opts.t ?? 4.4);
      break;
    case 'go': {
      // walk to an activity (?to=basin) or a spot (?x=&y=), frozen after t seconds
      cursor.hidden = true;
      if (opts.x) goDo('wander', { spot: { x: +opts.x, y: +opts.y } });
      else goDo(opts.to || 'basin');
      adv(opts.t ?? 2.2);
      break;
    }
    case 'at': {
      cursor.hidden = true;
      goDo(opts.to || 'basin');
      until(() => brain.life.act && brain.life.act.phase === 'do', 30);
      adv(opts.t ?? 1.6);
      break;
    }
    case 'stalk2':
    case 'pounce': {
      adv(4);
      let x = H.x + (opts.from ? +opts.from : 560);
      const y = scene.toScreen(0, 905).y;
      adv(opts.dur ? +opts.dur : 4, () => { x -= 1.2; move(x, y); });
      if (name === 'pounce') {
        until(() => brain.state === 'POUNCE' && brain.arg.phase === 'air' && zen.mover.state().jumpU > (opts.t ?? 0.45), 6);
      }
      break;
    }
    // after dark: a shooting star (&caught: you caught it), the moon rabbit, a firefly on Kon's nose
    case 'meteor':
      cursor.hidden = true;
      adv(1);
      scene.spawnMeteor();
      adv(opts.caught ? 0.2 : (opts.t ?? 0.3));
      if (opts.caught) { scene.catchMeteor(scene.meteor); adv(opts.t ?? 1.6); }
      break;
    case 'moon':
      cursor.hidden = true;
      adv(1);
      if (scene.moonAt) {
        const m = scene.farToScreen(scene.moonAt.x, scene.moonAt.y, 0.22);
        const r = app.getBoundingClientRect();
        scene.skyTap(m.x + r.left, m.y + r.top);
      }
      adv(opts.t ?? 1.1);
      break;
    case 'firefly':
      cursor.hidden = true;
      adv(1);
      scene.fireflyToNose();
      until(() => brain.state === 'BOOPED', 12);
      adv(opts.t ?? 1.2);
      break;
    // a leaf drifts down onto Kon's head (&t: how long after it lands)
    case 'leafhat': {
      cursor.hidden = true;
      adv(1.5);
      const c = rig.measure().crown;
      scene.dropLeaf(c.x + 60, c.y - 280);
      scene.leaves[scene.leaves.length - 1].aim = true;
      until(() => scene.leafOnKon, 8);
      adv(opts.t ?? 1.2);
      break;
    }
    // the arrival: the camera comes down from the sky (&t: how far along)
    case 'intro':
      cursor.hidden = true;
      scene.startIntro();
      adv(opts.t ?? 0.5);
      break;
    // a flock of birds crossing the valley (already halfway over)
    case 'flock':
      cursor.hidden = true;
      adv(1);
      scene.spawnFlock();
      scene.flock.x = scene.baseVb.x + scene.baseVb.w * 0.4;
      adv(opts.t ?? 0.5);
      break;
    // ---- weather. rain: Kon under its leaf; &t: seconds in
    case 'rain':
    case 'snow':
    case 'cloudy':
      cursor.hidden = true;
      scene.setWeather(name, { dur: 1e6, instant: true });
      adv(opts.t ?? 9);
      break;
    // a puddle, and a fox who has seen it (?phase=wiggle|air|land)
    case 'puddle': {
      cursor.hidden = true;
      stay();
      scene.setWeather('rain', { dur: 1e6, instant: true });
      scene.weather.wet = 1;
      adv(4.2);
      brain.startLife('puddle');
      const phase = opts.phase || 'land';
      until(() => brain.state === 'POUNCE' && brain.arg.phase === phase && (phase !== 'air' || zen.mover.state().jumpU > 0.5), 25);
      adv(opts.t ?? (phase === 'land' ? 0.45 : 0.02));
      break;
    }
    // the rain has just passed: a rainbow, and a wet fox
    case 'rainbow':
      cursor.hidden = true;
      brain.zenArmed = false;
      scene.setWeather('rain', { dur: 1e6, instant: true });
      adv(5);
      scene.setWeather('clear', { instant: true });
      scene.weather.rain = 0;
      scene.weather.bowT = 60;
      adv(opts.t ?? 7);
      break;
    // rain out of a bright sky, and lanterns on the far shore (&u: how far the procession has come)
    case 'sunshower':
    case 'wedding':
      cursor.hidden = true;
      brain.zenArmed = false;
      scene.setWeather('sunshower', { dur: 1e6, instant: true });
      adv(4.5);
      if (name === 'wedding') {
        scene.startWedding();
        scene.wx.wedding.t = 46 * (opts.u ? +opts.u : 0.5);
      }
      adv(opts.t ?? 3.2);
      break;
    // enough snow to build with
    case 'snowfox':
      cursor.hidden = true;
      stay();
      scene.setWeather('snow', { dur: 1e6, instant: true });
      scene.weather.white = 0.95;
      adv(2);
      brain.startLife('snowfox');
      until(() => brain.life.act && brain.life.act.id === 'snowfox' && brain.life.act.phase === 'do' && brain.life.act.t > (opts.t ?? 7.2), 40);
      break;
    // squeeze a cloud (&kon=1: the one right above Kon)
    case 'cloudpoke': {
      adv(1);
      const c = scene.clouds.find((k) => k.shown > 0.9) || scene.clouds[0];
      c.x = opts.kon ? 800 + scene.camX * 0.26 + 20 : scene.baseVb.x + scene.baseVb.w * 0.7;
      c.v = 0.75;
      adv(0.1);
      const q = scene.farToScreen(c.x, c.y - c.h * c.s * 0.4, 0.26);
      const r = app.getBoundingClientRect();
      move(q.x, q.y);
      scene.skyTap(q.x + r.left, q.y + r.top);
      adv(opts.t ?? 1.5);
      break;
    }
    // a cloud that looks like something (?shape=fox|fish|rabbit)
    case 'cloudshape': {
      cursor.hidden = true;
      const c = scene.clouds[0];
      scene.shapeCloud(c, opts.shape || 'fox');
      c.told = false;
      c.v = 0.6;
      c.x = scene.baseVb.x + scene.baseVb.w * 0.62 + scene.camX * 0.26;
      adv(opts.t ?? 2.2);
      break;
    }
    // the pebbles (?mode=parade|tower|zen|lantern; &watch=1: the cursor moves, and they are only pebbles; &kon=1: Kon goes to look)
    case 'tsubu': {
      cursor.hidden = !opts.watch;
      stay();
      if (!opts.kon) brain.life.lastVisit.tsubu = 1e9;
      adv(1);
      zen.spirits.outing(opts.mode || 'parade', zen.spirits.ctx, opts.x ? { x: +opts.x, y: +opts.y } : { x: 868, y: 922 });
      adv(opts.rise ? +opts.rise : 6.5);
      if (opts.kon) {
        brain.startLife('tsubu');
        until(() => brain.life.act && brain.life.act.id === 'tsubu' && brain.life.act.phase === 'do' && brain.life.act.t > (opts.t ?? 2.4), 30);
      } else if (opts.watch) {
        const sp = zen.spirits.out[0];
        const q = scene.toScreen(sp.x + 120, sp.y - 90);
        adv(opts.t ?? 0.5, (t) => move(q.x + t * 60, q.y));
      } else adv(opts.t ?? 0);
      break;
    }
    // true meditation, in company
    case 'tsubu-zen':
      cursor.hidden = true;
      until(() => brain.isStill(), 30);
      zen.spirits.outing('zen', zen.spirits.ctx, { x: 868, y: 922 });
      adv(opts.t ?? 12);
      break;
    // the temari: Kon bats it about (&fetch=1: you kicked it first)
    case 'ball': {
      stay();
      cursor.hidden = !opts.fetch;
      adv(1);
      if (opts.fetch) {
        const q = scene.toScreen(zen.ball.x + 60, zen.ball.y - 16);
        adv(0.3, (t) => move(q.x - t * 400, q.y));
      } else brain.startLife('ball', { max: 3 });
      until(() => brain.life.act && brain.life.act.id === 'ball' && brain.life.act.phase === 'bat' && brain.life.act.t > (opts.t ?? 0.42), 20);
      break;
    }
    // a rainy day's frog, and Kon's attempt at its language
    case 'frog': {
      cursor.hidden = true;
      stay();
      scene.setWeather('rain', { dur: 1e6, instant: true });
      adv(4.2);
      zen.frog.appear();
      until(() => zen.frog.state === 'sit', 8);
      if (opts.peek) { adv(opts.t ?? 0.5); break; }
      zen.frog.bold = 2;   // (this one holds its ground)
      brain.startLife('frog');
      until(() => brain.life.act && brain.life.act.id === 'frog' && brain.life.act.phase === 'do', 20);
      zen.frog.croakAt = 0;
      adv(opts.t ?? 1.1);
      break;
    }
    // a butterfly (?on=flower|cursor|nose)
    case 'butterfly': {
      const on = opts.on || 'flower';
      cursor.hidden = on !== 'cursor';
      brain.zenArmed = false;
      adv(1);
      if (on === 'cursor') move(H.x + 250, H.y - 60);
      zen.butterfly.visit();
      if (on === 'nose') { zen.butterfly.goal = { kind: 'nose', x: 0, y: 0 }; zen.butterfly.nosed = true; }
      until(() => zen.butterfly.state === on, 30);
      adv(opts.t ?? 1.2);
      break;
    }
    case 'tail':
      cursor.hidden = true;
      stay();
      brain.startLife('tail', { spot: { x: 900, y: 915 } });
      until(() => brain.life.act && brain.life.act.id === 'tail' && brain.life.act.phase === 'do' && brain.life.act.t > (opts.t ?? 2), 20);
      break;
    // after dark: paper lanterns on the lake, and something watching from the trees
    case 'toro':
      cursor.hidden = true;
      adv(1);
      scene.startToro();
      for (const L of scene.toro) L.x += 300;
      scene.startEyes();
      adv(opts.t ?? 1.5);
      break;
    // fast asleep, and dreaming (&n: which dream)
    case 'dream':
      cursor.hidden = true;
      adv(40);
      until(() => brain.state === 'SLEEPING', 40);
      adv(4.6 + (opts.n ? +opts.n : 0) * 4.8 + 2.2);
      break;
    case 'gust':
      cursor.hidden = true;
      scene.gust(opts.k ? +opts.k : 1);
      if (opts.lens) scene.lensAt = scene.t + 0.01;
      adv(opts.t ?? 1.4);
      break;
    case 'night':
      cursor.hidden = true;
      scene.toggleNight(true);
      adv(opts.t ?? 9);
      break;
    default:
      break;
  }
  cursor.style.transform = `translate(${cx - 3}px, ${cy - 2}px)`;
  document.title = `demo:${name} → ${brain.state}${brain.act ? ':' + brain.act.name : ''}`;
  return brain.debug();
}
