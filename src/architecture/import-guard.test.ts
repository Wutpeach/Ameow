import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture regression guard: Domain (`src/core`) and Application
 * (`src/orchestration`, `src/engines`, `src/sites`) must stay runtime-neutral
 * and may never import Electron, project Electron modules, `src/electron-runtime`
 * implementations, or renderer/protocol payload modules (`src/types`,
 * `src/protocol`). Infrastructure may import Domain/Application, never the
 * reverse.
 *
 * This is a static import-scan test because ESLint `no-restricted-imports`
 * cannot reliably match the relative specifier spellings used across depths.
 * The whole mixed `src/download-capabilities` directory is intentionally not
 * guarded: `probe.ts` spawns downloader binaries, which is Infrastructure
 * behavior.
 */

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const srcRoot = path.join(repoRoot, "src");

const GUARDED_DIRS = ["core", "orchestration", "engines", "sites", "application"];

const FORBIDDEN_PACKAGE_PREFIXES = ["electron"];

const FORBIDDEN_SRC_DIRS = ["electron-runtime", "types", "protocol"];

const FORBIDDEN_PROJECT_DIR = "electron";

const IMPORT_PATTERN =
  /(?:import|export)\s+(?:type\s+)?[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const collectSourceFiles = (dir: string): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
};

const toRepoRelative = (target: string): string => {
  const relative = path.relative(repoRoot, target).replace(/\\/g, "/");
  return relative.startsWith("..") ? `[outside-repo]${relative}` : relative;
};

const describeViolation = (file: string, specifier: string, target: string): string => (
  `${toRepoRelative(file)} imports "${specifier}" -> forbidden target ${toRepoRelative(target)}`
);

/**
 * Resolves a specifier to the on-disk file it names. Source imports use `.js`
 * specifiers pointing at `.ts` sources, and the Electron host is `.mts`, so
 * both spellings (and the extensionless form) are tried before giving up.
 * Node built-ins resolve to null and stay allowed.
 */
const resolveSpecifierTarget = (
  file: string,
  specifier: string,
): string | null => {
  if (specifier.startsWith(".")) {
    const base = path.resolve(path.dirname(file), specifier);
    const candidates = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.mts`,
      `${base}.js`,
      base.replace(/\.js$/, ".ts"),
      base.replace(/\.js$/, ".tsx"),
      base.replace(/\.js$/, ".mts"),
    ];
    const existing = candidates.find((candidate) => {
      try {
        return statSync(candidate).isFile();
      } catch {
        return false;
      }
    });
    return existing ?? null;
  }
  if (specifier.startsWith("node:")) {
    return null;
  }
  return path.join(repoRoot, "node_modules", specifier.split("/")[0]);
};

/**
 * Scans one source file for imports that would pull Electron, the runtime
 * implementation, or renderer/protocol payload modules into Domain/Application.
 * Exported so the guard logic is provable against representative specifiers.
 */
export const collectRuntimeImportViolations = (
  source: string,
  file: string,
): string[] => {
  const violations: string[] = [];

  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = (match[1] ?? match[2]).trim();
    if (!specifier) {
      continue;
    }

    // Bare Electron package imports.
    if (FORBIDDEN_PACKAGE_PREFIXES.some((prefix) => (
      specifier === prefix || specifier.startsWith(`${prefix}/`)
    ))) {
      violations.push(`${toRepoRelative(file)} imports "${specifier}" (forbidden package)`);
      continue;
    }

    const target = resolveSpecifierTarget(file, specifier);
    if (!target) {
      continue;
    }
    const repoRelative = toRepoRelative(target);

    // Project `electron/` directory modules (electron/main.mts etc.).
    if (repoRelative === FORBIDDEN_PROJECT_DIR || repoRelative.startsWith(`${FORBIDDEN_PROJECT_DIR}/`)) {
      violations.push(describeViolation(file, specifier, target));
      continue;
    }

    // Infrastructure and renderer/protocol payload directories.
    if (FORBIDDEN_SRC_DIRS.some((forbidden) => (
      repoRelative === `src/${forbidden}` || repoRelative.startsWith(`src/${forbidden}/`)
    ))) {
      violations.push(describeViolation(file, specifier, target));
      continue;
    }
  }

  return violations;
};

const scanGuardedDir = (dir: string): string[] => {
  const violations: string[] = [];
  for (const file of collectSourceFiles(path.join(srcRoot, dir))) {
    violations.push(...collectRuntimeImportViolations(readFileSync(file, "utf8"), file));
  }
  return violations;
};

describe("runtime-neutral import guard", () => {
  it("blocks Domain/Application imports of Electron, runtime, or protocol payload modules", () => {
    const violations = GUARDED_DIRS.flatMap(scanGuardedDir);

    expect(violations, [
      "Domain/Application must not depend on Electron, electron-runtime, or protocol payload modules.",
      ...violations,
    ].join("\n")).toEqual([]);
  });

  it("scans the application directory against the same forbidden imports", () => {
    const violations = scanGuardedDir("application");
    expect(violations, [
      "Application must stay Electron-neutral: no Electron, electron-runtime, or protocol payload imports.",
      ...violations,
    ].join("\n")).toEqual([]);
  });

  it("blocks Domain (src/core) imports of Application layers", () => {
    const violations: string[] = [];
    const applicationDirs = ["orchestration", "engines", "sites", "download-capabilities", "config", "application"];

    for (const file of collectSourceFiles(path.join(srcRoot, "core"))) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(IMPORT_PATTERN)) {
        const specifier = (match[1] ?? match[2]).trim();
        if (!specifier || !specifier.startsWith(".")) {
          continue;
        }
        const target = resolveSpecifierTarget(file, specifier);
        if (!target) {
          continue;
        }
        const repoRelative = toRepoRelative(target);
        if (applicationDirs.some((dir) => (
          repoRelative === `src/${dir}` || repoRelative.startsWith(`src/${dir}/`)
        ))) {
          violations.push(describeViolation(file, specifier, target));
        }
      }
    }

    expect(violations, [
      "Domain (src/core) must not import Application layers.",
      ...violations,
    ].join("\n")).toEqual([]);
  });

  it("flags representative forbidden specifiers in real repo spellings", () => {
    const coreFile = path.join(srcRoot, "core", "fake.ts");
    const flag = (source: string, expectedTarget: string): void => {
      const violations = collectRuntimeImportViolations(source, coreFile);
      expect(violations, `expected a violation for ${expectedTarget}`).toHaveLength(1);
      expect(violations[0]).toContain(expectedTarget);
    };

    // `.js` specifier pointing at a `.ts` source in the runtime.
    flag(
      'import { runYtDlpDownload } from "../electron-runtime/ytDlpDownload.js";',
      "src/electron-runtime/ytDlpDownload.ts",
    );
    // `.mts` specifier pointing at the Electron host (repo-root sibling of src/).
    flag(
      'import { bootstrapMain } from "../../electron/main.mts";',
      "electron/main.mts",
    );
    // `.js` specifier pointing at renderer/protocol payload modules.
    flag(
      'import type { VideoQueueDetailPayload } from "../types/electronBridge.js";',
      "src/types/electronBridge.ts",
    );
    // `.js` specifier pointing at the protocol download DTOs.
    flag(
      'import type { VideoQueueDetailPayload } from "../protocol/download/ipcTypes.js";',
      "src/protocol/download/ipcTypes.ts",
    );
    // `.js` specifier pointing at the protocol compatibility mappers.
    flag(
      'import { decodeQueueDownloadCommand } from "../protocol/download/ipcMappers.js";',
      "src/protocol/download/ipcMappers.ts",
    );
    // Project Electron download adapters.
    flag(
      'import { createDownloadIpcAdapter } from "../../electron/downloadIpcAdapter.mts";',
      "electron/downloadIpcAdapter.mts",
    );
    flag(
      'import { createDownloadWsAdapter } from "../../electron/downloadWsAdapter.mts";',
      "electron/downloadWsAdapter.mts",
    );
    // Bare Electron package import; node built-ins stay allowed.
    expect(collectRuntimeImportViolations(
      'import { app } from "electron";\nimport { readFileSync } from "node:fs";',
      coreFile,
    )).toEqual([`src/core/fake.ts imports "electron" (forbidden package)`]);
  });

  it("enforces the guard at Site and Application layers in real specifier spellings", () => {
    const sitesFile = path.join(srcRoot, "sites", "fake.ts");
    const applicationFile = path.join(srcRoot, "application", "fake.ts");
    const flag = (source: string, file: string, expectedTarget: string): void => {
      const violations = collectRuntimeImportViolations(source, file);
      expect(violations, `expected a violation for ${expectedTarget}`).toHaveLength(1);
      expect(violations[0]).toContain(expectedTarget);
    };

    // Site layer -> concrete engine adapter.
    flag(
      'import { buildYtDlpEngineAdapter } from "../electron-runtime/ytDlpEngineAdapter.js";',
      sitesFile,
      "src/electron-runtime/ytDlpEngineAdapter.ts",
    );
    // Application layer -> protocol download DTO.
    flag(
      'import type { VideoQueueDetailPayload } from "../protocol/download/ipcTypes.js";',
      applicationFile,
      "src/protocol/download/ipcTypes.ts",
    );
    // Application layer -> concrete engine adapter.
    flag(
      'import { buildYtDlpEngineAdapter } from "../electron-runtime/ytDlpEngineAdapter.js";',
      applicationFile,
      "src/electron-runtime/ytDlpEngineAdapter.ts",
    );
  });
});

/**
 * P4 feature boundary guard. Renderer features (`src/features/**`) own their
 * lifecycle and UI state; they must never depend on Electron, the project
 * `electron/` host, `src/electron-runtime` implementations, Domain/Engine
 * infrastructure (`src/core`, `src/engines`, `src/download-capabilities`), or
 * another feature's internal paths. Top-level feature files are the explicit
 * public surface for app-level composition.
 *
 * Download `model`/`reducer`/`selectors` additionally must not import
 * `src/protocol` or desktop runtime modules (`src/desktop`): protocol DTOs
 * stop at the concrete client adapter and never become feature state.
 */

const FEATURES_ROOT = path.join(srcRoot, "features");

const FEATURE_FORBIDDEN_SRC_DIRS = ["core", "engines", "download-capabilities", "electron-runtime"];

const DOWNLOAD_STATE_MODULES = [
  "src/features/download/model.ts",
  "src/features/download/reducer.ts",
  "src/features/download/selectors.ts",
];

const DOWNLOAD_STATE_FORBIDDEN_SRC_DIRS = ["protocol", "desktop", "electron-runtime"];

const featureDirOf = (file: string): string | null => {
  const relative = path.relative(FEATURES_ROOT, file).replace(/\\/g, "/");
  const firstSegment = relative.split("/")[0];
  return firstSegment && firstSegment !== ".." ? firstSegment : null;
};

/**
 * Scans one feature file for imports that would pull Electron, the runtime
 * implementation, Domain/Engine infrastructure, or another feature's internal
 * paths into the feature layer. Exported so the guard logic is provable
 * against representative specifiers.
 */
export const collectFeatureImportViolations = (
  source: string,
  file: string,
): string[] => {
  const violations: string[] = [];
  const featureDir = featureDirOf(file);

  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = (match[1] ?? match[2]).trim();
    if (!specifier) {
      continue;
    }

    // Bare Electron package imports.
    if (FORBIDDEN_PACKAGE_PREFIXES.some((prefix) => (
      specifier === prefix || specifier.startsWith(`${prefix}/`)
    ))) {
      violations.push(`${toRepoRelative(file)} imports "${specifier}" (forbidden package)`);
      continue;
    }

    // Cross-feature internal imports are banned; top-level feature files are
    // the explicit public surface for app-level composition. Checked at
    // specifier level so it also covers not-yet-existing targets (only one
    // feature exists today, so it cannot fire on real code).
    if (featureDir && specifier.startsWith(".")) {
      const unresolvedTarget = toRepoRelative(path.resolve(path.dirname(file), specifier));
      const otherFeaturePrefix = unresolvedTarget.startsWith("src/features/")
        ? `src/features/${unresolvedTarget.slice("src/features/".length).split("/")[0]}/`
        : null;
      const remainder = otherFeaturePrefix && unresolvedTarget.startsWith(otherFeaturePrefix)
        ? unresolvedTarget.slice(otherFeaturePrefix.length)
        : null;
      if (remainder !== null && remainder.includes("/")) {
        violations.push(`${toRepoRelative(file)} imports "${specifier}" -> forbidden target ${unresolvedTarget}`);
      }
    }

    const target = resolveSpecifierTarget(file, specifier);
    if (!target) {
      continue;
    }
    const repoRelative = toRepoRelative(target);

    // Project `electron/` directory modules (electron/main.mts etc.).
    if (repoRelative === FORBIDDEN_PROJECT_DIR || repoRelative.startsWith(`${FORBIDDEN_PROJECT_DIR}/`)) {
      violations.push(describeViolation(file, specifier, target));
      continue;
    }

    // Infrastructure/Domain/Engine and runtime implementation directories.
    if (FEATURE_FORBIDDEN_SRC_DIRS.some((forbidden) => (
      repoRelative === `src/${forbidden}` || repoRelative.startsWith(`src/${forbidden}/`)
    ))) {
      violations.push(describeViolation(file, specifier, target));
      continue;
    }
  }

  return violations;
};

const scanFeaturesDir = (): string[] => {
  const violations: string[] = [];
  for (const file of collectSourceFiles(FEATURES_ROOT)) {
    violations.push(...collectFeatureImportViolations(readFileSync(file, "utf8"), file));
  }
  return violations;
};

/**
 * Scans the Download lifecycle state modules for protocol/desktop runtime
 * imports. These files must stay protocol-free so DTOs never become
 * long-lived feature state.
 */
export const collectDownloadStateViolations = (source: string, file: string): string[] => {
  const violations: string[] = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = (match[1] ?? match[2]).trim();
    if (!specifier) {
      continue;
    }
    const target = resolveSpecifierTarget(file, specifier);
    if (!target) {
      continue;
    }
    const repoRelative = toRepoRelative(target);
    if (DOWNLOAD_STATE_FORBIDDEN_SRC_DIRS.some((forbidden) => (
      repoRelative === `src/${forbidden}` || repoRelative.startsWith(`src/${forbidden}/`)
    ))) {
      violations.push(describeViolation(file, specifier, target));
    }
  }
  return violations;
};

describe("P4 feature import guard", () => {
  it("keeps all feature files free of Electron, runtime, and Domain/Engine imports", () => {
    const violations = scanFeaturesDir();
    expect(violations, [
      "Feature files must not depend on Electron, electron-runtime, or Domain/Engine infrastructure.",
      ...violations,
    ].join("\n")).toEqual([]);
  });

  it("keeps Download model/reducer/selectors free of protocol and desktop runtime imports", () => {
    const violations: string[] = [];
    for (const relative of DOWNLOAD_STATE_MODULES) {
      const file = path.join(repoRoot, relative);
      violations.push(...collectDownloadStateViolations(readFileSync(file, "utf8"), file));
    }
    expect(violations, [
      "Download model/reducer/selectors must not import src/protocol or desktop runtime modules.",
      ...violations,
    ].join("\n")).toEqual([]);
  });

  it("flags representative forbidden feature specifiers in real repo spellings", () => {
    const featureFile = path.join(srcRoot, "features", "download", "fake.ts");
    const flag = (source: string, expectedTarget: string): void => {
      const violations = collectFeatureImportViolations(source, featureFile);
      expect(violations, `expected a violation for ${expectedTarget}`).toHaveLength(1);
      expect(violations[0]).toContain(expectedTarget);
    };

    flag('import { app } from "electron";', "forbidden package");
    flag(
      'import { runYtDlpDownload } from "../../electron-runtime/ytDlpDownload.js";',
      "src/electron-runtime/ytDlpDownload.ts",
    );
    flag(
      'import { bootstrapMain } from "../../../electron/main.mts";',
      "electron/main.mts",
    );
    // Domain (src/core) and Engine (src/engines) infrastructure.
    flag(
      'import { isVideoUrl } from "../../core/video-candidate-normalization.js";',
      "src/core/video-candidate-normalization.ts",
    );
    flag(
      'import { selectEngine } from "../../engines/engine-registry.js";',
      "src/engines/engine-registry.ts",
    );
    // Downloader infrastructure.
    flag(
      'import { probeDownloader } from "../../download-capabilities/probe.js";',
      "src/download-capabilities/probe.ts",
    );
    // Another feature's internal path is banned; top-level feature files stay allowed.
    flag(
      'import { useTranscode } from "../transcode/components/useTranscode.js";',
      "src/features/transcode/components/useTranscode.js",
    );
    expect(collectFeatureImportViolations(
      'import { useTranscode } from "../transcode/useTranscode.js";',
      featureFile,
    )).toEqual([]);
  });

  it("flags protocol/desktop imports in Download lifecycle state modules", () => {
    const stateFile = path.join(srcRoot, "features", "download", "model.ts");
    const flag = (source: string, expectedTarget: string): void => {
      const violations = collectDownloadStateViolations(source, stateFile);
      expect(violations, `expected a violation for ${expectedTarget}`).toHaveLength(1);
      expect(violations[0]).toContain(expectedTarget);
    };

    flag(
      'import type { VideoQueueDetailPayload } from "../../protocol/download/ipcTypes.js";',
      "src/protocol/download/ipcTypes.ts",
    );
    flag(
      'import { desktopEvents } from "../../desktop/runtime.js";',
      "src/desktop/runtime.ts",
    );
  });
});

/**
 * P6 reverse guard. The concrete per-engine files in `src/electron-runtime`
 * (adapters, runners, download commands) are per-engine Infrastructure: each
 * executes one CLI and must never reach into Site providers (`src/sites`) or
 * renderer features (`src/features`). The scan covers only those concrete
 * files, never the service/composition layer, which legitimately composes
 * providers and the registry.
 */

const RUNTIME_CONCRETE_FILE_PATTERN = /(?:EngineAdapter|EngineRunner|Download)\.ts$/;

const RUNTIME_FORBIDDEN_SRC_DIRS = ["sites", "features"];

/**
 * Scans one concrete engine file for imports that would pull Site providers or
 * renderer features into per-engine Infrastructure. Exported so the guard
 * logic is provable against representative specifiers. Resolution is done at
 * specifier level (matching the cross-feature check) so it also covers
 * not-yet-existing targets.
 */
export const collectConcreteEngineImportViolations = (
  source: string,
  file: string,
): string[] => {
  const violations: string[] = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = (match[1] ?? match[2]).trim();
    if (!specifier || !specifier.startsWith(".")) {
      continue;
    }
    const unresolvedTarget = toRepoRelative(path.resolve(path.dirname(file), specifier));
    if (RUNTIME_FORBIDDEN_SRC_DIRS.some((forbidden) => (
      unresolvedTarget === `src/${forbidden}` || unresolvedTarget.startsWith(`src/${forbidden}/`)
    ))) {
      violations.push(`${toRepoRelative(file)} imports "${specifier}" -> forbidden target ${unresolvedTarget}`);
    }
  }
  return violations;
};

const scanConcreteEngineFiles = (): string[] => {
  const violations: string[] = [];
  for (const file of collectSourceFiles(path.join(srcRoot, "electron-runtime"))) {
    if (!RUNTIME_CONCRETE_FILE_PATTERN.test(file)) {
      continue;
    }
    violations.push(...collectConcreteEngineImportViolations(readFileSync(file, "utf8"), file));
  }
  return violations;
};

describe("P6 concrete engine import guard", () => {
  it("keeps concrete engine adapters/runners/downloads free of Site and feature imports", () => {
    const violations = scanConcreteEngineFiles();
    expect(violations, [
      "Concrete engine files must not import src/sites or src/features.",
      ...violations,
    ].join("\n")).toEqual([]);
  });

  it("flags Site and feature imports from concrete engine files", () => {
    const adapterFile = path.join(srcRoot, "electron-runtime", "fakeEngineAdapter.ts");
    const runnerFile = path.join(srcRoot, "electron-runtime", "fakeEngineRunner.ts");
    const downloadFile = path.join(srcRoot, "electron-runtime", "fakeEngineDownload.ts");
    const flag = (source: string, file: string, expectedTarget: string): void => {
      const violations = collectConcreteEngineImportViolations(source, file);
      expect(violations, `expected a violation for ${expectedTarget}`).toHaveLength(1);
      expect(violations[0]).toContain(expectedTarget);
    };

    flag(
      'import { resolveYoutubeProvider } from "../sites/youtube.js";',
      adapterFile,
      "src/sites/youtube.js",
    );
    flag(
      'import { selectDownloadModel } from "../features/download/model.js";',
      downloadFile,
      "src/features/download/model.js",
    );
    // Unrelated relative imports stay allowed.
    expect(collectConcreteEngineImportViolations(
      'import { classifyNetworkFailure } from "../config/networkRoute.js";',
      runnerFile,
    )).toEqual([]);
  });
});
