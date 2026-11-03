"""Repair A owned-process native harness. R1 source and evidence stay untouched."""
import ctypes as c
from ctypes import wintypes as w
import hashlib
import json
import subprocess
import time
import tkinter as tk
from windows_validate import Runtime,u
from PIL import Image


class BitmapHeader(c.Structure):
    _fields_=[('size',w.DWORD),('width',w.LONG),('height',w.LONG),('planes',w.WORD),('bits',w.WORD),('compression',w.DWORD),('image_size',w.DWORD),('x_pixels',w.LONG),('y_pixels',w.LONG),('colors_used',w.DWORD),('colors_important',w.DWORD)]


class CropCapture:
    """Direct native-sized BitBlt, rather than grabbing the entire desktop."""
    def __init__(self,bounds):
        self.bounds=bounds;self.width=bounds[2]-bounds[0];self.height=bounds[3]-bounds[1]
        g=c.windll.gdi32;self.g=g
        u.GetDC.argtypes=[w.HWND];u.GetDC.restype=w.HDC
        u.ReleaseDC.argtypes=[w.HWND,w.HDC]
        g.CreateCompatibleDC.argtypes=[w.HDC];g.CreateCompatibleDC.restype=w.HDC
        g.CreateDIBSection.argtypes=[w.HDC,c.c_void_p,w.UINT,c.POINTER(c.c_void_p),w.HANDLE,w.DWORD];g.CreateDIBSection.restype=w.HANDLE
        g.SelectObject.argtypes=[w.HDC,w.HANDLE];g.SelectObject.restype=w.HANDLE
        g.DeleteObject.argtypes=[w.HANDLE];g.DeleteDC.argtypes=[w.HDC]
        g.BitBlt.argtypes=[w.HDC,c.c_int,c.c_int,c.c_int,c.c_int,w.HDC,c.c_int,c.c_int,w.DWORD]
        self.dc=u.GetDC(None);self.mem=g.CreateCompatibleDC(self.dc)
        header=BitmapHeader(c.sizeof(BitmapHeader),self.width,-self.height,1,32,0,0,0,0,0,0)
        self.bits=c.c_void_p();self.bitmap=g.CreateDIBSection(self.dc,c.byref(header),0,c.byref(self.bits),None,0)
        if not self.bitmap:raise RuntimeError('CreateDIBSection failed')
        self.previous=g.SelectObject(self.mem,self.bitmap)

    def grab(self):
        if not self.g.BitBlt(self.mem,0,0,self.width,self.height,self.dc,self.bounds[0],self.bounds[1],0x40CC0020):raise RuntimeError('Native crop BitBlt failed')
        return Image.frombytes('RGB',(self.width,self.height),c.string_at(self.bits,self.width*self.height*4),'raw','BGRX')

    def close(self):
        self.g.SelectObject(self.mem,self.previous);self.g.DeleteObject(self.bitmap);self.g.DeleteDC(self.mem);u.ReleaseDC(None,self.dc)


class DevMode(c.Structure):
    _fields_=[('device_name',w.WCHAR*32),('spec_version',w.WORD),('driver_version',w.WORD),('size',w.WORD),('driver_extra',w.WORD),('fields',w.DWORD),('union',c.c_byte*16),('color',w.SHORT),('duplex',w.SHORT),('yresolution',w.SHORT),('ttoption',w.SHORT),('collate',w.SHORT),('form_name',w.WCHAR*32),('log_pixels',w.WORD),('bits_per_pel',w.DWORD),('pels_width',w.DWORD),('pels_height',w.DWORD),('display_flags',w.DWORD),('display_frequency',w.DWORD),('icm_method',w.DWORD),('icm_intent',w.DWORD),('media_type',w.DWORD),('dither_type',w.DWORD),('reserved1',w.DWORD),('reserved2',w.DWORD),('panning_width',w.DWORD),('panning_height',w.DWORD)]


def refresh_metadata():
    mode=DevMode();mode.size=c.sizeof(mode)
    if u.EnumDisplaySettingsW(None,-1,c.byref(mode)):
        return {'reported_primary_refresh_hz':mode.display_frequency,'physical_display_px':[mode.pels_width,mode.pels_height],'refresh_budget_ms':1000/mode.display_frequency if mode.display_frequency>1 else None,'source':'EnumDisplaySettingsW ENUM_CURRENT_SETTINGS; OS-reported refresh, not measured presentation cadence.'}
    return {'reported_primary_refresh_hz':None,'error':'EnumDisplaySettingsW failed'}


class RepairRuntime(Runtime):
    def __init__(self,exe,out,motion,dt='baseline',native_flags='always',lifetime=60000,extra_args=None):
        self.out=out;out.mkdir(parents=True,exist_ok=True)
        self.log=(out/'frames.jsonl').resolve();self.native_log=(out/'native.jsonl').resolve()
        self.stderr=(out/'stderr.log').open('w',encoding='utf-8')
        self.original_cursor=w.POINT();u.GetCursorPos(c.byref(self.original_cursor))
        self.backdrop=tk.Tk();self.backdrop.overrideredirect(True)
        self.backdrop.configure(background='#e8e8e8');self.backdrop.attributes('-topmost',True)
        self.backdrop.geometry(f'{u.GetSystemMetrics(0)}x{u.GetSystemMetrics(1)}+0+0');self.backdrop.update()
        u.SetCursorPos(200,100)
        self.command=[str(exe.resolve()),'--motion',motion,'--dt',dt,'--native-flags',native_flags,'--measure',str(self.log),'--native-metrics',str(self.native_log),'--exit-after-ms',str(lifetime)]
        self.command.extend(extra_args or [])
        self.proc=subprocess.Popen(self.command,cwd=exe.resolve().parents[2],creationflags=subprocess.CREATE_NO_WINDOW,stdout=self.stderr,stderr=self.stderr)
        self.hwnd=None
        @c.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM)
        def visit(hwnd,_):
            pid=w.DWORD();u.GetWindowThreadProcessId(hwnd,c.byref(pid))
            if pid.value==self.proc.pid and u.IsWindowVisible(hwnd):self.hwnd=hwnd;return False
            return True
        deadline=time.perf_counter()+20
        while not self.hwnd and time.perf_counter()<deadline:
            if self.proc.poll() is not None:raise RuntimeError(f'Prototype exit {self.proc.returncode}')
            u.EnumWindows(visit,0);time.sleep(.02)
        if not self.hwnd:self.close();raise RuntimeError('Owned visible HWND not found')
        self.scale=u.GetDpiForWindow(self.hwnd)/96
        time.sleep(.4);u.SetForegroundWindow(self.hwnd)
        u.SetWindowPos(self.hwnd,w.HWND(-1),0,0,0,0,0x13)
        self.started=time.perf_counter();self.samples=[];self.events=[]
        self.exe_hash=hashlib.sha256(exe.read_bytes()).hexdigest()
        self.display=refresh_metadata()

    def sample(self):
        r=self.rect();self.samples.append({'host_ms':(time.perf_counter()-self.started)*1000,'bounds':r,'width':r[2]-r[0],'foreground_owned':u.GetForegroundWindow()==self.hwnd})

    def wait(self,duration,capture=None):
        until=time.perf_counter()+duration
        while time.perf_counter()<until:
            self.sample()
            if capture is not None:capture()
            time.sleep(.008 if capture is None else .022)

    def event(self,name,action,cycle=None):
        self.events.append({'host_ms':(time.perf_counter()-self.started)*1000,'name':name,'cycle':cycle})
        action()

    def save_host(self):
        (self.out/'host.json').write_text(json.dumps({'pid':self.proc.pid,'command':self.command,'exe_sha256':self.exe_hash,'dpi':96*self.scale,'display':self.display,'events':self.events,'samples':self.samples},indent=2),encoding='utf-8')


def read_jsonl(path):
    values=[]
    if path.exists():
        for line in path.read_text(encoding='utf-8').splitlines():
            try:values.append(json.loads(line))
            except json.JSONDecodeError:pass
    return values
