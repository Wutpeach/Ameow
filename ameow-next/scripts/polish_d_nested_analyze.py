"""Reference mapping/response, runtime regressions and callback measurements.
Keep prior D analyzer/evidence unchanged; no claim of GPU presentation smoothness.
"""
import json
import math
from pathlib import Path
from repair_a_runtime import read_jsonl
from polish_d_analyze import distribution, settled, norm, diff
from polish_d_nested_reference import Follow, target

ROOT = Path(__file__).resolve().parents[1] / 'evidence/polish-d-nested'

def analyze(folder):
    frames = [f for f in read_jsonl(folder/'frames.jsonl') if 'hover' in f]
    run = json.loads((folder/'run.json').read_text())
    host = json.loads((folder/'host.json').read_text())
    mode = 'prior' if folder.name.startswith('prior') else 'nested'
    variant = run['variant']
    checks = []
    def check(name, passed, observed):
        checks.append(dict(name=name,status='PASS' if passed else 'FAIL',observed=observed))
    chosen = [f for f in frames if f['hover']['variant']==variant]
    stable = [f for f in chosen if settled(f) and f['hover']['eligible'] and not f['reduced']]
    check('native replay completed', run['overall']=='PASS', run['overall'])
    check('actual and target vector cap3', all(norm(f['hover'][k])<=3.00001 for f in frames for k in ('current_offset','target_offset')), max(norm(f['hover']['current_offset']) for f in chosen))
    suppressed = [f for f in chosen if not settled(f) or f['reduced'] or not f['hover']['enabled']]
    check('suppression immediately clears residual', bool(suppressed) and all(f['hover']['current_offset']==[0,0] and f['hover']['velocity']==[0,0] and f['hover']['target_offset']==[0,0] for f in suppressed), len(suppressed))
    locks = [f for f in chosen if any(f['hover']['locks'])]
    check('menu/drag locks aim zero', bool(locks) and all(f['hover']['target_offset']==[0,0] for f in locks), sorted(set(tuple(f['hover']['locks']) for f in locks)))
    check('native bounds/rest anchor unchanged', bool(stable) and all(f['native_request']==[500,300,228,228] and f['anchor']==[514,314] for f in stable), len(stable))
    shadow = {k: sorted(set(f[k] for f in stable)) for k in ('shadow_surface','shadow_blur','shadow_offset','shadow_alpha','radius')}
    check('normal shadow parameters fixed', all(len(v)==1 for v in shadow.values()), shadow)
    centre = [f for f in stable if f['hover']['rest_pointer']==[100,100]]
    near = [f for f in stable if f['hover']['rest_pointer'] in [[104,100],[96,100],[100,104],[100,96]]]
    check('centre zero/neighbours continuous', bool(centre) and bool(near) and all(f['hover']['target_offset']==[0,0] for f in centre) and all(norm(f['hover']['target_offset'])>.1 if variant=='b' else f['hover']['target_offset']==[0,0] for f in near), {'near_samples':len(near),'target_magnitudes':distribution([norm(f['hover']['target_offset']) for f in near])})
    switches = [f for p,f in zip(frames,frames[1:]) if p['hover']['variant']!=f['hover']['variant']]
    check('M switches and starts from rest', len(switches)==2 and all(f['hover']['current_offset']==[0,0] and f['hover']['velocity']==[0,0] for f in switches), len(switches))
    response_errors, velocity_errors, mapping_errors = [], [], []
    if mode=='nested' and variant=='b':
        for f in stable:
            mapping_errors.append(diff(target(f['hover']['rest_pointer']),f['hover']['target_offset']))
        check('Nested target shape across Surface/gutter', max(mapping_errors)<.000003, distribution(mapping_errors))
        oracle = Follow()
        for f in frames:
            h=f['hover']
            if h['variant']!='b':
                oracle = Follow()
                continue
            position,velocity = oracle.sample(f['ms'],h['target_offset'],not settled(f) or f['reduced'] or not h['enabled'])
            response_errors.append(diff(position,h['current_offset']))
            velocity_errors.append(diff(velocity,h['velocity']))
        check('native samples match independent analytic oracle', max(response_errors)<.0002 and max(velocity_errors)<.002, {'position_error':distribution(response_errors),'velocity_error':distribution(velocity_errors)})
        sleeps=[f for p,f in zip(chosen,chosen[1:]) if p['hover']['current_offset']==p['hover']['target_offset'] and p['hover']['velocity']==[0,0] and f['hover']['target_changed']]
        check('new target owns no sleeping elapsed', bool(sleeps) and all(f['hover']['step_ms']==0 for f in sleeps), len(sleeps))
    intervals, deltas, reversals = [], [], []
    for p,f in zip(chosen,chosen[1:]):
        ph,h=p['hover'],f['hover']
        if settled(p) and settled(f):
            if norm(ph['velocity'])>.01 or diff(ph['current_offset'],ph['target_offset'])>.001:
                intervals.append(f['dt_actual_ms'])
            deltas.append(diff(ph['current_offset'],h['current_offset']))
            if ph['target_offset'][0]*h['target_offset'][0]<0:
                end=next((s for s in chosen if f['ms']<=s['ms']<=f['ms']+250 and s['hover']['velocity'][0]*h['target_offset'][0]>0),None)
                if end: reversals.append(end['ms']-f['ms'])
    leaves = [i for i in range(1,len(chosen)) if chosen[i-1]['hover']['eligible'] and not chosen[i]['hover']['eligible'] and settled(chosen[i]) and not any(chosen[i]['hover']['locks']) and norm(chosen[i-1]['hover']['current_offset'])>1]
    return_ms=[]
    interrupted_returns=[]
    for i in leaves:
        first=chosen[i]
        for f in chosen[i:]:
            if not settled(f) or f['hover']['target_offset'] != [0,0]:
                interrupted_returns.append({'start_ms':first['ms'],'interrupt_ms':f['ms']})
                break
            if f['hover']['current_offset']==[0,0] and f['hover']['velocity']==[0,0]:
                return_ms.append(f['ms']-first['ms'])
                break
    check('retained leave reaches exact zero', bool(return_ms) and max(return_ms)<=850, return_ms)
    result=dict(run=folder.name,mode=mode,variant=variant,night=run['night'],frames=len(frames),checks=checks,exe_sha256=host['exe_sha256'],display=host['display'],active_render_interval_ms=distribution(intervals),render_gaps_gt33_34ms=sum(x>33.34 for x in intervals),render_gaps_gt50ms=sum(x>50 for x in intervals),offset_delta_px=distribution(deltas),reversal_velocity_sign_ms=distribution(reversals),max_offset=max(norm(f['hover']['current_offset']) for f in chosen),retained_leave_exact_zero_ms=return_ms,limits='CPU render-entry timestamps only, not GPU/DWM presentation or subjective acceptance. Recording separate. GPUI border AA inherited. macOS/mixed DPI/real OLE drop not verified.')
    result['interrupted_returns_not_convergence_samples']=interrupted_returns
    result['overall']='PASS' if all(c['status']=='PASS' for c in checks) else 'FAIL'
    (folder/'analysis.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    return result

if __name__=='__main__':
    results=[analyze(p) for p in sorted((ROOT/'matched').iterdir()) if (p/'run.json').exists()]
    (ROOT/'analysis.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    for r in results:
        print(json.dumps({k:r[k] for k in ('run','overall','frames','max_offset','active_render_interval_ms','retained_leave_exact_zero_ms')}))
        for c in r['checks']:
            if c['status']=='FAIL':print(json.dumps(c))
    raise SystemExit(0 if all(r['overall']=='PASS' for r in results) else 1)
