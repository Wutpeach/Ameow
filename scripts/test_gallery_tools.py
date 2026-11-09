"""Gallery boundary checks that never open native windows or use the desktop."""
import json
import ctypes as c
from ctypes import wintypes as w
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest

from PIL import Image
from gallery import Session, overview, batch, Cancelled
from preview_capture import capture


class GalleryTools(unittest.TestCase):
    def test_quit_transport_failure_still_terminates_owned_child(self):
        session = Session.__new__(Session)
        session.temporary = tempfile.TemporaryDirectory(prefix='ameow-gallery-cleanup-test-')
        session.log = (Path(session.temporary.name)/'worker.log').open('w')
        session.process = subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)'], creationflags=subprocess.CREATE_NO_WINDOW)
        session.job = None
        def refused(_):
            raise PermissionError('fixture: control replacement refused')
        session.request = refused
        with self.assertRaises(PermissionError):
            session.close()
        self.assertIsNotNone(session.process.poll())
        self.assertTrue(session.log.closed)
        session.close()  # idempotent cleanup

    def test_foreign_and_stale_receipts_are_not_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            session = Session.__new__(Session)
            session.receipt = Path(directory)/'ack.json'
            session.process = SimpleNamespace(pid=1234)
            session.step = 8
            for pid,step in [(1235,8),(1234,7)]:
                session.receipt.write_text(json.dumps(dict(pid=pid,step=step)),encoding='utf-8')
                self.assertIsNone(session.read_ack())
            session.receipt.write_text('{',encoding='utf-8')
            self.assertIsNone(session.read_ack())

    def test_existing_evidence_is_rejected_before_desktop_access(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)/'accepted.png'
            output.write_bytes(b'accepted evidence')
            with self.assertRaises(FileExistsError):
                capture(0,'unknown',Path('absent.exe'),output,Path('absent-receipt.json'),True)
            self.assertEqual(output.read_bytes(),b'accepted evidence')

    def test_overview_links_native_image_without_replacing_it(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            path = output/'sample.png'
            Image.new('RGB',(80,80),'white').save(path)
            original = path.read_bytes()
            overview(output,[dict(surface='compact',theme='light',scene='compact.idle',image='sample.png')])
            self.assertEqual(path.read_bytes(),original)
            self.assertIn('href="sample.png"',(output/'index.html').read_text(encoding='utf-8'))
            self.assertTrue((output/'compact-light-sheet-1.png').is_file())

    def test_cancel_before_batch_opens_no_preview_and_keeps_incomplete_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cancel = root/'cancel'
            cancel.touch()
            with self.assertRaises(Cancelled):
                batch(Path(sys.executable), [dict(name='compact.idle',surface='compact')],
                      root/'batch', ['light','dark'], .1, cancel)
            manifest = json.loads((root/'batch/manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(manifest['status'], 'cancelled')
            self.assertFalse(manifest['complete'])
            self.assertEqual(manifest['captures'], [])
            self.assertEqual(manifest['expected_count'], 2)
            self.assertNotIn('preview_pid', manifest)

    def test_controller_crash_settles_its_owned_child(self):
        controller = subprocess.Popen([sys.executable, '-c',
            'from gallery import OwnedJob; import subprocess, sys, time; '
            'child=subprocess.Popen([sys.executable,"-c","import time; time.sleep(30)"], creationflags=subprocess.CREATE_NO_WINDOW); '
            'job=OwnedJob(child); print(child.pid, flush=True); time.sleep(30)'],
            cwd=Path(__file__).resolve().parent, stdout=subprocess.PIPE, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
        kernel = c.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
        kernel.OpenProcess.restype = w.HANDLE
        kernel.WaitForSingleObject.argtypes = [w.HANDLE, w.DWORD]
        kernel.CloseHandle.argtypes = [w.HANDLE]
        child = None
        try:
            pid = int(controller.stdout.readline().strip())
            child = kernel.OpenProcess(0x100000, False, pid)
            self.assertTrue(child)
            controller.kill(); controller.wait(timeout=5)
            self.assertEqual(kernel.WaitForSingleObject(child, 5000), 0)
        finally:
            if controller.poll() is None:
                controller.kill(); controller.wait(timeout=5)
            controller.stdout.close()
            if child:
                kernel.CloseHandle(child)

    def test_failed_worker_never_marks_batch_complete(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)/'batch'
            # Python rejects the EXE preview flags without opening a UI window.
            with self.assertRaises(RuntimeError):
                batch(Path(sys.executable), [dict(name='compact.idle',surface='compact')],output,['light'],.1)
            manifest = json.loads((output/'manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(manifest['status'],'failed')
            self.assertFalse(manifest['complete'])
            self.assertEqual(manifest['captures'],[])


if __name__ == '__main__':
    unittest.main()
