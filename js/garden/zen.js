// ZenFX — what the garden does while Kon truly meditates.
//
// While the visitor stays still, the big ensō fades back and a new one is
// painted live by a floating "spirit brush", in step with Kon's progress.
// Any movement and the fresh ink evaporates. At satori the stroke turns gold,
// a soft aura pulses behind Kon, motes of light rise, and a 悟 seal is stamped.

import { clamp, lerp, smoothstep, DEG } from '../math.js';
import { NS, $, f2 } from '../util.js';

export class ZenFX {
  constructor({ scene, brush, reducedMotion = false, rng = Math.random }) {
    this.scene = scene;
    this.rng = rng;
    this.brush = brush;
    this.reduced = reducedMotion;
    this.live = $('enso-live');
    this.g = this.live.getContext('2d');
    this.brushEl = $('spirit-brush');
    this.brushTilt = $('spirit-brush-tilt');
    this.aura = $('aura');
    this.seal = $('satori-seal');
    this.mode = 'off';
    this.step = 0;
    this.t = 0;
    this.brushVis = 0;
    this.rings = [];
    this.motes = [];
    this.ringT = 0;
    this.moteT = 0;
    this.clearToken = 0;
    this.sealCount = 0;
    this.core = document.createElementNS(NS, 'circle');
    this.core.setAttribute('class', 'aura-core');
    this.core.setAttribute('r', '150');
    this.aura.appendChild(this.core);
  }

  layout() {
    const sc = this.scene;
    const e = sc.baseToScreen(530, 330); // inside the moving world layer
    this.live.style.transform = `translate(${f2(e.x)}px, ${f2(e.y)}px) scale(${(540 * sc.scale / this.live.width).toFixed(4)})`;
  }

  placeSeal() {
    const sc = this.scene;
    const p = sc.mode === 'wide' ? sc.toScreen(1032, 392) : sc.toScreen(1000, 372);
    const ui = sc.mode === 'wide' ? clamp(sc.scale, 0.8, 1.3) : 0.8;
    if (this.sealUi !== ui) { this.sealUi = ui; this.seal.style.setProperty('--ui-scale', ui.toFixed(3)); }
    const half = 31 * ui;
    // (called every frame now that the camera moves: only touch the styles when something changed)
    const key = `${f2(p.x - half)},${f2(p.y - half)},${ui.toFixed(3)}`;
    if (key === this.sealKey) return;
    this.sealKey = key;
    this.seal.style.setProperty('--seal-pos', `translate(${f2(p.x - half)}px, ${f2(p.y - half)}px)`);
    this.seal.style.transform = `translate(${f2(p.x - half)}px, ${f2(p.y - half)}px) rotate(-8deg)`;
  }

  clearLive() {
    this.g.clearRect(0, 0, this.live.width, this.live.height);
    this.step = 0;
  }

  startPainting() {
    this.clearToken++;
    this.clearLive();
    this.live.classList.remove('fading', 'gold');
    document.body.classList.add('zazen');
    this.seal.hidden = true;
    this.mode = 'painting';
  }

  /** Turn the painted ink to gold leaf, keeping every bristle's texture (alpha). */
  gild() {
    const g = this.g;
    const c = this.live.width / 2;
    const grad = g.createRadialGradient(c, c * 0.8, c * 0.2, c, c, c);
    grad.addColorStop(0, '#fbe3a0');
    grad.addColorStop(0.55, '#e8b44c');
    grad.addColorStop(1, '#c98a24');
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = grad;
    g.fillRect(0, 0, this.live.width, this.live.height);
    g.restore();
  }

  fadeOut() {
    const token = ++this.clearToken;
    this.live.classList.add('fading');
    document.body.classList.remove('zazen');
    this.mode = 'off';
    setTimeout(() => { if (token === this.clearToken) { this.clearLive(); this.live.classList.remove('fading', 'gold'); } }, 1000);
  }

  stampSeal(count, { quiet = false } = {}) {
    this.sealCount = count;
    this.seal.querySelector('.satori-count').textContent = count > 1 ? `×${count}` : '';
    this.seal.hidden = false;
    this.placeSeal();
    this.seal.classList.remove('stamp');
    if (quiet) return;
    void this.seal.offsetWidth;
    this.seal.classList.add('stamp');
  }

  /**
   * @param info  { state, paint (0–1), satoriCount }
   * @param center  world point behind Kon's chest
   */
  update(dt, info, center) {
    this.t += dt;
    const brush = this.brush;
    let brushTarget = 0;

    if (info.state === 'ZAZEN') {
      if (this.mode !== 'painting') this.startPainting();
      const target = clamp(info.paint) * brush.steps;
      if (target > this.step) this.step = brush.paintSteps(this.g, this.step, target);
      brushTarget = info.paint > 0.003 && info.paint < 0.995 ? 1 : 0;
    } else if (info.state === 'SATORI') {
      if (this.mode !== 'satori') {
        if (this.mode !== 'painting') this.startPainting();
        this.step = brush.paintSteps(this.g, this.step, brush.steps);
        this.gild();
        this.live.classList.add('gold');
        this.stampSeal(info.satoriCount || 1);
        this.mode = 'satori';
      }
    } else if (this.mode === 'painting') {
      this.fadeOut();
    } else if (this.mode === 'satori') {
      this.mode = 'afterglow';
      this.afterglowUntil = this.t + 8;
    } else if (this.mode === 'afterglow' && this.t > this.afterglowUntil) {
      this.fadeOut();
    }

    // the spirit brush rides the tip of the fresh ink
    this.brushVis = lerp(this.brushVis, brushTarget, 1 - Math.exp(-dt * 5));
    this.brushEl.setAttribute('opacity', f2(this.brushVis));
    if (this.brushVis > 0.01) {
      const t = this.step / brush.steps;
      const [x, y, a] = brush.at(t);
      const wx = 530 + (x / brush.size) * 540;
      const wy = 330 + (y / brush.size) * 540;
      const lean = (a / DEG + 90) * 0.18 - 16 + Math.sin(this.t * 2.2) * 3;
      this.brushEl.setAttribute('transform', `translate(${f2(wx)} ${f2(wy)})`);
      this.brushTilt.setAttribute('transform', `rotate(${f2(lean)})`);
    }

    this.updateAura(dt, center);
  }

  updateAura(dt, center) {
    const glowing = this.mode === 'satori';
    const settled = this.mode === 'painting' && this.step / this.brush.steps > 0.15;
    // core glow
    const coreTarget = glowing ? 0.55 + 0.1 * Math.sin(this.t * 2.4) : settled ? 0.12 : 0;
    const cur = parseFloat(this.core.style.opacity || '0');
    this.core.style.opacity = f2(lerp(cur, coreTarget, 1 - Math.exp(-dt * 2.5)));
    this.core.setAttribute('cx', f2(center.x));
    this.core.setAttribute('cy', f2(center.y));

    // expanding rings at satori
    this.ringT -= dt;
    if (glowing && this.ringT <= 0 && !this.reduced) {
      const el = document.createElementNS(NS, 'circle');
      el.setAttribute('class', 'aura-ring');
      this.aura.appendChild(el);
      this.rings.push({ el, t: 0 });
      this.ringT = 0.7;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const u = r.t / 2.6;
      if (u >= 1) { r.el.remove(); this.rings.splice(i, 1); continue; }
      r.el.setAttribute('cx', f2(center.x));
      r.el.setAttribute('cy', f2(center.y));
      r.el.setAttribute('r', f2(70 + 230 * smoothstep(0, 1, u)));
      r.el.style.opacity = f2((1 - u) * 0.8);
      r.el.style.strokeWidth = f2(3.5 * (1 - u) + 0.5);
    }

    // motes of light drifting up
    this.moteT -= dt;
    const rate = glowing ? 0.09 : settled ? 0.5 : 0;
    if (rate && this.moteT <= 0 && this.motes.length < 30) {
      const el = document.createElementNS(NS, 'circle');
      el.setAttribute('class', 'mote');
      el.setAttribute('r', f2(1.6 + this.rng() * 2.2));
      this.aura.appendChild(el);
      this.motes.push({
        el, t: 0, life: 2.6 + this.rng() * 1.8,
        x: center.x + (this.rng() * 2 - 1) * 150,
        y: center.y + 90 + this.rng() * 30,
        vx: (this.rng() * 2 - 1) * 8, vy: -(30 + this.rng() * 30),
        seed: this.rng() * 10,
      });
      this.moteT = rate;
    }
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.t += dt;
      const u = m.t / m.life;
      if (u >= 1) { m.el.remove(); this.motes.splice(i, 1); continue; }
      m.x += (m.vx + Math.sin(m.t * 2 + m.seed) * 10) * dt;
      m.y += m.vy * dt;
      m.el.setAttribute('cx', f2(m.x));
      m.el.setAttribute('cy', f2(m.y));
      m.el.style.opacity = f2(smoothstep(0, 0.2, u) * (1 - smoothstep(0.6, 1, u)) * 0.9);
    }
  }
}
