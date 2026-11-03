"""Small image-behavior tests for the native regression sampling helpers."""
import unittest

from PIL import Image, ImageDraw
from windows_validate import action_pixels, feedback_pixels, glyph_margins, radial_profile


class NativeImageChecks(unittest.TestCase):
    def test_light_disc_corners_do_not_count_as_white_glyph(self):
        image = Image.new('RGB', (16, 16), 'white')
        draw = ImageDraw.Draw(image)
        draw.ellipse((0, 0, 15, 15), fill=(227, 71, 76))
        self.assertIsNone(glyph_margins(image, 1))
        draw.rectangle((5, 5, 10, 10), fill='white')
        self.assertEqual(glyph_margins(image, 1), [5,5,5,5])
        draw.rectangle((1, 7, 2, 8), fill='white')
        self.assertEqual(min(glyph_margins(image, 1)), 1)

    def test_hover_disc_and_white_glyph_are_distinct_from_quiet_default(self):
        quiet = Image.new('RGB', (16, 16), (255, 255, 255))
        self.assertEqual(action_pixels(quiet)['red_pixels'], 0)
        hover = Image.new('RGB', (16, 16), (227, 71, 76))
        ImageDraw.Draw(hover).rectangle((5, 5, 10, 10), fill='white')
        self.assertEqual(action_pixels(hover), {'red_pixels': 220, 'white_pixels': 36})

    def test_feedback_requires_both_a_changed_icon_and_restoration(self):
        original = Image.new('RGB', (16, 16), 'white')
        changed = original.copy()
        changed.putpixel((8, 8), (0, 0, 0))
        self.assertTrue(all(feedback_pixels(original, changed, original).values()))
        self.assertFalse(feedback_pixels(original, original, original)['feedback_icon_changed'])
        self.assertFalse(feedback_pixels(original, changed, changed)['original_copy_restored'])

    def test_radial_samples_follow_native_dpi_without_moving_ring(self):
        for scale in (1, 1.25, 1.5, 2):
            image = Image.new('RGB', (round(160*scale),)*2, (40, 40, 40))
            center = (80*scale,)*2
            draw = ImageDraw.Draw(image)
            r = 28*scale
            draw.ellipse((center[0]-r-2*scale, center[1]-r-2*scale, center[0]+r+2*scale, center[1]+r+2*scale), fill=(90, 60, 40))
            draw.ellipse((center[0]-r+2*scale, center[1]-r+2*scale, center[0]+r-2*scale, center[1]+r-2*scale), fill=(40, 40, 40))
            self.assertTrue(all(v==50 for v in radial_profile(image, center, 28, scale, (40,40,40))))
            self.assertTrue(all(v==0 for v in radial_profile(image, center, 56, scale, (40,40,40))))


if __name__ == '__main__':
    unittest.main()
