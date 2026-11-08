"""Gallery boundary checks that never open native windows or use the desktop."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest

from PIL import Image
from gallery import Session, overview
from preview_capture import capture


class GalleryTools(unittest.TestCase):
    def test_quit_transport_failure_still_terminates_owned_child(self):
        session = Session.__new__(Session)
        session.temporary = tempfile.TemporaryDirectory(prefix='ameow-gallery-cleanup-test-')
        session.log = (Path(session.temporary.name)/'worker.log').open('w')
        session.process = subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)'], creationflags=subprocess.CREATE_NO_WINDOW)
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


if __name__ == '__main__':
    unittest.main()
