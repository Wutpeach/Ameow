"""Checks preservation of legal words and rejection of corrupt source material."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest

import compact_licenses as notices


class CompactLicenses(unittest.TestCase):
    def test_checked_output_reproduces_all_original_terms_and_source_mappings(self):
        self.assertEqual(notices.generate(), (notices.ROOT / notices.OUTPUT).read_bytes())

    def test_identical_texts_are_shared_but_distinct_copyrights_are_retained(self):
        texts = notices.Texts()
        first = texts.add('Copyright One\n\nPermission is granted.\n\nNo warranty.')
        second = texts.add('Copyright Two\n\nPermission\nis granted.\n\nNo warranty.')
        self.assertNotEqual(first, second)
        self.assertEqual(first, texts.add('Copyright One\nPermission is granted. No warranty.'))
        self.assertEqual(len(texts.texts), 2)
        output = texts.render()
        self.assertIn('Copyright One', output)
        self.assertIn('Copyright Two', output)
        self.assertEqual(output.count('Permission is granted.'), 2)

    def test_original_corruption_cannot_be_silently_accepted(self):
        inputs = json.loads((notices.ROOT / notices.INPUTS).read_text())
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for source in [notices.INPUTS, 'Cargo.lock'] + [r['path'] for r in inputs['sources']]:
                destination = root / source
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(notices.ROOT / source, destination)
            target = root / inputs['sources'][1]['path']
            target.write_bytes(target.read_bytes().replace(b'Permission', b'FORBIDDEN', 1))
            with self.assertRaisesRegex(ValueError, 'Input changed:'):
                notices.generate(root)

    def test_original_body_anchor_and_unexpected_html_fail_closed(self):
        package = {'texts': [{'sha256': 'a' * 64}]}
        with self.assertRaisesRegex(ValueError, 'Original license hash mismatch:'):
            notices.dependency_bodies(b'===== SHA256 ' + b'a' * 64 + b' =====\n\nchanged', [package])
        parser = notices.StandardLibrary(notices.Texts())
        with self.assertRaisesRegex(ValueError, 'Unexpected standard-library tag:'):
            parser.feed('<body><script>changed</script></body>')

    def test_lock_checkout_line_endings_preserve_output_but_content_changes_fail(self):
        inputs = json.loads((notices.ROOT / notices.INPUTS).read_text())
        expected = notices.generate()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for source in [notices.INPUTS, 'Cargo.lock'] + [r['path'] for r in inputs['sources']]:
                destination = root / source
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(notices.ROOT / source, destination)
            lock = root / 'Cargo.lock'
            lf = lock.read_bytes().replace(b'\r\n', b'\n')
            for representation in [lf, lf.replace(b'\n', b'\r\n')]:
                lock.write_bytes(representation)
                self.assertEqual(notices.generate(root), expected)
            tampered = lf.replace(b'version = "', b'version = "tampered-', 1)
            self.assertNotEqual(tampered, lf)
            lock.write_bytes(tampered)
            with self.assertRaisesRegex(ValueError, 'Cargo.lock changed;'):
                notices.generate(root)


if __name__ == '__main__':
    unittest.main()
