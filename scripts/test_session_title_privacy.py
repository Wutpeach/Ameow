"""Owned HTML/HLS credential echo through the production owner and native bridge."""
import argparse
import hashlib
import html
import json
import secrets
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

p = argparse.ArgumentParser()
p.add_argument('--root', required=True, type=Path)
p.add_argument('--instance-root', required=True, type=Path)
p.add_argument('--driver', required=True, type=Path)
p.add_argument('--host', required=True, type=Path)
p.add_argument('--media-root', required=True, type=Path)
p.add_argument('--cases', nargs='+', choices=['echo', 'truncated', 'normal'], default=['echo', 'truncated', 'normal'])
a = p.parse_args()
root = a.root.resolve(); root.mkdir(parents=True, exist_ok=False)
instance = a.instance_root.resolve(); (instance / 'output').mkdir(parents=True, exist_ok=True)
flags = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
source, grant = secrets.token_hex(16), secrets.token_hex(16)

def native(op):
    data = json.dumps(dict(version=1, request_id='public-title-fixture', operation=op)).encode()
    r = subprocess.run([str(a.host.resolve()), 'chrome-extension://icedkidcbbbijndplfofcbhikohlcool/', '--instance-root', str(instance)],
                       input=len(data).to_bytes(4, 'little') + data, capture_output=True, creationflags=flags, timeout=20)
    assert r.returncode == 0 and json.loads(r.stdout[4:])['ok'], 'fixture native bridge failed'

requests = []; current_case = ''; secret = ''; expected_title = ''
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_HEAD(self): self.serve(False)
    def do_GET(self): self.serve(True)
    def serve(self, body):
        url = urlsplit(self.path)
        if url.hostname != 'example.com' or url.query:
            self.send_error(403); return
        received = self.headers.get('Cookie', '')
        requests.append(dict(case=current_case, path=url.path, synthetic_cookie_received=secret in received))
        if url.path == '/ameow-issue33-1.mp4':
            value = received.split('=', 1)[-1]
            title = value if current_case == 'echo' else '猫' * 150 + value if current_case == 'truncated' else expected_title
            data = ('<html><head><title>' + html.escape(title) + '</title></head><body><video src="http://example.com/1080/index.m3u8"></video></body></html>').encode()
            mime = 'text/html'
        elif url.path.startswith('/1080/') and (a.media_root / Path(url.path).name).is_file():
            f = a.media_root / Path(url.path).name; data = f.read_bytes()
            mime = 'application/vnd.apple.mpegurl' if f.suffix == '.m3u8' else 'video/mp2t'
        else:
            self.send_error(404); return
        self.send_response(200); self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data))); self.end_headers()
        if body: self.wfile.write(data)

def leaked(value, needle, prefix=''):
    if isinstance(value, dict): return [s for k, v in value.items() for s in leaked(v, needle, prefix + '.' + k)]
    if isinstance(value, list): return [s for i, v in enumerate(value) for s in leaked(v, needle, prefix + f'[{i}]')]
    return [prefix] if isinstance(value, str) and needle in value else []

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
cases = []
try:
    for current_case in a.cases:
        secret = secrets.token_urlsafe(24); expected_title = '雨后的小猫 2026'
        native(dict(operation='authorize', site='example.com', source_id=source, source_name='Owned title privacy check', grant_id=grant, replaces=None,
                    cookies=[dict(domain='.example.com', path='/', name='synthetic_session', value=secret, secure=False, http_only=True, host_only=False, expires=None)], skipped_partitioned=0))
        command = [str(a.driver.resolve()), '--runtime-root', str(instance / 'runtime'), '--output', str(instance / 'output'),
                   '--url', 'http://example.com/ameow-issue33-1.mp4', '--app-update-fixture-dir', str(root),
                   '--app-update-fixture-media-port', str(server.server_port)]
        r = subprocess.run(command, capture_output=True, timeout=120, creationflags=flags)
        (root / (current_case + '-stdout.jsonl')).write_bytes(r.stdout)
        (root / (current_case + '-stderr.log')).write_bytes(r.stderr)
        views = [json.loads(line) for line in r.stdout.splitlines()]
        job = views[-1]['jobs'][0]
        hits = leaked(views, secret[:12], 'snapshots')
        path = Path(job['delivered']['path']) if job['delivered'] else None
        if path and secret[:12] in path.name: hits.append('output_filename')
        diagnostics_leaked = any(secret[:12].encode() in f.read_bytes() for f in (instance / 'runtime/diagnostics').rglob('*') if f.is_file())
        normal_ok = current_case != 'normal' or (job['title'].startswith(expected_title) and '[redacted]' not in job['title'] and path and path.name.startswith(expected_title))
        ok = r.returncode == 0 and job['phase'] == 'Success' and job['resources_released'] and not hits and not diagnostics_leaked and normal_ok
        cases.append(dict(case=current_case, result='PASS' if ok else 'FAIL', phase=job['phase'], resources_released=job['resources_released'],
                          projection_leaks=hits, diagnostics_leaked=diagnostics_leaked, normal_title_preserved=normal_ok, output_filename=path.name if path else None))
        native(dict(operation='revoke', site='example.com', source_id=source, grant_id=grant))
        grant = secrets.token_hex(16)
finally:
    server.shutdown()
    native(dict(operation='revoke', site='example.com', source_id=source, grant_id=grant))
report = dict(result='PASS' if all(c['result'] == 'PASS' for c in cases) else 'FAIL', fixture=True, real_membership='NOT TESTED',
              driver_sha256=hashlib.sha256(a.driver.read_bytes()).hexdigest(), helper_sha256=hashlib.sha256(a.host.read_bytes()).hexdigest(), cases=cases, requests=requests)
(root / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(0 if report['result'] == 'PASS' else 1)
