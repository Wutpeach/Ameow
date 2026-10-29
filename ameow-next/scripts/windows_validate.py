"""Exercise the owned GPUI window using real Win32 input and compact screenshots.
Requires Windows and Pillow. Never enumerates or closes unrelated processes.
"""
import argparse
import ctypes as c
from ctypes import wintypes as w
import json
import hashlib
import math
from pathlib import Path
import re
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


def action_pixels(image):
    pixels = list(image.convert('RGB').getdata())
    return {'red_pixels': sum(r > 200 and g < 110 and b < 110 for r, g, b in pixels),
            'white_pixels': sum(min(p) > 240 for p in pixels)}


def feedback_pixels(before, feedback, after):
    return {'feedback_icon_changed': ImageChops.difference(before, feedback).getbbox() is not None,
            'original_copy_restored': ImageChops.difference(before, after).getbbox() is None}


def glyph_margins(image, scale):
    # Exclude the Light surface at the rounded disc's corners, preserving 3dip inset.
    cx, cy = image.width/2, image.height/2
    radius = min(cx, cy)-scale
    white = [(x,y) for y in range(image.height) for x in range(image.width)
             if (x+.5-cx)**2+(y+.5-cy)**2<=radius**2 and min(image.getpixel((x,y))[:3])>240]
    if not white:
        return None
    return [min(x for x,y in white), min(y for x,y in white),
            image.width-1-max(x for x,y in white), image.height-1-max(y for x,y in white)]


def current_ui_layout(source):
    """Read the current fixture's named layout, failing closed if selectors change."""
    main = (source / 'src/main.rs').read_text(encoding='utf-8')
    indicator = (source / 'src/indicator.rs').read_text(encoding='utf-8')
    glow = (source / 'src/ring_glow.rs').read_text(encoding='utf-8')
    def block(text, start, end):
        if text.count(start) != 1:
            raise RuntimeError(f'Ambiguous layout selector: {start}')
        return text.split(start, 1)[1].split(end, 1)[0]
    def number(text, prefix):
        values = re.findall(re.escape(prefix) + '([0-9.]+)', text)
        if len(values) != 1:
            raise RuntimeError(f'Layout changed; review selector {prefix}: {values}')
        return float(values[0])
    slot = block(main, '.id("persistent-state-slot")', '.child(indicator::ring')
    action = block(main, '.id("state-action")', '.rounded_full()')
    ring = block(indicator, 'pub fn ring(f: Frame)', '.when(f.stage')
    return {'padding':number(glow, 'const PADDING: f32 = '),
            'slot': [number(slot, 'left(px(g.gutter + '),
                     number(slot, 'top(px(g.gutter + ')],
            'action': [number(action, 'left(px('), number(action, 'top(px('), number(action, 'size(px(')],
            'ring': [number(ring, 'left(px('), number(ring, 'top(px('), number(ring, 'size(px(')]}


def radial_profile(image, center, radius, scale, background):
    return [max(abs(a-b) for a,b in zip(image.getpixel((round(center[0]+radius*scale*math.cos(i*math.tau/64)),
                     round(center[1]+radius*scale*math.sin(i*math.tau/64))))[:3], background)) for i in range(64)]


def validate_ui_regression(exe, out, source):
    # Import lazily: the shared native runtime itself imports Runtime from here.
    from repair_a_runtime import RepairRuntime, CropCapture, read_jsonl
    out.mkdir(parents=True, exist_ok=False)
    result = {'checks': [], 'exe': str(exe.resolve()), 'exe_sha256': hashlib.sha256(exe.read_bytes()).hexdigest(),
              'source': str(source.resolve()), 'platform': 'Windows', 'macOS': 'NOT VERIFIED',
              'limits': 'Synthetic native fixture input/rendering only. Harness sets TOPMOST; no natural z-order claim. '
                        'One desktop DPI, not mixed DPI. Pixel sampling is not optical acceptance or GPU frame pacing.',
              'visual_review': {'status': 'REQUIRED', 'artifacts': ['light-rings.png', 'night-rings.png', 'controls.png', 'resolving.gif', 'states.gif'],
                                'questions': ['Are halos softly fading without a visible cut edge?', 'Are both action glyphs comfortably inset and quiet after leave?']}}
    app = None
    def check(name, condition, observed):
        result['checks'].append({'name': name, 'status': 'PASS' if condition else 'FAIL', 'observed': observed})
        print(f"{'PASS' if condition else 'FAIL'}: {name}: {observed}", flush=True)
        if not condition:
            raise RuntimeError(f'STOP RETAIN: {name}')
    try:
        layout = current_ui_layout(source)
        result['layout'] = layout
        app = RepairRuntime(exe, out, 'converged', lifetime=90000,
                            extra_args=['--stage', 'idle', '--reduced', '--hover', 'off', '--telemetry', str((out/'telemetry.jsonl').resolve())])
        result.update(pid=app.proc.pid, command=app.command, dpi=96*app.scale)
        app.inside(); app.wait(.35)
        # Focus fixture root without triggering production background actions.
        app.click(app.size()[0]/app.scale/2, app.size()[1]/app.scale/2)
        app.key('0'); app.wait(.2)
        measured = read_jsonl(app.log)[-1]
        telemetry = read_jsonl(out/'telemetry.jsonl')[-1]
        check('fixture startup is Idle/reduced/hover-off with a settled Full',
              telemetry['stage']=='Idle' and telemetry['reduced'] and not measured['hover']['enabled'] and measured['rawfullness']==1, telemetry)
        gutter = measured['gutter']; scale = app.scale
        sx, sy = [gutter+v for v in layout['slot']]
        ax, ay, side = layout['action']; rx, ry, diameter = layout['ring']
        center = ((sx+rx+diameter/2)*scale, (sy+ry+diameter/2)*scale)
        area = tuple(round(v*scale) for v in (sx+ax, sy+ay, sx+ax+side, sy+ay+side))
        extent=diameter/2+layout['padding']
        ring_area = (math.floor(center[0]-extent*scale), math.floor(center[1]-extent*scale),
                     math.ceil(center[0]+extent*scale), math.ceil(center[1]+extent*scale))
        full = app.rect()
        check('ring padded sample domain remains within current canvas',
              min(ring_area)>=0 and ring_area[2]<=app.size()[0] and ring_area[3]<=app.size()[1], {'native':app.size(),'ring_roi':ring_area})
        result['geometry'] = {'gutter':gutter, 'action_box':area, 'ring_center_px':center, 'ring_roi':ring_area, 'native':full}
        def point(x,y):
            r=app.rect(); app.move(r[0]+x*scale,r[1]+y*scale); app.wait(.16)
        def neutral(): point(sx+rx+diameter/2, sy+ry+diameter/2)
        def select(key, stage, theme, reduced=True):
            before=read_jsonl(out/'telemetry.jsonl')[-1]['ms']
            app.key(key); app.wait(.25)
            deadline=time.monotonic()+.75
            while True:
                state=read_jsonl(out/'telemetry.jsonl')[-1]
                valid=state['ms']>before and state['stage']==stage and state['night']==(theme=='night') and state['reduced']==reduced
                if valid or time.monotonic()>=deadline: break
                app.wait(.04)
            check(theme+' '+stage+' fresh fixture state/theme/motion confirmed',valid,{'before_ms':before,'frame':state})
        def shot(name=None):
            app.backdrop.update(); u.SetWindowPos(app.hwnd,w.HWND(-1),0,0,0,0,0x13)
            crop=CropCapture(app.rect())
            try: image=crop.grab()
            finally: crop.close()
            app.capture_guard(image)
            if name: image.save(out/(name+'.png'))
            return image
        def sheet(name, images, columns=2):
            width=max(130,max(im.width for _,im in images)); height=max(im.height for _,im in images)+20
            canvas=Image.new('RGB',(width*columns,height*math.ceil(len(images)/columns)),(232,232,232)); draw=ImageDraw.Draw(canvas)
            for i,(label,im) in enumerate(images):
                x=i%columns*width; y=i//columns*height; draw.text((x+4,y+3),label,fill=(20,20,20)); canvas.paste(im,(x,y+20))
            canvas.save(out/name)
        control_images=[]
        for theme in ('light','night'):
            if theme=='night': app.key('T')
            neutral(); select('0','Idle',theme)
            idle=shot(theme+'-idle')
            background=idle.getpixel((round(center[0]),round(center[1])))[:3]
            values=radial_profile(idle,center,diameter/2+3,scale,background)
            check(theme+' Idle has no halo', max(values)<=1, values)
            images=[('Idle',idle.crop(ring_area))]
            for key, stage in [('1','Resolving'),('2','Downloading'),('3','Transcoding'),('4','Success'),('5','Failure'),('6','Cancelled')]:
                select(key,stage,theme); neutral()
                image=shot(theme+'-'+stage.lower()); images.append((stage,image.crop(ring_area)))
                values=radial_profile(image,center,diameter/2+3,scale,background)
                check(theme+' '+stage+' halo extends beyond ring',sum(v>=2 for v in values)>=16,values)
                # Upper semicircle avoids the separate label/action below the ring.
                outer=radial_profile(image,center,extent-1,scale,background)[32:]
                check(theme+' '+stage+' outer halo fades before padded edge',max(outer)<=1,outer)
                app.wait(.25); later=shot()
                delta=ImageChops.difference(image.crop(ring_area),later.crop(ring_area)).getbbox()
                check(theme+' '+stage+' Reduced Motion is stable',delta is None,delta)
                check(theme+' '+stage+' keeps current native bounds',app.rect()==full,app.rect())
            sheet(theme+'-rings.png',images)
            for key, name in [('2','cancel'),('5','copy')]:
                select(key,'Downloading' if name=='cancel' else 'Failure',theme); neutral(); app.wait(.15)
                default=shot(theme+'-'+name+'-default').crop(area)
                check(theme+' '+name+' default has no red disc',action_pixels(default)['red_pixels']==0,action_pixels(default))
                point(sx+ax+side/2,sy+ay+side/2)
                hovered=shot(theme+'-'+name+'-hover').crop(area)
                counts=action_pixels(hovered)
                check(theme+' '+name+' hover paints red disc and white glyph',counts['red_pixels']>30*scale*scale and counts['white_pixels']>5*scale*scale,counts)
                margins=glyph_margins(hovered,scale)
                check(theme+' '+name+' glyph keeps design breathing room',margins is not None and min(margins)>=math.floor(3*scale),{'margins_px':margins,'minimum_dip':3})
                if name=='copy':
                    app.click(sx+ax+side/2,sy+ay+side/2); feedback=shot(theme+'-copy-feedback').crop(area)
                    expected='Ameow Next · Phase 1 mock diagnostic\nE_MOCK_DOWNLOAD: simulated download failure\nNo backend request was made.'
                    check(theme+' Copy writes actual mock diagnostic',app.clipboard()==expected,{'clipboard_matched':app.clipboard()==expected})
                    app.wait(1.05); after=shot(theme+'-copy-restored').crop(area)
                    feedback_state=feedback_pixels(hovered,feedback,after)
                    check(theme+' Copy changes icon and restores after 900ms',all(feedback_state.values()),feedback_state)
                neutral(); left=shot(theme+'-'+name+'-leave').crop(area)
                check(theme+' '+name+' leave restores quiet default',action_pixels(left)['red_pixels']==0 and ImageChops.difference(default,left).getbbox() is None,action_pixels(left))
                control_images.extend([(theme+' '+name+' '+label,im.resize((im.width*3,im.height*3),Image.Resampling.NEAREST)) for label,im in [('default',default),('hover',hovered),('leave',left)]])
        sheet('controls.png',control_images,3)
        app.key('R'); select('1','Resolving','night',False); neutral()
        frames=[]; times=[]; profiles=[]
        for _ in range(15):
            image=shot(); frames.append(image.crop(ring_area)); times.append(time.perf_counter())
            profiles.append(radial_profile(image,center,diameter/2+3,scale,background)); app.wait(.065)
        differences=[sum(abs(a-b)>=3 for a,b in zip(profiles[0],profile)) for profile in profiles[1:]]
        check('animated Resolving halo follows actual arc rotation',max(differences)>=24,differences)
        def movie(name,images,times):
            delays=[max(20,round((b-a)*1000)) for a,b in zip(times,times[1:])]+[150]
            images[0].save(out/name,save_all=True,append_images=images[1:],duration=delays,loop=0)
        movie('resolving.gif',frames,times)
        frames=[];times=[]; stages=[]
        for key in ['2','+','+','3','4','5']:
            app.key(key)
            for _ in range(4):
                app.wait(.06); frames.append(shot().crop(ring_area)); times.append(time.perf_counter())
            stages.append(read_jsonl(out/'telemetry.jsonl')[-1])
        movie('states.gif',frames,times)
        check('animated fixture changes progress and state on screen',
              stages[1]['progress']>stages[0]['progress'] and stages[2]['progress']>stages[1]['progress'] and
              [s['stage'] for s in stages]==['Downloading','Downloading','Downloading','Transcoding','Success','Failure'] and
              len({im.tobytes() for im in frames})>6,stages)
        result['dynamic_samples']={'times_s':times,'distinct_frames':len({im.tobytes() for im in frames})}
        app.key('0'); app.save_host()
    except Exception as error:
        result['error']={'type':type(error).__name__,'message':str(error)}
        print('STOP RETAIN: '+str(error),flush=True)
    finally:
        if app:
            app.close(); result['exit_code']=app.proc.returncode
            result['checks'].append({'name':'owned fixture exited normally','status':'PASS' if app.proc.returncode==0 else 'FAIL','observed':app.proc.returncode})
        result['overall']='PASS' if result['checks'] and all(x['status']=='PASS' for x in result['checks']) and 'error' not in result else 'FAIL'
        (out/'ui-regression.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    return 0 if result['overall']=='PASS' else 1


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
                        counts=action_pixels(action)
                        red=counts['red_pixels']; white=counts['white_pixels']
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
        feedback_state=feedback_pixels(copy_before.crop(action_area),copy_feedback.crop(action_area),copy_after.crop(action_area))
        showed_feedback=feedback_state['feedback_icon_changed']
        returned_copy=feedback_state['original_copy_restored']
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
    parser.add_argument("--ui-regression",action="store_true",help="Current fixture controls/ring intent gate (does not run historical workflow assumptions)")
    parser.add_argument("--source",type=Path,default=Path(__file__).resolve().parents[1],help="Source package matching the executable")
    args=parser.parse_args()
    raise SystemExit(validate_ui_regression(args.exe,args.out,args.source) if args.ui_regression else validate(args.exe,args.out))
