#!/usr/bin/env python3
"""
Native messaging host for Surfingkeys CLI.
Runs an HTTP server to accept commands from curl and forwards them to the extension.
"""

import json
import struct
import sys
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = 37912
extension_port = None
lock = threading.Lock()


def send_message(msg):
    """Send a message to the extension using native messaging protocol."""
    encoded = json.dumps(msg).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def read_message():
    """Read a message from the extension using native messaging protocol."""
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        return None
    length = struct.unpack('I', raw_length)[0]
    message = sys.stdin.buffer.read(length).decode('utf-8')
    return json.loads(message)


class RequestHandler(BaseHTTPRequestHandler):
    """HTTP request handler for CLI commands."""

    def log_message(self, format, *args):
        """Suppress default logging."""
        pass

    def do_GET(self):
        """Handle GET requests."""
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'OK')
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        """Handle POST requests."""
        if self.path == '/chooseTab':
            with lock:
                send_message({'command': 'chooseTab'})
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'OK')
        elif self.path == '/lastTab':
            with lock:
                send_message({'command': 'lastTab'})
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'OK')
        else:
            self.send_response(404)
            self.end_headers()


def run_http_server():
    """Run the HTTP server in a separate thread."""
    server = HTTPServer(('127.0.0.1', PORT), RequestHandler)
    server.serve_forever()


def main():
    """Main entry point."""
    # Start HTTP server in background thread
    http_thread = threading.Thread(target=run_http_server, daemon=True)
    http_thread.start()

    # Main loop: read messages from extension (keeps connection alive)
    while True:
        msg = read_message()
        if msg is None:
            break


if __name__ == '__main__':
    main()
