"""Isolated identity/error tests; synthetic packages never assert production signing or GUI PASS."""
import argparse
import copy
import json
from pathlib import Path
import tempfile
import shutil
import unittest
from unittest.mock import patch

import check_release_readiness as checker


class ReleaseReadinessTests(unittest.TestCase):
    template = None

    @classmethod
    def tearDownClass(cls):
        if cls.template:
            cls.template['temp'].cleanup()

    def setUp(self):
        if type(self).template:
            template = type(self).template
            self.temp = tempfile.TemporaryDirectory()
            self.addCleanup(self.temp.cleanup)
            self.root = Path(self.temp.name)
            shutil.copytree(template['root'], self.root, dirs_exist_ok=True)
            self.repo = self.root/'repo'
            self.real_run = checker.run
            self.head, self.tree = template['head'], template['tree']
            self.app, self.assets, self.evidence = copy.deepcopy(template['data'])
            self.args = argparse.Namespace(repo=self.repo, assets=self.root/'ASSETS.json',
                                           evidence=self.root/'evidence.json', version='1.2.3', commit=self.head, phase='release')
            self.start_mock()
            return
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        self.real_run = checker.run
        self.git('init', '-b', 'main')
        self.git('config', 'core.autocrlf', 'false')
        self.git('remote', 'add', 'origin', 'https://github.com/example/Ameow.git')
        sources = {
            'Cargo.toml': '[package]\nname="ameow"\nversion="1.2.3"\n',
            'Cargo.lock': '[[package]]\nname="ameow"\nversion="1.2.3"\n',
            'rust-toolchain.toml': '[toolchain]\nchannel="1.98.1"\n',
            'browser-extension/manifest.json': '{"version":"1.2.3"}',
            'browser-extension/package.json': '{"version":"1.2.3"}',
            'browser-extension/package-lock.json': '{"version":"1.2.3","packages":{"":{"version":"1.2.3"}}}',
            'src/main.rs': 'fn main() {}\n',
            'distribution/macos-license-inputs.json': '{"synthetic":true}',
        }
        package_paths = ['scripts/package_portable.ps1', 'scripts/package_windows.ps1',
                         'scripts/package_macos.sh', '.github/workflows/rust.yml',
                         'distribution/ameow.iss', 'site/public/ameow-logo.png']
        for name, data in sources.items():
            self.write(self.repo / name, data.encode())
        for name in package_paths:
            self.write(self.repo / name, b'synthetic input\n')
        self.commit()
        self.head = self.git('rev-parse', 'HEAD')
        self.tree = self.git('rev-parse', 'HEAD^{tree}')
        self.args = argparse.Namespace(repo=self.repo, assets=self.root/'ASSETS.json',
                                       evidence=self.root/'evidence.json', version='1.2.3', commit=self.head, phase='release')
        self.app = self.record('app', b'synthetic executable')
        identity = dict(version='1.2.3', commit=self.head, tree=self.tree)
        source_records = [self.record(n, (self.repo/n).read_bytes()) for n in sorted(sources)]
        source_digest = checker.digest(json.dumps(source_records, ensure_ascii=False, separators=(',', ':')).encode())
        inputs = dict(baselineHead=self.head, baselineTree=self.tree, dirty=False,
                      sourceAndResources=source_records, sourceInventorySha256=source_digest,
                      packagingInputs=[self.record(n, (self.repo/n).read_bytes()) for n in package_paths])
        build = dict(identity, schema=3, target=checker.WINDOWS, dirty=False, app=self.app, launcher=self.app, cli=self.app,
                     browser=[dict(self.app, path='ameow-browser-host.exe')],
                     source_sha256=source_digest, cargo_lock_sha256=checker.digest((self.repo/'Cargo.lock').read_bytes()))
        self.assets = dict(identity, mac={'app': self.app},
                           windows=dict(app=self.app, launcher=self.app, cli=self.app, host=self.app, sourceSha256=source_digest,
                                        cargoLockSha256=build['cargo_lock_sha256']), assets=[],
                           ci={'rust':'https://github.com/example/Ameow/actions/runs/1',
                               'docs':'https://github.com/example/Ameow/actions/runs/2'})
        mac_verified = {}
        for name, target in checker.expected_assets('1.2.3').items():
            if name.endswith('.json'):
                continue
            data = ('synthetic package '+name).encode()
            self.write(self.root/name, data)
            self.assets['assets'].append(dict(self.record(name, data), name=name, relativePath=name, target=target))
        for suffix, target in [('windows-x64', checker.WINDOWS), ('macos-arm64', checker.MAC)]:
            package = next(a for a in self.assets['assets'] if a['name'] == f'Ameow-1.2.3-{suffix}.zip')
            payload = dict(schema=1, product='Ameow', channel='stable', target=target, version='1.2.3', sequence=1,
                           issued=1, url=f'https://example.invalid/{package["name"]}',
                           package_bytes=package['bytes'], package_sha256=package['sha256'],
                           exe_bytes=self.app['bytes'], exe_sha256=self.app['sha256'])
            name = f'ameow-update-{suffix}.json'
            self.json(name, {'payload':json.dumps(payload), 'signature':'synthetic-not-a-signature'})
            self.assets['assets'].append(dict(self.record(name, (self.root/name).read_bytes()),
                                               name=name, relativePath=name, target=target))
            if target == checker.MAC:
                mac_verified = dict(payload, status='signature-and-package-verified', source=self.head)
        assets_by_name = {a['name']:a for a in self.assets['assets']}
        delivery = dict(build=build, fixture=False, members=[self.app],
                        installerSource=dict(commit=self.head, tree=self.tree, dirty=False),
                        installerDefinition=self.record('distribution/ameow.iss', b'synthetic input\n'),
                        packaging=self.record('scripts/package_windows.ps1', b'synthetic input\n'), installerResources=[])
        for key, name in zip(('installer','portable','update','manifest'), list(checker.expected_assets('1.2.3'))[:4]):
            a = assets_by_name[name]
            delivery[key] = {k:a[k] for k in ('path','bytes','sha256')}
        verified = dict(build=build, fixture=False, members=[self.app], update=delivery['update'], portable=delivery['portable'])
        for name, data in [('build.json', build), ('inputs.json', inputs), ('delivery.json', delivery),
                           ('verified.json', verified), ('mac-verified.json', mac_verified)]:
            self.json(name, data)
        self.write(self.root/'report.txt', b'Synthetic evidence; no real acceptance or signing performed.')
        self.evidence = dict(schema=1, identity=identity,
                             windows=dict(build='build.json', inputs='inputs.json', delivery='delivery.json', verified='verified.json'),
                             mac=dict(inputs='inputs.json', verified='mac-verified.json'),
                             records=[dict(id=n, status='PASS', note='Synthetic fixture only', commit=self.head,
                                           files=[dict(path='report.txt',sha256=checker.digest((self.root/'report.txt').read_bytes()))])
                                      for n in checker.REQUIRED])
        self.save()
        type(self).template = dict(temp=self.temp, root=self.root, head=self.head, tree=self.tree,
                                   data=copy.deepcopy((self.app, self.assets, self.evidence)))
        # The reusable template stays immutable; each test mutates its own copy.
        self.setUp()

    def start_mock(self):
        self.ci_status = 'success'
        self.ci_head = self.head
        self.ci_overrides = {}
        self.mock = patch.object(checker, 'run', side_effect=self.run_command)
        self.mock.start()
        self.addCleanup(self.mock.stop)

    def write(self, path, data):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def json(self, name, value):
        (self.root/name).write_text(json.dumps(value), encoding='utf-8')

    def record(self, name, data):
        return dict(path=name, bytes=len(data), sha256=checker.digest(data))

    def git(self, *args):
        return self.real_run(['git', *args], self.repo)

    def commit(self):
        self.git('add', '.')
        self.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture')

    def save(self):
        self.json('ASSETS.json', self.assets)
        self.evidence['identity']['assetsSha256'] = checker.digest(self.args.assets.read_bytes())
        self.json('evidence.json', self.evidence)

    def run_command(self, args, cwd):
        if args[:2] == ['git', 'ls-remote']:
            return self.git('rev-parse', 'HEAD') + '\trefs/heads/main'
        if args[:2] == ['gh', 'api']:
            workflow = 'rust.yml' if args[-1].endswith('/1') else 'deploy-docs.yml'
            receipt = dict(head_sha=self.ci_head, head_branch='main',
                           event='workflow_dispatch' if workflow == 'rust.yml' else 'push',
                           repository=dict(full_name='example/Ameow'), head_repository=dict(full_name='example/Ameow'),
                           path=f'.github/workflows/{workflow}', status='completed',
                           conclusion=self.ci_status, run_attempt=1)
            return json.dumps(dict(receipt, **self.ci_overrides))
        return self.real_run(args, cwd)

    def test_complete_and_pending_are_distinct(self):
        self.assertEqual(checker.Check(self.args).check()['status'], 'PASS')
        next(r for r in self.evidence['records'] if r['id']=='windows.paste')['status']='PENDING'
        self.save()
        with self.assertRaises(checker.Pending): checker.Check(self.args).record('windows.paste')
        next(r for r in self.evidence['records'] if r['id']=='windows.paste')['status']='FAIL'
        self.save()
        with self.assertRaises(ValueError): checker.Check(self.args).record('windows.paste')

    def test_wrong_version_candidate_and_evidence(self):
        check = checker.Check(self.args)
        check.args.version = '9.9.9'
        with self.assertRaises(ValueError): check.candidate()
        check.args.version = '1.2.3'
        check.assets['commit'] = '0'*40
        with self.assertRaises(ValueError): check.candidate()
        check.evidence['identity']['assetsSha256'] = '0'*64
        with self.assertRaises(ValueError): check.evidence_identity()

    def test_missing_and_tampered_assets(self):
        check = checker.Check(self.args)
        path = self.root/self.assets['assets'][0]['relativePath']
        original = path.read_bytes()
        path.unlink()
        with self.assertRaises(FileNotFoundError): check.asset_files()
        path.write_bytes(original+b'tampered')
        with self.assertRaises(ValueError): check.asset_files()

    def test_failed_wrong_head_and_unavailable_ci(self):
        check = checker.Check(self.args)
        self.ci_status = 'failure'
        with self.assertRaises(ValueError): check.ci('rust')
        self.ci_status, self.ci_head = 'success', '0'*40
        with self.assertRaises(ValueError): check.ci('docs')
        def unavailable(args, cwd):
            if args[:2] == ['gh', 'api']:
                raise FileNotFoundError('gh unavailable')
            return self.run_command(args, cwd)
        with patch.object(checker, 'run', side_effect=unavailable):
            with self.assertRaises(checker.Pending): check.ci('rust')

    def test_exact_main_manual_and_historical_push_ci(self):
        check = checker.Check(self.args)
        for event in ('workflow_dispatch', 'push'):
            with self.subTest(event=event):
                self.ci_overrides = dict(event=event)
                self.assertEqual(check.ci('rust')['head'], self.head)
        self.assertEqual(check.ci('docs')['conclusion'], 'success')

    def test_manual_ci_rejects_wrong_identity_event_and_incomplete_results(self):
        check = checker.Check(self.args)
        for change in (dict(head_sha='0'*40), dict(head_branch='topic'),
                       dict(repository=dict(full_name='other/Ameow')),
                       dict(head_repository=dict(full_name='fork/Ameow')),
                       dict(event='pull_request'), dict(event='workflow_run'),
                       dict(path='.github/workflows/deploy-docs.yml'),
                       dict(conclusion='failure'), dict(conclusion='cancelled'), dict(conclusion='skipped')):
            with self.subTest(change=change):
                self.ci_overrides = change
                with self.assertRaises(ValueError): check.ci('rust')
        for status in ('queued', 'in_progress'):
            with self.subTest(status=status):
                self.ci_overrides = dict(status=status, conclusion=None)
                with self.assertRaises(checker.Pending): check.ci('rust')
        self.ci_overrides = dict(event='workflow_dispatch')
        with self.assertRaises(ValueError): check.ci('docs')
        self.ci_overrides = {}
        check.assets['ci']['rust'] = 'https://github.com/other/Ameow/actions/runs/1'
        with self.assertRaises(ValueError): check.ci('rust')

    def test_docs_tools_can_follow_product_but_inputs_cannot(self):
        self.write(self.repo/'scripts/check_release_readiness.py', b'# tool\n')
        self.write(self.repo/'docs/guide.md', b'Updated guide\n')
        self.commit()
        self.assertFalse(checker.Check(self.args).followups()['rebuildRequired'])
        with self.assertRaises(checker.Pending): checker.Check(self.args).record('docs')
        self.write(self.repo/'src/main.rs', b'fn main() { panic!() }\n')
        with self.assertRaises(ValueError): checker.Check(self.args).followups()
        (self.repo/'src/main.rs').write_bytes(b'fn main() {}\n')
        self.write(self.repo/'new-input.cfg', b'unknown')
        with self.assertRaises(checker.Pending): checker.Check(self.args).followups()

    def test_missing_input_and_changed_report(self):
        inputs = checker.load_json(self.root/'inputs.json')
        inputs['packagingInputs'] = []
        self.json('inputs.json', inputs)
        with self.assertRaises(ValueError): checker.Check(self.args).inputs('windows')
        self.write(self.root/'report.txt', b'changed after acceptance')
        with self.assertRaises(ValueError): checker.Check(self.args).record('user-acceptance')

    def test_mac_original_combined_input_receipt(self):
        inputs = checker.load_json(self.root/'inputs.json')
        sources = inputs['sourceAndResources'] + [r for r in inputs['packagingInputs']
                   if r['path'] in ('scripts/package_macos.sh', 'site/public/ameow-logo.png')]
        receipt = dict(commit=self.head, tree=self.tree, dirty=False, source=sources,
                       cargoLockSha256=checker.digest((self.repo/'Cargo.lock').read_bytes()))
        def save():
            receipt['sourceInventorySha256'] = checker.digest(json.dumps(receipt['source'], ensure_ascii=False,
                                                                         separators=(',', ':')).encode())
            self.json('mac-combined.json', receipt)
        save()
        self.evidence['mac']['inputs'] = 'mac-combined.json'
        self.save()
        self.assertEqual(checker.Check(self.args).inputs('mac')['format'], 'mac-combined')
        receipt['source'] = [r for r in sources if r['path'] != 'scripts/package_macos.sh']
        save()
        with self.assertRaises(ValueError): checker.Check(self.args).inputs('mac')
        receipt['source'] = copy.deepcopy(sources)
        receipt['source'][0]['sha256'] = '0'*64
        save()
        with self.assertRaises(ValueError): checker.Check(self.args).inputs('mac')

    def test_mixed_verification_and_mac_feed(self):
        verified = checker.load_json(self.root/'verified.json')
        verified['build']['commit'] = '0'*40
        self.json('verified.json', verified)
        with self.assertRaises(ValueError): checker.Check(self.args).packaging('windows')
        feed = checker.load_json(self.root/'ameow-update-macos-arm64.json')
        payload = json.loads(feed['payload'])
        payload['sequence'] = 99
        feed['payload'] = json.dumps(payload)
        self.json('ameow-update-macos-arm64.json', feed)
        with self.assertRaises(ValueError): checker.Check(self.args).feeds()

    def test_raw_report_and_asset_declaration_cannot_relabel_old_candidate(self):
        self.json('old-report.json', dict(version='0.0.1', commit='0'*40, app_sha256='0'*64))
        record = next(r for r in self.evidence['records'] if r['id']=='windows.download')
        record['files'] = [dict(path='old-report.json', sha256=checker.digest((self.root/'old-report.json').read_bytes()))]
        self.save()
        with self.assertRaises(ValueError): checker.Check(self.args).record('windows.download')
        self.assets['windows']['app'] = dict(self.app, sha256='0'*64)
        self.save()
        with self.assertRaises(ValueError): checker.Check(self.args).packaging('windows')

    def test_source_acceptance_has_no_release_asset_prerequisite(self):
        self.args.phase, self.args.assets = 'source', None
        for record in self.evidence['records']:
            if record['id'] != 'docs':
                record['source'] = dict(kind='development', version='1.2.3', commit=self.head, tree=self.tree,
                                        buildInputsMatch=True,
                                        app=dict(path=str(self.repo/'target/debug/ameow.exe'), sha256=self.app['sha256']))
        self.evidence['phase'] = 'source'
        self.json('evidence.json', self.evidence)
        (self.root/'ASSETS.json').unlink()
        result = checker.Check(self.args).check()
        self.assertEqual(result['status'], 'PASS')
        self.assertEqual(result['releaseAssetsStatus'], 'NOT_PREPARED')
        self.assertFalse(result['publicationAuthorized'])
        self.assertFalse(any(c['id'] in ('assets', 'feeds', 'windows.packaging', 'ci.rust') for c in result['checks']))

    def test_retired_evidence_does_not_request_recreated_packages(self):
        self.evidence['status'] = 'RETIRED'
        self.json('evidence.json', self.evidence)
        (self.root/'ASSETS.json').unlink()
        with self.assertRaises(checker.Pending): checker.Check(self.args)

    def test_development_functional_evidence_uses_its_own_executable(self):
        self.write(self.repo/'scripts/check_release_readiness.py', b'# tool-only followup\n')
        self.commit()
        commit, tree = self.git('rev-parse', 'HEAD'), self.git('rev-parse', 'HEAD^{tree}')
        app = dict(path=str(self.repo/'target/debug/ameow.exe'), sha256=checker.digest(b'development executable'))
        self.json('development-run.json', dict(version='1.2.3', commit=commit, tree=tree, app_sha256=app['sha256']))
        record = next(r for r in self.evidence['records'] if r['id']=='windows.paste')
        record['source'] = dict(kind='development', version='1.2.3', commit=commit, tree=tree,
                                buildInputsMatch=True, app=copy.deepcopy(app))
        record['files'] = [dict(path='development-run.json', sha256=checker.digest((self.root/'development-run.json').read_bytes()))]
        self.save()
        self.assertEqual(checker.Check(self.args).record('windows.paste')['source']['kind'], 'development')
        check = checker.Check(self.args)
        with self.assertRaises(ValueError):
            check.report_identity('windows.paste', record, dict(dirty=True, buildInputsMatch=False))
        with self.assertRaises(ValueError):
            check.report_identity('windows.paste', record, dict(dirty=True, dirtyPaths=['src/main.rs']))
        check.report_identity('windows.paste', record, dict(dirty=True, dirtyPaths=['AGENTS.md']))
        self.write(self.repo/'scripts/package_windows.ps1', b'# packaging-only change\n')
        self.commit()
        record['source'].update(commit=self.git('rev-parse', 'HEAD'), tree=self.git('rev-parse', 'HEAD^{tree}'))
        check = checker.Check(self.args)
        check.functional_source('windows.paste', record)
        self.write(self.repo/'site/public/ameow-logo.png', b'changed Mac App resource')
        self.commit()
        record['source'].update(commit=self.git('rev-parse', 'HEAD'), tree=self.git('rev-parse', 'HEAD^{tree}'))
        check = checker.Check(self.args)
        check.functional_source('windows.paste', record)
        with self.assertRaises(ValueError): check.functional_source('mac.paste', record)
        self.write(self.repo/'unknown-build.cfg', b'needs classification')
        self.commit()
        record['source'].update(commit=self.git('rev-parse', 'HEAD'), tree=self.git('rev-parse', 'HEAD^{tree}'))
        with self.assertRaises(checker.Pending): checker.Check(self.args).functional_source('windows.paste', record)
        (self.repo/'unknown-build.cfg').unlink()
        self.commit()
        record['source'].update(commit=commit, tree=tree)
        record['source']['app']['sha256'] = '0'*64
        self.save()
        with self.assertRaises(ValueError): checker.Check(self.args).record('windows.paste')
        record['source']['app'] = app
        self.write(self.repo/'src/main.rs', b'fn main() { panic!() }\n')
        self.commit()
        record['source'].update(commit=self.git('rev-parse', 'HEAD'), tree=self.git('rev-parse', 'HEAD^{tree}'))
        self.save()
        with self.assertRaisesRegex(ValueError, 'Functional source changes'): checker.Check(self.args).record('windows.paste')

    def test_crlf_is_explained_not_arbitrary_content(self):
        record = self.record('text', b'line\r\n')
        self.assertTrue(checker.source_match(record, b'line\n'))
        self.assertFalse(checker.source_match(record, b'other\n'))
        self.assertFalse(checker.source_match(self.record('binary', b'\0\r\n'), b'\0\n'))


if __name__ == '__main__':
    unittest.main()
