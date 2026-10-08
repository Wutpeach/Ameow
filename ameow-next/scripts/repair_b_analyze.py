"""Repair B scoped model/native observations from recorded real interaction."""
import json
from pathlib import Path
from repair_b_runtime import read_jsonl
from repair_a_analyze import distribution


def analyze(folder):
    frames=read_jsonl(folder/'frames.jsonl');native=read_jsonl(folder/'native.jsonl');host=json.loads((folder/'host.json').read_text());run=json.loads((folder/'run.json').read_text())
    flips=[];pulses=[];first=[];reduced=[];anchor=[];vp=[]
    initialized=False
    for i,f in enumerate(frames):
        b=f['bounds'];width=b[2]-b[0]
        if b==[504,304,584,384]:initialized=True
        if initialized:
            gutter=10+4*(width-80)/148;anchor.append(max(abs(b[k]+gutter-f['anchor'][k]) for k in (0,1)))
            if f['viewport']!=[width,b[3]-b[1]]:vp.append(f['ms'])
        if i and f['target_full']!=frames[i-1]['target_full']:
            keys=('ms','rawfullness','velocity','surface_extra','extra_velocity','settlephase','target_full','native_request','bounds','dt_actual_ms')
            flips.append({'previous_extra':frames[i-1]['surface_extra'],'local':[{k:x.get(k) for k in keys} for x in frames[max(0,i-2):i+5]]})
            first.append({'target_full':f['target_full'],'rawfullness':f['rawfullness'],'request':f['native_request'],'extra':f['surface_extra'],'ms':f['ms']})
        if i and f['reduced'] and not frames[i-1]['reduced']:
            reduced.append({'previous_extra':frames[i-1]['surface_extra'],'new_extra':f['surface_extra'],'phase':f['settlephase'],'frames':frames[max(0,i-2):i+3]})
        if f['settlephase']=='settle' and f['surface_extra']>0:
            pulses.append(f)
    endpoint={};pulse_episodes=[]
    for i,f in enumerate(frames):
        if f['settlephase']=='settle' and (not i or frames[i-1]['settlephase']!='settle'):
            end=next((j for j in range(i+1,len(frames)) if frames[j]['settlephase']!='settle'),len(frames)-1)
            pulse_episodes.append({'endpoint':'Full' if f['target_full'] else 'Compact','first_sample_ms':f['ms'],'last_settle_sample_ms':frames[end-1]['ms'],'next_phase':frames[end]['settlephase'],'duration_until_next_sample_ms':frames[end]['ms']-f['ms'],'peak_extra':max(x['surface_extra'] for x in frames[i:end]),'limit':'Observed CPU sampled phase duration; actual analytic start may precede firstsample by one callback, interrupted transfer episodes are not full pulse durations.'})
    for label,target in [('Full',True),('Compact',False)]:
        group=[f for f in pulses if f['target_full']==target]
        fields=('shadow_surface','shadow_blur','shadow_offset','shadow_alpha','radius')
        endpoint[label]={'pulse_frames':len(group),'extra_peak':max((f['surface_extra'] for f in group),default=None),'shadow_unique_values':{key:sorted(set(f[key] for f in group if key in f)) for key in fields}}
    samples=host['samples'];widths=[f['width'] for f in samples]
    native_arrivals=[]
    for j,e in enumerate(host['events']):
        if e['name'] not in ('expand','collapse'):continue
        end=host['events'][j+1]['host_ms'] if j+1<len(host['events']) else samples[-1]['host_ms']
        seg=[s for s in samples if e['host_ms']<=s['host_ms']<end];target=228 if e['name']=='expand' else 80
        arrival=next((s for s in seg if s['width']==target),None)
        native_arrivals.append({'cycle':e['cycle'],'phase':e['name'],'exact_native_arrival_ms':arrival['host_ms']-e['host_ms'] if arrival else None})
    result={'name':folder.name,'run':run,'frames':len(frames),'exe_sha256':host['exe_sha256'],'display':host['display'],'first_target_frames':first,'target_handoffs':flips,'reduced_handoffs':reduced,'endpoint_pulse':endpoint,'pulse_episodes':pulse_episodes,'actual_native_width_range':[min(widths),max(widths)],'after_init_anchor_error':distribution(anchor),'after_init_viewport_mismatch':len(vp),'actual_exact_native_arrivals':native_arrivals,'native_summary':[f for f in native if f.get('type')=='native_summary'],'limits':'CPU frame ownclock, actual HWND~8ms polling; native clocks separate. No GPU performance claim. Visual and matched recordings are separate.'}
    (folder/'analysis.json').write_text(json.dumps(result,indent=2),encoding='utf-8');return result


if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]/'evidence/repair-b'
    reports=[analyze(p.parent) for p in root.rglob('host.json') if (p.parent/'run.json').exists() and (p.parent/'frames.jsonl').exists()]
    (root/'summary.json').write_text(json.dumps(reports,indent=2),encoding='utf-8')
    for r in reports:print(json.dumps({k:r[k] for k in ('name','actual_native_width_range','after_init_anchor_error','after_init_viewport_mismatch','endpoint_pulse')}))
