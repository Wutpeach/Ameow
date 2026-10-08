"""Final approved build, default-on centre quiet shadow baseline."""
import json
from pathlib import Path
from PIL import Image,ImageDraw
from polish_c_runtime import PolishRuntime,CropCapture


def run(root,night):
    out=root/'evidence/hover-tune/final-shadow'/('night' if night else 'light');app=None;cap=None;items=[];images=[]
    try:
        app=PolishRuntime(root/'target/release/ameow-next.exe',out,night=night,lifetime=15000);cap=CropCapture((490,290,750,550))
        def grab():
            app.backdrop.update();im=cap.grab();app.capture_guard(im);r=app.rect();crop=im.crop((r[0]-490,r[1]-290,r[2]-490,r[3]-290));w,h=crop.size
            points=[(x,y) for y in (0,h-1) for x in range(w)]+[(x,y) for x in (0,w-1) for y in range(h)]
            edge=max(max(abs(v-232) for v in crop.getpixel(p)[:3]) for p in points);row=[crop.getpixel((x,h//2))[:3] for x in range(w)]
            fill=sum(max(abs(p[i]-(35,36,39)[i]) for i in range(3))<=1 for p in row) if night else sum(min(p)>=254 for p in row)
            images.append(im);items.append({'index':len(images)-1,'width':w,'edge_delta':edge,'fill':fill,'bounds':r,'center_rgb':crop.getpixel((w//2,h//2))[:3]})
        app.event('quiet-expand',lambda:app.point(30,30));app.wait(.10,grab);app.point(100,100);app.wait(.7,grab);app.event('quiet-collapse',app.outside);app.wait(.8,grab)
        records=[]
        for endpoint,width in [('full',228),('compact',80)]:
            candidates=[item for item in items if item['width']==width]
            for phase,item in [('peak',max(candidates,key=lambda item:item['fill'])),('settled',candidates[-1])]:
                images[item['index']].save(out/f'{endpoint}-{phase}.png');records.append({'theme':'Night' if night else 'Light','endpoint':endpoint,'phase':phase,**item,'status':'PASS' if item['edge_delta']<=1 else 'FAIL'})
        app.save_host();(out/'observations.json').write_text(json.dumps({'default_hover_on':True,'exe_sha256':app.exe_hash,'checks':records},indent=2),encoding='utf-8');return records
    finally:
        if cap:cap.close()
        if app:app.close()


if __name__=='__main__':
    root=Path(__file__).resolve().parents[1];records=run(root,False)+run(root,True);out=root/'evidence/hover-tune/final-shadow'
    sheet=Image.new('RGB',(1040,600),(232,232,232));draw=ImageDraw.Draw(sheet)
    for i,item in enumerate(records):
        im=Image.open(out/item['theme'].lower()/f"{item['endpoint']}-{item['phase']}.png");x=i%4*260;y=i//4*300;sheet.paste(im,(x,y+40));draw.text((x+5,y+4),f"{item['theme']} {item['endpoint']} {item['phase']} edge{item['edge_delta']}/255",fill=(20,20,20))
    sheet.save(out/'eight-cases.png');(out/'eight-cases.json').write_text(json.dumps(records,indent=2),encoding='utf-8');print(json.dumps(records),flush=True)
