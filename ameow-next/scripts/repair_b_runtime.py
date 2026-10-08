"""Repair B launch harness; old helpers imported read-only."""
import ctypes as c
from ctypes import wintypes as w
import hashlib
from pathlib import Path
import subprocess
import time
import tkinter as tk
from repair_a_runtime import RepairRuntime,CropCapture,refresh_metadata,read_jsonl,u


class RepairB(RepairRuntime):
    def __init__(self,exe,out,legacy=False,night=False,lifetime=60000):
        self.out=out;out.mkdir(parents=True,exist_ok=True)
        self.log=(out/'frames.jsonl').resolve();self.native_log=(out/'native.jsonl').resolve()
        self.stderr=(out/'stderr.log').open('w',encoding='utf-8')
        self.original_cursor=w.POINT();u.GetCursorPos(c.byref(self.original_cursor))
        self.backdrop=tk.Tk();self.backdrop.overrideredirect(True)
        self.backdrop.configure(background='#e8e8e8');self.backdrop.attributes('-topmost',True)
        self.backdrop.geometry(f'{u.GetSystemMetrics(0)}x{u.GetSystemMetrics(1)}+0+0');self.backdrop.update()
        u.SetCursorPos(200,100)
        self.command=[str(exe.resolve()),'--measure',str(self.log),'--native-metrics',str(self.native_log),'--exit-after-ms',str(lifetime)]
        if legacy:self.command+=['--motion','a-soft']
        if night:self.command+=['--night']
        self.proc=subprocess.Popen(self.command,cwd=Path(__file__).resolve().parents[1],creationflags=subprocess.CREATE_NO_WINDOW,stdout=self.stderr,stderr=self.stderr)
        self.hwnd=None
        @c.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM)
        def visit(hwnd,_):
            pid=w.DWORD();u.GetWindowThreadProcessId(hwnd,c.byref(pid))
            if pid.value==self.proc.pid and u.IsWindowVisible(hwnd):self.hwnd=hwnd;return False
            return True
        deadline=time.perf_counter()+20
        while not self.hwnd and time.perf_counter()<deadline:
            if self.proc.poll() is not None:raise RuntimeError(f'Prototype exited {self.proc.returncode}')
            u.EnumWindows(visit,0);time.sleep(.02)
        if not self.hwnd:self.close();raise RuntimeError('Owned visible HWND not found')
        self.scale=u.GetDpiForWindow(self.hwnd)/96
        time.sleep(.4);u.SetForegroundWindow(self.hwnd);u.SetWindowPos(self.hwnd,w.HWND(-1),0,0,0,0,0x13)
        self.started=time.perf_counter();self.samples=[];self.events=[]
        self.exe_hash=hashlib.sha256(exe.read_bytes()).hexdigest();self.display=refresh_metadata()
