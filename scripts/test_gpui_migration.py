"""Owned-process Windows regression for the GPUI engine and product controls.

Uses the preview transport, real mouse/keyboard input and native window facts.
Never launches the production coordinator, changes display settings or touches
the user's startup registration. Requires the existing Pillow/Tk environment.
"""
import argparse
import ctypes as c
from ctypes import wintypes as w
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time
import tkinter as tk
from PIL import ImageChops

from repair_a_runtime import CropCapture
from windows_validate import u


def owned_windows(pid):
    found = {}
    @c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
    def visit(hwnd, _):
        owner = w.DWORD()
        u.GetWindowThreadProcessId(hwnd, c.byref(owner))
        if owner.value == pid and u.IsWindowVisible(hwnd):
            text = c.create_unicode_buffer(256)
            u.GetWindowTextW(hwnd, text, 256)
            found[text.value] = hwnd
        return True
    u.EnumWindows(visit, 0)
    return found


def bounds(hwnd):
    r = w.RECT()
    if not u.GetWindowRect(hwnd, c.byref(r)):
        raise RuntimeError('无法读取本轮窗口边界')
    return [r.left, r.top, r.right, r.bottom]


def wait_for(predicate, seconds=10):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(.025)
    raise TimeoutError('等待本轮原生行为超时')


def key(code, shift=False):
    if shift:
        u.keybd_event(0x10, 0, 0, 0)
    u.keybd_event(code, 0, 0, 0)
    time.sleep(.025)
    u.keybd_event(code, 0, 2, 0)
    if shift:
        u.keybd_event(0x10, 0, 2, 0)
    time.sleep(.15)


def run(exe, out):
    out.mkdir(parents=True, exist_ok=False)
    report = dict(exe=str(exe.resolve()), exe_sha256=hashlib.sha256(exe.read_bytes()).hexdigest(),
                  source_head=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
                  checks=[], limits='Preview fixtures; one actual desktop DPI. No network, persisted settings, system tray or update/restart claim.')
    def check(name, condition, observed):
        report['checks'].append(dict(name=name, passed=bool(condition), observed=observed))
        print(('PASS' if condition else 'FAIL') + ': ' + name, flush=True)
        if not condition:
            raise AssertionError(name)
    root = tk.Tk()
    root.title('Ameow #32 owned regression backdrop')
    root.overrideredirect(True)
    root.configure(background='#e8e8e8')
    root.geometry(f'{u.GetSystemMetrics(0)}x{u.GetSystemMetrics(1)}+0+0')
    root.update()
    original = w.POINT()
    u.GetCursorPos(c.byref(original))
    process = None
    try:
        u.SetForegroundWindow(root.winfo_id())
        u.SetCursorPos(150, 90)
        time.sleep(.15)
        foreground = u.GetForegroundWindow()
        with tempfile.TemporaryDirectory(prefix='ameow-kit-native-') as temporary, (out/'stderr.log').open('w', encoding='utf-8') as log:
            control = Path(temporary)/'control.json'
            receipt = control.with_suffix('.ack.json')
            command = [str(exe.resolve()), '--preview', '--preview-scene', 'compact.idle',
                       '--preview-control', str(control), '--reduced', '--hover', 'off',
                       '--measure', str((out/'frames.jsonl').resolve()), '--exit-after-ms', '60000']
            process = subprocess.Popen(command, creationflags=subprocess.CREATE_NO_WINDOW, stdout=log, stderr=log)
            report.update(pid=process.pid, command=command)
            main = wait_for(lambda: owned_windows(process.pid).get('Ameow'))
            time.sleep(.35)
            check('first show leaves foreground unchanged', u.GetForegroundWindow() == foreground,
                  dict(before=foreground, after=u.GetForegroundWindow(), main=main))
            u.GetWindowLongPtrW.argtypes = [w.HWND, c.c_int]
            u.GetWindowLongPtrW.restype = c.c_ssize_t
            style = u.GetWindowLongPtrW(main, -16)
            extended = u.GetWindowLongPtrW(main, -20)
            check('floating HWND retains popup and natural TOPMOST', style & 0x80000000 and extended & 8, dict(style=style, exstyle=extended))
            report['dpi'] = u.GetDpiForWindow(main)
            scale = report['dpi']/96
            compact = bounds(main)
            step = 0
            def scene(name):
                nonlocal step
                step += 1
                pending = control.with_suffix('.tmp')
                pending.write_text(json.dumps(dict(step=step, scene=name)), encoding='utf-8')
                pending.replace(control)
                def accepted():
                    if process.poll() is not None:
                        raise RuntimeError(f'预览进程退出：{process.returncode}')
                    try:
                        ack = json.loads(receipt.read_text(encoding='utf-8'))
                    except (OSError, ValueError):
                        return False
                    if ack.get('step') != step or ack.get('pid') != process.pid:
                        return False
                    if ack.get('error') or ack.get('scene') != name:
                        raise RuntimeError(str(ack))
                    return ack
                wait_for(accepted)
                time.sleep(.5)
            scene('full.downloading')
            full = bounds(main)
            check('Compact to Full changes native bounds', full[2]-full[0] > compact[2]-compact[0]+80*scale, dict(compact=compact, full=full))
            scene('compact.idle')
            small = bounds(main)
            check('Full to Compact restores native size', abs((small[2]-small[0])-(compact[2]-compact[0])) <= 2, small)
            scene('settings.general')
            settings = wait_for(lambda: next((h for t,h in owned_windows(process.pid).items() if 'Settings' in t or '设置' in t), None))
            before = bounds(settings)
            u.SetForegroundWindow(settings)
            x, y = before[0]+260*scale, before[1]+14*scale
            u.SetCursorPos(round(x), round(y))
            u.mouse_event(2, 0, 0, 0, 0)
            time.sleep(.1)
            for i in range(1, 9):
                u.SetCursorPos(round(x+80*scale*i/8), round(y+40*scale*i/8))
                time.sleep(.035)
            u.mouse_event(4, 0, 0, 0, 0)
            time.sleep(.3)
            after = bounds(settings)
            check('settings titlebar supports real mouse drag', abs(after[0]-before[0]) > 30*scale and abs(after[1]-before[1]) > 15*scale, dict(before=before, after=after))
            # The production theme trigger is shared with the preview; it must
            # respond once per Enter, retain its focused handle, and close on Esc.
            u.SetCursorPos(round(after[0]+460*scale), round(after[1]+172*scale))
            u.mouse_event(2,0,0,0,0); u.mouse_event(4,0,0,0,0)
            time.sleep(.2)
            key(0x1B)
            check('Escape dismisses select without closing settings', settings in owned_windows(process.pid).values(), owned_windows(process.pid))
            def shot():
                crop = CropCapture(bounds(settings))
                try:
                    return crop.grab()
                finally:
                    crop.close()
            closed = shot()
            key(0x0D)
            time.sleep(.15)
            opened = shot()
            opened.save(out/'settings-keyboard-menu.png')
            area = tuple(round(v*scale) for v in (400, 196, 550, 280))
            changed = sum(max(p) > 12 for p in ImageChops.difference(closed, opened).crop(area).get_flattened_data())
            check('one Enter visibly opens theme options', changed > 250*scale*scale, dict(changed_menu_pixels=changed))
            key(0x1B)
            key(0x20)
            changed = sum(max(p) > 12 for p in ImageChops.difference(closed, shot()).crop(area).get_flattened_data())
            check('one Space visibly opens theme options', changed > 250*scale*scale, dict(changed_menu_pixels=changed))
            key(0x1B); key(0x1B)
            wait_for(lambda: settings not in owned_windows(process.pid).values())
            check('Escape closes settings after popup dismissal', True, owned_windows(process.pid))
            check('closing settings keeps main alive', process.poll() is None and main in owned_windows(process.pid).values(), owned_windows(process.pid))
            scene('tray.mixed')
            tray = wait_for(lambda: owned_windows(process.pid).get('Ameow · Tray'))
            u.SetForegroundWindow(tray)
            key(0x1B)
            wait_for(lambda: tray not in owned_windows(process.pid).values())
            check('tray popup Escape closes only owned popup', process.poll() is None, owned_windows(process.pid))
            step += 1
            pending = control.with_suffix('.tmp')
            pending.write_text(json.dumps(dict(step=step, quit=True)), encoding='utf-8')
            pending.replace(control)
            process.wait(timeout=10)
            check('preview quit settles process cleanly', process.returncode == 0, process.returncode)
    finally:
        if process and process.poll() is None:
            process.kill(); process.wait(timeout=10)
        u.SetCursorPos(original.x, original.y)
        root.destroy()
        (out/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.exe, args.output)
