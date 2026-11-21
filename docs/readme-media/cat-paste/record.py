"""Record two synthetic Gallery demonstrations on an explicitly available desktop.

Requires permission for an owned visible preview and neutral 320px backdrop. Does
not use mouse input, clipboard, accounts, services, real queues or downloads.
"""
import argparse
import ctypes as c
from ctypes import wintypes as w
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts'))
from native_capture import CropCapture, bounds, owned_windows, u
from gallery import OwnedJob

OUT = ROOT / 'docs/images/readme'


def wait_for(predicate, process, timeout=15):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = predicate()
        if value:
            return value
        if process.poll() is not None:
            raise RuntimeError(f'Preview exited with {process.returncode}')
        time.sleep(.025)
    raise TimeoutError('Preview did not become ready')


EXPECTED_SHA = 'E8F2F4BCBCADD40E63B8C1607876B0D0C430D9B5E4466D05452D93776825FAF8'

def sha(exe):
    return hashlib.sha256(exe.read_bytes()).hexdigest().upper()

def overlaps(a, b):
    return max(a[0], b[0]) < min(a[2], b[2]) and max(a[1], b[1]) < min(a[3], b[3])

def check_stack(capture_rect, backdrop, preview):
    """Refuse visible windows intersecting the crop above our backdrop."""
    found_backdrop = False
    overlaps_found = []
    callback_type = c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
    @callback_type
    def visit(hwnd, _):
        nonlocal found_backdrop
        if hwnd == backdrop:
            found_backdrop = True
            return False
        if hwnd == preview or not u.IsWindowVisible(hwnd):
            return True
        rect = w.RECT()
        if not u.GetWindowRect(hwnd, c.byref(rect)):
            overlaps_found.append((hwnd, 'unreadable bounds'))
            return False
        window_rect = (rect.left, rect.top, rect.right, rect.bottom)
        if rect.right > rect.left and rect.bottom > rect.top and overlaps(capture_rect, window_rect):
            overlaps_found.append((hwnd, window_rect))
            return False
        return True
    if not u.EnumWindows(visit, 0) and not found_backdrop and not overlaps_found:
        raise c.WinError()
    if overlaps_found or not found_backdrop:
        raise RuntimeError(f'Capture region obscured or backdrop missing: {overlaps_found}')

def run(exe, work):
    if sha(exe) != EXPECTED_SHA:
        raise RuntimeError('EXE hash differs from the reviewed capture plan')
    control = work / 'control.json'
    log = open(work / 'preview-stderr.log', 'w', encoding='utf-8')
    proc = subprocess.Popen([str(exe), '--preview', '--preview-scene', 'full.idle',
                             '--preview-control', str(control), '--exit-after-ms', '55000'], cwd=ROOT,
                            creationflags=subprocess.CREATE_NO_WINDOW, stdout=log, stderr=log)
    watchdog = threading.Timer(55, lambda: proc.terminate() if proc.poll() is None else None)
    watchdog.daemon = True
    watchdog.start()
    job = None
    backdrop = None
    capture = None
    try:
        job = OwnedJob(proc)
        hwnd = wait_for(lambda: owned_windows(proc.pid).get('Ameow'), proc)
        time.sleep(1.5)
        rect = bounds(hwnd)
        # Full-size window is <=228px at 96 DPI, plus a quiet margin.
        dpi = u.GetDpiForWindow(hwnd)
        size = round(320 * dpi / 96)
        left = rect[0] - round(35 * dpi / 96)
        top = rect[1] - round(35 * dpi / 96)
        screen = (left, top, left + size, top + size)
        if left < 0 or top < 0 or screen[2] > u.GetSystemMetrics(0) or screen[3] > u.GetSystemMetrics(1):
            raise RuntimeError(f'Owned preview is too close to the screen edge: {screen}')
        u.CreateWindowExW.argtypes = [w.DWORD, w.LPCWSTR, w.LPCWSTR, w.DWORD, c.c_int, c.c_int,
                                     c.c_int, c.c_int, w.HWND, w.HMENU, w.HINSTANCE, c.c_void_p]
        u.CreateWindowExW.restype = w.HWND
        u.DestroyWindow.argtypes = [w.HWND]
        u.UpdateWindow.argtypes = [w.HWND]
        backdrop = u.CreateWindowExW(0x08000088, 'STATIC', 'Ameow README capture backdrop',
                                     0x90000006, left, top, size, size, None, None, None, None)
        if not backdrop:
            raise c.WinError()
        (work / 'live.json').write_text(json.dumps({'controller_pid': __import__('os').getpid(), 'preview_pid': proc.pid,
            'backdrop_hwnd': backdrop, 'visible_start_utc': datetime.now(timezone.utc).isoformat()}), encoding='utf-8')
        u.SetWindowPos(backdrop, w.HWND(-1), 0, 0, 0, 0, 0x13)
        u.UpdateWindow(backdrop)
        u.SetWindowPos(hwnd, w.HWND(-1), 0, 0, 0, 0, 0x13)
        time.sleep(.4)
        capture = CropCapture(screen)
        step = 0

        def select(scene):
            nonlocal step
            step += 1
            pending = control.with_suffix('.tmp')
            pending.write_text(json.dumps(dict(step=step, scene=scene, night=False, reduced=False)), encoding='utf-8')
            pending.replace(control)

        def accepted(scene):
            def check():
                try:
                    ack = json.loads(control.with_suffix('.ack.json').read_text(encoding='utf-8'))
                    return ack.get('step') == step and ack.get('scene') == scene and not ack.get('error')
                except (OSError, ValueError):
                    return False
            wait_for(check, proc)

        def record(name, first, actions, duration):
            select(first)
            accepted(first)
            time.sleep(.8)
            frames = []
            elapsed = []
            pending = list(actions)
            start = time.perf_counter()
            for index in range(round(duration * 20)):
                deadline = start + index / 20
                time.sleep(max(0, deadline - time.perf_counter()))
                t = time.perf_counter() - start
                while pending and t >= pending[0][0]:
                    select(pending.pop(0)[1])
                check_stack(screen, backdrop, hwnd)
                frame = capture.grab()
                check_stack(screen, backdrop, hwnd)
                # Keep exact product pixels, scaling only the complete capture to 480px.
                frame = frame.resize((480, 480), Image.Resampling.LANCZOS)
                if name == 'desktop-cat':
                    # An overlaid pointer describes the simulated scene changes; it never moves the system cursor.
                    k = min(1., max(0., (t - .9) / .8))
                    k = k * k * (3. - 2. * k)
                    leave = min(1., max(0., (t - 3.4) / .5))
                    x = 315 + (110 - 315) * k + 205 * leave
                    y = 225 + (115 - 225) * k + 110 * leave
                    points = [(x, y), (x, y + 24), (x + 6, y + 18), (x + 10, y + 27),
                              (x + 14, y + 25), (x + 10, y + 16), (x + 19, y + 16)]
                    ImageDraw.Draw(frame).polygon(points, fill='white', outline='black', width=2)
                elif name == 'paste-link' and 1.0 <= t < 1.7:
                    # This is an instructional key prompt, not captured keyboard input.
                    draw = ImageDraw.Draw(frame)
                    draw.rounded_rectangle((327, 366, 429, 402), radius=7, fill='#ffffff', outline='#b8bac0', width=1)
                    draw.text((342, 373), 'Ctrl + V', font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 18), fill='#303238')
                frames.append(frame)
                elapsed.append(t)
            if pending:
                raise RuntimeError('Missing capture action')
            return frames, {'frames': len(frames), 'duration': duration,
                            'capture_seconds': elapsed[-1], 'scenes': [first] + [x[1] for x in actions]}

        cat_frames, cat = record('desktop-cat', 'compact.idle', [(1.7, 'full.mascot-exit'),
                                                    (3.9, 'compact.entrance')], 6.7)
        paste_frames, paste = record('paste-link', 'full.idle', [(1.7, 'full.resolving'),
                                                   (3.0, 'full.downloading')], 6.2)
    finally:
        if capture: capture.close()
        if backdrop: u.DestroyWindow(backdrop)
        if proc.poll() is None:
            # The preview owns this control path and PID; never close arbitrary HWNDs.
            pending = control.with_suffix('.tmp')
            pending.write_text(json.dumps(dict(step=2**31 - 1, quit=True)), encoding='utf-8')
            pending.replace(control)
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.terminate()
                proc.wait(timeout=5)
        if job: job.close()
        watchdog.cancel()
        log.close()
    # Encoding starts only after the owned preview and backdrop have closed.
    for name, frames in [('desktop-cat', cat_frames), ('paste-link', paste_frames)]:
        frames[0].save(work / f'{name}-raw.gif', save_all=True, append_images=frames[1:],
                       duration=50, loop=0, optimize=True, disposal=2)
    # Raw captures require visual review before choosing any editing treatment.
    result = {'exe': str(exe), 'sha256': sha(exe), 'dpi': dpi, 'bounds': screen, 'cat': cat, 'paste': paste}
    (work / 'capture.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--exe', type=Path, required=True)
    parser.add_argument('--worker', type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    exe = args.exe.resolve()
    if sha(exe) != EXPECTED_SHA:
        raise SystemExit('EXE hash differs from the reviewed capture plan')
    if args.worker:
        gate = args.worker / 'supervisor-ready'
        deadline = time.monotonic() + 5
        while not gate.exists():
            if time.monotonic() >= deadline:
                raise SystemExit('Supervisor did not attach the controller to its Job')
            time.sleep(.025)
        run(exe, args.worker.resolve())
    else:
        work = ROOT / 'docs/readme-media/.work/cat-paste' / uuid.uuid4().hex
        work.mkdir(parents=True)
        with (work / 'controller.log').open('w', encoding='utf-8') as log:
            child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--exe', str(exe),
                                      '--worker', str(work)], cwd=ROOT,
                                     creationflags=subprocess.CREATE_NO_WINDOW, stdout=log, stderr=log)
            try:
                job = OwnedJob(child)
                (work / 'supervisor-ready').write_text('ready', encoding='utf-8')
            except BaseException:
                child.terminate()
                child.wait(timeout=5)
                raise
            try:
                try:
                    code = child.wait(timeout=60)
                    status = 'complete' if code == 0 else 'failed'
                except subprocess.TimeoutExpired:
                    status = 'timeout'
                    job.close()
                    code = child.wait(timeout=5)
            finally:
                job.close()
            receipt = {'status': status, 'exit_code': code, 'controller_pid': child.pid,
                       'exe': str(exe), 'exe_sha256': EXPECTED_SHA, 'hard_timeout_seconds': 60}
            (work / 'receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
            print(json.dumps({'work': str(work), **receipt}, indent=2))
            if status != 'complete': raise SystemExit(1)
