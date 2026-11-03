"""Verify the actual Windows EXE contains the unchanged approved icon frames.
Usage: python scripts/verify_brand_icons.py target/debug/ameow-next.exe [--delivery PATH]
Only reads resources and loads native HICONs; does not start the application.
"""
import argparse
import ctypes as c
from ctypes import wintypes as w
import hashlib
import json
from pathlib import Path
import struct


def ico_frames(data):
    reserved, kind, count = struct.unpack_from('<HHH', data)
    assert (reserved, kind) == (0, 1)
    result = {}
    for i in range(count):
        width, height, _, _, planes, depth, size, offset = struct.unpack_from('<BBBBHHII', data, 6 + 16 * i)
        assert width == height and planes == 1 and depth == 32
        result[width or 256] = data[offset:offset + size]
    return result


def verify(exe, delivery=None):
    assets = Path(__file__).resolve().parents[1] / 'assets/brand'
    groups = {1: ico_frames((assets / 'ameow.ico').read_bytes())}
    for resource, folder in [(101, 'follow-appearance/light'), (102, 'follow-appearance/night'),
                             (103, 'ameow-blue'), (104, 'apricot')]:
        groups[resource] = {size: (assets / f'tray/{folder}/{size}.png').read_bytes()
                            for size in [16, 20, 24, 32, 40, 48, 64]}
    assert sorted(groups[1]) == [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
    if delivery:
        assert (assets / 'ameow.ico').read_bytes() == (delivery / 'application/ameow.ico').read_bytes()
        for png in (assets / 'tray').rglob('*.png'):
            assert png.read_bytes() == (delivery / png.relative_to(assets)).read_bytes(), str(png)
        assert (assets / 'source-manifest.json').read_bytes() == (delivery / 'manifest.json').read_bytes()
    kernel, user = c.WinDLL('kernel32', use_last_error=True), c.WinDLL('user32', use_last_error=True)
    kernel.LoadLibraryExW.argtypes = [w.LPCWSTR, w.HANDLE, w.DWORD]
    kernel.LoadLibraryExW.restype = w.HMODULE
    kernel.FindResourceW.argtypes = [w.HMODULE, c.c_void_p, c.c_void_p]
    kernel.FindResourceW.restype = w.HANDLE
    kernel.SizeofResource.argtypes = [w.HMODULE, w.HANDLE]
    kernel.SizeofResource.restype = w.DWORD
    kernel.LoadResource.argtypes = [w.HMODULE, w.HANDLE]
    kernel.LoadResource.restype = w.HANDLE
    kernel.LockResource.argtypes = [w.HANDLE]
    kernel.LockResource.restype = c.c_void_p
    kernel.FreeLibrary.argtypes = [w.HMODULE]
    user.LoadImageW.argtypes = [w.HINSTANCE, c.c_void_p, w.UINT, c.c_int, c.c_int, w.UINT]
    user.LoadImageW.restype = w.HICON
    user.DestroyIcon.argtypes = [w.HICON]
    # Data-file loading reads the PE; it never executes its entry point.
    module = kernel.LoadLibraryExW(str(exe.resolve()), None, 2)
    assert module, f'LoadLibraryExW: {c.get_last_error()}'
    def resource_bytes(kind, number):
        resource = kernel.FindResourceW(module, number, kind)
        assert resource, (kind, number, c.get_last_error())
        return c.string_at(kernel.LockResource(kernel.LoadResource(module, resource)),
                           kernel.SizeofResource(module, resource))
    result = {'exe_sha256': hashlib.sha256(exe.read_bytes()).hexdigest(), 'groups': []}
    try:
        for group, expected in groups.items():
            data = resource_bytes(14, group)  # RT_GROUP_ICON
            reserved, kind, count = struct.unpack_from('<HHH', data)
            assert (reserved, kind, count) == (0, 1, len(expected))
            observed = []
            for i in range(count):
                width, height, _, _, planes, depth, length, number = struct.unpack_from('<BBBBHHIH', data, 6 + 14 * i)
                size = width or 256
                assert width == height and planes == 1 and depth == 32
                frame = resource_bytes(3, number)  # RT_ICON
                assert length == len(frame) and frame == expected[size], (group, size, 'changed frame')
                assert frame[:8] == b'\x89PNG\r\n\x1a\n'
                assert struct.unpack_from('>II', frame, 16) == (size, size)
                handle = user.LoadImageW(module, group, 1, size, size, 0)
                assert handle, (group, size, 'LoadImageW', c.get_last_error())
                user.DestroyIcon(handle)
                observed.append(size)
            result['groups'].append({'resource': group, 'sizes': observed, 'unchanged_pngs': True, 'native_loads': count})
    finally:
        kernel.FreeLibrary(module)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('exe', type=Path)
    parser.add_argument('--delivery', type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.exe, args.delivery), indent=2))
