"""Run the behavior tests from the terminal (in a headless Firefox).

    python3 tests/run.py [--url http://localhost:8070] [-v] [-k sparrow]

Exits non-zero if any test fails.
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "live"))
from marionette import Firefox  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8070")
    ap.add_argument("--port", type=int, default=2839)
    ap.add_argument("-v", "--verbose", action="store_true", help="also print what each passing test measured")
    ap.add_argument("-k", default="", help="only show tests whose name contains this")
    a = ap.parse_args()
    base = a.url.rstrip("/")
    with Firefox(1200, 900, port=a.port) as ff:
        ff.navigate(base + "/tests/")
        for _ in range(200):
            res = ff.js("return window.__results || null")
            if res:
                break
            time.sleep(0.1)
        # boot check: the real page starts, animates, and throws nothing
        boot = []
        for path in ["/?motion=full", "/?demo=satori&motion=full", "/?motion=full&hour=14&weather=rain"]:
            ff.open_sized(base, path, 1280, 800)
            # (a NaN written into an SVG attribute throws nothing: the browser only grumbles in its console. Catch those too.)
            ff.js("""
              window.__errs = [];
              window.addEventListener('error', (e) => window.__errs.push(String(e.message)));
              const set = Element.prototype.setAttribute;
              Element.prototype.setAttribute = function (k, v) {
                if (typeof v === 'string' && /NaN|undefined|Infinity/.test(v) && window.__errs.length < 5) window.__errs.push(`bad ${k} on #${this.id || this.tagName}: ${v.slice(0, 60)}`);
                return set.call(this, k, v);
              };
            """)
            if "weather" in path:
                # everybody out at once: the spirits, the frog, the butterfly, the ball, the lake's lanterns
                ff.js("""
                  const z = window.__zen; z.brain.zenArmed = false;
                  z.spirits.outing(null, z.spirits.ctx, { x: 868, y: 922 }); z.frog.appear(); z.butterfly.visit(); z.ball.kick(300, 80, 200, 'user');
                  z.scene.startToro(); z.scene.startEyes(); z.scene.startWedding(); z.scene.fishJump(); z.scene.growSnowfox(1);
                """)
                time.sleep(5.0)
            t0 = ff.js("return window.__zen.rig.t")
            time.sleep(1.0)
            t1 = ff.js("return window.__zen.rig.t")
            errs = ff.js("return window.__errs")
            ok = (path.find("demo") >= 0 or t1 > t0) and not errs
            boot.append((path, ok, errs))
    if not res:
        print("tests did not run")
        sys.exit(2)
    for path, ok, errs in boot:
        print(f"{'boot ok ' if ok else 'BOOT FAIL'} {path} {errs or ''}")
        if not ok:
            res.append({"ok": False, "name": "boot " + path, "info": str(errs)})
    failed = [r for r in res if not r["ok"]]
    for r in res:
        if a.k.lower() not in r["name"].lower():
            continue
        if not r["ok"]:
            print(f"FAIL  {r['name']}\n      {r['info']}")
        elif a.verbose:
            print(f"ok    {r['name']}\n      {r['info']}")
    print(f"{len(res) - len(failed)} / {len(res)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
