"""Capture an owned, visible, unobscured native client; no mouse or activation."""
import argparse
import ctypes as c
from ctypes import wintypes as w
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "ameow-next/scripts"))
from repair_a_runtime import CropCapture

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--pid", type=int, required=True)
parser.add_argument("--hwnd", type=int, required=True)
parser.add_argument("--out", type=Path, required=True)
args = parser.parse_args()
u = c.windll.user32
hwnd = w.HWND(args.hwnd)
owner = w.DWORD()
u.GetWindowThreadProcessId(hwnd, c.byref(owner))
if owner.value != args.pid or not u.IsWindowVisible(hwnd) or u.IsIconic(hwnd):
    raise RuntimeError("Expected owned visible window is unavailable")
rect, origin = w.RECT(), w.POINT(0, 0)
if not u.GetClientRect(hwnd, c.byref(rect)) or not u.ClientToScreen(hwnd, c.byref(origin)):
    raise RuntimeError("Cannot resolve native client bounds")
capture = CropCapture((origin.x, origin.y, origin.x + rect.right, origin.y + rect.bottom))
try:
    capture.grab().save(args.out)
finally:
    capture.close()
print(f"Captured {rect.right}x{rect.bottom} client from PID {args.pid}, HWND {args.hwnd}")
