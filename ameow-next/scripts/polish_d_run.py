"""Matched owned HWND traces; separate measurement and direct-crop recording."""
import argparse
from ctypes import wintypes as w
import json
import math
from pathlib import Path
import time
from PIL import Image, ImageDraw
from repair_a_runtime import RepairRuntime, CropCapture, read_jsonl, u


class MagneticRuntime(RepairRuntime):
    def point(self, x, y):
        self.move(514 + x * self.scale, 314 + y * self.scale)


def trace():
    steps = [('centre', 100, 100, .45)]
    for x, y in [(104,100),(100,104),(96,100),(100,96),(100,100)]:
        steps.append(('near-centre', x, y, .32))
    for ex, ey in [(100,0),(200,100),(100,200),(0,100)]:
        for i in range(1,25):
            steps.append(('centre-to-edge',100+(ex-100)*i/24,100+(ey-100)*i/24,.02))
        steps += [('edge-hold',ex,ey,.24),('edge-return',100,100,.32)]
    for x,y in [(2,2),(198,2),(198,198),(2,198)]:
        steps.append(('corner',x,y,.35))
    for x,y in [(-12,100),(212,100),(100,-12),(100,212)]:
        steps.append(('gutter',x,y,.35))
    for i in range(20):
        steps.append(('rapid-reversal',20 if i%2==0 else 180,100,.07))
    for i in range(41):
        steps.append(('cross-centre',20+i*4,100,.02))
    for i in range(80):
        angle=2*math.pi*i/80
        steps.append(('continuous-circle',100+65*math.cos(angle),100+65*math.sin(angle),.02))
    steps += [('stationary',180,100,.9),('centre-return',100,100,.55)]
    return steps


def run(exe, out, variant, baseline=False, night=False, visual=False):
    app=None; crop=None; images=[]; times=[]; result={'variant':variant,'baseline':baseline,'night':night,'visual':visual,'checks':[]}
    out.mkdir(parents=True,exist_ok=True)
    def check(name,passed,observed):
        result['checks'].append({'name':name,'status':'PASS' if passed else 'FAIL','observed':observed})
    try:
        args=[] if baseline else ['--magnetic',variant]
        if night:args.append('--night')
        app=MagneticRuntime(exe,out,'converged',lifetime=90000,extra_args=args)
        app.inside(); app.wait(.95); app.click(114,114); app.point(100,100); app.wait(.5)
        full=app.rect(); result.update(dpi=96*app.scale,full_bounds=full)
        check('Full native228',app.size()==[round(228*app.scale)]*2,full)
        if visual:crop=CropCapture((490,290,750,550))
        current={'name':'start','point':[100,100]}
        raw_edges=[]
        def grab():
            app.backdrop.update(); im=crop.grab(); app.capture_guard(im)
            r=app.rect(); native=im.crop((r[0]-490,r[1]-290,r[2]-490,r[3]-290))
            if native.width==228 and native.height==228:
                edge=[native.getpixel(p) for p in [(i,0) for i in range(228)]+[(i,227) for i in range(228)]+[(0,i) for i in range(228)]+[(227,i) for i in range(228)]]
                raw_edges.append({'phase':current['name'],'max_background_delta':max(abs(v-232) for p in edge for v in p)})
            canvas=Image.new('RGB',(260,288),(232,232,232)); canvas.paste(im,(0,28)); draw=ImageDraw.Draw(canvas)
            elapsed=(time.perf_counter()-app.started)*1000
            draw.text((5,4),f'{variant.upper()} {"Night" if night else "Light"} {current["name"]} {elapsed:.0f}ms',fill=(30,30,30))
            px=24+current['point'][0]*app.scale; py=52+current['point'][1]*app.scale
            if 0<=px<260 and 28<=py<288:
                draw.line((px-3,py,px+3,py),fill=(190,50,100)); draw.line((px,py-3,px,py+3),fill=(190,50,100))
            images.append(canvas);times.append(elapsed)
        cap=grab if visual else None
        app.event('trace-start',lambda:None)
        for name,x,y,duration in trace():
            current.update(name=name,point=[x,y]);app.event(name,lambda x=x,y=y:app.point(x,y));app.wait(duration,cap)
            check('native fixed: '+name,app.rect()==full,app.rect())
        # Active retains Full, allowing natural leave spring independently of collapse.
        app.key('1');app.point(180,100);app.wait(.4,cap)
        app.event('retained-leave',app.outside);current.update(name='retained-leave',point=[-35,-35]);app.wait(.65,cap)
        check('active retained native fixed',app.rect()==full,app.rect())
        app.event('retained-return',lambda:app.point(180,100));current.update(name='retained-return',point=[180,100]);app.wait(.45,cap)
        app.event('trace-end',lambda:None)
        if not visual:
            app.event('menu-lock',lambda:app.click(114,114,right=True));app.wait(.4);app.key('ESC');app.point(180,100);app.wait(.4)
            app.event('reduced-on',lambda:app.key('R'));app.wait(.25);app.point(10,10);app.wait(.2);app.event('reduced-off',lambda:app.key('R'));app.point(180,100);app.wait(.4)
            if not baseline:
                app.event('switch-variant',lambda:app.key('M'));app.wait(.25);app.event('switch-back',lambda:app.key('M'));app.wait(.4)
            app.point(100,100);app.event('drag-lock',lambda:u.mouse_event(2,0,0,0,0));app.wait(.3);app.event('drag-release',lambda:u.mouse_event(4,0,0,0,0));app.wait(.25)
            app.event('idle',lambda:app.key('0'));app.point(180,100);app.wait(.35)
            app.event('idle-leave',app.outside);app.wait(.12);app.event('reentry',app.inside);app.wait(.8)
            app.event('collapse',app.outside);app.wait(.85);check('Compact native80',app.size()==[round(80*app.scale)]*2,app.rect())
            compact=app.rect();old=w.POINT(full[0]+180,full[1]+180)
            check('Compact releases old Full hitbox',u.WindowFromPoint(old)!=app.hwnd,compact)
            app.event('final-expand',app.inside);app.wait(.85)
        if visual and images:
            durations=[max(10,round(b-a)) for a,b in zip(times,times[1:])]+[100]
            images[0].save(out/'motion.gif',save_all=True,append_images=images[1:],duration=durations,loop=0)
            selected=[0]+[round(i*(len(images)-1)/7) for i in range(1,8)]
            sheet=Image.new('RGB',(1040,576),(232,232,232))
            for i,index in enumerate(selected):sheet.paste(images[index],(i%4*260,i//4*288))
            sheet.save(out/'filmstrip.png')
            result['capture']={'frames':len(images),'times_ms':times,'raw_edges':raw_edges,'annotation':'Direct260px native crop,28px time label and rest-pointer cross overlay. Capture timing is NOT unrecorded native frame pacing.'}
        app.save_host();result['display']=app.display;result['status']='COMPLETE'
    except Exception as error:
        result.update(status='FAILED',error={'type':type(error).__name__,'message':str(error)})
    finally:
        if crop:crop.close()
        if app:app.close()
    frames=read_jsonl(out/'frames.jsonl'); result['frame_count']=len(frames)
    result['overall']='PASS' if result.get('status')=='COMPLETE' and all(x['status']=='PASS' for x in result['checks']) else 'FAIL'
    (out/'run.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({'out':str(out),'status':result.get('status'),'overall':result['overall'],'frames':len(frames),'error':result.get('error')}),flush=True)
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--exe',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--variant',choices=['a','b'],required=True);p.add_argument('--baseline',action='store_true');p.add_argument('--night',action='store_true');p.add_argument('--visual',action='store_true');a=p.parse_args()
    result=run(a.exe,a.out,a.variant,a.baseline,a.night,a.visual)
    raise SystemExit(0 if result['overall']=='PASS' else 1)
