#Requires -Version 5.1
<#
.SYNOPSIS
Build the Windows application, Launcher and offline release tool, then prepare unsigned update inputs.
.DESCRIPTION
No approval file, version Tag, signing key or upload is needed. Dirty development inputs are recorded;
production signing requires a clean, identified Commit. Run this script in a separate clean checkout
for a release candidate without disturbing the development checkout.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$TargetDirectory,
    [Parameter(Mandatory)][string]$OutputDirectory
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$packageRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$targetRoot = [IO.Path]::GetFullPath($TargetDirectory)
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
$platform = 'x86_64-pc-windows-msvc'
$utf8 = New-Object Text.UTF8Encoding($false)
$requirementsPath = 'distribution/license-inputs.json'
function Write-Json([string]$Path, $Value) {
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 30), $utf8)
}
function Invoke-Native([string]$Name, [string[]]$Arguments) {
    $result = @(& $Name @Arguments)
    if ($LASTEXITCODE -ne 0) { throw "$Name failed (exit $LASTEXITCODE)." }
    return $result
}
function File-Record([string]$RelativePath) {
    $path = Join-Path $packageRoot $RelativePath
    $item = Get-Item -LiteralPath $path
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Not a regular input file: $RelativePath"
    }
    $parent = $item.Directory
    while ($parent.FullName -ine $packageRoot) {
        if ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse input directory: $RelativePath" }
        $parent = $parent.Parent
        if ($null -eq $parent) { throw "Input outside package: $RelativePath" }
    }
    return [ordered]@{path=$RelativePath;bytes=$item.Length;sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash}
}
function Source-Inventory {
    $paths = @(Invoke-Native git @('-C', $packageRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '--', 'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'vendor/accesskit_windows', 'build.rs', 'build_support', 'THIRD_PARTY_NOTICES.md', 'LICENSE', 'src', 'assets', 'distribution/notices', $requirementsPath))
    return @($paths | Sort-Object -Unique | ForEach-Object { File-Record $_ })
}
function Inventory-Digest($Inputs) {
    $hash = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = $utf8.GetBytes(($Inputs | ConvertTo-Json -Depth 5 -Compress))
        return ([BitConverter]::ToString($hash.ComputeHash($bytes))).Replace('-', '')
    } finally { $hash.Dispose() }
}
if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitProcess) { throw 'Run in 64-bit PowerShell on Windows.' }
foreach ($directory in @($targetRoot, $outputRoot)) {
    if ($directory -eq $packageRoot -or $directory.StartsWith($packageRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Build/output paths must be outside the source checkout.'
    }
}
if ($targetRoot -eq $outputRoot -or $outputRoot.StartsWith($targetRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
    $targetRoot.StartsWith($outputRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Build and output directories must be separate.' }
if (Test-Path -LiteralPath $outputRoot) { throw 'Output directory already exists; existing assets are never overwritten.' }
if ($env:RUSTFLAGS -or $env:CARGO_ENCODED_RUSTFLAGS -or $env:RUSTC_WRAPPER -or $env:RUSTC_WORKSPACE_WRAPPER -or $env:CARGO_BUILD_TARGET) {
    throw 'Unexpected compiler flags/wrapper/target environment.'
}
$previousTarget = $env:CARGO_TARGET_DIR
$previousFlags = $env:RUSTFLAGS
Push-Location -LiteralPath $packageRoot
try {
    $head = (Invoke-Native git @('rev-parse', 'HEAD')) -join ''
    $tree = (Invoke-Native git @('rev-parse', 'HEAD^{tree}')) -join ''
    $dirty = @(Invoke-Native git @('status', '--porcelain=v1', '--untracked-files=all')).Count -ne 0
    $version = ((Invoke-Native cargo @('metadata','--locked','--offline','--no-deps','--format-version','1')) -join '' | ConvertFrom-Json).packages | Where-Object name -CEQ 'ameow' | Select-Object -ExpandProperty version
    $tag = $null
    if ($env:GITHUB_REF_TYPE -ceq 'tag') {
        $tag = $env:GITHUB_REF_NAME
        if ($tag -cne "v$version" -or $dirty -or ((Invoke-Native git @('rev-parse', "refs/tags/$tag^{commit}")) -join '') -cne $head) { throw 'Tag trigger must match the clean build Commit and Cargo version.' }
    }
    $rustc = @(Invoke-Native rustc @('-Vv'))
    if (-not ($rustc -contains "host: $platform") -or -not ($rustc -contains 'release: 1.98.1')) { throw 'Required toolchain: Rust 1.98.1 / Windows x64 MSVC.' }
    $before = @(Source-Inventory)
    $implementationInputs = @(File-Record 'scripts/package_portable.ps1'; File-Record '.github/workflows/rust.yml'; File-Record 'rust-toolchain.toml')
    $requirements = Get-Content -LiteralPath (Join-Path $packageRoot $requirementsPath) -Raw | ConvertFrom-Json
    if ($requirements.schema -ne 1 -or @($requirements.materials).Count -eq 0) { throw 'E_RELEASE_MATERIALS: missing material inventory.' }
    $destinations = @{}
    $materialAudit = @()
    $materialInputs = @($requirements.materials) + @([pscustomobject]@{source=$requirementsPath;destination='licenses/license-inputs.json';sha256=(File-Record $requirementsPath).sha256})
    foreach ($material in $materialInputs) {
        $own = $material.source -ceq 'LICENSE' -and $material.destination -ceq 'LICENSE'
        if ((-not $own -and ($material.source -cnotmatch '^(THIRD_PARTY_NOTICES\.md|distribution/notices/[A-Za-z0-9_./-]+\.(txt|md|json)|assets/(LICENSE|runtime-notices\.md|runtime-GPL-3\.0\.txt|fonts/OFL\.txt))$' -and $material.source -cne $requirementsPath)) -or
            (-not $own -and $material.destination -cnotmatch '^licenses/[A-Za-z0-9_./-]+\.(txt|md|json)$') -or
            $material.source -match '(^|/)\.\.?(/|$)' -or $material.destination -match '(^|/)\.\.?(/|$)' -or $destinations.ContainsKey($material.destination) -or
            ($material.destination -ieq 'licenses/license-inputs.json' -and $material.source -cne $requirementsPath)) { throw 'E_RELEASE_MATERIALS: invalid or duplicated material path.' }
        $actual = File-Record $material.source
        if ($actual.sha256 -ine $material.sha256) { throw "E_RELEASE_MATERIALS: byte hash mismatch: $($material.source)" }
        $materialAudit += [ordered]@{source=$material.source;destination=$material.destination;sha256=$actual.sha256}
        $destinations[$material.destination] = $true
    }
    if (-not $destinations.ContainsKey('LICENSE') -or -not $destinations.ContainsKey('licenses/THIRD_PARTY_NOTICES.md')) { throw 'E_RELEASE_MATERIALS: LICENSE and THIRD_PARTY_NOTICES are required.' }
    New-Item -ItemType Directory -Path $outputRoot | Out-Null
    New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
    $env:CARGO_TARGET_DIR = $targetRoot
    # An explicit target keeps host procedural macros out of the static-CRT build.
    $env:RUSTFLAGS = '-C target-feature=+crt-static'
    $buildArguments = @('build','--locked','--offline','--release','--target',$platform,'--bin','ameow','--bin','ameow-launcher','--bin','ameow-release')
    & cargo @buildArguments *> (Join-Path $outputRoot 'build.log')
    if ($LASTEXITCODE -ne 0) { throw "Release build failed; see $outputRoot/build.log" }
    if ((Inventory-Digest @(Source-Inventory)) -cne (Inventory-Digest $before)) { throw 'Build inputs changed during compilation.' }
    foreach ($record in $implementationInputs) {
        if ((File-Record $record.path).sha256 -cne $record.sha256) { throw 'Packaging inputs changed during compilation.' }
    }
    if (((Invoke-Native git @('rev-parse','HEAD')) -join '') -cne $head) { throw 'Build Commit changed during compilation.' }
    $recordFile = { param($path,$name) [ordered]@{path=$name;bytes=(Get-Item -LiteralPath $path).Length;sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()} }
    foreach ($binary in @(@('ameow','Ameow'),@('ameow-launcher','AmeowLauncher'),@('ameow-release','ameow-release'))) {
        Copy-Item -LiteralPath (Join-Path $targetRoot "$platform/release/$($binary[0]).exe") -Destination (Join-Path $outputRoot "$($binary[1]).exe")
    }
    $appPath = Join-Path $outputRoot 'Ameow.exe'
    if ([Diagnostics.FileVersionInfo]::GetVersionInfo($appPath).ProductVersion -cne $version) { throw 'PE product version differs from Cargo version.' }
    $materials = @()
    foreach ($material in $materialInputs) {
        $destination = Join-Path $outputRoot $material.destination
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $packageRoot $material.source) -Destination $destination
        $record = & $recordFile $destination $material.destination
        if ($record.sha256 -ine $material.sha256) { throw 'Staged material bytes changed.' }
        $materials += $record
    }
    Write-Json (Join-Path $outputRoot 'input-manifest.json') ([ordered]@{schema=2;baselineHead=$head;baselineTree=$tree;dirty=$dirty;sourceAndResources=$before;sourceInventorySha256=(Inventory-Digest $before);packagingInputs=$implementationInputs;toolchain=$rustc;command=('cargo '+($buildArguments -join ' '))})
    Write-Json (Join-Path $outputRoot 'material-audit.json') ([ordered]@{materials=$materialAudit})
    $build = [ordered]@{schema=1;version=$version;target=$platform;commit=$head;tree=$tree;tag=$tag;dirty=$dirty;source_sha256=(Inventory-Digest $before).ToLowerInvariant();cargo_lock_sha256=(File-Record 'Cargo.lock').sha256.ToLowerInvariant();toolchain='1.98.1';trust=(Get-Content -LiteralPath (Join-Path $packageRoot 'assets/app-update-trust.json') -Raw | ConvertFrom-Json);app=(& $recordFile $appPath 'Ameow.exe');launcher=(& $recordFile (Join-Path $outputRoot 'AmeowLauncher.exe') 'AmeowLauncher.exe');notices=$materials}
    Write-Json (Join-Path $outputRoot 'release-build.json') $build
    $tool = Join-Path $outputRoot 'ameow-release.exe'
    & $tool prepare $outputRoot (Join-Path $outputRoot 'prepared') *> (Join-Path $outputRoot 'release-preparation.log')
    if ($LASTEXITCODE -ne 0) { throw "Update preparation failed; see $outputRoot/release-preparation.log" }
    & $tool verify (Join-Path $outputRoot 'prepared')
    if ($LASTEXITCODE -ne 0) { throw 'Unsigned input verification failed.' }
    Write-Json (Join-Path $outputRoot 'release-tool.json') (& $recordFile $tool 'ameow-release.exe')
    if ((Inventory-Digest @(Source-Inventory)) -cne (Inventory-Digest $before)) { throw 'Inputs changed during release preparation.' }
    Write-Output "Unsigned release inputs: $outputRoot/prepared (nothing signed or uploaded)"
} finally {
    $env:CARGO_TARGET_DIR = $previousTarget
    $env:RUSTFLAGS = $previousFlags
    Pop-Location
}
