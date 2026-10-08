"""User-approved hover changes; previous validation helpers imported read-only."""
import argparse
import base64
import json
from pathlib import Path
from PIL import Image,ImageDraw
from polish_c_runtime import PolishRuntime,CropCapture,u,w,read_jsonl


def run(exe,out,night=False,smoke=False):
    app=None;cap=None;images=[];times=[];paint=[];report={'night':night,'smoke':smoke,'cases':[]}
    try:
        app=PolishRuntime(exe,out,night=night,lifetime=50000);cap=CropCapture((490,290,750,550))
        import time
        app.point(30,30);app.wait(.85);app.click(100,100);app.point(100,100);app.wait(.2)
        deadline=time.perf_counter()+3
        while app.size()!=[228,228] and time.perf_counter()<deadline:app.wait(.02)
        if app.size()!=[228,228]:raise RuntimeError('Full endpoint didnotarrive')
        app.wait(.25);full=app.rect()
        def grab():
            import time
            app.backdrop.update();im=cap.grab();app.capture_guard(im);images.append(im);times.append((time.perf_counter()-app.started)*1000);return im
        def case(name,x,y,d=.38):
            app.event(name,lambda:app.point(x,y));app.wait(d,grab);im=images[-1];im.save(out/f'{name}.png');r=app.rect()
            crop=im.crop((r[0]-490,r[1]-290,r[2]-490,r[3]-290));cw,ch=crop.size
            edges=[crop.getpixel((x,y))[:3] for y in (0,ch-1) for x in range(cw)]+[crop.getpixel((x,y))[:3] for x in (0,cw-1) for y in range(ch)]
            blue_edge=sum(b-a>20 and b-g>10 for a,g,b in edges)
            pixel_blue=[(a,g,b) for a,g,b in im.getdata() if b-a>20 and b-g>10 and b>80]
            paint.append({'name':name,'blue_pixels':len(pixel_blue),'blue_native_outer_edge_pixels':blue_edge,'native_edge_max_rgb_difference':max(max(abs(v-232) for v in p) for p in edges),'bounds':r})
            report['cases'].append({'name':name,'rest_pointer':[x,y],'start_host_ms':app.events[-1]['host_ms'],'end_host_ms':times[-1],'bounds':r})
        for name,x,y in [('centre',100,100),('left',6,100),('centre-return',100,100)] if smoke else [('centre',100,100),('d56',100,56),('d30',100,30),('d14',100,14),('top',100,6),('top-right',194,6),('right',194,100),('bottom-right',194,194),('bottom',100,194),('bottom-left',6,194),('left',6,100),('top-left',6,6),('gutter-left',-12,100),('gutter-right',212,100)]:case(name,x,y)
        if not smoke:
            for i,(x,y) in enumerate([(180,2),(189,4),(194,8),(198,20),(198,80),(100,100),(2,100),(198,100),(100,100),(100,2)]):case(f'fast-{i}',x,y,.07)
            app.point(100,100);app.key('2');app.wait(.35);case('download-blue-edge',194,100)
            app.key('3');app.wait(.45);case('orange-state-edge',194,100)
            app.key('4');case('success-state-edge',194,100)
            app.key('5');case('failure-state-edge',194,100)
            app.key('1');case('retained-before-leave',100,6);app.event('retained-leave',app.outside);app.wait(.3,grab);images[-1].save(out/'retained-after-leave.png')
            case('menu-before',100,6);app.click(100,100,right=True);app.wait(.25,grab);images[-1].save(out/'menu.png');app.key('ESC')
            case('reduced-before',194,100);app.event('reduced-on',lambda:app.key('R'));app.wait(.2,grab);images[-1].save(out/'reduced.png');app.point(100,6);app.wait(.15);app.key('R');app.wait(.25)
            app.point(100,100);u.mouse_event(2,0,0,0,0);app.wait(.2,grab);images[-1].save(out/'drag.png');u.mouse_event(4,0,0,0,0)
            app.key('0');app.outside();app.wait(.85,grab);images[-1].save(out/'compact.png')
            report['compact_bounds']=app.rect();report['old_full_hit_owned']=u.WindowFromPoint(w.POINT(full[0]+180,full[1]+180))==app.hwnd
        app.save_host();report['full_bounds']=full;report['constant_native_hover']=all(c['bounds']==full for c in report['cases'])
        delays=[max(20,round(b-a)) for a,b in zip(times,times[1:])]+[80]
        images[0].save(out/'hover.gif',save_all=True,append_images=images[1:],duration=delays,loop=0)
        selected=['centre','top','top-right','right','bottom-right','bottom','bottom-left','left','top-left','gutter-left','gutter-right','centre-return']
        existing=[name for name in selected if (out/f'{name}.png').exists()]
        sheet=Image.new('RGB',(1040,((len(existing)+3)//4)*284),(232,232,232));draw=ImageDraw.Draw(sheet)
        for i,name in enumerate(existing):
            im=Image.open(out/f'{name}.png');x=i%4*260;y=i//4*284;sheet.paste(im,(x,y+24));draw.text((x+5,y+4),name,fill=(20,20,20))
        sheet.save(out/'sheet.png');(out/'pixel-observations.json').write_text(json.dumps(paint,indent=2),encoding='utf-8');report['status']='COMPLETE'
    except Exception as e:report.update(status='FAIL',error={'type':type(e).__name__,'message':str(e)})
    finally:
        if cap:cap.close()
        if app:app.close()
        out.mkdir(parents=True,exist_ok=True);(out/'observations.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'out':str(out),'status':report['status'],'native_fixed':report.get('constant_native_hover')}),flush=True);return report


def html(root):
    cards=[]
    for folder in sorted(root.iterdir()):
        if folder.name not in ('light-before','light-final','night-before','night-final'):continue
        path=folder/'hover.gif'
        if path.exists():
            uri='data:image/gif;base64,'+base64.b64encode(path.read_bytes()).decode();cards.append(f'<article><h2>{folder.name}</h2><img src="{uri}" width="260" height="260"></article>')
    (root/'comparison.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hover tuning</title><style>body{font:16px system-ui;background:#e8e8e8;margin:20px;color:#232427}main{display:flex;flex-wrap:wrap;gap:24px}h2{font-size:18px}</style><h1>已授权 hover 调整</h1><p>之前1.8px/110px/Light accent；最终3px/160px/Light accent-ink。Night颜色保持原token；Downloading任务蓝不变。外层bloom从11px收至10px以消除3px位移时的微弱截尾，内层/core保持。初始after11证据保留但由final替代。实际260px原生裁切；最终强度与手感待人工验收。</p><main>'+''.join(cards)+'</main></html>',encoding='utf-8')


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--exe',type=Path,required=True);p.add_argument('--before',action='store_true');p.add_argument('--night',action='store_true');p.add_argument('--smoke',action='store_true');p.add_argument('--final',action='store_true');a=p.parse_args()
    root=Path(__file__).resolve().parents[1]/'evidence/hover-tune';folder='smoke' if a.smoke else ('night' if a.night else 'light')+('-before' if a.before else '-final' if a.final else '-after');r=run(a.exe,root/folder,a.night,a.smoke);html(root);raise SystemExit(0 if r['status']=='COMPLETE' else 1)
