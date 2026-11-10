; Payload and hashes come only from package_windows.ps1's verified portable archive.
#ifndef PayloadInclude
  #error Build with scripts/package_windows.ps1
#endif

[Setup]
AppId={#ApplicationId}
AppName={#ApplicationName}
AppVersion={#ApplicationVersion}
DefaultDirName={localappdata}\Programs\{#ApplicationName}
DefaultGroupName={#ApplicationName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern light
Compression=lzma2
SolidCompression=yes
OutputDir={#DeliveryOutput}
OutputBaseFilename={#InstallerName}
AppMutex=Local\Ameow.SingleInstance
CloseApplications=no
RestartApplications=no
UninstallDisplayIcon={app}\AmeowLauncher.exe
SetupLogging=yes

[Tasks]
Name: desktopicon; Description: "Create a &desktop shortcut"; Flags: unchecked

[Icons]
Name: "{group}\{#ApplicationName}"; Filename: "{app}\AmeowLauncher.exe"
Name: "{autodesktop}\{#ApplicationName}"; Filename: "{app}\AmeowLauncher.exe"; Tasks: desktopicon

#include PayloadInclude

[Run]
Filename: "{app}\AmeowLauncher.exe"; Description: "Launch {#ApplicationName}"; Flags: nowait postinstall skipifsilent unchecked

[Code]
function GetFileAttributes(Path: String): LongWord;
  external 'GetFileAttributesW@kernel32.dll stdcall';

function PlainDestination(Path: String): Boolean;
var Attributes: LongWord; Parent: String;
begin
  Result := False;
  while Path <> '' do begin
    Attributes := GetFileAttributes(Path);
    if (Attributes <> $FFFFFFFF) and ((Attributes and $400) <> 0) then exit;
    Parent := ExtractFileDir(Path);
    if Parent = Path then break;
    Path := Parent;
  end;
  Result := True;
end;

function ExistingFileMatches(const RelativePath, ExpectedHash: String): Boolean;
var Path: String;
begin
  Path := ExpandConstant('{app}\') + RelativePath;
  Result := not FileExists(Path) or (CompareText(GetSHA256OfFile(Path), ExpectedHash) = 0);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if CheckForMutexes('Local\Ameow.SingleInstance') then begin
    Result := 'Close Ameow normally before installing. No processes will be terminated.';
    exit;
  end;
  if not PlainDestination(ExpandConstant('{app}\versions\{#ApplicationVersion}')) or
     not PlainDestination(ExpandConstant('{app}\licenses')) or
     not PlainDestination(ExpandConstant('{app}\state.json')) or
     not PlainDestination(ExpandConstant('{app}\AmeowLauncher.exe')) then begin
    Result := 'Choose a plain installation directory without symbolic links or junctions.';
    exit;
  end;
  { Version directories are immutable, including during an installer retry. }
  if not ExistingFileMatches('versions\{#ApplicationVersion}\Ameow.exe', '{#AppHash}') or
     not ExistingFileMatches('versions\{#ApplicationVersion}\manifest.json', '{#ManifestHash}') then
    Result := 'This version directory contains different files. Choose a new folder; existing versions and update state have been preserved.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var ExitCode: Integer;
begin
  if CurStep = ssPostInstall then begin
    if not Exec(ExpandConstant('{app}\AmeowLauncher.exe'),
        '--register-installed-version {#ApplicationVersion}', ExpandConstant('{app}'),
        SW_HIDE, ewWaitUntilTerminated, ExitCode) or (ExitCode <> 0) then
      RaiseException('The signed version could not be registered. Existing update state was preserved. Close Ameow and retry with a trusted current package.');
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
#ifndef ValidationBuild
var Command: String;
#endif
begin
#ifndef ValidationBuild
  { Remove only this installation's exact startup command, never another copy's. }
  if (CurUninstallStep = usUninstall) and
     RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'Ameow', Command) and
     (CompareText(Command, '"' + ExpandConstant('{app}\AmeowLauncher.exe') + '" --login-startup') = 0) then
    RegDeleteValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'Ameow');
#endif
end;
