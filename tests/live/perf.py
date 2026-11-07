"""Frame-time profile of the live page, with layers switched off one at a time.

    python3 tests/live/perf.py --url http://localhost:8070/?motion=full
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from marionette import Firefox  # noqa: E402
from observe import FRAME_PROBE, frame_stats  # noqa: E402

VARIANTS = {
    "everything": "",
    "no grain overlay": "document.querySelector('.grain').style.display='none';",
    "grain, normal blend": "document.querySelector('.grain').style.mixBlendMode='normal';",
    "no blend veils": "for (const id of ['night-veil','tint']) document.getElementById(id).style.display='none';",
    "no ensō canvases": "for (const id of ['enso','enso-live']) document.getElementById(id).style.display='none';",
    "no sand canvas": "document.getElementById('sand-canvas').style.display='none';",
    "no glow svg": "document.getElementById('glow').style.display='none';",
    "no back svg": "document.getElementById('scene-back').style.display='none';",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8070/?motion=full")
    ap.add_argument("--size", default="1440x900")
    ap.add_argument("--seconds", type=float, default=5)
    ap.add_argument("--port", type=int, default=2832)
    ap.add_argument("--walk", action="store_true", help="keep Kon walking during the measurement")
    a = ap.parse_args()
    w, h = map(int, a.size.split("x"))
    with Firefox(w, h, port=a.port) as ff:
        for name, js in VARIANTS.items():
            ff.navigate(a.url)
            time.sleep(1.5)
            ff.js(FRAME_PROBE + js + ("const z=window.__zen; z.brain.zenArmed=false; z.brain.life.restUntil=0;" if a.walk else ""))
            if a.walk:
                ff.js("const z=window.__zen; z.brain.life.act={id:'wander',def:{act:'sniffGround'},phase:'go',t:0,dur:20,spot:{x:300,y:930}};")
            time.sleep(0.5)
            ff.js("window.__frames = [];")
            time.sleep(a.seconds)
            print(f"{name:18s}", frame_stats(ff))


if __name__ == "__main__":
    main()
