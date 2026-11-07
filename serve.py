#!/usr/bin/env python3
"""Local dev server for ZEN70: static files with caching turned off.

    python3 serve.py          # http://localhost:8070, or the next free port
    python3 serve.py 9000     # exactly this port
"""
import errno
import http.server
import socket
import socketserver
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 8070
FALLBACK_TRIES = 10  # with no port given, try 8070 … 8079


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    # Lets a quick restart reuse the port. On Windows the same flag would let
    # two servers share one port silently, so it stays off there.
    allow_reuse_address = sys.platform != "win32"
    daemon_threads = True


def is_port_in_use_error(err):
    return err.errno == errno.EADDRINUSE or getattr(err, "winerror", None) == 10048


def someone_on_ipv6_localhost(port):
    """Browsers may send "localhost" to ::1, where another server could be listening."""
    try:
        with socket.create_connection(("::1", port), timeout=0.2):
            return True
    except OSError:
        return False


def parse_port(argv):
    if len(argv) < 2:
        return None
    try:
        port = int(argv[1])
    except ValueError:
        port = -1
    if not 1 <= port <= 65535:
        sys.exit(f"'{argv[1]}' is not a valid port. Use a number from 1 to 65535, for example:\n"
                 f"    python3 serve.py {DEFAULT_PORT + 1}")
    return port


def open_server(requested):
    """Bind the requested port, or the first free one from 8070 when none was given."""
    candidates = [requested] if requested else list(range(DEFAULT_PORT, DEFAULT_PORT + FALLBACK_TRIES))
    for port in candidates:
        if someone_on_ipv6_localhost(port):
            continue
        try:
            return Server(("127.0.0.1", port), Handler), port
        except OSError as err:
            if not is_port_in_use_error(err):
                raise
    if requested:
        sys.exit(f"Port {requested} is already in use. ZEN70 or another server may already be running there.\n"
                 f"Stop that program, or pick another port:\n"
                 f"    python3 serve.py {requested + 1 if requested < 65535 else DEFAULT_PORT}")
    sys.exit(f"Ports {candidates[0]}-{candidates[-1]} are all in use. Pick another port, for example:\n"
             f"    python3 serve.py 9000")


def main():
    requested = parse_port(sys.argv)
    httpd, port = open_server(requested)
    with httpd:
        if requested is None and port != DEFAULT_PORT:
            print(f"Port {DEFAULT_PORT} is busy, so ZEN70 is using port {port} instead.")
        print(f"ZEN70 is running at http://localhost:{port}  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
