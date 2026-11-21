"""Meter long-source native fast sections through the real queue and managed tools."""
import argparse
import hashlib
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import struct
import subprocess
import threading
import time
from urllib.parse import urlsplit

p = argparse.ArgumentParser()
p.add_argument('--root', type=Path, required=True)
p.add_argument('--driver', type=Path, required=True)
p.add_argument('--runtime-source', type=Path, required=True)
p.add_argument('--media-source', type=Path, help='reuse this task owned 600-second synthetic source')
p.add_argument('--cases', nargs='+', choices=['http', 'hls', 'dash', 'no-range'], default=['http', 'hls', 'dash'])
args = p.parse_args()
root = args.root.resolve(); root.mkdir(parents=True, exist_ok=False)
assert args.runtime_source.name.startswith('runtime-') and (args.runtime_source / 'complete.json').is_file()
runtime = root / 'desktop' / 'runtime'; runtime.mkdir(parents=True)
tools = runtime / args.runtime_source.name; shutil.copytree(args.runtime_source, tools)
ffmpeg, ffprobe = tools / 'ffmpeg.exe', tools / 'ffprobe.exe'
flags = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
def run(command, **kw):
    return subprocess.run([str(x) for x in command], creationflags=flags, check=True, capture_output=True, **kw)
source = root / 'source.mp4'
if args.media_source: shutil.copyfile(args.media_source, source)
else: run([ffmpeg, '-v', 'error', '-f', 'lavfi', '-i',
     "testsrc2=s=320x180:r=25,drawbox=x=0:y=0:w=48:h=48:color=black:t=fill,drawbox=x=0:y=0:w=48:h=48:color=white:t=fill:enable='lt(mod(t,1),0.1)'",
     '-f', 'lavfi', '-i', "sine=frequency=1000:sample_rate=48000,volume=enable='gte(mod(t,1),0.1)':volume=0",
     '-t', '600', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-g', '100', '-keyint_min', '100', '-sc_threshold', '0',
     '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', source])
for name, mux in [('hls', ['-f', 'hls', '-hls_time', '4', '-hls_list_size', '0', 'index.m3u8']),
                  ('dash', ['-f', 'dash', '-seg_duration', '4', 'index.mpd'])]:
    directory = root / name; directory.mkdir()
    run([ffmpeg, '-v', 'error', '-i', source, '-map', '0', '-c', 'copy', *mux[:-1], directory / mux[-1]], cwd=directory)
requests = []; current = ''
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_HEAD(self): self.serve(False)
    def do_GET(self): self.serve(True)
    def serve(self, body):
        url = urlsplit(self.path)
        if not url.hostname: url = urlsplit('http://' + self.headers.get('Host', '') + self.path)
        if url.hostname != 'example.com' or url.query: self.send_error(403); return
        name = {'/ameow-issue33-1.mp4': 'hls/index.m3u8', '/ameow-issue33-2.mp4': 'dash/index.mpd', '/ameow-issue33-3.mp4': 'source.mp4'}.get(url.path, url.path.lstrip('/'))
        path = (root / name).resolve()
        if not path.is_relative_to(root) or not path.is_file() or not (name == 'source.mp4' or name.startswith(('hls/', 'dash/'))):
            self.send_error(404); return
        data = path.read_bytes()
        if url.path == '/ameow-issue33-1.mp4':
            data = bytes([10]).join(b'hls/' + line if line and not line.startswith(b'#') else line for line in data.splitlines())
        if url.path == '/ameow-issue33-2.mp4': data = data.replace(b'initialization="', b'initialization="dash/').replace(b'media="', b'media="dash/')
        total = len(data); start, end = 0, total - 1
        header = self.headers.get('Range')
        if header and name == 'source.mp4' and current != 'no-range':
            values = header.removeprefix('bytes=').split('-'); start = int(values[0] or 0); end = min(int(values[1]) if values[1] else end, end)
            data = data[start:end + 1]
            self.send_response(206); self.send_header('Content-Range', f'bytes {start}-{end}/{total}')
        else: self.send_response(200)
        self.send_header('Content-Type', 'application/vnd.apple.mpegurl' if name.endswith('.m3u8') else 'application/dash+xml' if name.endswith('.mpd') else 'video/mp4' if name.endswith(('.mp4', '.m4s')) else 'video/mp2t')
        self.send_header('Content-Length', str(len(data)))
        if current != 'no-range': self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        row = dict(case=current, path=url.path, method=self.command, range=header, response_start=start, resource_bytes=total, declared_body_bytes=len(data), sent_body_bytes=0)
        requests.append(row)
        if body:
            try:
                for offset in range(0, len(data), 16384):
                    block = data[offset:offset + 16384]; self.wfile.write(block); row['sent_body_bytes'] += len(block)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError): row['client_closed'] = True
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler); server.daemon_threads = True
threading.Thread(target=server.serve_forever, daemon=True).start()
results = []
def raw(path, options):
    return run([ffmpeg, '-v', 'error', '-i', path, *options, '-fps_mode', 'passthrough', '-f', 'rawvideo', 'pipe:1']).stdout
def starts(values, threshold):
    return [i for i, n in enumerate(values) if n > threshold and (i == 0 or values[i - 1] <= threshold)]
try:
    for name in args.cases:
        current = name
        out = root / 'desktop' / ('output-' + name); out.mkdir(parents=True)
        number = {'hls': 1, 'dash': 2, 'http': 3, 'no-range': 3}[name]
        command = [args.driver.resolve(), '--runtime-root', runtime, '--output', out, '--quality', 'saver', '--url', f'http://example.com/ameow-issue33-{number}.mp4',
                   '--start-ms', '301250', '--end-ms', '309750', '--app-update-fixture-dir', root, '--app-update-fixture-media-port', str(server.server_port)]
        began = time.monotonic(); result = subprocess.run([str(x) for x in command], capture_output=True, creationflags=flags, timeout=180)
        elapsed = time.monotonic() - began
        (root / (name + '-stdout.jsonl')).write_bytes(result.stdout); (root / (name + '-stderr.log')).write_bytes(result.stderr)
        final = json.loads(result.stdout.splitlines()[-1]); job = final['jobs'][0]
        time.sleep(.25)
        rows = [r for r in requests if r['case'] == name]
        sent = sum(r['sent_body_bytes'] for r in rows)
        full = source.stat().st_size if name in ['http', 'no-range'] else sum(f.stat().st_size for f in (root / name).iterdir() if f.is_file())
        summary = dict(case=name, phase=job['phase'], elapsed_seconds=elapsed, sent_body_bytes=sent, complete_source_bytes=full, response_ratio=sent/full,
                       accounting='successful 16KiB server socket writes, including metadata/probe/read-ahead; conservative upper bound on client consumption', source_duration=600, requested=[301.25,309.75])
        results.append(summary)
        if name == 'no-range':
            summary['failure'] = job.get('failure'); summary['message'] = job.get('message')
            assert job['phase'] == 'Failure', 'nonseekable source must fail explicitly'
            continue
        assert result.returncode == 0 and final['stopped'] and job['phase'] == 'Success', (name, job.get('message'), job.get('failure'))
        assert job['resources_released'] and not job['slot_owned']
        assert sent < full * .3, (name, 'short section consumed too much of long source', sent, full)
        if name == 'http': assert any(r['response_start'] > full * .3 for r in rows)
        delivered = Path(job['delivered']['path'])
        assert hashlib.sha256(delivered.read_bytes()).hexdigest() == job['delivered']['sha256'].lower()
        info = json.loads(run([ffprobe, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', delivered]).stdout)
        duration = float(info['format']['duration']); assert 8.25 <= duration <= 18.5 and duration < 600
        actual = raw(delivered, ['-map', '0:v:0', '-vf', 'scale=32:18', '-pix_fmt', 'gray'])
        reference = run([ffmpeg, '-v', 'error', '-ss', '291.24', '-i', source, '-t', '28.52', '-map', '0:v:0', '-vf', 'scale=32:18', '-pix_fmt', 'gray', '-fps_mode', 'passthrough', '-f', 'rawvideo', 'pipe:1']).stdout
        frame = 32 * 18
        matches = []
        for sample in [actual[:frame], actual[-frame:]]:
            errors = [sum(abs(a-b) for a,b in zip(sample, reference[i:i+frame])) / frame for i in range(0,len(reference)-frame+1,frame)]
            index = min(range(len(errors)), key=errors.__getitem__); assert errors[index] < 3, (name, 'source frame differs', min(errors))
            matches.append(291.24 + index / 25)
        assert 291.25 <= matches[0] <= 301.5 and 309.5 <= matches[1] <= 319.75, (name, matches)
        flash = raw(delivered, ['-map', '0:v:0', '-vf', 'crop=16:16:0:0,scale=1:1', '-pix_fmt', 'gray'])
        video_start = float(next(s for s in info['streams'] if s['codec_type'] == 'video').get('start_time',0))
        audio_start = float(next(s for s in info['streams'] if s['codec_type'] == 'audio').get('start_time',0))
        vt = [i/25 + video_start for i in starts(flash,200)]
        pcm = run([ffmpeg, '-v', 'error', '-i', delivered, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1']).stdout
        samples = struct.unpack('<' + 'f' * (len(pcm)//4), pcm)
        energy = [sum(v*v for v in samples[i:i+480])/480 for i in range(0,len(samples)-480,480)]
        at = [i/100 + audio_start for i in starts(energy,.0001)]
        assert len(vt) >= 5 and len(at) >= 5, (vt,at)
        overlap = [v for v in vt if at[0] - .1 <= v <= at[-1] + .1]; assert len(overlap) >= 5
        delta = max(min(abs(v-a) for a in at) for v in overlap); assert delta < .1, (name,delta)
        summary.update(delivered=job['delivered'], duration=duration, source_boundary_frames=matches, stream_starts=dict(video=video_start,audio=audio_start), max_av_offset=delta, codecs=[s['codec_name'] for s in info['streams']])
finally:
    server.shutdown()
    (root / 'report.json').write_text(json.dumps(dict(results=results,requests=requests,source_sha256=hashlib.sha256(source.read_bytes()).hexdigest()),indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
