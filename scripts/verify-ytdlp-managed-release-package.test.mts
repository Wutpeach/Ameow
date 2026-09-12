import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { releaseIdFor } from "./managed-ytdlp-package-set.mjs";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

describe("packaged managed yt-dlp allowlist verifier", () => {
  it("requires the source-controlled allowlist in the packaged resource root", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "ameow-managed-ytdlp-package-"));
    roots.push(outputRoot);
    const packagedRoot = join(outputRoot, "win-unpacked", "resources", "app", "desktop-assets", "binaries");
    await mkdir(packagedRoot, { recursive: true });
    const appRoot = join(packagedRoot, "..", "..");
    await mkdir(join(appRoot, "dist-electron", "scripts"), { recursive: true });
    await mkdir(join(appRoot, "dist-electron", "electron"), { recursive: true });
    await cp("dist-electron/scripts/managed-ytdlp-package-set.mjs", join(appRoot, "dist-electron/scripts/managed-ytdlp-package-set.mjs"));
    await cp("dist-electron/electron/ytDlpPackageSet.mjs", join(appRoot, "dist-electron/electron/ytDlpPackageSet.mjs"));
    await cp(
      join(process.cwd(), "desktop-assets", "binaries", "ytdlp-managed-releases.json"),
      join(packagedRoot, "ytdlp-managed-releases.json"),
      { recursive: true },
    );

    await expect(execFileAsync(process.execPath, [
      "scripts/verify-ytdlp-managed-release-package.mjs",
      "--output-root",
      outputRoot,
    ], { cwd: process.cwd() })).resolves.toMatchObject({ stdout: expect.stringContaining("Verified packaged managed yt-dlp release allowlist") });
  });

  it.each(["win-unpacked", "mac", "mac-arm64"])("loads compiled canonical runtime and a nonempty baseline-compatible allowlist from %s", async (layout) => {
    const outputRoot = await mkdtemp(join(tmpdir(), "ameow-managed-layout-")); roots.push(outputRoot);
    const appRoot = layout === "win-unpacked" ? join(outputRoot, layout, "resources", "app") : join(outputRoot, layout, "Ameow.app", "Contents", "Resources", "app");
    await mkdir(join(appRoot, "desktop-assets", "binaries"), { recursive: true });
    await mkdir(join(appRoot, "dist-electron", "scripts"), { recursive: true });
    await mkdir(join(appRoot, "dist-electron", "electron"), { recursive: true });
    await cp("dist-electron/scripts/managed-ytdlp-package-set.mjs", join(appRoot, "dist-electron/scripts/managed-ytdlp-package-set.mjs"));
    await cp("dist-electron/electron/ytDlpPackageSet.mjs", join(appRoot, "dist-electron/electron/ytDlpPackageSet.mjs"));
    const baseline = JSON.parse(await readFile("desktop-assets/binaries/ytdlp-baseline/.official-ytdlp-baseline.json", "utf8"));
    const release = { ...baseline, version: baseline.probe.expectedVersion };
    for (const pkg of release.packages) pkg.downloadUrl = "https://files.pythonhosted.org/fixtures/" + pkg.filename;
    release.releaseId = releaseIdFor(release);
    const manifest = JSON.stringify({ schemaVersion: 1, releases: [release] });
    const source = join(outputRoot, "source.json"); await writeFile(source, manifest);
    await writeFile(join(appRoot, "desktop-assets/binaries/ytdlp-managed-releases.json"), manifest);
    const args = ["scripts/verify-ytdlp-managed-release-package.mjs", "--output-root", outputRoot, "--source-manifest", source, ...(layout === "win-unpacked" ? ["--win"] : ["--mac", layout === "mac" ? "--x64" : "--arm64"])];
    await expect(execFileAsync(process.execPath, args)).resolves.toMatchObject({ stdout: expect.stringContaining("Verified packaged") });
    if (layout !== "win-unpacked") await expect(execFileAsync(process.execPath, [...args, "--x64", "--arm64"])).rejects.toThrow();
    await rm(join(appRoot, "dist-electron/scripts/managed-ytdlp-package-set.mjs"));
    await expect(execFileAsync(process.execPath, args)).rejects.toThrow();
  });

  it.each(["missing", "corrupt", "mismatched"])("rejects a %s packaged allowlist", async (kind) => {
    const outputRoot = await mkdtemp(join(tmpdir(), "ameow-managed-ytdlp-package-invalid-"));
    roots.push(outputRoot);
    const packagedRoot = join(outputRoot, "win-unpacked", "resources", "app", "desktop-assets", "binaries");
    await mkdir(packagedRoot, { recursive: true });
    const appRoot = join(packagedRoot, "..", "..");
    await mkdir(join(appRoot, "dist-electron", "scripts"), { recursive: true });
    await mkdir(join(appRoot, "dist-electron", "electron"), { recursive: true });
    await cp("dist-electron/scripts/managed-ytdlp-package-set.mjs", join(appRoot, "dist-electron/scripts/managed-ytdlp-package-set.mjs"));
    await cp("dist-electron/electron/ytDlpPackageSet.mjs", join(appRoot, "dist-electron/electron/ytDlpPackageSet.mjs"));
    const target = join(packagedRoot, "ytdlp-managed-releases.json");
    if (kind === "corrupt") await writeFile(target, "{not-json", "utf8");
    if (kind === "mismatched") await writeFile(target, "{\"schemaVersion\":1,\"releases\":[]}", "utf8");
    await expect(execFileAsync(process.execPath, [
      "scripts/verify-ytdlp-managed-release-package.mjs",
      "--output-root",
      outputRoot,
    ], { cwd: process.cwd() })).rejects.toThrow();
  });
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
