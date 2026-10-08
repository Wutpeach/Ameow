"""Default-on centre quietness and Repair B shadow baseline, eight real cases."""
import json
from pathlib import Path
import time
from PIL import Image,ImageDraw
from polish_c_runtime import PolishRuntime,CropCapture


def run(root,night):
    out=root/'evidence/polish-c/shadow'/('night' if night else 'light');app=None;cap=None;items=[];images=[]
    try:
        app=PolishRuntime(root/'target/release/ameow-next.exe',out,night=night,lifetime=15000);cap=CropCapture((490,290,750,550))
        def grab():
            app.backdrop.update();im=cap.grab();app.capture_guard(im);rect=app.rect();crop=im.crop((rect[0]-490,rect[1]-290,rect[2]-490,rect[3]-290));w,h=crop.size
            points=[(x,y) for y in (0,h-1) for x in range(w)]+[(x,y) for x in (0,w-1) for y in range(h)]
            edge=max(max(abs(v-232) for v in crop.getpixel(p)[:3]) for p in points)
            row=[crop.getpixel((x,h//2))[:3] for x in range(w)]
            fill=sum(max(abs(p[i]-(35,36,39)[i]) for i in range(3))<=1 for p in row) if night else sum(min(p)>=254 for p in row)
            images.append(im);items.append({'index':len(images)-1,'width':w,'edge_delta':edge,'fill':fill,'bounds':rect})
        app.event('quiet-expand',lambda:app.point(30,30));app.wait(.10,grab);app.point(100,100);app.wait(.7,grab)
        app.event('quiet-collapse',app.outside);app.wait(.8,grab)
        records=[]
        for label,width in [('full',228),('compact',80)]:
            candidates=[i for i in items if i['width']==width]
            peak=max(candidates,key=lambda i:i['fill']);settled=candidates[-1]
            for phase,item in [('peak',peak),('settled',settled)]:
                images[item['index']].save(out/f'{label}-{phase}.png');records.append({'theme':'Night' if night else 'Light','endpoint':label,'phase':phase,**item,'status':'PASS' if item['edge_delta']<=1 else 'FAIL'})
        app.save_host();(out/'observations.json').write_text(json.dumps({'launch_hover':'default on','cases':records,'overall':'PASS' if all(i['status']=='PASS' for i in records) else 'FAIL'},indent=2),encoding='utf-8')
        return records
    finally:
        if cap:cap.close()
        if app:app.close()


if __name__=='__main__':
    root=Path(__file__).resolve().parents[1];records=run(root,False)+run(root,True);out=root/'evidence/polish-c/shadow'
    sheet=Image.new('RGB',(1040,600),(232,232,232));draw=ImageDraw.Draw(sheet)
    for i,item in enumerate(records):
        im=Image.open(out/item['theme'].lower()/f"{item['endpoint']}-{item['phase']}.png");x=i%4*260;y=i//4*300;sheet.paste(im,(x,y+40));draw.text((x+5,y+4),f"{item['theme']} {item['endpoint']} {item['phase']} edge{item['edge_delta']}/255",fill=(20,20,20))
    sheet.save(out/'eight-cases.png');(out/'eight-cases.json').write_text(json.dumps(records,indent=2),encoding='utf-8');print(json.dumps(records),flush=True)
