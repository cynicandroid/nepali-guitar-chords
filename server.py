#!/usr/bin/env python3
"""Local server for the Nepali Guitar Chords static songbook."""

import argparse
import errno
import functools
import http.server
import socketserver
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent


class ReusableThreadingHTTPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser(description="Serve the guitar songbook locally")
    parser.add_argument("--host", default="127.0.0.1", help="Host/interface to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to use (default: 8000)")
    args = parser.parse_args()

    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler,
        directory=str(PROJECT_ROOT),
    )

    try:
        with ReusableThreadingHTTPServer((args.host, args.port), handler) as server:
            address = f"http://localhost:{args.port}/"
            print(f"Serving Nepali Guitar Chords at {address}")
            print("Press Ctrl-C to stop the server.")
            server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    except OSError as error:
        if error.errno == errno.EADDRINUSE:
            print(f"Port {args.port} is already in use. Try: python3 server.py --port {args.port + 1}")
            raise SystemExit(1)
        raise


if __name__ == "__main__":
    main()
