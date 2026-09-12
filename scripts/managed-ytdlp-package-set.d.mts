export type YtDlpPackage = { name: string; version: string; filename: string; size: number; sha256: string; provenanceUrl: string; downloadUrl?: string };
export type YtDlpExecutionPolicy = { configIsolation: true; pluginDirs: "disabled"; remoteComponents: "disabled"; jsRuntime: "managed-deno-absolute-path" };
export type YtDlpProbeContract = { args: ["--version"]; expectedVersion: string };
export const MANAGED_YTDLP_TARGETS: readonly string[];
export const normalizeYtDlpPackageName: (value: string) => string;
export const normalizedInstalledYtDlpVersion: (value: string) => string;
export const digestYtDlpText: (value: string) => string;
export const canonicalYtDlpPackageSetId: (packages: readonly Pick<YtDlpPackage, "name" | "version">[]) => string;
export const ytdlpRequirementsLock: (packages: readonly Pick<YtDlpPackage, "name" | "version" | "sha256">[]) => string;
export const isYtDlpExecutionPolicy: (value: unknown) => value is YtDlpExecutionPolicy;
export const isYtDlpProbeContract: (value: unknown) => value is YtDlpProbeContract;
export const assertYtDlpPackageReleaseContract: <T>(entry: T, options?: { requireReleaseId?: boolean }) => T;
export const releaseIdFor: (entry: Record<string, unknown>) => string;
export const sameYtDlpReleaseContract: (left: Record<string, unknown>, right: Record<string, unknown>) => boolean;
export const validateManagedYtDlpReleaseManifest: <T>(manifest: T) => T;
export const validateYtDlpWheelArchive: (bytes: Buffer, packageInfo: YtDlpPackage, packages: readonly YtDlpPackage[], options?: { pythonPath?: string; runtimeTargets?: string[] }) => Promise<void>;
export const bundledWheelValidatorPython: () => string;

export const approvedYtDlpDownloadUrl: (entry: YtDlpPackage) => string;
