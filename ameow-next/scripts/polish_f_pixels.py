"""Analyze actual paired native PNGs; never generate simulated evidence."""
import json
import math
from pathlib import Path
from collections import Counter
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]/'evidence/polish-f'

def sdf(x,y,gutter,side,radius):
    qx=abs(x+.5-gutter-side/2)-(side/2-radius)
    qy=abs(y+.5-gutter-side/2)-(side/2-radius)
    return math.hypot(max(qx,0),max(qy,0))+min(max(qx,qy),0)-radius

def analyze():
    results=[]
    for theme in ('light','night'):
        rows=[]
        for background in ('neutral','white'):
            for mode in ('compact','full'):
                old=Image.open(ROOT/'before'/theme/f'{background}-{mode}.png').convert('RGB')
                new=Image.open(ROOT/'after'/theme/f'{background}-{mode}.png').convert('RGB')
                assert old.size==new.size
                g,side,r=(10,60,30) if mode=='compact' else (14,200,20)
                categories={k:dict(pixels=0,changed=0,max_rgb_delta=0) for k in ('interior','outer_shadow','rounded_fringe')}
                for y in range(old.height):
                    for x in range(old.width):
                        d=sdf(x,y,g,side,r)
                        group='interior' if d<=-1.5 else 'outer_shadow' if d>=.5 else 'rounded_fringe'
                        c=categories[group];c['pixels']+=1
                        delta=max(abs(a-b) for a,b in zip(old.getpixel((x,y)),new.getpixel((x,y))))
                        c['changed']+=int(delta>0);c['max_rgb_delta']=max(c['max_rgb_delta'],delta)
                points=[(30,11),(11,30),(12,28),(13,26),(18,19),(10,40)] if mode=='compact' else [(19,20),(30,14),(14,32),(23,16)]
                samples=[dict(xy=p,sdf=sdf(*p,g,side,r),before=old.getpixel(p),after=new.getpixel(p)) for p in points]
                straight={}
                if mode=='full':
                    positions={'top':[(x,14) for x in range(34,194)],'bottom':[(x,213) for x in range(34,194)],'left':[(14,y) for y in range(34,194)],'right':[(213,y) for y in range(34,194)]}
                    for edge,ps in positions.items():
                        straight[edge]=dict(samples=len(ps),before=dict((str(k),v) for k,v in Counter(old.getpixel(p) for p in ps).items()),after=dict((str(k),v) for k,v in Counter(new.getpixel(p) for p in ps).items()),changed=sum(old.getpixel(p)!=new.getpixel(p) for p in ps))
                results.append(dict(theme=theme,background=background,mode=mode,categories=categories,samples=samples,straight_edges=straight))
                # All four Full corners / all four Compact quadrants, unfiltered nearest neighbor.
                tile=Image.new('RGB',(1000,268),(232,232,232));draw=ImageDraw.Draw(tile)
                draw.text((6,4),f'{theme} {background} {mode}: BEFORE | AFTER (1:1); 8x corner/quadrant strips',fill=(20,20,20))
                tile.paste(old,(4,28));tile.paste(new,(244,28))
                boxes=[(g-2,g-2,g+28,g+13),(g+side-28,g-2,g+side+2,g+13),(g-2,g+side-13,g+28,g+side+2),(g+side-28,g+side-13,g+side+2,g+side+2)]
                # A separate compact sheet avoids tall whitespace around the 80px circle.
                details=Image.new('RGB',(976,272),(232,232,232));dd=ImageDraw.Draw(details)
                dd.text((4,4),f'{theme} {background} {mode}: top row BEFORE, bottom row AFTER; TL / TR / BL / BR at8x',fill=(20,20,20))
                for j,box in enumerate(boxes):
                    details.paste(old.crop(box).resize((240,120),Image.Resampling.NEAREST),(j*244,24))
                    details.paste(new.crop(box).resize((240,120),Image.Resampling.NEAREST),(j*244,148))
                details.save(ROOT/f'paired-{theme}-{background}-{mode}-8x.png')
                for im,x in ((old,4),(new,244)):
                    box=(g-2,g-2,g+28,g+13)
                    tile.paste(im.crop(box).resize((240,120),Image.Resampling.NEAREST),(488 if x==4 else 744,28))
                tile=tile.crop((0,0,1000,268 if mode=='full' else 150))
                rows.append(tile)
        sheet=Image.new('RGB',(1000,sum(im.height for im in rows)),(232,232,232));y=0
        for im in rows:sheet.paste(im,(0,y));y+=im.height
        sheet.save(ROOT/f'paired-{theme}.png')
    checks=[]
    for item in results:
        for region in ('interior','outer_shadow'):
            checks.append(dict(name=f'{item["theme"]}/{item["background"]}/{item["mode"]} unchanged {region}',passed=item['categories'][region]['changed']==0,observed=item['categories'][region]))
        if item['mode']=='full':
            checks.append(dict(name=f'{item["theme"]}/{item["background"]}/Full straight hairline',passed=all(v['changed']==0 for v in item['straight_edges'].values()),observed=item['straight_edges']))
    result=dict(actual_native_pairs=results,checks=checks,preservation='PASS' if all(c['passed'] for c in checks) else 'FAIL',limits='Only normal-shadow static96DPI zero-offset captures. Rounded fringe is intentionally changed; geometric pixel stair steps remain. Shader source predictions require isolated no-shadow native captures, separate from product evidence.')
    (ROOT/'pixel-analysis.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(dict(preservation=result['preservation'],checks=len(checks),failures=[c for c in checks if not c['passed']])))

if __name__=='__main__':analyze()
