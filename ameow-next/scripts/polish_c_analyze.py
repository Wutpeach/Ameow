"""Analyze actual hover frames; never infer GPU present timing."""
import json
import math
from pathlib import Path
from polish_c_runtime import read_jsonl


def norm(value):return math.hypot(*value)


def analyze(path):
    f=read_jsonl(path/'frames.jsonl');native=read_jsonl(path/'native.jsonl');r=json.loads((path/'observations.json').read_text());checks=[]
    def add(name,observed,passed):checks.append({'name':name,'observed':observed,'status':'PASS' if passed else 'FAIL'})
    hover=[x for x in f if 'hover' in x];offsets=[norm(x['hover']['current_offset']) for x in hover];target_offsets=[norm(x['hover']['target_offset']) for x in hover]
    add('Actual native Full bounds remain unchanged across four sides/corners/gutter',r.get('hover_geometry_constant'),r.get('hover_geometry_constant') is True)
    add('Hover magnetic vector bounded to1.8px',{'max_current':max(offsets,default=None),'max_target':max(target_offsets,default=None)},bool(offsets) and max(offsets)<=1.8001 and max(target_offsets)<=1.8001)
    reduced=[x for x in hover if x['reduced']];add('Reduced emits exactly zero current/target magnetic translation',{'samples':len(reduced),'max_current':max((norm(x['hover']['current_offset']) for x in reduced),default=None)},bool(reduced) and all(norm(x['hover']['current_offset'])==0 and norm(x['hover']['target_offset'])==0 for x in reduced))
    quiet=[x for x in hover if abs(float(x['hover']['distance']))>56 and x['hover']['eligible']]
    if not r['hover_off']:add('Rest-geometry centre distance>56 requests no glow/follow',{'samples':len(quiet),'max_requested_q':max((x['hover']['q'] for x in quiet),default=None)},bool(quiet) and all(x['hover']['q']==0 and norm(x['hover']['target_offset'])==0 for x in quiet))
    suppressed=[x for x in hover if any(x['hover']['locks'])]
    add('Actual drag/menu lock removes hover eligibility',{'samples':len(suppressed),'enabled_eligible':sum(x['hover']['eligible'] for x in suppressed)},bool(suppressed) and all(not x['hover']['eligible'] for x in suppressed))
    morph=[x for x in hover if x['rawfullness']!=1 or x['settlephase']!='rest']
    add('Compact/travel/settle never enables hover',{'samples':len(morph),'eligible':sum(x['hover']['eligible'] for x in morph)},bool(morph) and all(not x['hover']['eligible'] for x in morph))
    add('Collapsed native hitbox remains80 and releases oldFull point',{'bounds':r.get('actual_compact_bounds'),'old_owned':r.get('old_full_hit_owned')},r.get('actual_compact_bounds',[0]*4)[2]-r.get('actual_compact_bounds',[0]*4)[0]==80 and r.get('old_full_hit_owned') is False)
    values={}
    for distance in (56,30,14,6):
        group=[x for x in hover if x['hover']['eligible'] and abs(abs(float(x['hover']['distance']))-distance)<.25]
        values[str(distance)]={'samples':len(group),'target_q':sorted(set(x['hover']['q'] for x in group)),'target_magnitudes':sorted(set(round(norm(x['hover']['target_offset']),4) for x in group))}
    fade=[]
    for i in range(1,len(hover)):
        a,b=hover[i-1],hover[i]
        if a['hover']['eligible'] and not b['hover']['eligible'] and b['rawfullness']==1:
            quiet_frame=next((x for x in hover[i:] if x['hover']['strength']<=.001 and norm(x['hover']['current_offset'])<=.01),None)
            fade.append({'from_ms':b['ms'],'first_quiet_after_ms':quiet_frame['ms']-b['ms'] if quiet_frame else None,'reason_locks':b['hover']['locks'],'strength_at_loss':b['hover']['strength']})
    init=False;anchor=[];vp=[]
    for x in f:
        b=x['bounds'];width=b[2]-b[0]
        if b==[504,304,584,384]:init=True
        if init:
            g=10+4*(width-80)/148;anchor.append(max(abs(b[k]+g-x['anchor'][k]) for k in (0,1)))
            if x['viewport']!=[width,b[3]-b[1]]:vp.append(x['ms'])
    add('After startup native anchor/viewport retained',{'max_anchor_error':max(anchor,default=None),'viewport_mismatch':len(vp)},bool(anchor) and max(anchor)<=.51 and not vp)
    colors=sorted(set(tuple(x['hover']['accent_rgb']) for x in hover));expected=(61,154,255) if r['night'] else (2,133,255)
    add('Allcentre semanticstates retain interactiveaccent paletteblue',{'colors':colors,'expected':expected},bool(colors) and colors==[expected])
    rest_shadow=[x for x in hover if x['rawfullness']==1 and x['settlephase']=='rest']
    shadow={key:sorted(set(x[key] for x in rest_shadow)) for key in ('shadow_surface','shadow_blur','shadow_offset','shadow_alpha','radius')}
    add('Normalshadow/radius recipe constant throughoutFull hover',shadow,bool(rest_shadow) and all(len(values)==1 for values in shadow.values()))
    if r['hover_off']:add('CLI hover off remains inactive',{'max_q':max((x['hover']['q'] for x in hover),default=None)},bool(hover) and all(x['hover']['q']==0 and norm(x['hover']['current_offset'])==0 for x in hover))
    result={'source':str(path),'checks':checks,'proximity_samples':values,'eligibility_loss_fades':fade,'frame_count':len(f),'native_apply_count':sum(x.get('type')=='native_apply' for x in native),'native_summary':[x for x in native if x.get('type')=='native_summary'],'limits':'Actual frame state and HWND, not GPU presentation. Centre check is requested quietness; eased residual after moving from edge is reported in original frames. OSdrop not synthesized.','overall':'PASS' if all(x['status']=='PASS' for x in checks) else 'FAIL'}
    (path/'analysis.json').write_text(json.dumps(result,indent=2),encoding='utf-8');return result


if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]/'evidence/polish-c/visual';r=[analyze(p.parent) for p in root.glob('*/observations.json')]
    (root/'summary.json').write_text(json.dumps(r,indent=2),encoding='utf-8')
    for x in r:print(json.dumps({'source':x['source'],'overall':x['overall'],'checks':x['checks'],'proximity':x['proximity_samples'],'fades':x['eligibility_loss_fades']}))
