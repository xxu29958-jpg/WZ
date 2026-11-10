"""Visual regression check: render scripted demos and compare them pixel by pixel.

    python3 tests/visual_diff.py capture DIR [--port 8070]   # save a baseline
    python3 tests/visual_diff.py compare DIR [--port 8070]   # render again and diff

Demos run on a virtual clock with seeded randomness, so the same code renders
the same pixels. Use it to prove a refactor changed nothing visible.
"""
import os
import sys

DEMOS = {
    "idle": "?demo=idle",
    "peek": "?demo=peek",
    "pretend": "?demo=pretend&act=whistle",
    "startle": "?demo=startle",
    "typing": "?demo=typing",
    "walk": "?demo=go&to=basin&t=2.4",
    "rock": "?demo=at&to=rock&t=2",
    "behind": "?demo=go&x=300&y=760&t=14",
    "pounce": "?demo=pounce&t=0.5&dur=3.4",
    "zazen": "?demo=zazen&t=0.6",
    "satori": "?demo=satori",
    "judge": "?demo=judge&t=5.2",
    "night": "?demo=night",
    "mobile": "?demo=at&to=basin&t=2|390x844",
    "sparrow": "?demo=sparrow&perch=lantern&t=7",
    "sparrow-head": "?demo=sparrow-head",
    "golden": "?demo=idle&hour=17.5",
    "sunset-lapse": "?demo=night&t=4.2",
    "gust": "?demo=gust&hour=15&t=1.6",
    "star": "?demo=meteor&hour=22.6&caught=1&t=1.2",
    "moon": "?demo=moon&hour=22.6&t=0.9",
    "firefly": "?demo=firefly&hour=22.6&t=0.4",
    "leafhat": "?demo=leafhat&hour=14&t=1.2",
    "night-phone": "?demo=idle&hour=22.6|390x844",
    "dawn": "?demo=idle&hour=6.4",
    "arrival": "?demo=intro&hour=7.2&t=0.4",
    "flock": "?demo=flock&hour=16&t=0.5",
    "lens-leaf": "?demo=gust&hour=15&lens=1&t=1.1",
}


def render(out, port):
    """Render each demo in a live headless Firefox once its fonts have loaded."""
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "live"))
    from marionette import Firefox
    from PIL import Image
    import time
    os.makedirs(out, exist_ok=True)
    with Firefox(1440, 900, port=2850) as ff:
        for name, spec in DEMOS.items():
            q, _, size = spec.partition("|")
            w, h = map(int, (size or "1440x900").split("x"))
            ff.open_sized(f"http://localhost:{port}", f"/{q}&motion=full", w, h)
            for _ in range(50):
                if ff.js("return document.fonts.status === 'loaded'"):
                    break
                time.sleep(0.1)
            time.sleep(0.3)
            path = os.path.join(out, name + ".png")
            ff.screenshot(path)
            Image.open(path).crop((0, 0, w, h)).save(path)


def main():
    mode, d = sys.argv[1], sys.argv[2]
    port = sys.argv[sys.argv.index("--port") + 1] if "--port" in sys.argv else "8070"
    if mode == "capture":
        render(d, port)
        print(f"baseline: {len(os.listdir(d))} images in {d}")
        return
    from PIL import Image, ImageChops, ImageFilter
    cur = d.rstrip("/") + "-now"
    render(cur, port)
    worst = 0
    for name in DEMOS:
        if not os.path.exists(os.path.join(d, name + ".png")):
            print(f"new     {name:8s} (no baseline yet)")
            continue
        a = Image.open(os.path.join(d, name + ".png")).convert("RGB")
        b = Image.open(os.path.join(cur, name + ".png")).convert("RGB")
        diff = ImageChops.difference(a, b)
        # Text anti-aliasing can shift by a sub-pixel between browser sessions, which leaves
        # thin speckles along glyph edges. Real changes cover solid areas, so erode the
        # difference mask by one pixel before counting.
        mask = diff.convert("L").point(lambda v: 255 if v > 8 else 0).filter(ImageFilter.MinFilter(3))
        bbox = mask.getbbox()
        changed = sum(1 for v in mask.getdata() if v) if bbox else 0
        pct = 100 * changed / (a.width * a.height)
        worst = max(worst, pct)
        print(f"{'same   ' if pct < 0.01 else 'CHANGED'} {name:8s} {pct:.3f}% of pixels differ" + (f" in {bbox}" if bbox and pct >= 0.01 else ""))
    sys.exit(0 if worst < 0.01 else 1)


if __name__ == "__main__":
    main()
