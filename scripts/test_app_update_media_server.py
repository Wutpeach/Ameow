"""Local-only, gated real-media source for #33 debug update evidence.

No forwarding or external requests. The app's explicit debug fixture proxy
accepts only three fixed example.com paths; production routing is unchanged.
Write release-1/2/3 to finish a transfer, or stop to close this server.
"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import time
from urllib.parse import urlsplit

root = Path(sys.argv[1]).resolve()
stop = root / (sys.argv[3] if len(sys.argv) > 3 else 'stop')
media = root / 'source.mp4'
if not media.is_file():
    raise SystemExit('Generate source.mp4 in the task evidence directory first')

def record(**event):
    with (root / 'media-server.jsonl').open('a', encoding='utf-8') as stream:
        stream.write(json.dumps(dict(time=time.time(), **event)) + '\n')

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_HEAD(self):
        self.serve(False)

    def do_GET(self):
        self.serve(True)

    def serve(self, body):
        url = urlsplit(self.path)
        allowed = {f'/ameow-issue33-{n}.mp4': (n, root / 'master.m3u8') for n in range(1, 4)}
        for n in range(1, 4):
            for file in (root / 'hls').iterdir():
                allowed[f'/ameow-issue33-{n}/{file.name}'] = (n, file)
        if url.hostname != 'example.com' or url.path not in allowed or url.query:
            self.send_error(403)
            return
        job, selected = allowed[url.path]
        payload = selected.read_bytes()
        if selected.name == 'master.m3u8':
            payload = payload.replace(b'VARIANT', f'ameow-issue33-{job}/index.m3u8'.encode())
        start, end = 0, len(payload) - 1
        requested = self.headers.get('Range')
        if requested:
            try:
                first, last = requested.removeprefix('bytes=').split('-')
                start = int(first)
                end = min(int(last), end) if last else end
                if not 0 <= start <= end:
                    raise ValueError('range')
            except ValueError:
                self.send_error(416)
                return
        self.send_response(206 if requested else 200)
        self.send_header('Content-Type', 'application/vnd.apple.mpegurl' if selected.suffix == '.m3u8' else 'video/mp2t')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        if requested:
            self.send_header('Content-Range', f'bytes {start}-{end}/{len(payload)}')
        self.end_headers()
        if not body:
            return
        record(event='request', media=job, file=selected.name, start=start, end=end)
        sent = 0
        try:
            import io
            with io.BytesIO(payload) as stream:
                stream.seek(start)
                while sent < end - start + 1:
                    if selected.suffix == '.ts' and sent >= 131072 and not (root / f'release-{job}').exists():
                        record(event='gated', media=job, sent=sent)
                        while not (root / f'release-{job}').exists():
                            if stop.exists():
                                return
                            time.sleep(0.05)
                    block = stream.read(min(32768, end - start + 1 - sent))
                    if not block:
                        break
                    self.wfile.write(block)
                    self.wfile.flush()
                    sent += len(block)
            record(event='complete', media=job, sent=sent)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            record(event='reader-closed', media=job, sent=sent)

server = ThreadingHTTPServer(('127.0.0.1', int(sys.argv[2]) if len(sys.argv) > 2 else 0), Handler)
server.daemon_threads = True
server.timeout = 0.5
(root / 'server-port.json').write_text(json.dumps(dict(port=server.server_port)), encoding='utf-8')
record(event='listening', port=server.server_port)
while not stop.exists():
    server.handle_request()
server.server_close()
record(event='stopped')
