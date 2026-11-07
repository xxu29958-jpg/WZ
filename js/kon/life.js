// Life — what Kon does when nobody is interacting: rest at home, pick places
// to visit (by novelty, whim and distance), walk there and do something,
// chase fallen leaves (and sparrows: see visitors.js), and head home when the
// garden goes quiet.
// Mixed into Brain (see brain.js); `this` is the brain.

import { randRange } from '../math.js';
import { ACTS, IDLE_ACTS, ACTIVITIES } from './acts.js';
import { POIS, BOUNDS, randomSpot } from '../garden/world.js';

const ZAZEN_AFTER = 7;      // seconds of total stillness (at home) before true meditation begins

export class Life {
  // ------------------------------------------------------------------ IDLE
  enterIDLE() {
    this.idleAct = null;
    this.life.act = null;
    this.life.restUntil = Math.max(this.life.restUntil, this.now + 2);
    this.nextIdleAt = randRange(this.rng, 2.2, 4.5);
    this.say('idle');
  }

  tickIDLE(dt, s, P) {
    if (this.ptrActive && this.ptrBurst > 0.08) { this.dropLife(); this.go('WATCH', { from: 'idle' }); return; }
    const fresh = s.typing.focused && this.now - s.typing.focusAt < 3;
    if (this.typeActive || (fresh && this.typeI > 0.24)) { this.dropLife(); this.go('WATCH', { from: 'idle' }); return; }
    const self = s.self || { seat: 'cushion' };
    const home = self.seat === 'cushion' && !self.airborne;
    const resting = !this.life.act || (this.life.act.id === 'home' && this.life.act.phase === 'do');
    // sleepiness: after enlightenment, or after a very long quiet spell — but only at home
    const sleepy = (this.arg.afterSatori && this.idleFor > 26 && this.stateT > 6) || (!this.zenArmed && !this.arg.afterSatori && this.idleFor > 40);
    if (sleepy && !this.idleAct && resting) {
      if (home) { this.dropLife(); this.go('DROWSY'); return; }
      this.goHome('sleep');
    }
    // perfect stillness → true meditation, starting from rest on the cushion
    if (this.zenArmed && this.idleFor > ZAZEN_AFTER && this.stateT > 1 && !s.typing.focused && !this.greet) {
      if (home && resting) {
        const act = this.idleAct ? this.idleAct.name : '';
        if (!act || ['lookAround', 'viewer', 'earTwitch', 'meditateAttempt'].includes(act)) { this.dropLife(); this.go('ZAZEN'); return; }
      } else if (!home && !this.life.act && this.idleFor > 16) {
        // Kon finished what it was doing and the garden is still: time to go home
        this.goHome('zen');
      }
    }

    // a returning visitor gets a hello
    if (this.greet && this.stateT > this.greet.at && !this.idleAct && !this.life.act) {
      const g = this.greet;
      this.idleAct = this.makeAct(g.kind, { dur: g.kind === 'doodleProud' ? 2.8 : 2.4 });
      this.sayText(g.text, 'greet');
      this.greet = g.doodle ? { at: this.stateT + 2.6, kind: 'doodleProud', text: 'While you were away, Kon raked you a little something.', doodle: false } : null;
      this.lastActive = Math.max(this.lastActive, this.now - 2);
      this.life.restUntil = this.now + 6;
    }

    this.tickLife(dt, s, P);

    // a falling leaf or a dragonfly is always worth a look
    if (this.attn.src === 'object' && this.attn.sal >= 0.4) {
      P.gaze = this.attnPoint();
      P.headFollow = 0.75;
      P.browL = P.browR = 0.45;
      P.earPerk = 0.4;
      if (P.shutL > 0.5 && P.shutR > 0.5) { P.shutR = 0.2; P.lidR = 0.3; }
    }
    this.applyFlash(P);
  }

  // ------------------------------------------------------------------ a life in the garden
  /** Head back to the cushion — to meditate, or because Kon is sleepy. */
  goHome(why) {
    const a = this.life.act;
    if (a && a.id === 'home' && a.why === why) return;
    this.life.act = { id: 'home', def: ACTIVITIES[0], phase: 'go', zen: why === 'zen', why, t: 0, dur: 1, gait: why === 'sleep' ? 'stroll' : 'walk' };
    this.idleAct = null;
    this.say(why === 'sleep' ? 'homeForSleep' : 'homeForZen', true);
  }

  dropLife(rest = randRange(this.rng, 2, 4)) {
    this.life.act = null;
    this.life.restUntil = this.now + rest;
  }

  /** Resting in place: the small idle behaviors (stretch, yawn, scratch, look around…). */
  restIdle(dt, s, P) {
    if (!this.idleAct && this.stateT > this.nextIdleAt) {
      let name = this.idleBag.next(this.idleFor < 10 ? ['yawn'] : []);
      if (this.idleFor > 16 && this.rng() < 0.35) name = 'yawn';
      if (name === 'flowerSniff' && !this.near(s, POIS.flower.stand, 150)) name = 'lookAround';
      const def = IDLE_ACTS.find(([n]) => n === name);
      this.idleAct = this.makeAct(name, { dur: def[2] });
    }
    if (this.idleAct) {
      this.runAct(this.idleAct, dt, P);
      if (this.idleAct.t > this.idleAct.dur) {
        this.idleAct = null;
        this.nextIdleAt = this.stateT + randRange(this.rng, 3.2, 7.5);
      }
    } else {
      this.idleGaze(P, s);
    }
  }

  /** Choose somewhere to go: novelty (boredom wears off), a bit of whim, and distance. */
  pickActivity(s) {
    const self = s.self;
    let best = null, bestU = -1;
    for (const d of ACTIVITIES) {
      if (d.id === 'home' && self.seat === 'cushion') continue;
      if (d.id === 'rock' && self.seat === 'rock') continue;
      const last = this.life.lastVisit[d.id] ?? -1e9;
      const novelty = 1 - Math.exp(-(this.now - last) / 50);
      let w = s.night && d.nightWeight ? d.nightWeight : d.weight;
      if (d.id === 'home' && this.idleFor > 12) w *= 3; // a quiet garden draws Kon back to the cushion
      const at = d.id === 'home' ? { x: 800, y: 870 } : d.id === 'rock' ? { x: 1079, y: 940 } : d.id === 'wander' ? { x: 800, y: 900 } : POIS[d.id].stand;
      const dist = Math.hypot(at.x - self.x, at.y - self.y);
      const u = w * novelty * (0.55 + this.rng() * 0.9) / (1 + dist / 1100);
      if (u > bestU) { bestU = u; best = d; }
    }
    const far = best.id === 'home' ? 0 : 1;
    return {
      id: best.id, def: best, phase: 'go', t: 0,
      dur: randRange(this.rng, best.dur[0], best.dur[1]),
      gait: far && this.rng() < 0.25 ? 'trot' : 'walk',
    };
  }

  /** Where an activity happens and how to hold position there. */
  activityDest(a, s) {
    const g = a.gait || 'walk';
    if (a.id === 'home') return { move: { seat: 'cushion', gait: a.gait || 'walk' }, hold: { seat: 'cushion' }, seat: 'cushion' };
    if (a.id === 'rock') return { move: { seat: 'rock', gait: g }, hold: { seat: 'rock' }, seat: 'rock', look: POIS.rock.look };
    if (a.id === 'wander') {
      a.spot = a.spot || randomSpot(this.rng);
      return { move: { to: a.spot, gait: 'walk' }, hold: null, to: a.spot };
    }
    if (a.id === 'leaf') {
      const leaf = (s.objects || []).find((o) => o.id === a.leafId);
      if (!leaf) return null;
      return { move: { to: this.toward(leaf, s.self, 140), gait: 'trot' }, to: leaf, look: leaf, leaf };
    }
    const poi = POIS[a.id];
    return { move: { to: poi.stand, gait: g, face: poi.face }, hold: { to: poi.stand, face: poi.face }, to: poi.stand, look: poi.look };
  }

  tickLife(dt, s, P) {
    const L = this.life;
    const self = s.self;
    if (!self) { this.restIdle(dt, s, P); return; }
    if (!L.act) {
      this.restIdle(dt, s, P);
      if (!this.greet && this.noticeBird(s)) return;
      const fresh = this.reachableLeaf(s);
      if (fresh && fresh.byVisitor && !this.greet) { L.leafSeen[fresh.id] = true; L.act = { id: 'leaf', phase: 'go', leafId: fresh.id, t: 0 }; this.idleAct = null; return; }
      if (this.now > L.restUntil && !this.idleAct && !this.greet) {
        const leaf = this.reachableLeaf(s);
        if (leaf) {
          L.leafSeen[leaf.id] = true;
          // leaves you shook loose are irresistible; stray ones only sometimes
          if (leaf.byVisitor || this.rng() < 0.6) { L.act = { id: 'leaf', phase: 'go', leafId: leaf.id, t: 0 }; return; }
        }
        L.act = this.pickActivity(s);
      }
      return;
    }
    if (L.act.id === 'bird') { this.tickBird(dt, s, P); return; }
    // a bird or a leaf beats any casual plan (but not going home to meditate or sleep)
    if (!L.act.why && L.act.id !== 'leaf' && this.noticeBird(s)) return;
    if (!L.act.zen && L.act.id !== 'leaf') {
      const leaf = this.reachableLeaf(s);
      if (leaf) {
        L.leafSeen[leaf.id] = true;
        if (leaf.byVisitor || this.rng() < 0.6) { L.act = { id: 'leaf', phase: 'go', leafId: leaf.id, t: 0 }; this.idleAct = null; }
      }
    }
    const a = L.act;
    a.t += dt;
    const dest = this.activityDest(a, s);
    if (!dest) { this.dropLife(1); return; }
    if (a.phase === 'go') {
      P.move = dest.move;
      P.gaze = dest.look || null;
      P.headFollow = 0.5;
      if (a.id === 'leaf') {
        if (Math.hypot(dest.leaf.x - self.x, (dest.leaf.y - self.y) * 1.6) < 175 || a.t > 6) {
          this.go('POUNCE', { target: 'leaf', id: a.leafId, x: dest.leaf.x, y: dest.leaf.y });
        }
        return;
      }
      const arrived = dest.seat ? self.seat === dest.seat : self.arrived && Math.hypot(self.x - dest.to.x, self.y - dest.to.y) < 16;
      if (arrived) {
        a.phase = 'do';
        a.t = 0;
        this.idleAct = null;
        if (a.def.act) {
          a.run = this.makeAct(a.def.act, { dur: a.dur });
          this.say(ACTS[a.def.act].caption);
        } else if (!a.zen) {
          this.say('lifeHome');
        }
      } else if (a.t > 18) {
        this.dropLife(2); // got stuck somewhere: never mind
      }
      return;
    }
    P.move = dest.hold;
    if (a.run) this.runAct(a.run, dt, P);
    else this.restIdle(dt, s, P);
    if (a.why && a.t > 8) { this.dropLife(3); return; } // arrived home and nothing happened after all
    if (a.t > a.dur && !a.why) {
      L.lastVisit[a.id] = this.now;
      this.idleAct = null;
      this.dropLife(a.id === 'home' ? randRange(this.rng, 6, 12) : randRange(this.rng, 3, 7));
    }
  }

  /** A freshly landed leaf that Kon can actually get to. */
  reachableLeaf(s) {
    return (s.objects || []).find((o) => o.kind === 'leafGround' && !this.life.leafSeen[o.id] &&
      o.x > BOUNDS.x0 - 30 && o.x < BOUNDS.x1 + 40 && o.y > BOUNDS.y0 && o.y < BOUNDS.y1 + 40);
  }

  idleGaze(P, s) {
    const L = this.idleLook;
    if (this.now > L.until) {
      const r = this.rng();
      if (r < 0.55) L.point = null;
      else if (r < 0.8 || !s.pointer.present) L.point = this.headAway(randRange(this.rng, -320, 320), randRange(this.rng, -160, 140));
      else L.point = { x: s.pointer.x, y: s.pointer.y };
      L.until = this.now + randRange(this.rng, 1.8, 4.2);
    }
    P.gaze = L.point;
    P.headFollow = 0.35;
  }
}
