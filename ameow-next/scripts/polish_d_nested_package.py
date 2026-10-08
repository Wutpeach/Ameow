"""Compact standalone native review page and reproducibility bundles."""
import base64
import hashlib
import html
import json
from pathlib import Path
import zipfile
from repair_a_runtime import read_jsonl
from polish_d_package import plot

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence/polish-d-nested'

def uri(path,mime):
    return 'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode()

def package():
    analysis=json.loads((OUT/'analysis.json').read_text())
    cards=[]
    for theme in ('light','night'):
        group=[]
        for variant,label in [('prior-b','旧 B'),('nested-b','Nested 参考 B')]:
            p=OUT/'visual'/f'{variant}-{theme}'
            if (p/'motion.gif').exists():
                group.append(f'<article><h3>{label} · {theme}</h3><img width="260" height="288" src="{uri(p/"motion.gif","image/gif")}"></article>')
        cards.append('<div class="pair">'+''.join(group)+'</div>')
    curve=[]
    for name,color in [('prior-b-light','#7d8390'),('nested-b-light-repeat','#2563eb')]:
        frames=read_jsonl(OUT/'matched'/name/'frames.jsonl')
        frames=[f for f in frames if f['hover']['variant']=='b']
        start=next((f['ms'] for f in frames if f['hover']['eligible'] and f['hover']['rest_pointer']==[104,100]),None)
        frames=[] if start is None else [f for f in frames if start<=f['ms']<=start+5200]
        if frames:
            curve.append((name+' actual', [((f['ms']-start)/1000,f['hover']['current_offset'][0]) for f in frames],color,False))
            curve.append((name+' target', [((f['ms']-start)/1000,f['hover']['target_offset'][0]) for f in frames],color,True))
    if curve:
        (OUT/'native-response.svg').write_text(plot(curve,'Native sampled x offset / target (capture excluded)',5.2,-3.2,3.2),encoding='utf-8')
    rows=[]
    for r in analysis:
        d=r['active_render_interval_ms']
        rows.append(f'<tr><td>{html.escape(r["run"])}</td><td>{r["overall"]}</td><td>{r["max_offset"]:.3f}px</td><td>{d.get("p50",0):.2f}/{d.get("p95",0):.2f}ms</td><td>{html.escape(str(r["retained_leave_exact_zero_ms"]))}ms</td></tr>')
    chart=f'<img class="chart" src="{uri(OUT/"native-response.svg","image/svg+xml")}">' if curve else ''
    content='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Polish D B Nested 对照</title><style>body{font:15px system-ui;color:#232427;background:#e8e8e8;margin:24px;max-width:1000px}h1{font-size:23px}h3{font-size:15px;margin:10px 0}.pair{display:flex;gap:24px;flex-wrap:wrap;margin:16px 0}article img{display:block}table{border-collapse:collapse}td,th{padding:8px;text-align:left;border-bottom:1px solid #b8bac0}.chart{max-width:100%;height:auto}code{font-size:13px}</style><h1>Polish D · 旧 B / Nested 参考 B</h1><p>相同真实指针流程，直接260px原生裁图。十字表示rest pointer，标签为抓取时刻。独立录制，鼠标轨迹时序可能有系统调度误差。</p><p>新版：target=d×0.06×(1-r/200)，bounce0.1 / duration800ms解析弹簧，单Full视觉对象，上限3px。A仍为默认，按M切换；此页不构成主观丝滑验收。</p>'+''.join(cards)+'<h2>独立测量（未录屏）</h2><table><tr><th>运行</th><th>结果</th><th>最大位移</th><th>回调p50/p95</th><th>leave精确回零</th></tr>'+''.join(rows)+'</table>'+chart+'<p>初次Light收缩检查失败记录保留：收缩中出现666ms render回调空档，B此时已归零。受控复验另列，未据此改Repair B。</p><p>CPU render入口间隔不是GPU/DWM呈现。GPUI Windows描边alpha/AA缺陷仍未修。macOS、mixed DPI、真实OLE drop未验证。</p><p><code>cargo run --release -- --magnetic b</code>体验新版B；<code>M</code>切A/B，<code>T</code>切主题，<code>R</code>切Reduced Motion。</p></html>'
    (OUT/'comparison.html').write_text(content,encoding='utf-8')
    manifest={}
    with zipfile.ZipFile(OUT/'nested-source.zip','w',zipfile.ZIP_DEFLATED) as z:
        files=[p for folder in ('src','assets','scripts') for p in (ROOT/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts]
        files += [ROOT/n for n in ('Cargo.toml','Cargo.lock','README.md')]
        for p in files:
            rel=p.relative_to(ROOT).as_posix();z.write(p,rel);manifest[rel]=hashlib.sha256(p.read_bytes()).hexdigest()
    manifest['target/release/ameow-next.exe']=hashlib.sha256((ROOT/'target/release/ameow-next.exe').read_bytes()).hexdigest()
    (OUT/'source-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    with zipfile.ZipFile(OUT/'nested-evidence.zip','w',zipfile.ZIP_DEFLATED) as z:
        for p in OUT.rglob('*'):
            if p.is_file() and p.suffix not in ('.zip','.html','.gif'):
                z.write(p,p.relative_to(OUT))
    print(json.dumps({'comparison_bytes':(OUT/'comparison.html').stat().st_size,'source_bytes':(OUT/'nested-source.zip').stat().st_size,'evidence_bytes':(OUT/'nested-evidence.zip').stat().st_size,'exe_sha256':manifest['target/release/ameow-next.exe']}))

if __name__=='__main__':package()
