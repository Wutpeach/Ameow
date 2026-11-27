"""Small policy regressions; media execution is a separate, explicitly scheduled check."""
import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / 'src/download/adapters/yt_dlp/compatible_mp4.py'
spec = importlib.util.spec_from_file_location('compatible_mp4', path)
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class OutputPolicy(unittest.TestCase):
    def setUp(self):
        self.video = dict(codec_type='video', codec_name='h264', pix_fmt='yuv420p', profile='High',
                          width=1920, height=1080, avg_frame_rate='60000/1001', r_frame_rate='60000/1001',
                          nb_frames='600', duration='10.01')
        self.audio = dict(codec_type='audio', codec_name='aac', profile='LC', channels=6)

    def test_copy_and_only_necessary_track_conversion(self):
        ext, args, changed = policy._options([self.video, self.audio])
        self.assertEqual((ext, args, changed), ('mp4', ['-c', 'copy'], False))
        ext, args, changed = policy._options([self.video, dict(self.audio, codec_name='opus')])
        self.assertTrue(changed)
        self.assertNotIn('libx264', args)
        self.assertIn('-c:a:0', args)
        self.assertNotIn('-ac', args)
        _, args, _ = policy._options([dict(self.video, codec_name='vp9'), self.audio])
        self.assertIn('libx264', args)
        self.assertNotIn('-c:a:0', args)
        self.assertNotIn('-r', args)
        self.assertNotIn('-s', args)
        self.assertIn('-enc_time_base:v:0', args)
        self.assertEqual(args[args.index('-enc_time_base:v:0') + 1], 'demux')

    def test_silent_multiple_audio_and_sdr_ten_bit(self):
        self.assertEqual(policy._source([self.video])['audio_channels'], [])
        _, args, _ = policy._options([self.video])
        self.assertNotIn('-c:a:0', args)
        _, args, _ = policy._options([self.video, self.audio, dict(self.audio, codec_name='opus')])
        self.assertNotIn('-c:a:0', args)
        self.assertIn('-c:a:1', args)
        ten_bit = dict(self.video, pix_fmt='yuv420p10le', color_transfer='bt709')
        self.assertFalse(policy._hdr(ten_bit))
        self.assertEqual(policy._options([ten_bit])[0], 'mp4')
        self.assertIn('yuv420p', policy._options([ten_bit])[1])

    def test_hdr_never_becomes_compatibility_conversion(self):
        for extra in [dict(color_transfer='smpte2084'), dict(color_transfer='arib-std-b67'),
                      dict(color_primaries='bt2020'),
                      dict(side_data_list=[dict(side_data_type='DOVI configuration record')])]:
            self.assertEqual(policy._options([dict(self.video, **extra), self.audio]),
                             ('mkv', ['-c', 'copy'], False))
        self.assertTrue(policy._native_hdr(dict(requested_formats=[dict(dynamic_range='HDR10')])) )
        self.assertFalse(policy._native_hdr(dict(dynamic_range='SDR')))

    def test_source_facts_do_not_admit_missing_or_multiple_video(self):
        for streams in [[], [self.audio]]:
            with self.assertRaises(policy.PostProcessingError):
                policy._source(streams)
        source = policy._source([self.video, self.audio, dict(self.audio, channels=2)])
        self.assertEqual(source['audio_channels'], [6, 2])
        self.assertAlmostEqual(source['fps'], 59.94005994)
        self.assertEqual(policy._source([self.video, self.video])['width'], 1920)
        self.assertIsNone(policy._source([dict(self.video, avg_frame_rate='48/1')])['fps'])
        self.assertIsNone(policy._source([dict(self.video, nb_frames=None, duration=None)])['fps'])
        self.assertIsNone(policy._source([dict(self.video, nb_frames='221', duration='8.095')])['fps'])

    def test_bt2020_sdr_does_not_override_hdr_signals(self):
        for transfer in ['bt2020-10', 'bt2020-12', 'bt709', 'smpte170m', 'gamma22']:
            video = dict(self.video, color_primaries='bt2020', color_transfer=transfer)
            self.assertFalse(policy._hdr(video), transfer)
            self.assertEqual(policy._options([video, self.audio]), ('mp4', ['-c', 'copy'], False))
            ten_bit = dict(video, pix_fmt='yuv420p10le')
            self.assertEqual(policy._options([ten_bit])[0], 'mp4')
            self.assertIn('yuv420p', policy._options([ten_bit])[1])
        for transfer in [None, 'unknown', 'smpte2084', 'arib-std-b67']:
            video = dict(self.video, color_primaries='bt2020', color_transfer=transfer)
            self.assertEqual(policy._options([video, self.audio]), ('mkv', ['-c', 'copy'], False))
        sdr = dict(self.video, color_primaries='bt2020', color_transfer='bt2020-10')
        for side in ['Mastering display metadata', 'Content light level metadata',
                     'DOVI configuration record', 'HDR Dynamic Metadata SMPTE2094-40']:
            self.assertEqual(policy._options([dict(sdr, side_data_list=[dict(side_data_type=side)])]),
                             ('mkv', ['-c', 'copy'], False))
        for dynamic_range in ['HDR10', 'HLG', 'DV']:
            preserve = policy._native_hdr(dict(requested_formats=[dict(dynamic_range=dynamic_range)]))
            self.assertEqual(policy._options([sdr], preserve), ('mkv', ['-c', 'copy'], False))


if __name__ == '__main__':
    unittest.main()
