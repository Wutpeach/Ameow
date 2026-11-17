"""Small Windows capture/input helpers for owned native preview and regression windows.

Keep the real HWND/DPI and desktop BitBlt path; no validator or historical runner
is imported here. Runners own their output directories and process lifetimes.
"""
import ctypes as c
from ctypes import wintypes as w
import hashlib
import json
import subprocess
import sys
import time
import tkinter as tk
from PIL import Image, ImageGrab

if sys.platform != "win32":
    raise SystemExit("Windows runtime validation only; macOS NOT VERIFIED")
u = c.windll.user32
k = c.windll.kernel32
u.SetProcessDPIAware()
u.EnumWindows.argtypes = [c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM), w.LPARAM]
u.GetWindowThreadProcessId.argtypes = [w.HWND, c.POINTER(w.DWORD)]
u.GetWindowRect.argtypes = [w.HWND, c.POINTER(w.RECT)]
u.WindowFromPoint.argtypes = [w.POINT]
u.WindowFromPoint.restype = w.HWND
u.SetForegroundWindow.argtypes = [w.HWND]
u.GetForegroundWindow.restype = w.HWND
u.SetWindowPos.argtypes = [w.HWND,w.HWND,c.c_int,c.c_int,c.c_int,c.c_int,w.UINT]
u.PostMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
u.GetDpiForWindow.argtypes = [w.HWND]
u.GetClipboardData.restype = w.HANDLE
k.GlobalLock.argtypes = [w.HANDLE]
k.GlobalLock.restype = c.c_void_p
k.GlobalUnlock.argtypes = [w.HANDLE]


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


class Runtime:
    def __init__(self, exe, out):
        self.out = out
        self.out.mkdir(parents=True, exist_ok=True)
        self.log = (out / "native-frames.jsonl").resolve()
        self.log.write_text("", encoding="utf-8")
        self.stderr = (out / "native-stderr.log").open("w", encoding="utf-8")
        self.original_cursor=w.POINT()
        u.GetCursorPos(c.byref(self.original_cursor))
        # Owned, ordinary (not topmost) neutral harness window. No desktop pixels
        # or unrelated application content can enter the prototype's transparent corners.
        self.backdrop=tk.Tk()
        self.backdrop.overrideredirect(True)
        self.backdrop.configure(background="#e8e8e8")
        self.backdrop.attributes("-topmost",True)
        self.backdrop.geometry(f"{u.GetSystemMetrics(0)}x{u.GetSystemMetrics(1)}+0+0")
        self.backdrop.update()
        u.SetCursorPos(200, 100)
        self.proc = subprocess.Popen([str(exe.resolve()), "--telemetry", str(self.log)], cwd=exe.resolve().parents[2], creationflags=subprocess.CREATE_NO_WINDOW, stdout=self.stderr, stderr=self.stderr)
        self.hwnd = None
        callback = c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
        def visit(hwnd, _):
            pid = w.DWORD()
            u.GetWindowThreadProcessId(hwnd, c.byref(pid))
            if pid.value == self.proc.pid and u.IsWindowVisible(hwnd):
                self.hwnd = hwnd
                return False
            return True
        deadline = time.monotonic() + 20
        while not self.hwnd and time.monotonic() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError(f"Prototype exited: {self.proc.returncode}")
            u.EnumWindows(callback(visit), 0)
            time.sleep(.05)
        if not self.hwnd:
            self.close()
            raise RuntimeError("No visible HWND belonging to launched PID")
        time.sleep(.8)
        u.SetForegroundWindow(self.hwnd)
        self.scale = u.GetDpiForWindow(self.hwnd) / 96

    def rect(self):
        r = w.RECT()
        if not u.GetWindowRect(self.hwnd, c.byref(r)):
            raise RuntimeError("Owned HWND unavailable")
        return [r.left, r.top, r.right, r.bottom]

    def size(self):
        r = self.rect()
        return [r[2] - r[0], r[3] - r[1]]

    def move(self, x, y):
        if not u.SetCursorPos(int(x), int(y)):
            raise RuntimeError("SetCursorPos failed")

    def inside(self):
        r = self.rect()
        self.move(r[0] + 30 * self.scale, r[1] + 30 * self.scale)

    def outside(self):
        r = self.rect()
        self.move(max(0, r[0] - 35), max(0, r[1] - 35))

    def key(self, char):
        u.SetForegroundWindow(self.hwnd)
        u.SetWindowPos(self.hwnd,w.HWND(-1),0,0,0,0,0x13)
        code = {"+": 0xBB, "-": 0xBD, "ESC": 0x1B}.get(char, ord(char.upper()) if len(char) == 1 else 0)
        u.keybd_event(code, 0, 0, 0)
        time.sleep(.012)
        u.keybd_event(code, 0, 2, 0)
        time.sleep(.04)

    def click(self, x, y, right=False):
        r = self.rect()
        self.move(r[0] + x*self.scale, r[1] + y*self.scale)
        time.sleep(.03)
        u.mouse_event(8 if right else 2, 0, 0, 0, 0)
        time.sleep(.03)
        u.mouse_event(16 if right else 4, 0, 0, 0, 0)
        time.sleep(.05)

    def frames(self):
        items = []
        for line in self.log.read_text(encoding="utf-8").splitlines():
            try:
                items.append(json.loads(line))
            except json.JSONDecodeError:
                pass  # Writer may still own the last incomplete line.
        return items

    def snap(self, name):
        self.backdrop.update()
        u.SetWindowPos(self.hwnd,w.HWND(-1),0,0,0,0,0x13)
        time.sleep(.03)
        img = ImageGrab.grab(bbox=tuple(self.rect()), all_screens=True)
        self.capture_guard(img)
        img.save(self.out / f"{name}.png")
        return img

    @staticmethod
    def capture_guard(img):
        corners=[img.getpixel(p)[:3] for p in [(0,0),(img.width-1,0),(0,img.height-1),(img.width-1,img.height-1)]]
        if not all(max(abs(v-232) for v in p)<14 for p in corners):
            raise RuntimeError("Owned neutral backdrop not visible at native crop corners; capture suppressed")

    def motion(self,name,duration,actions):
        """A fixed 228px owned-backdrop crop preserves a readable surface anchor."""
        bounds=tuple(self.rect())
        start=time.monotonic();frames=[];times=[];pending=list(actions)
        while time.monotonic()-start<duration:
            self.backdrop.update()
            u.SetWindowPos(self.hwnd,w.HWND(-1),0,0,0,0,0x13)
            elapsed=time.monotonic()-start
            while pending and elapsed>=pending[0][0]:
                pending.pop(0)[1]()
            captured=ImageGrab.grab(bbox=bounds,all_screens=True).convert("RGB")
            self.capture_guard(captured)
            frames.append(captured)
            times.append(time.monotonic()-start)
            time.sleep(.035)
        delays=[max(20,round((times[i+1]-times[i])*1000)) for i in range(len(times)-1)]+[80]
        frames[0].save(self.out/f"{name}.gif",save_all=True,append_images=frames[1:],duration=delays,loop=0)
        return {"artifact":f"{name}.gif","crop":list(bounds),"frames":len(frames),"duration_s":times[-1]}

    def clipboard(self):
        if not u.OpenClipboard(self.hwnd):
            raise RuntimeError("OpenClipboard failed")
        try:
            h = u.GetClipboardData(13)
            if not h:
                return None
            p = k.GlobalLock(h)
            try:
                return c.wstring_at(p) if p else None
            finally:
                k.GlobalUnlock(h)
        finally:
            u.CloseClipboard()

    def close(self):
        if self.proc.poll() is None:
            if self.hwnd:
                u.PostMessageW(self.hwnd, 0x10, 0, 0)
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.proc.terminate()
                self.proc.wait(timeout=3)
        self.stderr.close()
        self.backdrop.destroy()
        u.SetCursorPos(self.original_cursor.x,self.original_cursor.y)


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


class MeasuredRuntime(Runtime):
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
