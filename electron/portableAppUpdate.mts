import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, parse, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

import { buildGitHubHeaders, downloadToFile } from "./appUpdateDownload.mjs";

export const PORTABLE_MARKER_FILE_NAME = ".ameow-portable.json";
export const WINDOWS_PORTABLE_ROOT_DIR = "Ameow_portable";

export type AppInstallMode = "installed" | "portable" | "unsupported";

export type PortableAppUpdateEntry = {
  url: string;
  sha256: string;
  rootDir: string;
};

type PortableUpdateManifest = {
  portable?: {
    "windows-x86_64"?: {
      url?: unknown;
      sha256?: unknown;
      rootDir?: unknown;
    } | null;
  } | null;
};

type ResolveInstallModeOptions = {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  executablePath: string;
  markerExists?: (path: string) => boolean;
};

type ValidatePortableRootOptions = {
  markerExists?: (path: string) => boolean;
  env?: NodeJS.ProcessEnv;
};

export type PortableUpdatePaths = {
  liveRoot: string;
  stagingParent: string;
  stagingRoot: string;
  backupRoot: string;
  helperScriptPath: string;
  logPath: string;
};

type PerformPortableAppUpdateOptions = {
  fetch(input: string, init?: RequestInit): Promise<Response>;
  portableRootPath: string;
  executablePath: string;
  currentProcessId: number;
};

type SpawnLike = typeof spawn;

const normalizeSha256 = (value: string): string => value.trim().toLowerCase();

const pathEquals = (left: string, right: string): boolean => (
  resolve(left).toLowerCase() === resolve(right).toLowerCase()
);

const pathStartsWith = (child: string, parent: string): boolean => {
  const normalizedChild = `${resolve(child).toLowerCase()}${sep}`;
  const normalizedParent = `${resolve(parent).toLowerCase()}${sep}`;
  return normalizedChild.startsWith(normalizedParent);
};

export const resolvePortableRootPathFromExecutable = (executablePath: string): string => (
  dirname(executablePath)
);

export const resolveWindowsAppInstallMode = ({
  platform,
  isPackaged,
  executablePath,
  markerExists = existsSync,
}: ResolveInstallModeOptions): AppInstallMode => {
  if (platform !== "win32" || !isPackaged) {
    return "unsupported";
  }

  const portableRoot = resolvePortableRootPathFromExecutable(executablePath);
  if (markerExists(join(portableRoot, PORTABLE_MARKER_FILE_NAME))) {
    return "portable";
  }

  return "installed";
};

export const assertValidPortableRoot = (
  portableRootPath: string,
  {
    markerExists = existsSync,
    env = process.env,
  }: ValidatePortableRootOptions = {},
): void => {
  const portableRoot = resolve(portableRootPath);
  const parsed = parse(portableRoot);
  if (pathEquals(portableRoot, parsed.root)) {
    throw new Error(`Portable update root is unsafe: ${portableRoot}`);
  }
  if (!basename(portableRoot)) {
    throw new Error(`Portable update root has no directory name: ${portableRoot}`);
  }
  if (env.USERPROFILE && pathEquals(portableRoot, env.USERPROFILE)) {
    throw new Error("Portable update root cannot be the user profile root");
  }
  for (const protectedRoot of [env.ProgramFiles, env["ProgramFiles(x86)"]]) {
    if (protectedRoot && pathStartsWith(portableRoot, protectedRoot)) {
      throw new Error(`Portable update root cannot be inside ${protectedRoot}`);
    }
  }

  const markerPath = join(portableRoot, PORTABLE_MARKER_FILE_NAME);
  if (!markerExists(markerPath)) {
    throw new Error(`Portable update marker is missing: ${markerPath}`);
  }
};

export const parsePortableAppUpdateEntry = (
  manifest: PortableUpdateManifest,
): PortableAppUpdateEntry | null => {
  const entry = manifest?.portable?.["windows-x86_64"];
  const url = typeof entry?.url === "string" ? entry.url.trim() : "";
  const sha256 = typeof entry?.sha256 === "string" ? normalizeSha256(entry.sha256) : "";
  const rootDir = typeof entry?.rootDir === "string" && entry.rootDir.trim()
    ? entry.rootDir.trim()
    : WINDOWS_PORTABLE_ROOT_DIR;

  if (!url || !sha256 || !/^[a-f0-9]{64}$/.test(sha256)) {
    return null;
  }

  return { url, sha256, rootDir };
};

export const buildPortableUpdatePaths = (
  liveRoot: string,
  rootDir: string,
  nonce = `${Date.now()}-${randomBytes(4).toString("hex")}`,
): PortableUpdatePaths => {
  const resolvedLiveRoot = resolve(liveRoot);
  const siblingRoot = dirname(resolvedLiveRoot);
  const stagingParent = join(siblingRoot, `.ameow-update-staging-${nonce}`);
  const helperRoot = join(siblingRoot, `.ameow-update-helper-${nonce}`);
  return {
    liveRoot: resolvedLiveRoot,
    stagingParent,
    stagingRoot: join(stagingParent, rootDir),
    backupRoot: join(siblingRoot, `${basename(resolvedLiveRoot)}.ameow-backup-${nonce}`),
    helperScriptPath: join(helperRoot, "portable-update-helper.ps1"),
    logPath: join(helperRoot, "portable-update.log"),
  };
};

export const verifyFileSha256 = async (
  filePath: string,
  expectedSha256: string,
): Promise<void> => {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));
  const actual = hash.digest("hex");
  if (actual !== normalizeSha256(expectedSha256)) {
    throw new Error(`Portable update checksum mismatch: expected ${expectedSha256}, got ${actual}`);
  }
};

export const createPortableUpdateHelperScript = (): string => String.raw`param(
  [Parameter(Mandatory = $true)][string]$LiveRoot,
  [Parameter(Mandatory = $true)][string]$ZipPath,
  [Parameter(Mandatory = $true)][string]$StagingParent,
  [Parameter(Mandatory = $true)][string]$RootDir,
  [Parameter(Mandatory = $true)][string]$BackupRoot,
  [Parameter(Mandatory = $true)][string]$ExpectedExecutablePath,
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $true)][string]$LogPath
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
$MarkerFileName = ".ameow-portable.json"

function Write-UpdateLog {
  param([string]$Message)
  $parent = Split-Path -Parent $LogPath
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  Add-Content -LiteralPath $LogPath -Value ("{0} {1}" -f (Get-Date).ToString("s"), $Message)
}

function Assert-SafePortableRoot {
  param([string]$Path)
  $resolved = [System.IO.Path]::GetFullPath($Path)
  $root = [System.IO.Path]::GetPathRoot($resolved)
  if ($resolved.TrimEnd([System.IO.Path]::DirectorySeparatorChar) -eq $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar)) {
    throw "Refusing to update drive root: $resolved"
  }
  if ($env:USERPROFILE -and ($resolved.TrimEnd('\') -ieq ([System.IO.Path]::GetFullPath($env:USERPROFILE)).TrimEnd('\'))) {
    throw "Refusing to update user profile root: $resolved"
  }
  $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
  foreach ($protectedRoot in @($env:ProgramFiles, $programFilesX86)) {
    if ($protectedRoot) {
      $protectedFull = [System.IO.Path]::GetFullPath($protectedRoot).TrimEnd('\') + '\'
      if (($resolved.TrimEnd('\') + '\').StartsWith($protectedFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to update path inside protected root: $protectedRoot"
      }
    }
  }
  $marker = Join-Path $resolved $MarkerFileName
  if (-not (Test-Path -LiteralPath $marker)) {
    throw "Portable marker missing: $marker"
  }
}

function Get-ProcessPathSafe {
  param([System.Diagnostics.Process]$Process)
  try {
    if ($Process.Path) {
      return $Process.Path
    }
  } catch {}
  try {
    if ($Process.MainModule -and $Process.MainModule.FileName) {
      return $Process.MainModule.FileName
    }
  } catch {}
  return $null
}

function Wait-ForExpectedProcessExit {
  $deadline = (Get-Date).AddSeconds(180)
  while ((Get-Date) -lt $deadline) {
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $process) {
      return
    }
    $actualPath = Get-ProcessPathSafe $process
    if ($actualPath -and -not ($actualPath -ieq $ExpectedExecutablePath)) {
      throw "PID $ProcessId now belongs to a different executable: $actualPath"
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Timed out waiting for process $ProcessId to exit"
}

function Invoke-RenameWithRetry {
  param(
    [string]$From,
    [string]$To,
    [string]$Label
  )
  $delays = @(1, 2, 4)
  for ($attempt = 0; $attempt -lt $delays.Count; $attempt++) {
    try {
      Move-Item -LiteralPath $From -Destination $To -ErrorAction Stop
      return
    } catch {
      Write-UpdateLog ("{0} failed on attempt {1}: {2}" -f $Label, ($attempt + 1), $_.Exception.Message)
      Start-Sleep -Seconds $delays[$attempt]
    }
  }
  Move-Item -LiteralPath $From -Destination $To -ErrorAction Stop
}

function Assert-StagingStructure {
  $entries = @(Get-ChildItem -LiteralPath $StagingParent -Force)
  if ($entries.Count -ne 1 -or -not $entries[0].PSIsContainer -or $entries[0].Name -ne $RootDir) {
    throw "Portable update ZIP must contain exactly one root directory named $RootDir"
  }
  $exe = Join-Path $entries[0].FullName "Ameow.exe"
  if (-not (Test-Path -LiteralPath $exe)) {
    throw "Portable update staging is missing Ameow.exe"
  }
}

try {
  Write-UpdateLog "Portable update helper started"
  Assert-SafePortableRoot $LiveRoot
  if (Test-Path -LiteralPath $StagingParent) {
    Remove-Item -LiteralPath $StagingParent -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $StagingParent | Out-Null
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $StagingParent -Force
  Assert-StagingStructure
  Wait-ForExpectedProcessExit
  Invoke-RenameWithRetry -From $LiveRoot -To $BackupRoot -Label "live-to-backup"
  try {
    Invoke-RenameWithRetry -From (Join-Path $StagingParent $RootDir) -To $LiveRoot -Label "staging-to-live"
  } catch {
    Write-UpdateLog ("staging-to-live failed, attempting rollback: {0}" -f $_.Exception.Message)
    if (-not (Test-Path -LiteralPath $LiveRoot) -and (Test-Path -LiteralPath $BackupRoot)) {
      Move-Item -LiteralPath $BackupRoot -Destination $LiveRoot -ErrorAction SilentlyContinue
    }
    throw
  }
  $nextExe = Join-Path $LiveRoot "Ameow.exe"
  Start-Process -FilePath $nextExe -WorkingDirectory $LiveRoot
  try {
    Remove-Item -LiteralPath $BackupRoot -Recurse -Force -ErrorAction Stop
  } catch {
    Write-UpdateLog ("Backup cleanup failed: {0}" -f $_.Exception.Message)
  }
  try {
    Remove-Item -LiteralPath $StagingParent -Recurse -Force -ErrorAction Stop
  } catch {
    Write-UpdateLog ("Staging cleanup failed: {0}" -f $_.Exception.Message)
  }
  Write-UpdateLog "Portable update helper completed"
  exit 0
} catch {
  Write-UpdateLog ("Portable update helper failed: {0}" -f $_.Exception.Message)
  exit 1
}
`;

export const writePortableUpdateHelperScript = async (helperScriptPath: string): Promise<void> => {
  await mkdir(dirname(helperScriptPath), { recursive: true });
  await writeFile(helperScriptPath, createPortableUpdateHelperScript(), "utf8");
};

export const launchPortableUpdateHelper = async (
  paths: PortableUpdatePaths & {
    zipPath: string;
    rootDir: string;
    executablePath: string;
    currentProcessId: number;
  },
  spawnFn: SpawnLike = spawn,
): Promise<void> => {
  await writePortableUpdateHelperScript(paths.helperScriptPath);
  await new Promise<void>((resolveLaunch, rejectLaunch) => {
    let settled = false;
    const child = spawnFn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      paths.helperScriptPath,
      "-LiveRoot",
      paths.liveRoot,
      "-ZipPath",
      paths.zipPath,
      "-StagingParent",
      paths.stagingParent,
      "-RootDir",
      paths.rootDir,
      "-BackupRoot",
      paths.backupRoot,
      "-ExpectedExecutablePath",
      paths.executablePath,
      "-ProcessId",
      String(paths.currentProcessId),
      "-LogPath",
      paths.logPath,
    ], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });

    child.once("error", (error) => {
      if (!settled) {
        settled = true;
        rejectLaunch(error);
      }
    });
    child.once("spawn", () => {
      if (!settled) {
        settled = true;
        child.unref();
        resolveLaunch();
      }
    });
  });
};

export const performPortableAppUpdate = async (
  entry: PortableAppUpdateEntry,
  options: PerformPortableAppUpdateOptions,
): Promise<void> => {
  assertValidPortableRoot(options.portableRootPath);
  const parsedUrl = new URL(entry.url);
  if (parsedUrl.protocol !== "https:") {
    throw new Error(`Portable update URL must use HTTPS: ${entry.url}`);
  }

  const updatePaths = buildPortableUpdatePaths(options.portableRootPath, entry.rootDir);

  const downloadDir = await mkdtemp(join(tmpdir(), "ameow-portable-update-"));
  const zipPath = join(downloadDir, basename(parsedUrl.pathname) || "Ameow_portable_update.zip");
  await downloadToFile(entry.url, zipPath, {
    fetch: options.fetch,
    headers: buildGitHubHeaders(),
  });
  await verifyFileSha256(zipPath, entry.sha256);
  await mkdir(updatePaths.stagingParent, { recursive: true });

  await launchPortableUpdateHelper({
    ...updatePaths,
    zipPath,
    rootDir: entry.rootDir,
    executablePath: options.executablePath,
    currentProcessId: options.currentProcessId,
  });
};
