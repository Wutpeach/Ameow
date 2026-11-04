"""Capture one owned preview HWND with the existing Windows BitBlt crop helper."""
import argparse
import ctypes as c
from ctypes import wintypes as w
import hashlib
import json
from pathlib import Path
import subprocess
import time
from repair_a_runtime import CropCapture
from windows_validate import u


def capture(pid, scene, exe, output, receipt):
    if output.suffix.lower() != '.png':
        raise ValueError('截图输出路径必须以 .png 结尾')
    ack = json.loads(receipt.read_text(encoding='utf-8'))
    if ack['pid'] != pid or ack['scene'] != scene or ack['error']:
        raise RuntimeError('预览回执与截图目标不匹配')
    surface = next(s['surface'] for s in ack['catalog'] if s['name'] == scene)
    expected = 'Ameow · Settings' if surface in ('settings', 'components', 'diagnostics') else 'Ameow · Tray' if surface == 'tray' else 'Ameow'
    candidates = []
    @c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
    def visit(hwnd, _):
        owner = w.DWORD()
        u.GetWindowThreadProcessId(hwnd, c.byref(owner))
        if owner.value == pid and u.IsWindowVisible(hwnd):
            title = c.create_unicode_buffer(256)
            u.GetWindowTextW(hwnd, title, 256)
            candidates.append((hwnd, title.value))
        return True
    u.EnumWindows(visit, 0)
    matching = [item for item in candidates if item[1] == expected or (surface in ('settings', 'components', 'diagnostics') and ('设置' in item[1] or 'Settings' in item[1]))]
    if len(matching) != 1:
        raise RuntimeError(f'无法唯一定位本轮预览窗口：{expected}，候选 {candidates}')
    hwnd, title = matching[0]
    rect = w.RECT()
    if not u.GetWindowRect(hwnd, c.byref(rect)):
        raise RuntimeError('无法读取预览窗口边界')
    bounds = [rect.left, rect.top, rect.right, rect.bottom]
    crop = CropCapture(bounds)
    try:
        image = crop.grab()
    finally:
        crop.close()
    if len(image.convert('RGB').getcolors(image.width * image.height)) < 8:
        raise RuntimeError('截图缺少有效界面内容，请检查窗口遮挡后重试')
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists() or output.with_suffix('.json').exists():
        raise FileExistsError(f'保留已有截图，请选择新路径：{output}')
    image.save(output, format='PNG')
    metadata = dict(scene=scene, pid=pid, hwnd=hwnd, title=title, bounds=bounds, dpi=u.GetDpiForWindow(hwnd),
                    exe=str(exe.resolve()), exe_sha256=hashlib.sha256(exe.read_bytes()).hexdigest(),
                    source_head=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
                    source_dirty=bool(subprocess.check_output(['git', 'status', '--porcelain'], text=True)),
                    captured_at=time.strftime('%Y-%m-%dT%H:%M:%S%z'), receipt=ack,
                    limits='真实 Windows GPUI 窗口；模拟呈现状态，不证明网络、持久化、剪贴板或系统托盘行为。BitBlt 需窗口未被遮挡。')
    output.with_suffix('.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    print(str(output.resolve()))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pid', type=int, required=True)
    parser.add_argument('--scene', required=True)
    parser.add_argument('--exe', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    a = parser.parse_args()
    capture(a.pid, a.scene, a.exe, a.output, a.receipt)
