"""Compact native review page, standalone vector plots and evidence manifest."""
import base64
import hashlib
import html
import json
import math
from pathlib import Path
import shutil
import zipfile
from repair_a_runtime import read_jsonl
from repair_b_analyze import analyze as repair_analyze

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence/polish-d'


def data(path,mime):
    return 'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode()


def plot(series,title,xmax,ymin,ymax,width=920,height=230):
    left=55;right=20;top=30;bottom=35
    items=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{html.escape(title)}"><rect width="100%" height="100%" fill="#fafafa"/><g font-family="system-ui" font-size="12" fill="#363b42"><text x="10" y="18">{html.escape(title)}</text>']
    for i in range(5):
        y=top+(height-top-bottom)*i/4;value=ymax-(ymax-ymin)*i/4
        items.append(f'<path d="M{left} {y:.1f}H{width-right}" stroke="#e0e1e3"/><text x="4" y="{y+4:.1f}">{value:.2f}</text>')
    for i in range(7):
        x=left+(width-left-right)*i/6
        items.append(f'<text x="{x-7:.1f}" y="{height-10}">{xmax*i/6:.1f}s</text>')
    for j,(label,points,color,dashed) in enumerate(series):
        coords=' '.join(f'{left+x/xmax*(width-left-right):.2f},{top+(ymax-y)/(ymax-ymin)*(height-top-bottom):.2f}' for x,y in points if 0<=x<=xmax)
        dash=' stroke-dasharray="3 3"' if dashed else ''
        items.append(f'<polyline points="{coords}" fill="none" stroke="{color}" stroke-width="1.4"{dash}/><text x="{420+j*120}" y="18" fill="{color}">{label}</text>')
    return ''.join(items)+'</g></svg>'


def main():
    analysis=json.loads((OUT/'analysis.json').read_text())
    task=Path('D:/Ameow/.trellis/tasks/10-08-tra18-r1-polish-d-magnetic-spring-ab')
    review=OUT/'review';review.mkdir(exist_ok=True)
    for name in ['check-review.md','preservation-review.json','retention-original-review.json','a-differential.rs','baseline_edge_hover.rs']:
        shutil.copyfile(task/'research'/name,review/name)
    repairs=[repair_analyze(OUT/('repair-night' if night else 'repair-light')) for night in (False,True)]
    core=json.loads((OUT/'core-b/windows-validation.json').read_text())
    retention=json.loads((OUT/'retention-recheck/summary.json').read_text())
    documents=[];metrics=[];visual=[]
    for theme in ['light','night']:
        af=read_jsonl(OUT/f'matched/current-a-{theme}/frames.jsonl');bf=read_jsonl(OUT/f'matched/current-b-{theme}/frames.jsonl')
        pair=[]
        for variant,frames in [('A',af),('B',bf)]:
            start=next(f['ms'] for f in frames if f['hover']['rest_pointer']==[104,100] and f['hover']['eligible'])
            points=[((f['ms']-start)/1000,f['hover']['current_offset'][0]) for f in frames if f['hover'].get('variant')==variant.lower()]
            targets=[((f['ms']-start)/1000,f['hover']['target_offset'][0]) for f in frames if f['hover'].get('variant')==variant.lower()]
            pair.append((variant+' current X',points,'#006db7' if variant=='A' else '#c45916',False))
            pair.append((variant+' target X',targets,'#7d9db2' if variant=='A' else '#cfa88f',True))
        svg=plot(pair,f'{theme.title()} / centre-neighbour response: offset in logical px',1.5,-.13,.13)
        (OUT/f'centre-{theme}.svg').write_text(svg,encoding='utf-8');documents.append(svg)
        reversal=[]
        for variant,frames in [('A',af),('B',bf)]:
            start=next(f['ms'] for f in frames if f['hover']['rest_pointer']==[20,100] and f['hover']['eligible'])
            points=[((f['ms']-start)/1000,f['hover']['current_offset'][0]) for f in frames if f['hover'].get('variant')==variant.lower()]
            targets=[((f['ms']-start)/1000,f['hover']['target_offset'][0]) for f in frames if f['hover'].get('variant')==variant.lower()]
            reversal.append((variant+' current X',points,'#006db7' if variant=='A' else '#c45916',False))
            reversal.append((variant+' target X',targets,'#7d9db2' if variant=='A' else '#cfa88f',True))
        svg=plot(reversal,f'{theme.title()} / rapid reversals: offset in logical px',1.5,-3,3)
        (OUT/f'reversal-{theme}.svg').write_text(svg,encoding='utf-8');documents.append(svg)
        for variant in ['a','b']:
            name=f'current-{variant}-{theme}';a=next(r for r in analysis if r['run']==name)
            n=next(c['observed'] for c in a['checks'] if c['name']=='centre neighbours respond in B / quiet in A')
            cap=next(c['observed'] for c in a['checks'] if c['name']=='visual vector cap3')
            p=a['active_render_interval_ms']
            metrics.append(f'<tr><td>{theme.title()} {variant.upper()}</td><td>{n["target_magnitude"]["max"]:.4f}px</td><td>{cap:.4f}px</td><td>{p["p50"]:.2f} / {p["p95"]:.2f} / {p["max"]:.2f}ms</td><td>{a["retained_leave_exact_zero_ms"]}ms</td></tr>')
            run=json.loads((OUT/f'visual/{name}/run.json').read_text())
            edge=max(v['max_background_delta'] for v in run['capture']['raw_edges'])
            gif=OUT/f'visual/{name}/motion.gif'
            visual.append({'name':name,'native_edge_background_delta':edge,'captured_frames':run['capture']['frames'],'gif_sha256':hashlib.sha256(gif.read_bytes()).hexdigest()})
    cards=[]
    for theme in ['light','night']:
        cards.append('<section><h2>'+theme.title()+' 原生同路径</h2><div class="pair">')
        for variant in ['a','b']:
            name=f'current-{variant}-{theme}'
            cards.append(f'<figure><figcaption>{variant.upper()} / {"现行默认" if variant=="a" else "Spring 候选"}</figcaption><img width="260" height="288" src="{data(OUT/f"visual/{name}/motion.gif","image/gif")}" alt="{name}"/></figure>')
        cards.append('</div></section>')
    text='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TRA-18 Polish D 原生 A/B</title><style>body{max-width:980px;margin:24px auto;padding:0 16px;font:15px/1.65 system-ui;background:#f6f6f7;color:#232427}h1{font-size:24px}h2{font-size:18px;margin:16px 0 6px}.pair{display:flex;gap:24px;flex-wrap:wrap}figure{margin:0}figcaption{font-weight:600}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:8px;border:1px solid #d6d8dc;text-align:left}details{margin:20px 0}svg{display:block;width:100%;height:auto}code{background:#e7e7eb;padding:2px 4px}p{max-width:920px}button{padding:6px 12px;cursor:pointer}</style><h1>Polish D｜Full Magnetic Spring A/B</h1><p>A 继续作为默认；B 供本机对比，待用户体验选择。真实 Windows release / 96 DPI；每组均使用同一条中心、四边、四角、gutter、反转、追踪及 leave/return 路径。下方是直接260px原生裁切，附时序标签及 rest-pointer 十字标注。</p><p>先运行 <code>cargo run --release -- --magnetic a</code>，按 <b>M</b> 切到 B，再按 M 返回 A。切换会清除双方残留；没有持久偏好写入。T 切明暗，R 切 Reduced Motion。</p><button id="restart">重播四段原生 GIF</button>'''+''.join(cards)+'''<p>同路径依次录制；不是同步 GPU 帧。标签为各次运行实际时间。录制和以下帧间隔测量分开；GIF 采样会受远程/截图开销影响，请以原生运行作为手感依据。</p><h2>未录制时的原生测量</h2><table><tr><th>候选/主题</th><th>中心4px目标</th><th>观测最大位移</th><th>活动render P50 / P95 / max</th><th>Active leave 完全回零</th></tr>'''+''.join(metrics)+'''</table><p>B：target = 3 × tanh(r/105) × d/r；mass1 / stiffness320 / damping30，子步≤4ms、帧积分≤50ms。活动时先取最新目标再积分；睡眠后的首个目标积分0ms，避免消费历史空闲时间。保留单一视觉对象、3px向量上限及80ms leave grace。</p><details open><summary>实测目标与位移曲线（独立 SVG 也已保存）</summary>'''+''.join(documents)+'''</details><p>边框已知 GPUI Windows alpha/AA 缺陷仍保留，亚像素运动时的边缘闪烁不能视作目标曲线或frame pacing问题已解决。正常阴影参数固定；原生228/80px窗口、anchor与hitbox保持。macOS、mixed DPI、多屏及真实OLE文件drop未验证；drop锁有确定性测试。数学和回调测量不代替“丝滑”人工验收。</p><script>document.getElementById('restart').onclick=()=>document.querySelectorAll('img').forEach(i=>{const s=i.src;i.src='';requestAnimationFrame(()=>i.src=s)})</script></html>'''
    (OUT/'comparison.html').write_text(text,encoding='utf-8')
    baseline=json.loads((OUT/'visual/baseline-a-night/run.json').read_text())
    baseline_edge=max(v['max_background_delta'] for v in baseline['capture']['raw_edges'])
    # Original repair analyzer infers gutter from integer HWND width. Native-origin
    # rounding contributes <=.5px; width rounding contributes .5*4/148px more.
    inferred_anchor_bound=.5+.5*4/148+1e-9
    checks={'visual':visual,'inherited_baseline_night_outer_edge_delta':baseline_edge,'strict_native_outer_edge_le1_pass':all(v['native_edge_background_delta']<=1 for v in visual),'no_added_night_outer_edge_peak':all(v['native_edge_background_delta']<=baseline_edge for v in visual if v['name'].endswith('night')),'measurement_pass':all(a['overall']=='PASS' for a in analysis),'repair_both_themes_pass':all(r['run']['behavior_pass'] and r['after_init_viewport_mismatch']==0 and r['after_init_anchor_error']['max']<=inferred_anchor_bound for r in repairs),'inferred_anchor_rounding_bound_px':inferred_anchor_bound,'retention_rechecks_pass':all(r['pass'] for r in retention),'original_core':{'overall':core['overall'],'pass':sum(c['status']=='PASS' for c in core['checks']),'total':len(core['checks']),'retention_failed_observation':'Observed pointer reentered before expiry; Failure retired after4999ms while pointer=true, correctly preserving Full. Raw first run is retained; controlled outside rechecks all PASS.'},'release_sha256':hashlib.sha256((ROOT/'target/release/ameow-next.exe').read_bytes()).hexdigest(),'baseline_exe_sha256':hashlib.sha256((ROOT/'target/polish-d-baseline/ameow-next.exe').read_bytes()).hexdigest(),'outer_edge_limit':'Night shadow has an inherited faint fringe reaching the native edge; compare max RGB delta on identical trace baseline rather than claim clean1/255 margin. No visible new shadow truncation in tight native review.'}
    (OUT/'delivery-summary.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
    files=[p for p in OUT.rglob('*') if p.is_file() and p.suffix!='.zip' and p.name!='delivery-manifest.json']
    manifest={str(p.relative_to(OUT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    (OUT/'delivery-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    with zipfile.ZipFile(OUT/'polish-d-evidence.zip','w',zipfile.ZIP_DEFLATED) as z:
        for p in files+[OUT/'delivery-manifest.json']:z.write(p,p.relative_to(OUT))
    with zipfile.ZipFile(OUT/'polish-d-source.zip','w',zipfile.ZIP_DEFLATED) as z:
        for folder in ['src','assets','scripts']:
            for p in (ROOT/folder).rglob('*'):
                if p.is_file() and '__pycache__' not in p.parts:z.write(p,p.relative_to(ROOT))
        for name in ['Cargo.toml','Cargo.lock','README.md']:z.write(ROOT/name,name)
    print(json.dumps(checks),flush=True)


if __name__=='__main__':main()
