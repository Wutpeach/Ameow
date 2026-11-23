"""Read-only Ameow candidate/evidence cross-check. Python 3.11+, Git, gh; no builds or GUI."""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tomllib


WINDOWS = 'x86_64-pc-windows-msvc'
MAC = 'aarch64-apple-darwin'
# Keep aligned with package_portable.ps1 Source-Inventory and Mac/installer inputs.
SOURCE_ROOTS = ('Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'vendor/accesskit_windows',
                'build.rs', 'build_support', 'THIRD_PARTY_NOTICES.md', 'LICENSE', 'src',
                'assets', 'browser-extension', 'distribution/notices', 'distribution/license-inputs.json')
MAC_SOURCE_ROOTS = ('Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'build.rs', 'build_support',
                    'src', 'assets', 'browser-extension', 'distribution/macos-license-inputs.json')
EXTRA_INPUTS = ('scripts/package_portable.ps1', 'scripts/package_windows.ps1',
                'scripts/package_macos.sh', '.github/workflows/rust.yml', '.cargo',
                '.gitattributes', 'distribution/ameow.iss', 'distribution/languages',
                'distribution/ameow-wizard-large.png', 'distribution/macos-license-inputs.json',
                'site/public/ameow-logo.png')
REQUIRED = ['docs', 'user-acceptance'] + [f'{platform}.{case}'
            for platform in ('windows', 'mac')
            for case in ('startup', 'paste', 'download', 'cancel', 'extension', 'exit')]
REQUIRED += [f'mac.{case}' for case in ('focus', 'full-compact', 'background', 'menu-bar')]


class Pending(Exception):
    pass


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def run(args, cwd):
    result = subprocess.run(args, cwd=cwd, capture_output=True, timeout=45, check=True)
    return result.stdout.decode('utf-8').strip()


def under(path, roots):
    return any(path == root or path.startswith(root + '/') for root in roots)


def input_change(path):
    return under(path, SOURCE_ROOTS + EXTRA_INPUTS)


def development_input_change(path, platform=None):
    return (under(path, SOURCE_ROOTS + ('.cargo', '.gitattributes', 'distribution/macos-license-inputs.json'))
            or platform != 'windows' and path in ('scripts/package_macos.sh', 'site/public/ameow-logo.png'))


def known_non_input(path):
    # Historical moved/retired tool paths stay non-inputs for existing evidence.
    return (path in ('AGENTS.md', '.ameow-docs-reviewed-state.json', 'DESIGN.md',
                     '.impeccable/design.json', 'CONTRIBUTING.md', 'README.md', 'README.en.md',
                     'scripts/check_release_readiness.py', 'scripts/test_release_readiness.py',
                     'scripts/docs-sync.mjs', 'scripts/docs-sync.test.mjs',
                     'scripts/schedule-checks/ameow-docs-sync.mjs')
            or under(path, ('docs', 'openspec', '.agents/skills', 'site'))
            or path.startswith('distribution/') and path.endswith('.md'))


def release_doc(path):
    return (under(path, ('site', 'docs', 'openspec'))
            or path in ('README.md', 'README.en.md', 'CONTRIBUTING.md', 'DESIGN.md', '.impeccable/design.json',
                        '.github/workflows/deploy-docs.yml')
            or path.startswith('distribution/') and path.endswith('.md'))


def expected_assets(version):
    return {f'Ameow_{version}_windows_x64_installer.exe': WINDOWS,
            f'Ameow_{version}_windows_x64_portable.zip': WINDOWS,
            f'Ameow-{version}-windows-x64.zip': WINDOWS,
            'ameow-update-windows-x64.json': WINDOWS,
            f'Ameow-{version}-macos-arm64.zip': MAC,
            'ameow-update-macos-arm64.json': MAC}


def git_blobs(repo, commit, paths):
    paths = list(paths)
    request = ''.join(f'{commit}:{path}\n' for path in paths).encode()
    result = subprocess.run(['git', 'cat-file', '--batch'], cwd=repo, input=request,
                            capture_output=True, timeout=45, check=True)
    stream = io.BytesIO(result.stdout)
    blobs = {}
    for path in paths:
        header = stream.readline().split()
        require(len(header) == 3 and header[1] == b'blob', f'Not a source blob: {path}')
        blobs[path] = stream.read(int(header[2]))
        require(stream.read(1) == b'\n', 'Invalid git batch response')
    return blobs


def matches(record, data):
    return record['bytes'] == len(data) and record['sha256'].lower() == digest(data)


def source_match(record, data):
    if matches(record, data):
        return True
    # Windows checkout may materialize Git text blobs with CRLF. No binary normalization.
    try:
        data.decode('utf-8')
    except UnicodeDecodeError:
        return False
    return b'\0' not in data and matches(record, data.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n'))


class Check:
    def __init__(self, args):
        self.args = args
        self.repo = args.repo.resolve()
        self.evidence = load_json(args.evidence) if args.evidence else {}
        if self.evidence.get('status') == 'RETIRED':
            raise Pending('Dedicated candidate evidence is retired; use source phase without reconstructing its assets')
        self.assets = load_json(args.assets) if args.assets else {}
        self.base = args.evidence.resolve().parent if args.evidence else args.assets.resolve().parent if args.assets else self.repo
        self.tree = run(['git', 'rev-parse', f'{args.commit}^{{tree}}'], self.repo)
        self.head = run(['git', 'rev-parse', 'HEAD'], self.repo)
        self.results = []

    def add(self, name, action):
        try:
            detail = action()
            self.results.append(dict(id=name, status='PASS', detail=detail))
        except Pending as error:
            self.results.append(dict(id=name, status='PENDING', detail=str(error)))
        except (ValueError, OSError, KeyError, TypeError, AttributeError,
                subprocess.SubprocessError) as error:
            self.results.append(dict(id=name, status='FAIL', detail=str(error)))

    def identity(self, value, *, version=True):
        require(value['commit'] == self.args.commit and value['tree'] == self.tree,
                'Receipt commit/tree differs from selected product source')
        if version:
            require(value['version'] == self.args.version, 'Receipt version differs from selected version')

    def receipt(self, platform, key):
        path = self.evidence.get(platform, {}).get(key)
        if not path:
            raise Pending(f'Missing {platform}.{key} receipt')
        return load_json(self.base / path)

    def candidate(self):
        require(re.fullmatch(r'[0-9a-f]{40}', self.args.commit), 'Use a full product commit')
        require(re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', self.args.version), 'Use an actual release version')
        if self.args.phase == 'release':
            self.identity(self.assets)
        paths = ['Cargo.toml', 'Cargo.lock', 'browser-extension/manifest.json',
                 'browser-extension/package.json', 'browser-extension/package-lock.json']
        blobs = git_blobs(self.repo, self.args.commit, paths)
        cargo = tomllib.loads(blobs[paths[0]].decode())
        lock = tomllib.loads(blobs[paths[1]].decode())
        versions = [cargo['package']['version']]
        versions += [p['version'] for p in lock['package'] if p['name'] == 'ameow']
        versions += [json.loads(blobs[p])['version'] for p in paths[2:]]
        versions += [json.loads(blobs[paths[4]])['packages']['']['version']]
        require(len(versions) == 6 and all(v == self.args.version for v in versions),
                f'Actual source versions differ: {versions}')
        return dict(version=self.args.version, commit=self.args.commit, tree=self.tree)

    def asset_files(self):
        expected = expected_assets(self.args.version)
        entries = self.assets['assets']
        require(len(entries) == len(expected) and {a['name'] for a in entries} == set(expected),
                'Candidate must contain the exact six platform assets')
        for item in entries:
            require(item['target'] == expected[item['name']], f'Wrong platform: {item["name"]}')
            relative = PurePosixPath(item['relativePath'])
            require(not relative.is_absolute() and '..' not in relative.parts
                    and ':' not in str(relative) and '\\' not in str(relative)
                    and relative.name == item['name'], 'Invalid asset relativePath')
            root = self.args.assets.resolve().parent
            path = (root / str(relative)).resolve()
            require(path.is_relative_to(root), 'Asset escapes candidate directory')
            require(matches(item, path.read_bytes()), f'Asset size/hash mismatch: {item["name"]}')
        return [{k: a[k] for k in ('name', 'bytes', 'sha256')} for a in entries]

    def main_sync(self):
        branch = run(['git', 'branch', '--show-current'], self.repo)
        require(branch == 'main', f'Expected main checkout, found {branch}')
        if self.args.phase == 'source':
            require(self.args.commit == self.head, 'Source acceptance must select the current main commit')
        run(['git', 'merge-base', '--is-ancestor', self.args.commit, self.head], self.repo)
        try:
            remote = run(['git', 'ls-remote', '--exit-code', 'origin', 'refs/heads/main'], self.repo).split()[0]
        except (OSError, subprocess.SubprocessError) as error:
            raise Pending(f'Cannot read remote main: {error}') from error
        require(remote == self.head, f'Local main {self.head} differs from live remote {remote}')
        return dict(localHead=self.head, remoteHead=remote, productCommit=self.args.commit)

    def followups(self):
        committed = run(['git', 'diff', '--name-only', self.args.commit, self.head], self.repo).splitlines()
        dirty = run(['git', 'diff', '--name-only', 'HEAD'], self.repo).splitlines()
        dirty += run(['git', 'ls-files', '--others', '--exclude-standard'], self.repo).splitlines()
        changed = sorted(set(committed + dirty))
        affects = input_change if self.args.phase == 'release' else development_input_change
        inputs = [p for p in changed if affects(p)]
        require(not inputs, f'Actual build/packaging inputs changed; reassess candidate: {inputs}')
        unknown = [p for p in changed if not known_non_input(p)
                   and not (self.args.phase == 'source' and input_change(p) and not affects(p))]
        if unknown:
            raise Pending(f'Classify additional changed paths before reusing candidate: {unknown}')
        return dict(productCommit=self.args.commit, currentHead=self.head, nonInputChanges=changed,
                    rebuildRequired=False)

    def ci(self, role):
        url = self.assets.get('ci', {}).get(role, '')
        remote = run(['git', 'remote', 'get-url', 'origin'], self.repo)
        match = re.fullmatch(r'(?:https://github.com/|git@github.com:)([^/]+/[^/]+?)(?:\.git)?', remote)
        require(match is not None, 'Expected a GitHub origin')
        repository = match[1]
        run_match = re.fullmatch(rf'https://github.com/{re.escape(repository)}/actions/runs/([0-9]+)', url)
        require(run_match is not None, f'Missing or wrong-repository {role} CI URL')
        try:
            receipt = json.loads(run(['gh', 'api', f'repos/{repository}/actions/runs/{run_match[1]}'], self.repo))
        except (OSError, subprocess.SubprocessError) as error:
            raise Pending(f'Cannot query exact {role} CI: {error}') from error
        docs = next((r for r in self.evidence.get('records', []) if r['id'] == 'docs'), {})
        expected_head = docs.get('commit', self.args.commit) if role == 'docs' else self.args.commit
        events = ('push', 'workflow_dispatch') if role == 'rust' else ('push',)
        require(receipt['repository']['full_name'] == repository
                and receipt['head_repository']['full_name'] == repository, 'CI belongs to a different repository')
        require(receipt['head_sha'] == expected_head and receipt['head_branch'] == 'main'
                and receipt['event'] in events, f'{role} CI belongs to a different source/event')
        workflow = 'rust.yml' if role == 'rust' else 'deploy-docs.yml'
        require(receipt['path'] == f'.github/workflows/{workflow}', f'Wrong {role} workflow')
        if receipt['status'] != 'completed':
            raise Pending(f'{role} CI still {receipt["status"]}: {url}')
        require(receipt['conclusion'] == 'success', f'{role} CI failed: {receipt["conclusion"]}')
        return dict(url=url, head=receipt['head_sha'], attempt=receipt['run_attempt'], conclusion='success')

    def evidence_identity(self):
        if not self.evidence:
            raise Pending('No evidence index supplied; native/user results remain unknown')
        require(self.evidence['schema'] == 1, 'Unsupported evidence index schema')
        require(self.evidence.get('phase', self.args.phase) == self.args.phase, 'Evidence phase differs from selected phase')
        identity = self.evidence['identity']
        self.identity(identity)
        if self.args.phase == 'release':
            require(identity['assetsSha256'] == digest(self.args.assets.read_bytes()),
                    'Evidence is bound to a different ASSETS.json')
        return identity

    def inputs(self, platform):
        receipt = self.receipt(platform, 'inputs')
        identity = dict(commit=receipt.get('baselineHead', receipt.get('commit')),
                        tree=receipt.get('baselineTree', receipt.get('tree')))
        self.identity(identity, version=False)
        require(receipt['dirty'] is False, f'{platform} build was dirty')
        combined = platform == 'mac' and 'source' in receipt and 'sourceAndResources' not in receipt
        if 'sourceAndResources' not in receipt and not combined:
            raise Pending(f'{platform}: only input summary available; need full sourceAndResources/packagingInputs')
        sources = receipt['source'] if combined else receipt['sourceAndResources']
        serialized = json.dumps(sources, ensure_ascii=False, separators=(',', ':')).encode()
        require(digest(serialized) == receipt['sourceInventorySha256'].lower(), 'Source inventory digest mismatch')
        records = sources if combined else sources + receipt['packagingInputs']
        paths = {r['path'] for r in records}
        required_packaging = ({'scripts/package_portable.ps1', '.github/workflows/rust.yml', 'rust-toolchain.toml'}
                              if platform == 'windows' else {'scripts/package_macos.sh', 'site/public/ameow-logo.png',
                                                            'distribution/macos-license-inputs.json'})
        require(required_packaging <= paths, f'{platform} receipt omits packaging inputs')
        roots = SOURCE_ROOTS if platform == 'windows' else MAC_SOURCE_ROOTS
        expected = set(run(['git', 'ls-tree', '-r', '--name-only', self.args.commit, '--', *roots], self.repo).splitlines())
        require(expected <= {r['path'] for r in sources}, 'Input receipt omits source/resource files')
        blobs = git_blobs(self.repo, self.args.commit, sorted(paths))
        for record in records:
            require(source_match(record, blobs[record['path']]), f'Input differs from product source: {record["path"]}')
        if platform == 'windows':
            build = self.receipt(platform, 'build')
            self.identity(build)
            require(build['schema'] == 3 and build['dirty'] is False and build['target'] == WINDOWS,
                    'Invalid Windows build identity')
            require(build['source_sha256'] == receipt['sourceInventorySha256'].lower(), 'Build/input digest mismatch')
            lock = next((r for r in sources if r['path'] == 'Cargo.lock'), None)
            require(lock is not None, 'Input receipt omits Cargo.lock')
            require(build['cargo_lock_sha256'] == lock['sha256'].lower(), 'Build lockfile mismatch')
        elif 'cargoLockSha256' in receipt:
            lock = next(r for r in sources if r['path'] == 'Cargo.lock')
            require(receipt['cargoLockSha256'] == lock['sha256'].lower(), 'Mac build lockfile mismatch')
        return dict(records=len(records), commit=self.args.commit, format='mac-combined' if combined else 'split',
                    newlinePolicy='Git bytes or UTF-8 CRLF checkout')

    def packaging(self, platform):
        assets = {a['name']: a for a in self.assets['assets']}
        if platform == 'windows':
            build = self.receipt(platform, 'build')
            delivery = self.receipt(platform, 'delivery')
            verified = self.receipt(platform, 'verified')
            self.identity(build)
            require(build == delivery['build'] == verified['build'], 'Mixed Windows build/signing/delivery receipts')
            declared = self.assets['windows']
            for key in ('app', 'launcher', 'cli'):
                require(all(declared[key][k] == build[key][k] for k in ('bytes', 'sha256')),
                        f'ASSETS Windows {key} differs from build')
            host = next((r for r in build['browser'] if r['path'] == 'ameow-browser-host.exe'), None)
            require(host is not None, 'Build receipt omits browser host')
            require(all(declared['host'][k] == host[k] for k in ('bytes', 'sha256')), 'ASSETS Windows host differs')
            require(declared['sourceSha256'] == build['source_sha256']
                    and declared['cargoLockSha256'] == build['cargo_lock_sha256'], 'ASSETS Windows input digest differs')
            require(delivery['fixture'] is False and verified['fixture'] is False, 'Fixture candidate rejected')
            self.identity(delivery['installerSource'], version=False)
            require(delivery['installerSource']['dirty'] is False, 'Dirty installer source')
            require(delivery['members'] == verified['members'] and len(verified['members']) > 0,
                    'Member verification receipt differs from delivery')
            for key in ('installer', 'portable', 'update', 'manifest'):
                record = delivery[key]
                asset = assets[record['path']]
                require(asset['target'] == WINDOWS and all(asset[k] == record[k] for k in ('bytes', 'sha256')),
                        f'Delivery asset differs: {key}')
            require(delivery['update'] == verified['update'], 'Signed update differs from delivery')
            require(all(delivery['portable'][k] == verified['portable'][k] for k in ('bytes', 'sha256')),
                    'Verified portable archive differs from delivery')
            packaging = [delivery['installerDefinition'], delivery['packaging']] + delivery['installerResources']
            blobs = git_blobs(self.repo, self.args.commit, [r['path'] for r in packaging])
            for record in packaging:
                require(source_match(record, blobs[record['path']]), f'Installer input differs: {record["path"]}')
            return dict(members=len(verified['members']), signature='existing verify-signed receipt; not re-executed')
        verified = self.receipt('mac', 'verified')
        require(verified['status'] == 'signature-and-package-verified' and verified['source'] == self.args.commit
                and verified['version'] == self.args.version and verified['target'] == MAC, 'Wrong Mac verification identity')
        package = assets[f'Ameow-{self.args.version}-macos-arm64.zip']
        require(verified['package_sha256'] == package['sha256'] and verified['package_bytes'] == package['bytes'],
                'Mac verification belongs to a different package')
        require(verified['exe_sha256'] == self.assets['mac']['app']['sha256']
                and verified['exe_bytes'] == self.assets['mac']['app']['bytes'], 'Mac executable identity differs')
        return 'Existing signature/package receipt matches candidate; codesign/member/native coverage stays in reports'

    def feeds(self):
        assets = {a['name']: a for a in self.assets['assets']}
        for platform, target, suffix in [('windows', WINDOWS, 'windows-x64'), ('mac', MAC, 'macos-arm64')]:
            feed = assets[f'ameow-update-{suffix}.json']
            envelope = load_json(self.args.assets.resolve().parent / feed['relativePath'])
            payload = json.loads(envelope['payload'])
            package = assets[f'Ameow-{self.args.version}-{suffix}.zip']
            app = self.receipt('windows', 'build')['app'] if platform == 'windows' else self.assets['mac']['app']
            require(payload['version'] == self.args.version and payload['target'] == target,
                    f'{platform} feed version/target mismatch')
            require(payload['package_bytes'] == package['bytes'] and payload['package_sha256'] == package['sha256']
                    and payload['exe_bytes'] == app['bytes'] and payload['exe_sha256'] == app['sha256'],
                    f'{platform} feed package/executable differs from candidate')
            if platform == 'mac':
                verified = self.receipt('mac', 'verified')
                require(all(verified[k] == v for k, v in payload.items()), 'Mac verified payload differs from feed')
        return 'Both feed payloads match candidate and existing verification receipts; signatures not re-executed'

    def record(self, name):
        records = [r for r in self.evidence.get('records', []) if r['id'] == name]
        require(len(records) <= 1, f'Duplicate record: {name}')
        if not records:
            raise Pending(f'Missing {name} evidence')
        record = records[0]
        if 'identity' in record:
            self.identity(record['identity'])
        status, note = record.get('status'), record.get('note', '')
        require(status != 'FAIL', f'{name}: {note}')
        if status != 'PASS':
            raise Pending(f'{name}: {note or "unknown; not PASS"}')
        self.functional_source(name, record)
        require(note and record.get('files'), f'{name} PASS requires explanation and evidence files')
        for file in record['files']:
            path = self.base / file['path']
            require(digest(path.read_bytes()) == file['sha256'], f'{name} report hash differs')
            if path.suffix.lower() == '.json':
                self.report_identity(name, record, load_json(path))
        if name == 'docs':
            commit = record.get('commit', '')
            require(re.fullmatch(r'[0-9a-f]{40}', commit), 'docs requires exact documentation commit')
            if self.args.phase == 'release':
                run(['git', 'merge-base', '--is-ancestor', self.args.commit, commit], self.repo)
            run(['git', 'merge-base', '--is-ancestor', commit, self.head], self.repo)
            changed = run(['git', 'diff', '--name-only', commit], self.repo).splitlines()
            changed += run(['git', 'ls-files', '--others', '--exclude-standard'], self.repo).splitlines()
            uncovered = [p for p in changed if release_doc(p)]
            if uncovered:
                raise Pending(f'Documentation changed after reviewed commit {commit}: {uncovered}')
        result = dict(note=note, files=record['files'])
        if name != 'docs':
            result['source'] = record.get('source', {'kind': 'package'})
        return result

    def functional_platform(self, name, source):
        platform = name.split('.')[0] if name.startswith(('windows.', 'mac.')) else source.get('platform')
        require(platform in (None, 'windows', 'mac'), 'Unknown functional evidence platform')
        return platform

    def development_inputs(self, source, platform=None):
        require(source.get('buildInputsMatch') is not False and source.get('dirtyInputs') is not True,
                'Development receipt reports mismatched build inputs')
        if source.get('buildInputsMatch') is not True:
            raise Pending('Development run must record actual build inputs matching its source commit')
        if source.get('dirty') is True:
            paths = source.get('dirtyPaths')
            if not isinstance(paths, list) or not paths:
                raise Pending('Dirty development build needs the recorded changed paths')
            require(not any(development_input_change(p, platform) for p in paths), 'Development build used dirty inputs')
            if any(not known_non_input(p) and not input_change(p) for p in paths):
                raise Pending('Classify unknown dirty development paths before reusing evidence')

    def functional_source(self, name, record):
        source = record.get('source')
        if source is None:
            require(self.args.phase == 'release' or name == 'docs', 'Source functional PASS requires actual executable provenance')
            return
        require(source['kind'] in ('package', 'development'), 'Unknown functional evidence source')
        if source['kind'] == 'package':
            require(self.args.phase == 'release', 'Package evidence does not establish current main source acceptance')
            self.identity(source)
            return
        require(name != 'docs', 'Development executable evidence cannot replace documentation review')
        platform = self.functional_platform(name, source)
        self.development_inputs(source, platform)
        require(source['version'] == self.args.version and re.fullmatch(r'[0-9a-f]{40}', source['commit']),
                'Development source version/commit mismatch')
        tree = run(['git', 'rev-parse', f'{source["commit"]}^{{tree}}'], self.repo)
        require(source['tree'] == tree, 'Development source tree mismatch')
        run(['git', 'merge-base', '--is-ancestor', source['commit'], self.head], self.repo)
        changed = run(['git', 'diff', '--name-only', self.args.commit, source['commit']], self.repo).splitlines()
        require(not any(development_input_change(p, platform) for p in changed), 'Functional source changes candidate build inputs')
        if any(not known_non_input(p) and not input_change(p) for p in changed):
            raise Pending('Classify unknown development source changes before reusing evidence')
        require(source.get('app'), 'Development evidence requires actual executable path/hash')
        for key in ('app', 'cli', 'host'):
            if key in source:
                require(source[key]['path'] and re.fullmatch(r'[0-9a-fA-F]{64}', source[key]['sha256']),
                        f'Development {key} requires actual path/SHA256 from the run receipt')

    def report_identity(self, name, record, report):
        if not isinstance(report, dict):
            return
        source = record.get('source', {})
        if source.get('kind') == 'development':
            provenance = dict(source)
            provenance.update({k: report[k] for k in ('buildInputsMatch', 'dirtyInputs', 'dirty', 'dirtyPaths') if k in report})
            self.development_inputs(provenance, self.functional_platform(name, source))
        commit = source.get('commit', record.get('commit', self.args.commit) if name == 'docs' else self.args.commit)
        for key in ('commit', 'head_sha'):
            if key in report:
                require(report[key] == commit, f'{name} raw report {key} belongs to another source')
        if isinstance(report.get('source'), str) and re.fullmatch(r'[0-9a-f]{40}', report['source']):
            require(report['source'] == commit, f'{name} raw report source differs')
        if 'tree' in report and (source or commit == self.args.commit):
            require(report['tree'] == source.get('tree', self.tree), f'{name} raw report tree differs')
        if isinstance(report.get('version'), str) and re.fullmatch(r'\d+\.\d+\.\d+', report['version']):
            require(report['version'] == self.args.version, f'{name} raw report version differs')
        platforms = [name.split('.')[0]] if name.startswith(('windows.', 'mac.')) else ['windows', 'mac']
        for key in ('app', 'cli', 'host'):
            field = key + '_sha256'
            if field not in report:
                continue
            if source.get('kind') == 'development':
                require(key in source and report[field].lower() == source[key]['sha256'].lower(),
                        f'{name} raw report development {key} differs')
                continue
            hashes = set()
            for platform in platforms:
                if platform == 'windows' or key == 'app':
                    hashes.add(self.assets[platform][key]['sha256'].lower())
                else:
                    executable = 'ameow-cli' if key == 'cli' else 'ameow-browser-host'
                    hashes.update(r['sha256'].lower() for r in self.assets['mac']['programs']
                                  if r['path'].endswith('/' + executable))
            require(report[field].lower() in hashes, f'{name} raw report {key} executable differs')

    def check(self):
        for name, action in [('candidate', self.candidate), ('main', self.main_sync), ('followup-inputs', self.followups),
                             ('evidence-identity', self.evidence_identity)]:
            self.add(name, action)
        if self.args.phase == 'release':
            self.add('assets', self.asset_files)
            for role in ('rust', 'docs'):
                self.add(f'ci.{role}', lambda role=role: self.ci(role))
            for platform in ('windows', 'mac'):
                self.add(f'{platform}.inputs', lambda p=platform: self.inputs(p))
                self.add(f'{platform}.packaging', lambda p=platform: self.packaging(p))
            self.add('feeds', self.feeds)
        extra = [r['id'] for r in self.evidence.get('records', []) if r['id'] not in REQUIRED]
        for name in REQUIRED + sorted(set(extra)):
            self.add(name, lambda name=name: self.record(name))
        states = {r['status'] for r in self.results}
        status = 'FAIL' if 'FAIL' in states else 'PENDING' if 'PENDING' in states else 'PASS'
        return dict(schema=1, status=status, phase=self.args.phase, version=self.args.version, productCommit=self.args.commit,
                    currentHead=self.head, publicationAuthorized=False, checks=self.results,
                    releaseAssetsStatus='NOT_PREPARED' if self.args.phase == 'source' else 'SEE_RELEASE_CHECKS',
                    scope='Source functional evidence only; release assets not assessed' if self.args.phase == 'source'
                    else 'Read-only release file/receipt identity checks; no native tests, signature execution or publication')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase', choices=('source', 'release'), default='source')
    parser.add_argument('--version', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--assets', type=Path)
    parser.add_argument('--evidence', type=Path)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[4])
    args = parser.parse_args()
    if args.phase == 'release' and not args.assets:
        parser.error('--phase release requires --assets; source acceptance needs no release assets')
    if args.phase == 'source' and args.assets:
        parser.error('Use --phase release to inspect assets; source acceptance does not consume an asset manifest')
    try:
        report = Check(args).check()
    except Pending as error:
        report = dict(schema=1, status='PENDING', phase=args.phase, releaseAssetsStatus='RETIRED',
                      detail=str(error), publicationAuthorized=False)
    except (ValueError, OSError, KeyError, TypeError, AttributeError, subprocess.SubprocessError) as error:
        report = dict(schema=1, status='FAIL', error=str(error), publicationAuthorized=False)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return {'PASS': 0, 'FAIL': 1, 'PENDING': 2}[report['status']]


if __name__ == '__main__':
    sys.exit(main())
