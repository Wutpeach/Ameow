"""Isolated retention replay after a failed broad-suite observation; no code change."""
import json
from pathlib import Path
from polish_d_run import MagneticRuntime
from repair_a_runtime import read_jsonl

if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]
    jobs=[('baseline-a','a',True),('current-a','a',False),('current-b-1','b',False),('current-b-2','b',False)]
    results=[]
    for name,variant,baseline in jobs:
        out=root/'evidence/polish-d/retention-recheck'/name;out.mkdir(parents=True,exist_ok=True)
        exe=root/('target/polish-d-baseline/ameow-next.exe' if baseline else 'target/release/ameow-next.exe')
        telemetry=out/'stages.jsonl';args=['--telemetry',str(telemetry.resolve()),'--night']
        if not baseline:args+=['--magnetic',variant]
        app=None
        try:
            app=MagneticRuntime(exe,out,'converged',extra_args=args)
            app.inside();app.wait(.85);app.click(114,114);app.key('1');app.wait(.1)
            app.event('failure',lambda:app.key('5'));app.wait(.12)
            app.event('outside',app.outside);app.wait(4.65);before=app.rect();app.wait(1.25);after=app.rect();app.save_host()
        finally:
            if app:app.close()
        f=read_jsonl(telemetry);failure=next(x for x in f if x['stage']=='Failure');idle=next((x for x in f if x['ms']>failure['ms'] and x['stage']=='Idle'),None)
        tail=[x for x in f if failure['ms']<=x['ms']<=failure['ms']+6000]
        entry={'name':name,'before':before,'after':after,'failure_start_ms':failure['ms'],'first_idle_ms':idle['ms'] if idle else None,'observed_retention_ms':idle['ms']-failure['ms'] if idle else None,'outside_samples':sum(not x['pointer'] for x in tail),'reentry_samples_after_leave':sum(x['pointer'] for x in tail if x['ms']>failure['ms']+300),'pass':before[2]-before[0]==228 and after[2]-after[0]==80 and idle is not None and abs(idle['ms']-failure['ms']-5000)<=40}
        results.append(entry);(out/'result.json').write_text(json.dumps(entry,indent=2),encoding='utf-8');print(json.dumps(entry),flush=True)
    (root/'evidence/polish-d/retention-recheck/summary.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    raise SystemExit(0 if all(r['pass'] for r in results) else 1)
