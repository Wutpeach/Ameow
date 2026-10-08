"""Same historical default validator with stage/input telemetry, no relaxed checks."""
import sys,time,json
from pathlib import Path
import polish_e_default_validate as validator
from polish_e_space import SpaceRuntime

class TracedRuntime(SpaceRuntime):
    def __init__(self,exe,out,*args,**kwargs):
        kwargs['extra_args']=[*kwargs.get('extra_args',[]),'--telemetry',str((out/'stages.jsonl').resolve())]
        super().__init__(exe,out,*args,**kwargs)
    def key(self,char):
        self.event('key-'+char,lambda:super(TracedRuntime,self).key(char))
    def click(self,x,y,right=False):
        self.event('click-'+str((x,y,right)),lambda:super(TracedRuntime,self).click(x,y,right))
validator.SpaceRuntime=TracedRuntime
raise SystemExit(0 if validator.run(Path(sys.argv[1]),Path(sys.argv[2])) else 1)
