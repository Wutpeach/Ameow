"""Actual raster contrast, extent and tail observations at matched world input."""
import json
from pathlib import Path
from PIL import Image


def luminance(rgb):
    values=[v/255 for v in rgb];linear=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values]
    return sum(a*b for a,b in zip(linear,(.2126,.7152,.0722)))


def observe(folder):
    rows=[]
    for name in ('left','right','top','bottom','top-left','top-right','gutter-left','gutter-right','centre'):
        im=Image.open(folder/f'{name}.png').convert('RGB');vertical=name not in ('top','bottom')
        line=[im.getpixel((x,124) if vertical else (124,x)) for x in range(260)]
        indices=[i for i,(r,g,b) in enumerate(line) if b-r>20 and b-g>10 and b>80]
        strongest=min((line[i] for i in indices),key=luminance,default=None)
        # Native228 coordinates in fixedcrop:10..237. Outside is ownedbackdrop.
        edge_coords=[(x,y) for y in (10,237) for x in range(10,238)]+[(x,y) for x in (10,237) for y in range(10,238)]
        max_edge=max((max(abs(v-232) for v in im.getpixel(p)) for p in edge_coords),default=0)
        worst=max(edge_coords,key=lambda p:max(abs(v-232) for v in im.getpixel(p)))
        x,y=worst;outward=(x-1,y) if x==10 else (x+1,y) if x==237 else (x,y-1) if y==10 else (x,y+1)
        inner=(x+1,y) if x==10 else (x-1,y) if x==237 else (x,y+1) if y==10 else (x,y-1)
        rows.append({'case':name,'strongest_actual_cross_section_rgb':strongest,'measured_core_contrast_against_white':1.05/(luminance(strongest)+.05) if strongest else None,'blue_cross_section_span':indices,'outer_native_max_background_difference':max_edge,'worst_edge_position':worst,'outward_rgb':im.getpixel(outward),'edge_rgb':im.getpixel(worst),'inward_rgb':im.getpixel(inner)})
    pixels=json.loads((folder/'pixel-observations.json').read_text())
    return {'folder':folder.name,'cross_sections':rows,'blue_pixel_counts':pixels,'limits':'Actual blended raster RGB, aligned to each case edge by detectingbluecrosssection rather than assumingunchangedcarrierposition. Contrastagainstwhite is measuredcorepixel only, notwholeUIaccessibilityrating. NativeoutertailRGB difference is interactivebloom+shadow andnotcentre-onlyshadowcriterion; perceptiblehardcutawaitshumanreview.'}


if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]/'evidence/hover-tune';r=[observe(root/f'{theme}-{version}') for theme in ('light','night') for version in ('before','after','final') if (root/f'{theme}-{version}').exists()];(root/'actual-raster-comparison.json').write_text(json.dumps(r,indent=2),encoding='utf-8')
    for item in r:print(json.dumps({'folder':item['folder'],'left':item['cross_sections'][0],'right':item['cross_sections'][1]}))
