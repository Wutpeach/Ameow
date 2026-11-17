"""Native hover-hint regression, using only owned preview HWND messages."""
import argparse
import ctypes as c
from ctypes import wintypes as w
import hashlib
import json
from pathlib import Path
import time

from PIL import ImageChops
from gallery import Session
from repair_a_runtime import CropCapture
from test_gpui_migration import owned_windows, u


def run(exe, output):
    output.mkdir(parents=True, exist_ok=False)
    u.PostMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
    u.GetClientRect.argtypes = [w.HWND, c.POINTER(w.RECT)]
    u.ClientToScreen.argtypes = [w.HWND, c.POINTER(w.POINT)]
    report = dict(sha256=hashlib.sha256(exe.read_bytes()).hexdigest(), checks=[],
                  limits='Owned Windows previews; no activation, global input or live clipboard writes.')
    foreground = u.GetForegroundWindow()
    cursor = w.POINT(); u.GetCursorPos(c.byref(cursor))

    def check(name, passed, **facts):
        report['checks'].append(dict(name=name, passed=bool(passed), **facts))
        print(('PASS ' if passed else 'FAIL ')+name, flush=True)
        assert passed, (name, facts)

    def mouse(message, x, y, flags=0):
        scale = u.GetDpiForWindow(hwnd)/96
        x, y = round(x*scale), round(y*scale)
        assert u.PostMessageW(hwnd, message, flags, x | (y << 16))

    def hover(x, y):
        mouse(0x200, x, y)

    def key(vk):
        u.PostMessageW(hwnd, 0x100, vk, 1)
        u.PostMessageW(hwnd, 0x101, vk, 0xc0000001)

    def grab(name):
        rect = w.RECT(); origin = w.POINT()
        u.GetClientRect(hwnd, c.byref(rect)); u.ClientToScreen(hwnd, c.byref(origin))
        capture = CropCapture((origin.x, origin.y, origin.x+rect.right, origin.y+rect.bottom))
        try:
            im = capture.grab()
        finally:
            capture.close()
        scale = u.GetDpiForWindow(hwnd)/96
        if scale != 1:
            im = im.resize((round(im.width/scale), round(im.height/scale)))
        im.save(output/(name+'.png'))
        return im

    def difference(a, b):
        return ImageChops.difference(a.convert('RGB'), b.convert('RGB')).point(
            lambda value: 255 if value > 12 else 0).getbbox()

    scenarios = [('settings.download','settings',(518,114),'above'),
                 ('full.app-conflict','main',(180,94),'above'),
                 ('tray.app-conflict','tray',(198,33),'below')]
    try:
      for night in [False, True]:
        theme = 'dark' if night else 'light'
        for scene, kind, (x,y), side in scenarios:
          with Session(exe, reduced=True) as session:
            try:
              session.select(scene, night=night, settle=.6)
              windows = owned_windows(session.process.pid)
              hwnd = next(h for title,h in windows.items() if
                  (title == 'Ameow' if kind == 'main' else 'Tray' in title if kind == 'tray'
                   else 'Settings' in title or '设置' in title))
              prefix = theme+'-'+scene
              if kind == 'main':
                  hover(38,188); time.sleep(.3)
              hover(x,y); time.sleep(.12)
              before = grab(prefix+'-before')
              time.sleep(.65); shown = grab(prefix+'-hint')
              bounds = difference(before, shown)
              check(prefix+': tooltip avoids cursor and prefers above', bounds is not None and
                    (bounds[3] < y-12 if side == 'above' else bounds[1] > y+12),
                    bounds=bounds, cursor=[x,y], expected=side)
              if kind == 'settings':
                  key(0x70); time.sleep(.12)  # F1 has no navigation action in this view.
                  dismissed = grab(prefix+'-key')
                  check(prefix+': keyboard input hides hint', difference(before.crop(bounds),dismissed.crop(bounds)) is None)
                  hover(300,200); time.sleep(.35); hover(x,y); time.sleep(.6)
                  reshown = grab(prefix+'-reshown')
                  check(prefix+': reenter shows hint', difference(before,reshown) is not None)
                  mouse(0x201,x,y,1); time.sleep(.05); mouse(0x202,x,y); time.sleep(.65)
                  pressed = grab(prefix+'-pressed')
                  check(prefix+': clicking hides hint during copy feedback',
                        difference(before.crop(bounds),pressed.crop(bounds)) is None)
                  check(prefix+': copy click still changes to check',
                        difference(before.crop((510,106,526,122)),pressed.crop((510,106,526,122))) is not None)
                  time.sleep(1.5)
                  hover(540,14); time.sleep(.12); no_close = grab(prefix+'-close-before')
                  time.sleep(.6); no_close_later = grab(prefix+'-close-after')
                  check(prefix+': obvious close has no tooltip',difference(no_close,no_close_later) is None)
                  hover(300,200); time.sleep(.35); hover(300,114); time.sleep(.12)
                  path = grab(prefix+'-path-before'); time.sleep(.6); path_later = grab(prefix+'-path-after')
                  check(prefix+': full visible path has no redundant hint',difference(path,path_later) is None)
              elif kind == 'main':
                  surface = (35,36,39) if night else (255,255,255)
                  def clear_hint_region(im):
                      return all(max(abs(pixel[i]-surface[i]) for i in range(3)) < 8
                                 for pixel in im.crop((152,44,206,72)).convert('RGB').get_flattened_data())
                  session.select('full.idle',night=night,settle=.65)
                  check(prefix+': removing trigger removes visible hint',clear_hint_region(grab(prefix+'-removed')))
                  session.select(scene,night=night,settle=.4)
                  hover(38,188); time.sleep(.25); hover(x,y); time.sleep(.08)
                  session.select('full.idle',night=night,settle=.65)
                  check(prefix+': removing trigger cancels pending hint',clear_hint_region(grab(prefix+'-pending-removed')))
            except BaseException:
              session.log.flush()
              (output/(theme+'-'+scene+'-stderr.log')).write_text(Path(session.log.name).read_text('utf-8'),'utf-8')
              raise
      after = w.POINT(); u.GetCursorPos(c.byref(after))
      check('foreground unchanged', u.GetForegroundWindow() == foreground)
      check('cursor unchanged', (after.x,after.y) == (cursor.x,cursor.y))
    finally:
      (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    run(args.exe.resolve(),args.output.resolve())
