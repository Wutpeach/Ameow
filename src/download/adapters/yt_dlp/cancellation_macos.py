"""Embedded Transfer entry; this is trusted application code, not a Python sandbox."""
import atexit
import _thread
import errno
import inspect
import json
import os
import runpy
import signal
import subprocess
import sys
import threading
import time

nonce, tools_json, archive, *arguments = sys.argv[1:]
tools = set(json.loads(tools_json))
requested = False
closing = False
shutting_down = False
qualified = True
main_thread = threading.current_thread()
original_init = subprocess.Popen.__init__
init_signature = inspect.signature(original_init)
original_start = threading.Thread.start
original_joinable = threading._start_joinable_thread
spawn_context = threading.local()
unleased_attempts = set()


def reject_new_work():
    global qualified
    qualified = False
    raise RuntimeError('Transfer cancellation has closed new work')


def checked_init(self, *args, **kwargs):
    global qualified
    if closing:
        reject_new_work()
    bound = init_signature.bind(self, *args, **kwargs).arguments
    if (bound.get('shell') or bound.get('preexec_fn') is not None
            or bound.get('start_new_session')
            or bound.get('process_group') not in (None, -1)):
        qualified = False
    attempt = dict(token=object(), executable=None)
    previous = getattr(spawn_context, 'attempt', None)
    spawn_context.attempt = attempt
    # No object registration is used as settlement evidence. SIGINT may interrupt
    # this call after a real child exists; the later kernel wait barrier covers it.
    try:
        return original_init(self, *args, **kwargs)
    except FileNotFoundError as error:
        # Popen's audit event precedes exec. yt-dlp's verbose platform probes
        # (file/uname) can be absent on the empty PATH without executing them.
        # Discharge only this exact ENOENT attempt; never restore other taints.
        if (error.errno == errno.ENOENT and error.filename is not None
                and os.fsdecode(error.filename) == attempt['executable']):
            unleased_attempts.discard(attempt['token'])
        raise
    finally:
        spawn_context.attempt = previous


def checked_start(self, *args, **kwargs):
    if closing:
        reject_new_work()
    return original_start(self, *args, **kwargs)


def checked_joinable(*args, **kwargs):
    if closing:
        reject_new_work()
    return original_joinable(*args, **kwargs)


def raw_thread_start(original):
    def start(*args, **kwargs):
        global qualified
        qualified = False
        if closing:
            reject_new_work()
        return original(*args, **kwargs)
    return start


def audit(event, args):
    global qualified
    if event == 'subprocess.Popen':
        if closing:
            reject_new_work()
        executable = os.fsdecode(args[0])
        if executable not in tools:
            attempt = getattr(spawn_context, 'attempt', None)
            if attempt is None or len(unleased_attempts) >= 64:
                qualified = False
            else:
                attempt['executable'] = executable
                unleased_attempts.add(attempt['token'])
    elif event in ('os.fork', 'os.forkpty', 'os.posix_spawn', 'os.exec', 'os.system'):
        qualified = False
        if closing:
            reject_new_work()


def interrupt(_signal, _frame):
    global requested, closing
    requested = True
    closing = True
    # Exactly one interrupt is delivered by the owner. Keep cleanup immune to a
    # second KeyboardInterrupt, including signals from the terminal.
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    # Do not interrupt a shutdown callback halfway through and then execute it
    # twice. Its completion remains bounded by the supervisor's original deadline.
    if not shutting_down:
        raise KeyboardInterrupt


def cancellation_receipt():
    global closing
    closing = True
    deadline = time.monotonic() + 10
    # Match CPython's shutdown order, but before publishing proof. The supervisor
    # owns the single 15-second overall deadline if an exit callback blocks.
    threading._shutdown()
    atexit._run_exitfuncs()
    for worker in threading.enumerate():
        if worker is main_thread:
            continue
        worker.join(max(0, deadline - time.monotonic()))
        if worker.is_alive():
            return False
    # Workers cannot race this wait or create another child. Do not use an empty
    # Popen registry, EOF, PID absence, or signal delivery as a substitute.
    reaped = []
    while True:
        try:
            pid, status = os.waitpid(-1, os.WNOHANG)
        except ChildProcessError:
            break
        except InterruptedError:
            continue
        if pid:
            if len(reaped) >= 64:
                return False
            reaped.append([pid, status])
        elif time.monotonic() >= deadline:
            return False
        else:
            time.sleep(0.01)
    if not qualified or unleased_attempts or time.monotonic() >= deadline:
        return False
    record = dict(schema=1, nonce=nonce, root_pid=os.getpid(), kind='cancelled',
                  work_creation_closed=True, workers_joined=True,
                  direct_children_waited=True, reaped=reaped)
    data = (json.dumps(record, separators=(',', ':')) + '\n').encode()
    # New file only; never follow or overwrite a stale receipt. No URLs, headers,
    # cookies, output paths or media identity enter this private protocol.
    fd = os.open('transfer-cancel.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL
                 | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as output:
        output.write(data)
    return True


subprocess.Popen.__init__ = checked_init
threading.Thread.start = checked_start
threading._start_joinable_thread = checked_joinable
for name in ('start_new_thread', 'start_new', 'start_joinable_thread'):
    if hasattr(_thread, name):
        setattr(_thread, name, raw_thread_start(getattr(_thread, name)))
sys.addaudithook(audit)
signal.signal(signal.SIGINT, interrupt)
sys.argv = [archive, *arguments]
try:
    try:
        runpy.run_path(archive, run_name='__main__')
    finally:
        if not requested:
            # Own normal interpreter shutdown too: SIGINT can arrive after the
            # zipapp has returned, while these callbacks are still running.
            shutting_down = True
            closing = True
            threading._shutdown()
            atexit._run_exitfuncs()
finally:
    if requested:
        try:
            complete = cancellation_receipt()
        except BaseException:
            complete = False
        if not complete:
            sys.stderr.write('Transfer cancellation proof unavailable\n')
        # This normal exit is only one input to the Adapter/supervisor contract.
        # Missing proof must remain Held after an observed fork.
        raise SystemExit(130)
