#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SignedDirectory,
    [Parameter(Mandatory)][string]$ReleaseTool,
    [Parameter(Mandatory)][string]$TrustedPublicRoots,
    [Parameter(Mandatory)][string]$EvidenceDirectory,
    [string]$Iscc = "${env:ProgramFiles(x86)}/Inno Setup 6/ISCC.exe"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not [IO.Path]::IsPathFullyQualified($EvidenceDirectory) -or (Test-Path -LiteralPath $EvidenceDirectory)) { throw 'Choose a new absolute evidence directory.' }
New-Item -ItemType Directory -Path $EvidenceDirectory | Out-Null
$package = Join-Path $PSScriptRoot 'package_windows.ps1'
$common = @{SignedDirectory=$SignedDirectory; ReleaseTool=$ReleaseTool; TrustedPublicRoots=$TrustedPublicRoots; Iscc=$Iscc}
$checks = @()
function Reject([string]$Name, [scriptblock]$Action, [string]$Expected) {
    $output = Join-Path $EvidenceDirectory $Name
    try { & $Action $output; throw 'Unexpected packaging success.' } catch {
        if ($_.Exception.Message -notlike "$Expected*") { throw }
        if (Test-Path -LiteralPath $output) { throw 'Rejected packaging created output.' }
        $_.Exception.Message | Set-Content -LiteralPath (Join-Path $EvidenceDirectory "$Name.txt") -Encoding utf8
    }
}
$wrongRoots = Join-Path $EvidenceDirectory 'wrong-fixture-roots.json'
@{schema=1;keys=@('12' * 32)} | ConvertTo-Json | Set-Content -LiteralPath $wrongRoots -Encoding utf8
Reject 'fixture-root' { param($out) & $package -SignedDirectory $SignedDirectory -ReleaseTool $ReleaseTool -TrustedPublicRoots $wrongRoots -OutputDirectory $out -Fixture -Iscc $Iscc } 'FIXTURE_ROOT_REQUIRED:'
$checks += 'wrong-fixture-root-rejected-before-output'
$production = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../assets/app-update-trust.json') -Raw | ConvertFrom-Json
$productionRejection = if (@($production.keys).Count -eq 0) { 'E_APP_UPDATE_TRUST_NOT_CONFIGURED:' } else { 'E_RELEASE_TRUST_MISMATCH' }
Reject 'production' { param($out) & $package @common -OutputDirectory $out } $productionRejection
$checks += $(if (@($production.keys).Count -eq 0) { 'empty-production-root-rejected-before-output' } else { 'production-trust-mismatch-rejected-before-output' })
$broken = Join-Path $EvidenceDirectory 'tampered-source'
New-Item -ItemType Directory -Path $broken | Out-Null
foreach ($file in Get-ChildItem -LiteralPath $SignedDirectory -File) { Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $broken $file.Name) }
$portable = @(Get-ChildItem -LiteralPath $broken -Filter '*portable.zip')[0]
Add-Type -AssemblyName System.IO.Compression
$version = (Get-Content -LiteralPath (Join-Path $broken 'release-build.json') -Raw | ConvertFrom-Json).version
$zip = [IO.Compression.ZipArchive]::new([IO.File]::Open($portable.FullName, [IO.FileMode]::Open), [IO.Compression.ZipArchiveMode]::Update)
try {
    $name = "versions/$version/Ameow.exe"
    $zip.GetEntry($name).Delete()
    $stream = $zip.CreateEntry($name).Open()
    try { $stream.WriteByte(1) } finally { $stream.Dispose() }
} finally { $zip.Dispose() }
Reject 'tampered' { param($out) & $package -SignedDirectory $broken -ReleaseTool $ReleaseTool -TrustedPublicRoots $TrustedPublicRoots -OutputDirectory $out -Fixture -Iscc $Iscc 2> (Join-Path $EvidenceDirectory 'tampered-stderr.txt') } 'SIGNED_DELIVERY_REQUIRED:'
$checks += 'tampered-portable-rejected-before-output'
$valid = Join-Path $EvidenceDirectory 'valid'
& $package @common -OutputDirectory $valid -Fixture
$delivery = Get-Content -LiteralPath (Join-Path $valid 'delivery.json') -Raw | ConvertFrom-Json
if ($delivery.mode -cne 'FIXTURE-NOT-FOR-DISTRIBUTION' -or -not $delivery.fixture -or $delivery.installer.bytes -le 0) { throw 'Missing controlled installer identity.' }
if (@($delivery.assets).Count -ne 3 -or $delivery.manifest.path -cne 'ameow-update-windows-x64.json') { throw 'Missing one of the three Windows release assets.' }
foreach ($resource in $delivery.installerResources) {
    $source = Join-Path $PSScriptRoot ('../' + $resource.path)
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ine $resource.sha256) { throw "Installer resource changed: $($resource.path)" }
}
if ($delivery.installerResources.Count -ne 4 -or $delivery.compilerMessages.path -cne 'Default.isl' -or $delivery.installerSource.commit -cnotmatch '^[0-9a-f]{40}$') { throw 'Missing installer source or language/icon materials.' }
if (@($delivery.omittedRootLicenseMirrors).Count -eq 0 -or @($delivery.installedMembers | Where-Object { $_.path.StartsWith('licenses/') }).Count -ne 0) { throw 'Installer must keep legal texts in the signed version slot without a redundant root licenses tree.' }
if (@($delivery.installedMembers | Where-Object { $_.path.StartsWith("versions/$version/licenses/") }).Count -eq 0 -or @($delivery.installedMembers | Where-Object path -CEQ 'LICENSE').Count -ne 1) { throw 'Installed legal material is incomplete.' }
if (@($delivery.installedMembers).Count + @($delivery.omittedRootLicenseMirrors).Count -ne @($delivery.members).Count) { throw 'Every verified ZIP member must be accounted for.' }
foreach ($asset in $delivery.assets) {
    $file = Join-Path $valid $asset.path
    if ((Get-Item -LiteralPath $file).Length -ne $asset.bytes -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $asset.sha256) { throw "Release asset changed: $($asset.path)" }
}
if ((Get-FileHash -LiteralPath (Join-Path $SignedDirectory 'manifest.json') -Algorithm SHA256).Hash -ine $delivery.manifest.sha256 -or @(Get-Content -LiteralPath (Join-Path $valid 'SHA256SUMS.txt')).Count -ne 3) { throw 'Signed manifest or checksum list changed.' }
$envelope = Get-Content -LiteralPath (Join-Path $valid $delivery.manifest.path) -Raw | ConvertFrom-Json
$manifest = $envelope.payload | ConvertFrom-Json
if ($manifest.PSObject.Properties.Name -contains 'expires' -or $manifest.version -cne $delivery.build.version) { throw 'Release manifest must have no expiry and match the delivery version.' }
Add-Type -AssemblyName System.IO.Compression
$zip = [IO.Compression.ZipArchive]::new([IO.File]::OpenRead((Join-Path $valid $delivery.update.path)), [IO.Compression.ZipArchiveMode]::Read)
try {
    if ($delivery.update.path -cne $delivery.portable.path -or $manifest.package_sha256 -cne $delivery.portable.sha256 -or $manifest.package_bytes -ne $delivery.portable.bytes) { throw 'Signed update does not identify the complete portable ZIP.' }
    if ($null -eq $zip.GetEntry('Ameow.exe') -or $null -eq $zip.GetEntry("versions/$version/Ameow.exe")) { throw 'Portable ZIP lacks the stable launcher or versioned app.' }
    $prefix = "versions/$version/"
    foreach ($entry in $zip.Entries) {
        if (-not $entry.FullName.StartsWith($prefix, [StringComparison]::Ordinal)) { continue }
        $relative = $entry.FullName.Substring($prefix.Length)
        if ($relative -in @('Ameow.exe', 'bundle.json')) { continue }
        $mirror = $zip.GetEntry($relative)
        if ($null -eq $mirror -or $mirror.Length -ne $entry.Length) { throw "Published 0.5.2 updater requires the root mirror: $relative" }
    }
} finally { $zip.Dispose() }
$checks += @('installer-compiled-from-verified-portable','shared-core-and-notice-hashes','portable-is-signed-update','installer-notices-in-version-slot','published-052-root-mirror-contract-preserved')
$result = @{result='PASS';checks=$checks;count=$checks.Count;nativeInstallerExecution=$false;productionPrivateKeyCreated=$false;delivery='valid/delivery.json'}
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'result.json') -Encoding utf8
$result | ConvertTo-Json -Depth 5
# Expected release-tool rejections leave LASTEXITCODE=2.
exit 0
