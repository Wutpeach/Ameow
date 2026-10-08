"""Owned native6px space gate and continuous handoff capture. No baseline rerun.
Captures tight260px crops; preserves raw observations, not subjective acceptance.
"""
import argparse
import json
import math
from pathlib import Path
import time
from PIL import Image, ImageDraw
from polish_d_run import MagneticRuntime
from repair_a_runtime import CropCapture, read_jsonl, u, w

class SpaceRuntime(MagneticRuntime):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs)
        original=self.backdrop.update
        def update():
            original()
            u.SetWindowPos(self.hwnd,w.HWND(-1),0,0,0,0,0x13)
        self.backdrop.update=update

def measure(image,rect):
    x0,y0,x1,y1=rect[0]-490,rect[1]-290,rect[2]-490,rect[3]-290
    native=image.crop((x0,y0,x1,y1))
    width,height=native.size
    if not (0<width<=228 and 0<height<=228):raise RuntimeError('Native bounds outside approved capture')
    def delta(p):return max(abs(v-232) for v in p[:3])
    visible=[native.getpixel((width//2+dx,height//2+dy)) for dx,dy in [(-8,-8),(8,-8),(-8,8),(8,8)]]
    if not any(delta(p)>14 for p in visible):raise RuntimeError('Owned Surface is obscured; native visual evidence rejected')
    edges={
        'top':[native.getpixel((x,0)) for x in range(width)],
        'bottom':[native.getpixel((x,height-1)) for x in range(width)],
        'left':[native.getpixel((0,y)) for y in range(height)],
        'right':[native.getpixel((width-1,y)) for y in range(height)]}
    profile={}
    if width==height==228:
        for edge in edges:
            values=[]
            for d in range(-3,13):
                point={'top':(x0+114,y0+d),'bottom':(x0+114,y1-1-d),
                       'left':(x0+d,y0+114),'right':(x1-1-d,y0+114)}[edge]
                values.append({'inward_from_edge':d,'rgb':image.getpixel(point)[:3],'delta':delta(image.getpixel(point))})
            profile[edge]=values
    return {'native_size':[width,height],'outer_edge_delta':{k:max(map(delta,v)) for k,v in edges.items()},'centre_edge_profiles':profile}

def run(exe,out,night):
    app=None;capture=None;shots=[];movie=[];times=[];observations=[];checks=[]
    out.mkdir(parents=True,exist_ok=True)
    def check(name,passed,observed):checks.append(dict(name=name,status='PASS' if passed else 'FAIL',observed=observed))
    try:
        app=SpaceRuntime(exe,out,'converged',lifetime=90000,extra_args=['--magnetic','b']+(['--night'] if night else []))
        capture=CropCapture((490,290,750,550))
        def shot(label,animated=False):
            app.backdrop.update();image=capture.grab();app.capture_guard(image)
            rect=app.rect();obs=measure(image,rect)
            obs.update(label=label,host_ms=(time.perf_counter()-app.started)*1000,bounds=rect)
            observations.append(obs)
            canvas=Image.new('RGB',(260,284),(232,232,232));canvas.paste(image,(0,24))
            ImageDraw.Draw(canvas).text((5,4),f'{"Night" if night else "Light"} {label} {obs["host_ms"]:.0f}ms',fill=(30,30,30))
            if animated:movie.append(canvas);times.append(obs['host_ms'])
            else:
                image.save(out/(label+'.png'));shots.append(canvas)
            return obs
        app.outside();app.wait(.3);shot('compact-rest')
        app.event('initial-enter',lambda:app.point(30,30));app.wait(1.05,lambda:shot('initial-handoff',True))
        app.click(114,114);app.point(100,100);app.wait(.95)
        full=app.rect();check('Full native228',app.size()==[228,228],full)
        shot('full-rest')
        # All vectors reach the natural radial peak r100 (integer pointer precision).
        for label,dx,dy in [('right',1,0),('bottom',0,1),('left',-1,0),('top',0,-1),
                            ('bottom-right',2**-.5,2**-.5),('bottom-left',-2**-.5,2**-.5),
                            ('top-left',-2**-.5,-2**-.5),('top-right',2**-.5,-2**-.5)]:
            app.event(label,lambda dx=dx,dy=dy:app.point(100+100*dx,100+100*dy));app.wait(.95)
            shot('peak-'+label);check('fixed native '+label,app.rect()==full,app.rect())
        app.point(180,100);app.wait(.3);app.event('collapse',app.outside);app.wait(1.05,lambda:shot('collapse',True))
        check('Compact native80',app.size()==[80,80],app.rect())
        app.event('repeat-enter',lambda:app.point(30,30));app.wait(1.05,lambda:shot('repeat-handoff',True))
        app.point(100,100);app.wait(.3)
        app.event('reverse-start',app.outside);app.wait(.85)
        app.event('reverse-expand',lambda:app.point(30,30));app.wait(.17,lambda:shot('reverse-expand',True))
        app.event('reverse-to-compact',app.outside);app.wait(.85,lambda:shot('reverse-to-compact',True))
        check('reverse retires to Compact',app.size()==[80,80],app.rect())
        app.save_host()
        if movie:
            delays=[max(10,round(b-a)) for a,b in zip(times,times[1:])]+[100]
            movie[0].save(out/'handoff.gif',save_all=True,append_images=movie[1:],duration=delays,loop=0)
        sheet=Image.new('RGB',(1040,math.ceil(len(shots)/4)*284),(232,232,232))
        for i,im in enumerate(shots):sheet.paste(im,(i%4*260,i//4*284))
        sheet.save(out/'space-sheet.png')
        selected=[round(i*(len(movie)-1)/7) for i in range(8)]
        film=Image.new('RGB',(1040,568),(232,232,232))
        for i,index in enumerate(selected):film.paste(movie[index],(i%4*260,i//4*284))
        film.save(out/'handoff-filmstrip.png')
        report={'status':'COMPLETE','theme':'Night' if night else 'Light','checks':checks,'observations':observations,'capture_frames':len(movie),'display':app.display,'exe_sha256':app.exe_hash,'limits':'96DPI fixed placement, owned neutral backdrop. Recording CPU timing is not unrecorded GPU/DWM presentation. Space observations need direct visual review; no threshold hides inherited shadow tails.'}
    except Exception as error:
        report={'status':'FAILED','theme':'Night' if night else 'Light','error':{'type':type(error).__name__,'message':str(error)},'checks':checks,'observations':observations}
    finally:
        if capture:capture.close()
        if app:app.close()
    report['workflow']='PASS' if report['status']=='COMPLETE' and all(c['status']=='PASS' for c in checks) else 'FAIL'
    (out/'space.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    frames=read_jsonl(out/'frames.jsonl')
    print(json.dumps({'out':str(out),'status':report['status'],'workflow':report['workflow'],'frames':len(frames),'peak_edges':[(x['label'],x['outer_edge_delta']) for x in observations if x['label'].startswith('peak-')],'error':report.get('error')}),flush=True)
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--exe',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--night',action='store_true');a=p.parse_args()
    r=run(a.exe,a.out,a.night)
    raise SystemExit(0 if r['workflow']=='PASS' else 1)
