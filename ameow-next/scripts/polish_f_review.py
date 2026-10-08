"""Compact lossless inspection sheets and available-display metadata."""
import json
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]/'evidence/polish-f'
for theme in ('light','night'):
    folder=ROOT/'fractional'/theme
    records=json.loads((folder/'recording.json').read_text())['records']
    selected=[]
    for phase in ('expand','near-centre','fractional-circle','right','bottom','left','top','collapse'):
        values=[r for r in records if r['phase']==phase]
        selected.append(values[len(values)*3//4 if phase=='expand' else len(values)//2])
    sheet=Image.new('RGB',(960,360),(232,232,232));draw=ImageDraw.Draw(sheet)
    for i,value in enumerate(selected):
        im=Image.open(folder/'png'/(str(value['index']).zfill(4)+'.png'))
        x=i%4*240;y=i//4*180
        draw.text((x+4,y+4),theme+' '+value['phase']+' #'+str(value['index']),fill=(20,20,20))
        sheet.paste(im.crop((20,20,50,40)).resize((240,160),Image.Resampling.NEAREST),(x,y+20))
    sheet.save(folder/'aa-detail.png')

# Enumerate available monitors without changing OS scale/settings or launching an app.
import ctypes as c
from ctypes import wintypes as w
from windows_cross_monitor import MonitorInfo,u
monitors=[]
@c.WINFUNCTYPE(w.BOOL,w.HANDLE,w.HDC,c.POINTER(w.RECT),w.LPARAM)
def visit(handle,_,rect,param):
    info=MonitorInfo();info.size=c.sizeof(info)
    if u.GetMonitorInfoW(handle,c.byref(info)):
        dpi_x=w.UINT();dpi_y=w.UINT()
        code=c.windll.shcore.GetDpiForMonitor(handle,0,c.byref(dpi_x),c.byref(dpi_y))
        monitors.append(dict(bounds=[info.monitor.left,info.monitor.top,info.monitor.right,info.monitor.bottom],work_area=[info.work.left,info.work.top,info.work.right,info.work.bottom],dpi=[dpi_x.value,dpi_y.value] if code==0 else None,dpi_hresult=code))
    return True
u.EnumDisplayMonitors(None,None,visit,0)
report=dict(monitors=monitors,actual_native_dpi=96,mixed_dpi='NOT VERIFIED',other_dpi='NOT VERIFIED',macOS='NOT VERIFIED',limits='Read-only monitor enumeration; no OS scaling change, no virtual mixedDPI claim.')
(ROOT/'display.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
