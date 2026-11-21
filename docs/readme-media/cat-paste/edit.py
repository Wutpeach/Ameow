"""Apply the documented, non-interpolating edit to recorded Gallery GIFs."""
import argparse
import hashlib
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'docs/images/readme'
CROP = (40, 40, 440, 440)
RAW_HASHES = {
    'desktop-cat-raw.gif': '724AA5EAF7934A9FD98A26464FC3E5F35635FC384FB63E195EC814CC421AF68F',
    'paste-link-raw.gif': 'E431CE73011ECA5D3794DBBB75C987F2F0A80B43947C4AEEFD0D1970617842E4',
}

def read_frames(path):
    image = Image.open(path)
    frames, durations = [], []
    for i in range(image.n_frames):
        image.seek(i)
        frames.append(image.convert('RGB').copy())
        durations.append(image.info['duration'])
    return frames, durations

def frame_at(frames, durations, millis):
    elapsed = 0
    for frame, duration in zip(frames, durations):
        elapsed += duration
        if millis < elapsed:
            return frame
    return frames[-1]

def edit(work):
    for filename, expected in RAW_HASHES.items():
        actual = hashlib.sha256((work / filename).read_bytes()).hexdigest().upper()
        if actual != expected:
            raise ValueError(f'{filename} does not match the reviewed recording')
    cat, delays = read_frames(work / 'desktop-cat-raw.gif')
    starts, elapsed = [], 0
    for duration in delays:
        starts.append(elapsed)
        elapsed += duration
    # These two 50ms samples have missing compositor content in this capture.
    remove = {1850, 1900}
    if not all(t in starts and delays[starts.index(t)] == 50 for t in remove):
        raise ValueError('Expected 50ms capture samples were not found; review the raw GIF')
    kept = [(frame, delay) for frame, delay, start in zip(cat, delays, starts) if start not in remove]
    frames, durations = zip(*[(frame.crop(CROP), delay) for frame, delay in kept])
    frames[0].save(OUT / 'desktop-cat.gif', save_all=True, append_images=frames[1:],
                   duration=list(durations), loop=0, optimize=True, disposal=2)
    frame_at(frames, durations, 5400).save(OUT / 'desktop-cat-poster.png')
    paste, paste_delays = read_frames(work / 'paste-link-raw.gif')
    paste = [frame.crop(CROP) for frame in paste]
    paste[0].save(OUT / 'paste-link.gif', save_all=True, append_images=paste[1:],
                  duration=paste_delays, loop=0, optimize=True, disposal=2)
    frame_at(paste, paste_delays, 5500).save(OUT / 'paste-link-poster.png')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('work', type=Path)
    edit(parser.parse_args().work)
