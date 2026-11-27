"""Native installation regression, restricted to a task-owned fixture delivery.

Optional published archives exercise real old bytes/layouts without starting old
production programs. With --verify-ready the new signed fixture App also runs;
original production programs are never executed.
"""
import argparse
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import winreg
import zipfile
from gallery import OwnedJob

FIXTURE_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Ameow.B.FullUpdate.Validation_is1"
OLD = {
    "0.5.1": "fa3e89fc71a4b2243bbb33ca9a7d94815e839358cf5f8c46738df30868f06885",
    "0.5.2": "eed1bfd780d383e2605bbf39e0dcb562d59b5c0d5b9f7c9d002727c93a81b913",
}

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def guard_fixture_registration():
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, FIXTURE_KEY):
            raise RuntimeError("Fixture AppId exists; do not touch another validation installation")
    except FileNotFoundError:
        pass
    shortcut = Path(os.environ["APPDATA"]) / "Microsoft/Windows/Start Menu/Programs/Ameow B Full Update Validation/Ameow B Full Update Validation.lnk"
    if shortcut.exists():
        raise RuntimeError(f"Fixture shortcut already exists: {shortcut}")

def uninstaller_for(root):
    candidates = [record.with_suffix(".exe") for record in root.glob("unins*.dat")
        if record.with_suffix(".exe").is_file()]
    if len(candidates) != 1:
        raise RuntimeError(f"Expected one owned Inno log/program pair: {root}")
    return candidates[0]

def plain(path):
    for item in (path, *path.parents):
        if item.exists() and item.lstat().st_file_attributes & 0x400:
            raise RuntimeError(f"Reparse target: {item}")

def job_pids(job):
    class ProcessIds(ctypes.Structure):
        _fields_ = [("assigned", wintypes.DWORD), ("count", wintypes.DWORD),
            ("ids", ctypes.c_size_t * 128)]
    kernel = job.kernel
    kernel.QueryInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int,
        wintypes.LPVOID, wintypes.DWORD, wintypes.LPVOID]
    kernel.QueryInformationJobObject.restype = wintypes.BOOL
    values = ProcessIds()
    if not kernel.QueryInformationJobObject(job.handle, 3, ctypes.byref(values), ctypes.sizeof(values), None):
        raise ctypes.WinError(ctypes.get_last_error())
    return list(values.ids[:values.count])

def wait_owned_job(job, timeout=15):
    deadline = time.monotonic() + timeout
    while job_pids(job):
        if time.monotonic() >= deadline:
            raise TimeoutError("Owned installation child processes did not finish")
        time.sleep(.05)

def run(exe, args, log):
    with log.open("w", encoding="utf8") as stream:
        process = subprocess.Popen([str(exe), *args], stdout=stream, stderr=subprocess.STDOUT)
        try:
            job = OwnedJob(process)
        except BaseException:
            process.terminate()
            process.wait(timeout=5)
            raise
        try:
            code = process.wait(timeout=120)
            # Inno's original stub can exit before its temporary second phase
            # finishes usPostUninstall. Do not kill that phase by closing its job.
            wait_owned_job(job)
        finally:
            job.close()
            process.wait(timeout=5)
    if code:
        raise RuntimeError(f"Command failed ({code}): {exe}; see {log}")

def stage_old(archive, version, destination):
    if digest(archive) != OLD[version]:
        raise RuntimeError(f"Published {version} archive identity differs")
    with zipfile.ZipFile(archive) as source:
        for member in source.infolist():
            relative = Path(member.filename)
            if relative.is_absolute() or ".." in relative.parts or "\\" in member.filename or ":" in member.filename:
                raise RuntimeError("Unsafe old archive member")
            target = destination / relative
            plain(target)
            if member.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open("xb") as output:
                    output.write(source.read(member))

def locked_maintenance(root, evidence, label):
    """A real Windows sharing failure must leave a retryable installation."""
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
        wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    kernel.CreateFileW.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    state = (root / "state.json").read_bytes()
    launcher = digest(root / "Ameow.exe")
    handle = kernel.CreateFileW(str(root / "running.lock"), 0xC0000000, 0, None, 4, 0x80, None)
    if handle == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    report = evidence / (label + "-locked-maintenance.txt")
    try:
        result = subprocess.run([str(root / "Ameow.exe"), "--installer-maintenance",
            "cleanup", str(root), str(report)], capture_output=True, timeout=15)
        assert result.returncode != 0, "An occupied installation must reject cleanup"
        assert "E_APP_UPDATE_LOCK" in report.read_text(encoding="utf8")
        assert (root / "state.json").read_bytes() == state
        assert digest(root / "Ameow.exe") == launcher
    finally:
        kernel.CloseHandle(handle)

def scenario(delivery, installer, evidence, old=None, archive=None, verify_ready=False):
    label = f"upgrade-{old}" if old else "fresh-repair"
    root = evidence / (label + " 中文 space")
    root.mkdir()
    if archive:
        stage_old(archive, old, root)
    unrelated = root / "用户文件.mp4"
    unrelated.write_bytes(b"unrelated finished media")
    data = root / "validation-instance"
    data.mkdir()
    settings = data / "ui-settings.json"
    output = evidence / (label + " 成品输出")
    output.mkdir()
    finished = output / "下载.mp4"
    finished.write_bytes(b"finished download")
    settings.write_text(json.dumps({"output_dir": str(output)}), encoding="utf8")
    original_settings = settings.read_bytes()
    install_args = ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/LANG=english", f"/DIR={root}"]
    run(installer, [*install_args, f"/LOG={evidence / (label + '-install.log')}"], evidence / (label + "-install-process.log"))
    state = json.loads((root / "state.json").read_text(encoding="utf8"))
    version = delivery["build"]["version"]
    assert state["pending"]["version"] == version, "Installed version must be pending, not falsely accepted"
    assert settings.read_bytes() == original_settings
    assert unrelated.read_bytes() == b"unrelated finished media"
    slot_licenses = root / "versions" / version / "licenses"
    assert slot_licenses.is_dir() and any(slot_licenses.iterdir())
    if old != "0.5.1":
        assert not (root / "licenses").exists(), "Root license mirror must be omitted/pruned"
    first_state = (root / "state.json").read_bytes()
    run(installer, [*install_args, f"/LOG={evidence / (label + '-repair.log')}"], evidence / (label + "-repair-process.log"))
    assert (root / "state.json").read_bytes() == first_state, "Same signed version repair must preserve state"
    locked_maintenance(root, evidence, label)
    if verify_ready:
        run(root / "Ameow.exe", ["--instance-root", str(data), "--exit-after-ms", "3500"],
            evidence / (label + "-ready-process.log"))
        accepted = json.loads((root / "state.json").read_text(encoding="utf8"))
        assert accepted["current"]["version"] == version and accepted.get("pending") is None
        (evidence / (label + "-accepted-state.json")).write_text(
            json.dumps(accepted, indent=2), encoding="utf8")
    uninstaller = uninstaller_for(root)
    assert uninstaller.is_file()
    run(uninstaller, ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", f"/LOG={evidence / (label + '-uninstall.log')}"], evidence / (label + "-uninstall-process.log"))
    assert settings.read_bytes() == original_settings, "Silent/default uninstall must retain data"
    assert finished.read_bytes() == b"finished download"
    assert unrelated.read_bytes() == b"unrelated finished media"
    assert not (root / "Ameow.exe").exists(), "Owned stable entry must be removed"
    assert not (root / "versions" / version / "Ameow.exe").exists()
    guard_fixture_registration()
    return {"scenario": label, "result": "PASS", "installRoot": str(root), "oldArchive": str(archive) if archive else None,
            "readyVerified": verify_ready,
            "coverage": "native fixture installer, signed registration, same-version repair, occupied-maintenance refusal, retry/default data preservation and uninstall; published old archives staged without executing old production programs"}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--delivery", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--legacy051", type=Path)
    parser.add_argument("--legacy052", type=Path)
    parser.add_argument("--verify-ready", action="store_true", help="Launch the exact owned fixture entry with an isolated root and bounded exit")
    args = parser.parse_args()
    if sys.platform != "win32":
        raise RuntimeError("Windows only")
    args.evidence = args.evidence.absolute()
    plain(args.evidence)
    if args.evidence.exists():
        raise RuntimeError("Choose a new task-owned evidence directory")
    delivery = json.loads(args.delivery.read_text(encoding="utf-8-sig"))
    if delivery.get("fixture") is not True or delivery.get("mode") != "FIXTURE-NOT-FOR-DISTRIBUTION" or delivery.get("licenseMeasurementOnly"):
        raise RuntimeError("Only explicit fixture installers are allowed")
    installer = args.delivery.parent / delivery["installer"]["path"]
    if digest(installer) != delivery["installer"]["sha256"]:
        raise RuntimeError("Installer identity differs from delivery receipt")
    guard_fixture_registration()
    args.evidence.mkdir()
    results = []
    try:
        for version, archive in [(None, None), ("0.5.1", args.legacy051), ("0.5.2", args.legacy052)]:
            if version and not archive:
                continue
            results.append(scenario(delivery, installer, args.evidence, version, archive, args.verify_ready))
    finally:
        (args.evidence / "result.json").write_text(json.dumps({"checks": results, "productionKeyUsed": False,
            "readyVerified": args.verify_ready and len(results) == 1 + bool(args.legacy051) + bool(args.legacy052), "note": "Published archives are staged, not installed by production installers. Only owned fixture records and paths are used; production Ameow/browser profiles are untouched."}, indent=2, ensure_ascii=False), encoding="utf8")
    print(json.dumps(results, ensure_ascii=False))

if __name__ == "__main__":
    main()
