"""Ameow Gallery CLI: real EXE catalog, isolated previews and native captures.

Without scene/batch flags, opens the native GPUI Gallery. Previews never create
production services, user settings, startup registration or the system tray.
"""
import argparse
import ctypes as c
from ctypes import wintypes as w
import hashlib
import html
import json
from pathlib import Path
import subprocess
import tempfile
import time

from PIL import Image, ImageDraw
from preview_capture import capture

ROOT = Path(__file__).resolve().parents[1]
FLAGS = subprocess.CREATE_NO_WINDOW


class OwnedJob:
    """The owned preview exits even if its Python controller is terminated."""
    def __init__(self, process):
        class Limits(c.Structure):
            _fields_ = [('process_time', c.c_int64), ('job_time', c.c_int64),
                        ('flags', w.DWORD), ('min_working_set', c.c_size_t),
                        ('max_working_set', c.c_size_t), ('active', w.DWORD),
                        ('affinity', c.c_size_t), ('priority', w.DWORD), ('scheduling', w.DWORD)]
        class ExtendedLimits(c.Structure):
            _fields_ = [('basic', Limits), ('io', c.c_uint64*6),
                        ('process_memory', c.c_size_t), ('job_memory', c.c_size_t),
                        ('peak_process', c.c_size_t), ('peak_job', c.c_size_t)]
        self.kernel = c.WinDLL('kernel32', use_last_error=True)
        self.kernel.CreateJobObjectW.argtypes = [c.c_void_p, w.LPCWSTR]
        self.kernel.CreateJobObjectW.restype = w.HANDLE
        self.kernel.SetInformationJobObject.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD]
        self.kernel.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
        self.kernel.CloseHandle.argtypes = [w.HANDLE]
        self.handle = self.kernel.CreateJobObjectW(None, None)
        limits = ExtendedLimits()
        limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        try:
            if not self.handle or not self.kernel.SetInformationJobObject(self.handle, 9, c.byref(limits), c.sizeof(limits)):
                raise c.WinError(c.get_last_error())
            if not self.kernel.AssignProcessToJobObject(self.handle, int(process._handle)):
                raise c.WinError(c.get_last_error())
        except BaseException:
            self.close()
            raise

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None


class Cancelled(RuntimeError):
    pass


def check_cancel(cancel):
    if cancel and cancel.exists():
        raise Cancelled('本轮截图已取消，已保留完成的证据')


def catalog(exe):
    with tempfile.TemporaryDirectory(prefix='ameow-gallery-catalog-') as temporary:
        path = Path(temporary)/'catalog.json'
        subprocess.run([str(exe), '--preview', '--preview-catalog-out', str(path)],
                       creationflags=FLAGS, check=True, timeout=10)
        scenes = json.loads(path.read_text(encoding='utf-8'))
    if not scenes or len({s['name'] for s in scenes}) != len(scenes):
        raise RuntimeError('EXE 返回了空目录或重复的场景')
    return scenes


class Session:
    """Own exactly one child, a unique control directory and monotonic steps."""
    def __init__(self, exe, scenes=None, reduced=True, cancel=None):
        self.exe = Path(exe).resolve()
        self.scenes = catalog(self.exe) if scenes is None else scenes
        self.temporary = tempfile.TemporaryDirectory(prefix='ameow-gallery-')
        self.control = Path(self.temporary.name)/'control.json'
        self.receipt = self.control.with_suffix('.ack.json')
        self.log = (Path(self.temporary.name)/'stderr.log').open('w', encoding='utf-8')
        self.step = 0
        self.current = None
        self.night = False
        self.cancel = cancel
        self.job = None
        command = [str(self.exe), '--preview', '--preview-scene', self.scenes[0]['name'],
                   '--preview-control', str(self.control)]
        if reduced:
            command.append('--reduced')
        try:
            self.process = subprocess.Popen(command, cwd=ROOT, creationflags=FLAGS, stdout=self.log, stderr=self.log)
            try:
                self.job = OwnedJob(self.process)
            except BaseException:
                self.process.kill(); self.process.wait(timeout=5)
                raise
        except BaseException:
            self.log.close(); self.temporary.cleanup()
            raise

    def request(self, value):
        self.step += 1
        pending = self.control.with_suffix('.tmp')
        pending.write_text(json.dumps(dict(step=self.step, **value)), encoding='utf-8')
        deadline = time.monotonic()+1
        while True:
            try:
                pending.replace(self.control)
                break
            except PermissionError:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(.01)

    def read_ack(self):
        try:
            ack = json.loads(self.receipt.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            return None
        if ack.get('pid') != self.process.pid or ack.get('step') != self.step:
            return None
        return ack

    def select(self, scene, night=False, settle=.35, timeout=20):
        if not any(s['name'] == scene for s in self.scenes):
            raise ValueError(f'未知场景：{scene}')
        self.request(dict(scene=scene, night=night))
        deadline = time.monotonic()+timeout
        while time.monotonic() < deadline:
            check_cancel(self.cancel)
            if self.process.poll() is not None:
                raise RuntimeError(f'本轮预览已退出：{self.process.returncode}')
            ack = self.read_ack()
            if ack is not None:
                if ack.get('error'):
                    raise RuntimeError(f'场景切换失败：{ack["error"]}')
                if ack.get('scene') != scene or ack.get('night') != night:
                    raise RuntimeError('场景/主题回执与请求不匹配')
                self.current, self.night = scene, night
                # ACK accepts state. This delay is not a GPU render-complete barrier.
                until = time.monotonic()+settle
                while time.monotonic() < until:
                    check_cancel(self.cancel)
                    time.sleep(min(.025, max(0, until-time.monotonic())))
                return ack
            time.sleep(.025)
        raise TimeoutError(f'场景切换超时：{scene}')

    def capture(self, output):
        if self.current is None:
            raise RuntimeError('请先选择场景')
        capture(self.process.pid, self.current, self.exe, Path(output), self.receipt, present=True)

    def close(self):
        if self.log.closed:
            return
        try:
            if self.process.poll() is None:
                self.request(dict(quit=True))
                try:
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.process.kill(); self.process.wait(timeout=5)
        finally:
            # A failed atomic quit request must still settle this owned child.
            try:
                if self.process.poll() is None:
                    self.process.kill(); self.process.wait(timeout=5)
            finally:
                if self.job:
                    self.job.close()
                self.log.close(); self.temporary.cleanup()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def overview(output, entries):
    """Keep full-size images in the responsive index; sheets are navigators."""
    groups = {}
    for entry in entries:
        groups.setdefault((entry['surface'], entry['theme']), []).append(entry)
    sections = []
    for (surface, theme), values in groups.items():
        thumbs = []
        for entry in values:
            with Image.open(output/entry['image']) as image:
                thumb = image.convert('RGB'); thumb.thumbnail((360, 280))
            thumbs.append((entry, thumb))
        for start in range(0, len(thumbs), 8):
            page = thumbs[start:start+8]
            width = max(t.width for _, t in page)+16
            height = max(t.height for _, t in page)+40
            columns = min(2, len(page))
            sheet = Image.new('RGB', (width*columns, height*((len(page)+columns-1)//columns)), '#eeeeee')
            draw = ImageDraw.Draw(sheet)
            for i, (entry, thumb) in enumerate(page):
                x, y = i % columns*width, i//columns*height
                draw.text((x+8,y+6), entry['scene'], fill='#222222')
                sheet.paste(thumb,(x+(width-thumb.width)//2,y+30))
            sheet.save(output/f'{surface}-{theme}-sheet-{start//8+1}.png')
        cards = ''.join(f'<figure><a href="{html.escape(v["image"],quote=True)}"><img loading="lazy" src="{html.escape(v["image"],quote=True)}" alt="{html.escape(v["scene"],quote=True)}"></a><figcaption>{html.escape(v["scene"])}</figcaption></figure>' for v in values)
        sections.append(f'<section><h2>{html.escape(surface)} · {theme}</h2><div class="images">{cards}</div></section>')
    document = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ameow Gallery</title><style>:root{color-scheme:light dark}body{font:14px system-ui;margin:24px;line-height:1.5}h1{font-size:24px}h2{margin-top:32px}.images{display:flex;flex-wrap:wrap;gap:24px}figure{margin:0;max-width:100%}img{display:block;max-width:100%;height:auto}figcaption{padding-top:6px}</style><h1>Ameow Gallery</h1><p>真实隔离预览截图。点击图片查看原尺寸；每张图的 JSON 保留 PID、DPI、EXE 指纹与状态回执。截图不证明真实下载、持久化或系统托盘。</p>' + ''.join(sections) + '</html>'
    (output/'index.html').write_text(document, encoding='utf-8')


def batch(exe, scenes, output, themes, settle, cancel=None):
    output.mkdir(parents=True, exist_ok=False)
    print(f'批量截图将依次显示 {len(scenes)*len(themes)} 个真实窗口；请在桌面空闲时使用。Ctrl+C 只结束本轮预览。', flush=True)
    entries = []
    manifest = dict(exe=str(exe), exe_sha256=hashlib.sha256(exe.read_bytes()).hexdigest(),
                    settle_seconds=settle, motion='reduced', catalog=scenes, captures=entries,
                    expected_count=len(scenes)*len(themes), status='running', complete=False)
    def save_manifest():
        pending = output/'manifest.tmp'
        pending.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        pending.replace(output/'manifest.json')
    save_manifest()
    try:
        check_cancel(cancel)
        with Session(exe, scenes, cancel=cancel) as session:
            manifest['preview_pid'] = session.process.pid
            save_manifest()
            for theme in themes:
                for scene in scenes:
                    check_cancel(cancel)
                    name = scene['name']
                    session.select(name, night=theme == 'dark', settle=settle)
                    image = f'{theme}-{name}.png'
                    session.capture(output/image)
                    entries.append(dict(scene=name, surface=scene['surface'], theme=theme, image=image))
                    save_manifest()
            check_cancel(cancel)
        overview(output, entries)
        check_cancel(cancel)
        manifest['complete'] = True
        manifest['status'] = 'complete'
    except BaseException as error:
        manifest['status'] = 'cancelled' if isinstance(error, (Cancelled, KeyboardInterrupt)) else 'failed'
        manifest['error'] = str(error)
        if entries:
            overview(output, entries)
        raise
    finally:
        save_manifest()
    print(str((output/'index.html').resolve()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', type=Path, default=ROOT/'target/debug/ameow.exe')
    parser.add_argument('--scene', help='打开一个真实场景；可与 --capture 合用')
    parser.add_argument('--list', action='store_true', help='列出指定 EXE 内置的真实目录')
    parser.add_argument('--all', action='store_true', help='批量截取 EXE 目录的全部场景')
    parser.add_argument('--surface', help='仅截取指定分类，与 --all 合用；如 settings、menu')
    parser.add_argument('--theme', choices=['light','dark','both'], default='light')
    parser.add_argument('--capture', type=Path, help='单场景截图 PNG 路径，禁止覆盖')
    parser.add_argument('--output', type=Path, help='批量截图新目录或 Gallery 截图根目录')
    parser.add_argument('--settle', type=float, default=.5, help='ACK 后等待秒数；固定 reduced motion，不是 GPU 栅栏')
    parser.add_argument('--cancel-file', type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    exe = args.exe.resolve()
    if not exe.is_file():
        parser.error(f'找不到 EXE：{exe}。请先 cargo build --locked --bin ameow')
    if args.settle < .1 or args.settle > 10:
        parser.error('--settle 需要在 0.1 至 10 秒之间')
    if args.capture and not args.scene:
        parser.error('--capture 需要 --scene')
    if args.all and (args.scene or not args.output):
        parser.error('--all 需要新 --output 目录，不能同时指定 --scene')
    if args.surface and not args.all:
        parser.error('--surface 需要 --all')
    if args.scene and args.theme == 'both':
        parser.error('单场景请选 light 或 dark；both 用于 --all')
    scenes = catalog(exe)
    if args.surface:
        scenes = [scene for scene in scenes if scene['surface'] == args.surface]
        if not scenes:
            parser.error(f'EXE 目录中没有分类：{args.surface}')
    if args.list:
        for scene in scenes:
            print(f'{scene["name"]:36} {scene["description"]}')
    elif args.all:
        batch(exe, scenes, args.output.resolve(), ['light','dark'] if args.theme == 'both' else [args.theme], args.settle, args.cancel_file)
    elif args.scene:
        with Session(exe, scenes, reduced=bool(args.capture)) as session:
            session.select(args.scene, night=args.theme == 'dark', settle=args.settle)
            if args.capture:
                session.capture(args.capture.resolve())
            else:
                print(f'已打开 {args.scene}，PID {session.process.pid}；关闭窗口或 Ctrl+C 结束。', flush=True)
                session.process.wait()
    else:
        command = [str(exe),'--gallery']
        if args.output:
            command.extend(['--gallery-output',str(args.output.resolve())])
        subprocess.run(command, cwd=ROOT, creationflags=FLAGS, check=True)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as error:
        raise SystemExit(f'Gallery 操作失败：{error}')
