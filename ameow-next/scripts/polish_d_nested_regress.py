"""Current B runs inherited Repair B workflow and controlled terminal retention.
Historical helpers/evidence remain unchanged; only owned processes are closed.
"""
import argparse
import json
from pathlib import Path
from polish_d_run import MagneticRuntime
import repair_b_run
from repair_b_analyze import analyze as repair_analyze
from repair_a_runtime import read_jsonl
from polish_d_analyze import settled, norm

class BRuntime(MagneticRuntime):
    def __init__(self, exe, out, legacy=False, night=False, lifetime=60000):
        super().__init__(exe,out,'converged',lifetime=lifetime,extra_args=['--magnetic','b']+(['--night'] if night else []))

def retention(exe,out,night):
    app=None;checks=[]
    def check(name,passed,observed):
        checks.append({'name':name,'status':'PASS' if passed else 'FAIL','observed':observed})
    try:
        app=BRuntime(exe,out,night=night)
        app.inside();app.wait(.95);app.click(114,114);app.point(180,100);app.wait(.95)
        for key,duration in [('1',.35),('2',.35),('3',.35)]:
            app.key(key);app.outside();app.wait(duration)
            check('active'+key+' retains Full',app.size()==[228,228],app.rect())
            app.point(180,100);app.wait(.3)
        for key,hold in [('4',1.5),('5',5.0)]:
            app.point(180,100);app.wait(.3);app.event('terminal-'+key,lambda key=key:app.key(key))
            app.outside();app.wait(hold-.25)
            check('terminal'+key+' retained before expiry',app.size()==[228,228],app.rect())
            app.wait(.95)
            check('terminal'+key+' outside collapses after expiry',app.size()==[80,80],app.rect())
            app.inside();app.wait(.95);app.click(114,114)
        app.save_host()
        frames=read_jsonl(out/'frames.jsonl')
        check('B selected throughout',all(f['hover']['variant']=='b' for f in frames),len(frames))
        suppressed=[f for f in frames if not settled(f)]
        check('morph/Compact/endpoint retire B',bool(suppressed) and all(f['hover']['current_offset']==[0,0] and f['hover']['velocity']==[0,0] for f in suppressed),len(suppressed))
        check('cap maintained',all(norm(f['hover']['current_offset'])<=3.00001 for f in frames),max(norm(f['hover']['current_offset']) for f in frames))
        report={'checks':checks,'overall':'PASS' if all(c['status']=='PASS' for c in checks) else 'FAIL','limits':'Real pointer outside controlled; drop-lock module tests only, OS OLE drop not verified.'}
    except Exception as error:
        report={'overall':'FAIL','error':str(error),'checks':checks}
    finally:
        if app:app.close()
    out.mkdir(parents=True,exist_ok=True);(out/'run.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report),flush=True)
    return report['overall']=='PASS'

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--exe',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--night',action='store_true');a=p.parse_args()
    repair_b_run.RepairB=BRuntime
    r=repair_b_run.run(a.exe,a.out/'repair-b',night=a.night,cycles=3)
    analysis=repair_analyze(a.out/'repair-b')
    extra={'native_width_range':analysis['actual_native_width_range'],'anchor_error':analysis['after_init_anchor_error'],'viewport_mismatch':analysis['after_init_viewport_mismatch'],'endpoint_pulse':analysis['endpoint_pulse']}
    print(json.dumps(extra),flush=True)
    passed=r.get('behavior_pass') and analysis['actual_native_width_range']==[80,228] and analysis['after_init_anchor_error']['max']<=1 and analysis['after_init_viewport_mismatch']==0
    for endpoint,limit in [('Full',2.5),('Compact',.85)]:
        entry=analysis['endpoint_pulse'][endpoint]
        passed=passed and entry['extra_peak'] is not None and entry['extra_peak']<=limit+.00001 and all(len(v)==1 for v in entry['shadow_unique_values'].values())
    terminal=retention(a.exe,a.out/'retention',a.night)
    summary={'repair_behavior':r.get('behavior_pass'),'repair_metrics':extra,'overall':'PASS' if passed and terminal else 'FAIL'}
    (a.out/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
    raise SystemExit(0 if summary['overall']=='PASS' else 1)
