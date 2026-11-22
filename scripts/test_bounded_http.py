"""Offline contract tests for the embedded yt-dlp postprocessor."""
import copy
import importlib.util
import math
from pathlib import Path
import sys
import types
import unittest

common = types.ModuleType('yt_dlp.postprocessor.common')
class PostProcessor:
    def to_screen(self, text, prefix=True):
        self.messages.append(text)
    def get_param(self, key, default=None):
        return getattr(self, 'params', {}).get(key, default)
common.PostProcessor = PostProcessor
sys.modules.update({'yt_dlp': types.ModuleType('yt_dlp'),
                    'yt_dlp.postprocessor': types.ModuleType('yt_dlp.postprocessor'),
                    'yt_dlp.postprocessor.common': common})
path = Path(__file__).resolve().parents[1] / 'src/download/adapters/yt_dlp/bounded_http.py'
spec = importlib.util.spec_from_file_location('bounded_http', path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def fixture():
    return {'extractor_key': 'Youtube', '_type': 'video', 'section_start': 30.0, 'section_end': 155.0,
            'live_status': 'not_live', 'is_live': False, 'id': 'public-id',
            'http_headers': {'Authorization': 'SYNTHETIC_SECRET'},
            'downloader_options': {'ffmpeg_args': ['-user_agent', 'synthetic']},
            'requested_formats': [
                {'protocol': 'https', 'url': 'https://video.example/a?token=secret', 'vcodec': 'h264'},
                {'protocol': 'https', 'url': 'https://audio.example/b?token=secret', 'acodec': 'opus',
                 'downloader_options': {'ffmpeg_args': ['-reconnect', '1'], 'unrelated': True}}]}

class BoundedHttpTests(unittest.TestCase):
    def run_pp(self, info):
        pp = mod.AmeowBoundedHttpPP()
        pp.messages = []
        deleted, result = pp.run(info)
        self.assertEqual(deleted, [])
        self.assertIs(result, info)
        self.assertEqual(len(pp.messages), 1)
        self.assertNotIn('secret', pp.messages[0].lower())
        return pp.messages[0]

    def test_multitrack_preserves_effective_fallback_and_fields(self):
        info = fixture()
        original = copy.deepcopy(info)
        self.assertEqual(self.run_pp(info), 'AMEOW_BOUNDED_HTTP=applied')
        first, second = info['requested_formats']
        self.assertEqual(first['downloader_options']['ffmpeg_args'], ['-user_agent', 'synthetic', '-request_size', '8388608'])
        self.assertEqual(second['downloader_options']['ffmpeg_args'], ['-reconnect', '1', '-request_size', '8388608'])
        self.assertTrue(second['downloader_options']['unrelated'])
        first.pop('downloader_options')
        second['downloader_options']['ffmpeg_args'] = ['-reconnect', '1']
        self.assertEqual(info, original)

    def test_single_stream_and_zero_start(self):
        info = fixture()
        info.pop('requested_formats')
        info.update(protocol='https', url='https://video.example/media', section_start=0)
        self.assertTrue(self.run_pp(info).endswith('applied'))
        self.assertEqual(info['downloader_options']['ffmpeg_args'][-2:], mod._REQUEST)

    def test_reselected_hls_mixed_unknown_and_manifest_never_mutate(self):
        changes = [lambda x: x['requested_formats'][1].update(protocol='m3u8_native'),
                   lambda x: x['requested_formats'][1].pop('protocol'),
                   lambda x: x['requested_formats'][1].update(protocol='http'),
                   lambda x: x['requested_formats'][1].update(url='http://example.org/'),
                   lambda x: x['requested_formats'][1].update(fragments=[{'url':'x'}]),
                   lambda x: x['requested_formats'][1].update(manifest_url='https://example.org/a'),
                   lambda x: x.update(requested_formats=[]),
                   lambda x: x.update(extractor_key='Generic'),
                   lambda x: x.update(_type='playlist'),
                   lambda x: x.update(is_live=True),
                   lambda x: x.update(live_status='is_live'),
                   lambda x: x.update(section_start=math.nan),
                   lambda x: x.update(section_end=math.inf),
                   lambda x: x.update(section_start=True),
                   lambda x: x.update(section_end=30),
                   lambda x: x.pop('section_end')]
        for change in changes:
            with self.subTest(change=change):
                info = fixture(); change(info); original = copy.deepcopy(info)
                self.assertTrue(self.run_pp(info).endswith('not_applicable'))
                self.assertEqual(info, original)

    def test_conflict_is_atomic_including_fallback(self):
        changes = [lambda x: x['requested_formats'][1]['downloader_options'].update(ffmpeg_args=['-request_size', '5']),
                   lambda x: x['requested_formats'][1].update(downloader_options={'ffmpeg_args': '-bad'}),
                   lambda x: x['downloader_options'].update(ffmpeg_args=['-request_size=5']),
                   lambda x: x.update(http_headers={'Range':'bytes=0-9'}),
                   lambda x: x['requested_formats'][1].update(http_headers={'range':'bytes=0-9'}),
                   lambda x: x['requested_formats'][1].update(downloader_options=3)]
        for change in changes:
            with self.subTest(change=change):
                info = fixture(); change(info); original = copy.deepcopy(info)
                self.assertIn(self.run_pp(info).split('=')[-1], ('conflict', 'not_applicable'))
                self.assertEqual(info, original)

    def test_precise_uses_the_same_input_policy_without_changing_encoder_settings(self):
        info = fixture()
        original = copy.deepcopy(info)
        pp = mod.AmeowBoundedHttpPP()
        pp.messages = []
        pp.params = {'force_keyframes_at_cuts': True, 'external_downloader_args': {'ffmpeg_o':['-c:v','libx264','-preset','faster','-crf','18']}}
        original_params = copy.deepcopy(pp.params)
        pp.run(info)
        self.assertEqual(pp.messages, ['AMEOW_BOUNDED_HTTP=applied'])
        self.assertEqual(pp.params, original_params)
        info['requested_formats'][0].pop('downloader_options')
        info['requested_formats'][1]['downloader_options']['ffmpeg_args'] = ['-reconnect', '1']
        self.assertEqual(info, original)

if __name__ == '__main__':
    unittest.main()
