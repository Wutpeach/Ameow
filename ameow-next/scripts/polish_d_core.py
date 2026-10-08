"""Run the historical observable native suite with B selected at launch."""
from pathlib import Path
import subprocess
import windows_validate


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    original = subprocess.Popen

    def launch(args, *positional, **kwargs):
        # Only this suite's owned prototype launch is intercepted.
        if args and Path(args[0]).name.lower() == 'ameow-next.exe':
            args = list(args) + ['--magnetic', 'b']
        return original(args, *positional, **kwargs)

    subprocess.Popen = launch
    try:
        raise SystemExit(windows_validate.validate(root / 'target/release/ameow-next.exe', root / 'evidence/polish-d/core-b'))
    finally:
        subprocess.Popen = original
