import type { RuntimeDependencyManagedComponent } from "../src/types/runtimeDependencies.js";

export type ManagedPythonPackageToolId = "yt-dlp" | "gallery-dl" | "douyin-dl";

export type ManagedPythonPackageSpec = {
  component: Extract<RuntimeDependencyManagedComponent, "ytDlp" | "galleryDl" | "douyinDl">;
  installSource: string;
  minPython: [number, number, number];
  packageVersion: string;
  staleDirectories?: string[];
};

const DOUYIN_DOWNLOADER_VERSION = "2.0.0";
const DOUYIN_DOWNLOADER_GIT_REF = "5144bd3dec91cd2711cfdccbf36c10af17eb93fc";
const DOUYIN_DOWNLOADER_PACKAGE_SOURCE =
  `https://github.com/jiji262/douyin-downloader/archive/${DOUYIN_DOWNLOADER_GIT_REF}.zip`;

export const MANAGED_PYTHON_PACKAGE_SPECS: Record<ManagedPythonPackageToolId, ManagedPythonPackageSpec> = {
  "yt-dlp": {
    component: "ytDlp",
    installSource: "yt-dlp==2026.03.17",
    minPython: [3, 10, 0],
    packageVersion: "2026.03.17",
    staleDirectories: ["real"],
  },
  "gallery-dl": {
    component: "galleryDl",
    installSource: "gallery-dl==1.32.1",
    minPython: [3, 8, 0],
    packageVersion: "1.32.1",
    staleDirectories: ["real"],
  },
  "douyin-dl": {
    component: "douyinDl",
    installSource: DOUYIN_DOWNLOADER_PACKAGE_SOURCE,
    minPython: [3, 8, 0],
    packageVersion: DOUYIN_DOWNLOADER_VERSION,
  },
};

export const resolvePinnedManagedPythonPackage = (
  toolId: ManagedPythonPackageToolId,
): ManagedPythonPackageSpec => {
  const spec = (MANAGED_PYTHON_PACKAGE_SPECS as Partial<Record<string, ManagedPythonPackageSpec>>)[toolId];
  if (!spec) {
    throw new Error(`Unsupported managed Python package tool: ${toolId}`);
  }
  return spec;
};
