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
            for name in ['full.downloading','compact.badge','full.failure','full.idle']:
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


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    run(args.exe.resolve(),args.output.resolve())
