// Face — Kon's eyes, brows, mouth and cheeks. Mixed into FoxRig (see rig.js);
// `this` is the rig, so these methods read its springs (this.s) and nodes (this.el).

import { clamp, lerp, smoothstep } from '../math.js';
import { f2, tr, rot } from '../util.js';

const EYES = { l: { x: -37, y: -4 }, r: { x: 37, y: -4 } };

export class Face {
  /** Eyes: blink, lids, iris aim with an anatomical limit, closed-eye styles. */
  drawEyes(dt, P, f) {
    const s = this.s;
    const { yaw, pitch } = f;
    const el = this.el;
    const g = this.g;
    // ---- eyes ----
    this.updateBlink(dt, P);
    this.updateSaccade(dt, P);
    // a gust in the face: squint a little
    const eyeOpen = s.eyeOpen.step(dt, (P.eyeOpen ?? 1) * (1 - 0.32 * smoothstep(0.35, 1, this.wind || 0)));
    const irisS = s.iris.step(dt, P.iris ?? 1);
    const pupilS = s.pupil.step(dt, P.pupil ?? 1);
    const lidL = s.lidL.step(dt, P.lidL ?? 0.1);
    const lidR = s.lidR.step(dt, P.lidR ?? 0.1);
    const shutL = s.shutL.step(dt, P.shutL || 0);
    const shutR = s.shutR.step(dt, P.shutR || 0);
    const smileEyes = s.smileEyes.step(dt, P.smileEyes || 0);
    const spiral = s.spiral.step(dt, P.spiral || 0);
    const sparkle = s.sparkle.step(dt, P.sparkle || 0);
    this.spiralAngle += dt * 540;

    // closed-eye drawing style crossfade
    this.shutStyle = P.shutStyle || 'calm';
    for (const k of ['calm', 'happy', 'squeeze']) {
      this.styleMix[k] = lerp(this.styleMix[k], k === this.shutStyle ? 1 : 0, 1 - Math.exp(-dt * 18));
    }

    const blinkV = this.blinkValue();
    const limit = 1 + (1 - irisS) * 1.3;
    for (const side of ['l', 'r']) {
      const E = side === 'l' ? el.eyeL : el.eyeR;
      const L = side === 'l';
      let ox = -yaw * 1.4, oy = -pitch * 1.2;
      if (P.gaze) {
        const ew = this.headToWorld(EYES[side].x + g.faceX, EYES[side].y + g.faceY);
        const dx = P.gaze.x - ew.x, dy = P.gaze.y - ew.y;
        const d = rot(dx, dy, -(g.lean + g.tilt));
        const sc = this.scale * g.hsy;
        ox = 5.8 * Math.tanh(d.x / sc / 115) - yaw * 2.2;
        oy = 5.3 * Math.tanh(d.y / sc / 115) - pitch * 1.6;
      }
      ox += this.saccade.x;
      oy += this.saccade.y;
      // anatomical limit: an ellipse that grows a little when the iris shrinks
      const ex = 5.8 * limit, ey = 5.4 * limit;
      const r = Math.hypot(ox / ex, oy / ey);
      if (r > 1) { ox /= r; oy /= r; }
      const ix = (L ? s.ixL : s.ixR).step(dt, ox);
      const iy = (L ? s.iyL : s.iyR).step(dt, oy);

      const shut = Math.max(L ? shutL : shutR, blinkV);
      const lid = clamp(L ? lidL : lidR, 0, 0.75);
      const syE = eyeOpen * (1 - 0.93 * shut);
      const sxE = 1 + (eyeOpen - 1) * 0.55;
      E.squash.setAttribute('transform', `translate(0 ${f2(shut * 7)}) scale(${f2(sxE)} ${f2(Math.max(0.04, syE))})`);
      E.iris.setAttribute('transform', `${tr(ix, iy)} scale(${f2(irisS)})`);
      E.pupil.setAttribute('transform', `scale(${f2(pupilS)})`);
      E.lidUp.setAttribute('transform', tr(0, -17 + lid * 40));
      E.lidLow.setAttribute('transform', tr(0, 26 - smileEyes * 22));
      const vis = smoothstep(0.55, 0.88, shut);
      E.calm.style.opacity = f2(vis * this.styleMix.calm);
      E.happy.style.opacity = f2(vis * this.styleMix.happy);
      E.squeeze.style.opacity = f2(vis * this.styleMix.squeeze);
      E.core.style.opacity = f2(1 - spiral);
      E.spiral.style.opacity = f2(spiral);
      E.spiral.setAttribute('transform', `rotate(${f2(L ? this.spiralAngle : -this.spiralAngle)})`);
      E.sparkle.style.opacity = f2(sparkle);
    }
  }

  /** Brows. */
  drawBrows(dt, P, f) {
    const s = this.s;
    const { pitch } = f;
    const el = this.el;
    // ---- brows ----
    const bL = s.browL.step(dt, P.browL || 0);
    const bR = s.browR.step(dt, P.browR || 0);
    const btL = s.browTL.step(dt, P.browTiltL || 0);
    const btR = s.browTR.step(dt, P.browTiltR || 0);
    el.browL.setAttribute('transform', `${tr(-36, -34 - bL * 6 - pitch * 2)} rotate(${f2(-btL * 16)})`);
    el.browR.setAttribute('transform', `${tr(36, -34 - bR * 6 - pitch * 2)} rotate(${f2(btR * 16)})`);
  }

  // ---------- mouth ----------
  drawMouth(dt, P) {
    const s = this.s;
    const el = this.el;
    const open = clamp(s.mouthOpen.step(dt, P.mouthOpen || 0), 0, 1.3);
    const smile = s.smile.step(dt, P.smile ?? 0.2);
    const pucker = clamp(s.pucker.step(dt, P.pucker || 0));
    const tongue = clamp(s.tongue.step(dt, P.tongue || 0), 0, 1.2);
    const pout = this.s.pout.x;

    const y0 = 27;
    const top = y0 + 3.2;
    const w = 10.5 * (1 - pucker * 0.7) * (1 + smile * 0.12) * (1 - pout * 0.35);
    const corner = y0 + 4.2 - smile * 3.4 + pout * 1.5;
    const dip = y0 + 10 + smile * 1.6 - pout * 3;
    el.mouth.setAttribute('d',
      `M ${f2(-w)},${f2(corner)} Q ${f2(-w * 0.5)},${f2(dip)} 0,${f2(top)} Q ${f2(w * 0.5)},${f2(dip)} ${f2(w)},${f2(corner)} M 0,${f2(y0 - 0.5)} L 0,${f2(top)}`);
    el.mouth.style.opacity = f2(1 - pucker);

    if (open > 0.02) {
      const ow = 4.5 + open * 6.5 + Math.max(0, smile) * 2;
      const oh = open * 17;
      const d = `M ${f2(-ow)},${f2(top + 1)} C ${f2(-ow)},${f2(top + 1 + oh * 1.32)} ${f2(ow)},${f2(top + 1 + oh * 1.32)} ${f2(ow)},${f2(top + 1)} Q 0,${f2(top + 3)} ${f2(-ow)},${f2(top + 1)} Z`;
      el.mouthOpen.setAttribute('d', d);
      el.mouthClip.setAttribute('d', d);
      el.mouthOpen.style.opacity = '1';
      el.tongueIn.setAttribute('cx', '0');
      el.tongueIn.setAttribute('cy', f2(top + 1 + oh * 0.95));
      el.tongueIn.setAttribute('rx', f2(ow * 0.75));
      el.tongueIn.setAttribute('ry', f2(Math.max(2, oh * 0.38)));
    } else {
      el.mouthOpen.style.opacity = '0';
      el.mouthClip.setAttribute('d', 'M 0,0');
    }

    el.pucker.setAttribute('opacity', f2(pucker));
    el.pucker.setAttribute('cy', f2(top + 3.5));

    if (tongue > 0.03) {
      const tl = tongue * 9.5;
      el.blep.setAttribute('d', `M -5.2,${f2(top + 1)} L -5.2,${f2(top + 1 + tl)} Q 0,${f2(top + 7 + tl)} 5.2,${f2(top + 1 + tl)} L 5.2,${f2(top + 1)} Z M 0,${f2(top + 2)} V ${f2(top + tl)}`);
      el.blep.style.opacity = '1';
    } else {
      el.blep.style.opacity = '0';
    }
  }

  /** Blush, sweat drop, shock lines and the sleep bubble. */
  drawCheeks(dt, P, f) {
    const s = this.s;
    const { br } = f;
    const el = this.el;
    // ---- cheeks, sweat, shock, bubble ----
    const blush = s.blush.step(dt, P.blush || 0);
    el.blush.setAttribute('opacity', f2(clamp(blush) * 0.92));
    el.blushLines.style.opacity = f2(smoothstep(0.45, 0.9, blush));
    const sweat = s.sweat.step(dt, P.sweat || 0);
    this.sweatSlide = sweat > 0.1 ? Math.min(10, this.sweatSlide + dt * 5) : 0;
    el.sweat.setAttribute('opacity', f2(clamp(sweat)));
    el.sweat.setAttribute('transform', `${tr(86, -48 + this.sweatSlide)} scale(${f2(0.5 + 0.5 * clamp(sweat))})`);
    const shock = s.shock.step(dt, P.shock || 0);
    el.shock.setAttribute('opacity', f2(clamp(shock)));
    el.shock.setAttribute('transform', `scale(${f2(0.82 + 0.22 * clamp(shock, 0, 1.3))})`);
    const bub = s.bubble.step(dt, P.fx?.bubble || 0);
    const bubR = clamp(bub) * (4 + 7 * (0.5 + 0.5 * br));
    el.bubble.setAttribute('r', f2(bubR));
    el.bubble.setAttribute('cx', f2(9 + bubR * 0.55));
    el.bubble.setAttribute('cy', f2(25 + bubR * 0.35));
  }
}
