"""Owned synthetic HLS through the real desktop download core and official yt-dlp.

Build session_media_fixture with app-update-fixture. Its existing, fixed example.com proxy
gate is used; no system proxy, browser database, or production route is changed.
"""
import argparse
import hashlib
import json
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import threading
import time
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--root', required=True, type=Path)
parser.add_argument('--driver', required=True, type=Path)
parser.add_argument('--host', required=True, type=Path)
parser.add_argument('--ffmpeg', required=True, type=Path)
parser.add_argument('--ffprobe', required=True, type=Path)
parser.add_argument('--instance-root', type=Path)
args = parser.parse_args()
root = args.root.resolve()
root.mkdir(parents=True, exist_ok=False)
instance = args.instance_root.resolve() if args.instance_root else root / 'desktop'
(instance / 'output').mkdir(parents=True, exist_ok=True)
flags = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
origin = 'chrome-extension://icedkidcbbbijndplfofcbhikohlcool/'
source = secrets.token_hex(16)
grant = secrets.token_hex(16)
revoked_grant = secrets.token_hex(16)


def native(operation):
    payload = json.dumps(dict(version=1, request_id='synthetic-media-check', operation=operation)).encode()
    result = subprocess.run([str(args.host.resolve()), origin, '--instance-root', str(instance)],
                            input=len(payload).to_bytes(4, 'little') + payload,
                            capture_output=True, creationflags=flags, timeout=20)
    assert result.returncode == 0, 'native fixture bridge failed'
    response = json.loads(result.stdout[4:])
    assert response['ok'], response.get('error')
    return response


def cookie(value):
    return dict(domain='.example.com', path='/', name='ameow_synthetic', value=value,
                secure=False, http_only=True, host_only=False, expires=None)


def authorize(value, new_grant=grant):
    native(dict(operation='authorize', site='example.com', source_id=source, source_name='Synthetic media fixture',
                grant_id=new_grant, replaces=None, cookies=[cookie(value)], skipped_partitioned=0))


for height in [1080, 2160]:
    media = root / str(height)
    media.mkdir()
    subprocess.run([str(args.ffmpeg.resolve()), '-v', 'error', '-f', 'lavfi', '-i',
                    'color=c=gray:s=' + str(height * 16 // 9) + 'x' + str(height) + ':r=2',
                    '-t', '2', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
                    '-g', '2', '-f', 'hls', '-hls_time', '1', '-hls_list_size', '0', str(media / 'index.m3u8')],
                   check=True, capture_output=True, creationflags=flags)

requests = []
case = ''
release = threading.Event()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_HEAD(self):
        self.serve(False)

    def do_GET(self):
        self.serve(True)

    def serve(self, body):
        url = urlsplit(self.path)
        if url.hostname != 'example.com' or url.query:
            self.send_error(403)
            return
        header = self.headers.get('Cookie', '')
        generation = 'v2' if 'AMEOW_SYNTHETIC_V2' in header else 'v1' if 'AMEOW_SYNTHETIC_V1' in header else 'anonymous'
        requests.append(dict(case=case, path=url.path, generation=generation, method=self.command))
        if url.path == '/ameow-issue33-3.mp4':
            # A deliberate secret echo in engine stderr must not survive evidence export.
            self.send_response(403, 'AMEOW_SYNTHETIC_V2')
            self.end_headers()
            return
        if url.path == '/ameow-issue33-1.mp4':
            lines = ['#EXTM3U', '#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=1920x1080,CODECS="avc1.42c028"', '1080/index.m3u8']
            if generation != 'anonymous':
                lines += ['#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=3840x2160,CODECS="avc1.42c033"', '2160/index.m3u8']
            data = ('\n'.join(lines) + '\n').encode()
            content_type = 'application/vnd.apple.mpegurl'
        else:
            relative = url.path.lstrip('/')
            allowed = {str(p.relative_to(root)).replace('\\', '/') for h in ['1080', '2160'] for p in (root / h).iterdir()}
            if relative not in allowed:
                self.send_error(404)
                return
            path = root / relative
            data = path.read_bytes()
            content_type = 'application/vnd.apple.mpegurl' if path.suffix == '.m3u8' else 'video/mp2t'
            if body and path.suffix == '.ts' and case in ['frozen', 'revoked']:
                release.wait(60)
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if body:
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
server.daemon_threads = True
threading.Thread(target=server.serve_forever, daemon=True).start()
results = []


def run(name, number=1):
    global case
    case = name
    release.clear()
    command = [str(args.driver.resolve()), '--runtime-root', str(instance / 'runtime'), '--output', str(instance / 'output'),
               '--quality', 'highest', '--url', 'http://example.com/ameow-issue33-' + str(number) + '.mp4',
               '--diagnostic-output', str(root / (name + '-diagnostic.txt')),
               '--app-update-fixture-dir', str(root), '--app-update-fixture-media-port', str(server.server_port)]
    stderr = (root / (name + '-stderr.log')).open('wb')
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=stderr, text=True, encoding='utf-8', creationflags=flags)
    changed = False
    snapshots = []
    for line in process.stdout:
        view = json.loads(line)
        snapshots.append(view)
        if not changed and view['jobs'] and view['jobs'][0]['phase'] == 'Downloading' and name in ['frozen', 'revoked']:
            if name == 'frozen':
                native(dict(operation='sync', site='example.com', source_id=source, grant_id=grant, sequence=1,
                            cookies=[cookie('AMEOW_SYNTHETIC_V2')], skipped_partitioned=0))
                release.set()
            else:
                native(dict(operation='revoke', site='example.com', source_id=source, grant_id=revoked_grant))
            changed = True
    status = process.wait(timeout=30)
    release.set()
    stderr.close()
    (root / (name + '-snapshots.json')).write_text(json.dumps(snapshots, indent=2), encoding='utf-8')
    final = snapshots[-1]
    job = final['jobs'][0]
    assert final['stopped'] and job['resources_released'] and not job['slot_owned'], name + ' did not settle'
    if name in ['frozen', 'fresh', 'anonymous']:
        assert status == 0 and job['phase'] == 'Success', name + ' failed'
        probe = subprocess.check_output([str(args.ffprobe.resolve()), '-v', 'error', '-show_streams', '-of', 'json', job['delivered']['path']], creationflags=flags)
        height = next(s['height'] for s in json.loads(probe)['streams'] if s['codec_type'] == 'video')
        assert height == (1080 if name == 'anonymous' else 2160), name + ' wrong delivered height'
    else:
        assert status != 0 and job['phase'] == ('Cancelled' if name == 'revoked' else 'Failure'), name + ' wrong terminal'
        height = None
    versions = next((v['verified_runtime_versions'] for v in reversed(snapshots) if v['verified_runtime_versions']), [])
    results.append(dict(case=name, phase=job['phase'], delivered_height=height, versions=versions))
    for request in [r for r in requests if r['case'] == name]:
        assert request['generation'] == dict(frozen='v1', fresh='v2', anonymous='anonymous', failure='v2', revoked='v2')[name], name + ' changed authentication mid-attempt'


try:
    authorize('AMEOW_SYNTHETIC_V1')
    run('frozen')
    run('fresh')
    run('failure', 3)
    diagnostic = (root / 'failure-diagnostic.txt').read_text(encoding='utf-8')
    assert 'E_' in diagnostic and 'AMEOW_SYNTHETIC' not in diagnostic, 'unsafe or missing copy diagnostic'
    native(dict(operation='revoke', site='example.com', source_id=source, grant_id=grant))
    run('anonymous')
    authorize('AMEOW_SYNTHETIC_V2', revoked_grant)
    run('revoked')
    for file in (instance / 'runtime' / 'diagnostics').rglob('*'):
        if file.is_file():
            data = file.read_bytes()
            assert b'AMEOW_SYNTHETIC_V1' not in data and b'AMEOW_SYNTHETIC_V2' not in data, 'credential in persisted evidence'
    report = dict(result='PASS', fixture=True, real_membership='NOT TESTED', driver_sha256=hashlib.sha256(args.driver.read_bytes()).hexdigest(), cases=results, requests=requests)
    (root / 'result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))
finally:
    release.set()
    server.shutdown()
    for owned_grant in (grant, revoked_grant):
        native(dict(operation='revoke', site='example.com', source_id=source, grant_id=owned_grant))
