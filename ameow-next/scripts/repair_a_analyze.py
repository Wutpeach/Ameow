"""Analyze recorded CPU callbacks and Win32 geometry, never infer GPU presents."""
import json
import math
from pathlib import Path
import sys
from repair_a_runtime import read_jsonl


def distribution(values):
    values=sorted(v for v in values if isinstance(v,(int,float)) and math.isfinite(v))
    if not values:return {'samples':0}
    def q(frac):
        index=(len(values)-1)*frac;lo=int(index);hi=math.ceil(index)
        return values[lo]+(values[hi]-values[lo])*(index-lo)
    return {'samples':len(values),'p50':q(.5),'p95':q(.95),'p99':q(.99),'max':max(values)}


def cadence(values):
    result=distribution(values)
    for cutoff in (16.667,33.3,50):result[f'over_{cutoff}_ms']=sum(v>cutoff for v in values)
    return result


def analyze(folder):
    host=json.loads((folder/'host.json').read_text());run=json.loads((folder/'run.json').read_text())
    frames=[f for f in read_jsonl(folder/'frames.jsonl') if f.get('type','frame')=='frame']
    native=read_jsonl(folder/'native.jsonl');applies=[x for x in native if x.get('type')=='native_apply']
    timestamps=lambda f:f.get('timestamp_us',f.get('ms',0)*1000)/1000
    changing=lambda f:abs(f.get('velocity',0))>.003 or abs(f.get('surface_extra',0))>.003 or (0.0002<f.get('rawfullness',0)<.9998)
    active_intervals=[timestamps(b)-timestamps(a) for a,b in zip(frames,frames[1:]) if changing(a) and changing(b)]
    native_intervals=[(b['start_us']-a['start_us'])/1000 for a,b in zip(applies,applies[1:]) if (b['start_us']-a['start_us'])<200000]
    samples=host['samples'];events=host['events'];cycle_stats=[]
    for i,event in enumerate(events):
        if event['name'] not in ('expand','collapse','reverse-reenter'):continue
        end=events[i+1]['host_ms'] if i+1<len(events) else samples[-1]['host_ms']
        segment=[x for x in samples if event['host_ms']<=x['host_ms']<end]
        target=228 if event['name']!='collapse' else 80
        arrived=[x for x in segment if abs(x['width']/host['dpi']*96-target)<=1]
        exact=[x for x in segment if x['width']==round(target*host['dpi']/96)]
        settle=None
        for x in arrived:
            rest=[s for s in segment if x['host_ms']<=s['host_ms']<=x['host_ms']+100]
            if rest and rest[-1]['host_ms']-x['host_ms']>=90 and all(abs(s['width']/host['dpi']*96-target)<=1 for s in rest):settle=x['host_ms']-event['host_ms'];break
        cycle_stats.append({'cycle':event['cycle'],'phase':event['name'],'first_native_arrival_ms':arrived[0]['host_ms']-event['host_ms'] if arrived else None,'first_exact_native_endpoint_ms':exact[0]['host_ms']-event['host_ms'] if exact else None,'native_settle_100ms_ms':settle,'min_width':min(s['width'] for s in segment) if segment else None,'max_width':max(s['width'] for s in segment) if segment else None})
    first_event=next((e for e in events if e['name']=='focus-initial'),next((e for e in events if e['name']=='expand'),{'host_ms':0}))
    first_full=next((f for f in frames if f.get('target_full')),None)
    offset=timestamps(first_full)-first_event['host_ms'] if first_full else 0
    visual=[];reversal=[]
    for i,event in enumerate(events):
        end=events[i+1]['host_ms'] if i+1<len(events) else samples[-1]['host_ms']
        seg=[f for f in frames if event['host_ms']+offset-1<=timestamps(f)<end+offset-1]
        if event['name'] in ('expand','collapse') and seg:
            surface_target=200 if event['name']=='expand' else 60
            endpoint=[f for f in seg if abs(f.get('rawfullness',0)-(1 if event['name']=='expand' else 0))<.002]
            peak=max((f.get('visualsurface',surface_target) for f in endpoint),default=None)
            extras=[f.get('surface_extra',0) for f in endpoint]
            goal=1 if event['name']=='expand' else 0
            def at_rest(f):
                return abs(f.get('rawfullness',0)-goal)<=.0002 and abs(f.get('velocity',0))<.003 and abs(f.get('surface_extra',0))<.03 and abs(f.get('extra_velocity',0))<.03
            settled=None
            for index,f in enumerate(seg):
                if at_rest(f) and all(at_rest(later) for later in seg[index:]) and end+offset-timestamps(f)>=100:
                    settled=f;break
            phase_surfaces=[f.get('visualsurface',surface_target) for f in seg]
            visual.append({'cycle':event['cycle'],'phase':event['name'],'endpoint_surface_peak':peak,'phase_surface_max':max(phase_surfaces),'phase_surface_min':min(phase_surfaces),'endpoint_extra_peak':max(extras,default=None),'first_final_surface_settle_ms':timestamps(settled)-event['host_ms']-offset if settled else None,'settle_definition':'Model x within .0002 endpoint; |v|<.003; |extra|<.03 and |extra_v|<.03, no later sampled deviation in episode and≥100ms until next intent. Quiet render gaps are not GPU present proof.','overshoot_above_full':max(0,max(phase_surfaces)-200) if goal else None,'undershoot_below_compact':max(0,60-min(phase_surfaces)) if not goal else None})
        if event['name']=='reverse-reenter' and seg:
            first=seg[0];turn=next((f for f in seg if f.get('velocity',0)>0),None)
            reversal.append({'cycle':event['cycle'],'first_velocity':first.get('velocity'),'positive_velocity_after_ms':timestamps(turn)-event['host_ms']-offset if turn else None,'surface_extra_at_reversal':first.get('surface_extra')})
    anchor_errors=[];request_phase_anchor_errors=[];viewport_errors=[];startup=[];post_anchor=[];post_viewport=[];initialized=False
    for f in frames:
        b=f.get('bounds');a=f.get('anchor');g=f.get('gutter')
        if b==[504,304,584,384]:initialized=True
        if not initialized:startup.append(f)
        if b and a and g is not None:
            actual_gutter=10+4*((b[2]-b[0])*96/host['dpi']-80)/148
            error=max(abs(b[i]+actual_gutter*host['dpi']/96-a[i]) for i in (0,1))
            anchor_errors.append(error)
            if initialized:post_anchor.append(error)
            request_phase_anchor_errors.append(max(abs(b[i]+g*host['dpi']/96-a[i]) for i in (0,1)))
        if b and f.get('viewport')!=[b[2]-b[0],b[3]-b[1]]:
            viewport_errors.append(timestamps(f))
            if initialized:post_viewport.append(timestamps(f))
    widths=[s['width'] for s in samples]
    native_pixel_deltas=[abs(b['applied'][2]-a['applied'][2]) for a,b in zip(applies,applies[1:])]
    tail_intervals=[]
    for a,b,d in zip(applies,applies[1:],applies[2:]):
        delta=b['applied'][2]-a['applied'][2];next_delta=d['applied'][2]-b['applied'][2];interval=(b['start_us']-a['start_us'])/1000
        if abs(delta)==1 and delta*next_delta>0 and interval<60 and min(abs(b['applied'][2]-80),abs(b['applied'][2]-228))<=5:tail_intervals.append(interval)
    observed_peaks=[f.get('visualsurface') for f in frames if f.get('visualsurface') is not None]
    result={'run':str(folder),'motion':run['motion'],'dt':run['dt'],'native_flags':run['native_flags'],'cycles':run['cycles'],'exe_sha256':host['exe_sha256'],'capture_enabled':False,'behavior_pass':run.get('behavior_pass'),'limits':'CPU callback cadence, native queue/call cost and real HWND samples. No GPU present timing; polling ~8ms and app event alignment ~one callback.'}
    result.update(cpu_callback_interval_active_ms=cadence(active_intervals),cpu_dt_actual_all_ms=cadence([f['dt_actual_ms'] for f in frames if 'dt_actual_ms' in f]),cpu_advance_us=distribution([f['cpu_advance_us'] for f in frames if 'cpu_advance_us' in f]),cpu_render_us=distribution([f['cpu_render_us'] for f in frames if 'cpu_render_us' in f]),native_update_interval_ms=cadence(native_intervals),native_queue_ms=distribution([f['queue_ms'] for f in applies]),native_call_ms=distribution([f['call_ms'] for f in applies]),native_counts={'applied':len(applies),'skipped':sum(f.get('type')=='native_skip' for f in native),'resize':sum(bool(f.get('resize')) for f in applies),'move_only':sum(bool(f.get('move_only')) for f in applies),'framechanged':sum(bool(f.get('framechanged')) for f in applies)},actual_native_width_range=[min(widths),max(widths)],visible_surface_range=[min(observed_peaks),max(observed_peaks)] if observed_peaks else None,anchor_error_px=distribution(anchor_errors),viewport_mismatch_frames=len(viewport_errors),cycles_native=cycle_stats,cycles_visual=visual,reversal=reversal)
    result['native_width_pixel_delta_histogram']={str(d):native_pixel_deltas.count(d) for d in sorted(set(native_pixel_deltas))}
    result['tail_one_pixel_update_interval_ms']=distribution(tail_intervals)
    result['tail_rounding_measurement_limit']='Heuristic: consecutive same direction updates, one-pixel change within5px of endpoint, gap<60ms. Excludes obvious endpoint holds/reversals but does not prove GPU stutter. Width histogram includes Reduced instantaneous jumps and must not be interpreted as normal spring steps.'
    result['native_summary_records']=[f for f in native if f.get('type')=='native_summary']
    result['startup_before_initial_compact_bounds']={'samples':len(startup),'frames':startup,'note':'Retained pre-apply construction samples, not morph anchor drift.'}
    result['after_initial_compact_anchor_error_px']=distribution(post_anchor)
    result['viewport_mismatch_after_initial_compact']=len(post_viewport)
    result['request_phase_anchor_error_px']=distribution(request_phase_anchor_errors)
    result['anchor_measurement_note']='Actual origin + gutter derived from actual native size; current frame.gutter request-phase comparison listed separately because deferred native apply may be one render behind. Probe origin-only/resize-only deliberately break product geometry.'
    result['display']=host.get('display')
    budget=host.get('display',{}).get('refresh_budget_ms')
    if budget:result['cpu_callback_interval_active_ms']['over_reported_refresh_budget_ms']=sum(v>budget for v in active_intervals)
    result['arrival_definition']='First host-polled HWND native width within 1 physical pixel of endpoint, not exact ideal model endpoint. Includes real pointer polling and 80ms collapse grace.'
    handoffs=[]
    keys=('timestamp_us','ms','target_full','rawfullness','velocity','surface_extra','extra_velocity','visualsurface','native_request','bounds','settlephase','reduced','dt_actual_ms')
    for i in range(1,len(frames)):
        if frames[i].get('target_full')!=frames[i-1].get('target_full'):
            handoffs.append({'clock':'Frame file own monotonic clock; no host or native clock subtraction.','index':i,'previous_extra':frames[i-1].get('surface_extra'),'local_frames':[{k:f.get(k) for k in keys} for f in frames[max(0,i-2):i+5]]})
    result['target_handoffs']=handoffs
    first_inputs=[]
    for event in events:
        if event['name']!='expand':continue
        transitions=[h for h in handoffs if frames[h['index']].get('target_full')]
        nearest=min(transitions,key=lambda h:abs(timestamps(frames[h['index']])-offset-event['host_ms'])) if transitions else None
        if nearest:
            f=frames[nearest['index']]
            before=[s for s in samples if s['host_ms']<event['host_ms']]
            width_before=before[-1]['width'] if before else 80
            after=[s for s in samples if event['host_ms']<=s['host_ms'] and s['width']!=width_before]
            first_inputs.append({'cycle':event['cycle'],'clock_alignment':'Nearest frame target transition to calibrated host intent; ±one callback, not precise input latency.','dt_actual_ms':f.get('dt_actual_ms'),'rawfullness':f.get('rawfullness'),'velocity':f.get('velocity'),'native_request':f.get('native_request'),'old_actual_bounds':f.get('bounds'),'first_polled_native_delta_px':after[0]['width']-width_before if after else None,'frame_clock_ms':timestamps(f)})
    result['first_frames_after_expand']=first_inputs
    (folder/'analysis.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    return result


if __name__=='__main__':
    root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/'evidence/repair-a/perf'
    reports=[analyze(p.parent) for p in root.rglob('host.json') if (p.parent/'run.json').exists() and json.loads((p.parent/'run.json').read_text()).get('status')=='COMPLETE']
    (root/'summary.json').write_text(json.dumps(reports,indent=2),encoding='utf-8')
    for r in reports:print(json.dumps({k:r[k] for k in ('run','motion','cpu_callback_interval_active_ms','native_queue_ms','native_call_ms','actual_native_width_range','viewport_mismatch_frames','behavior_pass')}))
