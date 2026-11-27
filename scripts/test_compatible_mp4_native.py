"""Explicit managed-tool output check. Loopback only; use the coordinator's heavy slot."""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import subprocess
import threading
import time

p = argparse.ArgumentParser()
p.add_argument('--root', type=Path, required=True)
p.add_argument('--tools', type=Path, required=True)
p.add_argument('--samples', type=Path, required=True)
p.add_argument('--resume', action='store_true', help='continue unchanged output policy after a check-script failure')
p.add_argument('--prepared-media', type=Path, help='reuse the owned source fixtures from a previous native check')
a = p.parse_args()
root = a.root.resolve()
root.mkdir(parents=True, exist_ok=a.resume)
tools = a.tools.resolve()
assert (tools / 'complete.json').is_file()
repo = Path(__file__).resolve().parents[1]
env = {'SystemRoot': os.environ['SystemRoot'], 'PATH': ''}
for key in ['USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']:
    folder = root / key
    folder.mkdir(exist_ok=a.resume)
    env[key] = str(folder)
flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
commands = json.loads((root / 'commands.json').read_text(encoding='utf-8')) if a.resume else []


def run(name, args):
    started = time.perf_counter()
    with subprocess.Popen([str(v) for v in args], cwd=root, env=env, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, creationflags=flags) as proc:
        try:
            stdout, stderr = proc.communicate(timeout=90)
        except subprocess.TimeoutExpired:
            subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True, timeout=10)
            proc.communicate(timeout=10)
            raise
    (root / (name + '.log')).write_bytes(stdout + bytes([10]) + stderr)
    commands.append(dict(name=name, pid=proc.pid, argv=[str(v) for v in args], exit=proc.returncode,
                         elapsed_seconds=time.perf_counter() - started))
    (root / 'commands.json').write_text(json.dumps(commands, indent=2), encoding='utf-8')
    assert proc.returncode == 0, name
    return stdout


def ff(name, args):
    return run(name, [tools / 'ffmpeg.exe', '-nostdin', '-v', 'error', '-n', *args])


def probe(name, path):
    return json.loads(run(name, [tools / 'ffprobe.exe', '-v', 'error', '-show_streams',
                                '-show_format', '-of', 'json', path]))


def packet_times(name, path):
    packets = json.loads(run(name, [tools / 'ffprobe.exe', '-v', 'error', '-select_streams', 'v:0',
        '-show_packets', '-show_entries', 'packet=pts_time', '-of', 'json', path]))['packets']
    return sorted(float(packet['pts_time']) for packet in packets)


class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        self.serve(False)

    def do_GET(self):
        self.serve(True)

    def serve(self, body):
        path = root / Path(self.path.split('?')[0]).name
        if not path.is_file():
            self.send_error(404)
            return
        size = path.stat().st_size
        start, end = 0, size - 1
        requested = self.headers.get('Range')
        if requested:
            start_text, end_text = requested.removeprefix('bytes=').split('-')
            start = int(start_text or 0)
            end = min(int(end_text or end), end)
        self.send_response(206 if requested else 200)
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Type', 'application/octet-stream')
        if requested:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        if body:
            with path.open('rb') as stream:
                stream.seek(start)
                try:
                    self.wfile.write(stream.read(end - start + 1))
                except (ConnectionResetError, BrokenPipeError):
                    pass

    def log_message(self, *_):
        pass


if a.prepared_media:
    assert not a.resume
    for name in ['avc', 'vp9', 'audio-only', 'video-only', 'silent', 'multi-audio',
                 'merge-video', 'merge-audio', 'vp8', 'sixty', 'quicktime']:
        os.link(a.prepared_media / (name + '.mkv'), root / (name + '.mkv'))
elif not a.resume:
    # Reuse retained research bytes, with looped stream copy for a useful clip interval.
    for name, sample in [('avc', 'preview-encoded-h264-aac.mp4'), ('vp9', 'preview-source-vp9.webm')]:
        ff('prepare-' + name, ['-stream_loop', '7', '-i', a.samples / sample, '-t', '8',
                              '-map', '0', '-c', 'copy', root / (name + '.mkv')])
    for name, inputs, maps in [
    ('audio-only', ['avc', 'vp9'], ['0:v:0', '1:a:0']),
    ('video-only', ['vp9', 'avc'], ['0:v:0', '1:a:0']),
    ('silent', ['avc'], ['0:v:0']),
    ('multi-audio', ['avc', 'vp9'], ['0:v:0', '0:a:0', '1:a:0']),
    ('merge-video', ['vp9'], ['0:v:0']),
    ('merge-audio', ['avc'], ['0:a:0']),
    ]:
        args = [arg for item in inputs for arg in ['-i', root / (item + '.mkv')]]
        args += [arg for item in maps for arg in ['-map', item]]
        ff('prepare-' + name, [*args, '-c', 'copy', root / (name + '.mkv')])
    ff('prepare-vp8', ['-i', root / 'vp9.mkv', '-map', '0:v:0', '-vf', 'scale=320:180',
                      '-c:v', 'libvpx', '-b:v', '500k', '-threads', '4', '-an', root / 'vp8.mkv'])
    ff('prepare-sixty', ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=60', '-t', '0.5',
                        '-c:v', 'libx264', '-threads', '4', '-pix_fmt', 'yuv420p', root / 'sixty.mkv'])
    ff('prepare-quicktime', ['-i', root / 'avc.mkv', '-map', '0', '-c', 'copy', '-f', 'mov', root / 'quicktime.mkv'])

plugin = root / 'managed-plugins' / 'ameow' / 'yt_dlp_plugins' / 'postprocessor'
plugin.mkdir(parents=True, exist_ok=a.resume)
policy_source = repo / 'src/download/adapters/yt_dlp/compatible_mp4.py'
if a.resume:
    assert (plugin / 'ameow_compatible_mp4.py').read_bytes() == policy_source.read_bytes(), 'Cannot reuse media after policy changed'
else:
    shutil.copyfile(policy_source, plugin / 'ameow_compatible_mp4.py')
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
server.daemon_threads = True
thread = threading.Thread(target=server.serve_forever)
thread.start()
rows = json.loads((root / 'results.json').read_text(encoding='utf-8')) if a.resume else []
try:
    for name, source, mode in [('copy', 'avc', 'full'), ('audio', 'audio-only', 'full'),
                               ('video', 'video-only', 'full'), ('both', 'vp9', 'full'),
                               ('silent', 'silent', 'full'), ('multi-audio', 'multi-audio', 'full'),
                               ('fast', 'vp9', 'fast'), ('precise', 'vp9', 'precise'),
                               ('precise-multi', 'multi-audio', 'precise'),
                               ('fast-vp8', 'vp8', 'fast'), ('merge', 'vp9', 'merge'),
                               ('sixty', 'sixty', 'full'),
                               ('quicktime', 'quicktime', 'full'),
                               ('hdr-preserve', 'vp9', 'hdr')]:
        previous = next((row for row in rows if row['name'] == name), None)
        if previous:
            assert hashlib.sha256(Path(previous['path']).read_bytes()).hexdigest() == previous['sha256']
            continue
        workspace = root / name
        workspace.mkdir(exist_ok=a.resume)
        native = probe(name + '-source-probe', root / (source + '.mkv'))
        video = next(s for s in native['streams'] if s['codec_type'] == 'video')
        metadata = dict(id='owned', title='owned format fixture', extractor='generic', extractor_key='Generic',
                        url=f'http://127.0.0.1:{server.server_port}/{source}.mkv', protocol='http',
                        ext='mkv', format_id='owned', vcodec=video['codec_name'],
                        acodec=next((s['codec_name'] for s in native['streams'] if s['codec_type'] == 'audio'), 'none'),
                        width=video['width'], height=video['height'],
                        fps=float(video['r_frame_rate'].split('/')[0]) / float(video['r_frame_rate'].split('/')[1]),
                        dynamic_range='HDR10' if mode == 'hdr' else 'SDR', duration=float(native['format']['duration']))
        if mode == 'merge':
            metadata['formats'] = [
                dict(format_id='v', ext='mkv', protocol='http', vcodec='vp9', acodec='none',
                     width=1920, height=1080, fps=30, dynamic_range='SDR',
                     url=f'http://127.0.0.1:{server.server_port}/merge-video.mkv'),
                dict(format_id='a', ext='mka', protocol='http', vcodec='none', acodec='aac',
                     url=f'http://127.0.0.1:{server.server_port}/merge-audio.mkv')]
        info = workspace / 'input.json'
        info.write_text(json.dumps(metadata), encoding='utf-8')
        args = [tools / 'yt-dlp.exe', '--ignore-config', '--no-plugin-dirs', '--plugin-dirs', root / 'managed-plugins',
                '--use-postprocessor', 'AmeowOutputPolicy:when=before_dl',
                '--use-postprocessor', 'AmeowCompatibleMP4:when=post_process',
                '--ffmpeg-location', tools, '--proxy', '', '--no-simulate', '--no-write-info-json',
                '--format', 'bv*+ba/bv*/b', '--format-sort', 'height,+vcodec:avc', '--format-sort-force',
                '--merge-output-format', 'mkv', '--output', workspace / 'media.%(ext)s',
                '--print-to-file', 'after_move:%()j', workspace / 'result.json',
                '--newline', '--progress-template', 'postprocess:AMEOW_PP=%(progress)j']
        if mode in ('fast', 'precise'):
            args += ['--download-sections', '*1.250-4.750', '--downloader-args', 'ffmpeg_i:-seekable 1 -xerror',
                     '--downloader-args', 'ffmpeg_o:-progress pipe:1 -stats_period 0.2 -nostats']
            if mode == 'precise':
                args += ['--force-keyframes-at-cuts']
        if not (a.resume and (workspace / 'result.json').is_file()):
            run(name + '-download', [*args, '--load-info-json', info])
        result = json.loads((workspace / 'result.json').read_text(encoding='utf-8'))
        delivered = Path(result['filepath'])
        actual = probe(name + '-output-probe', delivered)
        expected_hdr = mode == 'hdr'
        assert delivered.suffix == ('.mkv' if expected_hdr else '.mp4')
        output_video = next(s for s in actual['streams'] if s['codec_type'] == 'video')
        audio = [s for s in actual['streams'] if s['codec_type'] == 'audio']
        assert (output_video['width'], output_video['height']) == (video['width'], video['height'])
        cadence = None
        if mode in ('full', 'merge', 'hdr'):
            original_times = packet_times(name + '-source-packets', root / (source + '.mkv'))
            output_times = packet_times(name + '-output-packets', delivered)
            assert len(original_times) == len(output_times) > 0
            delta = max(abs((left - original_times[0]) - (right - output_times[0]))
                        for left, right in zip(original_times, output_times))
            assert delta < 0.0011, (name, delta)
            cadence = dict(source_frames=len(original_times), output_frames=len(output_times),
                           max_relative_pts_delta=delta, source_avg=video['avg_frame_rate'],
                           output_avg=output_video['avg_frame_rate'])
        if name == 'sixty':
            assert output_video['r_frame_rate'] == '60/1'
            assert cadence['output_frames'] == int(output_video['nb_frames']) == 30
        assert len(audio) == len([s for s in native['streams'] if s['codec_type'] == 'audio'])
        if not expected_hdr:
            assert output_video['codec_name'] == 'h264' and output_video['pix_fmt'] == 'yuv420p'
            assert all(s['codec_name'] == 'aac' and s['profile'] == 'LC' for s in audio)
            assert actual['format']['tags']['major_brand'].strip() != 'qt'
        else:
            assert output_video['codec_name'] == video['codec_name']
        duration = float(actual['format']['duration'])
        if mode == 'precise':
            assert abs(duration - 3.5) <= 1 / 30 + 0.05, duration
        if mode == 'fast':
            assert 3.25 <= duration <= 14 and duration < 7.75, duration
        ff(name + '-decode', ['-xerror', '-i', delivered, '-map', '0', '-f', 'null', '-'])
        hashes = {}
        for target, path in [('source', root / (source + '.mkv')), ('output', delivered)]:
            hashes[target] = ff(name + '-' + target + '-payload', ['-i', path, '-map', '0', '-c', 'copy',
                                                                 '-f', 'streamhash', '-hash', 'sha256', '-']).decode()
        if mode == 'full' and name in ('copy', 'silent'):
            assert hashes['source'] == hashes['output'], name
        if name == 'audio':
            assert hashes['source'].splitlines()[0] == hashes['output'].splitlines()[0]
        if name == 'video':
            assert hashes['source'].splitlines()[1] == hashes['output'].splitlines()[1]
        rows.append(dict(name=name, path=str(delivered), sha256=hashlib.sha256(delivered.read_bytes()).hexdigest(),
                         duration=duration, policy=result['_ameow_output'], cadence=cadence, payload_hashes=hashes, probe=actual))
        (root / 'results.json').write_text(json.dumps(rows, indent=2), encoding='utf-8')
finally:
    server.shutdown()
    server.server_close()
    thread.join()
print('Managed SDR full/fast/precise checks passed; Resolve import remains a separate native acceptance.')
