#Requires -Version 5.1
<#
.SYNOPSIS
Build a controlled Windows x64 GUI candidate or a reviewed owner-only private ZIP.
.DESCRIPTION
Paths are resolved from this script, not the caller's working directory. Nothing is deleted.
Package output never overwrites an existing directory; Cargo may update its task-owned target.
A missing/blocked minimum-material review produces no ZIP. Public release is not authorized.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$TargetDirectory,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [switch]$BuildOnly,
    [ValidateSet('private-owner-validation', 'public-release')][string]$PackageMode,
    [string]$LicenseReviewFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$packageRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$targetRoot = [IO.Path]::GetFullPath($TargetDirectory)
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
$platform = 'x86_64-pc-windows-msvc'
$utf8 = New-Object Text.UTF8Encoding($false)
$privateMarker = 'PRIVATE LOCAL VALIDATION ' + [char]0x2014 + ' NOT FOR DISTRIBUTION'
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
    return [ordered]@{ path = $RelativePath; bytes = $item.Length; sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash }
}

function Source-Inventory {
    $paths = @(Invoke-Native git @('-C', $packageRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '--', 'Cargo.toml', 'Cargo.lock', 'build.rs', 'LICENSE', 'src', 'assets', 'distribution/notices', $requirementsPath))
    # Own license and the reviewed requirements are mandatory package inputs, even if ignored.
    if (-not $BuildOnly) { $paths += @('LICENSE', $requirementsPath) }
    return @($paths | Sort-Object -Unique | ForEach-Object { File-Record $_ })
}

function Inventory-Digest($Inputs) {
    $hash = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = $utf8.GetBytes(($Inputs | ConvertTo-Json -Depth 5 -Compress))
        return ([BitConverter]::ToString($hash.ComputeHash($bytes))).Replace('-', '')
    } finally { $hash.Dispose() }
}

function Read-Private-Review {
    if (-not $LicenseReviewFile) { throw 'PRIVATE_GATE_A_BLOCKED: supply an actual hash-bound minimum-material review; no ZIP has been created.' }
    $review = Get-Content -LiteralPath $LicenseReviewFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($review.schema -ne 2 -or $review.scope -cne 'private-owner-validation' -or
        $review.privateGateA.status -cne 'minimum-materials-verified' -or
        $review.privateGateA.useModel -cne 'owner-only-controlled-device') {
        throw 'PRIVATE_GATE_A_BLOCKED: actual minimum materials must be verified for owner-only controlled-device use.'
    }
    if (@($review.privateGateA.blockers).Count -ne 0) {
        throw 'PRIVATE_GATE_A_BLOCKED: minimum-material blockers remain.'
    }
    $reviewTime = [DateTimeOffset]::MinValue
    if ([string]::IsNullOrWhiteSpace($review.reviewer) -or
        -not [DateTimeOffset]::TryParse($review.reviewedAtUtc, [ref]$reviewTime) -or
        $reviewTime -gt [DateTimeOffset]::UtcNow -or @($review.evidence).Count -eq 0 -or
        @($review.evidence | Where-Object { [string]::IsNullOrWhiteSpace($_) }).Count -gt 0) {
        throw 'PRIVATE_GATE_A_BLOCKED: real reviewer, review time and evidence references are required.'
    }
    if ($review.publicGateB.status -cne 'blocked' -or @($review.publicGateB.blockers).Count -eq 0) {
        throw 'PUBLIC_GATE_B_BLOCKED: private validation cannot clear public-release obligations or authorization.'
    }
    return $review
}

function Reviewed-Notices($Review, $Inputs, [string]$Head) {
    if ($review.baselineHead -cne $Head) { throw 'PRIVATE_GATE_A_BLOCKED: review belongs to a different baseline.' }
    if ($review.sourceInventorySha256 -cne (Inventory-Digest $Inputs)) {
        throw 'PRIVATE_GATE_A_BLOCKED: source/resource/license inventory differs from the audited build inputs.'
    }
    foreach ($binding in @(@('Cargo.lock', 'cargoLockSha256'), @('assets/runtime-manifest.json', 'runtimeManifestSha256'), @($requirementsPath, 'licenseInputsSha256'))) {
        $actual = @($Inputs | Where-Object { $_.path -ceq $binding[0] })[0].sha256
        if ($review.($binding[1]) -cne $actual) { throw "PRIVATE_GATE_A_BLOCKED: changed $($binding[0])." }
    }
    $requirements = Get-Content -LiteralPath (Join-Path $packageRoot $requirementsPath) -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($requirements.schema -ne 1 -or $requirements.scope -cne 'private-owner-validation' -or
        $requirements.publicGateB.status -cne 'blocked' -or @($requirements.publicGateB.blockers).Count -eq 0) {
        throw 'PRIVATE_GATE_A_BLOCKED: minimum-material inventory must retain the independent blocked public Gate B.'
    }
    $materials = @($requirements.materials)
    $notices = @($review.notices)
    if ($materials.Count -eq 0 -or $notices.Count -ne $materials.Count) {
        throw 'PRIVATE_GATE_A_BLOCKED: review must include every actual minimum material exactly once.'
    }
    $destinations = @{}
    foreach ($notice in $notices) {
        # Only reviewed text notices are eligible. No arbitrary repo, task, runtime or user files.
        $ownLicense = $notice.source -ceq 'LICENSE' -and $notice.destination -ceq 'LICENSE'
        if ((-not $ownLicense -and ($notice.source -cnotmatch '^(distribution/notices/[A-Za-z0-9_./-]+\.(txt|md|json)|assets/(LICENSE|runtime-notices\.md|runtime-GPL-3\.0\.txt|fonts/OFL\.txt))$' -or
            $notice.destination -cnotmatch '^licenses/[A-Za-z0-9_./-]+\.(txt|md|json)$')) -or
            $notice.source -match '(^|/)\.\.?(/|$)' -or
            $notice.destination -match '(^|/)\.\.?(/|$)' -or
            $notice.destination -ieq 'licenses/license-inputs.json' -or
            $destinations.ContainsKey($notice.destination)) {
            throw 'PRIVATE_GATE_A_BLOCKED: invalid or duplicated notice allowlist entry.'
        }
        $matched = @($materials | Where-Object { $_.source -ceq $notice.source -and $_.destination -ceq $notice.destination -and $_.sha256 -ceq $notice.sha256 })
        if ($matched.Count -ne 1 -or [string]::IsNullOrWhiteSpace($matched[0].kind) -or [string]::IsNullOrWhiteSpace($matched[0].obligation)) {
            throw 'PRIVATE_GATE_A_BLOCKED: notice omits or substitutes a required material.'
        }
        $record = File-Record $notice.source
        if ($record.sha256 -cne $notice.sha256) { throw "PRIVATE_GATE_A_BLOCKED: notice hash mismatch: $($notice.source)" }
        $destinations[$notice.destination] = $true
    }
    if (-not $destinations.ContainsKey('LICENSE')) { throw 'PRIVATE_GATE_A_BLOCKED: visible Ameow MIT LICENSE is required.' }
    return $notices
}

if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitProcess) { throw 'Run in 64-bit PowerShell on Windows.' }
if ($PackageMode -ceq 'public-release') { throw 'PUBLIC_GATE_B_BLOCKED: public release is not authorized; private success never clears Gate B.' }
if ($BuildOnly -and $PackageMode) { throw 'Choose BuildOnly or an explicit package mode, not both.' }
if (-not $BuildOnly -and $PackageMode -cne 'private-owner-validation') { throw 'PRIVATE_MODE_REQUIRED: explicitly select private-owner-validation for an owner-only ZIP.' }
if (-not $BuildOnly -and -not $LicenseReviewFile) { throw 'PRIVATE_GATE_A_BLOCKED: actual minimum-material review is required; no output created.' }
foreach ($directory in @($targetRoot, $outputRoot)) {
    if ($directory -eq $packageRoot -or $directory.StartsWith($packageRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Build/output paths must be task-owned directories outside the source package.'
    }
}
if ($targetRoot -eq $outputRoot -or $outputRoot.StartsWith($targetRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
    $targetRoot.StartsWith($outputRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Build and output directories must be separate.'
}
if (Test-Path -LiteralPath $outputRoot) { throw 'Output directory already exists; choose a new task-owned path.' }
if ($env:RUSTFLAGS -or $env:CARGO_ENCODED_RUSTFLAGS -or $env:RUSTC_WRAPPER -or $env:RUSTC_WORKSPACE_WRAPPER -or $env:CARGO_BUILD_TARGET) {
    throw 'Unexpected compiler flags/wrapper/target environment. Use a controlled build shell.'
}

$previousTarget = $env:CARGO_TARGET_DIR
$previousFlags = $env:RUSTFLAGS
Push-Location -LiteralPath $packageRoot
try {
    $reviewHash = $(if ($BuildOnly) { $null } else { (Get-FileHash -LiteralPath $LicenseReviewFile -Algorithm SHA256).Hash })
    $privateReview = $(if ($BuildOnly) { $null } else { Read-Private-Review })
    $head = (Invoke-Native git @('rev-parse', 'HEAD')) -join ''
    $tree = (Invoke-Native git @('rev-parse', 'HEAD^{tree}')) -join ''
    $rustc = @(Invoke-Native rustc @('-Vv'))
    if (-not ($rustc -contains "host: $platform")) { throw "Required toolchain host: $platform" }
    $cargo = (Invoke-Native cargo @('-V')) -join ''
    $before = @(Source-Inventory)
    $implementationInputs = @(File-Record 'scripts/package_portable.ps1'; File-Record 'distribution/README.txt'; File-Record 'distribution/packaging.md')
    $validationInputs = @(Invoke-Native git @('ls-files', '--cached', '--others', '--exclude-standard', '--', 'tests') | Sort-Object -Unique | ForEach-Object { File-Record $_ })
    $dependencies = @(Invoke-Native cargo @('tree', '--locked', '--offline', '--target', $platform, '--edges', 'normal,build', '--prefix', 'none', '--format', '{p}|{l}') | ForEach-Object { $_.Replace($packageRoot, '<package>').Replace($packageRoot.Replace('\', '/'), '<package>') } | Sort-Object -Unique)
    $reviewedNotices = @()
    if (-not $BuildOnly) { $reviewedNotices = @(Reviewed-Notices $privateReview $before $head) }
    if (-not $BuildOnly -and (Get-FileHash -LiteralPath $LicenseReviewFile -Algorithm SHA256).Hash -cne $reviewHash) { throw 'License review changed during validation.' }

    New-Item -ItemType Directory -Path $outputRoot | Out-Null
    New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
    $env:CARGO_TARGET_DIR = $targetRoot
    # Link the CRT into the application instead of depending on a developer's VC runtime install.
    # An explicit target keeps host procedural macros out of the static-CRT target build.
    $env:RUSTFLAGS = '-C target-feature=+crt-static'
    $buildArguments = @('build', '--locked', '--offline', '--release', '--target', $platform, '--bin', 'ameow')
    & cargo @buildArguments *> (Join-Path $outputRoot 'build.log')
    if ($LASTEXITCODE -ne 0) { throw "Release build failed; see $outputRoot/build.log" }
    $after = @(Source-Inventory)
    if (($before | ConvertTo-Json -Depth 5 -Compress) -cne ($after | ConvertTo-Json -Depth 5 -Compress)) {
        throw 'Build inputs changed during compilation; preserve this run and rebuild separately.'
    }
    foreach ($record in $implementationInputs) {
        if ((File-Record $record.path).sha256 -cne $record.sha256) { throw 'Packaging implementation inputs changed during compilation.' }
    }
    if (((Invoke-Native git @('rev-parse', 'HEAD')) -join '') -cne $head) { throw 'Baseline HEAD changed during compilation.' }
    if (-not $BuildOnly -and (Get-FileHash -LiteralPath $LicenseReviewFile -Algorithm SHA256).Hash -cne $reviewHash) { throw 'License review changed during compilation.' }
    $exe = Join-Path $targetRoot "$platform/release/ameow.exe"
    $exeRecord = [ordered]@{ path = 'Ameow.exe'; bytes = (Get-Item -LiteralPath $exe).Length; sha256 = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash }
    $manifest = [ordered]@{
        schema = 2
        purpose = $(if ($BuildOnly) { 'Ameow build-only candidate; no ZIP or product acceptance' } else { $privateMarker })
        packageMode = $(if ($BuildOnly) { 'build-only' } else { $PackageMode })
        recordedUtc = [DateTime]::UtcNow.ToString('o')
        baselineHead = $head
        baselineTree = $tree
        sourceChanges = @(Invoke-Native git @('status', '--porcelain=v1', '--', 'Cargo.toml', 'Cargo.lock', 'LICENSE', 'src', 'assets'))
        stageCChanges = @(Invoke-Native git @('status', '--porcelain=v1', '--', 'scripts/package_portable.ps1', 'distribution', 'tests'))
        sourceAndResources = $before
        sourceInventorySha256 = (Inventory-Digest $before)
        stageCInputs = $implementationInputs
        validationInputs = $validationInputs
        toolchain = [ordered]@{ rustc = $rustc; cargo = $cargo; target = $platform; rustflags = $env:RUSTFLAGS; command = 'cargo ' + ($buildArguments -join ' ') }
        dependencyInventory = [ordered]@{ method = 'cargo tree --locked --offline --target x86_64-pc-windows-msvc --edges normal,build --prefix none --format {p}|{l}'; packages = $dependencies; limit = 'Target dependency graph/license metadata; not a substitute for reviewed third-party license texts.' }
        managedRuntime = (Get-Content -LiteralPath (Join-Path $packageRoot 'assets/runtime-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json)
        executable = $exeRecord
        privateGateA = $(if ($BuildOnly) { [ordered]@{ status = 'not-evaluated'; zipCreated = $false } } else { [ordered]@{ status = 'minimum-materials-verified'; useModel = 'owner-only-controlled-device'; reviewSha256 = $reviewHash; licenseInputsSha256 = (File-Record $requirementsPath).sha256 } })
        publicGateB = [ordered]@{ status = 'blocked'; authorization = 'not-authorized'; privateValidationClearsPublicGate = $false; blockers = $(if ($BuildOnly) { @('Public release review and authorization are outstanding.') } else { @((Get-Content -LiteralPath (Join-Path $packageRoot $requirementsPath) -Raw -Encoding UTF8 | ConvertFrom-Json).publicGateB.blockers) }) }
        notices = $reviewedNotices
    }
    Write-Json (Join-Path $outputRoot 'input-manifest.json') $manifest
    if ($BuildOnly) {
        Write-Output "Build-only candidate: $exe"
        Write-Output "SHA256: $($exeRecord.sha256)"
        return
    }

    # Stage only named members. Never recurse-copy a repository/target/cache/runtime tree.
    $stage = Join-Path $outputRoot 'Ameow'
    New-Item -ItemType Directory -Path $stage | Out-Null
    $members = @('Ameow.exe', 'README.txt', 'input-manifest.json', 'PRIVATE-LOCAL-VALIDATION.txt', 'licenses/license-inputs.json')
    Copy-Item -LiteralPath $exe -Destination (Join-Path $stage 'Ameow.exe')
    Copy-Item -LiteralPath (Join-Path $packageRoot 'distribution/README.txt') -Destination (Join-Path $stage 'README.txt')
    Copy-Item -LiteralPath (Join-Path $outputRoot 'input-manifest.json') -Destination (Join-Path $stage 'input-manifest.json')
    [IO.File]::WriteAllText((Join-Path $stage 'PRIVATE-LOCAL-VALIDATION.txt'), ($privateMarker + "`r`nOnly the project owner on their controlled device. Do not share, upload or distribute. Public Gate B remains BLOCKED.`r`n"), $utf8)
    New-Item -ItemType Directory -Path (Join-Path $stage 'licenses') | Out-Null
    Copy-Item -LiteralPath (Join-Path $packageRoot $requirementsPath) -Destination (Join-Path $stage 'licenses/license-inputs.json')
    foreach ($notice in $reviewedNotices) {
        if ((File-Record $notice.source).sha256 -cne $notice.sha256) { throw 'Notice changed after review.' }
        $destination = Join-Path $stage $notice.destination
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $packageRoot $notice.source) -Destination $destination
        $members += $notice.destination
    }
    $memberRecords = @($members | Sort-Object | ForEach-Object {
        $path = Join-Path $stage $_
        [ordered]@{ path = $_; bytes = (Get-Item -LiteralPath $path).Length; sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash }
    })
    if (@($memberRecords | Where-Object { $_.path -ceq 'Ameow.exe' })[0].sha256 -cne $exeRecord.sha256) { throw 'Staged executable changed.' }
    foreach ($notice in $reviewedNotices) {
        if (@($memberRecords | Where-Object { $_.path -ceq $notice.destination })[0].sha256 -cne $notice.sha256) { throw 'Staged notice differs from the reviewed material.' }
    }
    if (@($memberRecords | Where-Object { $_.path -ceq 'licenses/license-inputs.json' })[0].sha256 -cne $privateReview.licenseInputsSha256) { throw 'Staged minimum-material inventory changed.' }
    if (@($memberRecords | Where-Object { $_.path -ceq 'README.txt' })[0].sha256 -cne @($implementationInputs | Where-Object { $_.path -ceq 'distribution/README.txt' })[0].sha256) { throw 'Staged user guide changed.' }
    if ((Inventory-Digest @(Source-Inventory)) -cne (Inventory-Digest $before)) { throw 'Inputs changed during staging; no ZIP created.' }
    Add-Type -AssemblyName System.IO.Compression
    $zipPath = Join-Path $outputRoot 'Ameow_PRIVATE_windows_x64_portable.zip'
    $stream = [IO.File]::Open($zipPath, [IO.FileMode]::CreateNew)
    try {
        $archive = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
        try {
            foreach ($member in $memberRecords) {
                $entry = $archive.CreateEntry($member.path, [IO.Compression.CompressionLevel]::Optimal)
                $input = [IO.File]::OpenRead((Join-Path $stage $member.path))
                $output = $entry.Open()
                try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() }
            }
        } finally { $archive.Dispose() }
    } finally { $stream.Dispose() }
    Write-Json (Join-Path $outputRoot 'package-manifest.json') ([ordered]@{
        schema = 2; packageMode = $PackageMode; marker = $privateMarker; publicGateB = 'blocked/not-authorized'; members = $memberRecords
        zip = [ordered]@{ path = [IO.Path]::GetFileName($zipPath); bytes = (Get-Item -LiteralPath $zipPath).Length; sha256 = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash }
    })
    Write-Output $privateMarker
    Write-Output "Owner-only private validation candidate: $zipPath"
    Write-Output "ZIP SHA256: $((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash)"
} finally {
    $env:CARGO_TARGET_DIR = $previousTarget
    $env:RUSTFLAGS = $previousFlags
    Pop-Location
}
