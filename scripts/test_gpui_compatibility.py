"""Short owned-process animation and actual Shell tray checks, without images.

Uses no-network fixture modes, never the production coordinator or settings.
Tray interaction uses only the owned HWND callback; physical Shell input and
other DPI/monitors remain separate acceptance checks.
"""
import argparse
import ctypes as c
from ctypes import wintypes as w
import hashlib
import json
import math
from pathlib import Path
import subprocess

from gallery import OwnedJob
from test_gpui_migration import owned_windows, bounds, wait_for
from windows_validate import u


def run(exe, output):
    output.mkdir(parents=True,exist_ok=False)
    report = dict(exe=str(exe),exe_sha256=hashlib.sha256(exe.read_bytes()).hexdigest(),checks=[],complete=False,
                  limits='One actual DPI; no compositor cadence, cross-monitor, production persistence or physical Shell-input claim.')
    def passed(name, observed):
        report['checks'].append(dict(name=name,passed=True,observed=observed))
        print('PASS: '+name,flush=True)
    try:
        for reduced in [False,True]:
            label = 'reduced' if reduced else 'motion'
            frames = output/(label+'.jsonl')
            with (output/(label+'.log')).open('w') as log:
                command = [str(exe),'--probe-period-ms','650','--measure',str(frames),'--exit-after-ms','4000','--hover','off']
                if reduced:
                    command.append('--reduced')
                process = subprocess.Popen(command,creationflags=subprocess.CREATE_NO_WINDOW,stdout=log,stderr=log)
                job = OwnedJob(process)
                try:
                    main = wait_for(lambda: owned_windows(process.pid).get('Ameow'))
                    dpi = u.GetDpiForWindow(main)
                    process.wait(timeout=12)
                    assert process.returncode == 0
                finally:
                    if process.poll() is None:
                        process.kill();process.wait(timeout=5)
                    job.close()
            values = [json.loads(line) for line in frames.read_text().splitlines()]
            samples = [value for value in values if value.get('type') == 'frame']
            fullness = [value['rawfullness'] for value in samples]
            assert len(samples) > 30 and all(math.isfinite(value) for value in fullness)
            assert min(fullness) < .01 and max(fullness) > .99
            intermediate = sum(.01 < value < .99 for value in fullness)
            assert intermediate == 0 if reduced else intermediate > 10
            passed(label+' renders repeated Compact/Full transitions and exits cleanly',dict(dpi=dpi,frames=len(samples),intermediate_frames=intermediate,min=min(fullness),max=max(fullness)))
        with (output/'tray.log').open('w') as log:
            process = subprocess.Popen([str(exe),'--queue-fixture-control',str(output/'queue-control.json'),'--tray-fixture','--exit-after-ms','4500'],
                creationflags=subprocess.CREATE_NO_WINDOW,stdout=log,stderr=log)
            job = OwnedJob(process)
            try:
                main = wait_for(lambda: owned_windows(process.pid).get('Ameow'))
                def owner():
                    found = []
                    @c.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM)
                    def visit(hwnd,_):
                        pid = w.DWORD()
                        u.GetWindowThreadProcessId(hwnd,c.byref(pid))
                        if pid.value == process.pid:
                            name = c.create_unicode_buffer(256)
                            u.GetClassNameW(w.HWND(hwnd),name,256)
                            if name.value == 'AmeowNextTrayOwner':
                                found.append(hwnd)
                        return True
                    u.EnumWindows(visit,0)
                    return found[0] if found else None
                tray = wait_for(owner)
                class Identifier(c.Structure):
                    _fields_ = [('size',w.DWORD),('hwnd',w.HWND),('id',w.UINT),('guid',c.c_byte*16)]
                identifier = Identifier(c.sizeof(Identifier),tray,1)
                shell = c.WinDLL('shell32')
                shell.Shell_NotifyIconGetRect.argtypes = [c.POINTER(Identifier),c.POINTER(w.RECT)]
                shell.Shell_NotifyIconGetRect.restype = c.c_long
                rect = w.RECT()
                assert shell.Shell_NotifyIconGetRect(c.byref(identifier),c.byref(rect)) == 0
                assert rect.right > rect.left and rect.bottom > rect.top
                passed('Shell has the owned application notification icon',dict(hwnd=tray,rect=[rect.left,rect.top,rect.right,rect.bottom]))
                u.PostMessageW(tray,0x8000+23,1,0x205)
                popup = wait_for(lambda: owned_windows(process.pid).get('Ameow · Tray'))
                passed('owned tray callback opens the actual GPUI popup',dict(hwnd=popup,bounds=bounds(popup),dpi=u.GetDpiForWindow(popup)))
                u.PostMessageW(tray,0x8000+23,1,0x205)
                wait_for(lambda: popup not in owned_windows(process.pid).values())
                assert process.poll() is None
                passed('second tray callback closes popup and preserves main process',process.pid)
                process.wait(timeout=10)
                assert process.returncode == 0
                assert shell.Shell_NotifyIconGetRect(c.byref(identifier),c.byref(rect)) != 0
                passed('clean fixture exit removes its notification icon',process.returncode)
            finally:
                if process.poll() is None:
                    process.kill();process.wait(timeout=5)
                job.close()
        report['complete'] = True
    except BaseException as error:
        report['error'] = str(error)
        raise
    finally:
        (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    run(args.exe.resolve(),args.output.resolve())
