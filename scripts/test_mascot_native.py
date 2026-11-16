"""Owned Windows Mascot captures and bounded native lifecycle checks; no network."""
import argparse
import ctypes as c
from ctypes import wintypes as w
import hashlib
import json
from pathlib import Path
import statistics
import subprocess
import time

from repair_a_runtime import CropCapture
from test_gpui_migration import owned_windows, bounds, wait_for
from gallery import OwnedJob
from windows_validate import u


def rows(path):
    if not path.exists():
        return []
    result = []
    for line in path.read_text(encoding='utf-8').splitlines():
        try:
            result.append(json.loads(line))
        except ValueError:
            pass  # The owned UI may be writing its final line.
    return result


class App:
    def __init__(self, exe, out, fixture=False):
        self.out = out
        out.mkdir()
        self.control = out/'control.json'
        self.telemetry = out/'telemetry.jsonl'
        self.step = 0
        self.fixture = fixture
        if fixture:
            self.write(event='layout-success')
        self.log = (out/'stderr.log').open('w', encoding='utf-8')
        self.command = [str(exe), '--telemetry', str(self.telemetry), '--exit-after-ms', '110000']
        if fixture:
            self.command += ['--queue-fixture-control', str(self.control)]
        else:
            self.command += ['--preview', '--preview-scene', 'compact.idle', '--preview-control', str(self.control)]
        self.process = subprocess.Popen(self.command, creationflags=subprocess.CREATE_NO_WINDOW, stdout=self.log, stderr=self.log)
        self.job = OwnedJob(self.process)
        self.hwnd = wait_for(lambda: owned_windows(self.process.pid).get('Ameow'))

    def write(self, **value):
        self.step += 1
        pending = self.control.with_suffix('.tmp')
        pending.write_text(json.dumps(dict(step=self.step, **value)), encoding='utf-8')
        pending.replace(self.control)

    def select(self, scene='compact.idle', night=False, reduced=False):
        self.write(scene=scene, night=night, reduced=reduced)
        def ack():
            path = self.control.with_suffix('.ack.json')
            try:
                value = json.loads(path.read_text(encoding='utf-8'))
                return value if value.get('step') == self.step and value.get('scene') == scene and value.get('night') == night and value.get('reduced') == reduced and not value.get('error') else None
            except (OSError, ValueError):
                return None
        wait_for(ack)
        time.sleep(.3)

    def latest(self, kind=None):
        data = rows(self.telemetry)
        if kind == 'mascot':
            data = [x for x in data if x.get('type') == kind]
        elif kind == 'window':
            data = [x for x in data if 'fullness' in x]
        return data[-1] if data else {}

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            self.process.wait(timeout=5)
        self.job.close()
        self.log.close()


def record(app, output, seconds, region=None):
    rect = region or bounds(app.hwnd)
    crop = CropCapture(rect)
    width, height = rect[2]-rect[0], rect[3]-rect[1]
    fps = 30
    encoder = subprocess.Popen(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-n', '-f', 'rawvideo',
        '-pixel_format', 'rgb24', '-video_size', f'{width}x{height}', '-framerate', str(fps), '-i', '-',
        '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output)], stdin=subprocess.PIPE)
    times = []
    started = time.perf_counter()
    try:
        for index in range(round(seconds*fps)):
            wait = started + index/fps - time.perf_counter()
            if wait > 0:
                time.sleep(wait)
            image = crop.grab()
            if index == 0:
                image.save(output.with_suffix('.png'))
            times.append(time.perf_counter()-started)
            encoder.stdin.write(image.tobytes())
    finally:
        crop.close()
        encoder.stdin.close()
        if encoder.wait(timeout=15):
            raise RuntimeError('原生录像编码失败')
    gaps = [(b-a)*1000 for a,b in zip(times,times[1:])]
    return dict(path=str(output), pid=app.process.pid, hwnd=app.hwnd, dpi=u.GetDpiForWindow(app.hwnd),
        bounds=rect, frames=len(times), capture_fps=fps, elapsed=times[-1],
        capture_interval_p95_ms=sorted(gaps)[round(.95*(len(gaps)-1))], max_interval_ms=max(gaps),
        limits='Native BitBlt crop at 30 fps; capture cadence is not GPU presentation cadence.')


def run(exe, out, seconds, skip_record=False, capture_only=False):
    out.mkdir(parents=True, exist_ok=False)
    report = dict(exe=str(exe), exe_sha256=hashlib.sha256(exe.read_bytes()).hexdigest(), checks=[], captures=[],
        limits='Owned native previews and synthetic download snapshots; no real network transfer, macOS, native high-DPI monitor or full occlusion detection proof.')
    def check(name, condition, observed):
        report['checks'].append(dict(name=name, passed=bool(condition), observed=observed))
        print(('PASS: ' if condition else 'FAIL: ')+name, flush=True)
        if not condition:
            raise AssertionError(name)
    # A small no-activate backdrop affects only the owned capture region, never the cursor.
    u.CreateWindowExW.argtypes = [w.DWORD,w.LPCWSTR,w.LPCWSTR,w.DWORD,c.c_int,c.c_int,c.c_int,c.c_int,w.HWND,w.HMENU,w.HINSTANCE,c.c_void_p]
    u.CreateWindowExW.restype = w.HWND
    u.ShowWindow.argtypes = [w.HWND,c.c_int]
    backdrop = u.CreateWindowExW(0x08000088,'STATIC','Ameow Mascot capture',0x90000006,480,280,260,260,None,None,None,None)
    if not backdrop:
        raise RuntimeError('无法创建本轮局部录像背景')
    u.UpdateWindow.argtypes = [w.HWND]
    u.UpdateWindow(backdrop)
    app = None
    try:
        app = App(exe, out/'preview')
        for night, theme in ([] if skip_record else [(False,'light'),(True,'night')]):
            app.select(night=night)
            u.SetWindowPos(backdrop,w.HWND(-1),0,0,0,0,0x13)
            u.UpdateWindow(backdrop)
            u.SetWindowPos(app.hwnd,w.HWND(-1),0,0,0,0,0x13)
            time.sleep(.1)
            capture = record(app, out/f'{theme}-native.mp4', seconds)
            report['captures'].append(capture)
            m = app.latest('mascot')
            check(theme+' native Compact is 60 logical px plus gutters', capture['bounds'][2]-capture['bounds'][0] == round(80*capture['dpi']/96), capture)
            check(theme+' theme ACK reaches actual native drawing', m.get('night') == night and m.get('visible'), m)
        if not skip_record:
            active = [x for x in rows(app.telemetry) if x.get('type') == 'mascot' and x.get('raster_us',0)>0]
            check('native motion contains open, closed, gaze and ear poses',
                any(x['blink']>.99 for x in active) and any(x['blink']==0 for x in active) and any(abs(x['gaze'][0])>.5 for x in active) and any(abs(x['ears'][0])>.02 for x in active), len(active))
            report['raster'] = dict(samples=len(active), median_us=statistics.median(x['raster_us'] for x in active),
                p95_us=sorted(x['raster_us'] for x in active)[round(.95*(len(active)-1))], max_us=max(x['raster_us'] for x in active))
        if capture_only:
            return
        app.select(night=True, reduced=True)
        time.sleep(.6)
        m = app.latest('mascot')
        check('reduced motion has a resting pose and no Mascot wake', m.get('delay') is None and m.get('blink')==0 and m.get('gaze')==[0,0] and m.get('raster_us')==0, m)
        app.select(night=True)
        before = wait_for(lambda: (m if (m:=app.latest('mascot')).get('blink',0)>.15 else None), seconds=8)
        u.ShowWindow(app.hwnd,0)
        time.sleep(.4)
        hidden = app.latest('mascot')
        time.sleep(.4)
        hidden2 = app.latest('mascot')
        # GPUI may stop drawing a hidden window entirely; its last telemetry row
        # then describes the last visible frame, rather than a new hidden frame.
        hidden_rows = [x for x in rows(app.telemetry) if x.get('type')=='mascot' and x.get('ms',0)>hidden['ms']]
        check('hidden native window produces no ongoing Mascot frames', not u.IsWindowVisible(app.hwnd) and
            (not hidden_rows or all(not x['visible'] and x['delay'] is None for x in hidden_rows)),
            dict(last=hidden2, frames_after_hide=len(hidden_rows)))
        u.ShowWindow(app.hwnd,4)
        time.sleep(.5)
        resumed = [x for x in rows(app.telemetry) if x.get('type')=='mascot' and x.get('visible') and x.get('ms',0)>hidden2['ms']]
        check('first shown pose continues the last visible pose', bool(resumed) and
            all(resumed[0][k] == hidden2[k] for k in ['blink','gaze','head','ears']), dict(before=hidden2, first=resumed[0] if resumed else None))
        check('shown native Compact resumes animation', app.latest('mascot').get('visible') and app.latest('mascot').get('delay') is not None, app.latest('mascot'))
        app.select('full.downloading')
        m = app.latest('mascot')
        check('Full stops Mascot wake immediately', m.get('delay') is None and not m.get('visible'), m)
        app.close(); app=None
        app = App(exe, out/'download-fixture', fixture=True)
        wait_for(lambda: app.latest('window').get('fullness') == 0, seconds=8)
        wait_for(lambda: app.latest('mascot').get('blink',0)>.1, seconds=8)
        prior = app.latest('window')['ms']
        app.write(event='fifo')
        opened = wait_for(lambda: (x if (x:=app.latest('window')).get('target_full') else None), seconds=2)
        check('active download snapshot expands Full during blink', opened['ms']-prior < 250, dict(before_ms=prior, first_opened=opened))
        wait_for(lambda: app.latest('window').get('fullness') == 1, seconds=3)
        check('download Full has no Mascot wake', app.latest('mascot').get('delay') is None, app.latest('mascot'))
        full_rect = bounds(app.hwnd)
        app.write(event='layout-success')
        report['captures'].append(record(app,out/'collapse-native.mp4',3,region=full_rect))
        wait_for(lambda: app.latest('window').get('fullness') == 0, seconds=8)
        check('terminal hold follows existing return to Compact', app.latest('mascot').get('visible'), app.latest('window'))
    finally:
        if app:
            app.close()
        if backdrop:
            u.DestroyWindow(backdrop)
        (out/'receipt.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--exe',type=Path,default=Path('target/debug/ameow.exe'))
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--seconds',type=float,default=35)
    parser.add_argument('--skip-record',action='store_true')
    parser.add_argument('--capture-only',action='store_true')
    args=parser.parse_args()
    run(args.exe.resolve(),args.output.resolve(),args.seconds,args.skip_record,args.capture_only)
