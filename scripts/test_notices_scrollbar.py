"""Native notices reader regression; only messages an owned preview HWND."""
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
    report = dict(exe_sha256=hashlib.sha256(exe.read_bytes()).hexdigest(), checks=[],
                  limits="Native preview; no global input, activation, z-order or OS changes.")

    def check(name, condition):
        report['checks'].append(dict(name=name, passed=bool(condition)))
        print(('PASS' if condition else 'FAIL')+': '+name, flush=True)
        assert condition, name

    def mouse(kind, x, y, flags=0):
        x, y = round(x*scale), round(y*scale)
        if not u.PostMessageW(hwnd, kind, flags, x | (y << 16)):
            raise c.WinError(c.get_last_error())

    def key(vk):
        u.PostMessageW(hwnd, 0x100, vk, 1); u.PostMessageW(hwnd, 0x101, vk, 0xc0000001)
        time.sleep(.2)

    def grab(name):
        rect = w.RECT(); origin = w.POINT()
        u.GetClientRect(hwnd, c.byref(rect)); u.ClientToScreen(hwnd, c.byref(origin))
        capture = CropCapture((origin.x, origin.y, origin.x+rect.right, origin.y+rect.bottom))
        try:
            image = capture.grab()
        finally:
            capture.close()
        if scale != 1:
            image = image.resize((round(image.width/scale), round(image.height/scale)))
        image.crop((168,130,540,407)).save(output/(name+'.png'))
        background = image.getpixel((529,200))
        rows = [y for y in range(136,404) if any(
            max(abs(image.getpixel((x,y))[i]-background[i]) for i in range(3)) > 22
            for x in range(531,537))]
        assert rows, '未检测到滚动条滑块，请检查预览是否被遮挡'
        return image, (min(rows)+max(rows))/2

    def drag(y, target):
        mouse(0x200,534,y); time.sleep(.05)
        mouse(0x201,534,y,1); time.sleep(.05)
        mouse(0x200,534,target,1); time.sleep(.2)
        mouse(0x202,534,target); time.sleep(.25)
        mouse(0x200,300,250); time.sleep(.1)

    try:
        with Session(exe, reduced=False) as session:
            report['pid'] = session.process.pid
            for night in [False, True]:
                theme = 'dark' if night else 'light'
                session.select('settings.third-party-licenses', night=night, settle=.5)
                hwnd = next(h for title, h in owned_windows(session.process.pid).items()
                            if 'Settings' in title or '设置' in title)
                scale = u.GetDpiForWindow(hwnd)/96
                mouse(0x200,300,200); mouse(0x201,300,200,1); mouse(0x202,300,200)
                key(0x24)  # Home
                top, top_y = grab(theme+'-top')
                point = w.POINT(round(300*scale),round(200*scale))
                u.ClientToScreen(hwnd,c.byref(point))
                for _ in range(2):
                    u.PostMessageW(hwnd,0x20a,((-120*200)&0xffff)<<16,point.x | (point.y << 16))
                    time.sleep(.15)
                scrolled, wheel_y = grab(theme+'-wheel')
                check(theme+': wheel scrolls the text', ImageChops.difference(
                    top.crop((180,140,520,399)),scrolled.crop((180,140,520,399))).getbbox() is not None)
                check(theme+': thumb follows wheel position', wheel_y > top_y+2)
                key(0x23)  # End
                _, bottom_y = grab(theme+'-end')
                check(theme+': End puts thumb at bottom', bottom_y > 384)
                key(0x24)
                _, home_y = grab(theme+'-home')
                check(theme+': Home restores thumb to top', abs(home_y-top_y) <= 1)
                drag(home_y,270)
                middle, middle_y = grab(theme+'-drag-middle')
                check(theme+': dragging moves thumb and text', 235 < middle_y < 305 and
                      ImageChops.difference(top.crop((180,140,520,399)),middle.crop((180,140,520,399))).getbbox() is not None)
                drag(middle_y,403)
                _, bottom_y = grab(theme+'-drag-bottom')
                check(theme+': dragging reaches bottom', bottom_y > 384)
                drag(bottom_y,137)
                _, restored_y = grab(theme+'-drag-top')
                check(theme+': dragging returns to top', abs(restored_y-top_y) <= 1)
    finally:
        (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    run(args.exe.resolve(),args.output.resolve())
