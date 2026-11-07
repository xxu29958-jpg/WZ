"""A tiny Marionette client: drive a real (headless) Firefox in real time.

Marionette is Firefox's built-in automation protocol (what geckodriver speaks).
No dependencies: length-prefixed JSON over a TCP socket.

    with Firefox(width=1440, height=900) as ff:
        ff.navigate("http://localhost:8070/")
        ff.pointer_path([(100, 100), (600, 300)], duration_ms=1500)
        print(ff.js("return window.__zen.brain.state"))
        ff.screenshot("shot.png")
"""
import base64
import json
import os
import shutil
import socket
import subprocess
import tempfile
import time

PREFS = {
    "ui.prefersReducedMotion": 0,          # show the full motion
    "dom.min_background_timeout_value": 4,
    "browser.shell.checkDefaultBrowser": False,
    "datareporting.policy.dataSubmissionEnabled": False,
    "toolkit.telemetry.reportingpolicy.firstRun": False,
    "browser.startup.homepage_override.mstone": "ignore",
}


class Firefox:
    def __init__(self, width=1440, height=900, port=2828, headless=True, prefs=None):
        """For an exact viewport size (e.g. a phone), load pages with open_sized()."""
        self.width, self.height, self.port = width, height, port
        self.profile = tempfile.mkdtemp(prefix="zen70-ff-")
        allprefs = {**PREFS, "marionette.port": port, **(prefs or {})}
        with open(os.path.join(self.profile, "user.js"), "w") as f:
            for k, v in allprefs.items():
                f.write(f"user_pref({json.dumps(k)}, {json.dumps(v)});\n")
        args = ["firefox", "--marionette", "--no-remote", "--profile", self.profile,
                f"--window-size={width},{height}"]
        if headless:
            args.insert(1, "--headless")
        self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.msg_id = 0
        self.sock = self._connect()
        self._read()  # handshake
        self.cmd("WebDriver:NewSession", {"capabilities": {"alwaysMatch": {"acceptInsecureCerts": True}}})
        # a big window; exact viewports come from open_sized() (window sizes get rounded)
        self.cmd("WebDriver:SetWindowRect", {"width": 1600, "height": 1200})

    def resize(self, width, height):
        """Make the page's CSS viewport exactly width × height (window chrome varies)."""
        self.navigate("about:blank")
        ow, oh = width, height
        for _ in range(4):
            self.cmd("WebDriver:SetWindowRect", {"width": int(ow), "height": int(oh)})
            time.sleep(0.4)  # resizing is asynchronous
            iw, ih = self.js("return [innerWidth, innerHeight]")
            if (iw, ih) == (width, height):
                break
            ow += width - iw
            oh += height - ih
        return self.js("return [innerWidth, innerHeight]")

    def _connect(self):
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                return socket.create_connection(("127.0.0.1", self.port), timeout=60)
            except OSError:
                time.sleep(0.2)
        raise RuntimeError("Firefox did not open its Marionette port")

    def _read(self):
        buf = b""
        while b":" not in buf:
            buf += self.sock.recv(1)
        n, rest = buf.split(b":", 1)
        n = int(n)
        while len(rest) < n:
            rest += self.sock.recv(n - len(rest))
        return json.loads(rest)

    def cmd(self, name, params=None):
        self.msg_id += 1
        body = json.dumps([0, self.msg_id, name, params or {}]).encode()
        self.sock.sendall(str(len(body)).encode() + b":" + body)
        while True:
            msg = self._read()
            if msg[0] == 1 and msg[1] == self.msg_id:
                if msg[2]:
                    raise RuntimeError(f"{name}: {msg[2].get('message', msg[2])}")
                return msg[3]

    # ------------------------------------------------------------ conveniences
    def navigate(self, url):
        self.cmd("WebDriver:SwitchToFrame", {})  # back to the top level
        self.cmd("WebDriver:Navigate", {"url": url})

    def open_sized(self, origin, src, w, h):
        """Load `src` in an iframe of exactly w × h CSS px (top-left corner), and
        switch into it so scripts run in the page. Input coordinates are unchanged."""
        from urllib.parse import quote
        self.navigate(f"{origin}/tests/live/frame.html?w={w}&h={h}&src={quote(src, safe='')}")
        frame = self.cmd("WebDriver:FindElement", {"using": "css selector", "value": "#f"})
        el = frame.get("value", frame)
        for _ in range(50):
            try:
                self.cmd("WebDriver:SwitchToFrame", {"element": el.get("element-6066-11e4-a52e-4f735466cecf", el)})
                if self.js("return !!window.__zen"):
                    return
            except RuntimeError:
                pass
            self.cmd("WebDriver:SwitchToFrame", {})
            time.sleep(0.1)
        raise RuntimeError("page in frame did not start")

    def js(self, script, *args):
        r = self.cmd("WebDriver:ExecuteScript", {"script": script, "args": list(args)})
        return r.get("value") if isinstance(r, dict) else r

    def wait(self, seconds):
        time.sleep(seconds)

    def screenshot(self, path):
        r = self.cmd("WebDriver:TakeScreenshot", {"full": False})
        data = r.get("value") if isinstance(r, dict) else r
        with open(path, "wb") as f:
            f.write(base64.b64decode(data))
        return path

    def actions(self, actions):
        self.cmd("WebDriver:PerformActions", {"actions": actions})
        self.cmd("WebDriver:ReleaseActions", {})

    def pointer_path(self, points, duration_ms=1000, kind="mouse", press=False):
        """Move a real pointer through screen points over duration_ms (one segment per pair)."""
        seg = max(1, int(duration_ms / max(1, len(points) - 1)))
        acts = [{"type": "pointerMove", "x": int(points[0][0]), "y": int(points[0][1]), "duration": 0}]
        if press:
            acts.append({"type": "pointerDown", "button": 0})
        for x, y in points[1:]:
            acts.append({"type": "pointerMove", "x": int(x), "y": int(y), "duration": seg})
        if press:
            acts.append({"type": "pointerUp", "button": 0})
        self.actions([{"type": "pointer", "id": f"p-{kind}", "parameters": {"pointerType": kind}, "actions": acts}])

    def tap(self, x, y, kind="touch"):
        self.pointer_path([(x, y)], 0, kind=kind, press=True)

    def type_keys(self, text, delay_ms=120):
        acts = []
        for ch in text:
            acts += [{"type": "keyDown", "value": ch}, {"type": "keyUp", "value": ch}, {"type": "pause", "duration": delay_ms}]
        self.actions([{"type": "key", "id": "kbd", "actions": acts}])

    def close(self):
        try:
            self.cmd("WebDriver:DeleteSession")
        except Exception:
            pass
        try:
            self.sock.close()
        except Exception:
            pass
        self.proc.terminate()
        try:
            self.proc.wait(5)
        except Exception:
            self.proc.kill()
        shutil.rmtree(self.profile, ignore_errors=True)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
