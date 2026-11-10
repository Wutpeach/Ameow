#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SignedDirectory,
    [Parameter(Mandatory)][string]$ReleaseTool,
    [Parameter(Mandatory)][string]$TrustedPublicRoots,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$Iscc = "${env:ProgramFiles(x86)}/Inno Setup 6/ISCC.exe",
    [switch]$Fixture,
    [ValidateSet('controlled', 'public-release')][string]$PackageMode = 'controlled'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$publicRelease = $PackageMode -ceq 'public-release'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$inventory = Get-Content -LiteralPath (Join-Path $repository 'distribution/license-inputs.json') -Raw | ConvertFrom-Json
if ($publicRelease -and ($Fixture -or $inventory.schema -ne 1 -or $inventory.scope -cne 'public-release' -or $inventory.publicGateB.status -cne 'approved' -or @($inventory.publicGateB.blockers).Count -ne 0)) {
    throw 'PUBLIC_GATE_B_BLOCKED: approved public materials and a production signed build are required.'
}
$utf8 = New-Object Text.UTF8Encoding($false)
function Assert-PlainPath([string]$Path) {
    if (-not [IO.Path]::IsPathFullyQualified($Path) -or $Path -match '["\r\n]') { throw "Choose an absolute plain path: $Path" }
    $item = [IO.Path]::GetFullPath($Path)
    while ($item) {
        if ((Test-Path -LiteralPath $item) -and ((Get-Item -LiteralPath $item).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Reparse path: $Path" }
        $item = [IO.Path]::GetDirectoryName($item)
    }
}
foreach ($path in @($SignedDirectory, $ReleaseTool, $TrustedPublicRoots, $OutputDirectory, $Iscc)) { Assert-PlainPath $path }
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Choose a new output directory; existing delivery assets are never overwritten.' }
if (-not (Test-Path -LiteralPath $Iscc -PathType Leaf)) { throw 'INNO_SETUP_NOT_FOUND: install Inno Setup 6 or supply -Iscc.' }
$roots = Get-Content -LiteralPath $TrustedPublicRoots -Raw | ConvertFrom-Json
$production = Get-Content -LiteralPath (Join-Path $repository 'assets/app-update-trust.json') -Raw | ConvertFrom-Json
if ($inventory.publicGateB.status -cnotin @('blocked', 'approved')) { throw 'PUBLIC_GATE_B_BLOCKED: unknown material review.' }
$testKey = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a'
if ($Fixture) {
    if ($roots.schema -ne 1 -or @($roots.keys).Count -ne 1 -or $roots.keys[0] -cne $testKey) { throw 'FIXTURE_ROOT_REQUIRED: use only the public RFC fixture root.' }
} else {
    if (@($production.keys).Count -eq 0) { throw 'E_APP_UPDATE_TRUST_NOT_CONFIGURED: no production delivery can be made.' }
    if ($production.keys -ccontains $testKey) { throw 'E_RELEASE_TEST_KEY: fixture roots cannot authorize production delivery.' }
    if (($roots | ConvertTo-Json -Compress) -cne ($production | ConvertTo-Json -Compress)) { throw 'E_RELEASE_TRUST_MISMATCH' }
}
$verification = & $ReleaseTool verify-signed $SignedDirectory $TrustedPublicRoots
if ($LASTEXITCODE -ne 0) { throw 'SIGNED_DELIVERY_REQUIRED: existing release verification rejected the input.' }
$report = ($verification -join "`n") | ConvertFrom-Json
$gate = if ($publicRelease) { 'approved' } else { 'blocked' }
if ($report.controlled -eq $publicRelease -or $report.publicGateB -cne $gate -or $report.build.version -cnotmatch '^\d+\.\d+\.\d+$') { throw 'E_RELEASE_BUILD_IDENTITY: signed build does not match the selected delivery mode.' }
if ($publicRelease) {
    $reviewedInventory = @($report.build.notices | Where-Object path -CEQ 'licenses/license-inputs.json')
    if ($reviewedInventory.Count -ne 1 -or (Get-FileHash -LiteralPath (Join-Path $repository 'distribution/license-inputs.json') -Algorithm SHA256).Hash -ine $reviewedInventory[0].sha256) { throw 'E_RELEASE_MATERIAL_REVIEW: signed inventory differs from the current approved review.' }
}
if ($Fixture -and ($report.build.commit -cne ('0' * 40) -or -not $report.build.dirty)) { throw 'FIXTURE_IDENTITY_REQUIRED: synthetic debug fixtures only.' }
$version = $report.build.version
$suffix = if ($Fixture) { 'FIXTURE-NOT-FOR-DISTRIBUTION' } elseif ($publicRelease) { 'PUBLIC' } else { 'CONTROLLED' }
$fileSuffix = if ($publicRelease) { '' } else { "-$suffix" }
$name = if ($Fixture) { 'Ameow C5 Validation' } else { 'Ameow' }
$appId = if ($Fixture) { 'Ameow.C5.Validation' } else { 'Ameow.Rust' }
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
$output = [IO.Path]::GetFullPath($OutputDirectory)
$payload = Join-Path $output 'payload'
New-Item -ItemType Directory -Path $payload | Out-Null
Add-Type -AssemblyName System.IO.Compression
function Record([string]$Path, [string]$Name) {
    [ordered]@{path=$Name;bytes=(Get-Item -LiteralPath $Path).Length;sha256=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
}
function Check-Record([string]$Path, $Record) {
    $actual = Record $Path $Record.path
    if ($actual.bytes -ne $Record.bytes -or $actual.sha256 -cne $Record.sha256) { throw "Changed verified member: $($Record.path)" }
}
$portableSource = Join-Path $SignedDirectory $report.portable.path
Check-Record $portableSource $report.portable
$portableName = "Ameow_${version}_windows_x64_portable$fileSuffix.zip"
Copy-Item -LiteralPath $portableSource -Destination (Join-Path $output $portableName)
$archive = [IO.Compression.ZipArchive]::new([IO.File]::OpenRead((Join-Path $output $portableName)), [IO.Compression.ZipArchiveMode]::Read)
$lines = @('[Files]')
try {
    if ($archive.Entries.Count -ne @($report.members).Count) { throw 'ZIP member count changed.' }
    foreach ($member in $report.members) {
        $relative = $member.path
        if ($relative -cnotmatch '^[A-Za-z0-9_./-]+$' -or $relative -match '(^|/)\.\.?(/|$)' -or $relative.StartsWith('/')) { throw 'Invalid verified member path.' }
        $entry = $archive.GetEntry($relative)
        if ($null -eq $entry -or $entry.Length -ne $member.bytes) { throw 'ZIP member changed.' }
        $destination = Join-Path $payload $relative
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
        $input = $entry.Open(); $stream = [IO.File]::Open($destination, [IO.FileMode]::CreateNew)
        try { $input.CopyTo($stream) } finally { $stream.Dispose(); $input.Dispose() }
        Check-Record $destination $member
        $parent = [IO.Path]::GetDirectoryName($relative).Replace('/', '\')
        $flags = if ($relative -ceq 'state.json') { 'onlyifdoesntexist uninsneveruninstall' } elseif ($relative.StartsWith('versions/')) { 'onlyifdoesntexist' } else { 'ignoreversion' }
        $lines += 'Source: "' + $destination + '"; DestDir: "{app}' + $(if ($parent) { '\' + $parent }) + '"; Flags: ' + $flags
    }
} finally { $archive.Dispose() }
$include = Join-Path $output 'payload.iss'
[IO.File]::WriteAllLines($include, [string[]]$lines, $utf8)
$appMember = @($report.members | Where-Object path -CEQ "versions/$version/Ameow.exe")[0]
$manifestMember = @($report.members | Where-Object path -CEQ "versions/$version/manifest.json")[0]
$installerName = "Ameow_${version}_windows_x64_installer$fileSuffix"
$defines = @("/DPayloadInclude=$include", "/DApplicationId=$appId", "/DApplicationName=$name", "/DApplicationVersion=$version", "/DDeliveryOutput=$output", "/DInstallerName=$installerName", "/DAppHash=$($appMember.sha256)", "/DManifestHash=$($manifestMember.sha256)")
if ($Fixture) { $defines += '/DValidationBuild=1' }
$definition = Record (Join-Path $repository 'distribution/ameow.iss') 'distribution/ameow.iss'
$packaging = Record $PSCommandPath 'scripts/package_windows.ps1'
$includeRecord = Record $include 'payload.iss'
& $Iscc /Qp @defines (Join-Path $repository 'distribution/ameow.iss') *> (Join-Path $output 'inno-build.log')
if ($LASTEXITCODE -ne 0) { throw "Inno compilation failed; see $output/inno-build.log" }
Check-Record (Join-Path $repository $definition.path) $definition
Check-Record $PSCommandPath $packaging
Check-Record $include $includeRecord
# Recheck the immutable core and update archive after compilation, not just before staging.
foreach ($member in $report.members) { Check-Record (Join-Path $payload $member.path) $member }
Check-Record (Join-Path $output $portableName) $report.portable
Check-Record (Join-Path $SignedDirectory $report.update.path) $report.update
Copy-Item -LiteralPath (Join-Path $SignedDirectory $report.update.path) -Destination (Join-Path $output $report.update.path)
Check-Record (Join-Path $SignedDirectory 'manifest.json') $manifestMember
$manifestName = 'ameow-update-windows-x64.json'
Copy-Item -LiteralPath (Join-Path $SignedDirectory 'manifest.json') -Destination (Join-Path $output $manifestName)
[IO.File]::WriteAllText((Join-Path $output 'verified-release.json'), ($report | ConvertTo-Json -Depth 30), $utf8)
$installer = Record (Join-Path $output "$installerName.exe") "$installerName.exe"
$portable = Record (Join-Path $output $portableName) $portableName
$manifest = Record (Join-Path $output $manifestName) $manifestName
$assets = @($installer, $portable, $report.update, $manifest)
foreach ($asset in $assets) { Check-Record (Join-Path $output $asset.path) $asset }
[IO.File]::WriteAllLines((Join-Path $output 'SHA256SUMS.txt'), [string[]]@($assets | ForEach-Object { "$($_.sha256)  $($_.path)" }), $utf8)
$result = [ordered]@{schema=1;mode=$suffix;publicGateB=$gate;productionKeyCreated=$false;build=$report.build;installer=$installer;portable=$portable;update=$report.update;manifest=$manifest;assets=$assets;members=$report.members;installerDefinition=$definition;packaging=$packaging;compiler=(Record $Iscc 'ISCC.exe')}
[IO.File]::WriteAllText((Join-Path $output 'delivery.json'), ($result | ConvertTo-Json -Depth 30), $utf8)
Write-Output "Windows delivery: $output/delivery.json ($suffix; public Gate B $gate; nothing uploaded)"
