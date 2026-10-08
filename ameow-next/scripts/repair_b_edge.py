"""Scoped current-default actual drag/work-area proof."""
import json
from pathlib import Path
import time
from repair_b_runtime import RepairB,CropCapture,u,w


def run():
    root=Path(__file__).resolve().parents[1];out=root/'evidence/repair-b/edge';app=None;cap=None;report={}
    try:
        app=RepairB(root/'target/release/ameow-next.exe',out,lifetime=15000)
        app.inside();app.wait(.7);app.click(40,40);app.key('1');app.wait(.2)
        rect=app.rect();app.move(rect[0]+40,rect[1]+40);u.mouse_event(2,0,0,0,0);time.sleep(.05)
        for i in range(1,21):app.move(rect[0]+40+(2558-rect[0]-40)*i/20,rect[1]+40+(1398-rect[1]-40)*i/20);time.sleep(.02)
        u.mouse_event(4,0,0,0,0);app.wait(.2);app.key('0');app.outside();app.wait(.8)
        app.samples=[]
        for i in range(2):
            app.event('expand',app.inside,i);app.wait(.7);app.event('collapse',app.outside,i);app.wait(.75)
        rect=app.rect();inside=all(s['bounds'][0]>=0 and s['bounds'][1]>=0 and s['bounds'][2]<=2560 and s['bounds'][3]<=1400 for s in app.samples)
        widths=[s['width'] for s in app.samples]
        fixed=(min(rect[0]-12,2300),min(rect[1]-12,1140),min(rect[0]-12,2300)+260,min(rect[1]-12,1140)+260)
        cap=CropCapture(fixed);im=cap.grab();app.capture_guard(im);im.save(out/'compact.png')
        report={'status':'PASS' if inside and min(widths)>=80 and max(widths)<=228 else 'FAIL','work_area':[0,0,2560,1400],'actual_width_range':[min(widths),max(widths)],'all_actual_bounds_inside':inside,'final_bounds':rect,'limits':'Actual primary work-area containment; no claim exact right/bottom contact, mixed DPI or macOS.'};app.save_host()
    except Exception as e:report={'status':'FAIL','error':str(e)}
    finally:
        if cap:cap.close()
        if app:app.close()
        out.mkdir(parents=True,exist_ok=True);(out/'observations.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report),flush=True);return report['status']=='PASS'


if __name__=='__main__':raise SystemExit(0 if run() else 1)
