import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const MANAGED_YTDLP_TARGETS = [
  "x86_64-pc-windows-msvc",
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
];

const safeToken = (value) => typeof value === "string" && value.length <= 128 && /^[0-9][A-Za-z0-9.!+_-]*$/.test(value);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;

export const normalizeYtDlpPackageName = (value) => String(value).toLowerCase().replace(/[-_.]+/g, "-");
export const normalizedInstalledYtDlpVersion = (value) => String(value).replace(/\d+/g, (part) => String(Number(part)));
export const digestYtDlpText = digest;
export const canonicalYtDlpPackageSetId = (packages) => packages.map((entry) => `${normalizeYtDlpPackageName(entry.name)}==${entry.version}`).join(";");
export const ytdlpRequirementsLock = (packages) => packages.map((entry) => `${entry.name}==${entry.version} --hash=sha256:${entry.sha256}`).join("\n") + "\n";

export const isYtDlpExecutionPolicy = (value) => {
  const policy = object(value);
  return policy?.configIsolation === true && policy.pluginDirs === "disabled" && policy.remoteComponents === "disabled" && policy.jsRuntime === "managed-deno-absolute-path";
};
export const isYtDlpProbeContract = (value) => {
  const probe = object(value);
  return Array.isArray(probe?.args) && probe.args.length === 1 && probe.args[0] === "--version" && safeToken(probe.expectedVersion);
};

export const approvedYtDlpDownloadUrl = (entry) => {
  const value = entry.downloadUrl ?? entry.provenanceUrl;
  const url = new URL(value);
  if (url.href !== value || url.protocol !== "https:" || url.hostname !== "files.pythonhosted.org" || url.port || url.username || url.password || url.search || url.hash || !url.pathname.endsWith(`/${entry.filename}`)) throw new Error("Invalid managed yt-dlp download URL");
  return url.href;
};

const wheelIdentity = (entry) => {
  const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)-([A-Za-z0-9.!+_-]+)-(py3)-(none)-(any)\.whl$/.exec(entry.filename ?? "");
  if (!match || normalizeYtDlpPackageName(match[1]) !== normalizeYtDlpPackageName(entry.name) || normalizedInstalledYtDlpVersion(match[2]) !== normalizedInstalledYtDlpVersion(entry.version)) {
    throw new Error(`Invalid managed yt-dlp universal wheel identity: ${entry.filename ?? ""}`);
  }
};

export const assertYtDlpPackageReleaseContract = (entry, { requireReleaseId = false } = {}) => {
  const release = object(entry);
  const packages = Array.isArray(release?.packages) ? release.packages : [];
  if (!release || release.schemaVersion !== 1 || release.layoutVersion !== 1 || !safeToken(release.version)
    || !Array.isArray(release.minPython) || release.minPython.length !== 3 || !release.minPython.every((part) => Number.isSafeInteger(part) && part >= 0 && part <= 99) || release.minPython[0] < 3
    || !Array.isArray(release.runtimeTargets) || release.runtimeTargets.length === 0 || new Set(release.runtimeTargets).size !== release.runtimeTargets.length || !release.runtimeTargets.every((target) => MANAGED_YTDLP_TARGETS.includes(target))
    || !isYtDlpExecutionPolicy(release.executionPolicy) || !isYtDlpProbeContract(release.probe) || release.probe.expectedVersion !== release.version || packages.length === 0) {
    throw new Error("Invalid managed yt-dlp release contract");
  }
  const names = new Set();
  const filenames = new Set();
  for (const pkg of packages) {
    if (!object(pkg) || typeof pkg.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(pkg.name) || !safeToken(pkg.version) || typeof pkg.filename !== "string" || !Number.isSafeInteger(pkg.size) || pkg.size <= 0 || typeof pkg.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(pkg.sha256)) throw new Error("Invalid managed yt-dlp package contract");
    const url = new URL(pkg.provenanceUrl ?? "");
    const metadataPath = `/pypi/${pkg.name}/${pkg.version}/json`;
    if (url.href !== pkg.provenanceUrl || url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash
      || !(url.hostname === "files.pythonhosted.org" && url.pathname.endsWith(`/${pkg.filename}`) || url.hostname === "pypi.org" && url.pathname === metadataPath)) throw new Error("Invalid managed yt-dlp package provenance");
    if (requireReleaseId || pkg.downloadUrl !== undefined) approvedYtDlpDownloadUrl(pkg);
    wheelIdentity(pkg);
    const name = normalizeYtDlpPackageName(pkg.name);
    if (names.has(name) || filenames.has(pkg.filename)) throw new Error("Duplicate managed yt-dlp package");
    names.add(name); filenames.add(pkg.filename);
  }
  if (release.packageSetId !== canonicalYtDlpPackageSetId(packages) || packages.find((pkg) => normalizeYtDlpPackageName(pkg.name) === "yt-dlp")?.version !== release.version || !names.has("yt-dlp-ejs")) throw new Error("Incomplete managed yt-dlp package set");
  if (requireReleaseId && release.releaseId !== releaseIdFor(release)) throw new Error("Invalid managed yt-dlp release ID");
  return release;
};

const releaseIdentity = (entry) => ({ schemaVersion: entry.schemaVersion, layoutVersion: entry.layoutVersion, version: entry.version, packageSetId: entry.packageSetId,
  packages: entry.packages.map((pkg) => ({ name: pkg.name, version: pkg.version, filename: pkg.filename, size: pkg.size, sha256: pkg.sha256, provenanceUrl: pkg.provenanceUrl, ...(pkg.downloadUrl === undefined ? {} : { downloadUrl: pkg.downloadUrl }) })),
  minPython: entry.minPython, runtimeTargets: entry.runtimeTargets,
  executionPolicy: { configIsolation: entry.executionPolicy.configIsolation, pluginDirs: entry.executionPolicy.pluginDirs, remoteComponents: entry.executionPolicy.remoteComponents, jsRuntime: entry.executionPolicy.jsRuntime },
  probe: { args: entry.probe.args, expectedVersion: entry.probe.expectedVersion } });
export const releaseIdFor = (entry) => `${entry.version}-${digest(JSON.stringify(releaseIdentity(entry))).slice(0, 16)}`;
export const sameYtDlpReleaseContract = (left, right) => {
  const common = (entry) => ({ ...releaseIdentity(entry), packages: releaseIdentity(entry).packages.map(({ downloadUrl, ...pkg }) => pkg) });
  return JSON.stringify(common(left)) === JSON.stringify(common(right));
};
export const validateManagedYtDlpReleaseManifest = (manifest) => {
  if (!object(manifest) || manifest.schemaVersion !== 1 || !Array.isArray(manifest.releases)) throw new Error("Invalid managed yt-dlp release allowlist");
  const ids = new Set();
  for (const release of manifest.releases) {
    assertYtDlpPackageReleaseContract(release, { requireReleaseId: true });
    if (ids.has(release.releaseId)) throw new Error("Duplicate managed yt-dlp release ID");
    ids.add(release.releaseId);
  }
  return manifest;
};

// zipfile owns ZIP bounds, local headers, decompression and CRC. pip ships
// packaging with the app-owned Python; use its PEP 440/508 parser, not regexes.
const wheelValidationScript = String.raw`
import base64, email.policy, io, json, re, stat, sys, zipfile
from email.parser import BytesParser
from pip._vendor.packaging.requirements import Requirement
from pip._vendor.packaging.version import Version
from pip._vendor.packaging.markers import default_environment
from pip._vendor.packaging.utils import canonicalize_name
from pip._vendor.packaging.specifiers import SpecifierSet
request = json.load(sys.stdin)
pkg, packages = request['packageInfo'], request['packages']
blob = base64.b64decode(request['bytes'], validate=True)
with zipfile.ZipFile(io.BytesIO(blob)) as archive:
    members = archive.infolist()
    names = set()
    total = 0
    for member in members:
        name = member.filename
        parts = name.rstrip('/').split('/')
        assert name and '\\' not in name and not any(p in ('', '.', '..') or ':' in p for p in parts), 'unsafe wheel path'
        assert name.casefold() not in names, 'duplicate wheel path'
        names.add(name.casefold())
        assert not stat.S_ISLNK(member.external_attr >> 16), 'wheel symlink'
        assert not member.flag_bits & 1, 'encrypted wheel'
        total += member.file_size
        assert total <= 256 * 1024 * 1024 and len(members) <= 20000, 'wheel expansion bound'
        with archive.open(member) as payload:
            while payload.read(65536): pass
    metadata_names = [m.filename for m in members if m.filename.endswith('.dist-info/METADATA')]
    wheel_names = [m.filename for m in members if m.filename.endswith('.dist-info/WHEEL')]
    assert len(metadata_names) == len(wheel_names) == 1, 'ambiguous distribution metadata'
    prefix = metadata_names[0].rsplit('/', 1)[0]
    assert wheel_names[0].rsplit('/', 1)[0] == prefix, 'mixed distribution metadata'
    dist_name, dist_version = prefix[:-10].rsplit('-', 1)
    assert canonicalize_name(dist_name) == canonicalize_name(pkg['name']) and Version(dist_version) == Version(pkg['version']), 'distribution directory identity'
    parser = BytesParser(policy=email.policy.default)
    metadata = parser.parsebytes(archive.read(metadata_names[0]))
    wheel = parser.parsebytes(archive.read(wheel_names[0]))
    for key in ('Name', 'Version'):
        assert len(metadata.get_all(key, [])) == 1, 'duplicate metadata identity'
    assert canonicalize_name(metadata['Name']) == canonicalize_name(pkg['name']) and Version(metadata['Version']) == Version(pkg['version']), 'metadata identity'
    assert wheel.get_all('Tag') == ['py3-none-any'] and wheel.get_all('Root-Is-Purelib') == ['true'] and wheel.get_all('Wheel-Version') == ['1.0'], 'unsupported wheel policy'
    approved = {canonicalize_name(p['name']): p['version'] for p in packages}
    # No extras are requested by the hash-locked install. Evaluate base
    # requirements for every approved target with the bundled interpreter.
    for target in request['runtimeTargets']:
        env = default_environment()
        env.update(extra='', sys_platform='win32' if 'windows' in target else 'darwin', os_name='nt' if 'windows' in target else 'posix', platform_system='Windows' if 'windows' in target else 'Darwin', platform_machine='arm64' if target.startswith('aarch64') else 'AMD64' if 'windows' in target else 'x86_64')
        if metadata.get('Requires-Python'):
            assert Version(env['python_full_version']) in SpecifierSet(metadata['Requires-Python']), 'Python requirement'
        for value in metadata.get_all('Requires-Dist', []):
            req = Requirement(value)
            if req.marker and not req.marker.evaluate(env): continue
            assert not req.url and not req.extras, 'unsupported dependency authority or extras'
            name = canonicalize_name(req.name)
            assert name in approved and Version(approved[name]) in req.specifier, 'unsatisfied approved dependency'
print('verified')
`;

export const bundledWheelValidatorPython = () => {
  const target = process.platform === "win32" ? "x86_64-pc-windows-msvc" : process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  const relative = `desktop-assets/binaries/python-${target}/${process.platform === "win32" ? "python.exe" : "bin/python3"}`;
  const source = fileURLToPath(new URL(`../${relative}`, import.meta.url));
  return existsSync(source) ? source : fileURLToPath(new URL(`../../${relative}`, import.meta.url));
};

export const validateYtDlpWheelArchive = async (bytes, packageInfo, packages, options = {}) => {
  await new Promise((resolve, reject) => {
    const child = execFile(options.pythonPath ?? bundledWheelValidatorPython(), ['-I', '-B', '-c', wheelValidationScript], {
      encoding: 'utf8', timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 65_536, windowsHide: true,
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PYTHON|PIP_|VIRTUAL_ENV)/i.test(key))), PYTHONDONTWRITEBYTECODE: '1', PIP_NO_INDEX: '1' },
    }, (error, stdout) => {
      if (error || stdout.trim() !== 'verified') reject(new Error('Managed yt-dlp wheel structure or dependency validation failed'));
      else resolve();
    });
    // This isolated stdlib parser never imports or executes wheel members and
    // cannot create descendants. execFile settles its child/stdio before callback.
    child.stdin?.on('error', () => {}); // A rejected spawn/early exit owns the error.
    child.stdin?.end(JSON.stringify({ bytes: Buffer.from(bytes).toString('base64'), packageInfo, packages, runtimeTargets: options.runtimeTargets ?? MANAGED_YTDLP_TARGETS }));
  });
};
