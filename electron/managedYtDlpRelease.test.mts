import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { packageSetIdFor, releaseIdFor, validateManagedYtDlpReleaseManifest } from "../scripts/managed-ytdlp-release-manifest.mjs";
import { validateYtDlpWheelArchive } from "../scripts/managed-ytdlp-package-set.mjs";

const mocks = vi.hoisted(() => ({
  downloadToFile: vi.fn(),
  runUtilityCommand: vi.fn(),
  runCapturedUtilityCommand: vi.fn(),
}));

vi.mock("./managedRuntimeBootstrap.mjs", async () => {
  const crypto = await import("node:crypto");
  const fs = await import("node:fs/promises");
  return {
    currentManagedRuntimeTarget: () => "x86_64-pc-windows-msvc",
    assertPythonVersionSatisfiesManagedPackage: vi.fn(),
    managedPythonVirtualenvArgs: (root: string) => ["-m", "venv", root],
    managedPythonCommandOptions: (_platform: NodeJS.Platform, timeoutMs = 60_000) => ({ timeoutMs, env: { PYTHONNOUSERSITE: "1", PIP_NO_INDEX: "1" } }),
    sha256Hex: async (path: string) => crypto.createHash("sha256").update(await fs.readFile(path)).digest("hex"),
    downloadToFile: mocks.downloadToFile,
    runUtilityCommand: mocks.runUtilityCommand,
    runCapturedUtilityCommand: mocks.runCapturedUtilityCommand,
  };
});

import {
  deriveManagedYtDlpReleaseId,
  inspectManagedYtDlpCandidates,
  stageManagedYtDlpRelease,
} from "./managedYtDlpRelease.mjs";
import { createRuntimeSetLifecycleCoordinator } from "./runtimeSetLifecycle.mjs";

const roots: string[] = [];
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const wheelBytes = {
  "yt-dlp": Buffer.from("UEsDBBQAAAAIAOMGLF2xnly3UQAAAFEAAAAfAAAAeXRfZGxwLTIwMjYuNy40LmRpc3QtaW5mby9XSEVFTAXBwQmAMAwF0Hun6AIRxVsXEG8ioucKHy3URNIU6fa+d9xAph1aknDwQ9e7CQyNJhp8fCAfGYq5VcRoLrRURU5n8KYVbotX8G8biYVBkZv7AVBLAwQUAAAACADjBixdsXc20C8AAAA1AAAAIgAAAHl0X2RscC0yMDI2LjcuNC5kaXN0LWluZm8vTUVUQURBVEHzTS1JTEksSdQNSy0qzszPs1Iw0jPk8kvMTbVSqCzRTckp4ELIGBiZ6ZnrmXABAFBLAwQUAAAACADjBixdAAAAAAIAAAAAAAAAEgAAAHl0X2RscC9fX2luaXRfXy5weQMAUEsBAhQAFAAAAAgA4wYsXbGeXLdRAAAAUQAAAB8AAAAAAAAAAAAAAIABAAAAAHl0X2RscC0yMDI2LjcuNC5kaXN0LWluZm8vV0hFRUxQSwECFAAUAAAACADjBixdsXc20C8AAAA1AAAAIgAAAAAAAAAAAAAAgAGOAAAAeXRfZGxwLTIwMjYuNy40LmRpc3QtaW5mby9NRVRBREFUQVBLAQIUABQAAAAIAOMGLF0AAAAAAgAAAAAAAAASAAAAAAAAAAAAAACAAf0AAAB5dF9kbHAvX19pbml0X18ucHlQSwUGAAAAAAMAAwDdAAAALwEAAAAA", "base64"),
  "yt-dlp-ejs": Buffer.from("UEsDBBQAAAAIAOMGLF2xnly3UQAAAFEAAAAgAAAAeXRfZGxwX2Vqcy0wLjguMC5kaXN0LWluZm8vV0hFRUwFwcEJgDAMBdB7p+gCEcVbFxBvIqLnCh8t1ETSFOn2vnfcQKYdWpJw8EPXuwkMjSYafHwgHxmKuVXEaC60VEVOZ/CmFW6LV/BvG4mFQZGb+wFQSwMEFAAAAAgA4wYsXRkSMMAxAAAANgAAACMAAAB5dF9kbHBfZWpzLTAuOC4wLmRpc3QtaW5mby9NRVRBREFUQfNNLUlMSSxJ1A1LLSrOzM+zUjDSM+TyS8xNtVKoLNFNySnQTc0q5oLLGuhZ6BlwAQBQSwMEFAAAAAgA4wYsXQAAAAACAAAAAAAAABYAAAB5dF9kbHBfZWpzL19faW5pdF9fLnB5AwBQSwECFAAUAAAACADjBixdsZ5ct1EAAABRAAAAIAAAAAAAAAAAAAAAgAEAAAAAeXRfZGxwX2Vqcy0wLjguMC5kaXN0LWluZm8vV0hFRUxQSwECFAAUAAAACADjBixdGRIwwDEAAAA2AAAAIwAAAAAAAAAAAAAAgAGPAAAAeXRfZGxwX2Vqcy0wLjguMC5kaXN0LWluZm8vTUVUQURBVEFQSwECFAAUAAAACADjBixdAAAAAAIAAAAAAAAAFgAAAAAAAAAAAAAAgAEBAQAAeXRfZGxwX2Vqcy9fX2luaXRfXy5weVBLBQYAAAAAAwADAOMAAAA3AQAAAAA=", "base64"),
};

const createFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "ameow-managed-ytdlp-"));
  roots.push(root);
  const configDir = join(root, "user-data");
  const manifestPath = join(root, "ytdlp-managed-releases.json");
  const packages = [
    { name: "yt-dlp", version: "2026.07.04", filename: "yt_dlp-2026.7.4-py3-none-any.whl", size: wheelBytes["yt-dlp"].length, sha256: sha256(wheelBytes["yt-dlp"]), provenanceUrl: "https://files.pythonhosted.org/packages/yt_dlp-2026.7.4-py3-none-any.whl" },
    { name: "yt-dlp-ejs", version: "0.8.0", filename: "yt_dlp_ejs-0.8.0-py3-none-any.whl", size: wheelBytes["yt-dlp-ejs"].length, sha256: sha256(wheelBytes["yt-dlp-ejs"]), provenanceUrl: "https://files.pythonhosted.org/packages/yt_dlp_ejs-0.8.0-py3-none-any.whl" },
  ];
  const entry = {
    schemaVersion: 1 as const,
    layoutVersion: 1 as const,
    version: "2026.07.04",
    packageSetId: "yt-dlp==2026.07.04;yt-dlp-ejs==0.8.0",
    packages,
    minPython: [3, 10, 0] as [number, number, number],
    runtimeTargets: ["x86_64-pc-windows-msvc"],
    executionPolicy: {
      configIsolation: true as const,
      pluginDirs: "disabled" as const,
      remoteComponents: "disabled" as const,
      jsRuntime: "managed-deno-absolute-path" as const,
    },
    probe: { args: ["--version"] as ["--version"], expectedVersion: "2026.07.04" },
  };
  const releaseId = deriveManagedYtDlpReleaseId(entry);
  await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, releases: [{ ...entry, releaseId }] }, null, 2)}\n`);
  const bytes = new Map(packages.map((entry) => [entry.provenanceUrl, wheelBytes[entry.name as keyof typeof wheelBytes]]));
  mocks.downloadToFile.mockImplementation(async (url: string, destination: string, options: { validateResponse(response: Response): void }) => {
    options.validateResponse({ url } as Response);
    await writeFile(destination, bytes.get(url) ?? "");
  });
  mocks.runUtilityCommand.mockImplementation(async (_command: string, args: string[]) => {
    if (args[1] !== "venv") return;
    const scripts = join(args[2] ?? "", "Scripts");
    await mkdir(scripts, { recursive: true });
    await Promise.all([writeFile(join(scripts, "python.exe"), "python"), writeFile(join(scripts, "yt-dlp.exe"), "yt-dlp")]);
    const installedPackage = join(args[2], "Lib", "site-packages", "yt_dlp");
    await mkdir(installedPackage, { recursive: true });
    await writeFile(join(installedPackage, "__init__.py"), "# installed fixture module");
  });
  mocks.runCapturedUtilityCommand.mockImplementation(async (_command: string, args: string[]) => {
    if (args[0] === "-I") return { stdout: JSON.stringify(packages.map(({ name, version }) => ({ name, version: name === "yt-dlp" ? "2026.7.4" : version, dependencies: [] }))), stderr: "" };
    return args[0] === "-c" ? { stdout: "2026.7.4\n0.8.0\n", stderr: "" } : { stdout: "2026.07.04\n", stderr: "" };
  });
  const options = {
    configDir,
    platform: "win32" as NodeJS.Platform,
    arch: "x64" as NodeJS.Architecture,
    managedManifestPath: manifestPath,
    bundledPythonPath: join(process.cwd(), "desktop-assets/binaries/python-x86_64-pc-windows-msvc/python.exe"),
    fetch: vi.fn(),
    runMutation: async <T,>(operation: () => Promise<T>) => await operation(),
    prepareProbeDependencies: vi.fn(async () => ({
      python: { version: "Python 3.13.0", target: "x86_64-pc-windows-msvc", manifestEntryDigest: sha256("python"), observedSha256: sha256("python-exe") },
      observed: { ffmpegPath: join(root, "ffmpeg.exe"), ffprobePath: join(root, "ffprobe.exe"), denoPath: join(root, "deno.exe") },
      mediaTools: {
        ffmpeg: { version: "1.0.0", artifactSha256: sha256("ffmpeg-artifact"), observedSha256: sha256("ffmpeg") },
        ffprobe: { version: "1.0.0", artifactSha256: sha256("ffprobe-artifact"), observedSha256: sha256("ffprobe") },
        deno: { version: "1.0.0", artifactSha256: sha256("deno-artifact"), observedSha256: sha256("deno") },
      },
    })),
    now: () => 1_700_000_000_000,
  };
  return { root, configDir, manifestPath, releaseId, packages, bytes, options };
};

afterEach(async () => {
  mocks.downloadToFile.mockReset();
  mocks.runUtilityCommand.mockReset();
  mocks.runCapturedUtilityCommand.mockReset();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("managed yt-dlp stage-only candidates", () => {
  it.each(["duplicate", "credentials", "python", "traversal"])("shares strict manifest policy with tooling: %s", async (defect) => {
    const fixture = await createFixture();
    const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    const release = manifest.releases[0];
    if (defect === "duplicate") release.packages.push({ ...release.packages[1] });
    if (defect === "credentials") release.packages[0].provenanceUrl = "https://user:password@files.pythonhosted.org/private.whl";
    if (defect === "python") release.minPython = [-1, "bad", null];
    if (defect === "traversal") {
      release.version = "../../escaped";
      release.packages[0].version = release.version;
      release.probe.expectedVersion = release.version;
    }
    release.packageSetId = packageSetIdFor(release.packages);
    release.releaseId = releaseIdFor(release);
    expect(() => validateManagedYtDlpReleaseManifest(manifest)).toThrow();
  });

  it("prepares candidate probe inputs without materializing the bundled yt-dlp baseline", async () => {
    const source = (await readFile("electron/main.mts", "utf8")).replace(/\r\n/g, "\n");
    const body = source.split("async function prepareManagedYtDlpCandidateProbeDependencies() {")[1]!.split("\n}\n")[0]!;
    const ensure = vi.fn();
    const binding = vi.fn();
    const invoke = new Function("ensureRuntimeSetCapabilities", "RUNTIME_SET_CONSUMER_CAPABILITIES", "createBundledYtDlpRuntimeBinding", "withYtDlpBaselineRoot", "buildManagedRuntimeBootstrapOptions", "prepareManagedYtDlpCandidateProbeInputs", `return async () => {${body}}`);
    await invoke(ensure, { "yt-dlp": ["yt-dlp", "ffmpeg", "deno"] }, binding, (value: unknown) => value, () => ({}), vi.fn())();
    expect(ensure.mock.calls.flat(2)).not.toContain("yt-dlp");
    expect(binding).not.toHaveBeenCalled();
  });
  it.each(["network", "size", "hash", "redirect"])("isolates a second-asset %s failure before mutation", async (failure) => {
    const fixture = await createFixture();
    const mutation = vi.fn(fixture.options.runMutation);
    fixture.options.runMutation = mutation;
    const first = mocks.downloadToFile.getMockImplementation()!;
    mocks.downloadToFile.mockImplementation(async (url, destination, options) => {
      if (url === fixture.packages[0].provenanceUrl) return first(url, destination, options);
      if (failure === "network") throw new Error("network rejected");
      if (failure === "redirect") options.validateResponse({ url: "https://files.pythonhosted.org/other.whl" });
      await writeFile(destination, failure === "size" ? "short" : "badbytes!");
    });
    await expect(stageManagedYtDlpRelease(fixture.releaseId, fixture.options)).rejects.toThrow();
    expect(mutation).not.toHaveBeenCalled();
    expect(fixture.options.prepareProbeDependencies).not.toHaveBeenCalled();
    expect((await inspectManagedYtDlpCandidates(fixture.options)).candidates).toEqual([]);
  });

  it("fails busy after downloads without touching final candidate state", async () => {
    const fixture = await createFixture();
    const lifecycle = createRuntimeSetLifecycleCoordinator();
    const lease = await lifecycle.acquireLease(["yt-dlp"], async () => {});
    fixture.options.runMutation = lifecycle.runMutation;
    try {
      await expect(stageManagedYtDlpRelease(fixture.releaseId, fixture.options)).rejects.toMatchObject({ category: "materialization" });
      expect(fixture.options.prepareProbeDependencies).not.toHaveBeenCalled();
      expect(existsSync(join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "versions"))).toBe(false);
    } finally {
      lease.release();
    }
  });

  it("holds arriving leases through the probe and does not publish managed capability readiness", async () => {
    const fixture = await createFixture();
    const lifecycle = createRuntimeSetLifecycleCoordinator();
    fixture.options.runMutation = lifecycle.runMutation;
    let probeStarted!: () => void;
    const started = new Promise<void>((resolve) => { probeStarted = resolve; });
    let finishProbe!: () => void;
    const paused = new Promise<void>((resolve) => { finishProbe = resolve; });
    mocks.runCapturedUtilityCommand.mockImplementation(async (_command, args) => {
      if (args[0] === "-I") return { stdout: JSON.stringify(fixture.packages.map(({ name, version }) => ({ name, version: name === "yt-dlp" ? "2026.7.4" : version, dependencies: [] }))), stderr: "" };
      if (args[0] === "-c") return { stdout: "2026.7.4\n0.8.0\n", stderr: "" };
      probeStarted();
      await paused;
      return { stdout: "2026.07.04\n", stderr: "" };
    });
    const staging = stageManagedYtDlpRelease(fixture.releaseId, fixture.options);
    await started;
    const prepareBundled = vi.fn(async () => {});
    const acquiring = lifecycle.acquireLease(["yt-dlp"], prepareBundled);
    expect(prepareBundled).not.toHaveBeenCalled();
    expect(lifecycle.activeLeaseCount()).toBe(0);
    finishProbe();
    await staging;
    const lease = await acquiring;
    expect(prepareBundled).toHaveBeenCalledWith(["yt-dlp"]);
    lease.release();
    expect((await inspectManagedYtDlpCandidates(fixture.options)).selection).toBe("bundled");
  });

  it("gives the same human version with different approved bytes a distinct candidate identity", async () => {
    const fixture = await createFixture();
    await stageManagedYtDlpRelease(fixture.releaseId, fixture.options);
    const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    const next = structuredClone(manifest.releases[0]);
    const changedWheel = Buffer.concat([wheelBytes["yt-dlp"], Buffer.from("candidate-v2")]);
    next.packages[0].size = changedWheel.length;
    next.packages[0].sha256 = sha256(changedWheel);
    next.releaseId = deriveManagedYtDlpReleaseId(next);
    expect(next.releaseId).not.toBe(fixture.releaseId);
    manifest.releases.push(next);
    fixture.bytes.set(next.packages[0].provenanceUrl, changedWheel);
    await writeFile(fixture.manifestPath, JSON.stringify(manifest));
    await stageManagedYtDlpRelease(next.releaseId, fixture.options);
    expect((await inspectManagedYtDlpCandidates(fixture.options)).candidates).toHaveLength(2);
  });

  it("rejects a canonical digest whose version escapes the candidate directory", async () => {
    const fixture = await createFixture();
    const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    const entry = manifest.releases[0];
    entry.version = "../../escaped";
    entry.packages[0].version = entry.version;
    entry.packageSetId = `yt-dlp==${entry.version};yt-dlp-ejs==0.8.0`;
    entry.probe.expectedVersion = entry.version;
    entry.releaseId = deriveManagedYtDlpReleaseId(entry);
    await writeFile(fixture.manifestPath, JSON.stringify(manifest));
    await expect(stageManagedYtDlpRelease(entry.releaseId, fixture.options)).rejects.toMatchObject({ category: "approval" });
    expect(mocks.downloadToFile).not.toHaveBeenCalled();
    expect(existsSync(fixture.configDir)).toBe(false);
  });

  it("rejects catalog traversal before marker inspection", async () => {
    const fixture = await createFixture();
    await stageManagedYtDlpRelease(fixture.releaseId, fixture.options);
    const catalogPath = join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "managed-candidates.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    catalog.candidates[0].releaseId = "../../escaped";
    await writeFile(catalogPath, JSON.stringify(catalog));
    expect(await inspectManagedYtDlpCandidates(fixture.options)).toMatchObject({
      catalog: { state: "corrupt", observationError: "catalog_corrupt" },
      candidates: [{ releaseId: fixture.releaseId, observation: "marker_only" }],
    });
  });

  it.each(["{broken", JSON.stringify({ schemaVersion: 999, retained: "other candidate" })])("preserves an unreadable catalog during a stage write: %s", async (contents) => {
    const fixture = await createFixture();
    const root = join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc");
    await mkdir(root, { recursive: true });
    const catalogPath = join(root, "managed-candidates.json");
    await writeFile(catalogPath, contents);
    await expect(stageManagedYtDlpRelease(fixture.releaseId, fixture.options)).rejects.toMatchObject({ category: "materialization" });
    expect(await readFile(catalogPath, "utf8")).toBe(contents);
  });

  it("never removes a marker that appears invalid between preflight and mutation", async () => {
    const fixture = await createFixture();
    const root = join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "versions", fixture.releaseId);
    fixture.options.runMutation = async (operation) => {
      await mkdir(root, { recursive: true });
      await writeFile(join(root, "release.json"), "{invalid marker");
      await writeFile(join(root, "sentinel"), "immutable");
      return await operation();
    };
    await expect(stageManagedYtDlpRelease(fixture.releaseId, fixture.options)).resolves.toMatchObject({ eligibility: { status: "quarantined" } });
    expect(await readFile(join(root, "release.json"), "utf8")).toBe("{invalid marker");
    expect(await readFile(join(root, "sentinel"), "utf8")).toBe("immutable");
    expect(mocks.runUtilityCommand).not.toHaveBeenCalled();
  });

  it("downloads exact approved bytes, commits the marker last, and records passed eligibility separately", async () => {
    const fixture = await createFixture();
    const result = await stageManagedYtDlpRelease(fixture.releaseId, fixture.options);
    const candidateRoot = join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "versions", fixture.releaseId);

    expect(result.eligibility).toMatchObject({ status: "passed", ytDlpVersion: "2026.07.04" });
    expect(JSON.parse(await readFile(join(candidateRoot, "release.json"), "utf8"))).toMatchObject({ releaseId: fixture.releaseId });
    expect(JSON.parse(await readFile(join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "managed-candidates.json"), "utf8")))
      .toMatchObject({ candidates: [{ eligibility: { status: "passed" } }] });
    expect(mocks.downloadToFile).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ requestInit: { redirect: "error" } }));
    expect(mocks.runUtilityCommand).toHaveBeenLastCalledWith(
      expect.stringContaining("python.exe"),
      expect.arrayContaining(["--no-index", "--require-hashes", "--no-deps"]),
      expect.objectContaining({ env: expect.objectContaining({ PIP_NO_INDEX: "1", PYTHONNOUSERSITE: "1" }) }),
    );
    expect(mocks.runCapturedUtilityCommand).toHaveBeenLastCalledWith(
      expect.stringContaining("yt-dlp.exe"),
      expect.arrayContaining(["--ignore-config", "--no-plugin-dirs", "--no-remote-components", "--js-runtimes"]),
      expect.objectContaining({ timeoutMs: 4_000 }),
    );

    mocks.downloadToFile.mockClear();
    await expect(stageManagedYtDlpRelease(fixture.releaseId, fixture.options)).resolves.toMatchObject({
      eligibility: { status: "passed" },
    });
    expect(mocks.downloadToFile).not.toHaveBeenCalled();
  });

  it("removes rejected download bytes before any candidate directory exists", async () => {
    const fixture = await createFixture();
    fixture.bytes.set(fixture.packages[0]!.provenanceUrl, "corrupt");

    await expect(stageManagedYtDlpRelease(fixture.releaseId, fixture.options)).rejects.toThrow("size mismatch");
    expect(existsSync(join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "versions", fixture.releaseId))).toBe(false);
  });

  it("keeps a marker-backed candidate staged but not eligible when the bounded probe fails", async () => {
    const fixture = await createFixture();
    mocks.runCapturedUtilityCommand.mockImplementation(async (_command: string, args: string[]) => (
      args[0] === "-I" ? { stdout: JSON.stringify(fixture.packages.map(({ name, version }) => ({ name, version: name === "yt-dlp" ? "2026.7.4" : version, dependencies: [] }))), stderr: "" }
        : args[0] === "-c" ? { stdout: "2026.7.4\n0.8.0\n", stderr: "" } : { stdout: "wrong-version\n", stderr: "" }
    ));

    const result = await stageManagedYtDlpRelease(fixture.releaseId, fixture.options);
    const marker = join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "versions", fixture.releaseId, "release.json");

    expect(result.eligibility).toMatchObject({ status: "failed", reason: "version" });
    expect(existsSync(marker)).toBe(true);
  });

  it("quarantines a cache-hit candidate whose immutable wheel bytes no longer match", async () => {
    const fixture = await createFixture();
    await stageManagedYtDlpRelease(fixture.releaseId, fixture.options);
    await writeFile(join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "versions", fixture.releaseId, "wheels", fixture.packages[0]!.filename), "corrupt");

    await expect(stageManagedYtDlpRelease(fixture.releaseId, fixture.options)).resolves.toMatchObject({
      eligibility: { status: "quarantined", reason: "marker_conflict" },
    });
  });

  it("treats a stale catalog without a matching marker as quarantined and does not create userData", async () => {
    const fixture = await createFixture();
    const catalog = join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "managed-candidates.json");
    await mkdir(join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc"), { recursive: true });
    await writeFile(catalog, JSON.stringify({
      schemaVersion: 1,
      runtimeTarget: "x86_64-pc-windows-msvc",
      candidates: [{
        releaseId: fixture.releaseId,
        version: "2026.07.04",
        runtimeTarget: "x86_64-pc-windows-msvc",
        packageSetId: "yt-dlp==2026.07.04;yt-dlp-ejs==0.8.0",
        stage: "committed",
        eligibility: { status: "passed", probedAtMs: 1, pythonManifestEntryDigest: sha256("python"), pythonIdentityDigest: sha256("python-identity") },
      }],
    }));

    const inspection = await inspectManagedYtDlpCandidates(fixture.options);

    expect(inspection.candidates).toMatchObject([{ eligibility: { status: "passed" }, observation: "marker_mismatch" }]);
    expect(fixture.options.prepareProbeDependencies).not.toHaveBeenCalled();
  });

  it("revalidates the immutable materialization and complete current dependency proof on a cache hit", async () => {
    const fixture = await createFixture();
    await stageManagedYtDlpRelease(fixture.releaseId, fixture.options);
    const root = join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "versions", fixture.releaseId);
    await rm(join(root, "venv", "Scripts", "yt-dlp.exe"));
    await expect(stageManagedYtDlpRelease(fixture.releaseId, fixture.options)).resolves.toMatchObject({ eligibility: { status: "quarantined" } });

    const dependencyFixture = await createFixture();
    await stageManagedYtDlpRelease(dependencyFixture.releaseId, dependencyFixture.options);
    const changed = await dependencyFixture.options.prepareProbeDependencies();
    changed.mediaTools.deno.observedSha256 = sha256("changed-deno");
    dependencyFixture.options.prepareProbeDependencies.mockResolvedValue(changed);
    await expect(stageManagedYtDlpRelease(dependencyFixture.releaseId, dependencyFixture.options)).resolves.toMatchObject({ eligibility: { status: "quarantined" } });
  });

  it("requires a complete cache record but keeps committed marker bytes immutable", async () => {
    const fixture = await createFixture();
    await stageManagedYtDlpRelease(fixture.releaseId, fixture.options);
    const catalogPath = join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "managed-candidates.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    catalog.candidates[0].packageSetId = "yt-dlp==1;yt-dlp-ejs==0.8.0";
    delete catalog.candidates[0].eligibility.ytDlpVersion;
    delete catalog.candidates[0].eligibility.denoIdentityDigest;
    await writeFile(catalogPath, JSON.stringify(catalog));
    await expect(stageManagedYtDlpRelease(fixture.releaseId, fixture.options)).resolves.toMatchObject({ eligibility: { status: "quarantined" } });
    expect(existsSync(join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "versions", fixture.releaseId, "release.json"))).toBe(true);
  });

  it("distinguishes marker-only and marker-mismatch observations without inventing eligibility", async () => {
    const fixture = await createFixture();
    await stageManagedYtDlpRelease(fixture.releaseId, fixture.options);
    const targetRoot = join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc");
    await rm(join(targetRoot, "managed-candidates.json"));
    await expect(inspectManagedYtDlpCandidates(fixture.options)).resolves.toMatchObject({
      candidates: [{ releaseId: fixture.releaseId, observation: "marker_only" }],
    });

    expect((await inspectManagedYtDlpCandidates(fixture.options)).candidates[0]).not.toHaveProperty("eligibility");

    const mismatchFixture = await createFixture();
    await stageManagedYtDlpRelease(mismatchFixture.releaseId, mismatchFixture.options);
    const mismatchRoot = join(mismatchFixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc");
    const persisted = JSON.parse(await readFile(join(mismatchRoot, "managed-candidates.json"), "utf8"));
    await rm(join(mismatchRoot, "versions", mismatchFixture.releaseId, "release.json"));
    const observed = await inspectManagedYtDlpCandidates(mismatchFixture.options);
    expect(observed.candidates[0]?.eligibility).toEqual(persisted.candidates[0].eligibility);
    expect(observed.candidates[0]?.observation).toBe("marker_mismatch");
  });

  it("sanitizes corrupt persisted proof strings and bounds every candidate subprocess", async () => {
    const fixture = await createFixture();
    await stageManagedYtDlpRelease(fixture.releaseId, fixture.options);
    const targetRoot = join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc");
    const catalogPath = join(targetRoot, "managed-candidates.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    catalog.candidates[0].eligibility.ytDlpVersion = "C:\\Users\\Secret\\private";
    catalog.candidates[0].eligibility.denoIdentityDigest = "https://user:password@example.test/private";
    await writeFile(catalogPath, JSON.stringify(catalog));
    expect(JSON.stringify(await inspectManagedYtDlpCandidates(fixture.options))).not.toMatch(/Secret|password/);

    const isolatedFixture = await createFixture();
    await stageManagedYtDlpRelease(isolatedFixture.releaseId, isolatedFixture.options);
    const calls = [...mocks.runUtilityCommand.mock.calls, ...mocks.runCapturedUtilityCommand.mock.calls];
    expect(calls.every((call) => call[2]?.timeoutMs > 0 && call[2]?.env?.PYTHONNOUSERSITE === "1")).toBe(true);
    expect(mocks.runCapturedUtilityCommand.mock.calls.at(-1)?.[1]).toContain("--ffmpeg-location");
  });

  it.each(["launcher", "python", "package"])("rejects changed installed %s bytes with retained clean wheels before executing them", async (kind) => {
    const fixture = await createFixture();
    await stageManagedYtDlpRelease(fixture.releaseId, fixture.options);
    const root = join(fixture.configDir, "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "versions", fixture.releaseId);
    const marker = await readFile(join(root, "release.json"), "utf8");
    const file = kind === "package" ? join(root, "venv", "Lib", "site-packages", "yt_dlp", "__init__.py") : join(root, "venv", "Scripts", kind === "python" ? "python.exe" : "yt-dlp.exe");
    await writeFile(file, "changed installed bytes");
    mocks.runCapturedUtilityCommand.mockClear();
    mocks.downloadToFile.mockClear();
    expect((await stageManagedYtDlpRelease(fixture.releaseId, fixture.options)).eligibility.status).toBe("quarantined");
    expect(mocks.runCapturedUtilityCommand).not.toHaveBeenCalled();
    expect(mocks.downloadToFile).not.toHaveBeenCalled();
    expect(await readFile(join(root, "release.json"), "utf8")).toBe(marker);
    for (const pkg of fixture.packages) expect(sha256(await readFile(join(root, "wheels", pkg.filename)))).toBe(pkg.sha256);
  });

  it.each(["python-bytes", "python-version", "python-target", "ffmpeg-artifact", "ffprobe-bytes", "deno-version"])("revalidates full mutation-local dependency identity: %s", async (field) => {
    const fixture = await createFixture();
    await stageManagedYtDlpRelease(fixture.releaseId, fixture.options);
    const changed = await fixture.options.prepareProbeDependencies();
    if (field === "python-bytes") changed.python.observedSha256 = sha256("changed");
    if (field === "python-version") changed.python.version = "Python 3.14.0";
    if (field === "python-target") changed.python.target = "aarch64-apple-darwin";
    if (field === "ffmpeg-artifact") changed.mediaTools.ffmpeg.artifactSha256 = sha256("changed");
    if (field === "ffprobe-bytes") changed.mediaTools.ffprobe.observedSha256 = sha256("changed");
    if (field === "deno-version") changed.mediaTools.deno.version = "2.0.0";
    fixture.options.prepareProbeDependencies.mockResolvedValue(changed);
    expect((await stageManagedYtDlpRelease(fixture.releaseId, fixture.options)).eligibility.status).toBe("quarantined");
  });

  it("uses only declared transport bytes while preserving metadata provenance", async () => {
    const fixture = await createFixture();
    const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    const release = manifest.releases[0];
    for (const pkg of release.packages) {
      pkg.downloadUrl = pkg.provenanceUrl;
      pkg.provenanceUrl = `https://pypi.org/pypi/${pkg.name}/${pkg.version}/json`;
    }
    release.releaseId = releaseIdFor(release);
    await writeFile(fixture.manifestPath, JSON.stringify(manifest));
    await expect(stageManagedYtDlpRelease(release.releaseId, fixture.options)).resolves.toMatchObject({ eligibility: { status: "passed" } });
    expect(mocks.downloadToFile.mock.calls.map(([url]) => url)).toEqual(fixture.packages.map((pkg) => pkg.provenanceUrl));
    expect(mocks.downloadToFile.mock.calls.some(([url]) => url.includes("pypi.org"))).toBe(false);
  });

  it("does not persist raw failed probe output or use process text to classify a download", async () => {
    const fixture = await createFixture();
    const run = mocks.runCapturedUtilityCommand.getMockImplementation()!;
    mocks.runCapturedUtilityCommand.mockImplementation((command, args, options) => args.includes("--version") ? { stdout: "C:/Users/Secret/access-token\n", stderr: "" } : run(command, args, options));
    const result = await stageManagedYtDlpRelease(fixture.releaseId, fixture.options);
    expect(result.eligibility).toMatchObject({ status: "failed", reason: "version" });
    expect(result.eligibility).not.toHaveProperty("ytDlpVersion");
    expect(JSON.stringify(await inspectManagedYtDlpCandidates(fixture.options))).not.toContain("Secret");
    const other = await createFixture();
    mocks.downloadToFile.mockRejectedValue(new Error("checksum mismatch https://user:password@example.test"));
    await expect(stageManagedYtDlpRelease(other.releaseId, other.options)).rejects.toMatchObject({ category: "download", message: "Managed yt-dlp download failed" });
  });

  it.each(["wheel", "target"])("rejects an invalid approved %s before network", async (field) => {
    const fixture = await createFixture();
    const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    const release = manifest.releases[0];
    if (field === "wheel") release.packages[0].filename = "other-1-cp311-cp311-linux_x86_64.whl";
    else release.runtimeTargets = ["unsupported"];
    release.releaseId = releaseIdFor(release);
    await writeFile(fixture.manifestPath, JSON.stringify(manifest));
    await expect(stageManagedYtDlpRelease(release.releaseId, fixture.options)).rejects.toMatchObject({ category: "approval" });
    expect(mocks.downloadToFile).not.toHaveBeenCalled();
  });

  it("checks a real deterministic wheel archive before materialization", async () => {
    const fixture = await createFixture();
    await expect(validateYtDlpWheelArchive(wheelBytes["yt-dlp"], fixture.packages[0]!, fixture.packages)).resolves.toBeUndefined();
    await expect(validateYtDlpWheelArchive(Buffer.from("not a ZIP"), fixture.packages[0]!, fixture.packages)).rejects.toThrow();
    const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    const release = manifest.releases[0];
    const invalidWheel = Buffer.from("not a ZIP");
    fixture.options.runMutation = vi.fn(fixture.options.runMutation);
    release.packages[0].size = invalidWheel.length;
    release.packages[0].sha256 = sha256(invalidWheel);
    release.releaseId = deriveManagedYtDlpReleaseId(release);
    fixture.bytes.set(release.packages[0].provenanceUrl, invalidWheel);
    await writeFile(fixture.manifestPath, JSON.stringify(manifest));
    await expect(stageManagedYtDlpRelease(release.releaseId, fixture.options)).rejects.toMatchObject({ category: "integrity" });
    expect(mocks.runUtilityCommand).not.toHaveBeenCalled();
    expect(fixture.options.runMutation).not.toHaveBeenCalled();
  });
});
