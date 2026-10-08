"""Reuse historical native replay, with explicit longer duration-spring holds.
The old script is unchanged. Both prior/current B receive this exact trace.
"""
import argparse
from pathlib import Path
import polish_d_run as replay
from repair_a_runtime import u, w

original_trace = replay.trace
original_runtime = replay.MagneticRuntime

def nested_trace():
    holds = {'edge-hold': .95, 'stationary': 1.2, 'centre-return': 1.0}
    return [(name, x, y, holds.get(name, duration))
            for name, x, y, duration in original_trace()]

class DurationRuntime(original_runtime):
    recording = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.recording:
            original_update = self.backdrop.update
            def update():
                original_update()
                # Same owned HWND guard as the original core motion recorder.
                # Backdrop updates may change topmost order without changing focus.
                u.SetWindowPos(self.hwnd,w.HWND(-1),0,0,0,0,0x13)
            self.backdrop.update = update

    def capture_guard(self, image):
        super().capture_guard(image)
        if self.recording:
            pixels = [image.getpixel(p)[:3] for p in [(100,70),(140,70),(100,90),(140,90)]]
            if not any(max(abs(v-232) for v in pixel)>14 for pixel in pixels):
                raise RuntimeError('Full Surface is obscured by capture backdrop; recording rejected')

    def wait(self, duration, capture=None):
        # Historical run's retained-leave hold: allow reference duration800ms.
        return super().wait(1.05 if duration == .65 else duration, capture)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--exe', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--variant', choices=['a', 'b'], default='b')
    parser.add_argument('--night', action='store_true')
    parser.add_argument('--visual', action='store_true')
    args = parser.parse_args()
    DurationRuntime.recording = args.visual
    replay.trace = nested_trace
    replay.MagneticRuntime = DurationRuntime
    result = replay.run(args.exe, args.out, args.variant, night=args.night, visual=args.visual)
    raise SystemExit(0 if result['overall'] == 'PASS' else 1)
