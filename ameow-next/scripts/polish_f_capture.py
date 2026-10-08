"""Lossless owned native border crops, identical placement and backgrounds."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw
from polish_e_space import SpaceRuntime
from repair_a_runtime import CropCapture, read_jsonl

def run(exe,out,night=False):
    app=None
    crops=[]
    observations=[]
    out.mkdir(parents=True,exist_ok=True)
    try:
        app=SpaceRuntime(exe,out,'converged',lifetime=30000,extra_args=['--hover','off']+(['--night'] if night else []))
        expected=(35,36,39) if night else (255,255,255)
        for name,bg in [('neutral',(232,232,232)),('white',(255,255,255))]:
            app.backdrop.configure(background='#%02x%02x%02x'%bg)
            app.backdrop.update()
            app.outside()
            app.wait(.85)
            for mode in ('compact','full'):
                if mode=='full':
                    app.inside()
                    app.wait(.9)
                    app.click(114,114)
                    app.point(100,100)
                    app.wait(.3)
                app.backdrop.update()
                rect=app.rect()
                size=rect[2]-rect[0]
                assert size==(80 if mode=='compact' else 228)
                capture=CropCapture(tuple(rect))
                try:image=capture.grab()
                finally:capture.close()
                centre=image.getpixel((size//2,size//2))
                assert centre==expected, 'Surface absent or obscured'
                assert all(max(abs(a-b) for a,b in zip(image.getpixel(p),bg))<14 for p in [(0,0),(size-1,0),(0,size-1),(size-1,size-1)]), 'Owned backdrop missing'
                path=out/f'{name}-{mode}.png'
                image.save(path)
                points=[(30,11),(18,19),(10,40),(11,30),(12,28),(13,26)] if mode=='compact' else [(19,20),(23,16),(14,32),(30,14)]
                observations.append(dict(background=name,background_rgb=bg,mode=mode,bounds=rect,centre=centre,pixels=[dict(xy=list(p),rgb=image.getpixel(p)) for p in points]))
                crops.append((name,mode,image))
        app.save_host()
        result=dict(status='PASS',theme='night' if night else 'light',exe_sha256=app.exe_hash,dpi=96*app.scale,observations=observations,command=app.command,limits='Static default B with --hover off to isolate paint. Original normal shadow remains. White backdrop repeats historic defect coordinates; neutral backdrop preserves shadow comparison. No simulated screenshots.')
        sheet=Image.new('RGB',(936,552),(232,232,232))
        draw=ImageDraw.Draw(sheet)
        for row,(name,mode,image) in enumerate(crops):
            # Each row has a1:1 image and a compact8x rounded-fringe detail.
            y=row*138
            draw.text((4,y+4),f'{name} {mode} 1:1 /8x',fill=(30,30,30))
            thumb=image if mode=='compact' else image.crop((0,0,114,114))
            sheet.paste(thumb,(4,y+22))
            box=(8,8,38,23) if mode=='compact' else (12,12,42,27)
            sheet.paste(image.crop(box).resize((240,120),Image.Resampling.NEAREST),(134,y+18))
        sheet=sheet.crop((0,0,380,552))
        sheet.save(out/'capture-sheet.png')
    except Exception as error:
        result=dict(status='FAIL',error=dict(type=type(error).__name__,message=str(error)),observations=observations)
    finally:
        if app:app.close()
    (out/'capture.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(dict(out=str(out),status=result['status'],error=result.get('error'))),flush=True)
    return result['status']=='PASS'

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--exe',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--night',action='store_true')
    a=parser.parse_args()
    raise SystemExit(0 if run(a.exe,a.out,a.night) else 1)
