"""Focused native shadow follow-up; preserves earlier workflow validation."""
import json
from pathlib import Path
import time
from PIL import Image, ImageDraw
from windows_validate import Runtime


def edge_observation(image):
    w,h=image.size
    points=[(x,y) for y in (0,h-1) for x in range(w)]+[(x,y) for x in (0,w-1) for y in range(h)]
    distances=[(max(abs(v-232) for v in image.getpixel(p)[:3]),p,image.getpixel(p)[:3]) for p in points]
    worst=max(distances,key=lambda x:x[0])
    return {"max_outer_edge_distance_from_backdrop":worst[0],"worst_pixel_coordinate":worst[1],"worst_pixel_rgb":worst[2],"edge_pixel_count":len(points)}


def run():
    root=Path(__file__).resolve().parents[1];out=root/"evidence/shadow-followup"
    out.mkdir(parents=True,exist_ok=True)
    report={"scope":"Shadow-only follow-up. These four native crops supersede the shadow appearance in previous state matrix and motion evidence; previous behavior validation remains applicable.","backdrop_rgb":[232,232,232],"limit":1,"checks":[]}
    app=None;captures=[]
    try:
        app=Runtime(root/"target/debug/ameow-next.exe",out)
        for theme in ("Light","Night"):
            if theme=="Night":
                app.inside();time.sleep(.85);app.click(40,40);app.key("T")
            app.outside();time.sleep(.85)
            for mode in ("Compact","Full"):
                if mode=="Full":app.inside();time.sleep(.85)
                image=app.snap(f"{theme.lower()}-{mode.lower()}")
                observed=edge_observation(image)
                observed.update(theme=theme,mode=mode,rect=app.rect(),dpi=app.scale*96)
                observed["status"]="PASS" if observed["max_outer_edge_distance_from_backdrop"]<=1 else "FAIL"
                report["checks"].append(observed)
                captures.append((f"{theme} {mode}",image))
                print(json.dumps(observed),flush=True)
        sheet=Image.new("RGB",(480,500),(232,232,232));draw=ImageDraw.Draw(sheet)
        for i,(label,img) in enumerate(captures):
            x=(i%2)*240;y=(i//2)*250
            draw.text((x+8,y+3),label,fill=(30,30,30))
            sheet.paste(img,(x+(240-img.width)//2,y+20+(228-img.height)//2))
        sheet.save(out/"shadow-sheet.png")
        report["overall"]="PASS" if all(c["status"]=="PASS" for c in report["checks"]) else "FAIL"
    except Exception as e:
        report["error"]={"type":type(e).__name__,"message":str(e)};report["overall"]="FAIL"
    finally:
        if app:app.close()
        (out/"edge-observations.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    return 0 if report["overall"]=="PASS" else 1


if __name__=="__main__":
    raise SystemExit(run())
