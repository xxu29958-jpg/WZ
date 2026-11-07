"""Watch the garden live in a real (headless) Firefox and record what happens.

    python3 tests/live/observe.py --url http://localhost:8070/ --seconds 60 --every 2 --out /tmp/obs

Writes numbered screenshots, a timeline of Kon's states/activities, frame-time
statistics and any page errors. Pure observation: no input is sent.
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from marionette import Firefox  # noqa: E402

FRAME_PROBE = """
window.__frames = [];
if (!window.__frameProbe) {
  window.__frameProbe = true;
  let last = performance.now();
  (function f(t) { window.__frames.push(t - last); last = t; requestAnimationFrame(f); })(last);
}
window.__errors = window.__errors || [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));
"""

SNAP = """
const z = window.__zen, b = z.brain, m = z.mover.state();
return { t: z.rig.t, state: b.state, act: b.debug().act, life: b.life.act ? b.life.act.id + ':' + b.life.act.phase : '',
         x: Math.round(m.x), y: Math.round(m.y), h: Math.round(m.h), seat: m.seat, moving: m.moving,
         caption: b.caption.text, cam: Math.round(z.scene.camX) };
"""


def frame_stats(ff):
    d = ff.js("const f = window.__frames.slice(5); window.__frames = []; return f;") or []
    if not d:
        return {}
    d = sorted(d)
    pct = lambda p: round(d[min(len(d) - 1, int(len(d) * p))], 1)
    return {"frames": len(d), "p50_ms": pct(0.5), "p95_ms": pct(0.95), "max_ms": round(d[-1], 1), "over_33ms": sum(1 for x in d if x > 33.4)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8070/")
    ap.add_argument("--seconds", type=float, default=60)
    ap.add_argument("--every", type=float, default=2)
    ap.add_argument("--size", default="1440x900")
    ap.add_argument("--out", default="/tmp/zen70-observe")
    ap.add_argument("--port", type=int, default=2831)
    a = ap.parse_args()
    w, h = map(int, a.size.split("x"))
    os.makedirs(a.out, exist_ok=True)
    timeline = []
    with Firefox(w, h, port=a.port) as ff:
        ff.navigate(a.url)
        ff.js(FRAME_PROBE)
        t0 = time.time()
        i = 0
        while time.time() - t0 < a.seconds:
            snap = ff.js(SNAP)
            snap["wall"] = round(time.time() - t0, 1)
            timeline.append(snap)
            ff.screenshot(os.path.join(a.out, f"{i:03d}.png"))
            i += 1
            time.sleep(max(0, a.every - 0.15))
        stats = frame_stats(ff)
        history = ff.js("return window.__zen.brain.history")
        errors = ff.js("return window.__errors")
    report = {"timeline": timeline, "frames": stats, "history": history, "errors": errors}
    with open(os.path.join(a.out, "report.json"), "w") as f:
        json.dump(report, f, indent=1)
    for s in timeline:
        print(f"{s['wall']:5.1f}s {s['state']:11s} life={s['life']:16s} act={s['act']:12s} at=({s['x']},{s['y']}) h={s['h']} seat={s['seat']} cam={s['cam']}  \"{s['caption']}\"")
    print("frames:", stats)
    print("errors:", errors)


if __name__ == "__main__":
    main()
