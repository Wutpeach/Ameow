"""Matched real-pointer Repair A runs. Performance never captures screenshots."""
import argparse
import base64
import json
from pathlib import Path
import time
from PIL import Image,ImageDraw,ImageGrab
from repair_a_runtime import RepairRuntime,CropCapture,u,w


def perf(exe,out,motion,cycles,dt,flags):
    app=None;report={'motion':motion,'cycles':cycles,'capture_enabled':False,'dt':dt,'native_flags':flags,'limits':'CPU callback cadence and actual HWND observations; not GPU present timing.'}
    try:
        app=RepairRuntime(exe,out,motion,dt,flags,max(60000,cycles*4000+20000))
        app.wait(.3)
        app.event('focus-initial',app.inside);app.wait(.60);app.click(40,40)
        app.event('focus-reset',app.outside);app.wait(.85)
        for cycle in range(cycles):
            for name,action,wait in [('expand',app.inside,.68),('collapse',app.outside,.68),('reverse-expand-start',app.inside,.14),('reverse-collapse',app.outside,.17),('reverse-reenter',app.inside,.68),('reset-compact',app.outside,.68)]:
                app.event(name,action,cycle);app.wait(wait)
        app.event('endpoint-settle-expand',app.inside);app.wait(.28)
        app.event('endpoint-settle-leave',app.outside);app.wait(.18)
        app.event('endpoint-settle-reenter',app.inside);app.wait(.68)
        app.event('endpoint-reset-compact',app.outside);app.wait(.68)
        app.event('reduced-mid-travel-expand',app.inside);app.wait(.11)
        app.event('reduced-on',lambda:app.key('R'));app.wait(.15)
        reduced_full=app.size();app.event('reduced-collapse',app.outside);app.wait(.18)
        reduced_compact=app.size();app.event('reduced-reenter',app.inside);app.wait(.15)
        app.event('reduced-off',lambda:app.key('R'));app.wait(.2)
        app.click(40,40);app.key('1');app.outside();app.wait(.55)
        locked=app.size();app.key('0');app.wait(.7)
        report['checks']={'reduced_midtravel_full':reduced_full,'reduced_direct_compact':reduced_compact,'active_lock_full':locked,'idle_after_lock':app.size()}
        report['behavior_pass']=reduced_full==[round(228*app.scale)]*2 and reduced_compact==[round(80*app.scale)]*2 and locked==[round(228*app.scale)]*2 and app.size()==[round(80*app.scale)]*2
        app.save_host();report['status']='COMPLETE'
    except Exception as e:report.update(status='FAILED',error={'type':type(e).__name__,'message':str(e)})
    finally:
        if app:app.close()
        out.mkdir(parents=True,exist_ok=True);(out/'run.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'run':str(out),'status':report['status'],'behavior_pass':report.get('behavior_pass')}),flush=True)
    return report


def visual(exe,out,motion,dt,flags,night=False):
    app=None;capture_dc=None;report={'motion':motion,'theme':'Night' if night else 'Light','capture_enabled':True,'performance_evidence':False}
    try:
        app=RepairRuntime(exe,out,motion,dt,flags,15000,['--night'] if night else [])
        fixed=(490,290,750,550)
        capture_dc=CropCapture(fixed)
        images=[];times=[];paint_observations=[]
        def capture():
            app.backdrop.update()
            u.SetWindowPos(app.hwnd,w.HWND(-1),0,0,0,0,0x13)
            image=capture_dc.grab()
            app.capture_guard(image);images.append(image);times.append((time.perf_counter()-app.started)*1000)
            r=app.rect();width=r[2]-r[0]
            crop=image.crop((r[0]-fixed[0],r[1]-fixed[1],r[2]-fixed[0],r[3]-fixed[1]))
            row=[crop.getpixel((x,crop.height//2))[:3] for x in range(crop.width)]
            white_width=sum(max(abs(p[i]-(35,36,39)[i]) for i in range(3))<=1 for p in row) if night else sum(min(p)>=254 for p in row)
            edge_points=[(x,y) for y in (0,crop.height-1) for x in range(crop.width)]+[(x,y) for x in (0,crop.width-1) for y in range(crop.height)]
            edge=max(max(abs(v-232) for v in crop.getpixel(p)[:3]) for p in edge_points)
            paint_observations.append({'frame_index':len(images)-1,'host_ms':times[-1],'native_width':width,'observed_white_surface_width_px':white_width,'observed_surface_fill_width_px':white_width,'native_outer_edge_max_delta':edge,'bounds':r})
        app.wait(.15,capture)
        for name,action,duration in [('expand',app.inside,.70),('collapse',app.outside,.72),('reverse-expand-start',app.inside,.14),('reverse-collapse',app.outside,.17),('reverse-reenter',app.inside,.70),('reset-compact',app.outside,.72)]:
            app.event(name,action,0);app.wait(duration,capture)
        delays=[max(20,round(b-a)) for a,b in zip(times,times[1:])]+[80]
        images[0].save(out/'matched-motion.gif',save_all=True,append_images=images[1:],duration=delays,loop=0)
        indexes=[round(i*(len(images)-1)/7) for i in range(8)]
        sheet=Image.new('RGB',(4*260,2*284),(232,232,232));draw=ImageDraw.Draw(sheet)
        for i,index in enumerate(indexes):
            x=i%4*260;y=i//4*284;sheet.paste(images[index],(x,y+24));draw.text((x+5,y+4),f'{motion} {times[index]:.0f}ms',fill=(20,20,20))
        sheet.save(out/'filmstrip.png');app.save_host()
        peaks=[]
        for label,width in [('compact',80),('full',228)]:
            candidates=[item for item in paint_observations if item['native_width']==width]
            if candidates:
                peak=max(candidates,key=lambda item:item['observed_white_surface_width_px'])
                images[peak['frame_index']].save(out/f'{label}-observed-peak.png')
                peaks.append({'endpoint':label,**peak})
        (out/'paint-observations.json').write_text(json.dumps({'theme':report['theme'],'limits':'Actual screenshot fill raster measurements, excluding 1px border/antialiasing at each side. Compare matched baseline fill198/58 to logical200/60; estimate +2px with ±1px raster/sampling error. Light threshold≥254; Night fill#232427±1. No claim of exact logical peak.', 'frames':paint_observations,'endpoint_observed_peaks':peaks},indent=2),encoding='utf-8')
        report.update(status='COMPLETE',frames=len(images),capture_times_ms=times,crop=fixed)
    except Exception as e:report.update(status='FAILED',error={'type':type(e).__name__,'message':str(e)})
    finally:
        if capture_dc:capture_dc.close()
        if app:app.close()
        out.mkdir(parents=True,exist_ok=True);(out/'run.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'visual':str(out),'status':report['status']}),flush=True)
    return report


def comparison(out):
    cards=[]
    for path in sorted(out.glob('*/matched-motion.gif')):
        uri='data:image/gif;base64,'+base64.b64encode(path.read_bytes()).decode()
        paint_path=path.parent/'paint-observations.json'
        paint=json.loads(paint_path.read_text()) if paint_path.exists() else {}
        peaks=[]
        for peak in paint.get('endpoint_observed_peaks',[]):
            imgpath=path.parent/f"{peak['endpoint']}-observed-peak.png"
            png='data:image/png;base64,'+base64.b64encode(imgpath.read_bytes()).decode()
            peaks.append(f"<details><summary>{peak['endpoint']} 观测峰值：fill {peak['observed_white_surface_width_px']} px；外缘差 {peak['native_outer_edge_max_delta']}/255</summary><img src='{png}' width='260' height='260'></details>")
        cards.append(f'<article><h2>{path.parent.name}</h2><img src="{uri}" width="260" height="260"><p>相同指针流程：展开→离开收缩→途中反转。原生260px裁切。</p>'+''.join(peaks)+'</article>')
    html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ameow Repair A 动画对比</title><style>body{font:16px system-ui;background:#e8e8e8;color:#232427;margin:24px}main{display:flex;flex-wrap:wrap;gap:24px}article{max-width:280px}h2{font-size:18px}p{line-height:1.5}details{margin:12px 0}</style><h1>Ameow Window Motion 对比</h1><p>GIF用于人工手感比较；截图运行与性能运行分开。未选择最终产品参数。重新打开页面可同步开始各GIF。</p><p>研究限制：CPU callback不等于GPU present。A-soft 实测最终settle约429–449ms，超过420ms目标；Night Full峰值阴影外缘A-soft 2/255、A-crisp 4/255，超过R1的1/255标准。B原生bounds会超80–228范围。fill像素排除两侧描边，可用匹配baseline198/58对应200/60进行+2px估计，误差约±1px，截图抽样不能保证精确峰值。</p><main>'+''.join(cards)+'</main></html>'
    (out/'comparison.html').write_text(html,encoding='utf-8')


def probe(exe,out,native_probe,period_ms):
    app=None;report={'motion':'baseline','cycles':8,'capture_enabled':False,'dt':'baseline','native_flags':'always','native_probe':native_probe,'probe_period_ms':period_ms,'stimulus':'Research-only timed target alternation; no pointer/hitbox confound; not product behavior.'}
    try:
        app=RepairRuntime(exe,out,'baseline','baseline','always',17000,['--native-probe',native_probe,'--probe-period-ms',str(period_ms)])
        deadline=time.perf_counter()+25
        while app.proc.poll() is None and time.perf_counter()<deadline:
            if u.IsWindow(app.hwnd):app.sample()
            time.sleep(.008)
        report['status']='COMPLETE' if app.proc.poll()==0 else 'FAILED'
        report['exit_code']=app.proc.poll();app.save_host()
    except Exception as e:report.update(status='FAILED',error={'type':type(e).__name__,'message':str(e)})
    finally:
        if app:app.close()
        out.mkdir(parents=True,exist_ok=True);(out/'run.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'probe':str(out),'status':report['status']}),flush=True)
    return report


if __name__=='__main__':
    p=argparse.ArgumentParser();root=Path(__file__).resolve().parents[1]
    p.add_argument('--exe',type=Path,required=True);p.add_argument('--profile',required=True);p.add_argument('--mode',choices=['perf','visual','probe'],default='perf')
    p.add_argument('--motions',nargs='+',default=['baseline','a-soft','a-crisp','b']);p.add_argument('--cycles',type=int,default=8)
    p.add_argument('--dt',default='baseline');p.add_argument('--native-flags',default='always');p.add_argument('--out',type=Path,default=root/'evidence/repair-a')
    p.add_argument('--native-probe',choices=['normal','origin-only','resize-only'],default='normal');p.add_argument('--probe-period-ms',type=int,default=900)
    p.add_argument('--night',action='store_true')
    args=p.parse_args();runroot=args.out/args.mode/args.profile
    reports=[]
    for motion in (['baseline'] if args.mode=='probe' else args.motions):
        dest=runroot/f'{motion}-{args.dt}-{args.native_flags}'
        if args.mode=='probe':dest=runroot/args.native_probe
        reports.append(probe(args.exe,dest,args.native_probe,args.probe_period_ms) if args.mode=='probe' else perf(args.exe,dest,motion,args.cycles,args.dt,args.native_flags) if args.mode=='perf' else visual(args.exe,dest,motion,args.dt,args.native_flags,args.night))
    if args.mode=='visual':comparison(runroot)
    raise SystemExit(0 if all(r['status']=='COMPLETE' and r.get('behavior_pass',True) for r in reports) else 1)
