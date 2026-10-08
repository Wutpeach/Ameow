"""Lossless fractional-motion AA recording using actual default B release."""
import argparse
import json
import math
import time
from pathlib import Path
from PIL import Image,ImageDraw
from polish_e_space import SpaceRuntime
from repair_a_runtime import CropCapture,read_jsonl,u,w

def run(exe,out,night):
    out.mkdir(parents=True,exist_ok=True);(out/'png').mkdir(exist_ok=True)
    app=None;crop=None;movie=[];times=[];records=[];checks=[]
    current='compact'
    try:
        app=SpaceRuntime(exe,out,'converged',lifetime=45000,extra_args=['--night'] if night else [])
        crop=CropCapture((490,290,750,550))
        def grab():
            app.backdrop.update();im=crop.grab();app.capture_guard(im)
            idx=len(movie);im.save(out/'png'/f'{idx:04}.png')
            ms=(time.perf_counter()-app.started)*1000
            canvas=Image.new('RGB',(260,284),(232,232,232));canvas.paste(im,(0,24))
            ImageDraw.Draw(canvas).text((4,4),f'{"Night" if night else "Light"} {current} {ms:.0f}ms',fill=(20,20,20))
            movie.append(canvas);times.append(ms);records.append(dict(index=idx,host_ms=ms,phase=current,bounds=app.rect()))
        app.outside();app.wait(.15,grab)
        current='expand';app.event(current,lambda:app.point(30,30));app.wait(1.,grab)
        app.click(114,114);app.point(100,100);app.wait(.4,grab);full=app.rect()
        checks.append(dict(name='Full228',passed=app.size()==[228,228]))
        current='near-centre'
        for x,y in [(104,100),(100,104),(96,100),(100,96),(100,100)]:app.point(x,y);app.wait(.16,grab)
        current='fractional-circle'
        for i in range(80):
            angle=2*math.pi*i/80;app.point(100+80*math.cos(angle),100+80*math.sin(angle));app.wait(.022,grab)
            if app.rect()!=full:raise AssertionError('Magnetic changed HWND')
        for label,x,y in [('right',200,100),('bottom',100,200),('left',0,100),('top',100,0),('tl',2,2),('tr',198,2),('br',198,198),('bl',2,198)]:
            current=label;app.point(x,y);app.wait(.28,grab)
        app.point(180,100);app.wait(.3,grab)
        current='collapse';app.event(current,app.outside);app.wait(.9,grab)
        checks.append(dict(name='Compact80 and old Full hitbox released',passed=app.size()==[80,80] and u.WindowFromPoint(w.POINT(full[0]+180,full[1]+180))!=app.hwnd))
        current='reenter';app.event(current,app.inside);app.wait(.16,grab)
        current='reverse';app.event(current,app.outside);app.wait(.9,grab)
        checks.append(dict(name='reverse returns Compact80',passed=app.size()==[80,80]))
        app.save_host()
        durations=[max(10,round(b-a)) for a,b in zip(times,times[1:])]+[100]
        movie[0].save(out/'fractional.gif',save_all=True,append_images=movie[1:],duration=durations,loop=0)
        indices=[]
        for phase in ('expand','near-centre','fractional-circle','right','bottom','left','top','collapse','reenter','reverse'):
            selected=[r['index'] for r in records if r['phase']==phase]
            if selected:indices.extend([selected[len(selected)//2]])
        sheet=Image.new('RGB',(5*260,2*284),(232,232,232))
        for i,index in enumerate(indices):sheet.paste(movie[index],(i%5*260,i//5*284))
        sheet.save(out/'filmstrip.png')
        result=dict(checks=checks,status='COMPLETE',frames=len(movie),records=records,exe_sha256=app.exe_hash,dpi=96*app.scale,limits='PNG frames are lossless direct260px crops. GIF palette is only review aid. Capture timings are host instrumentation, not unrecorded presentation/frame pacing.')
    except Exception as error:result=dict(status='FAIL',error=dict(type=type(error).__name__,message=str(error)),checks=checks)
    finally:
        if crop:crop.close()
        if app:app.close()
    fs=[f for f in read_jsonl(out/'frames.jsonl') if 'hover' in f]
    checks.append(dict(name='actual defaultB',passed=bool(fs) and all(f['hover']['variant']=='b' for f in fs)))
    checks.append(dict(name='fractional offset recorded',passed=any(.01<abs(v-round(v))<.49 for f in fs for v in f['hover']['current_offset'])))
    result['overall']='PASS' if result['status']=='COMPLETE' and all(c['passed'] for c in checks) else 'FAIL'
    (out/'recording.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(dict(out=str(out),overall=result['overall'],frames=result.get('frames'),error=result.get('error'))))
    return result['overall']=='PASS'

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--exe',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--night',action='store_true');a=p.parse_args()
    raise SystemExit(0 if run(a.exe,a.out,a.night) else 1)
