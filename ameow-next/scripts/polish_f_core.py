"""Controlled core native regression: hover off only for fixed action coordinates."""
from pathlib import Path
import sys
import windows_validate as core

# Preserve historical validator bytes. Inject the sole diagnostic flag at launch.
original=core.subprocess.Popen
def launch(command,*args,**kwargs):
    return original([*command,'--hover','off'],*args,**kwargs)
core.subprocess.Popen=launch
raise SystemExit(core.validate(Path(sys.argv[1]),Path(sys.argv[2])))
