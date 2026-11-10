// Outdoors — Kon and everything the garden gets up to on its own: the weather
// (a leaf for an umbrella, puddles to jump in, a rainbow to gape at, snow to
// catch and to build with), the temari ball, the frog that comes out in the
// rain, the pebbles that are definitely just pebbles, and Kon's own tail.
// Mixed into Brain (see brain.js); `this` is the brain.

import { clamp, smoothstep, randRange } from '../math.js';
import { pushOut, randomSpot } from '../garden/world.js';

// states in which Kon has no paw free (or no mind) for an umbrella
const NO_UMBRELLA = new Set(['ZAZEN', 'SATORI', 'SLEEPING', 'DROWSY', 'POUNCE', 'STARTLED', 'DIZZY', 'WAKING']);
// where the little snow fox gets built, and where Kon stands to build it
export const SNOWFOX_AT = { x: 716, y: 950 };
const SNOWFOX_STAND = { x: 792, y: 952 };

export class Outdoors {
  /** A live thing in the garden, by kind (ball, frog, tsubu, butterfly…). */
  obj(kind, s = this.s) {
    return (s.objects || []).find((o) => o.kind === kind) || null;
  }

  /** Nothing pressing: Kon may stop for a little performance of its own. */
  atLeisure(s) {
    const a = this.life.act;
    return this.state === 'IDLE' && !this.greet && !(s.self && (s.self.moving || s.self.airborne)) &&
      !(a && (a.why || a.engaged || ['bird', 'puddle'].includes(a.id)));
  }

  perform(name, dur, extra = {}) {
    if (this.life.act) this.dropLife(4);
    this.idleAct = this.makeAct(name, { dur, ...extra });
  }

  /** Start one of the activities below right now (a whim, or something the visitor set off). */
  startLife(id, extra = {}) {
    this.life.act = { id, def: OUTDOOR_DEFS[id], phase: 'go', t: 0, dur: 1, ...extra };
    this.idleAct = null;
  }

  // ------------------------------------------------------------------ events from the garden
  /** @returns true if the event was one of ours */
  onOutdoorEvent(ev, s) {
    const asleep = this.state === 'SLEEPING';
    const deep = this.state === 'ZAZEN' || this.state === 'SATORI';
    const o = this.out;
    switch (ev.type) {
      case 'rainStart': {
        o.kind = ev.kind;
        if (asleep || this.state === 'DROWSY') { this.go('WAKING'); return true; }
        if (deep) { if (ev.kind !== 'snow') this.say('rainZen', true); return true; }
        const h = s.body.head;
        this.flash = { x: h.x + 40, y: h.y - 420, until: this.now + 1.3 };
        if (this.atLeisure(s)) this.perform(ev.kind === 'snow' ? 'snowNotice' : 'rainNotice', 3);
        this.say(ev.kind === 'snow' ? 'snowStart' : ev.kind === 'sunshower' ? 'sunshower' : 'rainStart', true);
        return true;
      }
      case 'rainStop':
        if (!asleep && !deep) this.say(ev.kind === 'snow' ? 'snowStop' : 'rainStop');
        return true;
      case 'cloudPoke':
        if (asleep) return true;
        if (ev.onKon && !deep) {
          o.wet = Math.max(o.wet, 0.7);
          if (this.atLeisure(s)) this.perform('sprinkled', 3.2);
          else this.flash = { x: s.body.head.x, y: s.body.head.y - 400, until: this.now + 1.2 };
          this.say('cloudPokeKon', true);
        } else if (!deep) {
          this.flash = { x: ev.x, y: ev.y, until: this.now + 1.6 };
          this.say('cloudPoke', true);
        }
        return true;
      case 'cloudShape':
        if (asleep || deep) return true;
        this.flash = { x: ev.x, y: ev.y, until: this.now + 2.2 };
        if (this.atLeisure(s)) this.perform('pointCloud', 3.6, { target: { x: ev.x, y: ev.y } });
        this.say(ev.shape === 'fox' ? 'cloudFox' : ev.shape === 'fish' ? 'cloudFish' : 'cloudRabbit', true);
        return true;
      case 'foxWedding':
        if (asleep || deep) return true;
        this.flash = { x: ev.x, y: ev.y, until: this.now + 2 };
        if (this.atLeisure(s)) this.perform('weddingBow', 7.5, { target: { x: ev.x, y: ev.y } });
        this.say('foxWedding', true);
        return true;
      case 'ballKick':
        // you kicked the ball: that's an invitation
        if (ev.by !== 'user' || asleep || deep || this.greet) return true;
        if (['IDLE', 'WATCH', 'PRETENDING', 'RESUMING', 'RELAXING', 'NOTICED'].includes(this.state) && !s.typing.focused) {
          const a = this.life.act;
          if (!(a && a.id === 'ball' && this.state === 'IDLE')) {
            if (this.state !== 'IDLE') this.go('IDLE');
            this.startLife('ball', { fetch: true, max: 1, engaged: true });
            this.say('ballChase', true);
          } else { a.phase = 'go'; a.t = 0; a.fetch = true; a.engaged = true; a.bats = 0; a.max = 1; }
        }
        return true;
      case 'frogCroak': {
        const a = this.life.act;
        if (a && a.id === 'frog' && a.phase === 'do') a.croakAt = this.now;
        else if (!asleep && this.reactive()) this.impulse({ type: 'earFlick', side: ev.x < (s.self ? s.self.x : 800) ? 'l' : 'r', s: 0.5 });
        return true;
      }
      case 'frogHop': {
        const a = this.life.act;
        if (a && a.id === 'frog' && a.phase === 'do') a.hopAt = this.now;
        return true;
      }
      case 'frogDive':
        if (!asleep) this.flash = { x: ev.x, y: ev.y, until: this.now + 1 };
        return true;
      case 'tsubuPop':
        if (!asleep && !deep && ev.by === 'user') {
          this.flash = { x: ev.x, y: ev.y, until: this.now + 1.2 };
          this.say('tsubuPop', true);
        }
        return true;
      case 'tsubuCaught':
        if (!asleep) { this.flash = { x: ev.x, y: ev.y, until: this.now + 1.6 }; this.say('tsubuCaught', true); }
        return true;
      case 'tsubuZen':
        if (this.state === 'ZAZEN') this.say('tsubuZen');
        return true;
      case 'butterflyCursor':
        if (!asleep && !deep) this.say('butterflyCursor', true);
        return true;
      default:
        return false;
    }
  }

  // ------------------------------------------------------------------ the weather, laid over whatever Kon is doing
  outdoorPose(dt, s, P) {
    const w = s.weather;
    const o = this.out;
    if (!w) return;
    const st = this.state;
    const raining = w.rain > 0.15;
    const busy = NO_UMBRELLA.has(st);
    if (raining) {
      o.rainT += dt;
      o.dryT = 0;
      if (!o.umbrella && o.rainT > 3.4 && !busy && !(s.self && s.self.airborne)) {
        // out comes the leaf (from wherever foxes keep such things)
        o.umbrella = true;
        this.impulse({ type: 'hop', s: 0.3 });
        this.emit('sfx', 'pon');
        this.say('umbrella', true);
      }
      if (!o.umbrella) o.wet = Math.min(1, o.wet + dt / 5);
    } else {
      o.rainT = 0;
      o.dryT += dt;
      if (o.umbrella && o.dryT > 2.6 && !busy) { o.umbrella = false; this.say('rainOver'); }
      // a wet fox, once the rain has stopped: a good shake
      if (o.wet > 0.4 && o.dryT > 1.2 && !o.umbrella && this.atLeisure(s) && !this.idleAct && !this.life.act) {
        o.wet = 0;
        this.idleAct = this.makeAct('shakeDry', { dur: 2.2 });
        this.say('shakeDry', true);
      }
    }
    if (o.umbrella) {
      P.umbrella = 1;
      if (!P.armR) P.armR = { x: 56, y: -64, space: 'body' };
      P.earPerk = Math.min(P.earPerk, -0.3);
    } else if (raining && st !== 'SLEEPING') {
      // getting rained on: ears down, eyes narrowed
      P.earPerk = Math.min(P.earPerk, -0.5);
      P.lidL = Math.max(P.lidL, 0.28);
      P.lidR = Math.max(P.lidR, 0.28);
      if (st === 'ZAZEN') P.sweat = Math.max(P.sweat, 0.6);
    }
    // asleep: dreaming (a paw twitches; now and then, a word)
    if (st === 'SLEEPING') {
      if (this.stateT > 7 && !o.dreamSaid) { o.dreamSaid = true; this.say('dream', true); }
      if (this.stateT % 6 > 5.2) P.armL = { x: -14 + Math.sin(this.stateT * 30) * 4, y: -40, space: 'body' };
    } else o.dreamSaid = false;
    // snow settles on a fox who sits still (and slides off one who doesn't)
    const calm = !(s.self && (s.self.moving || s.self.airborne)) && !['STARTLED', 'DIZZY', 'POUNCE', 'WAKING', 'BOOPED'].includes(st) && !(this.idleAct && ['shakeDry', 'catchFlake', 'stretch'].includes(this.idleAct.name));
    if (w.snow > 0.3 && calm) o.snowHat = Math.min(1, o.snowHat + dt / 16);
    else if (!calm) o.snowHat = Math.max(0, o.snowHat - dt * 2.5);
    else if (w.snow < 0.1) o.snowHat = Math.max(0, o.snowHat - dt / 20);
    P.snowHat = o.snowHat;
    // a rainbow: everything else can wait
    if (w.bow && !o.bowSeen) {
      o.bowSeen = true;
      if (st !== 'SLEEPING' && st !== 'ZAZEN' && st !== 'SATORI') {
        this.flash = { x: w.bow.x, y: w.bow.y, until: this.now + 2.4, sparkle: true };
        if (this.atLeisure(s)) this.perform('rainbowAwe', 5, { target: w.bow });
        this.say('rainbow', true);
      }
    } else if (!w.bow) o.bowSeen = false;
    // walking away from a pebble that is only a pebble… one last look over the shoulder
    if (o.suspect && this.now > o.suspect.from) {
      if (this.now > o.suspect.until || st !== 'IDLE') o.suspect = null;
      else {
        P.gaze = { x: o.suspect.x, y: o.suspect.y };
        P.headFollow = 1;
        P.lidL = P.lidR = 0.42;
        P.browTiltL = P.browTiltR = -0.4;
        P.earPerk = 0.8;
      }
    }
  }

  /** In the rain or the snow, some of Kon's idle moments are about the weather. */
  weatherIdle(s) {
    const w = s.weather;
    if (!w) return null;
    if (w.rain > 0.3 && this.rng() < 0.55) return this.rng() < 0.5 ? ['catchDrops', 4.2] : ['rainListen', 6];
    if (w.snow > 0.3 && this.rng() < 0.6) return this.rng() < 0.6 ? ['catchFlake', 4] : ['snowAwe', 4.5];
    return null;
  }

  // ------------------------------------------------------------------ puddles
  tickPuddle(dt, s, P) {
    const a = this.life.act;
    const self = s.self;
    a.t += dt;
    const all = (s.weather && s.weather.puddles) || [];
    let pd = a.pid ? all.find((p) => p.id === a.pid) : null;
    if (!a.pid && all.length) {
      pd = all.reduce((b, p) => (p.fill * p.rx > b.fill * b.rx ? p : b));
      a.pid = pd.id;
      a.side = self.x < pd.x ? -1 : 1;
      this.say('puddleSee', true);
    }
    if (!pd) { this.dropLife(2); return; }
    const from = pushOut({ x: pd.x + a.side * (pd.rx + 96), y: pd.y - 4 });
    P.move = { to: from, gait: 'trot', face: -a.side, tol: 18 };
    P.gaze = { x: pd.x, y: pd.y };
    P.headFollow = 0.9;
    P.earPerk = 0.8;
    P.pupil = 1.3;
    P.smile = 0.7;
    P.tailAmp = 0.6;
    P.tailSpeed = 2.4;
    const there = !self.seat && !self.airborne && Math.hypot(self.x - from.x, self.y - from.y) < 26;
    if (there || a.t > 10) this.go('POUNCE', { target: 'puddle', x: pd.x, y: pd.y });
  }

  /** In the puddle: stomp, stomp, and pure joy. */
  puddleAfter(lt, s, P) {
    const a = this.arg;
    P.posture = 'stand';
    P.gaze = null;
    P.headFollow = 0;
    P.smile = 1;
    P.mouthOpen = 0.4;
    P.shutL = P.shutR = lt > 0.15 ? 1 : 0;
    P.shutStyle = 'happy';
    P.blush = 0.5;
    P.tailAmp = 0.9;
    P.tailSpeed = 2.8;
    P.armL = { x: -62, y: -92 - Math.abs(Math.sin(lt * 7)) * 14, space: 'body' };
    if (!P.armR) P.armR = { x: 62, y: -92 - Math.abs(Math.cos(lt * 7)) * 14, space: 'body' };
    a.stomps = a.stomps || 0;
    for (const [i, at] of [[0, 0.6], [1, 1.25]]) {
      if (a.stomps === i * 2 && lt > at) { a.stomps++; this.impulse({ type: 'hop', s: 0.85 }); }
      if (a.stomps === i * 2 + 1 && lt > at + 0.3) { a.stomps++; this.emit('splash', { x: a.x, y: a.y, k: 0.7 }); this.impulse({ type: 'land', s: 0.6 }); }
    }
    if (lt > 0.4 && !a.said) { a.said = true; this.say('puddleAfter', true); }
    if (lt > 2.7) { this.life.lastVisit.puddle = this.now; this.out.wet = Math.max(this.out.wet, 0.6); this.go('RELAXING', { quiet: true }); }
  }

  // ------------------------------------------------------------------ the temari
  tickBall(dt, s, P) {
    const a = this.life.act;
    const self = s.self;
    const b = this.obj('ball', s);
    a.t += dt;
    if (!b) { this.dropLife(1); return; }
    const face = Math.sign(b.x - self.x) || self.faceDir;
    const dist = Math.hypot(b.x - self.x, (b.y - self.y) * 1.6);
    P.gaze = { x: b.x, y: b.y - 16 - b.h };
    P.headFollow = 0.95;
    P.earPerk = 0.8;
    P.pupil = 1.3;
    P.posture = 'stand';
    P.smile = 0.6;
    P.tailAmp = 0.7;
    P.tailSpeed = 2.6;
    if (a.phase === 'go') {
      // run to the ball (wherever it's rolling to) and stop a paw's length short of it
      P.move = { to: this.toward(b, self, 50), gait: 'trot', face, tol: 14 };
      P.mouthOpen = 0.2;
      if (dist < 82 && b.speed < 70 && b.h < 6 && !self.airborne && !self.seat) { a.phase = 'bat'; a.t = 0; a.hit = false; }
      else if (a.t > 9) { this.life.lastVisit.ball = this.now; this.dropLife(2); }
      return;
    }
    if (a.phase === 'bat') {
      P.move = { to: { x: self.x, y: self.y }, face, tol: 400 };
      P.crouch = 0.3;
      P.lean = Math.sin(a.t * 24) * 2.6 * (a.t < 0.4 ? 1 : 0);
      const arm = face > 0 ? 'armR' : 'armL';
      P[arm] = a.t < 0.36 ? { x: face * 78, y: -84, space: 'body' } : { x: b.x, y: b.y - 14, space: 'world' };
      if (a.t > 0.46 && !a.hit) {
        a.hit = true;
        a.bats = (a.bats || 0) + 1;
        // back toward whoever is playing, otherwise wherever there's room
        let to;
        if (a.fetch && s.pointer.present) to = { x: s.pointer.x, y: clamp(s.pointer.y, 770, 955) };
        else { to = randomSpot(this.rng); if (Math.hypot(to.x - b.x, to.y - b.y) < 160) to = { x: b.x + face * 260, y: b.y }; }
        this.emit('ballBat', { dx: to.x - b.x, dy: to.y - b.y, power: randRange(this.rng, 300, 400) });
        this.say('ballBat');
      }
      if (a.t > 1.05) {
        if (a.bats >= (a.max || 3)) { a.phase = 'done'; a.t = 0; this.say('ballDone', true); }
        else { a.phase = 'go'; a.t = 0; }
      }
      return;
    }
    // pleased with itself
    P.move = { to: { x: self.x, y: self.y }, face, tol: 400 };
    P.posture = 'sit';
    P.smile = 0.9;
    P.shutL = P.shutR = a.fetch ? 0 : smoothstep(0.4, 0.8, a.t);
    P.shutStyle = 'happy';
    if (a.t > (a.fetch ? 1.3 : 2.4)) { this.life.lastVisit.ball = this.now; this.dropLife(a.fetch ? 1.5 : 4); }
  }

  // ------------------------------------------------------------------ the frog
  tickFrog(dt, s, P) {
    const a = this.life.act;
    const self = s.self;
    const f = this.obj('frog', s);
    a.t += dt;
    if (!f || f.state === 'peek') {
      if (!a.goneAt) { a.goneAt = this.now; this.say('frogGone', true); }
      P.gaze = f ? { x: f.x, y: f.y } : this.headAway(-200, 120);
      P.headFollow = 0.8;
      P.tilt = 10;
      P.browL = P.browR = 0.5;
      if (this.now - a.goneAt > 2.2) { this.life.lastVisit.frog = this.now; this.dropLife(3); }
      return;
    }
    const face = Math.sign(f.x - self.x) || 1;
    const dist = Math.hypot(f.x - self.x, (f.groundY - self.y) * 1.6);
    P.gaze = { x: f.x, y: f.y };
    P.headFollow = 0.95;
    P.earPerk = 0.7;
    P.pupil = 1.3;
    if (a.phase === 'go') {
      a.spot = a.spot || this.toward({ x: f.x, y: f.groundY }, self, 122);
      P.move = { to: a.spot, gait: 'stroll', face, tol: 22 };
      const there = !self.seat && !self.airborne && Math.hypot(self.x - a.spot.x, self.y - a.spot.y) < 30;
      if (there || a.t > 12) { a.phase = 'do'; a.t = 0; this.say('frogMeet', true); }
      return;
    }
    P.move = { to: { x: self.x, y: self.y }, face, tol: 400 };
    P.posture = 'sit';
    P.tilt = Math.sin(a.t * 0.7) * 9;
    P.tailAmp = 0.4;
    // every croak gets an answer: cheeks out, and Kon's best frog
    const since = a.croakAt ? this.now - a.croakAt : -1;
    if (since > 0.55 && since < 1.5) {
      P.pout = 1;
      P.pucker = 0.7;
      P.eyeOpen = 1.12;
      P.browL = P.browR = 0.6;
      if (a.answered !== a.croakAt) { a.answered = a.croakAt; this.say('frogRibbit', true); this.emit('sfx', 'croak'); }
    }
    // the frog hops; so does Kon
    if (a.hopAt && a.hopped !== a.hopAt && this.now - a.hopAt > 0.25) { a.hopped = a.hopAt; this.impulse({ type: 'hop', s: 0.7 }); }
    // it moved off: follow once or twice, then let it be
    if (dist > 230 && (a.follows || 0) < 2) { a.follows = (a.follows || 0) + 1; a.phase = 'go'; a.spot = null; a.t = 0; return; }
    if (a.t > 14) { this.life.lastVisit.frog = this.now; this.dropLife(4); }
  }

  // ------------------------------------------------------------------ pebbles (that are only pebbles)
  /** Something small moved, over there. Returns true if Kon goes to look. */
  noticeTsubu(s, dt) {
    const t = this.obj('tsubu', s);
    const L = this.life;
    if (!t || !t.moving || !t.reach || this.greet) return false;
    if (this.now - (L.lastVisit.tsubu ?? -1e9) < 75 || this.rng() > dt * 0.11) return false;
    this.startLife('tsubu');
    this.say('tsubuSee', true);
    return true;
  }

  tickTsubu(dt, s, P) {
    const a = this.life.act;
    const self = s.self;
    const t = this.obj('tsubu', s);
    a.t += dt;
    if (!t || !t.out) {
      if (!a.goneAt) { a.goneAt = this.now; this.say('tsubuGone', true); }
      P.gaze = a.last || null;
      P.headFollow = 0.8;
      P.tilt = -10;
      P.browL = 0.6;
      P.posture = 'stand';
      if (this.now - a.goneAt > 2) { this.life.lastVisit.tsubu = this.now; this.dropLife(3); }
      return;
    }
    const at = a.phase === 'do' && a.last ? a.last : { x: t.x, y: t.groundY };
    a.last = at;
    const face = Math.sign(at.x - self.x) || 1;
    if (a.phase === 'go') {
      a.spot = this.toward(at, self, 78);
      P.move = { to: a.spot, gait: 'walk', face, tol: 16 };
      P.gaze = { x: at.x, y: at.y - 8 };
      P.headFollow = 0.9;
      P.crouch = 0.15;
      P.earPerk = 0.8;
      P.pupil = 1.25;
      P.posture = 'stand';
      const there = !self.seat && !self.airborne && Math.hypot(self.x - a.spot.x, self.y - a.spot.y) < 24;
      if (there || a.t > 12) {
        a.phase = 'do';
        a.t = 0;
        a.run = this.makeAct('inspectPebble', { dur: 5.6, target: { x: at.x, y: at.y - 8 }, pebble: t.nearId });
        this.say('tsubuInspect', true);
      }
      return;
    }
    P.move = { to: { x: self.x, y: self.y }, face, tol: 400 };
    this.runAct(a.run, dt, P);
    if (a.t > 5.6) {
      this.life.lastVisit.tsubu = this.now;
      this.out.suspect = { x: at.x, y: at.y - 8, from: this.now + 1.5, until: this.now + 2.7 };
      this.dropLife(4);
    }
  }

  // ------------------------------------------------------------------ the tail
  tickTail(dt, s, P) {
    const a = this.life.act;
    const self = s.self;
    a.t += dt;
    if (a.phase === 'go') {
      a.spot = a.spot || randomSpot(this.rng);
      P.move = { to: a.spot, gait: 'walk' };
      if ((self.arrived && !self.seat && Math.hypot(self.x - a.spot.x, self.y - a.spot.y) < 18) || a.t > 10) { a.phase = 'do'; a.t = 0; this.say('tailChase', true); }
      return;
    }
    const t = a.t;
    const tail = s.body.tail;
    P.posture = 'stand';
    P.gaze = tail;
    P.headFollow = 1;
    if (t < 1) {
      // …what is that, following Kon around?
      P.move = { to: a.spot, face: self.faceDir, tol: 400 };
      P.pupil = 1.4;
      P.eyeOpen = 1.1;
      P.earPerk = 1;
      P.tailAmp = 0.9;
      P.tailSpeed = 2.4;
      P.bodyFollow = 0.3;
    } else if (t < 3.6) {
      // round and round (it stays exactly one tail-length ahead)
      const flip = Math.floor((t - 1) / 0.3) % 2 ? 1 : -1;
      P.move = { to: a.spot, face: flip, tol: 400 };
      P.lean = Math.sin(t * 20) * 5;
      P.crouch = 0.22;
      P.mouthOpen = 0.3;
      P.smile = 0.6;
      P.earPerk = 0.5;
      P.tailAmp = 1;
      P.tailSpeed = 3.4;
      // (reach with the paw on the tail's side, so the arm doesn't cross the face)
      P[tail.x > self.x ? 'armR' : 'armL'] = { x: tail.x, y: tail.y, space: 'world' };
      if (Math.floor(t / 0.3) !== a.beat) { a.beat = Math.floor(t / 0.3); this.impulse({ type: 'hop', s: 0.22 }); }
    } else {
      if (!a.dizzy) { a.dizzy = true; this.say('tailDizzy', true); }
      P.move = { to: a.spot, tol: 400 };
      P.posture = 'sit';
      P.gaze = null;
      P.headFollow = 0;
      P.spiral = 1;
      P.tilt = Math.sin(t * 6) * 11;
      P.yaw = Math.cos(t * 6) * 0.3;
      P.mouthOpen = 0.18;
      P.earPerk = -0.4;
      P.blink = false;
      if (t > 5.4) { this.life.lastVisit.tail = this.now; this.dropLife(4); }
    }
  }

  // ------------------------------------------------------------------ a little snow fox
  tickSnowfox(dt, s, P) {
    const a = this.life.act;
    const self = s.self;
    a.t += dt;
    if (!s.weather || s.weather.white < 0.2) { this.dropLife(2); return; }
    if (a.phase === 'go') {
      P.move = { to: SNOWFOX_STAND, gait: 'walk', face: -1 };
      P.gaze = SNOWFOX_AT;
      if ((!self.seat && Math.hypot(self.x - SNOWFOX_STAND.x, self.y - SNOWFOX_STAND.y) < 18) || a.t > 14) {
        a.phase = 'do';
        a.t = 0;
        a.run = this.makeAct('buildSnow', { dur: 9, target: { x: SNOWFOX_AT.x, y: SNOWFOX_AT.y - 30 } });
        this.say('snowfoxBuild', true);
      }
      return;
    }
    P.move = { to: SNOWFOX_STAND, face: -1, tol: 400 };
    this.runAct(a.run, dt, P);
    if (a.t > 6.4 && !a.said) { a.said = true; this.say('snowfoxDone', true); }
    if (a.t > 9) { this.life.lastVisit.snowfox = this.now; this.dropLife(5); }
  }
}

const has = (s, kind) => (s.objects || []).some((o) => o.kind === kind);
const wet = (s) => !!s.weather && s.weather.rain > 0.25;

/** Things Kon does out in the garden that need more than "walk there and play an act". */
export const OUTDOOR_ACTIVITIES = [
  { id: 'puddle', weight: 2.4, tick: 'tickPuddle', dur: [1, 1], at: (s) => s.weather.puddles[0], when: (s) => !!s.weather && s.weather.puddles.length > 0 && s.weather.snow < 0.2 },
  { id: 'ball', weight: 0.85, tick: 'tickBall', dur: [1, 1], at: (s) => (s.objects || []).find((o) => o.kind === 'ball'), when: (s) => has(s, 'ball') && !wet(s) && !s.night },
  { id: 'frog', weight: 2.2, tick: 'tickFrog', dur: [1, 1], at: (s) => (s.objects || []).find((o) => o.kind === 'frog'), when: (s) => (s.objects || []).some((o) => o.kind === 'frog' && o.state === 'sit') },
  { id: 'tail', weight: 0.42, tick: 'tickTail', dur: [1, 1], at: () => ({ x: 800, y: 900 }), when: (s) => !!s.weather && !wet(s) && s.weather.snow < 0.2 },
  { id: 'snowfox', weight: 3, tick: 'tickSnowfox', dur: [1, 1], at: () => SNOWFOX_STAND, when: (s) => !!s.weather && s.weather.white > 0.45 && !s.snowfox },
  { id: 'tsubu', weight: 0, tick: 'tickTsubu', dur: [1, 1], at: () => ({ x: 800, y: 900 }), when: () => false },
];
const OUTDOOR_DEFS = Object.fromEntries(OUTDOOR_ACTIVITIES.map((d) => [d.id, d]));
