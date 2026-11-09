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
    case 'gust':
      cursor.hidden = true;
      scene.gust(opts.k ? +opts.k : 1);
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
