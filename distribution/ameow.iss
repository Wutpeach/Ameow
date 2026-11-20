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
WizardSizePercent=100
SetupIconFile=..\assets\brand\ameow.ico
WizardSmallImageFile=
WizardImageFile=ameow-wizard-large.png
LanguageDetectionMethod=uilanguage
UsePreviousLanguage=no
ShowLanguageDialog=no
Compression=lzma2
SolidCompression=yes
OutputDir={#DeliveryOutput}
OutputBaseFilename={#InstallerName}
AppMutex=Local\Ameow.SingleInstance
CloseApplications=no
RestartApplications=no
UninstallDisplayIcon={app}\AmeowLauncher.exe
SetupLogging=yes

[Languages]
Name: english; MessagesFile: "compiler:Default.isl"
Name: chinesesimplified; MessagesFile: "languages\ChineseSimplified.isl"
Name: chinesetraditional; MessagesFile: "languages\ChineseTraditional.isl"

[CustomMessages]
english.CloseAmeow=Close Ameow normally before installing. No processes will be terminated.
chinesesimplified.CloseAmeow=请正常退出 Ameow 后再安装。安装程序不会终止任何进程。
chinesetraditional.CloseAmeow=請正常結束 Ameow 後再安裝。安裝程式不會終止任何處理程序。
english.PlainDirectory=Choose a plain installation directory without symbolic links or junctions.
chinesesimplified.PlainDirectory=请选择不含符号链接或联接点的普通安装目录。
chinesetraditional.PlainDirectory=請選擇不含符號連結或接合點的一般安裝目錄。
english.VersionConflict=This version directory contains different files. Choose a new folder; existing versions and update state have been preserved.
chinesesimplified.VersionConflict=此版本目录中存在不同的文件。%n请选择新文件夹；已有版本和更新状态均已保留。
chinesetraditional.VersionConflict=此版本目錄中存在不同的檔案。%n請選擇新資料夾；既有版本和更新狀態均已保留。
english.RegistrationFailed=The signed version could not be registered. Existing update state was preserved. Close Ameow and retry with a trusted current package.
chinesesimplified.RegistrationFailed=无法注册已签名版本。现有更新状态已保留。%n请退出 Ameow，并使用当前可信安装包重试。
chinesetraditional.RegistrationFailed=無法註冊已簽署版本。現有更新狀態已保留。%n請結束 Ameow，並使用目前可信的安裝套件重試。

[Tasks]
Name: desktopicon; Description: "{cm:CreateDesktopIcon}"; Flags: unchecked

[Icons]
Name: "{group}\{#ApplicationName}"; Filename: "{app}\AmeowLauncher.exe"
Name: "{autodesktop}\{#ApplicationName}"; Filename: "{app}\AmeowLauncher.exe"; Tasks: desktopicon

#include PayloadInclude

[Run]
Filename: "{app}\AmeowLauncher.exe"; Description: "{cm:LaunchProgram,{#ApplicationName}}"; Flags: nowait postinstall skipifsilent unchecked

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
    Result := CustomMessage('CloseAmeow');
    exit;
  end;
  if not PlainDestination(ExpandConstant('{app}\versions\{#ApplicationVersion}')) or
     not PlainDestination(ExpandConstant('{app}\licenses')) or
     not PlainDestination(ExpandConstant('{app}\state.json')) or
     not PlainDestination(ExpandConstant('{app}\AmeowLauncher.exe')) or
     not PlainDestination(ExpandConstant('{app}\ameow-browser-host.exe')) or
     not PlainDestination(ExpandConstant('{app}\browser-extension')) or
     not PlainDestination(ExpandConstant('{app}\ameow-cli.exe')) then begin
    Result := CustomMessage('PlainDirectory');
    exit;
  end;
  { Version directories are immutable, including during an installer retry. }
  if not ExistingFileMatches('versions\{#ApplicationVersion}\Ameow.exe', '{#AppHash}') or
     not ExistingFileMatches('versions\{#ApplicationVersion}\manifest.json', '{#ManifestHash}') then
    Result := CustomMessage('VersionConflict');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var ExitCode: Integer;
begin
  if CurStep = ssPostInstall then begin
    if not Exec(ExpandConstant('{app}\AmeowLauncher.exe'),
        '--register-installed-version {#ApplicationVersion}', ExpandConstant('{app}'),
        SW_HIDE, ewWaitUntilTerminated, ExitCode) or (ExitCode <> 0) then
      RaiseException(CustomMessage('RegistrationFailed'));
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
