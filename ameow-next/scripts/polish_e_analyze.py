"""Analyze the observed single6px candidate and actual phase handoff, not feel."""
import json
import math
from pathlib import Path
from repair_a_runtime import read_jsonl
from polish_d_analyze import distribution, norm, diff

ROOT=Path(__file__).resolve().parents[1]/'evidence/polish-e'

def analyze(folder):
    frames=[f for f in read_jsonl(folder/'frames.jsonl') if 'hover' in f]
    run=json.loads((folder/'space.json').read_text())
    checks=[]
    def check(name,passed,observed):checks.append(dict(name=name,status='PASS' if passed else 'FAIL',observed=observed))
    check('native space workflow completes',run['workflow']=='PASS',run['workflow'])
    b=[f for f in frames if f['hover']['variant']=='b']
    check('B selected throughout',len(b)==len(frames),len(b))
    check('vector cap6',all(norm(f['hover']['current_offset'])<=6.00001 for f in b),max(norm(f['hover']['current_offset']) for f in b))
    check('visible6px achieved',any(norm(f['hover']['current_offset'])>=5.999 for f in b),max(norm(f['hover']['current_offset']) for f in b))
    early=[f for f in b if f['rawfullness']<=.9]
    check('earlytravel/Compact visually stable',bool(early) and all(f['hover']['current_offset']==[0,0] for f in early),len(early))
    retiring=[f for f in b if not f['target_full'] or f['reduced'] or not f['hover']['enabled']]
    check('Compact intent/RM/off retires raw and visual',bool(retiring) and all(f['hover']['spring_position']==[0,0] and f['hover']['spring_velocity']==[0,0] and f['hover']['current_offset']==[0,0] for f in retiring),len(retiring))
    fade=[f for f in b if 0<f['hover']['fade_weight']<1]
    check('late expansion has visiblefade beforeFull',bool(fade) and any(norm(f['hover']['current_offset'])>.01 for f in fade),{'frames':len(fade),'first_ms':fade[0]['ms'] if fade else None,'last_ms':fade[-1]['ms'] if fade else None})
    raw_errors=[];velocity_errors=[];target_errors=[]
    for f in b:
        h=f['hover'];weight=h['fade_weight'];wdot=h['fade_velocity']
        raw_errors.append(diff(h['current_offset'],[weight*p for p in h['spring_position']]))
        velocity_errors.append(diff(h['velocity'],[weight*v+wdot*p for p,v in zip(h['spring_position'],h['spring_velocity'])]))
        if h['eligible']:
            d=[v-100 for v in h['rest_pointer']];r=norm(d)
            target_errors.append(diff(h['target_offset'],[v*.12*max(0,1-r/200) for v in d]))
    check('visual position equals weight*Spring',max(raw_errors)<.000003,distribution(raw_errors))
    check('visual velocity includes fade derivative',max(velocity_errors)<.00003,distribution(velocity_errors))
    check('natural6px targetshape',bool(target_errors) and max(target_errors)<.000005,distribution(target_errors))
    stable=[f for f in b if f['rawfullness']==1 and f['target_full']]
    check('Full weight1 no residual derivative',bool(stable) and all(f['hover']['fade_weight']==1 and f['hover']['fade_velocity']==0 for f in stable),len(stable))
    check('settle already magnetic before rest',any(f['settlephase']=='settle' and norm(f['hover']['current_offset'])>.1 for f in stable),sum(f['settlephase']=='settle' for f in stable))
    handoffs=[]
    for previous,current in zip(b,b[1:]):
        ph,h=previous['hover'],current['hover']
        if previous['target_full'] and current['target_full'] and previous['settlephase']!=current['settlephase'] and current['settlephase'] in ('settle','rest'):
            if ph['target_offset']==h['target_offset']:
                handoffs.append({'ms':current['ms'],'from_phase':previous['settlephase'],'to_phase':current['settlephase'],'dt_ms':current['ms']-previous['ms'],'generation_before':ph['axis_generation'],'generation_after':h['axis_generation'],'start_before':ph['axis_started_ms'],'start_after':h['axis_started_ms'],'raw_before':ph['spring_position'],'raw_after':h['spring_position'],'visual_before':ph['current_offset'],'visual_after':h['current_offset'],'fade_before':ph['fade_weight'],'fade_after':h['fade_weight']})
    for handoff in handoffs:
        handoff['segment_start_preserved'] = all(
            before == after or (before is not None and after is None and handoff['ms'] - before >= 800)
            for before, after in zip(handoff['start_before'], handoff['start_after'])
        )
    check('sameaxes continue travel/settle/rest',bool(handoffs) and all(x['generation_before']==x['generation_after'] for x in handoffs),handoffs)
    check('active segment starts preserved at phase handoff',bool(handoffs) and all(x['segment_start_preserved'] for x in handoffs),handoffs)
    core=[f for f in b if f['rawfullness']==1 and f['target_full']]
    check('nativeFull geometry/restanchor preserved',bool(core) and all(f['native_request']==[500,300,228,228] and f['anchor']==[514,314] for f in core),len(core))
    intervals=[]
    for p,f in zip(b,b[1:]):
        if p['hover']['tracking'] and (norm(p['hover']['spring_velocity'])>.01 or diff(p['hover']['spring_position'],p['hover']['target_offset'])>.001):intervals.append(f['dt_actual_ms'])
    timeline=[{k:f[k] for k in ('ms','timestamp_us','rawfullness','velocity','settlephase','surface_extra','native_request','bounds','anchor','hover')} for f in b]
    (folder/'continuous-timeline.json').write_text(json.dumps(timeline,indent=2),encoding='utf-8')
    peaks=[x for x in run['observations'] if x['label'].startswith('peak-')]
    result=dict(theme=run['theme'],frames=len(frames),checks=checks,max_visible_vector=max(norm(f['hover']['current_offset']) for f in b),active_recorded_callback_interval_ms=distribution(intervals),handoffs=handoffs,peak_edges=[{'label':x['label'],'outer_edge_delta':x['outer_edge_delta']} for x in peaks],limits='Recorded CPU callbacks and native crop, not GPU/DWM or subjective acceptance. Space gate is direct visual decision, independent of these mathematical checks.')
    result['behavior_checks']='PASS' if all(c['status']=='PASS' for c in checks) else 'FAIL'
    (folder/'analysis.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({'theme':result['theme'],'behavior_checks':result['behavior_checks'],'max_visible_vector':result['max_visible_vector'],'frames':len(frames)}),flush=True)
    for c in checks:
        if c['status']=='FAIL':print(json.dumps(c),flush=True)
    return result

if __name__=='__main__':
    results=[analyze(p) for p in sorted((ROOT/'space').iterdir()) if (p/'space.json').exists()]
    (ROOT/'analysis.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    raise SystemExit(0 if all(r['behavior_checks']=='PASS' for r in results) else 1)
