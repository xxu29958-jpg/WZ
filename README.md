# ZEN70 · 禅道 — first prototype

A small zen garden. Its resident is **Kon**, a novice kitsune monk in a red Inari bib. Kon is supposed to be meditating, but is very bad at it.

Kon secretly watches your cursor and your typing. When you stop, Kon realizes you noticed and pretends to have been doing something else entirely.

![Kon's behaviors](docs/screenshots/overview.jpg)

## Run it

No build step and no dependencies, only Python 3:

```bash
python3 serve.py
```

Then open **http://localhost:8070**. Any static server also works; `serve.py` just turns off caching so edits show up on reload.

Useful URLs:

| URL | What it is |
| --- | --- |
| `/` | the garden |
| `/?debug` | live overlay: state, act, attention source, curiosity values |
| `/?reduced` | force reduced-motion behavior |
| `/tests/` | 22 behavior tests (simulated input, deterministic) |
| `/?demo=peek` | scripted demo frozen on one moment (see below) |

Fonts come from Google Fonts (Fraunces, Kalam, Ma Shan Zheng). Offline, the page falls back to system fonts.

## Things to try

- Move the mouse for a while. Kon's eyes, head and body follow, each with its own lag. Over time Kon gets curious, tilts its head, stretches its neck and rises on tiptoe.
- **Stop.** Kon freezes ("uh-oh"), withdraws, looks away and plays an innocence act: meditating (with one eye sneaking open), whistling, grooming, examining the flower, studying the sky or fake-sleeping. Move again and Kon side-eyes you before giving up the act. Freeze during the side-eye and Kon snaps straight back into the act.
- **Move slowly** and Kon crouches like a hunting fox, pupils wide. **Move fast** and Kon goes alert with wide eyes.
- **Rush the cursor at Kon** to catch Kon peeking. Repeat it: the reaction escalates from startled, to hiding behind paws (and peeking through them), to a pout with crossed arms, to sticking out its tongue.
- **Click the wish plaque and type.** Kon leans over to read and its eyes follow the line. Stop typing and Kon pretends it wasn't reading. Press Enter and the wish folds into a paper crane and flies off. Kon swears it didn't read it.
- Boop the nose (Kon sneezes). Rub the head back and forth (Kon permits this, then denies it happened). Circle Kon quickly (spiral eyes).
- Light the stone lantern (night, fireflies). Shake the maple. Tap the bamboo deer-scarer. Poke the snail.
- Do nothing: Kon blinks, breathes, yawns, scratches an ear, adjusts the bib, admires the flower, and eventually falls asleep with a snot bubble.
- Switch tabs and come back.

Nothing typed is read or stored: Kon only receives "an input happened" events (see `js/input.js`).

## How it's built

Plain ES modules, hand-drawn SVG and one `requestAnimationFrame` loop. There's no framework.

```
InputTracker (js/input.js)   raw DOM events → a "senses" snapshot (pointer, typing, events)
      ↓
Brain        (js/brain.js)   senses → pose: what Kon wants to do (pure logic, no DOM)
  └ Acts     (js/acts.js)    authored performances: innocence acts and idle behaviors
      ↓
FoxRig       (js/rig.js)     pose → ~60 springs → SVG transforms and paths
Scene        (js/scene.js)   layout per screen shape, garden props, events for the brain
```

- **Different delays for eyes, head and body.** Every rig channel is a damped spring with its own frequency: eyes about 9 Hz, head about 3 Hz, body about 1.6 Hz. While the head catches up, the eyes lead and then re-center, much like real eyes. Ears, the ahoge tuft, the bib bell and the tail wave take their motion from the primary channels' velocities.
- **Believable eyes.** Each eye computes its own direction, so a close cursor makes Kon go slightly cross-eyed. The iris stays inside an ellipse limit. Blinks happen randomly and also on big gaze shifts, along with small micro-saccades.
- **State machine.** `IDLE → WATCH (OBSERVING → CURIOUS → PEEKING) → NOTICED → PRETENDING → RESUMING → WATCH`, plus `STARTLED`, `RELAXING`, `DROWSY → SLEEPING → WAKING` and the easter-egg states `DIZZY`, `PETTED`, `BOOPED`, `ADMIRE`. The WATCH sub-labels come from one continuous curiosity value, so the posture blends instead of switching.
- **Two independent input sources.** Pointer and typing each keep their own interest and activity timers. A small attention arbiter (with hysteresis) decides what Kon looks at. Typing while moving the mouse gives brief glances at the cursor, not flicker. A pause in one source while the other is active hands attention over instead of faking innocence.
- **Pretend acts don't end on their own.** The brain decides how long to hold them, which is what lets Kon peek *out of* an act and snap back into it.
- **Responsive framing.** The world is 1600×1000 design units, extended past its edges. `Scene.layout()` picks a viewBox per screen shape: wide, tall (phone), or compact (phone keyboard open). It then positions the HTML plaque and caption on matching world points.
- **Reduced motion.** Lean, neck stretch, tilt and hops drop to about 35%, springs stop overshooting, and the dizzy spin and floating hearts are skipped.

## Verification

- **`/tests/`**: 22 scenario tests drive the real `Brain` with simulated pointer and typing input on a seeded random generator. They cover tracking, slow vs fast movement, stop → noticed → pretend, resume, snap-back, act variety across six cycles, rapid start/stop (no reaction spam), escalating startle variants with no re-trigger while the cursor stays near, focus and typing peeks, typing pause while the mouse moves (and the reverse), glances while doing both, repeated focus/blur, sleep and wake, dizzy, petting, boop, wish submission, and a 60-step random session with NaN checks. **22/22 pass.**
- **`/?demo=<name>`**: runs a scripted input sequence through the real InputTracker → Brain → Rig pipeline on a virtual clock and freezes on one moment. A drawn cursor shows where the "mouse" is. Names: `idle peek peek-low stalk noticed pretend resume startle cover pout bleh typing typing-stop both sleep dizzy pet boop admire night`. Optional: `&act=whistle|meditate|groom|flower|sky|fakesleep`, `&t=<seconds>`.
- **`tests/screenshots.sh`** captures all of the above at desktop (1440×900) and phone (390×844) size with headless Firefox into `docs/screenshots/`.
- **Performance**: script work is about 0.5 ms per frame while Kon watches and about 0.15 ms at rest (measured in the virtual-clock mode). That excludes the browser's own paint time. The scenery sits on its own static layers.

![Mobile](docs/screenshots/mobile-overview.jpg)

## Known limitations

- **Live 60 fps feel was not watched in real time.** The in-app browser pane was hidden during development, which throttles animation frames. Motion was verified frame by frame on the virtual clock and with screenshots, not by watching it live. Fine timing (spring stiffness, act durations) may want a tuning pass once you've played with it.
- **Not tested on real phones.** Touch input and the on-screen keyboard layout were checked only with emulated viewports. iOS Safari and Android Chrome may need small adjustments.
- **Kon's eyes follow an estimate of the caret**, based on how many input events happened, not the real caret. Edits in the middle of the text or long text won't line up exactly.
- **Petting** needs the cursor over Kon's head. The first approach always startles Kon, so petting works from the second approach on (by design, but not obvious).
- **The dragonfly** only appears during the "studying the sky" act or about once every one to two minutes.
- **Sound** is a few basic synthesized effects, off by default.
- **Some browsers block canvas-to-image export.** The ensō and paper grain are therefore drawn directly onto canvases rather than exported as images.
- `js/demo.js` (verification helpers, ~8 KB) ships with the page. Drop it before production.
- Kon can't be booped or petted from the keyboard. The lantern, bamboo and maple can (Tab, then Enter).

## Files

```
index.html          the scene (SVG art for the garden and Kon), plaque, controls
css/style.css       palette, paint classes, layout, night mode
js/main.js          wiring and the animation loop
js/input.js         pointer + typing tracker (no text is read)
js/brain.js         behavior state machine
js/acts.js          innocence acts and idle behaviors
js/captions.js      the narrator's lines
js/rig.js           springs → SVG; effects (notes, z's, hearts, sneeze puffs)
js/scene.js         layout, generated art (ensō, sand, hills, maple), garden props
js/audio.js         tiny Web Audio synth
js/math.js          springs, easing, seeded random, shuffle bag, splines
js/clock.js         real or virtual clock
js/demo.js          scripted demos for screenshots
tests/              behavior tests and the screenshot script
serve.py            no-cache local server
```
