"""Focused real cursor drag across currently attached Windows monitors."""
import ctypes as c
from ctypes import wintypes as w
import json
from pathlib import Path
import time
from windows_validate import Runtime, u


class MonitorInfo(c.Structure):
    _fields_=[("size",w.DWORD),("monitor",w.RECT),("work",w.RECT),("flags",w.DWORD)]


def run():
    root=Path(__file__).resolve().parents[1]
    out=root/"evidence/cross-monitor"
    out.mkdir(parents=True,exist_ok=True)
    report={"platform":"Windows","mixed_DPI":"NOT VERIFIED"}
    app=None
    monitors=[]
    @c.WINFUNCTYPE(w.BOOL,w.HANDLE,w.HDC,c.POINTER(w.RECT),w.LPARAM)
    def visit(h,_,r,p):
        info=MonitorInfo();info.size=c.sizeof(info)
        if u.GetMonitorInfoW(h,c.byref(info)):
            monitors.append([info.work.left,info.work.top,info.work.right,info.work.bottom])
        return True
    u.EnumDisplayMonitors(None,None,visit,0)
    report["work_areas"]=monitors
    try:
        if len(monitors)<2:
            report["overall"]="NOT VERIFIED"
        else:
            app=Runtime(root/"target/debug/ameow-next.exe",out)
            x=u.GetSystemMetrics(76);y=u.GetSystemMetrics(77);width=u.GetSystemMetrics(78);height=u.GetSystemMetrics(79)
            app.backdrop.geometry(f"{width}x{height}{x:+d}{y:+d}");app.backdrop.update()
            app.inside();time.sleep(.85);app.click(40,40);app.key("1");time.sleep(.2)
            before=app.rect();before_dpi=u.GetDpiForWindow(app.hwnd)
            start=(before[0]+40,before[1]+40)
            dest=next(m for m in monitors if not(m[0]<=start[0]<m[2] and m[1]<=start[1]<m[3]))
            app.move(*start);u.mouse_event(2,0,0,0,0);time.sleep(.07)
            end=(dest[2]-3,dest[3]-3)
            for step in range(1,25):
                app.move(start[0]+(end[0]-start[0])*step/24,start[1]+(end[1]-start[1])*step/24)
                time.sleep(.035)
            time.sleep(.2);u.mouse_event(4,0,0,0,0);time.sleep(.4)
            after=app.rect();after_dpi=u.GetDpiForWindow(app.hwnd)
            app.snap("full-cross-monitor-edge")
            report.update(before=before,after=after,destination_work_area=dest,before_dpi=before_dpi,after_dpi=after_dpi)
            report["overall"]="PASS" if before_dpi==after_dpi and after[0]>=dest[0] and after[1]>=dest[1] and after[2]<=dest[2] and after[3]<=dest[3] and after[2]-after[0]==round(228*after_dpi/96) else "FAIL"
    except Exception as e:
        report["overall"]="FAIL";report["error"]={"type":type(e).__name__,"message":str(e)}
    finally:
        if app:app.close()
        (out/"validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return 0 if report["overall"]=="PASS" else 1


if __name__=="__main__":
    raise SystemExit(run())
