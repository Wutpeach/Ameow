"""Owned native no-glow/follow regression and lossless static-border observations.
Historical PolishRuntime is reused only for process/input/crop ownership.
"""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw
from polish_c_runtime import PolishRuntime, CropCapture, read_jsonl, u


def capture(app, path):
    app.backdrop.update()
    crop = CropCapture(app.rect())
    try:
        image = crop.grab()
        image.save(path)
        return image
    finally:
        crop.close()


def straight_edges(image, scale):
    gutter = round(14 * scale)
    side = round(200 * scale)
    inset = round(25 * scale)
    samples = {}
    for name in ("top", "bottom", "left", "right"):
        pixels = []
        for along in range(inset, side - inset):
            if name == "top": xy = (gutter + along, gutter)
            elif name == "bottom": xy = (gutter + along, gutter + side - 1)
            elif name == "left": xy = (gutter, gutter + along)
            else: xy = (gutter + side - 1, gutter + along)
            pixels.append(image.getpixel(xy))
        samples[name] = {"rgb_counts": [[list(rgb), n] for rgb, n in Counter(pixels).most_common()], "adjacent_changes": sum(a != b for a, b in zip(pixels, pixels[1:]))}
    return samples


def run(exe, out, baseline, night):
    app = None
    result = {"exe_sha256": hashlib.sha256(exe.read_bytes()).hexdigest(), "baseline": baseline, "night": night, "checks": [], "cases": []}
    def check(name, passed, observation):
        result["checks"].append({"name": name, "status": "PASS" if passed else "FAIL", "observed": observation})
    try:
        app = PolishRuntime(exe, out, night=night, lifetime=45000)
        app.backdrop.configure(background="#ffffff"); app.backdrop.update()
        app.outside(); app.wait(.7)
        capture(app, out / "compact.png")
        check("Compact endpoint", app.size() == [round(80 * app.scale)] * 2, app.rect())
        app.point(30, 30); app.wait(.9); app.click(100, 100); app.point(100, 100); app.wait(.4)
        full = app.rect()
        check("Full endpoint", app.size() == [round(228 * app.scale)] * 2, full)
        settled = capture(app, out / "full.png")
        result["static_straight_edges"] = straight_edges(settled, app.scale)
        for name, x, y in [("centre",100,100),("top",100,0),("right",200,100),("bottom",100,200),("left",0,100),("corner",194,6),("fractional",176,6),("return",100,100)]:
            app.point(x,y); app.wait(.45)
            image = capture(app, out / f"{name}.png")
            blue = sum(b-r > 20 and b-g > 10 for r,g,b in image.get_flattened_data())
            check(f"{name}: native fixed", app.rect() == full, app.rect())
            if not baseline: check(f"{name}: no blue edge light", blue == 0, blue)
            result["cases"].append({"name":name,"pointer":[x,y],"blue_pixels":blue})
        app.point(200,100); app.wait(.3); app.key("R"); app.wait(.25)
        capture(app,out / "reduced.png")
        app.key("R"); app.point(200,100); app.wait(.25)
        app.click(100,100,right=True); app.wait(.3); capture(app,out / "menu.png"); app.key("ESC")
        app.point(200,100); app.wait(.25); app.point(100,100); u.mouse_event(2,0,0,0,0); app.wait(.3); capture(app,out / "drag.png"); u.mouse_event(4,0,0,0,0)
        app.key("0"); app.outside(); app.wait(.95); capture(app,out / "collapsed.png")
        check("Collapse releases Full footprint", app.size()==[round(80*app.scale)]*2,app.rect())
        app.save_host()
        result["dpi"]=96*app.scale
    except Exception as error:
        result["error"]={"type":type(error).__name__,"message":str(error)}
    finally:
        if app: app.close()
    frames=read_jsonl(out / "frames.jsonl")
    hover=[f for f in frames if "hover" in f]
    if hover:
        check("Follow bounded to 3px", all(math.hypot(*f["hover"]["current_offset"])<=3.001 for f in hover),max(math.hypot(*f["hover"]["current_offset"]) for f in hover))
        check("Follow still reaches edge", any(math.hypot(*f["hover"]["current_offset"])>2.99 for f in hover),len(hover))
        reduced=[f for f in hover if f["reduced"]]
        check("Reduced Motion clears follow", bool(reduced) and all(f["hover"]["current_offset"]==[0,0] and f["hover"]["target_offset"]==[0,0] for f in reduced),len(reduced))
        locked=[f for f in hover if any(f["hover"]["locks"])]
        check("Locks suppress follow target",bool(locked) and all(f["hover"]["target_offset"]==[0,0] for f in locked),len(locked))
        quiet=[f for f in hover if abs(f["hover"]["distance"])>56]
        check("Centre has zero target",bool(quiet) and all(f["hover"]["target_offset"]==[0,0] for f in quiet),len(quiet))
        check("Compact and morph have no follow",all(f["hover"]["current_offset"]==[0,0] for f in hover if not f["target_full"] or f["rawfullness"]!=1 or f["surface_extra"]!=0),len(hover))
    else: check("Follow frame evidence available",False,0)
    result["overall"]="PASS" if result["checks"] and all(c["status"]=="PASS" for c in result["checks"]) and "error" not in result else "FAIL"
    (out / "summary.json").write_text(json.dumps(result,indent=2),encoding="utf-8")
    print(json.dumps({"out":str(out),"overall":result["overall"],"checks":len(result["checks"])}),flush=True)
    return result


if __name__=="__main__":
    parser=argparse.ArgumentParser(); parser.add_argument("--exe",type=Path,required=True); parser.add_argument("--out",type=Path,required=True); parser.add_argument("--baseline",action="store_true")
    args=parser.parse_args()
    results=[run(args.exe,args.out/("night" if night else "light"),args.baseline,night) for night in (False,True)]
    sheet=Image.new("RGB",(480,500),"white"); draw=ImageDraw.Draw(sheet)
    for i,(theme,mode) in enumerate([(theme,mode) for theme in ("light","night") for mode in ("compact","full")]):
        path=args.out/theme/f"{mode}.png"
        if path.exists():
            image=Image.open(path); x=i%2*240; y=i//2*250; draw.text((x+8,y+4),f"{theme} {mode}",fill="black");sheet.paste(image,(x+6,y+22))
    sheet.save(args.out/"static-sheet.png")
    raise SystemExit(0 if all(r["overall"]=="PASS" for r in results) else 1)
