import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateManagedYtDlpReleaseManifest } from "./managed-ytdlp-release-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output-root");
const outputRoot = outputIndex >= 0 && args[outputIndex + 1]
  ? path.resolve(root, args[outputIndex + 1])
  : path.join(root, "dist-release");
const sourceIndex = args.indexOf("--source-manifest");
const sourcePath = sourceIndex >= 0 ? path.resolve(args[sourceIndex + 1]) : path.join(root, "desktop-assets", "binaries", "ytdlp-managed-releases.json");
const source = readFileSync(sourcePath, "utf8");
const findMacApp = (directory) => existsSync(directory)
  ? readdirSync(directory, { withFileTypes: true }).find((entry) => entry.isDirectory() && entry.name.endsWith(".app"))?.name ?? null
  : null;
const wantsMac = args.includes("--mac") || (!args.includes("--win") && process.platform === "darwin");
const macDirectories = args.includes("--arm64") && args.includes("--x64") ? ["mac", "mac-arm64"]
  : args.includes("--arm64") ? ["mac-arm64"]
  : args.includes("--x64") ? ["mac"]
  : [process.arch === "arm64" ? "mac-arm64" : "mac"];
const roots = wantsMac ? macDirectories.map((directory) => {
  const app = findMacApp(path.join(outputRoot, directory));
  if (!app) throw new Error(`Missing requested macOS application: ${directory}`);
  return path.join(outputRoot, directory, app, "Contents", "Resources", "app");
}) : [path.join(outputRoot, "win-unpacked", "resources", "app")];
if (roots.length === 0) throw new Error("No packaged application root found for managed yt-dlp allowlist verification");
for (const appRoot of roots) {
  const packagedPath = path.join(appRoot, "desktop-assets", "binaries", "ytdlp-managed-releases.json");
  if (!existsSync(packagedPath)) throw new Error(`Missing packaged managed yt-dlp allowlist: ${packagedPath}`);
  const packaged = readFileSync(packagedPath, "utf8");
  validateManagedYtDlpReleaseManifest(JSON.parse(packaged));
  const compiledPath = path.join(appRoot, "dist-electron", "scripts", "managed-ytdlp-package-set.mjs");
  if (readFileSync(compiledPath, "utf8") !== readFileSync(path.join(root, "dist-electron", "scripts", "managed-ytdlp-package-set.mjs"), "utf8")) throw new Error("Packaged canonical module differs from compiled application");
  const canonical = await import(pathToFileURL(compiledPath).href);
  const runtime = await import(pathToFileURL(path.join(appRoot, "dist-electron", "electron", "ytDlpPackageSet.mjs")).href);
  const manifest = canonical.validateManagedYtDlpReleaseManifest(JSON.parse(packaged));
  for (const release of manifest.releases) runtime.assertYtDlpPackageReleaseContract(release, { requireReleaseId: true });
  if (packaged !== source) throw new Error("Packaged managed yt-dlp allowlist differs from the verified source allowlist");
  console.log(`Verified packaged managed yt-dlp release allowlist: ${packagedPath}`);
}
