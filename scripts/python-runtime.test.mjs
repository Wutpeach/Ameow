import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertBundledPythonRuntimeReady,
  ensureOfficialBundledPythonRuntime,
  isCurrentHostTarget,
  resolveBundledPythonExecutable,
  resolveBundledPythonRuntimeDirForStore,
  resolvePythonRuntimeSpec,
  resolveTargetFromBuilderArgs,
} from "./python-runtime.mjs";

const temporaryStores = [];

const createRuntimeStore = () => {
  const binariesDir = mkdtempSync(path.join(tmpdir(), "ameow-python-runtime-test-"));
  const store = {
    binariesDir,
    manifestPath: path.join(binariesDir, ".official-python-runtimes.json"),
  };
  temporaryStores.push(binariesDir);
  return store;
};

afterEach(() => {
  while (temporaryStores.length > 0) {
    rmSync(temporaryStores.pop(), { recursive: true, force: true });
  }
});

describe("isCurrentHostTarget", () => {
  it("returns true when target matches the host platform and arch", () => {
    expect(isCurrentHostTarget("x86_64-pc-windows-msvc", "win32", "x64")).toBe(true);
    expect(isCurrentHostTarget("aarch64-apple-darwin", "darwin", "arm64")).toBe(true);
    expect(isCurrentHostTarget("x86_64-apple-darwin", "darwin", "x64")).toBe(true);
  });

  it("returns false when target does not match the host platform or arch", () => {
    expect(isCurrentHostTarget("aarch64-apple-darwin", "win32", "x64")).toBe(false);
    expect(isCurrentHostTarget("x86_64-pc-windows-msvc", "darwin", "arm64")).toBe(false);
    expect(isCurrentHostTarget("x86_64-apple-darwin", "darwin", "arm64")).toBe(false);
  });
});

describe("resolveTargetFromBuilderArgs", () => {
  it("detects electron-builder platform arguments even when the flag has a target value", () => {
    expect(resolveTargetFromBuilderArgs(["--mac", "zip"])).toBe("x86_64-apple-darwin");
    expect(resolveTargetFromBuilderArgs(["--mac", "zip", "--arm64"])).toBe("aarch64-apple-darwin");
    expect(resolveTargetFromBuilderArgs(["--win", "nsis", "--x64"])).toBe("x86_64-pc-windows-msvc");
  });
});

describe("ensureOfficialBundledPythonRuntime", () => {
  it("does not execute cached non-host runtimes during cross-target preparation", async () => {
    const target = "aarch64-apple-darwin";
    const spec = resolvePythonRuntimeSpec(target);
    const store = createRuntimeStore();
    const pythonDir = resolveBundledPythonRuntimeDirForStore(target, store);
    const executablePath = resolveBundledPythonExecutable(target, store);

    mkdirSync(path.dirname(executablePath), { recursive: true });
    writeFileSync(executablePath, "not-a-real-python");
    writeFileSync(
      store.manifestPath,
      `${JSON.stringify({
        schemaVersion: 1,
        runtimes: {
          [target]: {
            target,
            releaseTag: "20260325",
            pythonVersion: "3.11.15",
            assetName: spec.assetName,
            downloadUrl: spec.downloadUrl,
            sha256: spec.sha256,
            size: spec.size,
            executableRelativePath: spec.executableRelativePath,
            preparedAt: "2026-05-21T00:00:00.000Z",
          },
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const result = await ensureOfficialBundledPythonRuntime(target, { ...store, force: false });

    expect(result).toMatchObject({
      target,
      path: pythonDir,
      executable: executablePath,
      state: "present",
      pythonVersion: "3.11.15",
    });
  });
});

describe("assertBundledPythonRuntimeReady", () => {
  it("requires a pinned manifest entry and executable for the target", async () => {
    const target = "aarch64-apple-darwin";
    const spec = resolvePythonRuntimeSpec(target);
    const store = createRuntimeStore();
    const pythonDir = resolveBundledPythonRuntimeDirForStore(target, store);
    const executablePath = resolveBundledPythonExecutable(target, store);

    mkdirSync(path.dirname(executablePath), { recursive: true });
    writeFileSync(executablePath, "not-a-real-python");
    writeFileSync(
      store.manifestPath,
      `${JSON.stringify({
        schemaVersion: 1,
        runtimes: {
          [target]: {
            target,
            releaseTag: "20260325",
            pythonVersion: "3.11.15",
            assetName: spec.assetName,
            downloadUrl: spec.downloadUrl,
            sha256: spec.sha256,
            size: spec.size,
            executableRelativePath: spec.executableRelativePath,
            preparedAt: "2026-05-21T00:00:00.000Z",
          },
        },
      }, null, 2)}\n`,
      "utf8",
    );

    await expect(assertBundledPythonRuntimeReady(target, store)).resolves.toMatchObject({
      target,
      path: pythonDir,
      executable: executablePath,
      pythonVersion: "3.11.15",
    });
  });

  it("fails when the pinned manifest entry is missing", async () => {
    const target = "aarch64-apple-darwin";
    const store = createRuntimeStore();

    writeFileSync(
      store.manifestPath,
      `${JSON.stringify({ schemaVersion: 1, runtimes: {} }, null, 2)}\n`,
      "utf8",
    );

    await expect(assertBundledPythonRuntimeReady(target, store)).rejects.toThrow(
      "Bundled Python runtime manifest is missing target aarch64-apple-darwin",
    );
  });
});
