"""Focused actual reduced-motion switch during an endpoint pulse."""
import json
from pathlib import Path
import time
from repair_a_runtime import RepairRuntime,CropCapture,read_jsonl


def run(motion):
    root=Path(__file__).resolve().parents[1];out=root/'evidence/repair-a/focused'/motion
    app=None;capture=None;report={'motion':motion,'scope':'Actual keyboard Reduced switch while endpoint settle is active; no performance claim.'}
    try:
        app=RepairRuntime(root/'target/release/ameow-next.exe',out,motion,lifetime=15000)
        capture=CropCapture((490,290,750,550))
        app.inside();app.wait(.6);app.click(40,40);app.outside();app.wait(.85)
        app.event('expand-for-settle',app.inside)
        deadline=time.perf_counter()+1.5
        while app.size()!=[228,228] and time.perf_counter()<deadline:app.wait(.008)
        app.wait(.055)
        image=capture.grab();app.capture_guard(image);image.save(out/'before-reduced.png')
        app.event('reduced-on-at-endpoint',lambda:app.key('R'));app.wait(.12)
        image=capture.grab();app.capture_guard(image);image.save(out/'after-reduced.png')
        report['after_reduced_size']=app.size()
        app.outside();app.wait(.2);report['compact_reduced_size']=app.size()
        app.inside();app.wait(.2);report['full_reduced_size']=app.size()
        app.save_host()
    except Exception as e:report['error']={'type':type(e).__name__,'message':str(e)}
    finally:
        if capture:capture.close()
        if app:app.close()
    frames=read_jsonl(out/'frames.jsonl')
    handoff=next((i for i in range(1,len(frames)) if frames[i]['reduced'] and not frames[i-1]['reduced']),None)
    if handoff is not None:
        local=frames[max(0,handoff-3):handoff+5]
        report['reduced_local_frames']=local
        report['pulse_before_reduced']=frames[handoff-1]['surface_extra']
        report['pulse_after_reduced']=frames[handoff]['surface_extra']
        report['status']='PASS' if report['pulse_before_reduced']>.03 and report['pulse_after_reduced']==0 and report.get('after_reduced_size')==[228,228] and report.get('compact_reduced_size')==[80,80] and report.get('full_reduced_size')==[228,228] else 'FAIL'
    else:report['status']='FAIL'
    out.mkdir(parents=True,exist_ok=True);(out/'observations.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'motion':motion,'status':report['status'],'pulse_before':report.get('pulse_before_reduced'),'pulse_after':report.get('pulse_after_reduced')}),flush=True)
    return report['status']=='PASS'


if __name__=='__main__':
    passed=[run(m) for m in ('a-soft','a-crisp')]
    raise SystemExit(0 if all(passed) else 1)
