"""Analyze native observations, never equate render callbacks with presentation."""
import json
import math
from pathlib import Path
from repair_a_runtime import read_jsonl


def norm(v):
    return math.hypot(*v)


def diff(a,b):
    return norm([x-y for x,y in zip(a,b)])


def distribution(values):
    v=sorted(values)
    if not v:return {'n':0}
    return {'n':len(v),'min':v[0],'p50':v[round((len(v)-1)*.5)],'p95':v[round((len(v)-1)*.95)],'p99':v[round((len(v)-1)*.99)],'max':v[-1]}


def settled(f):
    return f['target_full'] and f['rawfullness']==1 and f['velocity']==0 and f['surface_extra']==0 and f['settlephase']=='rest'


def analyze(folder):
    frames=read_jsonl(folder/'frames.jsonl'); run=json.loads((folder/'run.json').read_text()); host=json.loads((folder/'host.json').read_text())
    result={'run':folder.name,'variant':run['variant'],'night':run['night'],'baseline':run['baseline'],'exe_sha256':host['exe_sha256'],'frames':len(frames),'checks':[],'display':host['display']}
    def check(name,condition,observed):result['checks'].append({'name':name,'status':'PASS' if condition else 'FAIL','observed':observed})
    hframes=[f for f in frames if 'hover' in f]
    stable=[f for f in hframes if settled(f) and f['hover']['eligible'] and not f['reduced'] and f['hover'].get('variant','a')==run['variant']]
    check('native trace completed',run['overall']=='PASS',run['overall'])
    check('visual vector cap3',all(norm(f['hover']['current_offset'])<=3.00001 for f in hframes),max(norm(f['hover']['current_offset']) for f in hframes))
    check('target vector cap3',all(norm(f['hover']['target_offset'])<=3.00001 for f in hframes),max(norm(f['hover']['target_offset']) for f in hframes))
    suppressed=[f for f in hframes if not settled(f)]
    check('Compact/morph/settle clear visual offset',bool(suppressed) and all(f['hover']['current_offset']==[0,0] and f['hover'].get('velocity',[0,0])==[0,0] for f in suppressed),len(suppressed))
    reduced=[f for f in hframes if f['reduced']]
    check('Reduced Motion clears target/offset/velocity',bool(reduced) and all(f['hover']['target_offset']==[0,0] and f['hover']['current_offset']==[0,0] and f['hover'].get('velocity',[0,0])==[0,0] for f in reduced),len(reduced))
    locked=[f for f in hframes if any(f['hover']['locks'])]
    check('drag/menu/drop suppress target',bool(locked) and all(f['hover']['target_offset']==[0,0] for f in locked),{'frames':len(locked),'observed_locks':sorted(set(tuple(f['hover']['locks']) for f in locked)),'OS_drop':'NOT VERIFIED; deterministic model/module tests only'})
    check('native request and anchor fixed in settled Full',bool(stable) and all(f['native_request']==[500,300,228,228] and f['anchor']==[514,314] for f in stable),len(stable))
    shadow_keys=['shadow_surface','shadow_blur','shadow_offset','shadow_alpha','radius']
    shadow={key:sorted(set(f[key] for f in stable)) for key in shadow_keys}
    check('normal shadow/radius do not pulse',all(len(v)==1 for v in shadow.values()),shadow)
    centre=[f for f in stable if f['hover']['rest_pointer']==[100,100]]
    neighbours=[f for f in stable if f['hover']['rest_pointer'] in [[104,100],[100,104],[96,100],[100,96]]]
    check('strict centre target zero',bool(centre) and all(f['hover']['target_offset']==[0,0] for f in centre),len(centre))
    expected_b=run['variant']=='b'
    check('centre neighbours respond in B / quiet in A',bool(neighbours) and all((norm(f['hover']['target_offset'])>.1 if expected_b else f['hover']['target_offset']==[0,0]) for f in neighbours),{'frames':len(neighbours),'target_magnitude':distribution([norm(f['hover']['target_offset']) for f in neighbours]),'actual_magnitude':distribution([norm(f['hover']['current_offset']) for f in neighbours])})
    if expected_b:
        errors=[]
        for f in stable:
            d=[v-100 for v in f['hover']['rest_pointer']];r=norm(d)
            target=[0,0] if r==0 else [v*3*math.tanh(r/105)/r for v in d]
            errors.append(diff(target,f['hover']['target_offset']))
        check('whole Surface and gutter follow continuous radial map',max(errors)<.000003,distribution(errors))
        b=[f for f in hframes if f['hover'].get('variant')=='b']
        advanced=[f for f in b if f['hover']['step_ms']>0]
        check('active Spring integrates current target',bool(advanced) and all(f['hover']['integrated_target']==f['hover']['target_offset'] for f in advanced),len(advanced))
        check('bounded Spring frame time',all(0<=f['hover']['step_ms']<=50 for f in b),distribution([f['hover']['step_ms'] for f in b]))
        sleeping=[]
        for previous,current in zip(hframes,hframes[1:]):
            ph=previous['hover'];ch=current['hover']
            if ph.get('variant')=='b' and ch.get('variant')=='b' and ph['current_offset']==ph['target_offset'] and ph['velocity']==[0,0] and ch['target_changed']:
                sleeping.append(current)
        check('first new target after sleep owns zero idle time',bool(sleeping) and all(f['hover']['step_ms']==0 for f in sleeping),len(sleeping))
        result['old_target_mismatch_on_changed_active_samples']=sum(f['hover']['integrated_target']!=f['hover']['target_offset'] for f in advanced if f['hover']['target_changed'])
    active_intervals=[];deltas=[];force_changes=[];reversals=[]
    for previous,current in zip(hframes,hframes[1:]):
        ph=previous['hover'];ch=current['hover']
        if settled(previous) and settled(current) and ph.get('variant',run['variant'])==ch.get('variant',run['variant'])==run['variant']:
            if diff(ph['current_offset'],ph['target_offset'])>.001 or norm(ph.get('velocity',[0,0]))>.01:
                active_intervals.append(current['dt_actual_ms'])
            deltas.append(diff(ph['current_offset'],ch['current_offset']))
            if ph['target_offset'][0]*ch['target_offset'][0]<0:
                force_changes.append({'ms':current['ms'],'before_offset':ph['current_offset'],'after_offset':ch['current_offset'],'velocity':ch.get('velocity'),'dt_actual_ms':current['dt_actual_ms'],'integrated_target':ch.get('integrated_target'),'target':ch['target_offset']})
                end=next((f['ms'] for f in hframes if f['ms']>=current['ms'] and f['ms']<=current['ms']+100 and f['hover'].get('velocity',[0,0])[0]*ch['target_offset'][0]>0),None)
                if end is not None:reversals.append(end-current['ms'])
    result['active_render_interval_ms']=distribution(active_intervals)
    result['active_render_gaps_gt33_34ms']=sum(v>33.34 for v in active_intervals)
    result['active_render_gaps_gt50ms']=sum(v>50 for v in active_intervals)
    result['per_callback_offset_delta_px']=distribution(deltas)
    result['reversal_evidence']=force_changes
    result['observed_reversal_velocity_sign_response_ms']=distribution(reversals)
    result['max_speed_px_per_second']=max((norm(f['hover']['velocity']) for f in hframes if f['hover'].get('variant')=='b'),default=0) if run['variant']=='b' else None
    result['cpu_render_us']=distribution([f['cpu_render_us'] for f in hframes])
    # A sustained pointer-leave while Active keeps Full alive; compare zero-target return.
    leave_start=next((i for i in range(1,len(hframes)) if hframes[i-1]['hover']['eligible'] and not hframes[i]['hover']['eligible'] and settled(hframes[i]) and not any(hframes[i]['hover']['locks']) and norm(hframes[i-1]['hover']['current_offset'])>1),None)
    if leave_start is not None:
        begin=hframes[leave_start];end=next((f for f in hframes[leave_start:] if settled(f) and f['hover']['current_offset']==[0,0] and f['hover'].get('velocity',[0,0])==[0,0]),None)
        result['retained_leave_exact_zero_ms']=end['ms']-begin['ms'] if end else None
        check('retained leave converges with no residual',end is not None and end['ms']-begin['ms']<650,result['retained_leave_exact_zero_ms'])
    variants=sorted(set(f['hover'].get('variant','a') for f in hframes))
    if not run['baseline']:
        check('M switches both variants',variants==['a','b'],variants)
        switched=[f for previous,f in zip(hframes,hframes[1:]) if previous['hover']['variant']!=f['hover']['variant']]
        check('M starts from rest with no retired residual',len(switched)==2 and all(f['hover']['current_offset']==[0,0] and f['hover']['velocity']==[0,0] for f in switched),len(switched))
    result['limits']='Measured render-entry CPU timestamps; not GPU/DWM presentation or subjective smoothness. Long idle gaps excluded only when previous selected motion already converged. Screenshot recording is separate. AA defect inherited; no border fix. OS drop, mixed DPI, macOS NOT VERIFIED.'
    result['overall']='PASS' if all(c['status']=='PASS' for c in result['checks']) else 'FAIL'
    (folder/'analysis.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    return result


if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]/'evidence/polish-d'
    results=[analyze(p) for p in sorted((root/'matched').iterdir()) if (p/'run.json').exists()]
    (root/'analysis.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    for result in results:
        print(json.dumps({k:result[k] for k in ['run','overall','frames','active_render_interval_ms','retained_leave_exact_zero_ms']}),flush=True)
        for c in result['checks']:
            if c['status']=='FAIL':print(json.dumps(c),flush=True)
    raise SystemExit(0 if all(r['overall']=='PASS' for r in results) else 1)
