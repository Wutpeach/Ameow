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
  validateYtDlpWheelArchive,
  ytdlpRequirementsLock,
} from "../scripts/managed-ytdlp-package-set.mjs";

export type YtDlpPackage = { name: string; version: string; filename: string; size: number; sha256: string; provenanceUrl: string; downloadUrl?: string };
export type YtDlpExecutionPolicy = { configIsolation: true; pluginDirs: "disabled"; remoteComponents: "disabled"; jsRuntime: "managed-deno-absolute-path" };
export type YtDlpProbeContract = { args: ["--version"]; expectedVersion: string };

export {
  assertYtDlpPackageReleaseContract,
  approvedYtDlpDownloadUrl,
  releaseIdFor,
  canonicalYtDlpPackageSetId,
  digestYtDlpText,
  isYtDlpExecutionPolicy,
  isYtDlpProbeContract,
  normalizeYtDlpPackageName,
  normalizedInstalledYtDlpVersion,
  validateYtDlpWheelArchive,
  ytdlpRequirementsLock,
};
