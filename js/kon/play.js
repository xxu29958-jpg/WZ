// Play — small easter-egg reactions: dizzy from circles or spirals, being
// petted, being booped (and sneezing), admiring a paper crane.
// Mixed into Brain (see brain.js); `this` is the brain.

import { clamp } from '../math.js';

export class Play {
  // ------------------------------------------------------------------ easter eggs
  enterDIZZY(arg) {
    this.say(arg.spiral ? 'spiral' : 'dizzy', true);
    this.emit('sfx', 'dizzy');
    this.act = null;
  }

  tickDIZZY(dt, s, P) {
    const t = this.stateT;
    P.gaze = null;
    P.headFollow = 0;
    if (t < 2.6) {
      P.spiral = 1;
      const w = t * 7;
      P.tilt = Math.sin(w) * 13;
      P.yaw = Math.cos(w) * 0.35;
      P.pitch = Math.sin(w) * 0.1;
      P.lean = Math.sin(t * 3.5) * 5;
      P.mouthOpen = 0.2 + 0.1 * Math.sin(t * 5);
      P.smile = -0.3;
      P.earPerk = -0.5;
      P.earL = Math.sin(w) * 10;
      P.earR = -Math.sin(w) * 10;
      P.ahoge = Math.sin(t * 9) * 25;
      P.sweat = 0.6;
      P.blink = false;
    } else {
      const u = (t - 2.6) / 0.8;
      P.yaw = Math.sin((t - 2.6) * 28) * 0.55 * (1 - u);
      P.shutL = P.shutR = 1;
      P.shutStyle = 'squeeze';
      P.mouthOpen = 0.1;
    }
    if (t > 3.4) this.go('RELAXING');
  }

  enterPETTED(arg) {
    this.petLast = this.now;
    this.say('petted', true);
    this.impulse({ type: 'hearts', n: arg.pat ? 2 : 1 });
    if (arg.pat) this.impulse({ type: 'hop', s: 0.4 });
    this.emit('sfx', 'purr');
    this.act = null;
  }

  tickPETTED(dt, s, P) {
    const t = this.stateT;
    const p = s.pointer;
    if (this.overHead(s) && this.ptrActive) this.petLast = this.now;
    P.gaze = null;
    P.headFollow = 0;
    P.shutL = P.shutR = 1;
    P.shutStyle = 'happy';
    P.smileEyes = 0.8;
    P.earPerk = -0.65;
    P.earL = 8;
    P.earR = 8;
    P.blush = 0.75;
    P.smile = 0.95;
    P.mouthOpen = 0.14;
    const h = s.body.head;
    P.tilt = p.present ? clamp((p.x - h.x) / 40, -1, 1) * 10 : 0;
    P.pitch = -0.1;
    P.tailAmp = 0.7;
    P.tailSpeed = 2.2;
    P.crouch = 0.1;
    P.fx.hearts = !this.arg.pat && t > 0.6 ? 1 : 0;
    P.blink = false;
    const over = this.arg.pat ? t > 1.1 : this.now - this.petLast > 0.9;
    if (over) {
      this.act = this.makeAct('groom');
      this.go('PRETENDING', { continue: true, caption: 'pettedAfter', blush: 0.85, sweat: true });
    }
  }

  enterBOOPED() {
    this.act = null;
    if (this.arg.firefly) {
      // a firefly landed on Kon's nose: no flinch, just a long cross-eyed stare… and then
      this.arg.sneeze = true;
      this.say(this.arg.butterfly ? 'butterflyNose' : 'fireflyNose', true);
      return;
    }
    this.impulse({ type: 'flinch', s: 0.8 });
    this.arg.sneeze = this.rng() < 0.65;
    this.say('booped', true);
    this.emit('sfx', 'boop');
  }

  tickBOOPED(dt, s, P) {
    // (a firefly's visit plays the same scene, with a much longer stare)
    const t = this.arg.firefly ? (this.stateT < 2.2 ? 0.14 + this.stateT * 0.27 : this.stateT - 1.45) : this.stateT;
    P.headFollow = 0;
    if (t < 0.14) {
      P.shutL = P.shutR = 1;
      P.shutStyle = 'squeeze';
      P.pitch = -0.25;
      P.smile = -0.2;
      P.earPerk = 1;
      P.shock = 0.4;
    } else if (t < 0.75) {
      // cross-eyed look at its own nose
      const n = s.body.nose;
      P.gaze = { x: n.x, y: n.y + 6 };
      P.eyeOpen = 1.1;
      P.browL = P.browR = 0.6;
      P.mouthOpen = 0.05;
      P.blink = false;
    } else if (this.arg.sneeze) {
      if (t < 1.05) {
        P.pitch = -0.35;
        P.shutL = P.shutR = 0.7;
        P.shutStyle = 'squeeze';
        P.mouthOpen = 0.4;
        P.stretch = 0.25;
        P.browTiltL = P.browTiltR = 0.6;
      } else if (t < 1.4) {
        if (!this.arg.sneezed) {
          this.arg.sneezed = true;
          this.impulse({ type: 'sneeze' });
          this.emit('sfx', 'sneeze');
          this.say('sneeze', true);
          if (this.arg.firefly) this.emit('fireflyGo');
        }
        P.shutL = P.shutR = 1;
        P.shutStyle = 'squeeze';
        P.pitch = 0.3;
        P.mouthOpen = 0.6;
      } else {
        P.blush = 0.8;
        P.armL = { x: -6 + Math.sin(t * 20) * 5, y: 24, space: 'head' };
        P.smile = 0.3;
        P.lidL = P.lidR = 0.3;
      }
    } else {
      P.shutL = P.shutR = 1;
      P.shutStyle = 'happy';
      P.smile = 1;
      P.mouthOpen = 0.25;
      P.lean = Math.sin(t * 28) * 1.5;
      P.blush = 0.6;
    }
    if (t > 2.2) {
      if (this.ptrActive) this.go('WATCH', { cautious: true });
      else this.go('RELAXING');
    }
  }

  enterADMIRE() {
    this.say(this.arg.star ? 'starWish' : 'admire', true);
    this.act = null;
  }

  tickADMIRE(dt, s, P) {
    const t = this.stateT;
    const crane = (s.objects || []).find((o) => o.kind === 'crane');
    P.gaze = crane ? { x: crane.x, y: crane.y } : this.attnPoint();
    P.headFollow = 0.85;
    P.bodyFollow = 0.4;
    P.sparkle = 1;
    P.eyeOpen = 1.12;
    P.pupil = 1.35;
    P.smile = 0.9;
    P.mouthOpen = 0.3;
    P.earPerk = 0.9;
    P.tailAmp = 0.8;
    P.tailSpeed = 2.4;
    P.reachY = -14;
    P.stretch = 0.3;
    if (t > 0.2 && t < 1.4) {
      const c = Math.abs(Math.sin(t * 9));
      P.armL = { x: -6 - 8 * c, y: -72, space: 'body' };
      P.armR = { x: 6 + 8 * c, y: -72, space: 'body' };
    }
    if (t > 3.4) {
      this.go('PRETENDING', { act: 'whistle', caption: 'admireAfter', blush: 0.7, sweat: true });
    }
  }
}
