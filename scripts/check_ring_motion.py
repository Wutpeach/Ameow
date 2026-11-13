"""Native ring regression: rotating arcs leave a uniform track; motion can stop and resume.

Shows only isolated preview windows for about 15 seconds. Requires Windows/Pillow.
"""
import argparse
import ctypes as c
from ctypes import wintypes as w
import hashlib
import json
import math
from pathlib import Path
import time

from gallery import Session
from preview_capture import presentation, u
from repair_a_runtime import CropCapture


def frames(session, count):
    handles = []

    @c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
    def visit(hwnd, _):
        owner = w.DWORD()
        u.GetWindowThreadProcessId(hwnd, c.byref(owner))
        if owner.value == session.process.pid and u.IsWindowVisible(hwnd):
            handles.append(hwnd)
        return True

    u.EnumWindows(visit, 0)
    assert len(handles) == 1, f'Expected one owned preview, got {handles}'
    hwnd = handles[0]
    rect = w.RECT()
    assert u.GetWindowRect(hwnd, c.byref(rect))
    scale = u.GetDpiForWindow(hwnd) / 96
    images = []
    with presentation(hwnd, True):
        crop = CropCapture([rect.left, rect.top, rect.right, rect.bottom])
        try:
            start = time.perf_counter()
            for i in range(count):
                time.sleep(max(0, start + i * .06 - time.perf_counter()))
                images.append(crop.grab())
        finally:
            crop.close()
    return images, scale


def check_track(images, scale, night):
    samples = []
    for image in images:
        # Sample the track at twelve o'clock and either side, when the moving arc is absent.
        left, top, right = [image.getpixel((
            round(image.width / 2 + 22.5 * scale * math.sin(angle)),
            round((100 - 22.5 * math.cos(angle)) * scale),
        ))[0] for angle in [-.28, 0, .28]]
        samples.append((left, top, right))
    # Derive the track level from the capture, including either theme's glow.
    track_level = (min if night else max)(value for left, _, right in samples for value in [left, right])
    excess = []
    for left, top, right in samples:
        if not night and min(left, right) >= track_level - 9:
            excess.append(min(left, right) - top)
        if night and max(left, right) <= track_level + 9:
            excess.append(top - max(left, right))
    assert len(excess) >= 3, 'The arc did not expose the top of the track long enough'
    assert max(excess) <= 6, f"Fixed dot at twelve o'clock: excess contrast {max(excess)}/255"
    return dict(gap_frames=len(excess), excess_contrast=max(excess))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    report = dict(exe=str(args.exe.resolve()), sha256=hashlib.sha256(args.exe.read_bytes()).hexdigest(), checks=[])
    scene = 'full.resolving'
    with Session(args.exe, reduced=False) as session:
        for night in [False, True]:
            session.reduced = False
            ack = session.select(scene, night=night, settle=.8)
            images, scale = frames(session, 50)
            distinct = len({image.tobytes() for image in images})
            assert distinct >= 20, f'{scene}: animation is not moving'
            track = check_track(images, scale, night)
            name = f'{scene}-{"dark" if night else "light"}'
            images[0].save(args.output/f'{name}.gif', save_all=True, append_images=images[1:], duration=60, loop=0)
            session.reduced = True
            session.select(scene, night=night, settle=.8)
            still, _ = frames(session, 10)
            assert len({image.tobytes() for image in still}) == 1, f'{scene}: motion did not stop'
            session.reduced = False
            session.select(scene, night=night, settle=.8)
            resumed, _ = frames(session, 10)
            assert len({image.tobytes() for image in resumed}) >= 5, f'{scene}: motion did not resume'
            result = dict(scene=scene, night=night, ack={k: v for k, v in ack.items() if k != 'catalog'}, distinct_frames=distinct, **track, stop_resume='pass')
            report['checks'].append(result)
            print(json.dumps(result), flush=True)
    (args.output/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
