// Garden props — the small living things you can play with and that move on
// their own: lantern and night, the shishi-odoshi, the maple and its falling
// leaves, the snail, the flower, the wish plaque's swing, the paper crane, the
// dragonfly, fireflies and the firefly cursor. Mixed into Scene (see scene.js).

import { clamp, lerp, smoothstep, DEG, noise1 } from '../math.js';
import { $, f2, svgEl } from '../util.js';
import { PLACES } from './world.js';
import { periodOf } from './sky.js';

// where a lantern click takes the clock: well into the night, or a fresh morning
const NIGHT_HOUR = 22.6;   // (on a laptop screen, the full moon rises behind the pagoda)
const MORNING_HOUR = 7.9;
import { LEAF_COLORS } from './art.js';

export class GardenProps {
  /** Everything in the garden that moves on its own, once per frame. */
  updateProps(dt) {
    const t = this.t;
    this.updateShishi(dt);
    this.updateMaple(dt);
    this.updateLeaves(dt);
    this.updateDragonfly(dt);
    this.updateCrane(dt);
    if (this.dark || this.sky.p.stars > 0.05) this.updateFireflies(dt);

    // flower
    const fb = this.flowerBob.step(dt, 0);
    const lean = -this.wind * 9;
    $('flower-stem').setAttribute('transform', `translate(660 826) rotate(${f2(fb * 0.12 + Math.sin(t * 1.1) * 1.2 * (1 + this.wind * 3) + lean)})`);
    $('flower-head').setAttribute('transform', `translate(10 -54) rotate(${f2(fb * 0.3)})`);

    // ema
    const sw = this.emaSwing.step(dt, 0);
    this.placeEma(clamp(sw, -12, 12) + Math.sin(t * 0.8) * 0.5);

    // snail
    const sn = this.snailIn.step(dt, t < this.snailHideUntil ? 1 : 0);
    const crawl = Math.sin(t * 0.3) * 0.5;
    $('snail-body').setAttribute('transform', `translate(${f2(-sn * 6 + crawl)} 0) scale(${f2(1 - sn * 0.75)} ${f2(1 - sn * 0.4)})`);

    // lantern flicker
    const lamp = this.sky.p.lamp;
    if (lamp > 0.01) {
      const fl = 0.85 + 0.1 * noise1(t * 3.1) + 0.05 * noise1(t * 11, 3);
      this.lampFlicker = fl;
      $('lantern-halo').setAttribute('r', f2(200 + fl * 20));
      $('lantern-halo').style.opacity = f2(fl * lamp);
    }

    // auto events
    if (t > this.nextLeafAt) {
      const sp = this.mapleSpots[Math.floor(this.rng() * this.mapleSpots.length)];
      const spot = this.mapleToWorld(sp[0], sp[1]);
      if (spot.x > this.vb.x && spot.x < this.vb.x + this.vb.w) {
        this.dropLeaf(spot.x, spot.y);
        // now and then a leaf finds its way to a fox sitting very still
        const birdOnKon = this.visitor && this.visitor.perch?.id === 'kon' && this.visitor.state !== 'flyAway';
        if (this.konStill && !this.leafOnKon && !birdOnKon && !this.reduced && this.rng() < 0.45) this.leaves[this.leaves.length - 1].aim = true;
      }
      this.nextLeafAt = t + 16 + this.rng() * 18;
    }
    if (t > this.nextDragonflyAt) {
      this.spawnDragonfly();
      this.nextDragonflyAt = t + 55 + this.rng() * 50;
    }
  }

  // ------------------------------------------------------------------ interactions
  bindInteractions() {
    const stop = (e) => e.stopPropagation();
    // raking: press on open sand and drag
    this.app.addEventListener('pointerdown', (e) => {
      // the sky has things to poke (clouds) and, after dark, to catch
      if (!(e.target.closest && e.target.closest('.corner, .brand, .ema, .hints')) && this.skyTap(e.clientX, e.clientY)) return;
      // the small things on the sand come first: a tap on the ball, a pebble or the frog is not a rake stroke
      const at = this.toWorld(e.clientX, e.clientY);
      if (!(e.target.closest && e.target.closest('.corner, .brand, .ema, .hints')) && this.tapSmall(at)) return;
      if (this.rake.tryBegin(e, at)) {
        try { this.app.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      }
    });
    this.app.addEventListener('pointermove', (e) => {
      if (this.rake.active) this.rake.extend(e, this.toWorld(e.clientX, e.clientY));
      // a mouse looks around: the layers shift against each other (a touch doesn't: fingers jump)
      if (e.pointerType === 'mouse' && this.W) {
        const r = this.app.getBoundingClientRect();
        this.pointerScreen = { x: e.clientX - r.left, y: e.clientY - r.top };
        this.lookT.x = clamp(((e.clientX - r.left) / this.W) * 2 - 1, -1, 1);
        this.lookT.y = clamp(((e.clientY - r.top) / this.H) * 2 - 1, -1, 1);
      }
    });
    this.app.addEventListener('pointerleave', () => { this.lookT.x = 0; this.lookT.y = 0; });
    const endRake = (e) => { if (this.rake.active) this.rake.end(e); };
    this.app.addEventListener('pointerup', endRake);
    this.app.addEventListener('pointercancel', endRake);
    $('lantern').addEventListener('click', () => this.toggleNight());
    $('shishi').addEventListener('click', () => this.tipShishi(true));
    $('maple').addEventListener('click', (e) => {
      const w = this.toWorld(e.clientX, e.clientY);
      this.shakeMaple(w);
    });
    $('maple').addEventListener('pointerenter', () => { this.mapleShake.v += 0.6; });
    $('flower').addEventListener('pointerenter', () => this.pokeFlower(0.6));
    $('flower').addEventListener('click', () => this.pokeFlower(1));
    $('snail').addEventListener('click', (e) => {
      stop(e);
      this.hideSnail();
      this.emit({ type: 'notice', x: PLACES.snail.x, y: PLACES.snail.y });
      this.emit({ type: 'sfx', name: 'boop' });
    });
    const keyClick = (id, fn) => {
      const el = $(id);
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
      });
    };
    keyClick('lantern', () => this.toggleNight());
    keyClick('shishi', () => this.tipShishi(true));
    keyClick('maple', () => this.shakeMaple(null));
  }

  /** A tap on one of the small things that live on the sand. Returns true if it was used. */
  tapSmall(at) {
    if (this.spirits && this.spirits.tap(at.x, at.y)) { this.emit({ type: 'sfx', name: 'squeak' }); return true; }
    if (this.frog && this.frog.tap(at.x, at.y)) return true;
    if (this.ball && this.ball.tap(at.x, at.y)) { this.emit({ type: 'sfx', name: 'bounce', k: 0.7 }); return true; }
    // a tap in a puddle: a splash, of course
    if (this.puddleAt(at.x, at.y)) { this.splash(at.x, at.y, 0.55); this.emit({ type: 'notice', x: at.x, y: at.y }); return true; }
    return false;
  }

  /**
   * The lantern doesn't flip a switch: it runs the clock. Lighting it lets the
   * sun go down and the moon come up; putting it out runs through the small
   * hours into the morning. (Clicked again mid-way, the clock runs back.)
   * Night itself (and Kon's reaction to it) arrives when the sky gets dark.
   */
  toggleNight(force) {
    const goal = force ?? !(this.sky.lapsing ? this.goal : this.night);
    const back = this.sky.lapsing && goal !== this.goal && this.lapseFrom !== undefined;
    this.goal = goal;
    if (back) this.sky.lapseTo(this.lapseFrom, 2.4, { back: true });
    else {
      this.lapseFrom = this.sky.hour;
      this.sky.lapseTo(goal ? NIGHT_HOUR : MORNING_HOUR, goal ? 8 : 6.5);
    }
    if (!this.sky.lapsing) this.setNight(goal, true);
    const b = this.baseVb || { x: 0, w: 1600 };
    // where to look: the sun going down, or the moon going away
    const at = goal ? { x: b.x + b.w * 0.86, y: 330 } : { x: b.x + b.w * 0.5, y: 280 };
    this.emit({ type: 'lapse', to: goal ? 'night' : 'day', x: at.x, y: at.y, back });
    this.emit({ type: 'sfx', name: 'lantern' });
  }

  /** Night falls (or lifts). `announce`: tell Kon (a lantern time-lapse got there). */
  setNight(night, announce = false) {
    if (night === this.night) return;
    this.night = night;
    document.body.classList.toggle('is-night', night);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', night ? '#2a2f4a' : '#f1e7d3');
    if (announce) this.emit({ type: 'night', on: night });
  }

  /** Follow the visitor's local time (plus however far the lantern has moved the clock). */
  setTimeOfDay(hour) {
    if (this.sky.lapsing) return periodOf(this.sky.hour);
    this.sky.set(hour + this.clockOffset);
    if (this.sky.night !== this.night) this.setNight(this.sky.night);
    const period = this.sky.period;
    document.body.classList.toggle('is-dusk', period === 'dusk');
    document.body.classList.toggle('is-dawn', period === 'dawn');
    return period;
  }

  followClock() {
    if (this.clock) this.setTimeOfDay(this.clock());
  }

  /** The sun and the moon on their arcs; stars and the dark-mode UI with the light. */
  updateSkyBodies() {
    const p = this.sky.p;
    // sun and moon arcs are given as fractions of the screen's width
    const b = this.baseVb || { x: 0, w: 1600 };
    p.sun.x = b.x + b.w * p.sun.fx;
    p.moon.x = b.x + b.w * p.moon.fx;
    const sun = p.sun.up ? `translate(${f2(p.sun.x)} ${f2(p.sun.y)})` : 'translate(-999 -999)';
    if (sun !== this.sunAt) { this.sunAt = sun; $('sun').setAttribute('transform', sun); }
    // (on very wide screens little sky shows: keep the moon in it)
    const my = Math.max(p.moon.y, Math.min(400, this.baseVb ? this.baseVb.y + 64 : 0));
    const moon = p.moon.up ? `translate(${f2(p.moon.x)} ${f2(my)})` : 'translate(-999 -999)';
    this.moonAt = p.moon.up ? { x: p.moon.x, y: my } : null;
    if (moon !== this.moonKey) { this.moonKey = moon; $('moon').setAttribute('transform', moon); }
    const starsOn = p.stars > 0.004;
    if (starsOn !== this.starsOn) { this.starsOn = starsOn; this.farLayers.stars.style.display = starsOn ? '' : 'none'; }
    const dark = this.dark ? p.stars > 0.4 : p.stars > 0.5;
    if (dark !== this.dark) { this.dark = dark; document.body.classList.toggle('is-dark', dark); }
    // a lantern time-lapse: night begins (or ends) when the sky says so
    if (this.sky.lapsing && this.goal !== undefined && dark === this.goal) this.setNight(this.goal, true);
  }

  /** At night the cursor becomes a firefly, trailing a little light. */
  updateCursor(dt, pointer) {
    const cg = this.cursorGlow;
    if (!this.night || !pointer.present || pointer.isTouch) {
      if (cg.on) { $('cursor-firefly').style.display = 'none'; cg.on = false; }
      return;
    }
    if (!cg.built) {
      const host = $('cursor-firefly');
      for (let i = 0; i < 6; i++) {
        const el = svgEl('circle', { r: f2(10 - i * 1.3), fill: 'url(#firefly)' }, host);
        cg.trail.push({ el, x: pointer.x, y: pointer.y });
      }
      cg.built = true;
    }
    if (!cg.on) { $('cursor-firefly').style.display = ''; cg.on = true; }
    let tx = pointer.x, ty = pointer.y;
    cg.trail.forEach((d, i) => {
      const k = 1 - Math.exp(-dt * (28 - i * 3.6));
      d.x += (tx - d.x) * k;
      d.y += (ty - d.y) * k;
      d.el.setAttribute('cx', f2(d.x));
      d.el.setAttribute('cy', f2(d.y));
      d.el.style.opacity = f2((0.95 - i * 0.13) * (0.8 + 0.2 * Math.sin(this.t * 7 + i)));
      tx = d.x; ty = d.y;
    });
  }

  tipShishi(user) {
    const sh = this.shishi;
    if (sh.phase === 'filling') {
      sh.fill = 1;
      sh.user = user;
    } else if (sh.phase === 'returning' && user) {
      sh.av -= 30;
    }
  }

  shakeMaple(at) {
    this.mapleShake.v += 2.4;
    this.emit({ type: 'sfx', name: 'leaves' });
    const n = 3 + Math.floor(this.rng() * 3);
    for (let i = 0; i < n; i++) {
      const sp = this.mapleSpots[Math.floor(this.rng() * this.mapleSpots.length)];
      const spot = this.mapleToWorld(sp[0], sp[1]);
      const x = at && i === 0 ? at.x : spot.x;
      const y = at && i === 0 ? at.y : spot.y;
      this.dropLeaf(x + (this.rng() * 2 - 1) * 20, y, i * 0.12, true);
    }
  }

  dropLeaf(x, y, delay = 0, byVisitor = false) {
    if (this.leaves.length > 18) {
      const old = this.leaves.find((l) => l.landed);
      if (old) { old.g.remove(); this.leaves.splice(this.leaves.indexOf(old), 1); } else return;
    }
    const color = LEAF_COLORS[Math.floor(this.rng() * LEAF_COLORS.length)];
    const g = this.makeLeaf($('leaves-fx'), 12 + this.rng() * 7, color);
    g.style.opacity = delay > 0 ? '0' : '1';
    // land in front of Kon's cushion, never behind it
    let landY = 868 + this.rng() * 110;
    // the breeze carries leaves from the branch out over the garden
    const vx = (this.rng() * 2 - 1) * 14 - 8 - Math.max(0, x - 1000) * 0.09;
    this.leaves.push({
      g, x, y, vx, vy: 0, rot: this.rng() * 360,
      seed: this.rng() * 10, delay, landY, landed: false, landedAt: 0, id: 'leaf' + Math.floor(this.rng() * 1e6),
      born: this.t, byVisitor,
    });
  }

  /** A leaf resting on Kon's head: it rides along until Kon moves (or blows it off). */
  leafOnHead(L, dt) {
    const crown = this.konBody && this.konBody.crown;
    if (!crown || !this.konCalm) { this.dropLeafFromKon(L, 0); return; }
    const ks = this.konBody.scale || 1;
    L.x = crown.x + 6 * ks;
    L.y = crown.y - 13 * ks;
    L.g.setAttribute('transform', `translate(${f2(L.x)} ${f2(L.y)}) rotate(${f2(L.rot)}) scale(${f2(1.25)} ${f2(0.8)})`);
    L.onT = (L.onT || 0) + dt;
  }

  /** The leaf leaves Kon's head: slides off, or (blown) flies up first. */
  dropLeafFromKon(L = this.leafOnKon, up = 0) {
    if (!L) return;
    L.onKon = false;
    L.aim = false;
    L.landed = false;
    L.vy = -up;
    L.vx = up ? 70 : (this.rng() * 2 - 1) * 30;
    L.landY = Math.max((this.konAt ? this.konAt.y : 830) + 26, 868) + this.rng() * 40;
    if (this.leafOnKon === L) this.leafOnKon = null;
  }

  blowLeaf() { this.dropLeafFromKon(this.leafOnKon, 190); }

  /** Kon landed on a leaf: it flies up and flutters down again a little way off. */
  scatterLeaf(id) {
    const L = this.leaves.find((l) => l.id === id);
    if (!L) return;
    L.landed = false;
    L.scattered = true;
    L.vy = -170;
    L.vx = (this.rng() * 2 - 1) * 60;
    L.landY = Math.min(990, L.y + 10 + this.rng() * 30);
  }

  hideSnail() {
    this.snailHideUntil = this.t + 3.2;
  }

  pokeFlower(k = 1) {
    this.flowerBob.v += 120 * k * (this.rng() < 0.5 ? -1 : 1);
  }

  nudgeEma(k = 1) {
    this.emaSwing.v += (this.rng() < 0.5 ? -1 : 1) * 14 * k;
  }

  spawnDragonfly() {
    if (this.dragonfly || this.reduced) return;
    const g = svgEl('g', { class: 'dragonfly' }, $('fx-world'));
    const wings = svgEl('g', {}, g);
    const w1 = svgEl('ellipse', { cx: -2, cy: -11, rx: 4.5, ry: 12, class: 'dragonfly-wing', transform: 'rotate(-20)' }, wings);
    const w2 = svgEl('ellipse', { cx: -2, cy: 11, rx: 4.5, ry: 12, class: 'dragonfly-wing', transform: 'rotate(20)' }, wings);
    const w3 = svgEl('ellipse', { cx: 5, cy: -10, rx: 4, ry: 11, class: 'dragonfly-wing', transform: 'rotate(15)' }, wings);
    const w4 = svgEl('ellipse', { cx: 5, cy: 10, rx: 4, ry: 11, class: 'dragonfly-wing', transform: 'rotate(-15)' }, wings);
    svgEl('path', { d: 'M -28,0 L 4,0', class: 'dragonfly-body' }, g);
    svgEl('circle', { cx: 8, cy: 0, r: 4.2, class: 'dragonfly-head' }, g);
    const fromLeft = this.rng() < 0.5;
    const sx = fromLeft ? this.vb.x - 60 : this.vb.x + this.vb.w + 60;
    const head = { x: 800, y: 620 };
    const side = fromLeft ? -1 : 1;
    this.dragonfly = {
      g, wings: [w1, w2, w3, w4],
      x: sx, y: 380 + this.rng() * 120,
      vx: 0, vy: 0, t: 0,
      way: [
        { x: head.x + side * 230, y: head.y - 170, hold: 1.6 },
        { x: head.x - side * 60, y: head.y - 230, hold: 1.4 },
        { x: head.x + side * 140, y: head.y - 120, hold: 1.0 },
        { x: fromLeft ? this.vb.x + this.vb.w + 120 : this.vb.x - 120, y: 300, hold: 0 },
      ],
      wi: 0, holdT: 0, seed: this.rng() * 10,
    };
  }

  launchCrane(golden = false) {
    if (this.crane) this.crane.g.remove();
    const g = svgEl('g', { class: golden ? 'crane-gold' : '' }, $('fx-world'));
    const wingBack = svgEl('path', { d: 'M 0,0 L -8,-30 L 14,-4 Z', class: 'crane-fold' }, g);
    svgEl('path', { d: 'M -26,4 L 0,-6 L 24,2 L 4,10 Z', class: 'crane-body' }, g);
    svgEl('path', { d: 'M 20,2 L 34,-18 L 30,-20 L 40,-22 L 36,-16 L 24,4 Z', class: 'crane-body' }, g);
    svgEl('path', { d: 'M -22,4 L -40,-14 L -16,0 Z', class: 'crane-body' }, g);
    const wing = svgEl('path', { d: 'M -4,0 L -18,-34 L 12,-3 Z', class: 'crane-body' }, g);
    let start = { x: 1300, y: 720 };
    if (this.mode !== 'wide') {
      const r = this.ema.getBoundingClientRect();
      const a = this.app.getBoundingClientRect();
      start = this.toWorldLocal(r.left - a.left + r.width / 2, r.top - a.top + r.height * 0.4);
    }
    this.crane = { g, wing, wingBack, t: 0, dur: 4.2, x: start.x, y: start.y, p0: start, p1: { x: start.x - 120, y: start.y - 420 }, p2: { x: 760, y: 120 }, p3: { x: 380, y: -320 } };
    this.emit({ type: 'sfx', name: 'chime' });
  }

  updateShishi(dt) {
    const sh = this.shishi;
    if (sh.phase === 'filling') {
      sh.fill += dt / sh.fillTime;
      sh.angle = lerp(sh.angle, 18 - sh.fill * 7, 1 - Math.exp(-dt * 4));
      sh.dripT -= dt;
      if (sh.dripT <= 0) {
        this.spawnDrop(440, 812, 440, 832 - sh.fill * 2);
        sh.dripT = 0.32;
      }
      if (sh.fill >= 1) { sh.phase = 'pouring'; sh.av = 0; }
    } else if (sh.phase === 'pouring') {
      sh.av -= 520 * dt;
      sh.angle += sh.av * dt;
      if (sh.angle <= -14) {
        sh.angle = -14;
        sh.av = 0;
        sh.pourT += dt;
        if (sh.pourT < dt * 1.5) {
          for (let i = 0; i < 6; i++) this.spawnDrop(432 + this.rng() * 10, 896, 440 + (this.rng() * 2 - 1) * 30, 888, true);
          this.emit({ type: 'sfx', name: 'pour' });
        }
        if (sh.pourT > 0.45) { sh.phase = 'returning'; sh.pourT = 0; sh.fill = 0; }
      }
    } else if (sh.phase === 'returning') {
      sh.av += 900 * dt;
      sh.angle += sh.av * dt;
      if (sh.angle >= 18) {
        sh.angle = 18;
        const impact = sh.av;
        sh.av = -sh.av * 0.28;
        if (impact > 60) {
          this.emit({ type: 'clack', x: 630, y: 890, user: !!sh.user });
          this.emit({ type: 'sfx', name: 'clack', k: clamp(impact / 400) });
          sh.user = false;
        }
        if (Math.abs(sh.av) < 30) {
          sh.phase = 'filling';
          sh.av = 0;
          sh.fillTime = 11 + this.rng() * 7;
        }
      }
    }
    this.shishiTube.setAttribute('transform', `translate(560 870) rotate(${f2(sh.angle)})`);
    // drops
    for (let i = this.waterDrops.length - 1; i >= 0; i--) {
      const d = this.waterDrops[i];
      d.t += dt;
      d.vy += 900 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y >= d.ty || d.t > 1.5) {
        d.el.remove();
        this.waterDrops.splice(i, 1);
        continue;
      }
      d.el.setAttribute('transform', `translate(${f2(d.x)} ${f2(d.y)})`);
    }
    const rip = $('basin-ripple');
    rip.setAttribute('transform', `translate(0 ${f2(Math.sin(this.t * 1.7) * 0.8)})`);
    // the moon's reflection shivers on the water (and hides when Kon leans over it to drink)
    if (this.sky.p.stars > 0.05) {
      const m = $('basin-moon');
      const near = this.konAt && Math.hypot(this.konAt.x - 470, this.konAt.y - 890) < 150;
      m.style.display = near || !this.moonAt ? 'none' : '';
      m.setAttribute('rx', f2(7 + Math.sin(this.t * 2.3) * 1.1 + (this.waterDrops.length ? 1.5 : 0)));
    }
  }

  spawnDrop(x, y, tx, ty, splash = false) {
    if (this.waterDrops.length > 16) return;
    const el = svgEl('ellipse', { rx: splash ? 2.4 : 2, ry: splash ? 2.4 : 3, class: 'water-drop' }, $('water-fx'));
    this.waterDrops.push({ el, x, y, vx: splash ? (tx - x) * 2 : 0, vy: splash ? -120 - this.rng() * 80 : 0, ty: splash ? ty + 6 : ty, t: 0 });
  }

  updateMaple(dt) {
    const sk = this.mapleShake.step(dt, 0);
    const t = this.t;
    // the gentle sway is a rotation of the whole layer: composited, never redrawn
    const sway = Math.sin(t * 0.55) * 0.35 + sk * 1.6 + this.wind * (0.7 + 0.5 * Math.sin(t * 3.1));
    this.mapleSwayDeg = sway; // (applyCamera turns the layer)
    // single leaves only flutter while the branch is actually being shaken
    if (this.reduced || (Math.abs(sk) < 0.01 && Math.abs(this.mapleShake.v) < 0.05)) {
      if (this.mapleFluttering) {
        this.mapleFluttering = false;
        for (const L of this.mapleLeaves) L.g.setAttribute('transform', `translate(${f2(L.x)} ${f2(L.y)}) rotate(${f2(L.rot)})`);
      }
      return;
    }
    this.mapleFluttering = true;
    for (const L of this.mapleLeaves) {
      const r = L.rot + Math.sin(t * 1.6 + L.seed) * 4 + sk * 14 * Math.sin(L.seed * 3);
      L.g.setAttribute('transform', `translate(${f2(L.x)} ${f2(L.y)}) rotate(${f2(r)})`);
    }
  }


  updateLeaves(dt) {
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const L = this.leaves[i];
      if (L.delay > 0) {
        L.delay -= dt;
        if (L.delay <= 0) L.g.style.opacity = '1';
        continue;
      }
      if (L.onKon) { this.leafOnHead(L, dt); continue; }
      if (!L.landed) {
        const tt = this.t + L.seed;
        L.vy = lerp(L.vy, 84 + Math.sin(tt * 2.2) * 30 - this.wind * 30, 1 - Math.exp(-dt * 3));
        // the wind carries leaves off to the left
        L.x += (L.vx + Math.sin(tt * 1.7) * 38 - this.wind * 230) * dt;
        L.y += L.vy * dt;
        L.rot += Math.sin(tt * 1.3) * 90 * dt;
        // an aimed leaf drifts toward Kon's head, and settles there if Kon is still
        const crown = this.konBody && this.konBody.crown;
        if (L.aim && crown) {
          const k = smoothstep(crown.y - 300, crown.y - 60, L.y);
          L.x += (crown.x - 4 - L.x) * (1 - Math.exp(-dt * 3.2 * k));
          if (L.y >= crown.y - 6) {
            const birdOnKon = this.visitor && this.visitor.perch?.id === 'kon' && this.visitor.state !== 'flyAway';
            if (this.konStill && !this.leafOnKon && !birdOnKon && Math.abs(L.x - crown.x) < 40) {
              L.onKon = true;
              L.rot = -24 + this.rng() * 18;
              this.leafOnKon = L;
              this.emit({ type: 'leafOnHead' });
              continue;
            }
            L.aim = false;
          }
        }
        if (L.y >= L.landY) {
          L.landed = true;
          L.landedAt = this.t;
        }
        L.g.setAttribute('transform', `translate(${f2(L.x)} ${f2(L.y)}) rotate(${f2(L.rot)}) scale(1 ${f2(0.75 + 0.25 * Math.sin(tt * 3))})`);
      } else {
        const age = this.t - L.landedAt;
        // a strong gust sends fallen leaves skittering over the sand
        if (this.wind > 0.4 && !this.reduced) {
          const push = (this.wind - 0.4) * 110 * (0.6 + 0.4 * Math.sin(L.seed * 7));
          L.x -= push * dt;
          L.rot -= push * 2.2 * dt;
          L.g.setAttribute('transform', `translate(${f2(L.x)} ${f2(L.y)}) rotate(${f2(L.rot)}) scale(1 0.5)`);
        }
        if (age < 0.4) L.g.setAttribute('transform', `translate(${f2(L.x)} ${f2(L.y)}) rotate(${f2(L.rot)}) scale(1 ${f2(lerp(0.75, 0.5, age / 0.4))})`);
        if (age > 16) L.g.style.opacity = f2(1 - (age - 16) / 2);
        if (age > 18) {
          L.g.remove();
          this.leaves.splice(i, 1);
        }
      }
    }
  }

  updateDragonfly(dt) {
    const d = this.dragonfly;
    if (!d) return;
    d.t += dt;
    const w = d.way[d.wi];
    const jx = noise1(d.t * 1.8, d.seed) * 26, jy = noise1(d.t * 2.1, d.seed + 5) * 18;
    const tx = w.x + jx, ty = w.y + jy;
    const k = 5.5;
    d.vx += ((tx - d.x) * k * k - 2 * 0.85 * k * d.vx) * dt;
    d.vy += ((ty - d.y) * k * k - 2 * 0.85 * k * d.vy) * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (Math.hypot(w.x - d.x, w.y - d.y) < 40) {
      d.holdT += dt;
      if (d.holdT > w.hold) {
        d.holdT = 0;
        d.wi++;
        if (d.wi >= d.way.length) {
          d.g.remove();
          this.dragonfly = null;
          return;
        }
      }
    }
    const ang = Math.atan2(d.vy, d.vx) / DEG;
    const flap = 0.35 + 0.65 * Math.abs(Math.sin(d.t * 55));
    for (const wg of d.wings) wg.setAttribute('ry', f2(12 * flap));
    d.g.setAttribute('transform', `translate(${f2(d.x)} ${f2(d.y)}) rotate(${f2(Math.abs(d.vx) + Math.abs(d.vy) > 40 ? ang : 0)})`);
  }

  updateCrane(dt) {
    const c = this.crane;
    if (!c) return;
    c.t += dt;
    const u = clamp(c.t / c.dur);
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const b = (a, b2, c2, d2, t) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b2 + 3 * (1 - t) * t * t * c2 + t ** 3 * d2;
    const x = b(c.p0.x, c.p1.x, c.p2.x, c.p3.x, e);
    const y = b(c.p0.y, c.p1.y, c.p2.y, c.p3.y, e);
    const flap = Math.sin(c.t * 9);
    c.wing.setAttribute('transform', `scale(1 ${f2(flap)})`);
    c.wingBack.setAttribute('transform', `scale(1 ${f2(-flap * 0.8)})`);
    const sc = lerp(0.5, 1.3, smoothstep(0, 0.15, u)) * lerp(1, 0.7, u);
    c.g.setAttribute('transform', `translate(${f2(x)} ${f2(y)}) scale(${f2(-sc)} ${f2(sc)})`);
    c.x = x;
    c.y = y;
    if (u >= 1) {
      c.g.remove();
      this.crane = null;
    }
  }

  updateFireflies(dt) {
    const t = this.t;
    for (const f of this.fireflies) {
      if (this.fly && this.fly.f === f) continue; // (that one is visiting Kon)
      const x = f.x + noise1(t * f.speed, f.seed) * 90;
      const y = f.y + noise1(t * f.speed * 1.2, f.seed + 9) * 60;
      const on = 0.25 + 0.75 * Math.max(0, Math.sin(t * 1.3 + f.seed));
      f.el.setAttribute('cx', f2(x));
      f.el.setAttribute('cy', f2(y));
      f.el.style.opacity = f2(on);
      f.cx = x; f.cy = y; f.on = on;
    }
  }
}
