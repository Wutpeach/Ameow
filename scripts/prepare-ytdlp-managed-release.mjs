import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { packageSetIdFor, releaseIdFor } from "./managed-ytdlp-release-manifest.mjs";
import { validateYtDlpWheelArchive, validateManagedYtDlpReleaseManifest } from "./managed-ytdlp-package-set.mjs";

const args = process.argv.slice(2);
const values = (name) => args.flatMap((value, index) => value === name && args[index + 1] ? [args[index + 1]] : []);
const version = values("--version")[0];
const packagePins = values("--package");
const output = values("--output")[0];

if (!version || packagePins.length === 0) {
  throw new Error("Usage: --version <yt-dlp-version> --package <name==version> [--package <name==version>] [--output <evidence.json>]");
}

const parsePin = (pin) => {
  const match = /^([A-Za-z0-9._-]+)==([^\s=]+)$/.exec(pin);
  if (!match) throw new Error(`Invalid explicit package pin: ${pin}`);
  return { name: match[1], version: match[2] };
};
const pins = packagePins.map(parsePin);
if (pins.find((pin) => pin.name.toLowerCase().replace(/[-_.]+/g, "-") === "yt-dlp")?.version !== version) {
  throw new Error("--version must equal the explicitly approved yt-dlp package version");
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const packages = [];
const wheelBytes = [];
for (const pin of pins) {
  const metadataUrl = `https://pypi.org/pypi/${encodeURIComponent(pin.name)}/${encodeURIComponent(pin.version)}/json`;
  const metadataResponse = await fetch(metadataUrl, { redirect: "error" });
  if (!metadataResponse.ok) throw new Error(`Failed to read explicit PyPI evidence: ${metadataUrl}`);
  const metadata = await metadataResponse.json();
  const wheel = metadata.urls?.find((entry) => entry.packagetype === "bdist_wheel" && entry.filename?.endsWith("py3-none-any.whl"));
  if (!wheel || new URL(wheel.url).protocol !== "https:" || new URL(wheel.url).hostname !== "files.pythonhosted.org") {
    throw new Error(`No approved universal wheel evidence for ${pin.name}==${pin.version}`);
  }
  const response = await fetch(wheel.url, { redirect: "error" });
  if (!response.ok || (response.url && response.url !== wheel.url)) throw new Error(`Redirect or download failure for ${wheel.filename}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== wheel.size || sha256(bytes) !== wheel.digests?.sha256) throw new Error(`Byte verification failed for ${wheel.filename}`);
  packages.push({ name: pin.name, version: pin.version, filename: wheel.filename, size: wheel.size, sha256: wheel.digests.sha256, provenanceUrl: metadataUrl, downloadUrl: wheel.url });
  wheelBytes.push(bytes);
}
for (const [index, bytes] of wheelBytes.entries()) await validateYtDlpWheelArchive(bytes, packages[index], packages);

const entry = {
  schemaVersion: 1,
  layoutVersion: 1,
  version,
  packageSetId: packageSetIdFor(packages),
  packages,
  minPython: [3, 10, 0],
  runtimeTargets: ["x86_64-pc-windows-msvc", "aarch64-apple-darwin", "x86_64-apple-darwin"],
  executionPolicy: { configIsolation: true, pluginDirs: "disabled", remoteComponents: "disabled", jsRuntime: "managed-deno-absolute-path" },
  probe: { args: ["--version"], expectedVersion: version },
};
const release = { ...entry, releaseId: releaseIdFor(entry) };
validateManagedYtDlpReleaseManifest({ schemaVersion: 1, releases: [release] });
const evidence = { evidenceOnly: true, release };
if (output) await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify(evidence, null, 2));
