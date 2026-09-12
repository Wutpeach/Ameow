import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sameYtDlpReleaseContract, validateManagedYtDlpReleaseManifest } from "./managed-ytdlp-package-set.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const verifyManagedYtDlpReleaseSource = async (
  manifestPath = path.join(root, "desktop-assets", "binaries", "ytdlp-managed-releases.json"),
  baselinePath = path.join(root, "desktop-assets", "binaries", "ytdlp-baseline", ".official-ytdlp-baseline.json"),
) => {
  const manifest = validateManagedYtDlpReleaseManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  for (const release of manifest.releases) {
    if (release.version !== baseline.probe?.expectedVersion) continue;
    if (!sameYtDlpReleaseContract(release, { ...baseline, version: baseline.probe?.expectedVersion })) {
      throw new Error("A managed release overlapping the bundled baseline must have an exact package policy and package bytes");
    }
  }
  return manifest;
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await verifyManagedYtDlpReleaseSource();
  console.log(`Verified managed yt-dlp release allowlist (${manifest.releases.length} approved release(s))`);
}
