"""Freeze scoped sources/evidence and produce standalone native review artifact."""
import base64,difflib,hashlib,json,zipfile,html
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
TASK=Path('D:/Ameow/.trellis/tasks/10-08-tra18-r1-polish-f-border-aa-repair')
EVID=ROOT/'evidence/polish-f'
OUT=TASK/'research/artifacts';OUT.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads((TASK/'research/baseline/manifest.json').read_text())
current={p:sha(ROOT/p) for p in manifest}
changed=[p for p in manifest if manifest[p]!=current[p]]
assert changed==['src/main.rs','README.md','target/release/ameow-next.exe'],changed
with zipfile.ZipFile(TASK/'research/baseline/polish-e-default-source.zip') as before:
    diff=''.join(difflib.unified_diff(before.read('src/main.rs').decode().splitlines(True),(ROOT/'src/main.rs').read_text().splitlines(True),fromfile='accepted-E/main.rs',tofile='Polish-F/main.rs'))
    (OUT/'product.diff').write_text(diff,encoding='utf-8')
sources=[ROOT/p for p in manifest if not p.startswith('target/')]
sources+=list((ROOT/'scripts').glob('polish_f_*.py'))
with zipfile.ZipFile(OUT/'polish-f-source.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in sources:z.write(p,p.relative_to(ROOT))
    z.write(OUT/'product.diff','product.diff')
with zipfile.ZipFile(OUT/'polish-f-native-evidence.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in EVID.rglob('*'):
        if p.is_file():z.write(p,Path('native')/p.relative_to(EVID))
    for p in (TASK/'research').glob('*.md'):z.write(p,Path('research')/p.name)
    for p in (TASK/'research').glob('check-*.json'):z.write(p,Path('research')/p.name)
    for p in (TASK/'research').glob('check-*.py'):z.write(p,Path('research')/p.name)
    for p in (TASK/'research/no-shadow').glob('*'):
        if p.is_file():z.write(p,Path('diagnostic')/p.name)
    for p in (TASK/'research/baseline').glob('*'):
        if p.is_file():z.write(p,Path('accepted-baseline')/p.name)
    z.write(ROOT/'target/release/ameow-next.exe','product/ameow-next.exe')
    for name in ('before','after'):
        z.write(ROOT/f'target/polish-f-{name}-no-shadow/ameow-next.exe',f'diagnostic/{name}/ameow-next.exe')

def img(path,alt):
    p=EVID/path;mime='image/gif' if p.suffix=='.gif' else 'image/png'
    return '<figure><figcaption>'+html.escape(alt)+'</figcaption><img src="data:'+mime+';base64,'+base64.b64encode(p.read_bytes()).decode()+'"></figure>'
parts=['<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Polish F Windows Border AA</title><style>body{font:15px system-ui;margin:24px auto;max-width:1200px;background:#f5f6f7;color:#20242a}h1{font-size:24px}p{line-height:1.6}figure{margin:18px 0;padding:12px;background:white;border-radius:8px}figcaption{margin-bottom:10px}img{max-width:100%;height:auto}code{word-break:break-all}.grid{display:flex;gap:20px;flex-wrap:wrap}.grid figure{max-width:480px}</style><h1>Round 1 Polish F｜Full / Compact Border AA Repair</h1><p>2026-10-08 Windows release实拍，96DPI；开发完成，待用户／网页端验收。原背景与Border两次AA覆盖合并为一次公共GPUIquad，保留颜色、1pxhairline、尺寸、默认6pxB和原阴影。</p><p>下列图像均为真实Windows紧裁PNG；1:1及8x最近邻放大。几何像素阶梯保留，旧异常深色颗粒已明显消退。全局alpha ADD及normal shadow overlap保持，不宣称框架全局修复。</p>']
for t in ('light','night'):
    parts.append(img(f'paired-{t}.png',f'{t}：修复前／后，1:1与8x，正常阴影保留，neutral232／white255'))
    for mode in ('compact','full'):parts.append(img(f'paired-{t}-white-{mode}-8x.png',f'{t} {mode}四方位：上排修复前，下排修复后，8x'))
parts.append('<p>独立无阴影诊断（非产品）：Light白底Compact(30,11)实测193/193/194→246/247/248，40组点位新旧模型误差均≤1/255。产品正常阴影同点187/187/188→240/241/242，残余差异不可冒充无阴影预测。</p>')
parts.append('<div class="grid">')
for t in ('light','night'):parts.append(img(f'fractional/{t}/fractional.gif',f'{t} defaultB native动态；GIF为回看用，原始losslessPNG及日志在ZIP'))
parts.append('</div>')
for t in ('light','night'):parts.append(img(f'fractional/{t}/aa-detail.png',f'{t}展开／分数像素跟随／四边／收起的8x紧裁原始PNG'))
parts.append(img('core/state-matrix.png','两主题五状态原生实拍；27核心检查PASS，10状态受控前后内部像素完全相同'))
parts.append('<p>已知限制：向下6px原shadow尾迹Light3/255、Night7/255仍保留，用户决定暂缓。附加default脚本首Light3项FAIL未定位；原始记录保留，原基线13／修复版13／Night13／A回退3复验PASS，未放宽判据。macOS／其它DPI／mixedDPI／真实OLEdropNOTVERIFIED。</p><p>产品EXE SHA256：<code>'+current['target/release/ameow-next.exe']+'</code>。分支next/tra18-window-ui-r1，HEAD470a1be3；全部未提交。未改全局GPUI，无commit/merge/archive。</p></html>')
(OUT/'polish-f-native-review.html').write_text(''.join(parts),encoding='utf-8')
result=dict(product_manifest=current,changed_baseline_entries=changed,protected_unchanged=len(manifest)-len(changed),new_f_scripts=[str(p.relative_to(ROOT)) for p in (ROOT/'scripts').glob('polish_f_*.py')],artifacts=[dict(name=p.name,size=p.stat().st_size,sha256=sha(p)) for p in OUT.iterdir() if p.is_file()])
(OUT/'final-manifest.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(dict(changed=changed,protected=result['protected_unchanged'],artifacts=result['artifacts'])))
