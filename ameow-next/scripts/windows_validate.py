"""Exercise the owned GPUI window using real Win32 input and compact screenshots.
Requires Windows and Pillow. Never enumerates or closes unrelated processes.
"""
import argparse
import ctypes as c
from ctypes import wintypes as w
import json
from pathlib import Path
import subprocess
import sys
import time
import tkinter as tk

from PIL import Image, ImageChops, ImageDraw, ImageGrab

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


def validate(exe, out):
    results = {"platform": "Windows", "macOS": "NOT VERIFIED", "exe": str(exe.resolve()), "checks": [],
               "runtime_limitations": {"OS file drop lock": "NOT VERIFIED: this runner does not synthesize an OLE file drop; deterministic model test covers lock",
                                       "Mixed DPI and multiple monitors": "NOT VERIFIED: current desktop only"}}
    app = None
    def check(name, observed, condition, detail=None):
        entry = {"name": name, "status": "PASS" if condition else "FAIL", "observed": observed}
        if detail is not None:
            entry["detail"] = detail
        results["checks"].append(entry)
        print(f"{entry['status']}: {name}: {observed}", flush=True)
    try:
        app = Runtime(exe, out)
        results.update(pid=app.proc.pid, dpi=96*app.scale)
        results["initial_foreground_owned"]=u.GetForegroundWindow()==app.hwnd
        compact = app.rect()
        compact_image=app.snap("compact-light")
        compact_center=compact_image.getpixel((compact_image.width//2,compact_image.height//2))[:3]
        check("Compact blank Light surface paints actual center",compact_center,compact_center==(255,255,255))
        check("actual compact native bounds", compact, app.size() == [round(80*app.scale)]*2)
        app.inside(); time.sleep(.85)
        full = app.rect()
        full_image=app.snap("full-light-idle")
        corners=[full_image.getpixel(p)[:3] for p in [(0,0),(full_image.width-1,0),(0,full_image.height-1),(full_image.width-1,full_image.height-1)]]
        center=full_image.getpixel((full_image.width//2,full_image.height//2))[:3]
        check("transparent Full corners reveal only owned neutral backdrop",{"corners":corners,"surface_center":center},all(max(abs(v-232) for v in p)<4 for p in corners) and center!=corners[0])
        interior=[full_image.getpixel((round(x*app.scale),round(y*app.scale)))[:3] for x,y in ((114,190),(190,114),(40,190),(190,40))]
        check("Full renderer paints beyond old Compact viewport",interior,all(p==(255,255,255) for p in interior))
        check("actual full native bounds", full, app.size() == [round(228*app.scale)]*2)
        delta = [(compact[i]-full[i])/app.scale for i in (0,1)]
        check("native origin shifts +4 while surface anchor remains", delta, delta == [4.,4.])
        app.outside(); time.sleep(.18)
        during = app.size()
        app.inside(); time.sleep(.85)
        check("real pointer reentry reverses in-flight shrink", {"shrinking":during,"after":app.size()}, 80*app.scale<during[0]<228*app.scale and app.size()==[round(228*app.scale)]*2)
        app.outside(); time.sleep(.85)
        c_rect=app.rect()
        old_point=w.POINT(full[0]+round(180*app.scale), full[1]+round(180*app.scale))
        check("no retained large native hitbox", {"compact":c_rect,"owned_window_at_old_full_point":u.WindowFromPoint(old_point)==app.hwnd}, app.size()==[round(80*app.scale)]*2 and u.WindowFromPoint(old_point)!=app.hwnd)
        app.inside(); time.sleep(.85); app.click(40,40); app.key("1"); app.outside(); time.sleep(.85)
        check("active task locks Full after pointer leave", app.size(), app.size()==[round(228*app.scale)]*2)
        app.key("0"); time.sleep(.85)
        check("idle clears active lock", app.size(), app.size()==[round(80*app.scale)]*2)
        app.inside();time.sleep(.85)
        results["motion_evidence"]=[]
        results["motion_evidence"].append(app.motion("hover-reversal",2.5,[(.05,app.outside),(.23,app.inside),(.95,app.outside),(1.9,app.inside)]))
        app.inside();time.sleep(.85);app.key("2");time.sleep(.3)
        results["motion_evidence"].append(app.motion("download-transcode-success",2.2,[(.08,lambda:app.key("3")),(.95,lambda:app.key("4"))]))
        app.key("2");time.sleep(.3)
        results["motion_evidence"].append(app.motion("download-failure",1.1,[(.08,lambda:app.key("5"))]))
        shots=[]
        observed_states=[]
        for theme in ("light","night"):
            app.inside(); time.sleep(.85)
            if theme=="night": app.key("T")
            for state in ("1","2","3","4","5"):
                app.key(state); time.sleep(.5)
                shots.append((f"{theme}-{state}",app.snap(f"{theme}-state-{state}")))
                frame=app.frames()
                observed_states.append({"requested":state,"theme":theme,"observed":frame[-1] if frame else None})
                if state in ("2","5"):
                    r=app.rect();app.move(r[0]+115*app.scale,r[1]+166*app.scale);time.sleep(.15)
                    hover=app.snap(f"{theme}-{'cancel' if state=='2' else 'copy'}-hover")
                    action=hover.crop(tuple(round(v*app.scale) for v in (107,158,123,174)))
                    pixels=list(action.getdata())
                    if state=='2':
                        red=sum(p[0]>200 and p[1]<110 and p[2]<110 for p in pixels)
                        white=sum(min(p[:3])>240 for p in pixels)
                        check(f"{theme} cancel hover visibly paints red and white X",{"red_pixels":red,"white_pixels":white},red>30 and white>5)
                    else:
                        surface=(255,255,255) if theme=='light' else (35,36,39)
                        ink=sum(max(abs(p[j]-surface[j]) for j in (0,1,2))>30 for p in pixels)
                        check(f"{theme} Failure copy SVG is visibly rendered",{"ink_pixels":ink},ink>20)
                    app.inside()
        sheet=Image.new("RGB", (5*240,2*256),(236,236,236))
        draw=ImageDraw.Draw(sheet)
        for i,(label,img) in enumerate(shots):
            x=(i%5)*240;y=(i//5)*256
            sheet.paste(img,(x+(240-img.width)//2,y+20))
            draw.text((x+10,y+3),label,fill=(20,20,20))
        sheet.save(out/"state-matrix.png")
        check("Light and Night five-state native screenshots", [name for name,_ in shots],len(shots)==10,"Visual review required; screenshots prove rendering, not token correctness by themselves.")
        results["state_matrix_frames"]=observed_states
        app.key("5");time.sleep(.3)
        r=app.rect();app.move(r[0]+115*app.scale,r[1]+166*app.scale);time.sleep(.1)
        copy_before=app.snap("copy-before")
        app.click(115,166)
        copy_feedback=app.snap("copy-feedback")
        clipboard=app.clipboard()
        expected="Ameow Next · Phase 1 mock diagnostic\nE_MOCK_DOWNLOAD: simulated download failure\nNo backend request was made."
        check("Failure action copies mock diagnostic",{"clipboard_matched":clipboard==expected},clipboard==expected)
        time.sleep(1.05);copy_after=app.snap("copy-after-feedback")
        action_area=tuple(round(v*app.scale) for v in (107,158,123,174))
        showed_feedback=ImageChops.difference(copy_before.crop(action_area),copy_feedback.crop(action_area)).getbbox() is not None
        returned_copy=ImageChops.difference(copy_before.crop(action_area),copy_after.crop(action_area)).getbbox() is None
        check("copy feedback changes icon then restores after 900ms",{"feedback_icon_changed":showed_feedback,"original_copy_restored":returned_copy},showed_feedback and returned_copy)
        for state,retain in (("4",1.5),("5",5.0)):
            app.inside();app.key(state);time.sleep(retain+.25)
            held=app.size();app.outside();time.sleep(.85)
            check(f"state {state} retention expiry inside keeps Full then leave collapses",{"inside_after_expiry":held,"after_leave":app.size()},held==[round(228*app.scale)]*2 and app.size()==[round(80*app.scale)]*2)
            app.inside();time.sleep(.85);app.key(state);app.outside();time.sleep(retain-.25)
            retained=app.size();time.sleep(1.1)
            check(f"state {state} retains for {retain}s when pointer outside",{"before_expiry":retained,"after_expiry":app.size()},retained==[round(228*app.scale)]*2 and app.size()==[round(80*app.scale)]*2)
        app.inside();time.sleep(.85);app.key("2");time.sleep(.3);app.click(115,166)
        time.sleep(.3);app.snap("cancelled")
        cancelled_frames=app.frames()
        cancelled_frame=cancelled_frames[-1] if cancelled_frames else None
        app.outside();time.sleep(.9)
        cancelled_retained=app.size();time.sleep(.9)
        check("active cancel action and 1500ms Cancelled retention",{"frame_after_cancel":cancelled_frame,"before_expiry":cancelled_retained,"after_expiry":app.size()},cancelled_frame is not None and str(cancelled_frame.get("stage","")).lower()=="cancelled" and cancelled_retained==[round(228*app.scale)]*2 and app.size()==[round(80*app.scale)]*2)
        app.inside();time.sleep(.85);app.key("0");app.click(30,30,right=True);app.outside();time.sleep(.5)
        menu_size=app.size();app.key("ESC");time.sleep(.85)
        check("context menu locks Full and Escape releases",{"menu_open":menu_size,"after_escape":app.size()},menu_size==[round(228*app.scale)]*2 and app.size()==[round(80*app.scale)]*2)
        app.inside();time.sleep(.85);app.key("R");app.outside();time.sleep(.14)
        reduced=app.size();app.inside();time.sleep(.04)
        check("reduced mode uses direct native Compact/Full",{"outside":reduced,"inside":app.size()},reduced==[round(80*app.scale)]*2 and app.size()==[round(228*app.scale)]*2)
        app.key("1");time.sleep(.05);static_a=app.snap("reduced-resolving")
        time.sleep(.35);static_b=app.snap("reduced-resolving-later")
        area=tuple(round(v*app.scale) for v in (66,75,162,174))
        static_delta=ImageChops.difference(static_a.crop(area),static_b.crop(area)).getbbox()
        check("reduced Resolving indicator is visibly static over 350ms",{"pixel_difference_bounds":static_delta},static_delta is None)
        app.key("0");app.key("R")
        app.click(30,30)
        r=app.rect();app.move(r[0]+30,r[1]+30);u.mouse_event(2,0,0,0,0);time.sleep(.06)
        sw=u.GetSystemMetrics(0);sh=u.GetSystemMetrics(1)
        for x,y in ((sw-80,sh-80),(sw-1,sh-1)):
            app.move(x,y);time.sleep(.15)
        u.mouse_event(4,0,0,0,0);time.sleep(.4)
        edge=app.rect();app.snap("drag-screen-edge")
        # SPI_GETWORKAREA is the primary-monitor work area used for this edge path.
        work=w.RECT();u.SystemParametersInfoW(0x30,0,c.byref(work),0)
        check("drag remains reachable at screen edge",{"native":edge,"work_area":[work.left,work.top,work.right,work.bottom],"before":r},abs(edge[0]-r[0])>400 and abs(edge[1]-r[1])>400 and edge[0]>=work.left and edge[1]>=work.top and edge[2]<=work.right and edge[3]<=work.bottom)
        frames=app.frames()
        check("native frame telemetry available",len(frames),len(frames)>10)
        results["telemetry"]="native-frames.jsonl"
        results["artifacts"]=[p.name for pattern in ("*.png","*.gif") for p in out.glob(pattern)]
    except Exception as e:
        results["error"]={"type":type(e).__name__,"message":str(e)}
        print(f"ERROR: {e}",flush=True)
    finally:
        if app is not None:
            app.close()
        results["overall"]="PASS" if results["checks"] and all(x["status"]=="PASS" for x in results["checks"]) and "error" not in results else "FAIL"
        out.mkdir(parents=True,exist_ok=True)
        (out/"windows-validation.json").write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding="utf-8")
    return 0 if results["overall"]=="PASS" else 1


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--exe",type=Path,default=Path(__file__).resolve().parents[1]/"target/debug/ameow-next.exe")
    parser.add_argument("--out",type=Path,default=Path(__file__).resolve().parents[1]/"evidence")
    args=parser.parse_args()
    raise SystemExit(validate(args.exe,args.out))
