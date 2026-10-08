"""Paired deterministic native UI pixels, Reduced Motion + hover-off control."""
import json
from pathlib import Path
import sys
from polish_e_space import SpaceRuntime
from repair_a_runtime import CropCapture

def run(exe,out):
    out.mkdir(parents=True,exist_ok=True);app=None;observations=[]
    try:
        app=SpaceRuntime(exe,out,'converged',lifetime=25000,extra_args=['--reduced','--hover','off'])
        app.inside();app.wait(.3);app.click(114,114);app.point(100,100)
        for theme in ('light','night'):
            if theme=='night':app.key('T')
            for stage in ('1','2','3','4','5'):
                app.key(stage);app.wait(.35);app.backdrop.update()
                crop=CropCapture(tuple(app.rect()))
                try:im=crop.grab()
                finally:crop.close()
                app.capture_guard(im);assert im.size==(228,228)
                im.save(out/f'{theme}-{stage}.png')
                observations.append(dict(theme=theme,stage=stage,bounds=app.rect()))
        app.save_host();result=dict(status='PASS',exe_sha256=app.exe_hash,dpi=96*app.scale,observations=observations,limits='RM and hover off for exact deterministic content pixels; live B/morph validated separately.')
    except Exception as error:result=dict(status='FAIL',error=dict(type=type(error).__name__,message=str(error)))
    finally:
        if app:app.close()
    (out/'states.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(dict(out=str(out),status=result['status'],error=result.get('error'))))
    return result['status']=='PASS'

if __name__=='__main__':raise SystemExit(0 if run(Path(sys.argv[1]),Path(sys.argv[2])) else 1)
