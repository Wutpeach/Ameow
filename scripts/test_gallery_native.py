"""Bounded native Gallery acceptance. Requires an idle desktop and psutil.

Does not run the scene matrix: completes the one-scene Menu group in both
themes, and cancels the full catalog after its first image. Uses owned PIDs only.
"""
import argparse
import ctypes as c
from ctypes import wintypes as w
import hashlib
import json
from pathlib import Path
import subprocess
import time

import psutil
from gallery import OwnedJob, catalog
from test_gpui_migration import owned_windows, wait_for
from windows_validate import u


def run(exe, out):
    out.mkdir(parents=True, exist_ok=False)
    captures = out/'captures'
    expected_all = len(catalog(exe))*2
    report = dict(exe=str(exe), exe_sha256=hashlib.sha256(exe.read_bytes()).hexdigest(),
                  checks=[], complete=False, scope='Gallery buttons via owned-HWND Win32 mouse messages, bounded cancellation and recovery; not physical input or a catalog matrix')
    original = w.POINT()
    u.GetCursorPos(c.byref(original))
    process = None
    job = None
    def check(name, observed):
        report['checks'].append(dict(name=name, passed=True, observed=observed))
        print('PASS: '+name, flush=True)
    def read(path):
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            return None
    try:
        with (out/'stderr.log').open('w', encoding='utf-8') as log:
            process = subprocess.Popen([str(exe),'--gallery','--gallery-output',str(captures)],
                creationflags=subprocess.CREATE_NO_WINDOW, stdout=log, stderr=log)
            job = OwnedJob(process)
            gallery = wait_for(lambda: owned_windows(process.pid).get('Ameow Gallery'))
            report.update(pid=process.pid, hwnd=gallery, dpi=u.GetDpiForWindow(gallery))
            scale = report['dpi']/96
            def click(x, y):
                position = (round(y*scale)<<16)|round(x*scale)
                for message,buttons in [(0x200,0),(0x201,1),(0x202,0)]:
                    if not u.PostMessageW(gallery,message,buttons,position):
                        raise RuntimeError('无法发送本轮窗口鼠标消息')
                time.sleep(.12)
            def preview():
                for child in psutil.Process(process.pid).children():
                    command = child.cmdline()
                    if '--preview-control' in command:
                        return child, Path(command[command.index('--preview-control')+1]).with_suffix('.ack.json')
            child, ack_path = wait_for(preview)
            def accepted(name, night, receipt=ack_path):
                ack = read(receipt)
                return ack if ack and ack.get('scene') == name and ack.get('night') == night else None
            wait_for(lambda: (ack if (ack:=accepted('compact.idle',False)) and ack['step'] > 0 else None)); time.sleep(.8)
            click(524,164)
            wait_for(lambda: accepted('compact.idle',True)); time.sleep(.8)
            check('dark switch receives the matching native preview ACK', accepted('compact.idle',True))
            click(70,358)
            wait_for(lambda: accepted('menu.root',True)); time.sleep(.8)
            click(544,208)
            group = captures/'all-1/manifest.json'
            result = wait_for(lambda: (value if (value:=read(group)) and value.get('complete') else None),20)
            assert result['expected_count'] == 2 and len(result['captures']) == 2
            assert {entry['theme'] for entry in result['captures']} == {'light','dark'}
            assert (group.parent/'index.html').is_file()
            wait_for(lambda: not psutil.pid_exists(result['preview_pid']))
            check('category screenshot button completes real dual-theme Menu overview', result)
            time.sleep(.3)
            click(632,208)
            all_manifest = captures/'all-2/manifest.json'
            running = wait_for(lambda: (value if (value:=read(all_manifest)) and value['captures'] else None),15)
            assert running['expected_count'] == expected_all
            # Disabled controls must not change the selection or start another capture.
            click(468,208); click(70,92)
            assert accepted('menu.root',True)
            assert not (captures/'dark-menu.root-3.png').exists()
            click(714,208)
            cancelled = wait_for(lambda: (value if (value:=read(all_manifest)) and value.get('status') == 'cancelled' else None))
            assert not cancelled['complete'] and 1 <= len(cancelled['captures']) <= 2
            wait_for(lambda: not psutil.pid_exists(cancelled['preview_pid']))
            check('all screenshot button starts full catalog; cancel preserves only partial evidence and settles child', cancelled)
            time.sleep(.4)
            backup = out/'captures-held'
            captures.rename(backup)
            captures.write_text('fixture: unavailable output directory',encoding='utf-8')
            try:
                click(468,208)
            finally:
                captures.unlink(); backup.rename(captures)
            click(468,208)
            retry = wait_for(lambda: read(captures/'dark-menu.root-4.json'))
            assert retry['pid'] == child.pid
            check('screenshot failure can be retried without reselecting scene or restarting Gallery', retry['scene'])
            time.sleep(.3)
            child.kill(); child.wait(timeout=5)
            time.sleep(.3)
            click(618,164)
            restored, new_ack = wait_for(preview)
            assert restored.pid != child.pid
            wait_for(lambda: (ack if (ack:=accepted('menu.root',True,new_ack)) and ack['step'] > 0 else None)); time.sleep(.8)
            click(468,208)
            recovery = wait_for(lambda: read(captures/'dark-menu.root-5.json'))
            assert recovery['pid'] == restored.pid
            check('reopen preview button recovers the selected scene and theme after child exit', restored.pid)
            time.sleep(.3)
            click(632,208)
            last = captures/'all-6/manifest.json'
            pending = wait_for(lambda: (value if (value:=read(last)) and value.get('preview_pid') else None))
            descendants = psutil.Process(process.pid).children(recursive=True)
            u.PostMessageW(gallery,0x10,0,0)
            process.wait(timeout=10)
            assert process.returncode == 0
            for descendant in descendants:
                try:
                    descendant.wait(timeout=5)
                except psutil.NoSuchProcess:
                    pass
            closed = read(last)
            assert closed and not closed['complete'] and closed['status'] == 'cancelled'
            check('closing Gallery cancels active batch and settles all owned descendants', dict(returncode=process.returncode,manifest=closed))
            pngs = list(out.rglob('*.png'))
            assert len(pngs) <= 9, len(pngs)
            report['png_count'] = len(pngs)
            report['native_capture_count'] = sum(path.with_suffix('.json').is_file() for path in pngs)
            report['complete'] = True
    except BaseException as error:
        report['error'] = str(error)
        raise
    finally:
        if process and process.poll() is None:
            process.kill(); process.wait(timeout=5)
        if job:
            job.close()
        u.SetCursorPos(original.x,original.y)
        (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    run(args.exe.resolve(),args.output.resolve())
