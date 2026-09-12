import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { bundledWheelValidatorPython, releaseIdFor, validateYtDlpWheelArchive, validateManagedYtDlpReleaseManifest } from "./managed-ytdlp-package-set.mjs";
import { verifyManagedYtDlpReleaseSource } from "./verify-ytdlp-managed-release.mjs";

const baselineRoot = "desktop-assets/binaries/ytdlp-baseline";
const baseline = JSON.parse(readFileSync(join(baselineRoot, ".official-ytdlp-baseline.json"), "utf8"));
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const wheel = (defect: string) => {
  const script = String.raw`
import io, zipfile, sys
b=io.BytesIO()
kind=sys.argv[1]
meta='Metadata-Version: 2.1\nName: yt-dlp\nVersion: 2026.7.4\n'
if kind == 'missing-dependency': meta += 'Requires-Dist: missing>=1\n'
if kind == 'version': meta += 'Requires-Dist: yt-dlp-ejs>=9\n'
if kind == 'optional': meta += 'Requires-Dist: missing>=1; extra == "curl"\n'
if kind == 'platform': meta += 'Requires-Dist: missing>=1; sys_platform == "win32"\n'
if kind == 'folded': meta += 'Requires-Dist: yt-dlp-ejs\n (>=9)\n'
if kind == 'extras': meta += 'Requires-Dist: yt-dlp-ejs[unapproved]>=0.8\n'
if kind == 'duplicate-metadata': meta += 'Name: other\n'
with zipfile.ZipFile(b,'w',zipfile.ZIP_STORED) as z:
 z.writestr('yt_dlp-2026.7.4.dist-info/WHEEL','Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n')
 z.writestr('yt_dlp-2026.7.4.dist-info/METADATA',meta)
 z.writestr('yt_dlp/__init__.py','sentinel')
 if kind == 'traversal': z.writestr('../outside','bad')
 if kind == 'backslash': z.writestr('yt_dlp\\..\\outside','bad')
 if kind == 'duplicate': z.writestr('yt_dlp/__init__.py','bad')
 if kind == 'case-collision': z.writestr('YT_DLP/__init__.py','bad')
 if kind == 'symlink':
  info=zipfile.ZipInfo('link');info.external_attr=0o120777 << 16;z.writestr(info,'outside')
blob=b.getvalue()
if kind == 'crc': blob=blob.replace(b'sentinel',b'CORRUPT!')
if kind == 'truncated': blob=blob[:-25]
sys.stdout.buffer.write(blob)
`;
  const result = spawnSync(bundledWheelValidatorPython(), ["-I", "-B", "-c", script, defect], { windowsHide: true });
  expect(result.status).toBe(0);
  return result.stdout;
};

describe("canonical wheel and source acceptance", () => {
  it("validates both real packaged baseline wheels read-only without approving or staging them", async () => {
    for (const pkg of baseline.packages) await validateYtDlpWheelArchive(readFileSync(join(baselineRoot, pkg.filename)), pkg, baseline.packages);
  });
  it("accepts inactive optional dependencies", async () => {
    await expect(validateYtDlpWheelArchive(wheel("optional"), baseline.packages[0], baseline.packages)).resolves.toBeUndefined();
  });
  it.each(["traversal", "backslash", "duplicate", "case-collision", "symlink", "crc", "truncated", "missing-dependency", "version", "platform", "folded", "extras", "duplicate-metadata"])("rejects adversarial ZIP/METADATA: %s", async (defect) => {
    await expect(validateYtDlpWheelArchive(wheel(defect), baseline.packages[0], baseline.packages)).rejects.toThrow();
  });
  it.each(["missing", "credentials", "metadata-as-download", "http", "query", "wrong-host", "wrong-file"])("rejects malicious or missing transport URL: %s", (defect) => {
    const release = structuredClone({ ...baseline, version: baseline.probe.expectedVersion });
    for (const pkg of release.packages) pkg.downloadUrl = "https://files.pythonhosted.org/fixtures/" + pkg.filename;
    const pkg = release.packages[0];
    if (defect === "missing") delete pkg.downloadUrl;
    if (defect === "credentials") pkg.downloadUrl = pkg.downloadUrl.replace("https://", "https://user:password@");
    if (defect === "metadata-as-download") pkg.downloadUrl = pkg.provenanceUrl;
    if (defect === "http") pkg.downloadUrl = pkg.downloadUrl.replace("https:", "http:");
    if (defect === "query") pkg.downloadUrl += "?token=secret";
    if (defect === "wrong-host") pkg.downloadUrl = pkg.downloadUrl.replace("files.pythonhosted.org", "example.test");
    if (defect === "wrong-file") pkg.downloadUrl += "other.whl";
    release.releaseId = releaseIdFor(release);
    expect(() => validateManagedYtDlpReleaseManifest({ schemaVersion: 1, releases: [release] })).toThrow();
  });

  it.each(["valid", "provenance", "policy", "probe", "minPython", "targets", "bytes"])("checks nonempty baseline overlap including %s", async (field) => {
    const root = await mkdtemp(join(tmpdir(), "ameow-source-contract-")); roots.push(root);
    const release = structuredClone({ ...baseline, version: baseline.probe.expectedVersion });
    for (const pkg of release.packages) pkg.downloadUrl = "https://files.pythonhosted.org/fixtures/" + pkg.filename;
    if (field === "provenance") release.packages[0].provenanceUrl = 'https://files.pythonhosted.org/other/' + release.packages[0].filename;
    if (field === "policy") release.executionPolicy.pluginDirs = "enabled";
    if (field === "probe") release.probe.args = ["--help"];
    if (field === "minPython") release.minPython = [3, 11, 0];
    if (field === "targets") release.runtimeTargets = ["x86_64-pc-windows-msvc"];
    if (field === "bytes") release.packages[0].sha256 = 'a'.repeat(64);
    release.releaseId = releaseIdFor(release);
    const file = join(root, "manifest.json");
    await writeFile(file, JSON.stringify({ schemaVersion: 1, releases: [release] }));
    if (field === "valid") await expect(verifyManagedYtDlpReleaseSource(file)).resolves.toMatchObject({ releases: [{ releaseId: release.releaseId }] });
    else await expect(verifyManagedYtDlpReleaseSource(file)).rejects.toThrow();
  });
});
