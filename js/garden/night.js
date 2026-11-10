// Night — small wonders after dark. Mixed into Scene (see scene.js).
//
//  · Shooting stars, now and then. Kon makes a wish on each one. Catch one
//    (click or tap it) and the wish plaque glows: a wish sent while it glows
//    leaves on a golden crane.
//  · The rabbit in the moon is pounding mochi. Poke the moon to watch.
//  · Once in a while a firefly takes an interest in Kon's nose.

import { smoothstep, TAU } from '../math.js';
import { $, f2, svgEl } from '../util.js';

const METEOR_SPEED = 780; // world units per second
const METEOR_LIFE = 0.95;

export class GardenNight {
  // ------------------------------------------------------------------ shooting stars
  spawnMeteor() {
    const vb = this.baseVb || this.vb;
    const left = this.rng() < 0.5;
    // shallow, so it stays in the sky (on a wide screen there's only a band of it)
    const ang = left ? Math.PI - 0.16 - this.rng() * 0.2 : 0.16 + this.rng() * 0.2;
    const x0 = vb.x + vb.w * (left ? 0.5 + this.rng() * 0.35 : 0.15 + this.rng() * 0.35);
    const top = Math.max(vb.y + 26, 110);
    const y0 = top + this.rng() * Math.max(20, 270 - top);
    const g = svgEl('g', { class: 'meteor-g' }, $('meteors'));
    const len = 170 + this.rng() * 90;
    svgEl('path', { d: `M ${f2(-len * 0.7)},0 L 0,0`, class: 'meteor meteor-glow' }, g);
    svgEl('path', { d: `M ${f2(-len)},0 L 0,0`, class: 'meteor' }, g);
    svgEl('circle', { r: 7, class: 'meteor-halo' }, g);
    svgEl('circle', { r: 2.6, class: 'meteor-head' }, g);
    const m = { g, x0, y0, ang, t: 0, x: x0, y: y0 };
    this.meteor = m;
    this.placeMeteor(m);
    // tell Kon where to look (it's in the far sky: where it shows on screen, in world terms)
    const s = this.farToScreen(x0, y0, 0.22);
    const w = this.toWorldLocal(s.x, s.y);
    this.emit({ type: 'meteor', x: w.x, y: w.y });
  }

  placeMeteor(m) {
    const u = m.t / METEOR_LIFE;
    m.x = m.x0 + Math.cos(m.ang) * METEOR_SPEED * m.t;
    m.y = m.y0 + Math.sin(m.ang) * METEOR_SPEED * m.t;
    m.g.setAttribute('transform', `translate(${f2(m.x)} ${f2(m.y)}) rotate(${f2((m.ang * 180) / Math.PI)})`);
    m.g.style.opacity = f2(smoothstep(0, 0.12, u) * (1 - smoothstep(0.65, 1, u)));
  }

  /** A click or tap on the sky: catch a falling star, or poke the moon. Returns true if it was used. */
  skyTap(cx, cy) {
    if (this.sky.p.stars < 0.4) return false;
    const r = this.app.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    const m = this.meteor;
    if (m && !m.caught) {
      const s = this.farToScreen(m.x, m.y, 0.22);
      if (Math.hypot(px - s.x, py - s.y) < 70 + 50 * this.scale) { this.catchMeteor(m); return true; }
    }
    const moon = this.moonAt && this.farToScreen(this.moonAt.x, this.moonAt.y, 0.22);
    if (moon && Math.hypot(px - moon.x, py - moon.y) < 52 * this.scale + 18) {
      this.rabbitT = 0;
      this.emit({ type: 'moonPoke', x: this.moonAt.x, y: this.moonAt.y });
      this.emit({ type: 'sfx', name: 'mochi' });
      return true;
    }
    return false;
  }

  catchMeteor(m) {
    m.caught = true;
    // a little burst of starlight where it was caught
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + this.rng() * 0.4;
      const el = svgEl('circle', { r: f2(1.6 + this.rng() * 1.6), class: 'meteor-spark' }, $('meteors'));
      (this.sparks || (this.sparks = [])).push({ el, x: m.x, y: m.y, vx: Math.cos(a) * (60 + this.rng() * 90), vy: Math.sin(a) * (60 + this.rng() * 90), t: 0 });
    }
    m.t = METEOR_LIFE; // it's gone
    this.starlitUntil = this.t + 14;
    this.ema.classList.add('starlit');
    this.emit({ type: 'starCaught' });
    this.emit({ type: 'sfx', name: 'chime' });
  }

  get starlit() { return this.t < (this.starlitUntil || 0); }

  // ------------------------------------------------------------------ fireflies and Kon's nose
  /** Send one firefly to Kon's nose (night only; Kon must be sitting still). */
  fireflyToNose() {
    if (this.fly || !this.fireflies.length) return false;
    const f = this.fireflies.reduce((a, b) => (Math.abs(b.cx - 800) < Math.abs(a.cx - 800) ? b : a));
    if (f.cx === undefined) return false;
    this.fly = { f, phase: 'go', t: 0, x: f.cx, y: f.cy };
    return true;
  }

  /** Kon sneezed: the firefly zips off (and goes back to its own business). */
  fireflyGo() {
    if (this.fly) { this.fly.phase = 'leave'; this.fly.t = 0; }
  }

  updateNight(dt) {
    const p = this.sky.p;
    // shooting stars
    if (this.meteor) {
      const m = this.meteor;
      m.t += dt;
      if (m.t >= METEOR_LIFE) { m.g.remove(); this.meteor = null; }
      else this.placeMeteor(m);
    } else if (p.stars > 0.85 && !this.sky.lapsing) {
      if (this.nextMeteorAt === undefined) this.nextMeteorAt = this.t + 10 + this.rng() * 10;
      if (this.t > this.nextMeteorAt) {
        this.nextMeteorAt = this.t + 28 + this.rng() * 45;
        if (this.autoMeteors && !this.reduced) this.spawnMeteor();
      }
    }
    if (this.sparks) {
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const s = this.sparks[i];
        s.t += dt;
        s.x += s.vx * dt; s.y += s.vy * dt + 30 * s.t * dt;
        s.vx *= Math.exp(-dt * 2.5); s.vy *= Math.exp(-dt * 2.5);
        s.el.setAttribute('cx', f2(s.x)); s.el.setAttribute('cy', f2(s.y));
        s.el.style.opacity = f2(1 - s.t / 1.1);
        if (s.t > 1.1) { s.el.remove(); this.sparks.splice(i, 1); }
      }
    }
    if (this.starlitUntil && this.t > this.starlitUntil) { this.starlitUntil = 0; this.ema.classList.remove('starlit'); }

    // the moon rabbit pounds its mochi
    if (this.rabbitT !== undefined && this.rabbitT !== null) {
      this.rabbitT += dt;
      const k = this.rabbitT < 1.8 ? Math.max(0, Math.sin(this.rabbitT * 9)) : 0;
      $('moon-mallet').setAttribute('transform', `rotate(${f2(-k * 38)} -6 -1)`);
      if (this.rabbitT > 1.8) this.rabbitT = null;
    }

    // a firefly visits Kon's nose
    const F = this.fly;
    if (F) {
      F.t += dt;
      const nose = this.konBody && this.konBody.nose;
      if (F.phase === 'go' && nose) {
        // a lazy, wandering approach
        const k = 1 - Math.exp(-dt * 1.3);
        F.x += (nose.x + Math.sin(F.t * 2.3) * 30 * (1 - smoothstep(1, 3, F.t)) - F.x) * k;
        F.y += (nose.y - 4 + Math.cos(F.t * 1.9) * 24 * (1 - smoothstep(1, 3, F.t)) - F.y) * k;
        if (Math.hypot(F.x - nose.x, F.y - nose.y + 4) < 6 && F.t > 2.4) {
          F.phase = 'on'; F.t = 0;
          this.emit({ type: 'fireflyNose' });
        }
        if (F.t > 9 || !this.konSitting) { F.phase = 'leave'; F.t = 0; }
      } else if (F.phase === 'on' && nose) {
        // it stays until Kon sneezes it off (or gets up)
        F.x = nose.x; F.y = nose.y - 4;
        if (F.t > 6 || this.konMoving) { F.phase = 'leave'; F.t = 0; }
      } else if (F.phase === 'leave' || !nose) {
        F.phase = 'leave';
        F.x += 260 * dt * (F.x > 800 ? 1 : -1);
        F.y -= 340 * dt;
        if (F.t > 1.4) this.fly = null;
      }
      if (this.fly) {
        F.f.cx = F.x; F.f.cy = F.y;
        F.f.on = F.phase === 'on' ? 0.85 + 0.15 * Math.sin(this.t * 6) : 1;
        F.f.el.setAttribute('cx', f2(F.x));
        F.f.el.setAttribute('cy', f2(F.y));
        F.f.el.style.opacity = f2(F.f.on);
      }
    } else if (this.dark && this.konSitting && this.autoMeteors && !this.reduced) {
      if (this.nextFlyAt === undefined) this.nextFlyAt = this.t + 25 + this.rng() * 30;
      if (this.t > this.nextFlyAt) {
        this.nextFlyAt = this.t + 50 + this.rng() * 60;
        this.fireflyToNose();
      }
    }
  }
}
