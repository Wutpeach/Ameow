param(
    [Parameter(Mandatory)][string]$BinaryDirectory,
    [Parameter(Mandatory)][string]$FixtureExecutable,
    [Parameter(Mandatory)][string]$InstallDirectory,
    [Parameter(Mandatory)][string]$EvidenceDirectory
)
$ErrorActionPreference = 'Stop'
# Runs only locally with explicitly built debug fixtures. Never publishes packages.
foreach ($path in @($InstallDirectory, $EvidenceDirectory)) {
    if (-not [IO.Path]::IsPathFullyQualified($path) -or (Test-Path -LiteralPath $path)) { throw "Choose a new absolute task-owned path: $path" }
}
New-Item -ItemType Directory -Path $EvidenceDirectory | Out-Null
New-Item -ItemType Directory -Path $InstallDirectory | Out-Null
New-Item -ItemType Directory -Path "$EvidenceDirectory/output" | Out-Null
Set-Content -LiteralPath "$EvidenceDirectory/runtime-unavailable" -Value 'Local fixture: runtime storage unavailable' -NoNewline
Copy-Item -LiteralPath "$BinaryDirectory/AmeowLauncher.exe" -Destination "$InstallDirectory/AmeowLauncher.exe"

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.ComponentModel;
using System.Text;
public static class AmeowUpdateToken {
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr p,uint access,out IntPtr token);
 [DllImport("advapi32.dll",EntryPoint="GetTokenInformation",SetLastError=true)] static extern bool TokenInt(IntPtr t,int kind,out int value,int size,out int needed);
 [DllImport("advapi32.dll",EntryPoint="GetTokenInformation",SetLastError=true)] static extern bool TokenBuffer(IntPtr t,int kind,IntPtr value,int size,out int needed);
 [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
 [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid,uint index);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool CreateRestrictedToken(IntPtr token,uint flags,uint disable,IntPtr sids,uint privileges,IntPtr p,uint restrict,IntPtr r,out IntPtr result);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSidToSidW(string text,out IntPtr sid);
 [DllImport("advapi32.dll")] static extern uint GetLengthSid(IntPtr sid);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool SetTokenInformation(IntPtr token,int kind,IntPtr value,uint size);
 [DllImport("advapi32.dll")] static extern bool IsTokenRestricted(IntPtr token);
 [DllImport("advapi32.dll")] static extern bool IsWellKnownSid(IntPtr sid,int kind);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr value);
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup {
  public int cb; public string reserved,desktop,title; public int x,y,width,height,charsX,charsY,fill,flags;
  public short show,reservedSize; public IntPtr reservedPtr,input,output,error;
 }
 [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {public IntPtr process,thread;public uint pid,tid;}
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessAsUserW(IntPtr token,string app,StringBuilder args,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref Startup startup,out ProcessInfo info);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessWithTokenW(IntPtr token,uint logon,string app,StringBuilder args,uint flags,IntPtr env,string cwd,ref Startup startup,out ProcessInfo info);
 public static uint Launch(string app,string arguments,string cwd) {
  IntPtr current=IntPtr.Zero,restricted=IntPtr.Zero,sid=IntPtr.Zero,label=IntPtr.Zero;
  try {
   if(!OpenProcessToken(System.Diagnostics.Process.GetCurrentProcess().Handle,0xF01FF,out current) || !CreateRestrictedToken(current,5,0,IntPtr.Zero,0,IntPtr.Zero,0,IntPtr.Zero,out restricted)) throw new Win32Exception(Marshal.GetLastWin32Error());
   if(!ConvertStringSidToSidW("S-1-16-8192",out sid)) throw new Win32Exception(Marshal.GetLastWin32Error());
   int size=IntPtr.Size==8?16:8;label=Marshal.AllocHGlobal(size);Marshal.WriteIntPtr(label,sid);Marshal.WriteInt32(label,IntPtr.Size,0x20);
   if(!SetTokenInformation(restricted,25,label,(uint)size+GetLengthSid(sid))) throw new Win32Exception(Marshal.GetLastWin32Error());
   Startup startup=new Startup();startup.cb=Marshal.SizeOf(startup);ProcessInfo info;
   string command="\""+app+"\" "+arguments;
   if(!CreateProcessAsUserW(restricted,app,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,false,0x08000000,IntPtr.Zero,cwd,ref startup,out info)
      && !CreateProcessWithTokenW(restricted,0,app,new StringBuilder(command),0x08000000,IntPtr.Zero,cwd,ref startup,out info)) throw new Win32Exception(Marshal.GetLastWin32Error());
   CloseHandle(info.thread);CloseHandle(info.process);return info.pid;
  } finally {if(label!=IntPtr.Zero)Marshal.FreeHGlobal(label);if(sid!=IntPtr.Zero)LocalFree(sid);if(restricted!=IntPtr.Zero)CloseHandle(restricted);if(current!=IntPtr.Zero)CloseHandle(current);}
 }
 public static int[] Read(uint pid) {
  IntPtr p=OpenProcess(0x1000,false,pid),t=IntPtr.Zero,b=IntPtr.Zero;
  try {
   if(p==IntPtr.Zero || !OpenProcessToken(p,8,out t)) throw new Win32Exception(Marshal.GetLastWin32Error());
   int elevated,n;
   if(!TokenInt(t,20,out elevated,4,out n)) throw new Win32Exception(Marshal.GetLastWin32Error());
   TokenBuffer(t,25,IntPtr.Zero,0,out n); b=Marshal.AllocHGlobal(n);
   if(!TokenBuffer(t,25,b,n,out n)) throw new Win32Exception(Marshal.GetLastWin32Error());
   IntPtr sid=Marshal.ReadIntPtr(b); byte count=Marshal.ReadByte(GetSidSubAuthorityCount(sid));
   int integrity=Marshal.ReadInt32(GetSidSubAuthority(sid,(uint)count-1));
   Marshal.FreeHGlobal(b);b=IntPtr.Zero;TokenBuffer(t,2,IntPtr.Zero,0,out n);b=Marshal.AllocHGlobal(n);
   if(!TokenBuffer(t,2,b,n,out n))throw new Win32Exception(Marshal.GetLastWin32Error());
   int admin=-1,groups=Marshal.ReadInt32(b),offset=IntPtr.Size==8?8:4,stride=IntPtr.Size==8?16:8;
   for(int i=0;i<groups;i++){IntPtr row=IntPtr.Add(b,offset+i*stride);if(IsWellKnownSid(Marshal.ReadIntPtr(row),26))admin=Marshal.ReadInt32(row,IntPtr.Size);}
   return new int[]{elevated,integrity,IsTokenRestricted(t)?1:0,admin};
  } finally {if(b!=IntPtr.Zero)Marshal.FreeHGlobal(b);if(t!=IntPtr.Zero)CloseHandle(t);if(p!=IntPtr.Zero)CloseHandle(p);}
 }
}
'@
function Wait-Until([scriptblock]$Condition, [string]$Reason, [int]$Seconds = 50) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while (-not (& $Condition)) {
        if ([DateTime]::UtcNow -gt $deadline) { throw "Timed out: $Reason" }
        Start-Sleep -Milliseconds 150
    }
}
function Read-State { Get-Content -LiteralPath "$InstallDirectory/state.json" -Raw | ConvertFrom-Json }
function Read-Events { @(Get-Content -LiteralPath "$InstallDirectory/launcher.jsonl" | ForEach-Object { $_ | ConvertFrom-Json }) }
function Prepare([string]$Version, [int]$Sequence) {
    & $FixtureExecutable $InstallDirectory "$BinaryDirectory/Ameow-$Version.exe" $Version "$Sequence" "$EvidenceDirectory/fixture-$Version" *> "$EvidenceDirectory/prepare-$Version.txt"
    if ($LASTEXITCODE -ne 0) { throw "Fixture preparation failed: $Version" }
}
function Launch {
    $arguments = @('--exit-after-ms','20000','--runtime-root',"$EvidenceDirectory/runtime-unavailable",
        '--settings-path',"$EvidenceDirectory/ui-settings.json",'--output',"$EvidenceDirectory/output",
        '--app-update-control',"$EvidenceDirectory/control.json",'--app-update-suppress-ready','0.2.2')
    $quoted = ($arguments | ForEach-Object { if ($_.Contains('"')) { throw 'Quotes are not supported in fixture paths' }; '"' + $_ + '"' }) -join ' '
    # Disable admin privileges/SIDs and lower integrity explicitly; Explorer and
    # runas /trustlevel can retain a high token on a UAC-disabled development host.
    $launched = [AmeowUpdateToken]::Launch("$InstallDirectory/AmeowLauncher.exe",$quoted,$InstallDirectory)
    "launcher=$launched" | Add-Content -LiteralPath "$EvidenceDirectory/launches.txt"
}
function Save-ProcessEvidence([string]$Name, [string]$Version) {
    $event = Read-Events | Where-Object { $_.event -eq 'ready' -and $_.version -eq $Version } | Select-Object -Last 1
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($event.pid)"
    $token = [AmeowUpdateToken]::Read($event.pid)
    [pscustomobject]@{pid=$event.pid;parent=$process.ParentProcessId;exe=$process.ExecutablePath;elevated=$token[0];integrity=$token[1];restricted=$token[2];adminSidAttributes=$token[3]} |
        ConvertTo-Json | Set-Content -LiteralPath "$EvidenceDirectory/$Name-process.json"
    if ($token[0] -ne 0 -or $token[1] -ne 8192 -or ($token[3] -ge 0 -and ($token[3] -band 4) -ne 0)) { throw 'Native fixture did not run with medium integrity and disabled admin authority' }
}
Prepare '0.2.0' 1
Launch
Wait-Until { (Read-State).current.version -eq '0.2.0' } 'initial native Ready'
Save-ProcessEvidence 'baseline' '0.2.0'
Prepare '0.2.1' 2
@{version='0.2.0';action='restart'} | ConvertTo-Json | Set-Content -LiteralPath "$EvidenceDirectory/control.json"
Wait-Until { (Read-State).current.version -eq '0.2.1' } 'safe native restart and switch'
Save-ProcessEvidence 'switched' '0.2.1'
if ((Read-State).previous.version -ne '0.2.0') { throw 'Previous version was not retained' }
Prepare '0.2.2' 3
# Timed exit uses the real application's existing safe-stop action. Pending is next-launch only.
Wait-Until { @(Read-Events | Where-Object { $_.event -eq 'exited' -and $_.version -eq '0.2.1' }).Count -eq 1 } 'normal safe exit'
if (@(Read-Events | Where-Object { $_.version -eq '0.2.2' }).Count -ne 0) { throw 'Normal exit unexpectedly restarted the application' }
Copy-Item -LiteralPath "$InstallDirectory/state.json" -Destination "$EvidenceDirectory/after-normal-exit.json"
Launch
Wait-Until { (Read-State).failed.Count -eq 1 -and (Read-State).trial -eq $null } 'Ready timeout rollback'
Wait-Until { @(Read-Events | Where-Object { $_.event -eq 'ready' -and $_.version -eq '0.2.1' }).Count -eq 2 } 'rollback native Ready'
Save-ProcessEvidence 'rollback' '0.2.1'
Copy-Item -LiteralPath "$InstallDirectory/state.json" -Destination "$EvidenceDirectory/after-rollback.json"
Wait-Until { @(Read-Events | Where-Object { $_.event -eq 'exited' -and $_.version -eq '0.2.1' }).Count -eq 2 } 'rollback app safe exit'
Launch
Wait-Until { @(Read-Events | Where-Object { $_.event -eq 'ready' -and $_.version -eq '0.2.1' }).Count -eq 3 } 'repeated launch'
if (@(Read-Events | Where-Object { $_.event -eq 'spawned' -and $_.version -eq '0.2.2' }).Count -ne 1) { throw 'Failed candidate was retried' }
Save-ProcessEvidence 'repeated-launch' '0.2.1'
Wait-Until { @(Read-Events | Where-Object { $_.event -eq 'exited' -and $_.version -eq '0.2.1' }).Count -eq 3 } 'final safe exit'
Copy-Item -LiteralPath "$InstallDirectory/launcher.jsonl" -Destination "$EvidenceDirectory/launcher.jsonl"
Copy-Item -LiteralPath "$InstallDirectory/state.json" -Destination "$EvidenceDirectory/final-state.json"
@{result='PASS';nativeGpui=$true;mediumIntegrity=$true;switch=$true;nextLaunchOnly=$true;readyTimeoutRollback=$true;failedTrialNotRetried=$true} |
    ConvertTo-Json | Set-Content -LiteralPath "$EvidenceDirectory/result.json"
Get-Content -LiteralPath "$EvidenceDirectory/result.json"
