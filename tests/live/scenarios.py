"""Live scenario checks in a real (headless) Firefox, with real input in real time.

    python3 tests/live/scenarios.py --url http://localhost:8070/ [--only typing,rake] [--shots DIR]

Each scenario drives the page with WebDriver input actions (mouse, keyboard,
touch), then checks what Kon actually did (states, position, captions) through
window.__zen. Prints PASS/FAIL per scenario; exits non-zero on any failure.
"""
import argparse
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from marionette import Firefox  # noqa: E402
from observe import FRAME_PROBE  # noqa: E402


class Page:
    def __init__(self, ff, url, shots, size):
        self.ff, self.url, self.shots = ff, url, shots
        self.w, self.h = size
        from urllib.parse import urlparse
        u = urlparse(url)
        self.origin = f"{u.scheme}://{u.netloc}"
        self.path = url[len(self.origin):] or "/"

    def load(self, extra="", wait=1.2):
        # pin the time of day (the garden follows the local clock), unless a scenario asks otherwise
        if "hour=" not in extra:
            extra = (extra + "&" if extra else "") + "hour=12"
        sep = "&" if "?" in self.path else "?"
        self.ff.open_sized(self.origin, self.path + (sep + extra if extra else ""), self.w, self.h)
        self.ff.js(FRAME_PROBE)
        time.sleep(wait)

    def js(self, s, *a):
        return self.ff.js(s, *a)

    def screen(self, x, y):
        return self.js("const p = window.__zen.scene.toScreen(arguments[0], arguments[1]); return [p.x, p.y];", x, y)

    def head(self):
        return self.js("const z = window.__zen; const h = z.rig.measure().head; const p = z.scene.toScreen(h.x, h.y); return [p.x, p.y];")

    def state(self):
        return self.js("return window.__zen.brain.state")

    def history(self):
        return [h["to"] for h in self.js("return window.__zen.brain.history")]

    def kon(self):
        return self.js("const m = window.__zen.mover.state(); return {x: m.x, y: m.y, seat: m.seat, moving: m.moving};")

    def caption(self):
        return self.js("return window.__zen.brain.caption")

    def shot(self, name):
        if self.shots:
            path = os.path.join(self.shots, name + ".png")
            self.ff.screenshot(path)
            try:  # crop to the page's viewport
                from PIL import Image
                Image.open(path).crop((0, 0, self.w, self.h)).save(path)
            except Exception:  # noqa: BLE001
                pass

    def wait_for(self, js_cond, timeout=10, every=0.1):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if self.js("return !!(" + js_cond + ")"):
                return True
            time.sleep(every)
        return False

    def errors(self):
        return self.js("return window.__errors || []")

    def layout_problems(self):
        """Overlaps between the speech bubble, caption, branding, buttons and plaque,
        and text spilling off-screen — measured from the real on-screen boxes."""
        return self.js("""
          const box = (q) => { const e = document.querySelector(q); if (!e) return null;
            const st = getComputedStyle(e); if (st.display === 'none' || +st.opacity < 0.5) return null;
            const r = e.getBoundingClientRect(); return r.width && r.height ? r : null; };
          const B = { bubble: box('#kon-says.show'), caption: box('#caption span'), brand: box('.brand'),
                      buttons: box('.corner'), plaque: box('#wish .ema-board') };
          const hit = (a, b) => a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
          const out = [];
          for (const o of ['caption', 'brand', 'buttons', 'plaque']) if (hit(B.bubble, B[o])) out.push('bubble×' + o);
          for (const o of ['plaque', 'brand', 'buttons']) if (hit(B.caption, B[o])) out.push('caption×' + o);
          for (const k of ['bubble', 'caption']) { const r = B[k]; if (r && (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight)) out.push(k + ' off-screen'); }
          return out;""")

    def check_layout(self, moment, problems):
        bad = self.layout_problems()
        if bad:
            problems.append(f"{moment}: {', '.join(bad)}")


def sweep_points(cx, cy, ax, ay, n=40, turns=1.5):
    return [(cx + ax * math.sin(i / n * turns * 2 * math.pi), cy + ay * math.sin(i / n * turns * 4 * math.pi)) for i in range(n + 1)]


# ---------------------------------------------------------------- scenarios
def watch_stop_resume(p):
    p.load("motion=full")
    hx, hy = p.head()
    p.ff.pointer_path(sweep_points(hx, hy - 260, 380, 30), duration_ms=3600)
    peeking = p.js("return window.__zen.brain.state === 'WATCH' && window.__zen.brain.cur > 0.5")
    p.shot("watch-peek")
    probs = []
    p.check_layout("peek", probs)
    ok_pretend = p.wait_for("window.__zen.brain.state === 'PRETENDING'", 3)
    time.sleep(0.8)
    p.shot("watch-pretend")
    time.sleep(0.8)
    p.check_layout("pretend", probs)
    p.ff.pointer_path(sweep_points(hx, hy - 260, 300, 20, turns=1), duration_ms=2400)
    resumed = "RESUMING" in p.history()
    return peeking and ok_pretend and resumed and not probs, f"peeking={peeking} pretend={ok_pretend} resumed={resumed} layout={probs or 'ok'}; {' → '.join(p.history())}"


def rush_startle(p):
    p.load("motion=full")
    hx, hy = p.head()
    p.ff.pointer_path([(hx + 520, hy - 20), (hx + 520, hy - 10)], duration_ms=300)
    p.ff.pointer_path([(hx + 520, hy - 10), (hx + 20, hy)], duration_ms=350)
    ok = p.wait_for("window.__zen.brain.history.some(h => h.to === 'STARTLED')", 2)
    time.sleep(0.15)
    p.shot("rush-startle")
    said = p.js("return window.__zen.brain.voice.key")
    probs = []
    p.check_layout("startle", probs)
    return ok and said == "startled" and not probs, f"Kon said: {said}; layout={probs or 'ok'}; " + " → ".join(p.history())


def typing_walks_over(p):
    p.load("motion=full")
    box = p.js("const r = document.getElementById('wish-input').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];")
    p.ff.pointer_path([(box[0], box[1])], 0, press=True)
    p.ff.type_keys("a quiet", delay_ms=140)
    probs = []
    p.check_layout("typing (walking over)", probs)
    said = p.js("return window.__zen.brain.voice.key")
    p.ff.type_keys(" morning", delay_ms=140)
    p.ff.type_keys(" with tea", delay_ms=160)
    time.sleep(0.2)
    k = p.kon()
    near = p.js("const W = window.__zen.scene.mode === 'wide'; const m = window.__zen.mover.state(); const s = W ? {x:1060,y:828} : {x:800,y:936}; return Math.hypot(m.x - s.x, m.y - s.y);")
    p.shot("typing-reading")
    ok_pretend = p.wait_for("['NOTICED','PRETENDING'].includes(window.__zen.brain.state)", 3.5)
    time.sleep(0.6)
    p.shot("typing-pretend")
    value_untouched = p.js("return document.getElementById('wish-input').value") == "a quiet morning with tea"
    p.check_layout("typing (pretending)", probs)
    return near < 40 and ok_pretend and value_untouched and not probs, f"distance to reading spot {near:.0f}; pretended={ok_pretend}; said={said}; layout={probs or 'ok'}; {' → '.join(p.history())}"


def rake_circle_judged(p):
    p.load("motion=full")
    cx, cy = p.screen(1000, 948)
    r = 70 * p.js("return window.__zen.scene.scale")
    pts = [(cx + r * math.cos(a / 48 * 2 * math.pi), cy + 0.6 * r * math.sin(a / 48 * 2 * math.pi)) for a in range(50)]
    p.ff.pointer_path(pts, duration_ms=1700, press=True)
    ok = p.wait_for("window.__zen.brain.state === 'JUDGE'", 2)
    card = p.wait_for("window.__zen.brain.state === 'JUDGE' && window.__zen.brain.arg.phase === 'judge' && window.__zen.brain.stateT - window.__zen.brain.arg.jt0 > 1.6", 7)
    score = p.js("return window.__zen.brain.arg.score")
    p.shot("rake-judge")
    return ok and card and score >= 6, f"judged={ok} card shown={card} score={score}"


def stalk_and_pounce(p):
    p.load("motion=full")
    time.sleep(1)
    x0, y = p.screen(1150, 905)
    x1, _ = p.screen(860, 905)
    pts = [(x0 + (x1 - x0) * i / 60, y) for i in range(61)]
    p.ff.pointer_path(pts, duration_ms=4800)
    stalking = p.js("return window.__zen.brain.stalkT")
    p.shot("stalk")
    ok_air = p.wait_for("window.__zen.brain.state === 'POUNCE' && window.__zen.brain.arg.phase === 'air' && window.__zen.mover.state().jumpU > 0.4", 4)
    p.shot("pounce-air")
    ok_after = p.wait_for("window.__zen.brain.state === 'PRETENDING'", 5)
    time.sleep(0.3)
    p.shot("pounce-miss")
    probs = []
    p.check_layout("after the pounce", probs)
    ok_after = ok_after and not probs
    return ok_air and ok_after, f"stalkT={stalking:.2f} airborne={ok_air} then pretended={ok_after}; {' → '.join(p.history())}"


def maple_leaf_chase(p):
    p.load("motion=full")
    time.sleep(4.5)  # let Kon settle
    # click a real leaf on the branch (the branch only reacts to its leaves and twigs)
    mx, my = p.js("""const W = innerWidth; let best = null;
      for (const el of document.querySelectorAll('#maple-leaves > g')) { const r = el.getBoundingClientRect();
        if (r.right < W - 10 && r.top > 10 && (!best || r.left < best.left)) best = r; }
      return [best.left + best.width / 2, best.top + best.height / 2];""")
    p.ff.pointer_path([(mx, my)], 0, press=True)
    p.ff.pointer_path([(40, 40)], 0)   # move the cursor out of the way
    ok = p.wait_for("window.__zen.brain.history.some(h => h.to === 'POUNCE')", 20)
    time.sleep(0.4)
    p.shot("leaf-pounce")
    return ok, " → ".join(p.history())


def lantern_night(p):
    p.load("motion=full")
    lx, ly = p.screen(330, 584)
    p.ff.pointer_path([(lx, ly)], 0, press=True)
    # the lantern runs a time-lapse: night arrives when the sky is dark (a few seconds)
    lapsing = p.js("return window.__zen.scene.sky.lapsing")
    night = False
    for _ in range(40):
        time.sleep(0.25)
        night = p.js("return document.body.classList.contains('is-night')")
        if night:
            break
    time.sleep(3)
    p.shot("night")
    return night and lapsing, f"lapse={lapsing} night={night} caption='{p.caption()['text']}'"


def mobile_touch(p):
    p.load("motion=full", wait=1.5)
    mode = p.js("return window.__zen.scene.mode")
    hx, hy = p.head()
    # tap on Kon's head → pat
    p.ff.tap(hx, hy - 20)
    patted = p.wait_for("window.__zen.brain.state === 'PETTED'", 1.5)
    time.sleep(2.5)
    # touch-drag a circle on the sand → raked and judged
    cx, cy = p.screen(820, 960)
    r = 60 * p.js("return window.__zen.scene.scale")
    pts = [(cx + r * math.cos(a / 40 * 2 * math.pi), cy + 0.6 * r * math.sin(a / 40 * 2 * math.pi)) for a in range(42)]
    p.ff.pointer_path(pts, duration_ms=1500, kind="touch", press=True)
    judged = p.wait_for("window.__zen.brain.history.some(h => h.to === 'JUDGE')", 2)
    time.sleep(3.5)
    p.shot("mobile-judge")
    probs = []
    p.check_layout("phone, judging", probs)
    overflow = p.js("return document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight")
    return mode == "tall" and patted and judged and not overflow and not probs, f"mode={mode} patted={patted} judged={judged} overflow={overflow} layout={probs or 'ok'}"


def sparrow_hunt_and_scare(p):
    p.load("motion=full")
    time.sleep(2)
    # 1) a sparrow on the sand: Kon creeps up and pounces; the bird gets away
    # (it may spot Kon creeping and leave early — the unit tests cover that; here it stays put)
    p.js("const z = window.__zen; z.brain.zenArmed = false; z.birds.sneakNotice = 0; z.birds.visit('sand', {x: 1125, y: 958});")
    p.ff.pointer_path([(20, 20)], 0)   # cursor parked in a corner, out of the way
    crept = p.wait_for("(() => { const a = window.__zen.brain.life.act; return a && a.id === 'bird' && window.__zen.mover.state().gait === 'sneak' && window.__zen.mover.state().moving; })()", 10)
    time.sleep(0.8)
    p.shot("sparrow-creep")
    probs = []
    p.check_layout("creeping up on the sparrow", probs)
    pounced = p.wait_for("window.__zen.brain.state === 'POUNCE'", 12)
    escaped = p.wait_for("window.__zen.birds.state === 'flyAway' || window.__zen.birds.state === 'away'", 4)
    why = p.js("return window.__zen.birds.lastFlee")
    time.sleep(1.2)
    p.shot("sparrow-after")
    p.check_layout("after the pounce", probs)
    p.wait_for("window.__zen.birds.state === 'away'", 4)
    # 2) a sparrow on the lantern: a quick swipe of the real mouse sends it off
    p.wait_for("window.__zen.brain.state === 'IDLE'", 6)
    p.js("window.__zen.birds.visit('lantern')")
    landed = p.wait_for("window.__zen.birds.state === 'perched'", 6)
    bx, by = p.screen(351, 500)
    pts = [(bx + 260 - i * 13, by + 60 - i * 3) for i in range(21)]
    p.ff.pointer_path(pts, duration_ms=250)
    scared = p.wait_for("window.__zen.birds.state !== 'perched'", 1.5)
    ok = crept and pounced and escaped and landed and scared and not probs
    return ok, f"crept={crept} pounced={pounced} bird escaped={escaped} ({why}); lantern landing={landed} swipe scared it={scared}; layout={probs or 'ok'}"


def sparrow_touch(p):
    p.load("motion=full", wait=1.5)
    vb = p.js("const v = window.__zen.scene.vb; return [v.x, v.w]")
    spot = {"x": vb[0] + vb[1] * 0.72, "y": 955}
    p.js("const z = window.__zen; z.brain.zenArmed = false; z.birds.visit('sand', arguments[0]);", spot)
    landed = p.wait_for("window.__zen.birds.state === 'perched'", 6, every=0.05)
    sx, sy = p.screen(spot["x"], spot["y"] - 12)
    on_screen = 0 <= sx <= p.w and 0 <= sy <= p.h
    p.shot("sparrow-phone")
    p.ff.tap(sx, sy)
    scared = p.wait_for("window.__zen.birds.state !== 'perched'", 1.2)
    return landed and on_screen and scared, f"landed={landed} on screen at ({sx:.0f},{sy:.0f})={on_screen} tap scared it={scared}"


# where the shooting star will be a moment from now, on screen (it's in the far sky layer)
METEOR_AHEAD = """
  const sc = window.__zen.scene, m = sc.meteor, dt = arguments[0];
  if (!m) return null;
  const x = m.x + Math.cos(m.ang) * 780 * dt, y = m.y + Math.sin(m.ang) * 780 * dt;
  const s = sc.farToScreen(x, y, 0.22);
  return [s.x, s.y];
"""


def night_sky(p, touch=False):
    """After dark: catch a falling star with a real click (or tap), send a wish on a golden
    crane, then poke the moon."""
    p.load("motion=full&hour=22.6", wait=1.8)
    p.js("window.__zen.brain.zenArmed = false;")
    caught = False
    for _ in range(3):  # (a real pointer has some lag; give it a few stars)
        p.js("window.__zen.scene.spawnMeteor()")
        time.sleep(0.12)
        at = p.js(METEOR_AHEAD, 0.1)
        if not at:
            continue
        if touch:
            p.ff.tap(at[0], at[1])
        else:
            p.ff.pointer_path([(at[0], at[1])], 0, press=True)
        caught = p.wait_for("document.getElementById('wish').classList.contains('starlit')", 0.8)
        if caught:
            break
        time.sleep(1.2)
    # (the plaque lights up at once; Kon hears about it on the next frame)
    p.wait_for("window.__zen.brain.caption.key === 'starCaught'", 0.6, every=0.05)
    said = p.caption()["key"]
    p.shot("star-caught" + ("-phone" if touch else ""))
    box = p.js("const r = document.getElementById('wish-input').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];")
    if touch:
        p.ff.tap(box[0], box[1])
    else:
        p.ff.pointer_path([(box[0], box[1])], 0, press=True)
    p.ff.type_keys("a quiet year", delay_ms=60)
    p.ff.type_keys("\ue007", delay_ms=60)  # Enter
    golden = p.wait_for("window.__zen.scene.crane && window.__zen.scene.crane.g.getAttribute('class') === 'crane-gold'", 2)
    wish_caption = p.caption()["key"]
    time.sleep(4.5)
    moon = p.js("const sc = window.__zen.scene; if (!sc.moonAt) return null; const s = sc.farToScreen(sc.moonAt.x, sc.moonAt.y, 0.22); return [s.x, s.y];")
    poked = False
    if moon:
        if touch:
            p.ff.tap(moon[0], moon[1])
        else:
            p.ff.pointer_path([(moon[0], moon[1])], 0, press=True)
        poked = p.wait_for("window.__zen.brain.caption.key === 'moonRabbit'", 1.5)
    ok = caught and said == "starCaught" and golden and wish_caption == "starWish" and poked
    return ok, f"caught a star={caught} ({said}); golden crane={golden} ({wish_caption}); moon poked={poked}"


def night_sky_touch(p):
    return night_sky(p, touch=True)


# phones (portrait and landscape), tablets, laptops, big and ultra-wide screens
SIZES = ["320x568", "375x667", "390x844", "414x896", "844x390", "768x1024", "1024x768", "1280x720", "1440x900", "1920x1080", "2560x1080"]


def layout_at_sizes(p):
    """Load the garden at many viewport sizes and check what's on screen, then make
    Kon talk and check the bubble too. On phone sizes, also pat Kon with a tap."""
    rows, bad = [], []
    for size in SIZES:
        w, h = map(int, size.split("x"))
        p.w, p.h = w, h
        p.load("motion=full", wait=1.4)
        m = p.js("""
          const z = window.__zen, R = (q) => { const e = document.querySelector(q); return e ? e.getBoundingClientRect() : null; };
          const kon = document.querySelector('#kon-upper').getBoundingClientRect(), head = R('#kon-head');
          const plaque = R('#wish .ema-board'), brand = R('.brand'), corner = R('.corner');
          const hit = (a, b) => a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
          const inside = (r, pad = 0) => r && r.left >= -pad && r.top >= -pad && r.right <= innerWidth + pad && r.bottom <= innerHeight + pad;
          const btns = [...document.querySelectorAll('.corner button')].map((b) => b.getBoundingClientRect());
          return { mode: z.scene.mode, vw: [innerWidth, innerHeight],
            overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
            konOn: inside(kon, 4), headOn: inside(head), plaqueOn: inside(plaque), plaqueOverHead: hit(plaque, head),
            brandOverButtons: hit(brand, corner), brandOverHead: hit(brand, head), buttonsOverHead: hit(corner, head),
            plaqueOverBrand: hit(plaque, brand), smallestButton: Math.min(...btns.map((b) => Math.min(b.width, b.height))),
            konH: Math.round(kon.height) };""")
        probs = []
        p.check_layout("resting", probs)
        # the help panel fits on screen (or scrolls)
        hints = p.js("""document.getElementById('btn-hints').click(); const h = document.getElementById('hints'), r = h.getBoundingClientRect();
          const ok = r.right <= innerWidth && r.left >= 0 && r.bottom <= innerHeight + 1 && (h.scrollHeight <= h.clientHeight + 1 || getComputedStyle(h).overflowY === 'auto');
          document.getElementById('btn-hints').click(); return ok;""")
        if not hints:
            probs.append("help panel off-screen")
        # say something: the bubble must find a free spot
        p.js("window.__zen.brain.speak('typingWalk')")
        time.sleep(0.5)
        p.check_layout("speaking", probs)
        tap = None
        if w < 900:
            hx, hy = p.head()
            p.ff.tap(hx, hy - 18)
            tap = p.wait_for("window.__zen.brain.state === 'PETTED'", 1.5)
        flags = [k for k in ("overflow", "plaqueOverHead", "brandOverButtons", "brandOverHead", "buttonsOverHead", "plaqueOverBrand") if m[k]]
        flags += [k for k in ("konOn", "headOn", "plaqueOn") if not m[k]]
        if m["smallestButton"] < 32:
            flags.append(f"button {m['smallestButton']:.0f}px")
        if tap is False:
            flags.append("tap-pat failed")
        flags += probs
        rows.append(f"{size} {m['mode']} kon {m['konH']}px" + (f" ✗ {', '.join(flags)}" if flags else " ok"))
        p.shot("size-" + size)
        if flags:
            bad.append(size)
    return not bad, "; ".join(rows)


SCENARIOS = {
    "watch": (watch_stop_resume, "1440x900"),
    "startle": (rush_startle, "1440x900"),
    "typing": (typing_walks_over, "1440x900"),
    "rake": (rake_circle_judged, "1440x900"),
    "pounce": (stalk_and_pounce, "1440x900"),
    "leaf": (maple_leaf_chase, "1440x900"),
    "night": (lantern_night, "1440x900"),
    "sparrow": (sparrow_hunt_and_scare, "1440x900"),
    "mobile": (mobile_touch, "390x844"),
    "sparrow-touch": (sparrow_touch, "390x844"),
    "sizes": (layout_at_sizes, "1600x1200"),
    "night-sky": (night_sky, "1440x900"),
    "night-sky-touch": (night_sky_touch, "390x844"),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8070/")
    ap.add_argument("--only", default="")
    ap.add_argument("--shots", default="")
    ap.add_argument("--port", type=int, default=2833)
    a = ap.parse_args()
    if a.shots:
        os.makedirs(a.shots, exist_ok=True)
    names = [n for n in SCENARIOS if not a.only or n in a.only.split(",")]
    failed = 0
    by_size = {}
    for n in names:
        by_size.setdefault(SCENARIOS[n][1], []).append(n)
    for size, group in by_size.items():
        w, h = map(int, size.split("x"))
        with Firefox(w, h, port=a.port) as ff:
            page = Page(ff, a.url, a.shots, (w, h))
            for n in group:
                try:
                    ok, info = SCENARIOS[n][0](page)
                    vw = page.js("return [innerWidth, innerHeight]")
                    if list(vw) != [page.w, page.h]:
                        ok, info = False, info + f" | viewport was {vw}, not {page.w}x{page.h}"
                    errs = page.errors()
                    if errs:
                        ok, info = False, info + f" | page errors: {errs[:3]}"
                except Exception as e:  # noqa: BLE001
                    ok, info = False, f"crashed: {e}"
                failed += 0 if ok else 1
                print(f"{'PASS' if ok else 'FAIL'}  {n:13s} [{size}]  {info}", flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
