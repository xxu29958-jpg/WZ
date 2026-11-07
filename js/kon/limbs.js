// Limbs — Kon's arms, legs, feet, shadow, score card and tail. Mixed into
// FoxRig (see rig.js); `this` is the rig.

import { clamp, lerp, TAU, DEG, closedSpline } from '../math.js';
import { f2, tr } from '../util.js';

const SHOULDER = { x: 40, y: -84 };
export const PAW_REST = { x: 23, y: -30 };
const ARM_MAX = 118;
const TAIL_SEGS = 12;
const TAIL_LEN = 12.5;
const KON_REF = 1.15; // Kon's scale at depthScale 1

export class Limbs {
  /** Arms, legs, the shadow, the score card and the tail. */
  drawLimbs(dt, P, f, loco) {
    const s = this.s;
    const { lean, walkN, phase, facing, airborne, stand, float } = f;
    const el = this.el;
    // ---- arms ----
    this.walk = { n: walkN, phase, facing, stand };
    this.drawArm(dt, 'l', P.armL);
    this.drawArm(dt, 'r', P.armR);

    // ---- the shadow stays on the cushion and shrinks as Kon rises ----
    const air = loco ? Math.max(0, loco.h - (loco.surfaceH || 0)) : 0;
    const lift = clamp((-float + air) / 40);
    el.shadow.setAttribute('cy', f2(2 + air / KON_REF));
    el.shadow.setAttribute('transform', `scale(${f2(1 - lift * 0.35)} ${f2(1 - lift * 0.3)})`);
    this.drawLegs(walkN, phase, facing, airborne);
    el.shadow.style.opacity = f2(1 - lift * 0.55);

    // ---- score card in the right paw ----
    const showSign = P.sign !== null && P.sign !== undefined;
    if (showSign && P.sign !== this.signValue) {
      this.signValue = P.sign;
      el.signText.textContent = String(P.sign);
    }
    const sg = clamp(s.sign.step(dt, showSign ? 1 : 0), 0, 1.3);
    el.sign.setAttribute('opacity', f2(clamp(sg * 1.6)));
    if (sg > 0.01) {
      const px = s.pawRx.x, py = s.pawRy.x;
      el.sign.setAttribute('transform', `${tr(px, py - 2)} rotate(${f2(Math.sin(this.t * 1.7) * 4 + 6)}) scale(${f2(Math.max(0.01, sg))})`);
    }

    // ---- tail ----
    this.drawTail(dt, P, lean);
  }

  // ---------- arms ----------
  resolvePaw(t, side) {
    const sgn = side === 'l' ? -1 : 1;
    if (!t) {
      // paws in the lap — or swinging along when walking
      const w = this.walk || { n: 0, phase: 0, facing: 0, stand: 0 };
      // walking, the arms hang at the sides and swing against the legs (sideways
      // when Kon walks across the garden, up and down when it walks toward or away)
      const swing = Math.sin(w.phase + (sgn > 0 ? 0 : Math.PI)) * 14 * w.n;
      const across = Math.abs(w.facing);
      return {
        x: sgn * lerp(PAW_REST.x, 38, w.stand) + w.facing * swing,
        y: lerp(PAW_REST.y, -46, w.stand) + Math.abs(swing) * 0.35 * across - swing * 0.4 * (1 - across),
      };
    }
    if (t.space === 'head') return this.headToUpper(t.x, t.y);
    if (t.space === 'world') return this.worldToUpper(t.x, t.y);
    return { x: t.x, y: t.y };
  }

  drawArm(dt, side, target) {
    const g = this.g;
    const sgn = side === 'l' ? -1 : 1;
    const sh = { x: sgn * SHOULDER.x * g.sx, y: SHOULDER.y * g.sy };
    let p = this.resolvePaw(target, side);
    // keep the paw within reach
    let dx = p.x - sh.x, dy = p.y - sh.y;
    let d = Math.hypot(dx, dy);
    if (d > ARM_MAX) { p = { x: sh.x + (dx / d) * ARM_MAX, y: sh.y + (dy / d) * ARM_MAX }; }
    const L = side === 'l';
    const px = (L ? this.s.pawLx : this.s.pawRx).step(dt, p.x);
    const py = (L ? this.s.pawLy : this.s.pawRy).step(dt, p.y);
    dx = px - sh.x; dy = py - sh.y; d = Math.hypot(dx, dy) || 1;
    // elbow bends outward, more when the paw is close to the shoulder
    let nx = -dy / d, ny = dx / d;
    if (nx * sgn < 0) { nx = -nx; ny = -ny; }
    const bend = 8 + clamp(ARM_MAX - d, 0, 60) * 0.4;
    const c = { x: (sh.x + px) / 2 + nx * bend, y: (sh.y + py) / 2 + ny * bend };
    const arm = `M ${f2(sh.x)},${f2(sh.y)} Q ${f2(c.x)},${f2(c.y)} ${f2(px)},${f2(py)}`;
    // the dark "sock" covers the lower part of the arm
    const t0 = 0.56;
    const q0 = {
      x: (1 - t0) * (1 - t0) * sh.x + 2 * (1 - t0) * t0 * c.x + t0 * t0 * px,
      y: (1 - t0) * (1 - t0) * sh.y + 2 * (1 - t0) * t0 * c.y + t0 * t0 * py,
    };
    const qc = { x: lerp(c.x, px, t0), y: lerp(c.y, py, t0) };
    const E = L ? this.el.armL : this.el.armR;
    E.ol.setAttribute('d', arm);
    E.fur.setAttribute('d', arm);
    E.sock.setAttribute('d', `M ${f2(q0.x)},${f2(q0.y)} Q ${f2(qc.x)},${f2(qc.y)} ${f2(px)},${f2(py)}`);
    const ang = Math.atan2(py - c.y, px - c.x) / DEG;
    E.paw.setAttribute('transform', `${tr(px, py)} rotate(${f2(ang)})`);
  }

  // ---------- legs and feet ----------
  drawLegs(walkN, phase, facing, airborne) {
    const g = this.g;
    const stand = g.stand;
    const L = -g.upperY;
    for (const side of [-1, 1]) {
      let fx = lerp(side * 34, side * 19, stand) + g.bodyYaw * 6 * stand;
      let fy = lerp(-7, 0, stand);
      let lift = 0;
      if (airborne) {
        lift = 10 * stand;
        fx *= 0.8;
      } else if (walkN > 0.02) {
        const ph = phase + (side > 0 ? Math.PI : 0);
        fx += facing * 13 * walkN * Math.cos(ph);
        lift = Math.max(0, Math.sin(ph)) * 10 * walkN * this.motion;
        fy += (1 - Math.abs(facing)) * Math.cos(ph) * 3 * walkN;
      }
      const sc = lerp(1, 0.66, stand);
      const foot = side < 0 ? this.el.footL : this.el.footR;
      foot.setAttribute('transform', `${tr(fx, fy - lift)} scale(${f2(sc)} ${f2(sc)})`);
      const leg = side < 0 ? this.el.legL : this.el.legR;
      const hip = { x: side * 20 * g.sx, y: -14 + g.upperY };
      const d = `M ${f2(hip.x)},${f2(hip.y)} L ${f2(fx)},${f2(fy - lift - 4)}`;
      leg.ol.setAttribute('d', d);
      leg.fill.setAttribute('d', d);
      const vis = f2(clamp((L - 2) / 6));
      leg.ol.style.opacity = vis;
      leg.fill.style.opacity = vis;
    }
  }

  // ---------- tail ----------
  drawTail(dt, P, lean) {
    const s = this.s;
    const g = this.g;
    this.tailSpeed = lerp(this.tailSpeed, P.tailSpeed ?? 0.6, 1 - Math.exp(-dt * 2));
    this.tailPhase += dt * TAU * this.tailSpeed;
    // walking, the tail is carried higher and swings more
    const walking = this.walk ? this.walk.n : 0;
    const amp = s.tailAmp.step(dt, ((P.tailAmp ?? 0.15) + walking * 0.3) * (this.reduced ? 0.4 : 1));
    const base = s.tailBase.step(dt, (P.tailBase || 0) - walking * 12);
    const curl = s.tailCurl.step(dt, P.tailCurl || 0);

    const pts = [];
    let x = 34 * g.sx, y = -26 * g.sy;
    let a = (12 + base - lean * 0.5) * DEG;
    pts.push({ x, y, a });
    for (let i = 1; i <= TAIL_SEGS; i++) {
      const u = i / TAIL_SEGS;
      const wave = Math.sin(this.tailPhase - i * 0.5) * amp * 40 * (0.25 + u);
      a += (-13.5 + curl) * DEG + (wave * DEG) / TAIL_SEGS * 2.2;
      x += Math.cos(a) * TAIL_LEN;
      y += Math.sin(a) * TAIL_LEN;
      pts.push({ x, y, a });
    }
    const width = (u) => 31 * Math.pow(Math.sin(Math.PI * (0.13 + 0.87 * u)), 0.72) + 0.6;
    const left = [], right = [];
    for (let i = 0; i <= TAIL_SEGS; i++) {
      const p = pts[i];
      const w = width(i / TAIL_SEGS);
      const nx = -Math.sin(p.a), ny = Math.cos(p.a);
      left.push([p.x + nx * w, p.y + ny * w]);
      right.push([p.x - nx * w, p.y - ny * w]);
    }
    const tip = pts[TAIL_SEGS];
    const cap = [tip.x + Math.cos(tip.a) * 7, tip.y + Math.sin(tip.a) * 7];
    // the tail trails behind: when Kon faces right it swings over to the left side
    const ts = g.tailSide;
    const mir = (q) => [q[0] * ts, q[1]];
    for (let i = 0; i < left.length; i++) { left[i] = mir(left[i]); right[i] = mir(right[i]); }
    for (const p of pts) p.x *= ts;
    cap[0] *= ts;
    const outline = [...left, cap, ...right.slice().reverse()];
    const d = closedSpline(outline);
    this.el.tail.setAttribute('d', d);
    this.el.tailOl.setAttribute('d', d);

    const k0 = 8;
    const back = pts[k0 - 1];
    const notch = [lerp(pts[k0].x, back.x, 0.55), lerp(pts[k0].y, back.y, 0.55)];
    const tipPts = [...left.slice(k0), cap, ...right.slice(k0).reverse(), notch];
    this.el.tailTip.setAttribute('d', closedSpline(tipPts));
  }
}
