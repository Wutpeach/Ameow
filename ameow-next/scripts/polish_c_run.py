"""Actual native hover workflows and tight reviewable visual evidence."""
import argparse
import base64
import json
from pathlib import Path
import time
from PIL import Image,ImageDraw
from polish_c_runtime import PolishRuntime,CropCapture,u,w


def run(exe,out,night=False,off=False):
    app=None;cap=None;images=[];times=[];report={'night':night,'hover_off':off,'cases':[],'runtime_unverified':['OS OLE drop','Mixed DPI','macOS','GPU presentation timing']}
    try:
        app=PolishRuntime(exe,out,off,night,lifetime=60000);cap=CropCapture((490,290,750,550))
        app.point(30,30);app.wait(.85);app.click(100,100);app.point(100,100);app.wait(.2)
        full=app.rect();report['settled_full_bounds']=full
        def capture():
            app.backdrop.update();im=cap.grab();app.capture_guard(im);images.append(im);times.append((time.perf_counter()-app.started)*1000);return im
        def case(name,x,y,duration=.36):
            app.event(name,lambda:app.point(x,y));before=app.rect();app.wait(duration,capture)
            im=images[-1];im.save(out/f'{name}.png')
            report['cases'].append({'name':name,'rest_pointer':[x,y],'before':before,'after':app.rect(),'start_host_ms':app.events[-1]['host_ms'],'end_host_ms':times[-1]})
        for name,x,y in [('centre',100,100),('distance56',100,56),('distance30',100,30),('distance14',100,14),('top',100,6),('top-right',194,6),('right',194,100),('bottom-right',194,194),('bottom',100,194),('bottom-left',6,194),('left',6,100),('top-left',6,6),('gutter-left',-7,100)]:case(name,x,y)
        report['hover_geometry_constant']=all(item['before']==full and item['after']==full for item in report['cases'])
        # Cross rounded corner and repeatedly cross quiet centre; input always restgeometry.
        for i,(x,y) in enumerate([(180,2),(187,3),(192,6),(196,12),(198,20),(198,40),(100,100),(2,100),(100,100),(198,100),(100,100),(100,2)]):case(f'fast-{i}',x,y,.06)
        app.point(100,100);app.wait(.2);app.key('3');app.wait(.5);case('orange-state-blue-accent',194,100)
        app.key('4');case('green-state-blue-accent',194,100)
        app.key('5');case('red-state-blue-accent',194,100)
        # Active lock holdsFull so leave fade can finish without morphing.
        app.key('1');case('retained-before-leave',100,6)
        app.event('retained-leave',app.outside);app.wait(.3,capture);images[-1].save(out/'retained-after-leave.png')
        report['retained_after_leave_bounds']=app.rect()
        case('menu-before',100,6);app.click(100,100,right=True);app.wait(.3,capture);images[-1].save(out/'menu-paused.png')
        app.key('ESC');app.wait(.2);case('reduced-before',194,100)
        app.event('reduced-on',lambda:app.key('R'));app.wait(.2,capture);images[-1].save(out/'reduced-static.png')
        case('reduced-top',100,6,.15);app.key('R');app.wait(.3)
        # Drag suppression sampled while actually holding leftmouse withno net relocation.
        app.point(100,100);u.mouse_event(2,0,0,0,0);app.wait(.25,capture);images[-1].save(out/'drag-paused.png');u.mouse_event(4,0,0,0,0);app.wait(.2)
        app.point(100,100);app.key('0');app.event('idle-leave-collapse',app.outside);app.wait(.85,capture);images[-1].save(out/'compact-after-leave.png')
        old_hit=u.WindowFromPoint(w.POINT(full[0]+180,full[1]+180))==app.hwnd
        report.update(actual_compact_bounds=app.rect(),old_full_hit_owned=old_hit,status='COMPLETE')
        app.save_host()
        delays=[max(20,round(b-a)) for a,b in zip(times,times[1:])]+[80]
        images[0].save(out/'hover-workflow.gif',save_all=True,append_images=images[1:],duration=delays,loop=0)
        selected=['centre','top','top-right','right','bottom-right','bottom','bottom-left','left','top-left','gutter-left','reduced-static','retained-after-leave']
        sheet=Image.new('RGB',(1040,852),(232,232,232));draw=ImageDraw.Draw(sheet)
        for i,name in enumerate(selected):
            im=Image.open(out/f'{name}.png');x=i%4*260;y=i//4*284;sheet.paste(im,(x,y+24));draw.text((x+5,y+4),name,fill=(20,20,20))
        sheet.save(out/'hover-sheet.png')
        report['visual_frames']=len(images)
    except Exception as e:report.update(status='FAIL',error={'type':type(e).__name__,'message':str(e)})
    finally:
        if cap:cap.close()
        if app:app.close()
        out.mkdir(parents=True,exist_ok=True);(out/'observations.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'out':str(out),'status':report['status'],'constant_native_hover':report.get('hover_geometry_constant')}),flush=True);return report


def html(root):
    cards=[]
    for folder in sorted(root.glob('*')):
        path=folder/'hover-workflow.gif'
        if path.exists():
            uri='data:image/gif;base64,'+base64.b64encode(path.read_bytes()).decode()
            cards.append(f'<article><h2>{folder.name}</h2><img src="{uri}" width="260" height="260"><p>中心→四边/圆角→透明gutter→快速跨边→状态→leave→菜单→Reduced。</p></article>')
    text='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ameow Polish C</title><style>body{font:16px system-ui;background:#e8e8e8;color:#232427;margin:20px}main{display:flex;flex-wrap:wrap;gap:24px}article{max-width:280px}h2{font-size:18px}</style><h1>Accent Edge / Magnetic Hover</h1><p>原生窗口260px紧裁，图像内嵌，可离线打开。只移动视觉对象，真实窗口不跟随pointer。强度/手感仍待人工验收，远程GIF不证明GPU呈现流畅度。</p><main>'+''.join(cards)+'</main></html>'
    (root/'comparison.html').write_text(text,encoding='utf-8')


def smoke(exe,out):
    app=None;cap=None;r={}
    try:
        app=PolishRuntime(exe,out,lifetime=10000);cap=CropCapture((490,290,750,550))
        app.point(30,30);app.wait(.85);app.click(100,100);app.point(100,100);app.wait(.2)
        for name,x,y in [('centre-before',100,100),('left-edge',6,100),('centre-after',100,100)]:
            app.event(name,lambda:app.point(x,y));app.wait(.4);app.backdrop.update();im=cap.grab();app.capture_guard(im);im.save(out/f'{name}.png')
        r={'status':'COMPLETE','bounds':app.rect()};app.save_host()
    except Exception as e:r={'status':'FAIL','error':str(e)}
    finally:
        if cap:cap.close()
        if app:app.close()
        out.mkdir(parents=True,exist_ok=True);(out/'smoke.json').write_text(json.dumps(r,indent=2),encoding='utf-8')
    print(json.dumps(r),flush=True);return r


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--exe',type=Path,required=True);p.add_argument('--night',action='store_true');p.add_argument('--off',action='store_true');p.add_argument('--smoke',action='store_true');a=p.parse_args()
    root=Path(__file__).resolve().parents[1]/'evidence/polish-c/visual';out=root/(('night' if a.night else 'light')+('-off' if a.off else '-on'))
    r=smoke(a.exe,root/'smoke') if a.smoke else run(a.exe,out,a.night,a.off);html(root);raise SystemExit(0 if r['status']=='COMPLETE' else 1)
