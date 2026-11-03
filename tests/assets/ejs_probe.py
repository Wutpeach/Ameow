"""LOCAL TEST ONLY: no media metadata, network, provider patches, or production use."""
import hashlib
import json
import os
from pathlib import Path
import shlex
import sys

from yt_dlp.extractor.common import InfoExtractor
from yt_dlp.extractor.youtube import YoutubeIE
from yt_dlp.extractor.youtube.jsc._builtin.deno import DenoJCP
from yt_dlp.extractor.youtube.jsc._director import initialize_jsc_director
from yt_dlp.extractor.youtube.jsc.provider import (
    JsChallengeRequest, JsChallengeType, NChallengeInput,
)
from yt_dlp.utils import ExtractorError
from yt_dlp.version import __version__

__all__ = ['AmeowEjsProbeIE']

INPUT = 'IlLiA21ny7gqA2m4p37'
EXPECTED = '9nRTxrbM1f0yHg'
PLAYER_URL = 'https://www.youtube.com/s/player/74edf1a3/player_ias.vflset/en_US/base.js'
FIXTURE_HASH = 'ed9a4ea0646332a6b6c973ebe5a915c62c43db89bb2bb1a31eba07d906ef8ff7'


def emit(event, **values):
    print('AMEOW_EJS ' + json.dumps(dict(event=event, **values), sort_keys=True), flush=True)


class FixtureYoutubeIE(YoutubeIE):
    """Only player input is injected; official director/provider/solver stay intact."""
    corrupt = False

    def _load_player(self, video_id, player_url, fatal=True):
        if player_url != PLAYER_URL:
            raise RuntimeError('Unexpected player URL')
        data = Path(os.environ['AMEOW_EJS_PLAYER']).read_bytes()
        if hashlib.sha256(data).hexdigest() != FIXTURE_HASH:
            raise RuntimeError('Fixture hash mismatch')
        emit('fixture_input', corrupt=self.corrupt, sha256=FIXTURE_HASH,
             original_bytes=len(data), player_url=player_url)
        # Deliberately malformed input is the isolated negative case, never a solver patch.
        return 'invalid javascript {' if self.corrupt else data.decode('utf-8')


class AmeowEjsProbeIE(InfoExtractor):
    _VALID_URL = r'ameow-ejs-probe:(?P<id>test)'

    def _real_extract(self, url):
        if not getattr(sys, 'frozen', False) or __version__ != '2026.08.19':
            raise ExtractorError('Pinned packaged executable required', expected=True)
        if self.get_param('remote_components') or self.get_param('cachedir') is not False:
            raise ExtractorError('Remote components/cache must be disabled', expected=True)
        deno_path = os.path.normcase(os.path.abspath(os.environ['AMEOW_EJS_DENO']))
        emit('host', version=__version__, frozen=True, executable=sys.executable,
             module=DenoJCP.__module__, module_file=sys.modules[DenoJCP.__module__].__file__,
             path=os.environ.get('PATH'), remote_components=sorted(self.get_param('remote_components') or ()),
             input_injection='FixtureYoutubeIE._load_player only')
        spawns = []
        runtime_returns = []

        def audit(event, args):
            if event in ('socket.connect', 'socket.getaddrinfo'):
                emit('network_denied', audit_event=event)
                raise RuntimeError('Offline test forbids network')
            if event == 'subprocess.Popen':
                executable, argv, cwd, env = args
                # Windows CPython audits a command-line string and executable may be None.
                argv = [a.strip('"') for a in shlex.split(argv, posix=False)] if isinstance(argv, str) else argv
                resolved = executable or argv[0]
                if os.path.normcase(os.path.abspath(resolved)) != deno_path:
                    raise RuntimeError('Unpinned child executable')
                if '--version' not in argv:
                    required = ('--no-remote', '--no-config', '--no-prompt', '--cached-only', '--no-npm')
                    if any(flag not in argv for flag in required):
                        raise RuntimeError('Deno sandbox options missing')
                    if any(a.startswith(('--allow-', '--unsafely-', '-A')) for a in argv):
                        raise RuntimeError('Deno permission widening forbidden')
                emit('child_spawn', argv=argv, path=env.get('PATH') if env else None,
                     deno_dir=env.get('DENO_DIR') if env else None)
                if '--version' not in argv:
                    spawns.append(argv)

        sys.addaudithook(audit)
        ie = FixtureYoutubeIE(self._downloader)
        director = initialize_jsc_director(ie)
        providers = [p for p in director.providers.values() if type(p) is DenoJCP]
        if len(providers) != 1 or providers[0].is_dev:
            raise ExtractorError('Official non-dev Deno provider required', expected=True)
        provider = providers[0]
        if provider.runtime_info.version != '2.9.7':
            raise ExtractorError('Pinned Deno version required', expected=True)
        emit('provider_identity', cls=type(provider).__name__, module=type(provider).__module__,
             instance=id(provider), runtime=str(provider.runtime_info), dev=provider.is_dev)
        calls = []

        def observe(frame, event, arg):
            module = frame.f_globals.get('__name__', '')
            name = frame.f_code.co_name
            if module.startswith('yt_dlp.extractor.youtube.jsc.'):
                if event == 'call' and name in ('_real_bulk_solve', '_run_js_runtime', '_run_deno', '_get_player'):
                    calls.append(name)
                    emit('official_call', module=module, function=name,
                         provider=id(frame.f_locals.get('self')))
                if event == 'return' and name == '_get_script' and arg is not None:
                    if arg.source.value not in ('python package', 'builtin') or arg.version != '0.8.0':
                        raise RuntimeError('Only official packaged EJS 0.8.0 scripts accepted')
                    emit('bundled_script', script_type=arg.type.value, source=arg.source.value,
                         variant=arg.variant.value, version=arg.version,
                         sha256=hashlib.sha256(arg.code.encode()).hexdigest(), sha3_512=arg.hash)
                if event == 'return' and name == '_run_deno' and isinstance(arg, str):
                    runtime_returns.append(arg)
                    result = json.loads(arg)
                    emit('deno_return', bytes=len(arg), sha256=hashlib.sha256(arg.encode()).hexdigest(),
                         result={k: result[k] for k in ('type', 'responses', 'error') if k in result})
                if event == 'return' and name == '_run_deno' and frame.f_locals.get('proc') is not None:
                    proc = frame.f_locals['proc']
                    emit('deno_process_exit', pid=proc.pid, returncode=proc.returncode)

        sys.setprofile(observe)
        results = []
        try:
            for phase, corrupt in (('success', False), ('failure', True), ('recovery', False)):
                ie.corrupt = corrupt
                emit('phase_start', phase=phase, provider=id(provider))
                before = len(calls)
                spawn_before = len(spawns)
                return_before = len(runtime_returns)
                request = JsChallengeRequest(JsChallengeType.N, NChallengeInput(PLAYER_URL, [INPUT]))
                solved = director.bulk_solve([request])
                answer = solved[0][1].output.results.get(INPUT) if solved else None
                invoked = '_run_deno' in calls[before:]
                spawned = len(spawns) > spawn_before
                returned = len(runtime_returns) > return_before
                passed = invoked and spawned and (not solved if corrupt else returned and answer == EXPECTED)
                emit('phase_result', phase=phase, answer=answer, solved=len(solved),
                     official_deno_called=invoked, child_spawned=spawned,
                     solver_return_observed=returned, passed=passed, provider=id(provider))
                results.append(passed)
        finally:
            sys.setprofile(None)
        if not all(results):
            raise ExtractorError('AMEOW_EJS_GATE_FAILED', expected=True)
        emit('gate_result', passed=True, phases=3, media_metadata=False, offline=True)
        # Expected CLI exit 1 prevents this provider test becoming a fabricated download.
        raise ExtractorError('AMEOW_EJS_GATE_PASS_TEST_ONLY_NO_MEDIA', expected=True)
