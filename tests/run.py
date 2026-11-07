"""Run the behavior tests from the terminal (in a headless Firefox).

    python3 tests/run.py [--url http://localhost:8070]

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
    a = ap.parse_args()
    with Firefox(1200, 900, port=a.port) as ff:
        ff.navigate(a.url.rstrip("/") + "/tests/")
        for _ in range(200):
            res = ff.js("return window.__results || null")
            if res:
                break
            time.sleep(0.1)
    if not res:
        print("tests did not run")
        sys.exit(2)
    failed = [r for r in res if not r["ok"]]
    for r in res:
        if not r["ok"]:
            print(f"FAIL  {r['name']}\n      {r['info']}")
    print(f"{len(res) - len(failed)} / {len(res)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
