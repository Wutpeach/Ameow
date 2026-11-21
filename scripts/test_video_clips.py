"""Owned synthetic non-keyframe clips through the real queue, yt-dlp, FFmpeg and verifier."""
import argparse
import hashlib
import http.client
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import secrets
import ssl
import struct
import subprocess
import threading
from urllib.parse import urlsplit

p = argparse.ArgumentParser()
p.add_argument('--root', type=Path, required=True)
p.add_argument('--driver', type=Path, required=True)
p.add_argument('--runtime-source', type=Path, required=True, help='one immutable task fixture runtime-<hash> directory; never a user data root')
p.add_argument('--runtime-root', type=Path, help='fixed task-owned runtime cache for repeated development runs')
p.add_argument('--host', type=Path, help='candidate native helper for synthetic attempt-Jar verification')
p.add_argument('--cases', nargs='+', choices=['hls', 'dash', 'http', 'hls-auth', 'auth-range'], default=['hls', 'dash', 'http'])
p.add_argument('--https-auth', action='store_true', help='owned self-signed CONNECT fixture; no system trust changes')
p.add_argument('--openssl', type=Path, default=Path('C:/Program Files/Git/usr/bin/openssl.exe'))
args = p.parse_args()
root = args.root.resolve(); root.mkdir(parents=True, exist_ok=False)
runtime = args.runtime_root.resolve() if args.runtime_root else root / 'desktop' / 'runtime'; runtime.mkdir(parents=True, exist_ok=True)
assert args.runtime_source.name.startswith('runtime-') and (args.runtime_source / 'complete.json').is_file()
tools = runtime / args.runtime_source.name
if not tools.exists(): shutil.copytree(args.runtime_source, tools)
ffmpeg, ffprobe = tools / 'ffmpeg.exe', tools / 'ffprobe.exe'
flags = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
def run(command, **kw):
    return subprocess.run([str(s) for s in command], capture_output=True, creationflags=flags, check=True, **kw)
source = root / 'source.mp4'
run([ffmpeg, '-v', 'error', '-f', 'lavfi', '-i',
     "testsrc2=s=320x180:r=25,drawbox=x=0:y=0:w=48:h=48:color=black:t=fill,drawbox=x=0:y=0:w=48:h=48:color=white:t=fill:enable='lt(mod(t,1),0.1)'",
     '-f', 'lavfi', '-i', r'aevalsrc=if(lt(mod(t\,1)\,0.1)\,0.6*sin(2*PI*1000*t)\,0):s=48000',
     '-t', '8', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-g', '100', '-keyint_min', '100', '-sc_threshold', '0',
     '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', source])
for name, mux in [('hls', ['-f', 'hls', '-hls_time', '2', '-hls_list_size', '0', 'index.m3u8']),
                  ('dash', ['-f', 'dash', '-seg_duration', '2', 'index.mpd'])]:
    directory = root / name; directory.mkdir()
    run([ffmpeg, '-v', 'error', '-i', source, '-map', '0', '-c', 'copy', *mux[:-1], directory / mux[-1]], cwd=directory)
requests = []; current = ''
tls_context = None
if args.https_auth:
    certificate, key = root / 'fixture-cert.pem', root / 'fixture-key.pem'
    run([args.openssl, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', certificate, '-days', '1', '-subj', '/CN=example.com', '-addext', 'subjectAltName=DNS:example.com,DNS:media.example.com'])
    tls_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); tls_context.load_cert_chain(certificate, key)
source_id, grant_id = secrets.token_hex(16), secrets.token_hex(16)
def native(operation):
    assert args.host and runtime.name == 'runtime', 'authenticated case needs a private instance/runtime directory'
    payload = json.dumps(dict(version=1, request_id='clip-media-fixture', operation=operation)).encode()
    result = run([args.host.resolve(), 'chrome-extension://icedkidcbbbijndplfofcbhikohlcool/', '--instance-root', runtime.parent], input=len(payload).to_bytes(4, 'little') + payload)
    reply = json.loads(result.stdout[4:]); assert reply['ok'], reply.get('error')
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_CONNECT(self):
        if not tls_context or self.path not in ['example.com:443', 'media.example.com:443']:
            self.send_error(403); return
        self.send_response(200, 'Connection established'); self.end_headers()
        connection = tls_context.wrap_socket(self.connection, server_side=True)
        self.connection = connection; self.rfile = connection.makefile('rb'); self.wfile = connection.makefile('wb', buffering=0)
        self.close_connection = True
        try: self.handle_one_request()
        finally: connection.close()
    def do_HEAD(self): self.serve(False)
    def do_GET(self): self.serve(True)
    def serve(self, body):
        url = urlsplit(self.path)
        if not url.hostname: url = urlsplit('https://' + self.headers.get('Host', '') + self.path)
        if url.hostname not in ['example.com', 'media.example.com'] or url.query: self.send_error(403); return
        name = {'/ameow-issue33-1.mp4': 'hls/index.m3u8', '/ameow-issue33-2.mp4': 'dash/index.mpd', '/ameow-issue33-3.mp4': 'source.mp4'}.get(url.path, url.path.lstrip('/'))
        if name.startswith('ameow-issue33-'):
            self.send_error(404); return
        path = (root / name).resolve()
        if not path.is_relative_to(root) or not path.is_file() or not (name == 'source.mp4' or name.startswith(('hls/', 'dash/'))):
            self.send_error(404); return
        data = path.read_bytes()
        if current in ['hls-auth', 'auth-range'] and url.path == '/ameow-issue33-1.mp4':
            scheme = b'https' if args.https_auth else b'http'
            media_path = b'/source.mp4' if current == 'auth-range' else b'/hls/index.m3u8'
            data = b'<html><head><title>Owned authenticated clip</title></head><body><video src="' + scheme + b'://media.example.com' + media_path + b'"></video></body></html>'
        if current.startswith(('hls-auth', 'auth-range')) and 'AMEOW_CLIP_TEST_ONLY' not in self.headers.get('Cookie', ''):
            requests.append(dict(case=current, path=url.path, method=self.command, bytes=0, synthetic_auth=False, denied=403))
            self.send_error(403); return
        # Root manifests resolve relative segment paths at the public origin.
        if url.path == '/ameow-issue33-1.mp4' and current not in ['hls-auth', 'auth-range']:
            data = b'\n'.join(b'hls/' + line if line and not line.startswith(b'#') else line for line in data.split(b'\n'))
        if url.path == '/ameow-issue33-2.mp4': data = data.replace(b'initialization="', b'initialization="dash/').replace(b'media="', b'media="dash/')
        total = len(data); start, end = 0, len(data) - 1
        range_header = self.headers.get('Range')
        if range_header and name == 'source.mp4':
            values = range_header.removeprefix('bytes=').split('-'); start = int(values[0] or 0); end = int(values[1]) if values[1] else end
            end = min(end, total - 1); data = data[start:end + 1]
            self.send_response(206); self.send_header('Content-Range', f'bytes {start}-{end}/{total}')
        else: self.send_response(200)
        content_type = 'text/html' if current in ['hls-auth', 'auth-range'] and url.path == '/ameow-issue33-1.mp4' else 'application/vnd.apple.mpegurl' if name.endswith('.m3u8') else 'application/dash+xml' if name.endswith('.mpd') else 'video/mp4' if name.endswith(('.mp4', '.m4s')) else 'video/mp2t'
        self.send_header('Content-Type', content_type); self.send_header('Content-Length', str(len(data))); self.send_header('Accept-Ranges', 'bytes'); self.end_headers()
        requests.append(dict(case=current, path=url.path, method=self.command, range=range_header, bytes=len(data) if body else 0, synthetic_auth='AMEOW_CLIP_TEST_ONLY' in self.headers.get('Cookie', '')))
        if body:
            try: self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler); server.daemon_threads = True
threading.Thread(target=server.serve_forever, daemon=True).start()
results = []
def decoded(path, options):
    return run([ffmpeg, '-v', 'error', '-i', path, *options, '-f', 'rawvideo', 'pipe:1']).stdout
def starts(values, threshold):
    return [i for i, n in enumerate(values) if n > threshold and (i == 0 or values[i - 1] <= threshold)]
try:
    for name in args.cases:
        number = {'hls': 1, 'dash': 2, 'http': 3, 'hls-auth': 1, 'auth-range': 1}[name]
        if name in ['hls-auth', 'auth-range']:
            native(dict(operation='authorize', site='example.com', source_id=source_id, source_name='Owned clip fixture', grant_id=grant_id, replaces=None,
                        cookies=[dict(domain='.example.com', path='/', name='clip_fixture', value='AMEOW_CLIP_TEST_ONLY', secure=False, http_only=True, host_only=False, expires=None)], skipped_partitioned=0))
            current = name + '-anonymous'
            denied_path = '/source.mp4' if name == 'auth-range' else '/hls/index.m3u8'
            if args.https_auth:
                connection = http.client.HTTPSConnection('127.0.0.1', server.server_port, context=ssl._create_unverified_context())
                connection.set_tunnel('media.example.com', 443); connection.request('GET', denied_path)
            else:
                connection = http.client.HTTPConnection('127.0.0.1', server.server_port)
                connection.request('GET', 'http://media.example.com' + denied_path)
            denied = connection.getresponse(); assert denied.status == 403; denied.read(); connection.close()
        current = name
        out = root / 'desktop' / ('output-' + name); out.mkdir(parents=True)
        command = [args.driver.resolve(), '--runtime-root', runtime, '--output', out, '--quality', 'saver',
                   '--url', f'{"https" if args.https_auth else "http"}://example.com/ameow-issue33-{number}.mp4', '--start-ms', '1250', '--end-ms', '4750',
                   '--app-update-fixture-dir', root, '--app-update-fixture-media-port', str(server.server_port)]
        if args.https_auth: command.append('--app-update-fixture-media-tls')
        result = subprocess.run([str(s) for s in command], capture_output=True, creationflags=flags, timeout=180)
        (root / (name + '-stdout.jsonl')).write_bytes(result.stdout); (root / (name + '-stderr.log')).write_bytes(result.stderr)
        views = [json.loads(line) for line in result.stdout.splitlines()]; final = views[-1]; job = final['jobs'][0]
        if result.returncode and name in ['hls-auth', 'auth-range']:
            jar = root / 'synthetic-engine-probe.jar'
            jar.write_text('# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tFALSE\t0\tclip_fixture\tAMEOW_CLIP_TEST_ONLY\n', encoding='utf-8')
            probe_command = [tools / 'yt-dlp.exe', '--ignore-config', '--no-cache-dir', '--no-playlist', '--proxy', f'http://127.0.0.1:{server.server_port}',
                             '--ffmpeg-location', tools, '--cookies', jar, '--no-check-certificates', '--verbose', '--download-sections', '*1.250-4.750', '--force-keyframes-at-cuts',
                             '--downloader-args', 'ffmpeg_i:-tls_verify 0', '--downloader-args', 'ffmpeg_o:-c:v libx264 -c:a aac -f matroska',
                             '-o', root / 'direct-engine.%(ext)s', '--', command[command.index('--url') + 1]]
            diagnostic = subprocess.run([str(s) for s in probe_command], capture_output=True, creationflags=flags, timeout=40)
            (root / 'synthetic-engine-probe-redacted.log').write_bytes(diagnostic.stderr.replace(b'AMEOW_CLIP_TEST_ONLY', b'[FIXTURE]'))
            jar.unlink()
        assert result.returncode == 0 and final['stopped'] and job['phase'] == 'Success', (name, job.get('message'), job.get('failure'))
        assert job['resources_released'] and not job['slot_owned']
        delivered = Path(job['delivered']['path'])
        assert hashlib.sha256(delivered.read_bytes()).hexdigest() == job['delivered']['sha256'].lower()
        info = json.loads(run([ffprobe, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', delivered]).stdout)
        assert {s['codec_name'] for s in info['streams']} == {'h264', 'aac'}
        assert abs(float(info['format']['duration']) - 3.5) < .1
        # First/last pictures compare to the selected source content, not just duration.
        actual = decoded(delivered, ['-map', '0:v:0', '-vf', 'scale=32:18', '-pix_fmt', 'gray'])
        reference = run([ffmpeg, '-v', 'error', '-ss', '1.250', '-i', source, '-t', '3.5', '-map', '0:v:0', '-vf', 'scale=32:18', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1']).stdout
        frame = 32 * 18
        errors = [sum(abs(a-b) for a,b in zip(actual[offset:offset+frame], reference[offset:offset+frame])) / frame for offset in [0, len(actual) - frame]]
        assert max(errors) < 8, (name, 'wrong source boundary pictures', errors)
        # The white picture flash and audio pulse share source timestamps every second.
        flash = decoded(delivered, ['-map', '0:v:0', '-vf', 'crop=16:16:0:0,scale=1:1', '-pix_fmt', 'gray'])
        video_times = [i / 25 for i in starts(flash, 200)]
        pcm = run([ffmpeg, '-v', 'error', '-i', delivered, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1']).stdout
        samples = struct.unpack('<' + 'f' * (len(pcm) // 4), pcm)
        energy = [sum(v*v for v in samples[i:i+480]) / 480 for i in range(0, len(samples)-480, 480)]
        audio_times = [i / 100 for i in starts(energy, .02)]
        assert len(video_times) >= 3 and len(audio_times) >= 3, (video_times, audio_times)
        delta = max(min(abs(v-a) for a in audio_times) for v in video_times)
        assert delta < .08, (name, 'A/V pulse offset', delta)
        results.append(dict(case=name, delivered=job['delivered'], duration=info['format']['duration'], boundary_picture_mae=errors, video_pulses=video_times, audio_pulses=audio_times, max_av_offset=delta,
                            received_body_bytes=sum(r['bytes'] for r in requests if r['case'] == name), bytes_claim='fixture traffic only; not a general savings guarantee'))
        if name in ['hls-auth', 'auth-range']:
            relevant = [r for r in requests if r['case'] == name]
            assert relevant and all(r['synthetic_auth'] for r in relevant), 'metadata and range transfer must share the synthetic attempt Jar'
            results[-1]['synthetic_attempt_jar_all_requests'] = True
finally:
    server.shutdown()
    if any(name in ['hls-auth', 'auth-range'] for name in args.cases):
        native(dict(operation='revoke', site='example.com', source_id=source_id, grant_id=grant_id))
    (root / 'report.json').write_text(json.dumps(dict(results=results, requests=requests), indent=2), encoding='utf-8')
print(json.dumps(results, indent=2))
