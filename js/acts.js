// Acts — short authored performances that Kon can play.
//
// Each act writes pose targets as a function of its own clock `t`. The rig's
// springs smooth everything, so an act can switch targets abruptly and still
// move naturally. Acts never end by themselves: the brain decides how long to
// hold them, which lets an act keep going while Kon cautiously peeks out of it.
//
// ctx (built by the brain when the act starts):
//   side      +1 / -1 — the side to look *away* to (opposite the visitor)
//   seed      random number for small variations
//   target    the last thing Kon was secretly watching (world point)
//   away(dx, dy)  world point relative to Kon's head
//   place(name)   a fixed world point (flower, lantern, bamboo, maple…)
//   object(kind)  a live scene object (e.g. the dragonfly) or null
//   once(key, fn) runs fn the first time it is called with that key
//   emit(type)    ask the scene for something (spawn a dragonfly, bob the flower)
//   impulse(i)    one-shot physical kick for the rig

import { smoothstep, bump, track } from './math.js';

const GASSHO_L = { x: -5, y: -76, space: 'body' };
const GASSHO_R = { x: 5, y: -76, space: 'body' };

export const ACTS = {
  // ---------------- innocence acts (played after being "noticed") ----------------

  meditate: {
    caption: 'meditate',
    pose(t, P, c) {
      P.gaze = null;
      P.headFollow = 0;
      P.pitch = -0.12;
      const close = smoothstep(0.05, 0.3, t);
      P.shutL = P.shutR = close;
      P.shutStyle = 'calm';
      P.smile = 0.4;
      P.browL = P.browR = 0.35;
      P.armL = GASSHO_L;
      P.armR = GASSHO_R;
      P.breath = 0.6;
      P.tailAmp = 0.05;
      P.earPerk = 0.1;
      // …but one eye keeps cracking open to check on you.
      if (t > 1.2) {
        const cyc = (t - 1.2) % 2.3;
        const n = Math.floor((t - 1.2) / 2.3);
        const k = bump(0, 0.75, cyc);
        if (k > 0) {
          const left = ((n + Math.floor(c.seed * 10)) % 2) === 0;
          if (left) { P.shutL = 1 - 0.78 * k; P.lidL = 0.42; }
          else { P.shutR = 1 - 0.78 * k; P.lidR = 0.42; }
          P.gaze = c.target;
          P.headFollow = 0;
          P.browTiltL = P.browTiltR = -0.25 * k;
        }
      }
    },
  },

  whistle: {
    caption: 'whistle',
    pose(t, P, c) {
      const s = c.side;
      P.gaze = c.away(s * 300, -320 + Math.sin(t * 0.9) * 30);
      P.headFollow = 0.75;
      P.tilt = s * 8;
      P.lidL = P.lidR = 0.34;
      P.pucker = smoothstep(0.15, 0.45, t);
      P.smile = 0;
      P.browL = P.browR = 0.3;
      P.lean = Math.sin(t * 3.4) * 2.4 * smoothstep(0.4, 1, t);
      P.tailAmp = 0.35;
      P.tailSpeed = 0.9;
      P.fx.notes = t > 0.45 ? 1 : 0;
      P.yaw += Math.sin(t * 1.7) * 0.05;
      // paws tucked casually behind the back
      P.armL = { x: -50, y: -46, space: 'body' };
      P.armR = { x: 50, y: -46, space: 'body' };
      if (t > 0.45) c.once('whistle-sfx', () => c.emit('sfx', 'whistle'));
    },
  },

  groom: {
    caption: 'groom',
    pose(t, P, c) {
      const cyc = t % 3.8;
      P.shutStyle = 'happy';
      P.shutL = P.shutR = smoothstep(0.1, 0.35, t);
      P.smile = 0.3;
      P.blink = false;
      P.gaze = c.away(c.side * 80, 140);
      P.headFollow = 0.3;
      if (cyc < 1.8) {
        // lick the paw
        const lick = Math.sin(t * 12);
        P.armR = { x: 12, y: 42 + lick * 2.5, space: 'head' };
        P.tongue = 0.45 + 0.4 * Math.max(0, lick);
        P.mouthOpen = 0.16;
        P.pitch = 0.25;
        P.tilt = 7;
      } else {
        // wipe the face and ear with it
        const w = (cyc - 1.8) / 2.0;
        const sweep = Math.sin(w * Math.PI * 3);
        P.armR = { x: 34 + sweep * 10, y: -6 - Math.abs(sweep) * 44, space: 'head' };
        P.earR = 34 * Math.max(0, sweep);
        P.tilt = 14;
        P.pitch = 0.08;
      }
    },
  },

  flower: {
    caption: 'flower',
    pose(t, P, c) {
      const f = c.place('flower');
      P.gaze = f;
      P.headFollow = 0.9;
      P.bodyFollow = 0.4;
      P.reachX = -10;
      P.reachY = 6;
      P.tilt = -10 + Math.sin(t * 1.3) * 5;
      P.eyeOpen = 1.06;
      P.pupil = 1.25;
      P.browL = 0.55;
      P.browR = 0.25;
      P.mouthOpen = 0.08;
      P.earPerk = 0.4;
      P.earL = -6;
      P.tailAmp = 0.25;
      const cyc = (t - 0.8) % 1.9;
      const n = Math.floor((t - 0.8) / 1.9);
      if (t > 0.8 && cyc < 0.5) {
        P.armL = { x: f.x + 4, y: f.y + 2, space: 'world' };
        if (cyc > 0.22) c.once('poke' + n, () => { c.emit('poke'); c.impulse({ type: 'earFlick', side: 'l', s: 0.5 }); });
      } else {
        P.armL = { x: -52, y: -44, space: 'body' };
      }
    },
  },

  sky: {
    caption: 'sky',
    pose(t, P, c) {
      c.once('dragonfly', () => c.emit('dragonfly'));
      const df = c.object('dragonfly');
      P.gaze = df || c.away(Math.sin(t * 0.7 + c.seed * 6) * 340, -440);
      P.headFollow = 0.95;
      P.pitch -= 0.1;
      P.mouthOpen = 0.1 + 0.06 * Math.sin(t * 2);
      P.lidL = P.lidR = 0.04;
      P.eyeOpen = 1.05;
      P.browL = P.browR = 0.5;
      P.earPerk = 0.35;
      P.tailAmp = 0.25;
      P.armL = { x: -26, y: -40, space: 'body' };
      P.armR = { x: 26, y: -40, space: 'body' };
    },
  },

  fakesleep: {
    caption: 'fakesleep',
    pose(t, P, c) {
      P.gaze = null;
      P.headFollow = 0;
      P.pitch = 0.32;
      P.tilt = c.side * 12;
      P.shutL = P.shutR = smoothstep(0.05, 0.25, t);
      P.shutStyle = 'calm';
      P.mouthOpen = 0.12;
      P.smile = 0;
      P.crouch = 0.12;
      P.breath = 0.55;
      P.fx.zzz = t > 0.5 ? 2 : 0;
      P.sweat = 0.85;
      P.earPerk = -0.3;
      P.blink = false;
      // the ear closest to you keeps swivelling your way — it is listening
      if (t % 2.4 > 1.7) {
        if (c.targetSide < 0) P.earL = -24; else P.earR = -24;
      }
    },
  },

  // ---------------- idle behaviors (nobody is around) ----------------

  lookAround: {
    pose(t, P, c) {
      const spots = c.spots;
      const i = Math.min(spots.length - 1, Math.floor(t / 1.5));
      P.gaze = spots[i];
      P.headFollow = 0.65;
      P.tilt = Math.sin(c.seed * 9 + i) * 5;
    },
  },

  viewer: {
    pose(t, P) {
      // a slow blink at the viewer — the cat way of saying "I like you"
      P.gaze = null;
      P.headFollow = 0;
      P.smile = 0.45;
      P.blink = false;
      const k = bump(0.9, 2.0, t);
      P.shutL = P.shutR = Math.min(1, k * 1.4);
      P.shutStyle = 'calm';
      P.tilt = 4 * Math.sin(t * 0.8);
    },
  },

  earTwitch: {
    pose(t, P, c) {
      c.once('a', () => c.impulse({ type: 'earFlick', side: c.side < 0 ? 'l' : 'r' }));
      if (t > 0.38) c.once('b', () => c.impulse({ type: 'earFlick', side: c.side < 0 ? 'l' : 'r', s: 0.6 }));
    },
  },

  scratch: {
    pose(t, P) {
      const k = smoothstep(0.2, 0.4, t) * (1 - smoothstep(1.6, 1.8, t));
      if (k > 0.02) {
        const sc = Math.sin(t * Math.PI * 2 * 7.5);
        P.armL = { x: -66 + sc * 3, y: -30 + sc * 4, space: 'head' };
        P.tilt = -14;
        P.shutL = 1;
        P.shutStyle = 'happy';
        P.lidR = 0.35;
        P.smile = 0.55;
        P.mouthOpen = 0.08;
        P.earL = 14 + sc * 4;
      } else {
        P.armL = { x: -40, y: -60, space: 'body' };
      }
    },
  },

  stretch: {
    pose(t, P, c) {
      if (t < 0.4) {
        P.crouch = 0.25;
      } else if (t < 1.7) {
        P.armL = { x: -34, y: -108, space: 'head' };
        P.armR = { x: 34, y: -108, space: 'head' };
        P.stretch = 1;
        P.pitch = -0.35;
        P.shutL = P.shutR = 1;
        P.shutStyle = 'squeeze';
        P.mouthOpen = 0.85;
        P.earPerk = -0.4;
        P.reachY = -6;
      } else {
        c.once('shudder', () => c.impulse({ type: 'shudder' }));
        P.smile = 0.5;
      }
    },
  },

  yawn: {
    pose(t, P, c) {
      if (t > 0.25) c.once('sfx', () => c.emit('sfx', 'yawn'));
      P.mouthOpen = track(t, [[0, 0], [0.3, 0.3], [0.7, 1.05], [1.4, 1.05], [1.7, 0], [1.85, 0.18], [1.95, 0], [2.05, 0.15], [2.15, 0]]);
      const eyes = track(t, [[0, 0], [0.4, 1], [1.5, 1], [1.8, 0]]);
      P.shutL = P.shutR = eyes;
      P.shutStyle = 'squeeze';
      P.pitch = -0.3 * eyes;
      P.tilt = 6 * eyes;
      P.earPerk = -0.6 * eyes;
      P.browTiltL = P.browTiltR = 0.5 * eyes;
    },
  },

  adjustBib: {
    pose(t, P, c) {
      P.gaze = c.place('bib');
      P.headFollow = 0.9;
      P.pitch += 0.25;
      P.smile = 0.4;
      const tug = Math.sin(t * 14) * 2;
      if (t < 1.4) {
        P.armL = { x: -34, y: -95 + tug, space: 'body' };
        P.armR = { x: 34, y: -95 - tug, space: 'body' };
      } else if (t < 2.0) {
        P.armR = { x: 2, y: -78 + bump(1.4, 1.7, t) * 4 + bump(1.7, 2.0, t) * 4, space: 'body' };
      } else {
        P.gaze = null;
        P.headFollow = 0;
        P.smile = 0.6;
        c.once('nod', () => c.impulse({ type: 'flinch', s: 0.3 }));
      }
    },
  },

  meditateAttempt: {
    pose(t, P, c) {
      P.armL = GASSHO_L;
      P.armR = GASSHO_R;
      P.gaze = null;
      P.headFollow = 0;
      P.pitch = -0.08;
      P.shutL = P.shutR = smoothstep(0.1, 0.5, t);
      P.shutStyle = 'calm';
      P.smile = 0.35;
      P.breath = 0.6;
      P.blink = false;
      // terrible at zen: something always catches an eye
      const k = bump(4.0, 5.4, t);
      if (k > 0) {
        P.shutR = 1 - k * 0.85;
        P.lidR = 0.3;
        P.gaze = c.spots[0];
      }
      if (t > 5.6) {
        P.shutL = P.shutR = 0;
        P.armL = P.armR = null;
        P.gaze = c.spots[0];
        P.headFollow = 0.7;
        P.browL = P.browR = 0.5;
      }
    },
  },

  tailCheck: {
    pose(t, P, c) {
      P.gaze = c.place('tail');
      P.headFollow = 0.9;
      P.bodyFollow = 0.25;
      const k = bump(0.5, 2.0, t);
      P.tailAmp = 0.2 + 0.8 * k;
      P.tailSpeed = 0.6 + 1.6 * k;
      P.eyeOpen = 1 + 0.08 * k;
      P.pupil = 1 + 0.3 * k;
      P.earPerk = 0.5 * k;
      if (k > 0.3) P.armR = { x: 82, y: -62, space: 'body' };
    },
  },

  flowerSniff: {
    pose(t, P, c) {
      const f = c.place('flower');
      P.gaze = f;
      P.headFollow = 0.9;
      P.bodyFollow = 0.45;
      P.reachY = 8;
      P.tilt = -8;
      P.smile = 0.5;
      const sniff = bump(0.8, 2.2, t);
      P.shutL = P.shutR = sniff * 0.9;
      P.shutStyle = 'happy';
      P.mouthOpen = Math.max(0, Math.sin(t * 22)) * 0.06 * sniff;
      if (t > 2.3) c.once('ahh', () => c.impulse({ type: 'hearts', n: 1 }));
    },
  },
};

// ---------------- the stillness test: Kon tries to make you flinch ----------------

Object.assign(ACTS, {
  temptWave: {
    caption: 'temptWave',
    pose(t, P) {
      P.gaze = null;
      P.headFollow = 0;
      P.smile = 0.75;
      P.eyeOpen = 1.06;
      P.earPerk = 0.6;
      P.browL = P.browR = 0.5;
      const w = Math.sin(t * 11);
      P.armR = { x: 72 + w * 9, y: -46, space: 'head' };
      P.tilt = w * 4;
      P.tailAmp = 0.5;
      P.tailSpeed = 1.6;
    },
  },

  temptFaces: {
    caption: 'temptFaces',
    pose(t, P, c) {
      const n = c.body().nose;
      P.gaze = { x: n.x, y: n.y + 6 };
      P.headFollow = 0;
      P.tongue = 1;
      P.mouthOpen = 0.1;
      P.earL = Math.sin(t * 9) * 22;
      P.earR = -Math.sin(t * 9) * 22;
      P.browL = Math.sin(t * 6) * 0.8;
      P.browR = -Math.sin(t * 6) * 0.8;
      P.eyeOpen = 1.1;
      P.tilt = Math.sin(t * 3) * 8;
    },
  },

  temptPeekaboo: {
    caption: 'temptPeekaboo',
    pose(t, P) {
      P.gaze = null;
      P.headFollow = 0;
      const hide = t % 1.5 < 0.9;
      if (hide) {
        P.armL = { x: -36, y: -2, space: 'head' };
        P.armR = { x: 36, y: -2, space: 'head' };
        P.shutL = P.shutR = 1;
        P.shutStyle = 'squeeze';
      } else {
        P.armL = { x: -76, y: -40, space: 'head' };
        P.armR = { x: 76, y: -40, space: 'head' };
        P.eyeOpen = 1.2;
        P.smile = 1;
        P.mouthOpen = 0.4;
        P.earPerk = 1;
      }
    },
  },

  temptDance: {
    caption: 'temptDance',
    pose(t, P, c) {
      const b = Math.sin(t * 7);
      P.gaze = null;
      P.headFollow = 0;
      P.lean = b * 6;
      P.tilt = -b * 8;
      P.armL = { x: -56, y: -100 - Math.max(0, b) * 22, space: 'body' };
      P.armR = { x: 56, y: -100 - Math.max(0, -b) * 22, space: 'body' };
      P.smile = 0.9;
      P.shutL = P.shutR = 1;
      P.shutStyle = 'happy';
      P.tailAmp = 0.9;
      P.tailSpeed = 2.6;
      P.crouch = Math.abs(b) * 0.12;
      c.once('sfx', () => c.emit('sfx', 'whistle'));
    },
  },

  // ---------------- hello again ----------------

  greetWave: {
    pose(t, P) {
      P.gaze = null;
      P.headFollow = 0;
      P.smile = 0.7;
      P.eyeOpen = 1.05;
      P.earPerk = 0.6;
      P.blush = 0.35;
      P.tailAmp = 0.6;
      P.tailSpeed = 1.8;
      if (t < 1.7) {
        const w = Math.sin(t * 10);
        P.armR = { x: 70 + w * 8, y: -44, space: 'head' };
        P.tilt = w * 3;
      }
    },
  },

  greetBow: {
    pose(t, P) {
      P.gaze = null;
      P.headFollow = 0;
      P.armL = GASSHO_L;
      P.armR = GASSHO_R;
      const b = bump(0.3, 1.7, t);
      P.pitch = 0.55 * b;
      P.reachY = 8 * b;
      P.shutL = P.shutR = b;
      P.shutStyle = 'calm';
      P.smile = 0.5;
    },
  },

  doodleProud: {
    pose(t, P, c) {
      P.gaze = c.place('doodle');
      P.headFollow = 0.8;
      P.bodyFollow = 0.2;
      P.smile = 0.8;
      P.blush = 0.4;
      P.tilt = 6;
      P.earPerk = 0.5;
      P.tailAmp = 0.5;
      if (t > 1.3) {
        P.gaze = null;
        P.headFollow = 0;
        P.shutL = P.shutR = 1;
        P.shutStyle = 'happy';
      }
    },
  },
});

export const TEMPT_ACTS = ['temptWave', 'temptFaces', 'temptPeekaboo', 'temptDance'];

export const PRETEND_ACTS = ['meditate', 'whistle', 'groom', 'flower', 'sky', 'fakesleep'];
export const IDLE_ACTS = [
  ['lookAround', 3, 4.6],
  ['viewer', 2, 2.8],
  ['earTwitch', 2, 0.9],
  ['scratch', 1.4, 2.0],
  ['stretch', 1, 2.5],
  ['yawn', 1, 2.3],
  ['adjustBib', 1, 2.6],
  ['meditateAttempt', 1.6, 6.6],
  ['tailCheck', 1, 2.5],
  ['flowerSniff', 1, 3.0],
];
