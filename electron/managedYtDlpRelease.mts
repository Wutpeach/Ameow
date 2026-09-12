import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { managedYtDlpCandidateRoot } from "../src/electron-runtime/runtimePaths.js";
import {
  assertPythonVersionSatisfiesManagedPackage,
  currentManagedRuntimeTarget,
  downloadToFile,
  managedPythonVirtualenvArgs,
  managedPythonCommandOptions,
  runCapturedUtilityCommand,
  runUtilityCommand,
  sha256Hex,
  type ManagedRuntimeBootstrapOptions,
} from "./managedRuntimeBootstrap.mjs";
import {
  assertYtDlpPackageReleaseContract,
  approvedYtDlpDownloadUrl,
  releaseIdFor,
  canonicalYtDlpPackageSetId,
  digestYtDlpText,
  isYtDlpExecutionPolicy,
  isYtDlpProbeContract,
  normalizeYtDlpPackageName,
  normalizedInstalledYtDlpVersion,
  type YtDlpExecutionPolicy,
  type YtDlpPackage,
  type YtDlpProbeContract,
  ytdlpRequirementsLock,
  validateYtDlpWheelArchive,
} from "./ytDlpPackageSet.mjs";

const MANAGED_MANIFEST_SCHEMA_VERSION = 1;
const CANDIDATE_CATALOG_SCHEMA_VERSION = 1;
const MATERIALIZATION_LAYOUT_VERSION = 1;
const PROBE_TIMEOUT_MS = 4_000;
const MUTATION_TIMEOUT_MS = 60_000;
const APPROVED_FILE_HOST = "files.pythonhosted.org";

export type ApprovedYtDlpRelease = {
  schemaVersion: 1;
  layoutVersion: 1;
  releaseId: string;
  version: string;
  packageSetId: string;
  packages: YtDlpPackage[];
  minPython: [number, number, number];
  runtimeTargets: string[];
  executionPolicy: YtDlpExecutionPolicy;
  probe: YtDlpProbeContract;
  approvedManifestDigest: string;
};

export type ManagedYtDlpEligibilityReason =
  | "spawn"
  | "version"
  | "package_set"
  | "python"
  | "target"
  | "policy"
  | "dependency_identity"
  | "marker_conflict";

export type ManagedYtDlpCandidateRecord = {
  releaseId: string;
  version: string;
  runtimeTarget: string;
  packageSetId: string;
  stage: "committed";
  eligibility: {
    status: "passed" | "failed" | "quarantined";
    reason?: ManagedYtDlpEligibilityReason;
    probedAtMs: number;
    ytDlpVersion?: string;
    pythonManifestEntryDigest: string;
    pythonIdentityDigest: string;
    ffmpegIdentityDigest?: string;
    ffprobeIdentityDigest?: string;
    denoIdentityDigest?: string;
  };
};

type ManagedYtDlpReleaseMarker = {
  schemaVersion: 1;
  materializationLayoutVersion: 1;
  releaseId: string;
  approvedManifestDigest: string;
  packageSetId: string;
  runtimeTarget: string;
  pythonManifestEntryDigest: string;
  packageFiles: Array<Pick<YtDlpPackage, "name" | "version" | "size" | "sha256">>;
  installedPackageVersions: Record<string, string>;
  stagedAtMs: number;
  materializationDigest: string;
};

type CandidateCatalog = {
  schemaVersion: 1;
  runtimeTarget: string;
  candidates: ManagedYtDlpCandidateRecord[];
};

export type ManagedYtDlpProbeDependencies = import("./ytDlpBaseline.mjs").ManagedYtDlpCandidateProbeInputs;

export type ManagedYtDlpReleaseOptions = Pick<
  ManagedRuntimeBootstrapOptions,
  "configDir" | "platform" | "arch" | "fetch" | "fetchRouteAware" | "resolveRoute" | "bundledPythonPath" | "log"
> & {
  managedManifestPath: string;
  now?(): number;
  runMutation<T>(operation: () => Promise<T>): Promise<T>;
  prepareProbeDependencies(): Promise<ManagedYtDlpProbeDependencies>;
};

export type ManagedYtDlpObservedCandidate = Omit<ManagedYtDlpCandidateRecord, "eligibility"> & {
  eligibility?: ManagedYtDlpCandidateRecord["eligibility"];
  observation: "consistent" | "marker_only" | "marker_mismatch";
};

export type ManagedYtDlpCandidateInspection = {
  manifest: { available: boolean; valid: boolean; releaseIds: string[] };
  catalog: { state: "missing" | "valid" | "corrupt" | "unsupported"; candidateCount: number; observationError?: "catalog_corrupt" | "catalog_unsupported" };
  candidates: ManagedYtDlpObservedCandidate[];
  selection: "bundled";
};

export type ManagedYtDlpStageResult = {
  releaseId: string;
  stage: "committed";
  eligibility: ManagedYtDlpCandidateRecord["eligibility"];
};

export class ManagedYtDlpStageError extends Error {
  constructor(
    readonly category: "approval" | "download" | "integrity" | "materialization",
    message: string,
  ) {
    super(message);
    this.name = "ManagedYtDlpStageError";
  }
}

const object = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid managed yt-dlp ${label}`);
  return value;
};

const requiredInt = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`Invalid managed yt-dlp ${label}`);
  return value as number;
};

const boundedToken = (value: unknown, label: string): string => {
  const token = requiredString(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(token)) throw new Error(`Invalid managed yt-dlp ${label}`);
  return token;
};


const requiredDigest = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`Invalid managed yt-dlp ${label}`);
  return value;
};

const requiredPackageSetId = (value: unknown): string => {
  if (typeof value !== "string" || value.length > 4096 || !/^[A-Za-z0-9][A-Za-z0-9._-]*==[0-9][A-Za-z0-9.!+_-]*(;[A-Za-z0-9][A-Za-z0-9._-]*==[0-9][A-Za-z0-9.!+_-]*)*$/.test(value)) throw new Error("Invalid managed yt-dlp packageSetId");
  return value;
};

const requiredReleaseId = (value: unknown): string => {
  const releaseId = requiredString(value, "releaseId");
  if (releaseId.length > 160) throw new Error("Invalid managed yt-dlp releaseId");
  if (!/^[0-9][A-Za-z0-9.!+_-]*-[a-f0-9]{16}$/.test(releaseId)) {
    throw new Error("Invalid managed yt-dlp releaseId");
  }
  return releaseId;
};

const parsePackage = (value: unknown, index: number): YtDlpPackage => {
  const source = object(value);
  if (!source) throw new Error(`Invalid managed yt-dlp packages[${index}]`);
  const name = requiredString(source.name, `packages[${index}].name`);
  const version = requiredString(source.version, `packages[${index}].version`);
  const filename = requiredString(source.filename, `packages[${index}].filename`);
  const sha256 = requiredString(source.sha256, `packages[${index}].sha256`).toLowerCase();
  const provenanceUrl = requiredString(source.provenanceUrl, `packages[${index}].provenanceUrl`);
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`Invalid managed yt-dlp wheel checksum: ${filename}`);
  const url = new URL(provenanceUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`Invalid managed yt-dlp wheel provenance URL: ${filename}`);
  }
  return { name, version, filename, size: requiredInt(source.size, `packages[${index}].size`), sha256, provenanceUrl: url.toString(), ...(source.downloadUrl === undefined ? {} : { downloadUrl: requiredString(source.downloadUrl, "downloadUrl") }) };
};

const releaseIdentityInput = (entry: Omit<ApprovedYtDlpRelease, "releaseId" | "approvedManifestDigest">) => ({
  schemaVersion: entry.schemaVersion,
  layoutVersion: entry.layoutVersion,
  version: entry.version,
  packageSetId: entry.packageSetId,
  packages: entry.packages,
  minPython: entry.minPython,
  runtimeTargets: entry.runtimeTargets,
  executionPolicy: entry.executionPolicy,
  probe: entry.probe,
});

export const deriveManagedYtDlpReleaseId = (
  entry: Omit<ApprovedYtDlpRelease, "releaseId" | "approvedManifestDigest">,
): string => releaseIdFor(entry);

const parseApprovedRelease = (value: unknown, index: number): ApprovedYtDlpRelease => {
  assertYtDlpPackageReleaseContract(value, { requireReleaseId: true });
  const source = object(value);
  if (!source) throw new Error(`Invalid managed yt-dlp release ${index}`);
  const packages = Array.isArray(source.packages) ? source.packages.map(parsePackage) : [];
  const minPython = Array.isArray(source.minPython) && source.minPython.length === 3
    ? source.minPython.map((part) => requiredInt(part, "minPython")) as [number, number, number]
    : null;
  const runtimeTargets = Array.isArray(source.runtimeTargets)
    ? source.runtimeTargets.map((target) => requiredString(target, "runtimeTargets"))
    : [];
  const executionPolicy = source.executionPolicy;
  const probe = source.probe;
  const packageSetId = requiredString(source.packageSetId, "packageSetId");
  const version = requiredString(source.version, "version");
  if (
    source.schemaVersion !== 1
    || source.layoutVersion !== 1
    || !/^[0-9][A-Za-z0-9.!+_-]*$/.test(version)
    || !minPython
    || packages.length === 0
    || new Set(packages.map((entry) => normalizeYtDlpPackageName(entry.name))).size !== packages.length
    || new Set(packages.map((entry) => entry.filename)).size !== packages.length
    || new Set(runtimeTargets).size !== runtimeTargets.length
    || packageSetId !== canonicalYtDlpPackageSetId(packages)
    || !isYtDlpExecutionPolicy(executionPolicy)
    || !isYtDlpProbeContract(probe)
    || probe.expectedVersion !== version
  ) {
    throw new Error(`Managed yt-dlp release ${index} does not match the canonical package policy`);
  }
  const byName = Object.fromEntries(packages.map((entry) => [normalizeYtDlpPackageName(entry.name), entry]));
  if (byName["yt-dlp"]?.version !== version || !byName["yt-dlp-ejs"]) {
    throw new Error(`Managed yt-dlp release ${index} has an incomplete app-owned package set`);
  }
  const identityInput = {
    schemaVersion: 1 as const,
    layoutVersion: 1 as const,
    version,
    packageSetId,
    packages,
    minPython,
    runtimeTargets,
    executionPolicy,
    probe,
  };
  try {
    assertYtDlpPackageReleaseContract({ ...identityInput, releaseId: source.releaseId }, { requireReleaseId: true });
  } catch (error) {
    throw new ManagedYtDlpStageError("approval", `Managed yt-dlp release ${index} does not match the canonical package policy: ${error instanceof Error ? error.message : "invalid contract"}`);
  }
  const approvedManifestDigest = digestYtDlpText(JSON.stringify(releaseIdentityInput(identityInput)));
  const releaseId = deriveManagedYtDlpReleaseId(identityInput);
  if (source.releaseId !== releaseId) throw new Error(`Managed yt-dlp release ${index} has a non-canonical releaseId`);
  return { ...identityInput, releaseId, approvedManifestDigest };
};

const readApprovedManifest = async (path: string): Promise<ApprovedYtDlpRelease[]> => {
  const source = object(JSON.parse(await readFile(path, "utf8")));
  if (!source || source.schemaVersion !== MANAGED_MANIFEST_SCHEMA_VERSION || !Array.isArray(source.releases)) {
    throw new Error("Invalid managed yt-dlp release allowlist");
  }
  const releases = source.releases.map(parseApprovedRelease);
  if (new Set(releases.map((entry) => entry.releaseId)).size !== releases.length) {
    throw new Error("Managed yt-dlp release allowlist has duplicate release IDs");
  }
  return releases;
};

const candidatePaths = (options: Pick<ManagedYtDlpReleaseOptions, "configDir" | "platform" | "arch">, releaseId?: string) => {
  const root = managedYtDlpCandidateRoot(options);
  const versionsRoot = join(root, "versions");
  const candidateRoot = releaseId ? join(versionsRoot, requiredReleaseId(releaseId)) : null;
  return {
    root,
    versionsRoot,
    catalog: join(root, "managed-candidates.json"),
    candidateRoot,
    marker: candidateRoot ? join(candidateRoot, "release.json") : null,
    wheels: candidateRoot ? join(candidateRoot, "wheels") : null,
    venv: candidateRoot ? join(candidateRoot, "venv") : null,
    python: candidateRoot ? join(candidateRoot, "venv", options.platform === "win32" ? "Scripts" : "bin", options.platform === "win32" ? "python.exe" : "python") : null,
    entrypoint: candidateRoot ? join(candidateRoot, "venv", options.platform === "win32" ? "Scripts" : "bin", options.platform === "win32" ? "yt-dlp.exe" : "yt-dlp") : null,
  };
};

const parseMarker = (value: unknown): ManagedYtDlpReleaseMarker | null => {
  const source = object(value);
  const packageFiles = Array.isArray(source?.packageFiles) ? source.packageFiles : null;
  const installed = object(source?.installedPackageVersions);
  if (!source || !packageFiles || !installed) return null;
  const parsedFiles = packageFiles.map((entry, index) => {
    const packageInfo = object(entry);
    if (!packageInfo) return null;
    try {
      return {
        name: requiredString(packageInfo.name, `marker.packageFiles[${index}].name`),
        version: requiredString(packageInfo.version, `marker.packageFiles[${index}].version`),
        size: requiredInt(packageInfo.size, `marker.packageFiles[${index}].size`),
        sha256: requiredString(packageInfo.sha256, `marker.packageFiles[${index}].sha256`).toLowerCase(),
      };
    } catch {
      return null;
    }
  });
  if (parsedFiles.some((entry) => !entry) || source.schemaVersion !== 1 || source.materializationLayoutVersion !== 1) return null;
  try {
    return {
      schemaVersion: 1,
      materializationLayoutVersion: 1,
      releaseId: requiredReleaseId(source.releaseId),
      approvedManifestDigest: requiredString(source.approvedManifestDigest, "marker.approvedManifestDigest"),
      packageSetId: requiredString(source.packageSetId, "marker.packageSetId"),
      runtimeTarget: requiredString(source.runtimeTarget, "marker.runtimeTarget"),
      pythonManifestEntryDigest: requiredString(source.pythonManifestEntryDigest, "marker.pythonManifestEntryDigest"),
      packageFiles: parsedFiles as ManagedYtDlpReleaseMarker["packageFiles"],
      installedPackageVersions: Object.fromEntries(Object.entries(installed).map(([name, version]) => [
        normalizeYtDlpPackageName(boundedToken(name, "marker.installedPackageVersions.name")),
        boundedToken(version, "marker.installedPackageVersions.version"),
      ])),
      stagedAtMs: requiredInt(source.stagedAtMs, "marker.stagedAtMs"),
      materializationDigest: requiredDigest(source.materializationDigest, "marker.materializationDigest"),
    };
  } catch {
    return null;
  }
};

const readMarker = async (path: string): Promise<ManagedYtDlpReleaseMarker | null> => {
  try {
    return parseMarker(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return null;
  }
};

const parseCandidateRecord = (value: unknown): ManagedYtDlpCandidateRecord | null => {
  const source = object(value);
  const eligibility = object(source?.eligibility);
  if (!source || !eligibility || source.stage !== "committed") return null;
  const status = eligibility.status;
  const reason = eligibility.reason;
  if (
    (status !== "passed" && status !== "failed" && status !== "quarantined")
    || (reason !== undefined && !["spawn", "version", "package_set", "python", "target", "policy", "dependency_identity", "marker_conflict"].includes(String(reason)))
  ) return null;
  try {
    const ytDlpVersion = eligibility.ytDlpVersion === undefined ? undefined : boundedToken(eligibility.ytDlpVersion, "catalog.ytDlpVersion");
    const ffmpegIdentityDigest = eligibility.ffmpegIdentityDigest === undefined ? undefined : requiredDigest(eligibility.ffmpegIdentityDigest, "catalog.ffmpegIdentityDigest");
    const ffprobeIdentityDigest = eligibility.ffprobeIdentityDigest === undefined ? undefined : requiredDigest(eligibility.ffprobeIdentityDigest, "catalog.ffprobeIdentityDigest");
    const denoIdentityDigest = eligibility.denoIdentityDigest === undefined ? undefined : requiredDigest(eligibility.denoIdentityDigest, "catalog.denoIdentityDigest");
    return {
      releaseId: requiredReleaseId(source.releaseId),
      version: boundedToken(source.version, "catalog.version"),
      runtimeTarget: boundedToken(source.runtimeTarget, "catalog.runtimeTarget"),
      packageSetId: requiredPackageSetId(source.packageSetId),
      stage: "committed",
      eligibility: {
        status,
        ...(reason ? { reason: reason as ManagedYtDlpEligibilityReason } : {}),
        probedAtMs: requiredInt(eligibility.probedAtMs, "catalog.probedAtMs"),
        ...(ytDlpVersion ? { ytDlpVersion } : {}),
        pythonManifestEntryDigest: requiredDigest(eligibility.pythonManifestEntryDigest, "catalog.pythonManifestEntryDigest"),
        pythonIdentityDigest: requiredDigest(eligibility.pythonIdentityDigest, "catalog.pythonIdentityDigest"),
        ...(ffmpegIdentityDigest ? { ffmpegIdentityDigest } : {}),
        ...(ffprobeIdentityDigest ? { ffprobeIdentityDigest } : {}),
        ...(denoIdentityDigest ? { denoIdentityDigest } : {}),
      },
    };
  } catch {
    return null;
  }
};

const readCatalog = async (path: string, target: string): Promise<{ state: ManagedYtDlpCandidateInspection["catalog"]["state"]; catalog: CandidateCatalog | null }> => {
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    const source = object(raw);
    if (!source) return { state: "corrupt", catalog: null };
    if (source.schemaVersion !== CANDIDATE_CATALOG_SCHEMA_VERSION) return { state: "unsupported", catalog: null };
    if (source.runtimeTarget !== target || !Array.isArray(source.candidates)) return { state: "corrupt", catalog: null };
    const candidates = source.candidates.map(parseCandidateRecord);
    if (candidates.some((entry) => !entry) || new Set(candidates.map((entry) => entry!.releaseId)).size !== candidates.length) {
      return { state: "corrupt", catalog: null };
    }
    return { state: "valid", catalog: { schemaVersion: 1, runtimeTarget: target, candidates: candidates as ManagedYtDlpCandidateRecord[] } };
  } catch (error) {
    return { state: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "corrupt", catalog: null };
  }
};

const writeCatalog = async (path: string, catalog: CandidateCatalog): Promise<void> => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  await rename(temporary, path);
};

const writeMarkerLast = async (path: string, marker: ManagedYtDlpReleaseMarker): Promise<void> => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
  await rename(temporary, path);
};

const expectedInstalledPackages = (release: ApprovedYtDlpRelease): Record<string, string> => Object.fromEntries(
  release.packages.map((entry) => [normalizeYtDlpPackageName(entry.name), normalizedInstalledYtDlpVersion(entry.version)]),
);

const readInstalledPackageVersions = async (
  python: string,
  release: ApprovedYtDlpRelease,
  platform: NodeJS.Platform,
): Promise<Record<string, string>> => {
  const names = release.packages.map((entry) => JSON.stringify(normalizeYtDlpPackageName(entry.name))).join(", ");
  const result = await runCapturedUtilityCommand(python, [
    "-c",
    `import importlib.metadata as m; print('\\n'.join(m.version(x) for x in [${names}]))`,
  ], managedPythonCommandOptions(platform, MUTATION_TIMEOUT_MS));
  const versions = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return Object.fromEntries(release.packages.map((entry, index) => [
    normalizeYtDlpPackageName(entry.name),
    versions[index] ?? "",
  ]));
};

const approvedUrl = (value: string): URL => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== APPROVED_FILE_HOST || url.username || url.password || url.hash) {
    throw new Error("Managed yt-dlp package URL is not an approved HTTPS file URL");
  }
  return url;
};

const verifyApprovedWheelStructures = async (
  root: string,
  release: ApprovedYtDlpRelease,
  options: ManagedYtDlpReleaseOptions,
): Promise<void> => {
  try {
    const results = await Promise.allSettled(release.packages.map(async (packageInfo) => validateYtDlpWheelArchive(
      await readFile(join(root, packageInfo.filename)), packageInfo, release.packages,
      { pythonPath: options.bundledPythonPath, runtimeTargets: release.runtimeTargets },
    )));
    if (results.some((result) => result.status === "rejected")) throw new Error("Invalid wheel set");
  } catch {
    throw new ManagedYtDlpStageError("integrity", "Managed yt-dlp wheel structure validation failed");
  }
};

const downloadRelease = async (
  release: ApprovedYtDlpRelease,
  options: ManagedYtDlpReleaseOptions,
): Promise<string> => {
  const paths = candidatePaths(options);
  await mkdir(paths.root, { recursive: true });
  const downloadRoot = await mkdtemp(join(paths.root, ".download-"));
  try {
    for (const packageInfo of release.packages) {
      const url = approvedUrl(approvedYtDlpDownloadUrl(packageInfo));
      const destination = join(downloadRoot, packageInfo.filename);
      await downloadToFile(url.toString(), destination, {
        ...options,
        requestInit: { redirect: "error" },
        timeoutMs: 30_000,
        maxBytes: packageInfo.size,
        timeoutErrorMessage: `Managed yt-dlp package download stalled: ${packageInfo.filename}`,
        validateResponse(response) {
          const finalUrl = response.url ? new URL(response.url) : url;
          if (finalUrl.toString() !== url.toString() || finalUrl.protocol !== "https:" || finalUrl.hostname !== APPROVED_FILE_HOST) {
            throw new Error(`Managed yt-dlp package redirect is forbidden: ${packageInfo.filename}`);
          }
        },
      });
      const details = await stat(destination);
      if (details.size !== packageInfo.size) throw new ManagedYtDlpStageError("integrity", "Managed yt-dlp package size mismatch");
      if ((await sha256Hex(destination)).toLowerCase() !== packageInfo.sha256) {
        throw new ManagedYtDlpStageError("integrity", "Managed yt-dlp package checksum mismatch");
      }
    }
    return downloadRoot;
  } catch (error) {
    await rm(downloadRoot, { recursive: true, force: true });
    throw error;
  }
};

const recordFrom = (
  release: ApprovedYtDlpRelease,
  target: string,
  dependencies: ManagedYtDlpProbeDependencies,
  status: ManagedYtDlpCandidateRecord["eligibility"]["status"],
  reason: ManagedYtDlpEligibilityReason | undefined,
  now: number,
  ytDlpVersion?: string,
): ManagedYtDlpCandidateRecord => ({
  releaseId: release.releaseId,
  version: release.version,
  runtimeTarget: target,
  packageSetId: release.packageSetId,
  stage: "committed",
  eligibility: {
    status,
    ...(reason ? { reason } : {}),
    probedAtMs: now,
    ...(ytDlpVersion ? { ytDlpVersion } : {}),
    pythonManifestEntryDigest: dependencies.python.manifestEntryDigest,
    pythonIdentityDigest: digestYtDlpText(JSON.stringify(dependencies.python)),
    ffmpegIdentityDigest: digestYtDlpText(JSON.stringify(dependencies.mediaTools.ffmpeg)),
    ffprobeIdentityDigest: digestYtDlpText(JSON.stringify(dependencies.mediaTools.ffprobe)),
    denoIdentityDigest: digestYtDlpText(JSON.stringify(dependencies.mediaTools.deno)),
  },
});

const markerMatches = (marker: ManagedYtDlpReleaseMarker, release: ApprovedYtDlpRelease, target: string): boolean => (
  marker.releaseId === release.releaseId
  && marker.approvedManifestDigest === release.approvedManifestDigest
  && marker.packageSetId === release.packageSetId
  && marker.runtimeTarget === target
  && marker.materializationLayoutVersion === MATERIALIZATION_LAYOUT_VERSION
  && JSON.stringify(marker.packageFiles) === JSON.stringify(release.packages.map(({ name, version, size, sha256 }) => ({ name, version, size, sha256 })))
  && JSON.stringify(marker.installedPackageVersions) === JSON.stringify(expectedInstalledPackages(release))
);

const verifyStagedPackageBytes = async (wheels: string, release: ApprovedYtDlpRelease): Promise<void> => {
  for (const packageInfo of release.packages) {
    const path = join(wheels, packageInfo.filename);
    const details = await stat(path);
    if (details.size !== packageInfo.size || (await sha256Hex(path)).toLowerCase() !== packageInfo.sha256) {
      throw new Error(`Managed yt-dlp staged package integrity mismatch: ${packageInfo.filename}`);
    }
  }
};

// Stage/cache validation is explicit and cold: hash installed bytes, including
// launchers and bytecode, before executing any cached candidate interpreter.
const materializationDigest = async (root: string): Promise<string> => {
  const files: Array<[string, string]> = [];
  const visit = async (relative: string): Promise<void> => {
    const entries = await readdir(join(root, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(name);
      else files.push([name, await sha256Hex(join(root, name))]);
    }
  };
  await visit("");
  return digestYtDlpText(JSON.stringify(files));
};

const validCachedRecord = async (
  paths: ReturnType<typeof candidatePaths>,
  marker: ManagedYtDlpReleaseMarker,
  release: ApprovedYtDlpRelease,
  target: string,
  dependencies: ManagedYtDlpProbeDependencies,
  platform: NodeJS.Platform,
): Promise<ManagedYtDlpCandidateRecord | null> => {
  try {
    if (!paths.wheels || !paths.python || !paths.entrypoint
      || !existsSync(paths.python) || !existsSync(paths.entrypoint)
      || dependencies.python.target !== target
      || !markerMatches(marker, release, target)
      || marker.pythonManifestEntryDigest !== dependencies.python.manifestEntryDigest) return null;
    assertPythonVersionSatisfiesManagedPackage("yt-dlp", dependencies.python.version, release.minPython);
    await verifyStagedPackageBytes(paths.wheels, release);
    if (!paths.venv || await materializationDigest(paths.venv) !== marker.materializationDigest) return null;
    const installed = await readInstalledPackageVersions(paths.python, release, platform);
    if (JSON.stringify(installed) !== JSON.stringify(expectedInstalledPackages(release))) return null;
    const catalog = await readCatalog(paths.catalog, target);
    const record = catalog.catalog?.candidates.find((entry) => entry.releaseId === release.releaseId);
    if (!record || record.version !== release.version || record.runtimeTarget !== target || record.packageSetId !== release.packageSetId
      || record.eligibility.status !== "passed" || record.eligibility.ytDlpVersion !== release.probe.expectedVersion
      || record.eligibility.pythonManifestEntryDigest !== dependencies.python.manifestEntryDigest
      || record.eligibility.pythonIdentityDigest !== digestYtDlpText(JSON.stringify(dependencies.python))
      || record.eligibility.ffmpegIdentityDigest !== digestYtDlpText(JSON.stringify(dependencies.mediaTools.ffmpeg))
      || record.eligibility.ffprobeIdentityDigest !== digestYtDlpText(JSON.stringify(dependencies.mediaTools.ffprobe))
      || record.eligibility.denoIdentityDigest !== digestYtDlpText(JSON.stringify(dependencies.mediaTools.deno))) return null;
    return record;
  } catch {
    return null;
  }
};

const probeCandidate = async (
  entrypoint: string,
  release: ApprovedYtDlpRelease,
  dependencies: ManagedYtDlpProbeDependencies,
  platform: NodeJS.Platform,
): Promise<{ status: "passed" | "failed"; reason?: ManagedYtDlpEligibilityReason; version?: string }> => {
  try {
    const result = await runCapturedUtilityCommand(entrypoint, [
      "--ignore-config",
      "--no-config-locations",
      "--no-plugin-dirs",
      "--no-remote-components",
      "--js-runtimes",
      `deno:${dependencies.observed.denoPath}`,
      "--ffmpeg-location",
      dependencies.observed.ffmpegPath,
      "--version",
    ], managedPythonCommandOptions(platform, PROBE_TIMEOUT_MS));
    const version = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
    return version === release.probe.expectedVersion
      ? { status: "passed", version }
      : { status: "failed", reason: "version" };
  } catch {
    return { status: "failed", reason: "spawn" };
  }
};

const writeCandidateCatalogRecord = async (
  catalogPath: string,
  target: string,
  record: ManagedYtDlpCandidateRecord,
): Promise<void> => {
  const loaded = await readCatalog(catalogPath, target);
  if (loaded.state === "corrupt" || loaded.state === "unsupported") {
    throw new Error("Managed yt-dlp candidate catalog is not writable: " + loaded.state);
  }
  const retained = loaded.catalog?.candidates.filter((entry) => entry.releaseId !== record.releaseId) ?? [];
  await writeCatalog(catalogPath, { schemaVersion: 1, runtimeTarget: target, candidates: [...retained, record] });
};

const stageManagedYtDlpReleaseInternal = async (
  releaseId: string,
  options: ManagedYtDlpReleaseOptions,
): Promise<ManagedYtDlpStageResult> => {
  let releases: ApprovedYtDlpRelease[];
  try { releases = await readApprovedManifest(options.managedManifestPath); }
  catch { throw new ManagedYtDlpStageError("approval", "Managed yt-dlp approval manifest rejected"); }
  const release = releases.find((entry) => entry.releaseId === releaseId);
  if (!release) throw new ManagedYtDlpStageError("approval", "Managed yt-dlp release is not app-approved");
  const target = currentManagedRuntimeTarget(options.platform, options.arch);
  if (!release.runtimeTargets.includes(target)) throw new ManagedYtDlpStageError("approval", "Managed yt-dlp release is unsupported for this runtime target");
  const existingPaths = candidatePaths(options, release.releaseId);
  const alreadyCommitted = existingPaths.marker ? await readMarker(existingPaths.marker) : null;
  if (existingPaths.marker && existsSync(existingPaths.marker) && !alreadyCommitted) {
    return await options.runMutation(async () => {
      const dependencies = await options.prepareProbeDependencies();
      const quarantined = recordFrom(release, target, dependencies, "quarantined", "marker_conflict", options.now?.() ?? Date.now());
      await writeCandidateCatalogRecord(existingPaths.catalog, target, quarantined);
      return { releaseId: release.releaseId, stage: "committed", eligibility: quarantined.eligibility };
    });
  }
  if (alreadyCommitted) {
    return await options.runMutation(async () => {
      const dependencies = await options.prepareProbeDependencies();
      // The preflight read merely avoids a network round trip; the mutation
      // boundary always rereads immutable state before returning a cache hit.
      const marker = existingPaths.marker ? await readMarker(existingPaths.marker) : null;
      const record = marker ? await validCachedRecord(existingPaths, marker, release, target, dependencies, options.platform) : null;
      if (record) {
        return { releaseId: release.releaseId, stage: "committed", eligibility: record.eligibility };
      }
      const quarantined = recordFrom(release, target, dependencies, "quarantined", "marker_conflict", options.now?.() ?? Date.now());
      await writeCandidateCatalogRecord(existingPaths.catalog, target, quarantined);
      return { releaseId: release.releaseId, stage: "committed", eligibility: quarantined.eligibility };
    });
  }
  let downloadRoot: string;
  try {
    downloadRoot = await downloadRelease(release, options);
  } catch (error) {
    if (error instanceof ManagedYtDlpStageError) throw error;
    throw new ManagedYtDlpStageError("download", "Managed yt-dlp download failed");
  }
  try {
    await verifyApprovedWheelStructures(downloadRoot, release, options);
    return await options.runMutation(async () => {
      const paths = candidatePaths(options, release.releaseId);
      await mkdir(paths.versionsRoot, { recursive: true });
      const dependencies = await options.prepareProbeDependencies();
      if (dependencies.python.target !== target) throw new Error("Managed yt-dlp candidate target identity mismatch");
      assertPythonVersionSatisfiesManagedPackage("yt-dlp", dependencies.python.version, release.minPython);
      const existingMarker = paths.marker ? await readMarker(paths.marker) : null;
      if (paths.marker && existsSync(paths.marker) && !existingMarker) {
        const quarantined = recordFrom(release, target, dependencies, "quarantined", "marker_conflict", options.now?.() ?? Date.now());
        await writeCandidateCatalogRecord(paths.catalog, target, quarantined);
        return { releaseId: release.releaseId, stage: "committed", eligibility: quarantined.eligibility };
      }
      if (existingMarker) {
        const existingRecord = await validCachedRecord(paths, existingMarker, release, target, dependencies, options.platform);
        if (existingRecord) return { releaseId: release.releaseId, stage: "committed", eligibility: existingRecord.eligibility };
        const quarantined = recordFrom(release, target, dependencies, "quarantined", "marker_conflict", options.now?.() ?? Date.now());
        await writeCandidateCatalogRecord(paths.catalog, target, quarantined);
        return { releaseId: release.releaseId, stage: "committed", eligibility: quarantined.eligibility };
      }
      if (!paths.candidateRoot || !paths.wheels || !paths.venv || !paths.python || !paths.entrypoint || !paths.marker) {
        throw new Error("Managed yt-dlp candidate paths are unavailable");
      }
      await rm(paths.candidateRoot, { recursive: true, force: true });
      let markerCommitted = false;
      try {
        await mkdir(paths.wheels, { recursive: true });
        for (const packageInfo of release.packages) {
          await cp(join(downloadRoot, packageInfo.filename), join(paths.wheels, packageInfo.filename));
        }
        await verifyStagedPackageBytes(paths.wheels, release);
        await runUtilityCommand(options.bundledPythonPath ?? "", managedPythonVirtualenvArgs(paths.venv), managedPythonCommandOptions(options.platform, MUTATION_TIMEOUT_MS));
        const lockPath = join(paths.candidateRoot, ".requirements.txt");
        await writeFile(lockPath, ytdlpRequirementsLock(release.packages), "utf8");
        await runUtilityCommand(paths.python, [
          "-m", "pip", "install", "--disable-pip-version-check", "--no-index", "--find-links", paths.wheels,
          "--only-binary=:all:", "--require-hashes", "--no-deps", "--no-cache-dir", "-r", lockPath,
        ], managedPythonCommandOptions(options.platform, MUTATION_TIMEOUT_MS));
        if (!existsSync(paths.python) || !existsSync(paths.entrypoint)) throw new Error("Managed yt-dlp candidate entrypoint is missing after offline materialization");
        const installed = await readInstalledPackageVersions(paths.python, release, options.platform);
        if (JSON.stringify(installed) !== JSON.stringify(expectedInstalledPackages(release))) {
          throw new Error("Managed yt-dlp candidate installed package set mismatch");
        }
        const marker: ManagedYtDlpReleaseMarker = {
          schemaVersion: 1,
          materializationLayoutVersion: 1,
          releaseId: release.releaseId,
          approvedManifestDigest: release.approvedManifestDigest,
          packageSetId: release.packageSetId,
          runtimeTarget: target,
          pythonManifestEntryDigest: dependencies.python.manifestEntryDigest,
          packageFiles: release.packages.map(({ name, version, size, sha256 }) => ({ name, version, size, sha256 })),
          installedPackageVersions: installed,
          stagedAtMs: options.now?.() ?? Date.now(),
          materializationDigest: await materializationDigest(paths.venv),
        };
        await writeMarkerLast(paths.marker, marker);
        markerCommitted = true;
        const probe = await probeCandidate(paths.entrypoint, release, dependencies, options.platform);
        const record = recordFrom(
          release,
          target,
          dependencies,
          probe.status,
          probe.reason,
          options.now?.() ?? Date.now(),
          probe.version,
        );
        await writeCandidateCatalogRecord(paths.catalog, target, record);
        return { releaseId: release.releaseId, stage: "committed", eligibility: record.eligibility };
      } catch (error) {
        if (!markerCommitted) await rm(paths.candidateRoot, { recursive: true, force: true });
        if (error instanceof ManagedYtDlpStageError) throw error;
        throw new ManagedYtDlpStageError("materialization", "Managed yt-dlp materialization failed");
      }
    });
  } catch (error) {
    if (error instanceof ManagedYtDlpStageError) throw error;
    throw new ManagedYtDlpStageError("materialization", "Managed yt-dlp materialization failed");
  } finally {
    await rm(downloadRoot, { recursive: true, force: true });
  }
};

export const stageManagedYtDlpRelease = async (releaseId: string, options: ManagedYtDlpReleaseOptions): Promise<ManagedYtDlpStageResult> => {
  try { return await stageManagedYtDlpReleaseInternal(releaseId, options); }
  catch (error) {
    if (error instanceof ManagedYtDlpStageError) throw error;
    throw new ManagedYtDlpStageError("materialization", "Managed yt-dlp materialization failed");
  }
};

export const inspectManagedYtDlpCandidates = async (
  options: Pick<ManagedYtDlpReleaseOptions, "configDir" | "platform" | "arch" | "managedManifestPath">,
): Promise<ManagedYtDlpCandidateInspection> => {
  const target = currentManagedRuntimeTarget(options.platform, options.arch);
  let releases: ApprovedYtDlpRelease[] | null = null;
  try {
    releases = await readApprovedManifest(options.managedManifestPath);
  } catch {
    // Inspection reports invalid packaged policy rather than repairing it.
  }
  const paths = candidatePaths(options);
  const loaded = await readCatalog(paths.catalog, target);
  const records = new Map((loaded.catalog?.candidates ?? []).map((record) => [record.releaseId, record]));
  const candidateIds = new Set<string>(records.keys());
  try {
    for (const entry of await readdir(paths.versionsRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        try { candidateIds.add(requiredReleaseId(entry.name)); } catch { /* Non-candidates stay invisible. */ }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const candidates = await Promise.all([...candidateIds].map(async (releaseId): Promise<ManagedYtDlpObservedCandidate | null> => {
    const record = records.get(releaseId);
    const markerPath = candidatePaths(options, releaseId).marker;
    const marker = markerPath ? await readMarker(markerPath) : null;
    const release = releases?.find((entry) => entry.releaseId === releaseId);
    if (record) {
      return {
        ...record,
        observation: marker && release && markerMatches(marker, release, target)
          && record.version === release.version && record.runtimeTarget === target && record.packageSetId === release.packageSetId
          && record.eligibility.pythonManifestEntryDigest === marker.pythonManifestEntryDigest
          ? "consistent" : "marker_mismatch",
      };
    }
    if (!marker || !release || !markerMatches(marker, release, target)) return null;
    return {
      releaseId,
      version: release.version,
      runtimeTarget: target,
      packageSetId: release.packageSetId,
      stage: "committed",
      observation: "marker_only",
    };
  }));
  const observedCandidates = candidates.filter((candidate): candidate is ManagedYtDlpObservedCandidate => candidate !== null);
  return {
    manifest: { available: Boolean(releases), valid: Boolean(releases), releaseIds: releases?.map((entry) => entry.releaseId) ?? [] },
    catalog: {
      state: loaded.state,
      candidateCount: observedCandidates.length,
      ...(loaded.state === "corrupt" ? { observationError: "catalog_corrupt" as const } : {}),
      ...(loaded.state === "unsupported" ? { observationError: "catalog_unsupported" as const } : {}),
    },
    candidates: observedCandidates,
    selection: "bundled",
  };
};
