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
#ifndef ValidationBuild
AppMutex=Local\Ameow.SingleInstance
#endif
CloseApplications=no
RestartApplications=no
UninstallDisplayIcon={app}\Ameow.exe
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
english.CleanInstallRequired=This folder contains an earlier installation. Uninstall it and clear its program folder, or choose an empty folder.
chinesesimplified.CleanInstallRequired=此文件夹保留了旧版程序。%n请先卸载旧版并清理其程序目录，或选择空文件夹。
chinesetraditional.CleanInstallRequired=此資料夾保留了舊版程式。%n請先解除安裝舊版並清理其程式目錄，或選擇空資料夾。
chinesesimplified.RegistrationFailed=无法注册已签名版本。现有更新状态已保留。%n请退出 Ameow，并使用当前可信安装包重试。
chinesetraditional.RegistrationFailed=無法註冊已簽署版本。現有更新狀態已保留。%n請結束 Ameow，並使用目前可信的安裝套件重試。

[Tasks]
Name: desktopicon; Description: "{cm:CreateDesktopIcon}"; Flags: unchecked

[Icons]
#ifdef ValidationBuild
Name: "{group}\{#ApplicationName}"; Filename: "{app}\Ameow.exe"; IconFilename: "{app}\Ameow.exe"; Parameters: "--instance-root ""{app}\validation-instance"" --exit-after-ms 12000"
Name: "{autodesktop}\{#ApplicationName}"; Filename: "{app}\Ameow.exe"; IconFilename: "{app}\Ameow.exe"; Parameters: "--instance-root ""{app}\validation-instance"" --exit-after-ms 12000"; Tasks: desktopicon
#else
Name: "{group}\{#ApplicationName}"; Filename: "{app}\Ameow.exe"; IconFilename: "{app}\Ameow.exe"
Name: "{autodesktop}\{#ApplicationName}"; Filename: "{app}\Ameow.exe"; IconFilename: "{app}\Ameow.exe"; Tasks: desktopicon
#endif

#include PayloadInclude

[Run]
#ifdef ValidationBuild
Filename: "{app}\Ameow.exe"; Description: "{cm:LaunchProgram,{#ApplicationName}}"; Parameters: "--instance-root ""{app}\validation-instance"" --exit-after-ms 12000"; Flags: nowait postinstall skipifsilent unchecked
#else
Filename: "{app}\Ameow.exe"; Description: "{cm:LaunchProgram,{#ApplicationName}}"; Flags: nowait postinstall skipifsilent unchecked
#endif

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

#include VersionCheckInclude

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
#ifndef ValidationBuild
  if CheckForMutexes('Local\Ameow.SingleInstance') then begin
    Result := CustomMessage('CloseAmeow');
    exit;
  end;
#endif
  if not PlainDestination(ExpandConstant('{app}\versions\{#ApplicationVersion}')) or
     not PlainDestination(ExpandConstant('{app}\licenses')) or
     not PlainDestination(ExpandConstant('{app}\state.json')) or
     not PlainDestination(ExpandConstant('{app}\entry.json')) or
     not PlainDestination(ExpandConstant('{app}\Ameow.exe')) or
     not PlainDestination(ExpandConstant('{app}\ameow-browser-host.exe')) or
     not PlainDestination(ExpandConstant('{app}\browser-extension')) or
     not PlainDestination(ExpandConstant('{app}\ameow-cli.exe')) then begin
    Result := CustomMessage('PlainDirectory');
    exit;
  end;
  { Full reinstallation starts the new contract; old state is never imported. }
  if FileExists(ExpandConstant('{app}\state.json')) and
     not FileExists(ExpandConstant('{app}\entry.json')) then begin
    Result := CustomMessage('CleanInstallRequired');
    exit;
  end;
  { Version directories are immutable, including during an installer retry. }
  if not VersionFilesMatch then
    Result := CustomMessage('VersionConflict');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var ExitCode: Integer;
begin
  if CurStep = ssPostInstall then begin
    if not Exec(ExpandConstant('{app}\Ameow.exe'),
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
     (CompareText(Command, '"' + ExpandConstant('{app}\Ameow.exe') + '" --login-startup') = 0) then
    RegDeleteValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'Ameow');
#endif
end;
