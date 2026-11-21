"""Bounded Windows Gallery Popup checks. URL dispatch is captured in a debug build.

Uses owned HWND messages, never physical input or the user's browser. Port 4322
must be free; the runner refuses to stop an existing service.
"""
import argparse
import ctypes as c
from ctypes import wintypes as w
from contextlib import contextmanager
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import threading
import time
from urllib.request import urlopen

from PIL import ImageGrab
import psutil
from gallery import OwnedJob, catalog
from native_capture import owned_windows, wait_for, u

ROOT = Path(__file__).resolve().parents[1]
URL = 'http://127.0.0.1:4322/'


def read(path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def source():
    try:
        with urlopen(URL+'api/source', timeout=.5) as response:
            return json.load(response)
    except (OSError, ValueError):
        return None


def port_free():
    with socket.socket() as connection:
        connection.settimeout(.2)
        return connection.connect_ex(('127.0.0.1', 4322)) != 0


def run(exe, out):
    if not port_free():
        raise RuntimeError('需要空闲的4322端口；本检查不会停止既有服务。')
    out.mkdir(parents=True, exist_ok=False)
    groups = list(dict.fromkeys(scene['surface'] for scene in catalog(exe)))
    report = dict(exe=str(exe), exe_sha256=hashlib.sha256(exe.read_bytes()).hexdigest(),
                  checks=[], complete=False,
                  scope='Owned-HWND messages and debug URL-dispatch receipt; no physical input, default browser or macOS coverage')

    def check(name):
        report['checks'].append(dict(name=name, passed=True))
        print('PASS: '+name, flush=True)

    @contextmanager
    def gallery(name):
        directory = out/name
        directory.mkdir()
        dispatched = directory/'opened.json'
        environment = {**os.environ, 'AMEOW_GALLERY_URL_CAPTURE': str(dispatched)}
        with (directory/'stderr.log').open('w', encoding='utf-8') as log:
            process = subprocess.Popen([str(exe), '--gallery', '--gallery-output', str(directory/'captures')],
                                       env=environment, creationflags=subprocess.CREATE_NO_WINDOW, stdout=log, stderr=log)
            job = OwnedJob(process)
            try:
                hwnd = wait_for(lambda: owned_windows(process.pid).get('Ameow Gallery'))
                scale = u.GetDpiForWindow(hwnd)/96

                class View:
                    def click(self, x, y):
                        position = (round(y*scale)<<16)|round(x*scale)
                        for message, buttons in [(0x200, 0), (0x201, 1), (0x202, 0)]:
                            assert u.PostMessageW(hwnd, message, buttons, position)
                        time.sleep(.15)

                    def select_popup(self):
                        self.click(70, 64+12+len(groups)*38+16)
                        # Let the previous native preview settle and the new pane present.
                        time.sleep(.5)

                    def controller(self):
                        for child in psutil.Process(process.pid).children():
                            args = child.cmdline()
                            if '--receipt' in args and any('launch.mjs' in arg for arg in args):
                                path = Path(args[args.index('--receipt')+1])
                                value = read(path)
                                if value:
                                    return child, value

                    def ready(self, owned):
                        found = self.controller()
                        return found if found and found[1].get('state') == 'ready' and found[1]['owned'] == owned and read(dispatched) else None

                    def snap(self, label):
                        # Present only this owned, opaque window. Crop away the unused lower pane.
                        u.SetWindowPos(hwnd, w.HWND(-1), 0, 0, 0, 0, 0x13)
                        time.sleep(.2)
                        rect = w.RECT()
                        assert u.GetClientRect(hwnd, c.byref(rect))
                        origin = w.POINT(0, 0)
                        assert u.ClientToScreen(hwnd, c.byref(origin))
                        image = ImageGrab.grab(bbox=(origin.x, origin.y, origin.x+rect.right, origin.y+round(476*scale)), all_screens=True)
                        image.save(directory/(label+'.png'))
                        u.SetWindowPos(hwnd, w.HWND(-2), 0, 0, 0, 0, 0x13)

                    def close(self):
                        children = psutil.Process(process.pid).children(recursive=True)
                        u.PostMessageW(hwnd, 0x10, 0, 0)
                        process.wait(timeout=10)
                        assert process.returncode == 0
                        for child in children:
                            try:
                                child.wait(timeout=5)
                            except psutil.NoSuchProcess:
                                pass

                yield View(), dispatched
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)
                job.close()

    try:
        with gallery('owned') as (view, opened):
            view.select_popup()
            view.snap('idle')
            view.click(205, 196)
            controller, receipt = wait_for(lambda: view.ready(True))
            assert receipt['url'] == URL and source()
            assert read(opened)['url'] == URL
            view.snap('running')
            first = read(opened)
            view.click(205, 196)
            wait_for(lambda: read(opened) != first)
            assert view.controller()[0].pid == controller.pid
            check('open starts the real preview; open again reuses the same owned controller')
            view.click(283, 196)
            wait_for(port_free)
            controller.wait(timeout=5)
            view.snap('stopped')
            view.click(205, 196)
            restarted, _ = wait_for(lambda: view.ready(True))
            assert restarted.pid != controller.pid
            view.close()
            wait_for(port_free)
            check('stop releases the port; retry restarts; closing Gallery settles its service')

        node = shutil.which('node')
        assert node
        with (out/'manual-server.log').open('w', encoding='utf-8') as log:
            manual = subprocess.Popen([node, str(ROOT/'browser-extension/preview/server.mjs')], cwd=out,
                                      creationflags=subprocess.CREATE_NO_WINDOW, stdout=log, stderr=log)
            try:
                wait_for(source)
                with gallery('reused-dark') as (view, opened):
                    view.click(524, 164)
                    view.select_popup()
                    view.click(205, 196)
                    controller, _ = wait_for(lambda: view.ready(False))
                    view.snap('running')
                    view.close()
                    assert manual.poll() is None and source()
                    check('matching manual service is reused and survives Gallery close')
            finally:
                manual.terminate()
                manual.wait(timeout=5)
        wait_for(port_free)

        class Foreign(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{}')

            def log_message(self, *args):
                pass

        foreign = HTTPServer(('127.0.0.1', 4322), Foreign)
        worker = threading.Thread(target=foreign.serve_forever, daemon=True)
        worker.start()
        try:
            with gallery('foreign') as (view, opened):
                view.select_popup()
                view.click(205, 196)
                # Node checks assert the error receipt; here check no URL dispatch and native recovery.
                time.sleep(1)
                assert not opened.exists()
                assert not port_free()
                view.snap('blocked')
                foreign.shutdown()
                foreign.server_close()
                worker.join(timeout=2)
                view.click(205, 196)
                wait_for(lambda: view.ready(True))
                view.close()
                wait_for(port_free)
                check('foreign port is preserved without URL dispatch; retry recovers after release')
        finally:
            foreign.shutdown()
            foreign.server_close()
        report['complete'] = True
    except BaseException as error:
        report['error'] = str(error)
        raise
    finally:
        (out/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.exe.resolve(), args.output.resolve())
