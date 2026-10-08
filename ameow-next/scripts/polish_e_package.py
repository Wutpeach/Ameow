"""Single6px candidate native review artifacts; no new3px experiment."""
import base64
import hashlib
import html
import json
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence/polish-e'

def uri(path,mime):return 'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode()

def package():
    results=json.loads((OUT/'analysis.json').read_text())
    gate=json.loads((OUT/'space-review.json').read_text()) if (OUT/'space-review.json').exists() else {'decision':'PENDING'}
    cards=[];rows=[]
    for theme in ('light','night'):
        p=OUT/'space'/theme
        r=json.loads((p/'space.json').read_text())
        cards.append('<section><h2>'+theme+'</h2><img class="sheet" src="'+uri(p/'space-sheet.png','image/png')+'"><h3>连续展开／承接／反向</h3><img width="260" height="284" src="'+uri(p/'handoff.gif','image/gif')+'"></section>')
        for x in r['observations']:
            if x['label'].startswith('peak-'):
                e=x['outer_edge_delta'];rows.append(f'<tr><td>{theme}</td><td>{html.escape(x["label"])}</td><td>{e["top"]}/{e["right"]}/{e["bottom"]}/{e["left"]}</td></tr>')
    pairs=[]
    for r in results:
        pairs.append(f'<p>{r["theme"]}：最高位移{r["max_visible_vector"]:.4f}px，行为测量{r["behavior_checks"]}，{r["frames"]}帧。数学／生命周期结果与空间安全结论分别列出。</p>')
    summary=json.loads((OUT/'native-summary.json').read_text())
    timing_rows=[]
    for theme in summary:
        for s in theme['phase_samples']:
            h=s['hover']
            timing_rows.append(f'<tr><td>{theme["theme"]}</td><td>{s["phase_label"]}</td><td>{s["relative_to_intent_ms"]}</td><td>{h["fade_weight"]:.4f}</td><td>{html.escape(str(h["axis_generation"]))}</td><td>{html.escape(str(h["axis_started_ms"]))}</td></tr>')
    timing='<h2>连续承接实测（相对 Full intent）</h2><table><tr><th>主题</th><th>时刻</th><th>ms</th><th>weight</th><th>axis identity</th><th>segment start ms</th></tr>'+''.join(timing_rows)+'</table>'
    edge='<h2>下缘截尾：静止／6px 原生局部对比</h2><img class=sheet src="'+uri(OUT/'edge-review.png','image/png')+'"><p>Nearest 2×／4× 放大。Night 窗外背景232，最后 native 行225（差7/255），阴影直到 HWND 边界仍未衰减。Surface／border 位于边缘内侧约8px，截尾与既有 border AA 缺陷分别处理。</p>'
    content='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Polish E 6px Native</title><style>body{font:15px system-ui;color:#232427;background:#e8e8e8;margin:24px;max-width:1060px}h1{font-size:23px}h2{font-size:20px}h3{font-size:16px}.sheet{width:1040px;max-width:100%;height:auto}table{border-collapse:collapse}th,td{padding:7px;text-align:left;border-bottom:1px solid #b8bac0}code{font-size:13px}</style><h1>Polish E · 单一6px候选</h1><p>Full后段平滑渐入，同一Spring承接到settledFull；A仍为正式默认。</p><p>空间结论：'+html.escape(gate['decision'])+'。'+html.escape(gate.get('reason','尚未完成视觉判断'))+'</p>'+''.join(pairs)+''.join(cards)+'<h2>Native最外缘像素与背景差（/255）</h2><table><tr><th>主题</th><th>最大方向</th><th>上／右／下／左</th></tr>'+''.join(rows)+'</table><p>直接260px原生裁图、owned backdrop；日志包含时间／Fullness／phase／fade权重与导数／Spring位置速度／visual offset／native bounds。录制回调不是GPU/DWM呈现，远程工具可能影响观感。描边AA缺陷保持未修。</p><p>旧Polish D3px已有证据只作历史参考，本轮没有重做3px实验。<code>cargo run --release -- --magnetic b</code>为本轮6px候选，M切回默认A，T切主题。</p></html>'
    content=content.replace('A仍为正式默认','A仍为当前默认')
    content=content.replace('<h2>Native最外缘像素',timing+edge+'<h2>Native最外缘像素')
    content=content.replace('</html>','<p>已触发 Instruction 空间冲突停止条件：未继续本轮 menu／drag／lock／Reduced Motion／terminal 的原生综合回归；相关确定性测试通过不能替代这些原生验证。候选待人工验收，不能宣称空间安全或主观丝滑已通过。</p></html>')
    (OUT/'review.html').write_text(content,encoding='utf-8')
    manifest={}
    with zipfile.ZipFile(OUT/'polish-e-source.zip','w',zipfile.ZIP_DEFLATED) as z:
        files=[p for folder in ('src','scripts','assets') for p in (ROOT/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts]
        files += [ROOT/n for n in ('Cargo.toml','Cargo.lock','README.md')]
        for p in files:
            rel=p.relative_to(ROOT).as_posix();z.write(p,rel);manifest[rel]=hashlib.sha256(p.read_bytes()).hexdigest()
    manifest['target/release/ameow-next.exe']=hashlib.sha256((ROOT/'target/release/ameow-next.exe').read_bytes()).hexdigest()
    (OUT/'source-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    with zipfile.ZipFile(OUT/'polish-e-evidence.zip','w',zipfile.ZIP_DEFLATED) as z:
        for p in OUT.rglob('*'):
            if p.is_file() and p.suffix not in ('.zip','.html'):
                z.write(p,p.relative_to(OUT))
    print(json.dumps({'html':(OUT/'review.html').stat().st_size,'source':(OUT/'polish-e-source.zip').stat().st_size,'evidence':(OUT/'polish-e-evidence.zip').stat().st_size,'exe_sha256':manifest['target/release/ameow-next.exe']}))

if __name__=='__main__':package()
