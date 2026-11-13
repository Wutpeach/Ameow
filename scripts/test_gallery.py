"""Exercise real Gallery transport isolation, capture identity and scene reset."""
import argparse
import json
from pathlib import Path
import time

from PIL import Image, ImageChops
from gallery import Session, catalog, overview


def run(exe, output):
    output.mkdir(parents=True, exist_ok=False)
    scenes = catalog(exe)
    assert scenes and len({s['name'] for s in scenes}) == len(scenes)
    results = []
    def check(name, condition):
        results.append(dict(name=name, passed=bool(condition)))
        print(('PASS' if condition else 'FAIL')+': '+name, flush=True)
        assert condition, name
    try:
        with Session(exe, scenes) as first, Session(exe, scenes) as second:
            check('two previews have distinct PIDs and control paths', first.process.pid != second.process.pid and first.control != second.control)
            a = first.select('full.idle', settle=.8)
            first.capture(output/'idle-before.png')
            b = second.select('settings.theme-menu', night=True, settle=.8)
            second.capture(output/'settings-dark.png')
            for name in ['full.downloading','compact.idle','full.failure','full.idle']:
                a = first.select(name, settle=.8)
            first.capture(output/'idle-after.png')
            before = Image.open(output/'idle-before.png').convert('RGB')
            after = Image.open(output/'idle-after.png').convert('RGB')
            # Ignore transparent edges; the product indicator region must reset.
            roi = (45,45,180,180)
            difference = ImageChops.difference(before, after).crop(roi)
            check('empty scene retires previous painted job', max(max(p) for p in difference.get_flattened_data()) <= 2)
            unchanged = second.read_ack()
            check('switching one preview does not change another receipt', unchanged == b)
            second.capture(output/'settings-dark-again.png')
            metadata = json.loads((output/'settings-dark-again.json').read_text(encoding='utf-8'))
            check('capture preserves matching PID scene theme DPI and EXE identity', metadata['pid'] == second.process.pid and metadata['scene'] == 'settings.theme-menu' and metadata['receipt']['night'] and metadata['dpi'] > 0 and len(metadata['exe_sha256']) == 64)
            try:
                second.capture(output/'settings-dark-again.png')
            except FileExistsError:
                check('capture refuses to overwrite accepted evidence', True)
            else:
                check('capture refuses to overwrite accepted evidence', False)
            first.request(dict(scene='not-a-scene',night=False))
            until = time.monotonic()+5
            invalid = None
            while time.monotonic() < until:
                invalid = first.read_ack()
                if invalid: break
                time.sleep(.03)
            check('invalid scene returns error without changing selected scene', invalid and invalid['error'] and invalid['scene'] == 'full.idle')
            first.close()
            check('closing one session leaves the other alive', second.process.poll() is None)
        check('context exit settles the second preview', second.process.poll() == 0)
        entries = [dict(scene='full.idle',surface='full',theme='light',image='idle-after.png'),
                   dict(scene='settings.theme-menu',surface='settings',theme='dark',image='settings-dark.png')]
        overview(output, entries)
        check('overview links actual captures', (output/'index.html').is_file() and (output/'settings-dark-sheet-1.png').is_file())
    finally:
        (output/'report.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')


def run_select_toggle(exe, output):
    """Regression: one trigger press toggles once, including after mouse-up.

    Only message this Session's HWND; leave global input, foreground and z-order alone.
    """
    import ctypes as c
    from ctypes import wintypes as w
    import hashlib
    from repair_a_runtime import CropCapture
    from test_gpui_migration import owned_windows, u

    output.mkdir(parents=True, exist_ok=False)
    u.PostMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
    u.GetClientRect.argtypes = [w.HWND, c.POINTER(w.RECT)]
    u.ClientToScreen.argtypes = [w.HWND, c.POINTER(w.POINT)]
    report = dict(exe_sha256=hashlib.sha256(exe.read_bytes()).hexdigest(), checks=[],
                  limits='Owned Windows preview interactions; no persisted settings or OS changes.')

    def check(name, condition):
        report['checks'].append(dict(name=name, passed=bool(condition)))
        print(('PASS' if condition else 'FAIL')+': '+name, flush=True)
        assert condition, name

    def message(hwnd, kind, x, y, flags=0):
        if not u.PostMessageW(hwnd, kind, flags, round(x) | (round(y) << 16)):
            raise c.WinError(c.get_last_error())

    def click(hwnd, scale, x, y, settle=.24):
        x, y = round(x*scale), round(y*scale)
        message(hwnd, 0x200, x, y)
        message(hwnd, 0x201, x, y, 1)
        time.sleep(.025)
        message(hwnd, 0x202, x, y)
        time.sleep(settle)

    def image(hwnd, roi, scale):
        r = w.RECT(); origin = w.POINT()
        u.GetClientRect(hwnd, c.byref(r)); u.ClientToScreen(hwnd, c.byref(origin))
        crop = CropCapture((origin.x, origin.y, origin.x+r.right, origin.y+r.bottom))
        try:
            return crop.grab().crop(tuple(round(v*scale) for v in roi))
        finally:
            crop.close()

    def difference(a, b):
        return sum(max(pixel) > 12 for pixel in ImageChops.difference(a, b).get_flattened_data())

    try:
        with Session(exe, reduced=False) as session:
            report['pid'] = session.process.pid
            for name, scene, x, y, roi, night, reduced in [
                ('theme','settings.general',460,132,(364,158,540,260),False,False),
                ('language','settings.general',460,188,(364,214,540,316),False,False),
                ('tray','settings.general',460,244,(364,270,540,372),False,False),
                ('dark-theme','settings.general',460,132,(364,158,540,260),True,False),
                ('reduced-language','settings.general',460,188,(364,214,540,316),False,True),
                ('components','components.ready',490,64,(292,90,540,240),False,False),
                ('dark-components','components.ready',490,64,(292,90,540,240),True,False),
            ]:
                session.reduced = reduced
                session.select(scene, night=night, settle=.4)
                hwnd = next(h for title, h in owned_windows(session.process.pid).items()
                            if 'Settings' in title or '设置' in title)
                scale = u.GetDpiForWindow(hwnd)/96
                closed = image(hwnd, roi, scale)
                click(hwnd, scale, x, y); opened = image(hwnd, roi, scale)
                check(name+': first click opens', difference(closed, opened) > 500)
                click(hwnd, scale, x, y); second = image(hwnd, roi, scale)
                for state, frame in [('closed',closed),('open',opened),('second-click',second)]:
                    frame.save(output/f'{name}-{state}.png')
                check(name+': second click stays closed after release', difference(closed, second) <= 4)
                click(hwnd, scale, x, y)
                check(name+': third click reopens', difference(closed, image(hwnd, roi, scale)) > 500)
                click(hwnd, scale, x, y, settle=.025)
                click(hwnd, scale, x, y)
                check(name+': reopen during exit remains open', difference(closed, image(hwnd, roi, scale)) > 500)
                u.PostMessageW(hwnd, 0x100, 0x1b, 1); u.PostMessageW(hwnd, 0x101, 0x1b, 0xc0000001)
                time.sleep(.24)
                check(name+': Escape closes', difference(closed, image(hwnd, roi, scale)) <= 4)
                click(hwnd, scale, x, y)
                click(hwnd, scale, 250, 370)
                check(name+': outside click closes', difference(closed, image(hwnd, roi, scale)) <= 4)
    finally:
        (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--select-toggle',action='store_true',help='Only check settings dropdown toggle regression, without global input or activation')
    args = parser.parse_args()
    (run_select_toggle if args.select_toggle else run)(args.exe.resolve(),args.output.resolve())
