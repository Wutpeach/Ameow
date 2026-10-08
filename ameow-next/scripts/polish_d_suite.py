"""Sequential desktop ownership for the matched A/B runs."""
import argparse
from pathlib import Path
from polish_d_run import run

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('mode', choices=['remaining-measurements', 'visual'])
    a = p.parse_args()
    root = Path(__file__).resolve().parents[1]
    if a.mode == 'remaining-measurements':
        jobs = [('baseline-a-night','a',True,True),('current-a-light','a',False,False),('current-a-night','a',False,True),('current-b-light','b',False,False),('current-b-night','b',False,True)]
    else:
        jobs = [('current-a-light','a',False,False),('current-b-light','b',False,False),('current-a-night','a',False,True),('current-b-night','b',False,True)]
    results = []
    for name, variant, baseline, night in jobs:
        exe = root / ('target/polish-d-baseline/ameow-next.exe' if baseline else 'target/release/ameow-next.exe')
        out = root / 'evidence/polish-d' / ('visual' if a.mode == 'visual' else 'matched') / name
        result = run(exe, out, variant, baseline, night, a.mode == 'visual')
        results.append(result)
        if result['overall'] != 'PASS':
            raise SystemExit(1)
