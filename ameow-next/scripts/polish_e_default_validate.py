"""Check normal launch, accepted B behavior, and explicit historical fallback."""
import argparse
import json
import math
from pathlib import Path
from polish_e_space import SpaceRuntime, measure
from repair_a_runtime import CropCapture, read_jsonl

def run(exe, out, night=False, fallback=False):
    app = None
    crop = None
    checks = []
    deferred = []
    out.mkdir(parents=True, exist_ok=True)
    def check(name, passed, observed):
        checks.append(dict(name=name, status='PASS' if passed else 'FAIL', observed=observed))
    def latest():
        return [f for f in read_jsonl(out/'frames.jsonl') if 'hover' in f][-1]
    def key(char):
        # Physical Surface click establishes keyboard focus before synthetic input.
        if char != 'ESC':
            app.click(80,80)
            app.wait(.1)
        app.key(char)
        app.wait(.1)
    def defer(name, select, predicate):
        deferred.append((name,select,predicate))
    try:
        args = (['--magnetic', 'a'] if fallback else []) + (['--night'] if night else [])
        app = SpaceRuntime(exe, out, 'converged', lifetime=30000, extra_args=args)
        app.inside()
        app.wait(.9)
        app.click(114, 114)
        if latest()['reduced']:
            key('R')
        app.point(104, 100)
        app.wait(.9)
        f = latest()
        check('explicit A fallback' if fallback else 'normal launch selects B without magnetic flag', f['hover']['variant'] == ('a' if fallback else 'b'), f['hover']['variant'])
        check('Full native bounds and rest anchor', f['native_request'] == [500,300,228,228] and f['anchor'] == [514,314] and app.size() == [228,228], dict(request=f['native_request'], anchor=f['anchor'], actual=app.rect()))
        if fallback:
            defer('near-centre historical quiet profile', lambda fs: [f for f in fs if f['hover']['rest_pointer']==[104,100]], lambda fs: math.hypot(*fs[-1]['hover']['current_offset']) < .01)
        else:
            check('near-centre accepted follow responds', math.hypot(*f['hover']['current_offset']) > .3, f['hover']['current_offset'])
        if not fallback:
            app.point(200,100)
            app.wait(.9)
            f = latest()
            check('default reaches accepted6px peak', 5.999 <= math.hypot(*f['hover']['current_offset']) <= 6.00001, f['hover']['current_offset'])
            crop = CropCapture((490,290,750,550))
            app.backdrop.update()
            image = crop.grab()
            app.capture_guard(image)
            image.save(out/'default-b-peak.png')
            check('actual Surface visible in tight native crop', True, measure(image, app.rect()))
            key('M')
            app.point(104,100)
            app.wait(.4)
            defer('M reaches historical A and quiet centre', lambda fs: [f for f in fs if f['hover']['variant']=='a' and f['hover']['rest_pointer']==[104,100]], lambda fs: math.hypot(*fs[-1]['hover']['current_offset']) < .01)
            key('M')
            app.point(200,100)
            app.wait(.9)
            defer('M returns to accepted B6px', lambda fs: [f for i,f in enumerate(fs) if f['hover']['variant']=='b' and any(p['hover']['variant']=='a' for p in fs[:i]) and f['hover']['rest_pointer']==[200,100]], lambda fs: max(math.hypot(*f['hover']['current_offset']) for f in fs) >= 5.999)
            app.click(114,114,right=True)
            app.wait(.95)
            f = latest()
            check('menu lock retires magnetic while retaining Full', any(f['hover']['locks']) and math.hypot(*f['hover']['current_offset']) < .01 and app.size() == [228,228], dict(offset=f['hover']['current_offset'], locks=f['hover']['locks']))
            key('ESC')
            app.point(200,100)
            app.wait(.9)
            f = latest()
            check('menu unlock resumes B', not any(f['hover']['locks']) and math.hypot(*f['hover']['current_offset']) >= 5.999, f['hover']['current_offset'])
            key('R')
            app.wait(.15)
            defer('Reduced Motion clears B position and velocity', lambda fs: [f for f in fs if f['reduced'] and f['hover']['variant']=='b'], lambda fs: all(f['hover']['current_offset']==[0,0] and f['hover']['spring_position']==[0,0] and f['hover']['spring_velocity']==[0,0] for f in fs))
            key('R')
            app.point(200,100)
            app.wait(.9)
            defer('motion restores current B target', lambda fs: [f for i,f in enumerate(fs) if not f['reduced'] and f['hover']['rest_pointer']==[200,100] and any(p['reduced'] for p in fs[:i])], lambda fs: max(math.hypot(*f['hover']['current_offset']) for f in fs) >= 5.999)
            app.outside()
            app.wait(.9)
            check('leave collapses actual native80', app.size() == [80,80], app.rect())
            defer('Compact has no B residual', lambda fs: fs[-1:], lambda fs: not fs[-1]['target_full'] and fs[-1]['hover']['current_offset']==[0,0] and fs[-1]['hover']['spring_velocity']==[0,0])
        app.save_host()
        result = dict(checks=checks, exe_sha256=app.exe_hash, command=app.command, native_limit='Targeted default adoption flows only. Known shadow cutoff and border AA remain unresolved; not full platform acceptance.')
    except Exception as error:
        result = dict(checks=checks, error=dict(type=type(error).__name__, message=str(error)))
    finally:
        if crop:
            crop.close()
        if app:
            app.close()
    # --measure is buffered; read completed logs, never treat live tail as current state.
    frames = [f for f in read_jsonl(out/'frames.jsonl') if 'hover' in f]
    for name, select, predicate in deferred:
        selected = select(frames)
        check(name, bool(selected) and predicate(selected), dict(frames=len(selected), last=selected[-1] if selected else None))
    result['overall'] = 'PASS' if checks and all(c['status']=='PASS' for c in checks) and 'error' not in result else 'FAIL'
    (out/'default-validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(dict(out=str(out), overall=result['overall'], checks=len(checks), failures=[c for c in checks if c['status']=='FAIL'], error=result.get('error'))),flush=True)
    return result['overall'] == 'PASS'

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--exe', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--night', action='store_true')
    parser.add_argument('--fallback', action='store_true')
    args = parser.parse_args()
    raise SystemExit(0 if run(args.exe,args.out,args.night,args.fallback) else 1)
