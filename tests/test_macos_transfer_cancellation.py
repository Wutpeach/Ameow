"""Run with the actual managed Python 3.13 on Mac; no network or App required."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
import zipfile

DRIVER = Path(__file__).resolve().parents[1] / 'src/download/adapters/yt_dlp/cancellation_macos.py'
NONCE = '17' * 32


@unittest.skipUnless(sys.platform == 'darwin' and sys.version_info >= (3, 13),
                     'requires managed Mac Python >=3.13')
class CancellationDriver(unittest.TestCase):
    def run_case(self, body, cancel=True, stale=False, timeout=17):
        with tempfile.TemporaryDirectory(prefix='ameow-transfer-driver-') as root:
            root = Path(root)
            archive = root / 'fixture.pyz'
            with zipfile.ZipFile(archive, 'w') as target:
                target.writestr('__main__.py', body)
            if stale:
                (root / 'transfer-cancel.json').write_text('{"nonce":"old"}')
            command = [sys.executable, '-I', '-B', '-c', DRIVER.read_text(), NONCE,
                       json.dumps(['/bin/sleep']), str(archive)]
            process = subprocess.Popen(command, cwd=root, stdout=subprocess.PIPE,
                                       stderr=subprocess.PIPE, start_new_session=True)
            began = time.monotonic()
            try:
                if cancel:
                    while not (root / 'ready').exists():
                        if process.poll() is not None:
                            self.fail(process.communicate()[1].decode())
                        self.assertLess(time.monotonic() - began, 5)
                        time.sleep(0.005)
                    process.send_signal(signal.SIGINT)
                stdout, stderr = process.communicate(timeout=timeout)
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.communicate(timeout=5)
            receipt = root / 'transfer-cancel.json'
            value = json.loads(receipt.read_text()) if receipt.exists() else None
            return process.returncode, value, stdout, stderr, time.monotonic() - began

    def assert_cancelled(self, body):
        code, receipt, _, _, elapsed = self.run_case(body)
        self.assertEqual(code, 130)
        self.assertEqual(set(receipt), {'schema', 'nonce', 'root_pid', 'kind',
            'work_creation_closed', 'workers_joined', 'direct_children_waited', 'reaped'})
        self.assertEqual(receipt['nonce'], NONCE)
        self.assertEqual(receipt['kind'], 'cancelled')
        self.assertTrue(receipt['work_creation_closed'])
        self.assertTrue(receipt['workers_joined'])
        self.assertTrue(receipt['direct_children_waited'])
        return receipt, elapsed

    def test_normal_success_and_nonzero_are_unchanged(self):
        for code in (0, 7):
            actual, receipt, stdout, _, _ = self.run_case(
                f'print("ordinary"); raise SystemExit({code})', cancel=False)
            self.assertEqual(actual, code)
            self.assertEqual(stdout.strip(), b'ordinary')
            self.assertIsNone(receipt)

    def test_cancel_after_child_already_waited(self):
        self.assert_cancelled('''
import subprocess, time
subprocess.run(['/bin/sleep', '0.02'], check=True)
open('ready', 'w').close()
time.sleep(30)
''')

    def test_unregistered_spawn_window_uses_real_wait(self):
        # SIGINT after actual child construction, before the caller receives its
        # Popen object. An object-only registry would incorrectly be empty.
        receipt, elapsed = self.assert_cancelled('''
import os, signal, subprocess, time
original = subprocess.Popen.__init__
def interrupted_init(self, *args, **kwargs):
    original(self, *args, **kwargs)
    open('ready', 'w').close()
    os.kill(os.getpid(), signal.SIGINT)
subprocess.Popen.__init__ = interrupted_init
subprocess.Popen(['/bin/sleep', '0.5'])
''')
        self.assertGreater(elapsed, 0.4)
        self.assertEqual(len(receipt['reaped']), 1)

    def test_late_cancel_during_controlled_interpreter_shutdown(self):
        for registration in ('atexit.register(late)', 'threading._register_atexit(late)'):
            with self.subTest(registration=registration):
                self.assert_cancelled('''
import atexit, subprocess, threading, time
subprocess.run(['/bin/sleep', '0.02'], check=True)
def late():
    open('ready', 'w').close()
    time.sleep(0.2)
''' + registration)

    def test_normal_shutdown_cannot_reopen_workers(self):
        code, receipt, stdout, _, _ = self.run_case('''
import atexit, threading
def late():
    try:
        threading.Thread(target=lambda: None).start()
    except RuntimeError:
        print('closed')
    else:
        print('reopened')
atexit.register(late)
''', cancel=False)
        self.assertEqual(code, 0)
        self.assertEqual(stdout.strip(), b'closed')
        self.assertIsNone(receipt)

    def test_live_child_does_not_get_receipt(self):
        code, receipt, _, _, elapsed = self.run_case('''
import subprocess, time
child = subprocess.Popen(['/bin/sleep', '11'])
open('ready', 'w').close()
time.sleep(30)
''')
        self.assertEqual(code, 130)
        self.assertIsNone(receipt)
        self.assertGreater(elapsed, 10)

    def test_live_daemon_worker_does_not_get_receipt(self):
        code, receipt, _, _, _ = self.run_case('''
import threading, time
threading.Thread(target=lambda: time.sleep(30), daemon=True).start()
open('ready', 'w').close()
time.sleep(30)
''')
        self.assertEqual(code, 130)
        self.assertIsNone(receipt)

    def test_unknown_tool_and_detached_group_do_not_get_receipt(self):
        for statement in (
            "subprocess.run(['/usr/bin/true'])",
            "subprocess.run(['/bin/sleep', '0.02'], start_new_session=True)",
        ):
            with self.subTest(statement=statement):
                code, receipt, _, _, _ = self.run_case(
                    'import subprocess, time\n' + statement +
                    '\nopen("ready", "w").close()\ntime.sleep(30)')
                self.assertEqual(code, 130)
                self.assertIsNone(receipt)

    def test_exit_callback_cannot_start_more_work(self):
        for action in (
            "subprocess.Popen(['/bin/sleep', '0.02'])",
            "threading.Thread(target=lambda: None).start()",
        ):
            with self.subTest(action=action):
                code, receipt, _, _, _ = self.run_case(
                    'import atexit, subprocess, threading, time\n' +
                    'atexit.register(lambda: ' + action + ')\n' +
                    'open("ready", "w").close()\ntime.sleep(30)')
                self.assertEqual(code, 130)
                self.assertIsNone(receipt)

    def test_stale_receipt_is_preserved_and_not_overwritten(self):
        code, receipt, _, _, _ = self.run_case(
            'import time\nopen("ready", "w").close()\ntime.sleep(30)', stale=True)
        self.assertEqual(code, 130)
        self.assertEqual(receipt, {'nonce': 'old'})


if __name__ == '__main__':
    unittest.main(verbosity=2)
