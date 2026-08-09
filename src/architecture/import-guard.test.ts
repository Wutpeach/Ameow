import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture regression guard: Domain (`src/core`) and Application
 * (`src/orchestration`, `src/engines`, `src/sites`) must stay runtime-neutral
 * and may never import Electron, project Electron modules, `src/electron-runtime`
 * implementations, or renderer/protocol payload modules (`src/types`).
 * Infrastructure may import Domain/Application, never the reverse.
 *
 * This is a static import-scan test because ESLint `no-restricted-imports`
 * cannot reliably match the relative specifier spellings used across depths.
 * The whole mixed `src/download-capabilities` directory is intentionally not
 * guarded: `probe.ts` spawns downloader binaries, which is Infrastructure
 * behavior.
 */

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const srcRoot = path.join(repoRoot, "src");

const GUARDED_DIRS = ["core", "orchestration", "engines", "sites"];

const FORBIDDEN_PACKAGE_PREFIXES = ["electron"];

const FORBIDDEN_SRC_DIRS = ["electron-runtime", "types"];

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

  it("blocks Domain (src/core) imports of Application layers", () => {
    const violations: string[] = [];
    const applicationDirs = ["orchestration", "engines", "sites", "download-capabilities", "config"];

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
      'import type { VideoQueueDetailPayload } from "../types/videoRuntime.js";',
      "src/types/videoRuntime.ts",
    );
    // Bare Electron package import; node built-ins stay allowed.
    expect(collectRuntimeImportViolations(
      'import { app } from "electron";\nimport { readFileSync } from "node:fs";',
      coreFile,
    )).toEqual([`src/core/fake.ts imports "electron" (forbidden package)`]);
  });
});
