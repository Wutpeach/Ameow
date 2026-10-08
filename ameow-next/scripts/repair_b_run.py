"""Matched Repair A A-soft / Repair B default real pointer workflow."""
import argparse
import base64
import json
from pathlib import Path
import time
from PIL import Image,ImageDraw
from repair_b_runtime import RepairB,CropCapture,read_jsonl,u,w


def run(exe,out,legacy=False,visual=False,night=False,cycles=4):
    app=None;capture=None;images=[];times=[];paint=[];report={'legacy_a_soft':legacy,'visual':visual,'theme':'Night' if night else 'Light','cycles':cycles}
    try:
        app=RepairB(exe,out,legacy,night)
        if visual:capture=CropCapture((490,290,750,550))
        def grab():
            app.backdrop.update();im=capture.grab();app.capture_guard(im)
            before=app.rect();images.append(im);times.append((time.perf_counter()-app.started)*1000)
            crop=im.crop((before[0]-490,before[1]-290,before[2]-490,before[3]-290))
            row=[crop.getpixel((x,crop.height//2))[:3] for x in range(crop.width)]
            fill=sum(max(abs(p[i]-(35,36,39)[i]) for i in range(3))<=1 for p in row) if night else sum(min(p)>=254 for p in row)
            points=[(x,y) for y in (0,crop.height-1) for x in range(crop.width)]+[(x,y) for x in (0,crop.width-1) for y in range(crop.height)]
            edge=max(max(abs(v-232) for v in crop.getpixel(p)[:3]) for p in points)
            paint.append({'index':len(images)-1,'host_ms':times[-1],'bounds':before,'native_width':before[2]-before[0],'fill_width':fill,'edge_delta':edge})
        app.inside();app.wait(.65);app.click(40,40);app.outside();app.wait(1.2)
        for cycle in range(cycles):
            for name,action,wait in [('expand',app.inside,.78),('collapse',app.outside,.78),('reverse-expand-start',app.inside,.14),('reverse-collapse',app.outside,.17),('reverse-reenter',app.inside,.78),('reset-compact',app.outside,.78)]:
                app.event(name,action,cycle);app.wait(wait,grab if visual else None)
        # Target flip occurs while residual is still active after the80ms leave grace.
        app.event('endpoint-expand',app.inside);app.wait(.29,grab if visual else None)
        app.event('endpoint-leave',app.outside);app.wait(.18,grab if visual else None)
        app.event('endpoint-reenter',app.inside);app.wait(.78,grab if visual else None)
        app.outside();app.wait(.8)
        # Real Reduced toggle during a Full endpoint pulse.
        app.event('reduced-expand',app.inside)
        deadline=time.perf_counter()+1.5
        while app.size()!=[228,228] and time.perf_counter()<deadline:app.wait(.008)
        app.wait(.055);app.event('reduced-on',lambda:app.key('R'));app.wait(.12)
        reduced_full=app.size();app.outside();app.wait(.2);reduced_compact=app.size()
        oldpoint=app.rect();hit=u.WindowFromPoint(w.POINT(oldpoint[0]+180,oldpoint[1]+180))==app.hwnd
        app.inside();app.wait(.2);app.key('R');app.wait(.15);app.key('1');app.outside();app.wait(.4)
        active_full=app.size();app.key('0');app.wait(.8);idle=app.size()
        app.save_host();report.update(status='COMPLETE',checks={'reduced_full':reduced_full,'reduced_compact':reduced_compact,'old_full_hit_owned':hit,'active_full':active_full,'idle':idle})
        report['behavior_pass']=reduced_full==[228,228] and reduced_compact==[80,80] and not hit and active_full==[228,228] and idle==[80,80]
        if visual:
            delays=[max(20,round(b-a)) for a,b in zip(times,times[1:])]+[80]
            images[0].save(out/'motion.gif',save_all=True,append_images=images[1:],duration=delays,loop=0)
            sheet=Image.new('RGB',(1040,568),(232,232,232));draw=ImageDraw.Draw(sheet)
            for i in range(8):
                idx=round(i*(len(images)-1)/7);x=i%4*260;y=i//4*284
                sheet.paste(images[idx],(x,y+24));draw.text((x+5,y+4),f'{times[idx]:.0f}ms',fill=(20,20,20))
            sheet.save(out/'filmstrip.png')
            peaks=[]
            for label,width in [('compact',80),('full',228)]:
                candidates=[p for p in paint if p['native_width']==width]
                if candidates:
                    peak=max(candidates,key=lambda p:p['fill_width']);settled=candidates[-1]
                    images[peak['index']].save(out/f'{label}-peak.png');images[settled['index']].save(out/f'{label}-settled.png')
                    peaks.append({'endpoint':label,'peak':peak,'settled':settled})
            (out/'paint.json').write_text(json.dumps({'definition':'260px direct native crop on owned#e8e8e8; fill excludes~1px border each side, logical estimate+2px±1px. Sampling cannot guarantee exact analytic peak.','samples':paint,'endpoints':peaks},indent=2),encoding='utf-8')
    except Exception as e:report.update(status='FAILED',error={'type':type(e).__name__,'message':str(e)})
    finally:
        if capture:capture.close()
        if app:app.close()
        out.mkdir(parents=True,exist_ok=True);(out/'run.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'out':str(out),'status':report['status'],'behavior_pass':report.get('behavior_pass')}),flush=True)
    return report


def compare(base):
    cards=[]
    for name in ('before-a-soft','after-default'):
        path=base/name/'motion.gif'
        if path.exists():
            uri='data:image/gif;base64,'+base64.b64encode(path.read_bytes()).decode()
            cards.append(f'<article><h2>{name}</h2><img width="260" height="260" src="{uri}"></article>')
    (base/'comparison.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ameow Repair B</title><style>body{font:16px system-ui;background:#e8e8e8;color:#232427;margin:20px}main{display:flex;flex-wrap:wrap;gap:24px}h2{font-size:18px}</style><h1>A-soft → Repair B 默认</h1><p>相同真实指针流程；展开保持2.5px/170ms，收缩残余由1.5px/150ms收敛为0.85px/120ms。Shadow与Radius不参与额外回弹。截图与测量运行分开；最终手感等待人工验收。</p><main>'+''.join(cards)+'</main></html>',encoding='utf-8')


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--exe',type=Path,required=True);p.add_argument('--name',choices=['before-a-soft','after-default'],required=True);p.add_argument('--visual',action='store_true');p.add_argument('--night',action='store_true');p.add_argument('--cycles',type=int,default=4)
    a=p.parse_args();root=Path(__file__).resolve().parents[1];base=root/'evidence/repair-b'/('visual-night' if a.night else 'visual-light') if a.visual else root/'evidence/repair-b/matched'
    r=run(a.exe,base/a.name,a.name=='before-a-soft',a.visual,a.night,a.cycles)
    if a.visual:compare(base)
    raise SystemExit(0 if r['status']=='COMPLETE' and r.get('behavior_pass') else 1)
