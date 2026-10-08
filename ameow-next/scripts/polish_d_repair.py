"""Use unchanged Repair B lifecycle replay with magnetic B in a fresh evidence root."""
from pathlib import Path
import subprocess
from repair_b_run import run

if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]
    original=subprocess.Popen
    def launch(args,*positional,**kwargs):
        if args and Path(args[0]).name.lower()=='ameow-next.exe':args=list(args)+['--magnetic','b']
        return original(args,*positional,**kwargs)
    subprocess.Popen=launch
    try:
        results=[run(root/'target/release/ameow-next.exe',root/'evidence/polish-d'/('repair-night' if night else 'repair-light'),night=night,cycles=4) for night in (False,True)]
        raise SystemExit(0 if all(r.get('behavior_pass') and r['status']=='COMPLETE' for r in results) else 1)
    finally:
        subprocess.Popen=original
