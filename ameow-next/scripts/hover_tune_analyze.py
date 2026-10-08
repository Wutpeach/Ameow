"""New approved parameter expectations, never edit old 1.8/110 checks."""
import json
import math
from pathlib import Path
from polish_c_runtime import read_jsonl


def n(v):return math.hypot(*v)


def analyze(folder):
    report=json.loads((folder/'observations.json').read_text());frames=read_jsonl(folder/'frames.jsonl');h=[f for f in frames if 'hover' in f];before='before' in folder.name;night=report['night'];cap=1.8 if before else 3;segment=110 if before else 160;color=(61,154,255) if night else (2,133,255) if before else (0,112,221);checks=[]
    def add(name,value,ok):checks.append({'name':name,'observed':value,'status':'PASS' if ok else 'FAIL'})
    maxcurrent=max((n(f['hover']['current_offset']) for f in h),default=None);maxtarget=max((n(f['hover']['target_offset']) for f in h),default=None)
    add('Approved vector hardcap',{'max_current':maxcurrent,'max_target':maxtarget,'allowed':cap},bool(h) and maxcurrent<=cap+.0001 and maxtarget<=cap+.0001)
    segments=sorted(set(f['hover']['segment_length'] for f in h));colors=sorted(set(tuple(f['hover']['accent_rgb']) for f in h));add('Approved segment length',segments,segments==[segment]);add('Hoveraccent token andNightunchanged',colors,colors==[color]);add('Actual HWNDfixed throughhovercases',report['constant_native_hover'],report['constant_native_hover'])
    reduced=[f for f in h if f['reduced']];add('Reduced current/target translation exactly0',{'samples':len(reduced)},bool(reduced) and all(n(f['hover']['current_offset'])==0 and n(f['hover']['target_offset'])==0 for f in reduced))
    quiet=[f for f in h if f['hover']['eligible'] and abs(f['hover']['distance'])>56];add('Centre requestszero',{'samples':len(quiet)},bool(quiet) and all(f['hover']['q']==0 and n(f['hover']['target_offset'])==0 for f in quiet))
    locked=[f for f in h if any(f['hover']['locks'])];add('Actual menu/drag lock suppress eligibility',{'samples':len(locked)},bool(locked) and all(not f['hover']['eligible'] for f in locked))
    morph=[f for f in h if f['rawfullness']!=1 or f['settlephase']!='rest'];add('Hoveroff throughoutCompact/travel/settle',{'samples':len(morph)},bool(morph) and all(not f['hover']['eligible'] for f in morph))
    b=report.get('compact_bounds');add('Actual collapse80 andlargehitbox released',{'bounds':b,'old_full_owned':report.get('old_full_hit_owned')},b is not None and b[2]-b[0]==80 and report['old_full_hit_owned'] is False)
    profile={}
    for distance in (56,30,14):
        group=[f for f in h if f['hover']['eligible'] and abs(abs(f['hover']['distance'])-distance)<.2];profile[str(distance)]={'q':sorted(set(f['hover']['q'] for f in group)),'target_magnitude':sorted(set(round(n(f['hover']['target_offset']),5) for f in group))}
    normal=[f for f in h if f['rawfullness']==1 and f['settlephase']=='rest'];params={key:sorted(set(f[key] for f in normal)) for key in ('shadow_surface','shadow_blur','shadow_offset','shadow_alpha','radius')};add('Normalshadow/Radii noadditionalpulse',params,bool(normal) and all(len(v)==1 for v in params.values()))
    result={'source':str(folder),'criteria':'Oldbaseline1.8/110/Light#0285ff versususerapproved3/160/Light#0070dd; Darkunchanged. These intentionallydifferentexpectedvalues do notchangepriorvalidation scripts.','checks':checks,'proximity':profile,'overall':'PASS' if all(x['status']=='PASS' for x in checks) else 'FAIL'};(folder/'analysis.json').write_text(json.dumps(result,indent=2),encoding='utf-8');return result


if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]/'evidence/hover-tune';results=[analyze(p.parent) for p in root.glob('*/observations.json') if p.parent.name!='smoke'];(root/'summary.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    for r in results:print(json.dumps(r))
