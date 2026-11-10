# ZEN70 · 禅道

A small zen garden, and the fox who lives in it. **Kon** is a novice kitsune monk in a red Inari bib. Kon is supposed to be meditating, but is very bad at it.

Kon has a life of its own. It wanders the garden: sniffing the flower, drinking at the basin, bothering the snail, sunbathing on the warm rock, and jumping every time the bamboo clacks. It also secretly watches you. When you notice, it pretends it was doing something else entirely.

The garden doesn't wait for you. Clouds drift over, gather, and now and then it rains (Kon produces a leaf for an umbrella, and has opinions about puddles). On some nights it snows. Some of the pebbles on the sand are not pebbles, but they only move when nobody is watching. Leave the page alone for a minute and see what it gets up to.

The garden is a terrace high on a mountainside. Past its edge the land falls away to a lake at the foot of autumn hills, with a village on the far shore, a torii standing in the water and a snow-capped peak behind it all. The garden keeps your local time: the light changes through the day, at dawn a sea of clouds fills the valley, the wind comes and goes, and after dark there are stars, a full moon, village lights and fireflies.

![Kon's garden above the valley](docs/screenshots/garden.jpg)

![Dawn, golden hour, sunset and night](docs/screenshots/times.jpg)

![Rain, a rainbow, snow, and a wedding on the far shore](docs/screenshots/weather.jpg)

## Run it

No build step and no dependencies, only Python 3:

```bash
python3 serve.py
```

Then open **http://localhost:8070**. If that port is already taken, `serve.py` uses the next free one (8071, 8072, …) and prints the address. `python3 serve.py 9000` asks for a specific port. Any static server also works; `serve.py` just turns off caching so edits show up on reload.

Useful URLs:

| URL | What it is |
| --- | --- |
| `/` | the garden |
| `/?debug` | live overlay: state, activity, attention, curiosity, meditation progress |
| `/?motion=full` | every movement, even if your system asks for reduced motion |
| `/?reduced` | force reduced-motion behavior |
| `/?hour=21` | pretend it's 9 pm (the garden follows your local time) |
| `/?weather=rain` | start in the rain (or `snow`, `sunshower`, `cloudy`); otherwise the weather comes and goes by itself |
| `/tests/` | 74 behavior tests (simulated input, deterministic) |
| `/?demo=pounce` | a scripted moment, frozen for a screenshot (see below) |

Fonts come from Google Fonts (Fraunces, Kalam, Ma Shan Zheng). Offline, the page falls back to system fonts.

**Reduced motion:** if your operating system asks for reduced motion, Kon tones down big movements. The pounce leap, the dizzy spin and floating hearts are skipped, and leaning and stretching shrink to about a third. Add `?motion=full` to see everything.

## Things to try

**Kon's life**
- Do nothing and watch. Kon sits a while, then picks somewhere to go, based on what it hasn't visited lately. It walks there with momentum and hops on and off the cushion and rock. It shrinks as it walks toward the terrace edge and passes behind the lantern. Its paws leave prints in the sand.
- Shake the maple. When a leaf lands, Kon trots over and pounces on it.
- **A sparrow drops by** now and then (by day). It perches on the lantern, the wish rack, the rock, the basin rim or the sand, hops about, pecks, and cocks its head. On the sand it's prey: Kon creeps up low and slow, wiggles, and pounces. The sparrow always gets away (sometimes it spots Kon coming). Up out of reach, Kon sits below and chatters at it. Swipe or tap near the bird and it's gone. Hold perfectly still while Kon meditates, and it may land on Kon's head. Kon must not move.
- At night (light the lantern, or visit after 7 pm) Kon warms its paws at the lantern, and your cursor becomes a firefly.

**The weather** (it changes by itself: the first clouds usually gather within a minute or two)
- **Wait for rain.** The sky goes grey, the far mountains fade, drops ring on the sand and puddles collect in its hollows. Kon looks up at the first drop, holds out a paw to be sure, then pulls out a big leaf and holds it over its head. It drinks the rain, listens to it, and sooner or later sees a puddle: a run-up, a wiggle, and in it goes, twice more for good measure. When the rain moves on, Kon shakes itself dry (and comes out fluffier).
- **Then look up:** if the sun is out, there's a rainbow, and the camera tilts up a little to see it.
- **Squeeze a cloud.** Click or tap one and it lets go of a small private shower. If it happens to be over Kon: "Why only me?!"
- **Tap a puddle** for a splash. Walk Kon through one (it happens) and its paws splash too.
- **A sunshower** (rain out of a bright sky) is rarer. In the old stories it means a fox is getting married, and if you watch the far shore of the lake, a line of lanterns walks along it, out across the water, and through the torii that stands there. Kon knows what it is, and bows.
- **On some nights it snows.** It settles on the lantern, the pine, the stones, the wish rack, the trees in the valley, and on Kon's head if Kon sits still. Kon catches flakes on its tongue. Once enough has fallen it builds a small snow fox, with red ears and a bib of its own. Paw prints show in the snow.
- **Clouds have shapes.** Mostly cloud shapes. Now and then one looks a lot like a fox, a fish or a rabbit, and Kon points it out.

**The small residents**
- **The pebbles that aren't pebbles.** Five small stone spirits live under the sand. They come out when the cursor has been still for a few seconds (or is gone): a parade across the sand, a wobbly tower of five, an evening around the warm lantern. Move the mouse at all and they are pebbles: eyes shut, sprout folded flat. Hold still and they carry on. Hover over one for too long, or tap it, and it squeaks and dives under. It's the game Kon plays with you, the other way around.
  - When Kon truly meditates (or sleeps), they come and sit around the cushion with their eyes closed. At satori they float a little, too.
  - Kon sometimes thinks it saw one move, walks over, sniffs it, pokes it, waits… and shrugs. One last suspicious look over the shoulder.
  - Switch to another tab for a while and come back: they thought you had gone.
  - In the rain each one carries a maple leaf over its head. They leave tiny footprints.
- **The temari ball.** Brush the cursor through it or tap it and it rolls off, bouncing off the scenery. Kon can't see a rolling ball without going after it, and if you kicked it, bats it back toward your cursor. Left alone, Kon plays with it by itself.
- **A frog** comes out of the stone basin when it rains (first only its eyes). It croaks, and Kon, sitting politely in front of it, puffs out its cheeks and answers. Get too close and it leaps away; press it and it dives back into the basin.
- **A butterfly** visits on fair days. It likes the bellflower, Kon's nose (do not sneeze), and above all a cursor that holds still: it will land on it and ride along if you move gently.
- **Kon's own business:** chasing its tail until the garden spins; and when it sleeps, a thought bubble shows what it dreams about (inari sushi, the sparrow, the ball, and you).
- **Far away:** a fish jumps in the lake now and then; after dark, paper lanterns sometimes drift across it; and once in a while a pair of eyes blinks in the trees. (It means no harm.)

![The garden's other residents](docs/screenshots/residents.jpg)

**The world**
- **Move the mouse and look around.** Every layer has its own depth: the sky barely moves, the valley a little, the out-of-focus grass at the corners the most. Even when you're still, the view breathes.
- **Arrive.** The camera starts up in the sky and comes down to the garden.
- **Watch the valley.** A boat drifts on the lake, birds cross now and then, and after dark the village windows light up (and go out, one by one), lamps glow along the path of torii gates, and the moon lays a glittering path on the water.
- The camera pushes in on the small moments (a firefly on Kon's nose, a leaf on its head, a wish), and tilts up toward the sky while the sun goes down.

**The sky and the weather**
- **Light the lantern.** It doesn't flip a switch, it runs the clock: the afternoon turns gold, the sun slides behind the hills through shafts of light, the sky goes orange and violet, and the full moon rises behind the pagoda. Kon turns to watch ("Whoa. Pretty…"). Put the lantern out and the night flies by into morning. Click it again halfway and the clock runs back.
- **Wait for the wind.** Every half minute or so a gust runs through: the maple lets go of a few leaves, the pampas grass bows, curls of wind draw themselves through the air like brush strokes, fallen leaves skitter over the sand. Kon's ears stream, and if it's resting it turns its face into the wind and enjoys it. Gust-blown leaves are fair game for a pounce.
- **At night, look up.** A shooting star crosses the sky now and then, and Kon makes a wish. Catch one (click or tap it) and the wish plaque glows gold: a wish sent while it glows leaves on a golden crane. Poke the moon and the rabbit in it pounds its mochi. Kon waves.
- **Sit still and watch Kon.** A falling leaf may settle on its head (eyes up, then a big puff). After dark a firefly sometimes lands on its nose: a long cross-eyed stare, then a sneeze.
- With sound on: crickets after dark, a bird now and then by day, the rush of a gust, rain on the sand, the frog.

![Small moments](docs/screenshots/moments.jpg)

**Secretly watching you**
- Move the mouse for a while. Kon's eyes, head and body follow, each with its own lag. It gets curious, tilts its head, stretches its neck, and may walk a few steps closer to see.
- **Stop.** Kon freezes ("uh-oh"), plops down and plays an innocence act. Move again and Kon side-eyes you before giving up the act. Freeze during the side-eye and Kon snaps straight back into it.
- **Move slowly along the sand, then freeze.** Foxes hunt: Kon crouches, sneaks closer, wiggles, and pounces on the cursor in a high arc. It finds nothing and claims it was only stretching.
- **Rush the cursor at Kon** to catch it peeking. Repeated catches escalate: startled, then hiding behind its paws (peeking through), then a pout with crossed arms, then sticking out its tongue.
- **Click the wish plaque and type.** Kon walks over and stands on tiptoe to read over your shoulder. Stop typing and it pretends to be reading the other wishes. Press Enter and your wish folds into a paper crane and flies off.

**Stillness**
- **Be perfectly still.** Kon walks home to the cushion and checks whether you're really gone: it waves, pulls faces, plays peekaboo, dances. Flinch, and Kon gloats. Hold out, and a spirit brush paints the big ensō stroke by stroke while Kon truly meditates. Any movement and the ink evaporates. At the end comes satori: Kon floats, the ensō turns gold, and a 悟 seal is stamped (the seal counts your satori). Then Kon drops.

**The sand**
- **Drag across the sand** to rake it. The grooves slowly smooth themselves away. Rake a circle and Kon walks over to judge it with a score card. Rake a spiral and Kon gets dizzy following it.

**Everything else**
- Boop the nose (Kon sneezes). Rub the head back and forth. Circle Kon quickly (spiral eyes). Tap the bamboo, poke the snail.
- Come back later. Kon greets returning visitors, and after a long absence it has raked a doodle in the sand for you.

Nothing typed is read or stored: Kon only receives "an input happened" events (see `js/input.js`). Kon's memory of you (visit count, satori count) stays in this browser's local storage.

## How it's built

Plain ES modules, hand-drawn SVG, canvas for ink and sand, and one `requestAnimationFrame` loop. There's no framework.

```
js/input.js            raw DOM events → "senses" (pointer, typing, events)
  ↓
js/kon/                Kon
  brain.js             perception, attention, events, the state machine's plumbing
  life.js · social.js · stillness.js · play.js    the states, grouped by what they're about
  visitors.js          Kon and the sparrow: notice, stalk, watch, pounce, be a perch
  outdoors.js          Kon and the weather, the ball, the frog, the pebbles, its own tail: the leaf umbrella, puddle jumps…
  acts.js · captions.js · voice.js                authored performances, the narrator, Kon's own lines
  mover.js             intent → motion: gaits, momentum, path following, jumps, footfalls
  rig.js               motion + pose → springs → SVG (face.js, limbs.js, effects.js)
js/garden/             the garden
  world.js             the ground: perspective, obstacles, platforms, places, paths
  scene.js             framing, camera, parallax, depth sorting, overlays (art.js, props.js)
  sky.js               the clock: a palette per hour, the sun and moon, the lantern's time-lapse
  light.js             the light map over the garden, sun shafts and dust, leaf shade
  vista.js             beyond the terrace: the peak's reflection, the lake and village, autumn hills, the torii path, the forest below, the sea of clouds, the out-of-focus corners, the boat and the birds
  wind.js · night.js   gusts and pampas grass; shooting stars, the moon rabbit, a firefly
  weather.js           the weather's own mind (clouds, rain, sunshowers, snow, a rainbow) and how it's drawn: the cloud layer,
                       the rain-and-snow canvas, puddles, lying snow, the fox wedding, a fish in the lake, the snow fox
  birds.js             the sparrow: perches, flight, hops and pecks, what scares it
  spirits.js           the pebble spirits: when they dare to move, their numbers (parade, tower, sitting with Kon), going under
  toys.js · critters.js   the temari ball; the frog and the butterfly
  dreams.js            the thought bubble over a sleeping fox
  rake.js · zen.js · enso.js                      raking and paw prints, the live ensō, the brush
js/main.js             wiring and the loop · util.js, math.js, clock.js, memory.js, audio.js, demo.js
```

The brain, rig and scene are each one class whose methods are grouped into a few files by responsibility (`mixin(Brain, Life, Social, Stillness, Play, Visitors, Outdoors)`). A state's code lives next to related states, not in one long file.

- **A ground with perspective.** Every point on the ground has a depth scale. Kon is 1.15× at the cushion, about 0.9× near the terrace edge, and about 1.5× right in front of you. Moving toward or away from the viewer covers fewer screen units than moving sideways. The scenery is sorted by where it meets the ground, and Kon is re-inserted among it as it walks, so it passes behind the lantern and in front of the rock.
- **A body with momentum.** The brain only says where it wants to be. The mover accelerates with limited force, slows down on arrival, and walks around obstacles (a tiny planner: detours around ellipses, replanning when stuck). It hops onto the cushion and rock and flies ballistic arcs for pounces. Footfalls drive paw prints in the sand; landings squash the rig.
- **A rig that walks.** Kon's upper body rises on short legs when it stands. The feet step in a walk cycle (bigger bounce when trotting), the arms swing, the body leans into the turn, the belly and bib shift to suggest a three-quarter view, and the tail swings over to trail behind.
- **Light, painted per hour.** A palette for each key hour (dawn, morning, noon, afternoon, golden hour, sunset, dusk, night) is blended for the current minute. The far scenery gets its colors from it. The garden itself is lit by a small light map: ambient color, brighter toward the sun or moon, the lantern's warm pool, fireflies, leaf shade, a vignette. From golden hour to dawn it is multiplied over the garden; in daylight it is a plain see-through overlay, because blending a whole screen is costly without a GPU. The far scenery's paint is divided by the light that will fall on it, so the sky ends up exactly the color the palette asks for.
- **A camera with depth.** Every layer has a depth, from the sky (0.22) through the valley (0.4) to the ground (1) and the out-of-focus corners (1.5). The pan that follows Kon, the mouse's parallax, a slow breathing drift and the tilt all scale with it. On wide screens the camera pans gently with Kon; on phones it follows Kon around the garden. Push-ins scale the whole stage around a point. All of it is composited transforms, snapped to whole pixels and only written when they change, and every screen ↔ world conversion goes through the camera, so the pointer, the plaque, the captions and Kon's bubble stay pinned while it moves.
- **Weather is a palette, too.** `Weather` only keeps a few numbers (cloud cover, rain, snow, how wet the ground is, how much snow lies) and moves them slowly toward what the current weather wants. Everything else reads them: the sky's colors lose saturation under cloud, the light map dims and its sun shafts and leaf shade fade, stars hide, clouds appear in order of rank, puddles fill once the ground is wet enough for each hollow. Rain, snow, splashes and the far-off lantern procession are drawn on one canvas above the light map; clouds are a handful of SVG groups that are only touched when they have moved half a unit.
- **Things that stand on the ground share the depth sort.** The ball, the frog and each spirit are slotted between the scenery by the row where they touch the ground, the same way Kon and the sparrow are. Taps on them are worked out from where the tap lands on the ground, so they never block a boop.
- **Watched or not.** The spirits' whole rule is one number: seconds since the pointer last moved. Below 1.3 they are stones (a hop already begun is finished: that's the bit you catch from the corner of your eye). Each one wakes a fifth of a second after the last. Kon walking up to them counts as being watched.
- **Different delays for eyes, head and body.** Each rig channel is a damped spring with its own frequency: eyes about 9 Hz, head about 3 Hz, body about 1.6 Hz. Ears, the tuft, the bib bell and the tail take their motion from those.
- **Two layers of behavior.** A *life* layer chooses activities by novelty, whim and distance whenever nobody's around. A *social* layer reacts to you (watch, peek, pretend, startle, stalk, read, judge) and always wins. The state machine: `IDLE (life) → WATCH → NOTICED → PRETENDING → RESUMING`, plus `STARTLED`, `POUNCE`, `JUDGE`, `ZAZEN → SATORI`, `DROWSY → SLEEPING → WAKING`, `GOTCHA`, `DIZZY`, `PETTED`, `BOOPED`, `ADMIRE`.

## Verification

- **`/tests/`**: 74 scenario tests drive the real `Brain` *and* `Mover` (and the sparrow, the weather, the ball, the spirits, the frog and the butterfly) with simulated input on a seeded random generator. Highlights:
  - tracking, stop → pretend, resume, snap-back, act variety, escalating startles;
  - typing and mouse as independent sources;
  - the stillness game (temptation, gotcha, breaking and restarting, jitter tolerance, satori), and stroke analysis (circles, ovals, spirals);
  - the world: Kon wanders when left alone and goes home to meditate; walking between every pair of places never enters scenery; hopping on and off the cushion; momentum; walking over to read; stalk → pounce → miss; pouncing on a leaf; walking over to judge a circle;
  - the sparrow: it ignores a still cursor but flees a fast one (away from it); it lands on Kon only in deep meditation and leaves when Kon stirs; Kon creeps up and pounces and never catches it; birds out of reach get watched, not pounced; typing beats birds;
  - the sky: a sane palette at every minute of the day (sun by day, moon and stars by night); the lantern's time-lapse spends clearly more of its time between golden hour and dusk than those hours' share, never runs backwards by accident, and rewinds when clicked again;
  - small moments: a gust makes a resting Kon enjoy the breeze (and doesn't wake a sleeping one); a shooting star gets a wish, but doesn't break real meditation; a firefly on the nose means a long cross-eyed stare and a sneeze that sends it off; a leaf on the head gets looked at and blown away; the moon rabbit gets a wave;
  - Kon's voice and the narrator never say the same line, and speech bubbles don't pile up;
  - the weather: a whole story from clouds to rainbow with its events in order, puddles that fill and dry; left to itself every sky changes within a few minutes, it only snows at night, and there are no rainbows after dark;
  - Kon in the rain: it notices, the leaf comes out after a few seconds and goes away afterwards, then a shake; rain doesn't break true meditation (and no umbrella appears), but it wakes a sleeping fox; a puddle gets a run-up, a leap, three splashes and delight;
  - the ball: 40 kicks in every direction always end at rest on open sand, inside the garden; a kick from you makes Kon chase it, cursor or no cursor, and bat it back toward you;
  - the spirits: they move only while nobody is watching (zero movement while the cursor moves), never come out while it's busy, go home by themselves, never hop into scenery, build a tower of five, sit down around a meditating Kon without disturbing it and scatter when it stirs; under Kon's nose they don't move at all, even when poked;
  - the frog comes out in the rain, croaks, leaps from a cursor, dives when pressed and leaves when it dries; Kon answers its croaks; the butterfly lands on a still cursor, rides along, and flees a jerk;
  - a 60-step random session, and a long wet, snowy, busy one, with NaN checks.

  **74/74 pass.**
- **`/?demo=<name>`**: runs a scripted input sequence through the real pipeline on a virtual clock and freezes on one moment. A drawn cursor shows where the "mouse" is. Examples: `go&to=basin&t=2.4`, `at&to=rock`, `go&x=300&y=760&t=14` (behind the lantern), `stalk2`, `pounce`, `typing`, `judge&t=5.2`, `zazen&t=0.6`, `satori`, `tempt`, `gotcha`, `doodle&visits=3&away=5`, `night`, `sparrow&perch=lantern&t=7`, `sparrow-hunt&phase=creep` (or `wiggle`, `air`, `land`), `sparrow-head`, `idle&hour=17.5` (any hour), `night&t=4.2` (mid time-lapse), `gust` (`&lens=1`), `meteor` (`&caught=1`), `moon`, `firefly`, `leafhat`, `intro&t=0.4` (the arrival), `flock`; the weather and the residents: `rain`, `puddle&phase=air` (or `wiggle`, `land`), `rainbow`, `sunshower`, `wedding&u=0.5`, `snow`, `snowfox`, `cloudpoke&kon=1`, `cloudshape&shape=fox` (or `fish`, `rabbit`), `tsubu&mode=tower` (or `parade`, `lantern`; `&watch=1`, `&kon=1`), `tsubu-zen`, `ball` (`&fetch=1`), `frog`, `butterfly&on=cursor` (or `flower`, `nose`), `tail`, `toro&hour=22`, `dream&n=1`; and the older `peek`, `noticed`, `pretend&act=whistle`, `resume`, `startle`, `cover`, `pout`, `bleh`, `sleep`, `dizzy`, `pet`, `boop`, `admire`.
- **`PORT=8070 tests/screenshots.sh`** captures 55 of them at desktop (1440×900) and phone (390×844) size with headless Firefox into `docs/screenshots/`.
- **Performance**: script work is about 0.3–0.5 ms per frame, measured in the virtual-clock mode. That excludes the browser's own paint time. Static scenery sits on its own layers, and the sand canvas pans with a CSS transform instead of being redrawn.

![The stillness game](docs/screenshots/stillness.jpg)

![Reactions to you](docs/screenshots/overview.jpg)

![Mobile](docs/screenshots/mobile-overview.jpg)

## Known limitations

- **Not watched by a person on a real display.** Motion was checked in real time in headless Firefox (software rendering, real mouse/keyboard/touch input through WebDriver), frame by frame on the virtual clock, and with film strips and screenshots. Frame rates measured there are a floor, not what a GPU-accelerated browser will do: about 54 fps by day, about 35 at golden hour and 31 at night, when the light map is multiplied over a dozen full-screen layers (a GPU does that in its sleep; software compositing doesn't). Walking speed, spring stiffness and act timing may still want a tuning pass once you've played with it.
- **Not tested on real phones.** Touch input, the following camera and the on-screen keyboard layout were checked only at emulated sizes (390×844) with synthesized touch events.
- **Rain costs frames where there is no GPU.** Under cloud the light map goes back to a multiply (as at night) and the rain canvas is redrawn every frame: about 26 fps in headless software rendering, against 50 on a clear day. With a GPU this is nothing.
- **On a phone the camera follows Kon,** so the spirits (or the frog, or the far end of the lantern procession) can be off screen while they do their best work. They pick spots that are in view when they come out, but Kon may wander.
- **Wide, short windows show only a sliver of sky,** so clouds are mostly their undersides there, and a cloud shaped like a fox may only show its chin.
- **No back view.** Kon always shows its face. When walking straight away from you it turns to a three-quarter view instead of showing its back.
- **The wish plaque is an HTML form on top of the garden,** so it always draws in front of Kon. Kon's reading spot sits just beside it to avoid overlapping.
- **Falling leaves draw in front of everything**, even when they land behind Kon.
- **Kon's eyes follow an estimate of the caret**, based on how many input events happened, not the real caret.
- **Sound** is a few synthesized effects and a soft ambience (crickets, distant birds, gusts, rain), off by default. They were only checked to be scheduled, not listened to.
- `js/demo.js` (verification helpers) ships with the page. Drop it before production.

## Tests

```bash
python3 tests/run.py [-v] [-k sparrow]     # 74 behavior tests + a boot check (page errors, and NaN written into the SVG), headless Firefox
python3 tests/live/scenarios.py            # live: 16 scenarios, real mouse/keyboard/touch in real time, desktop + phone
python3 tests/visual_diff.py capture DIR   # pixel baseline of 28 scripted demos…
python3 tests/visual_diff.py compare DIR   # …and the diff after a change
python3 tests/live/observe.py --seconds 60 # watch the garden untouched: states, frame times, errors
python3 tests/live/perf.py --walk          # frame times with layers switched off one at a time
```

All of these need the dev server running (`python3 serve.py`) and Firefox installed. Add `--url http://localhost:PORT` if it isn't on 8070.
