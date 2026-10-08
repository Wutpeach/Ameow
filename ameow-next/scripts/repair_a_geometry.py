"""Narrow native flag / B edge observations, not production adoption."""
import json
from pathlib import Path
import time
from repair_a_runtime import RepairRuntime,CropCapture,u,w


def flags(root):
    out=root/'evidence/repair-a/focused/init-only';app=None;cap=None;r={}
    try:
        app=RepairRuntime(root/'target/release/ameow-next.exe',out,'baseline',native_flags='init-only',lifetime=12000)
        cap=CropCapture((490,290,750,550))
        app.inside();app.wait(.7);full=app.rect();im=cap.grab();app.capture_guard(im);im.save(out/'full.png')
        center=im.getpixel((124,124))[:3];far=im.getpixel((200,124))[:3]
        app.outside();app.wait(.7);compact=app.rect();im=cap.grab();app.capture_guard(im);im.save(out/'compact.png')
        hit=u.WindowFromPoint(w.POINT(full[0]+180,full[1]+180))==app.hwnd
        r.update(full=full,compact=compact,full_center=center,full_far_interior=far,old_full_point_owned=hit)
        r['status']='PASS' if full[2]-full[0]==228 and compact[2]-compact[0]==80 and center==(255,255,255) and far==(255,255,255) and not hit else 'FAIL'
        app.save_host()
    except Exception as e:r.update(status='FAIL',error=str(e))
    finally:
        if cap:cap.close()
        if app:app.close()
    (out/'geometry.json').write_text(json.dumps(r,indent=2),encoding='utf-8');print(json.dumps(r),flush=True)


def b_edge(root):
    out=root/'evidence/repair-a/focused/b-edge';app=None;cap=None;r={}
    try:
        app=RepairRuntime(root/'target/release/ameow-next.exe',out,'b',lifetime=16000)
        app.inside();app.wait(.7);app.click(40,40);app.key('1');app.wait(.2)
        b=app.rect();app.move(b[0]+40,b[1]+40);u.mouse_event(2,0,0,0,0);time.sleep(.05)
        for i in range(1,21):app.move(b[0]+40+(2558-b[0]-40)*i/20,b[1]+40+(1398-b[1]-40)*i/20);time.sleep(.02)
        u.mouse_event(4,0,0,0,0);app.wait(.3);app.key('0');app.outside();app.wait(.8)
        cycle=[]
        for i in range(3):
            app.event('expand',app.inside,i);app.wait(.7);app.event('collapse',app.outside,i);app.wait(.8)
        for item in app.samples:
            rect=item['bounds'];cycle.append(rect[0]>=0 and rect[1]>=0 and rect[2]<=2560 and rect[3]<=1400)
        latest=app.rect();fixed=(min(latest[0]-12,2300),min(latest[1]-12,1140),min(latest[0]-12,2300)+260,min(latest[1]-12,1140)+260)
        cap=CropCapture(fixed);im=cap.grab();app.capture_guard(im);im.save(out/'compact-edge.png')
        r.update(status='PASS' if all(cycle) else 'FAIL',work_area=[0,0,2560,1400],actual_sampled_width_range=[min(s['width'] for s in app.samples),max(s['width'] for s in app.samples)],all_owned_samples_inside_work_area=all(cycle),last_bounds=latest,limitation='Current 96 DPI primary monitor only. Endpoint bounds deliberately overshoot; no implication for mixed DPI/macOS.')
        app.save_host()
    except Exception as e:r.update(status='FAIL',error=str(e))
    finally:
        if cap:cap.close()
        if app:app.close()
    out.mkdir(parents=True,exist_ok=True);(out/'geometry.json').write_text(json.dumps(r,indent=2),encoding='utf-8');print(json.dumps(r),flush=True)


if __name__=='__main__':
    import sys
    root=Path(__file__).resolve().parents[1]
    if '--b-only' not in sys.argv:flags(root)
    b_edge(root)
