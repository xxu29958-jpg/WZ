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


def sweep_points(cx, cy, ax, ay, n=40, turns=1.5):
    return [(cx + ax * math.sin(i / n * turns * 2 * math.pi), cy + ay * math.sin(i / n * turns * 4 * math.pi)) for i in range(n + 1)]


# ---------------------------------------------------------------- scenarios
def watch_stop_resume(p):
    p.load("motion=full")
    hx, hy = p.head()
    p.ff.pointer_path(sweep_points(hx, hy - 260, 380, 30), duration_ms=3600)
    peeking = p.js("return window.__zen.brain.state === 'WATCH' && window.__zen.brain.cur > 0.5")
    p.shot("watch-peek")
    ok_pretend = p.wait_for("window.__zen.brain.state === 'PRETENDING'", 3)
    time.sleep(0.8)
    p.shot("watch-pretend")
    time.sleep(0.8)
    p.ff.pointer_path(sweep_points(hx, hy - 260, 300, 20, turns=1), duration_ms=2400)
    resumed = "RESUMING" in p.history()
    return peeking and ok_pretend and resumed, f"peeking={peeking} pretend={ok_pretend} resumed={resumed}; {' → '.join(p.history())}"


def rush_startle(p):
    p.load("motion=full")
    hx, hy = p.head()
    p.ff.pointer_path([(hx + 520, hy - 20), (hx + 520, hy - 10)], duration_ms=300)
    p.ff.pointer_path([(hx + 520, hy - 10), (hx + 20, hy)], duration_ms=350)
    ok = p.wait_for("window.__zen.brain.history.some(h => h.to === 'STARTLED')", 2)
    time.sleep(0.15)
    p.shot("rush-startle")
    return ok, " → ".join(p.history())


def typing_walks_over(p):
    p.load("motion=full")
    box = p.js("const r = document.getElementById('wish-input').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];")
    p.ff.pointer_path([(box[0], box[1])], 0, press=True)
    p.ff.type_keys("a quiet morning", delay_ms=140)
    p.ff.type_keys(" with tea", delay_ms=160)
    time.sleep(0.2)
    k = p.kon()
    near = p.js("const W = window.__zen.scene.mode === 'wide'; const m = window.__zen.mover.state(); const s = W ? {x:1060,y:828} : {x:800,y:936}; return Math.hypot(m.x - s.x, m.y - s.y);")
    p.shot("typing-reading")
    ok_pretend = p.wait_for("['NOTICED','PRETENDING'].includes(window.__zen.brain.state)", 3.5)
    time.sleep(0.6)
    p.shot("typing-pretend")
    value_untouched = p.js("return document.getElementById('wish-input').value") == "a quiet morning with tea"
    return near < 40 and ok_pretend and value_untouched, f"distance to reading spot {near:.0f}; pretended={ok_pretend}; {' → '.join(p.history())}"


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
    time.sleep(2)
    night = p.js("return document.body.classList.contains('is-night')")
    p.shot("night")
    return night, f"night={night} caption='{p.caption()['text']}'"


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
    overflow = p.js("return document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight")
    return mode == "tall" and patted and judged and not overflow, f"mode={mode} patted={patted} judged={judged} overflow={overflow}"


SCENARIOS = {
    "watch": (watch_stop_resume, "1440x900"),
    "startle": (rush_startle, "1440x900"),
    "typing": (typing_walks_over, "1440x900"),
    "rake": (rake_circle_judged, "1440x900"),
    "pounce": (stalk_and_pounce, "1440x900"),
    "leaf": (maple_leaf_chase, "1440x900"),
    "night": (lantern_night, "1440x900"),
    "mobile": (mobile_touch, "390x844"),
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
                    if list(vw) != [w, h]:
                        ok, info = False, info + f" | viewport was {vw}, not {w}x{h}"
                    errs = page.errors()
                    if errs:
                        ok, info = False, info + f" | page errors: {errs[:3]}"
                except Exception as e:  # noqa: BLE001
                    ok, info = False, f"crashed: {e}"
                failed += 0 if ok else 1
                print(f"{'PASS' if ok else 'FAIL'}  {n:8s} [{size}]  {info}", flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
