"""Film strip: rapid screenshots of Kon while something happens, cropped around Kon.

    python3 tests/live/filmstrip.py --setup "JS to start something" --frames 24 --every 0.12 --out strip.png

Good for judging motion: hops, turns, walk cycles, transitions.
"""
import argparse
import io
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from marionette import Firefox  # noqa: E402

KON_BOX = """const z = window.__zen, m = z.rig.measure(), f = z.scene.toScreen(m.feet.x, m.feet.y), s = z.scene.scale * z.rig.scale;
return [f.x, f.y, s, z.brain.state, z.mover.state().gait, Math.round(z.mover.state().speed)];"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8070")
    ap.add_argument("--path", default="/?motion=full&hour=12")
    ap.add_argument("--size", default="1440x900")
    ap.add_argument("--setup", default="")
    ap.add_argument("--input", default="", help="python: list of pointer points to move through before recording, e.g. '[(300,200),(900,250)]'")
    ap.add_argument("--wait", type=float, default=1.0)
    ap.add_argument("--frames", type=int, default=24)
    ap.add_argument("--every", type=float, default=0.12)
    ap.add_argument("--cols", type=int, default=8)
    ap.add_argument("--box", type=int, default=330, help="crop size in CSS px around Kon at scale 1")
    ap.add_argument("--out", default="/tmp/zen70-strip.png")
    ap.add_argument("--port", type=int, default=2860)
    a = ap.parse_args()
    from PIL import Image, ImageDraw
    w, h = map(int, a.size.split("x"))
    frames = []
    with Firefox(w, h, port=a.port) as ff:
        ff.open_sized(a.url, a.path, w, h)
        time.sleep(a.wait)
        if a.setup:
            ff.js(a.setup)
        t0 = time.time()
        for i in range(a.frames):
            box = ff.js(KON_BOX)
            raw = ff.cmd("WebDriver:TakeScreenshot", {"full": False})
            import base64
            img = Image.open(io.BytesIO(base64.b64decode(raw.get("value", raw)))).convert("RGB").crop((0, 0, w, h))
            frames.append((time.time() - t0, box, img))
            dt = a.every - (time.time() - t0 - i * a.every)
            if dt > 0:
                time.sleep(dt)
    tw = th = 220
    rows = (len(frames) + a.cols - 1) // a.cols
    sheet = Image.new("RGB", (a.cols * tw, rows * (th + 14)), "white")
    d = ImageDraw.Draw(sheet)
    for i, (t, box, img) in enumerate(frames):
        fx, fy, s, state, gait, speed = box
        half = a.box * max(0.6, s) / 2
        cx, cy = fx, fy - half * 0.8
        crop = img.crop((int(cx - half), int(cy - half), int(cx + half), int(cy + half))).resize((tw, th))
        x, y = (i % a.cols) * tw, (i // a.cols) * (th + 14)
        sheet.paste(crop, (x, y + 14))
        d.text((x + 3, y + 1), f"{t:.2f}s {state} {gait} {speed}", fill="black")
    sheet.save(a.out)
    print(a.out, len(frames), "frames")


if __name__ == "__main__":
    main()
