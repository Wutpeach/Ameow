param(
    [Parameter(Mandatory)][ValidateSet('Prepare','Launch','Inspect','Source')][string]$Action,
    [Parameter(Mandatory)][string]$BinaryDirectory,
    [Parameter(Mandatory)][string]$InstallDirectory,
    [Parameter(Mandatory)][string]$EvidenceDirectory,
    [string]$Version='0.2.1',
    [string]$RuntimeDirectory,
    [ValidateRange(0,65535)][int]$MediaFixturePort=0
)
$ErrorActionPreference='Stop'
foreach($path in @($BinaryDirectory,$InstallDirectory,$EvidenceDirectory)){if(-not [IO.Path]::IsPathFullyQualified($path)){throw 'Absolute task-owned paths are required'}}
if($Action -eq 'Prepare'){
    foreach($path in @($InstallDirectory,$EvidenceDirectory)){if(Test-Path -LiteralPath $path){throw "Refusing to overwrite fixture: $path"};New-Item -ItemType Directory -Path $path|Out-Null}
    New-Item -ItemType Directory -Path "$EvidenceDirectory/output","$EvidenceDirectory/incoming"|Out-Null
    Set-Content -LiteralPath "$EvidenceDirectory/runtime-unavailable" -Value 'Isolated UI validation: component storage is unavailable' -NoNewline
    Copy-Item -LiteralPath "$BinaryDirectory/AmeowLauncher.exe" -Destination "$InstallDirectory/AmeowLauncher.exe"
    foreach($candidate in @('0.2.0','0.2.1','0.2.2','0.2.3')){
        $candidateRoot=if($candidate -eq '0.2.0'){$InstallDirectory}else{"$EvidenceDirectory/signing-install-$candidate"}
        & "$BinaryDirectory/app_update_fixture.exe" $candidateRoot "$BinaryDirectory/Ameow-$candidate.exe" $candidate ([int]$candidate.Split('.')[-1]+1) "$EvidenceDirectory/source-$candidate" *> "$EvidenceDirectory/prepare-$candidate.txt"
        if($LASTEXITCODE -ne 0){throw "Fixture preparation failed: $candidate"}
    }
    Copy-Item -LiteralPath "$EvidenceDirectory/source-0.2.1/manifest.json","$EvidenceDirectory/source-0.2.1/package.zip" -Destination "$EvidenceDirectory/incoming"
    return
}
if($Action -eq 'Source'){
    if($Version -notin @('0.2.1','0.2.2','0.2.3')){throw 'Unknown fixture identity'}
    Copy-Item -LiteralPath "$EvidenceDirectory/source-$Version/manifest.json","$EvidenceDirectory/source-$Version/package.zip" -Destination "$EvidenceDirectory/incoming" -Force
    return
}
# Reuse the accepted LUA-token helper without executing Stage A's integration script.
$helperSource=Get-Content -LiteralPath "$PSScriptRoot/test_app_update_native.ps1" -Raw
$helper=[regex]::Match($helperSource,"(?s)Add-Type -TypeDefinition @'\r?\n(.*?)\r?\n'@")
if(-not $helper.Success){throw 'Accepted token helper not found'}
Add-Type -TypeDefinition $helper.Groups[1].Value
if($Action -eq 'Launch'){
    $runtime=if($RuntimeDirectory){if(-not [IO.Path]::IsPathFullyQualified($RuntimeDirectory)){throw 'Absolute runtime directory is required'};$RuntimeDirectory}else{"$EvidenceDirectory/runtime-unavailable"}
    $arguments=@('--runtime-root',$runtime,'--settings-path',"$EvidenceDirectory/ui-settings.json",'--output',"$EvidenceDirectory/output",'--app-update-fixture-dir',"$EvidenceDirectory/incoming",'--app-update-suppress-ready','0.2.2','--queue-evidence',"$EvidenceDirectory/queue.jsonl",'--app-update-ui-control',"$EvidenceDirectory/ui-control.json")
    if($MediaFixturePort -ne 0){$arguments+=@('--app-update-fixture-media-port',"$MediaFixturePort")}
    $quoted=($arguments|ForEach-Object{if($_.Contains('"')){throw 'Quotes are unsupported in fixture paths'};'"'+$_+'"'}) -join ' '
    $nativePid=[AmeowUpdateToken]::Launch("$InstallDirectory/AmeowLauncher.exe",$quoted,$InstallDirectory)
    @{launcher=$nativePid;time=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress|Add-Content -LiteralPath "$EvidenceDirectory/launches.jsonl"
    $nativePid;return
}
$events=@(Get-Content -LiteralPath "$InstallDirectory/launcher.jsonl"|ForEach-Object{$_|ConvertFrom-Json})
$event=$events|Where-Object{$_.event -eq 'ready'}|Select-Object -Last 1
$process=Get-CimInstance Win32_Process -Filter "ProcessId = $($event.pid)"
if($null -ne $process){
    $token=[AmeowUpdateToken]::Read($event.pid)
    $receipt=[pscustomobject]@{pid=$event.pid;parent=$process.ParentProcessId;exe=$process.ExecutablePath;version=$event.version;elevated=$token[0];integrity=$token[1];restricted=$token[2];adminSidAttributes=$token[3];time=[DateTime]::UtcNow.ToString('o')}
    if($token[0] -ne 0 -or $token[1] -ne 8192 -or ($token[3] -ge 0 -and ($token[3] -band 4) -ne 0)){throw 'Expected Medium LUA authority'}
    $receipt|ConvertTo-Json -Compress|Add-Content -LiteralPath "$EvidenceDirectory/process-receipts.jsonl"
    $receipt|ConvertTo-Json
}
Get-Content -LiteralPath "$InstallDirectory/state.json"
