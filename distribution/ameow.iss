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
; The maintenance helper owns every retained version; inherited delete records
; must not remove unknown files that later occupy an old package pathname.
UninstallLogMode=overwrite
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
english.MaintenanceFailed=The installation could not be completed safely. Keep this folder, close Ameow, and retry with the current trusted installer. Details:
chinesesimplified.MaintenanceFailed=无法安全完成此安装。请保留此文件夹，退出 Ameow 后使用当前可信安装包重试。详情：
chinesetraditional.MaintenanceFailed=無法安全完成此安裝。請保留此資料夾，結束 Ameow 後使用目前可信安裝套件重試。詳細資訊：
english.RollbackFailed=The previous installation could not be fully restored. Keep this folder and retry with the current trusted installer. Remaining items:
chinesesimplified.RollbackFailed=未能完整恢复原安装。请保留此文件夹，并使用当前可信安装包重试。未完成项目：
chinesetraditional.RollbackFailed=未能完整還原原安裝。請保留此資料夾，並使用目前可信安裝套件重試。未完成項目：
english.CleanupFailed=Some Ameow items could not be removed. Close any programs using them, then retry. Retained or remaining items:
chinesesimplified.CleanupFailed=部分 Ameow 项目未能删除。请关闭正在使用它们的程序后重试。保留或未清项目：
chinesetraditional.CleanupFailed=部分 Ameow 項目未能刪除。請關閉正在使用它們的程式後重試。保留或未清項目：
english.UpgradeKeepsData=The installer updates the program and keeps your settings, authorized sessions and downloaded files.
chinesesimplified.UpgradeKeepsData=安装程序将更新程序，保留设置、已授权会话和下载文件。
chinesetraditional.UpgradeKeepsData=安裝程式將更新程式，保留設定、已授權工作階段和下載檔案。
english.UninstallOptions=Uninstall options
chinesesimplified.UninstallOptions=卸载选项
chinesetraditional.UninstallOptions=解除安裝選項
english.DeleteUserData=Also delete user data
chinesesimplified.DeleteUserData=同时删除用户数据
chinesetraditional.DeleteUserData=同時刪除使用者資料
english.DeleteUserDataHelp=Clears settings, authorized browser sessions, download component caches, diagnostics and temporary task data. Finished downloads in default or custom folders, and your browser accounts and cookies, are kept. Reinstalling requires setup and authorization again. Shared data used by another Ameow copy is kept.
chinesesimplified.DeleteUserDataHelp=清除设置、已授权的浏览器会话、下载组件缓存、诊断记录和任务临时数据。保留默认及自选目录中的下载成品，以及浏览器原账号和 Cookie。重新安装后需重新配置和授权；其他 Ameow 副本仍在使用的共享数据会保留。
chinesetraditional.DeleteUserDataHelp=清除設定、已授權的瀏覽器工作階段、下載元件快取、診斷記錄和工作暫存資料。保留預設及自選資料夾中的下載成品，以及瀏覽器原帳號和 Cookie。重新安裝後需重新設定和授權；其他 Ameow 副本仍使用的共用資料會保留。
english.SharedDataKept=Another Ameow copy still uses the shared user data. That data has been kept; uninstalling this copy will continue.
chinesesimplified.SharedDataKept=其他 Ameow 副本仍在使用共享用户数据，因此已保留这些数据；此副本的卸载将继续。
chinesetraditional.SharedDataKept=其他 Ameow 副本仍在使用共用使用者資料，因此已保留這些資料；此副本的解除安裝將繼續。
english.ContinueUninstall=Continue
chinesesimplified.ContinueUninstall=继续卸载
chinesetraditional.ContinueUninstall=繼續解除安裝
chinesesimplified.RegistrationFailed=无法注册已签名版本。现有更新状态已保留。%n请退出 Ameow，并使用当前可信安装包重试。
chinesetraditional.RegistrationFailed=無法註冊已簽署版本。現有更新狀態已保留。%n請結束 Ameow，並使用目前可信的安裝套件重試。

[Tasks]
Name: desktopicon; Description: "{cm:CreateDesktopIcon}"; Flags: unchecked

[Icons]
#ifdef ValidationBuild
Name: "{group}\{#ApplicationName}"; Filename: "{app}\Ameow.exe"; IconFilename: "{app}\Ameow.exe"; Parameters: "--instance-root ""{app}\validation-instance"" --exit-after-ms 12000"; Flags: uninsneveruninstall
Name: "{autodesktop}\{#ApplicationName}"; Filename: "{app}\Ameow.exe"; IconFilename: "{app}\Ameow.exe"; Parameters: "--instance-root ""{app}\validation-instance"" --exit-after-ms 12000"; Tasks: desktopicon; Flags: uninsneveruninstall
#else
Name: "{group}\{#ApplicationName}"; Filename: "{app}\Ameow.exe"; IconFilename: "{app}\Ameow.exe"; Flags: uninsneveruninstall
Name: "{autodesktop}\{#ApplicationName}"; Filename: "{app}\Ameow.exe"; IconFilename: "{app}\Ameow.exe"; Tasks: desktopicon; Flags: uninsneveruninstall
#endif

#include PayloadInclude

[Run]
#ifdef ValidationBuild
Filename: "{app}\Ameow.exe"; Description: "{cm:LaunchProgram,{#ApplicationName}}"; Parameters: "--instance-root ""{app}\validation-instance"" --exit-after-ms 12000"; Flags: nowait postinstall skipifsilent unchecked
#else
Filename: "{app}\Ameow.exe"; Description: "{cm:LaunchProgram,{#ApplicationName}}"; Flags: nowait postinstall skipifsilent unchecked
#endif

[Code]
var
  MaintenanceExe, MaintenanceDetails: String;
  MigrationPrepared, PostInstallSucceeded, InstallCompleted, DeleteUserData: Boolean;
  UninstallBackupFiles: TArrayOfString;

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

function RunMaintenance(const Action: String; Purge: Boolean): Boolean;
var ExitCode: Integer; Arguments, ReportPath: String; ReportBytes: AnsiString;
begin
  ReportPath := ExpandConstant('{tmp}\ameow-maintenance-report.txt');
  Arguments := '--installer-maintenance ' + Action + ' "' + ExpandConstant('{app}') +
    '" "' + ReportPath + '"';
  if Purge then Arguments := Arguments + ' --delete-user-data';
  DeleteFile(ReportPath);
  MaintenanceDetails := '';
  Result := Exec(MaintenanceExe, Arguments, ExpandConstant('{tmp}'),
    SW_HIDE, ewWaitUntilTerminated, ExitCode) and (ExitCode = 0);
  if LoadStringFromFile(ReportPath, ReportBytes) then
    MaintenanceDetails := UTF8Decode(ReportBytes);
  if MaintenanceDetails <> '' then Log(MaintenanceDetails);
end;

procedure PrepareMaintenanceExe;
begin
  if MaintenanceExe = '' then begin
    ExtractTemporaryFile('ameow-setup-maintenance.exe');
    MaintenanceExe := ExpandConstant('{tmp}\ameow-setup-maintenance.exe');
  end;
end;

procedure BackupUninstallLogs;
var FindRec: TFindRec; Base, Name, Source, Backup: String; Ext, Count: Integer;
begin
  SetArrayLength(UninstallBackupFiles, 0);
  if FindFirst(ExpandConstant('{app}\unins*.dat'), FindRec) then begin
    try
      repeat
        if (FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY) = 0 then begin
          Base := ChangeFileExt(FindRec.Name, '');
          for Ext := 0 to 2 do begin
            case Ext of
              0: Name := Base + '.dat';
              1: Name := Base + '.exe';
              2: Name := Base + '.msg';
            end;
            Source := ExpandConstant('{app}\') + Name;
            if FileExists(Source) then begin
              Backup := ExpandConstant('{tmp}\ameow-old-') + Name;
              if not PlainDestination(Source) or not FileCopy(Source, Backup, False) then
                RaiseException(CustomMessage('MaintenanceFailed') + #13#10 + Source);
              if CompareText(GetSHA256OfFile(Source), GetSHA256OfFile(Backup)) <> 0 then
                RaiseException(CustomMessage('MaintenanceFailed') + #13#10 + Source);
              Count := GetArrayLength(UninstallBackupFiles);
              SetArrayLength(UninstallBackupFiles, Count + 1);
              UninstallBackupFiles[Count] := Name;
            end;
          end;
        end;
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;
end;

procedure RestoreUninstallLogs;
var Index: Integer; Source, Target: String;
begin
  for Index := 0 to GetArrayLength(UninstallBackupFiles) - 1 do begin
    Source := ExpandConstant('{tmp}\ameow-old-') + UninstallBackupFiles[Index];
    Target := ExpandConstant('{app}\') + UninstallBackupFiles[Index];
    if not PlainDestination(Target) or not FileCopy(Source, Target, False) or
       (CompareText(GetSHA256OfFile(Source), GetSHA256OfFile(Target)) <> 0) then
      MsgBox(CustomMessage('RollbackFailed') + #13#10 + Target, mbError, MB_OK);
  end;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo,
  MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := MemoDirInfo + NewLine + NewLine + MemoGroupInfo + NewLine +
    MemoTasksInfo + NewLine + NewLine + CustomMessage('UpgradeKeepsData');
end;

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
  PrepareMaintenanceExe;
  if not RunMaintenance('inspect', False) then begin
    Result := CustomMessage('MaintenanceFailed') + #13#10 + MaintenanceDetails;
    exit;
  end;
  { Version directories are immutable, including during an installer retry. }
  if not VersionFilesMatch then
    Result := CustomMessage('VersionConflict');
  if Result = '' then BackupUninstallLogs;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var ExitCode: Integer;
begin
  if CurStep = ssInstall then begin
    PrepareMaintenanceExe;
    MigrationPrepared := True;
    if not RunMaintenance('migrate-legacy', False) then
      RaiseException(CustomMessage('MaintenanceFailed') + #13#10 + MaintenanceDetails);
  end;
  if CurStep = ssPostInstall then begin
    if not Exec(ExpandConstant('{app}\Ameow.exe'),
        '--register-installed-version {#ApplicationVersion}', ExpandConstant('{app}'),
        SW_HIDE, ewWaitUntilTerminated, ExitCode) or (ExitCode <> 0) then
      RaiseException(CustomMessage('RegistrationFailed'));
    if not RunMaintenance('rebind', False) then
      RaiseException(CustomMessage('MaintenanceFailed') + #13#10 + MaintenanceDetails);
    PostInstallSucceeded := True;
  end;
  { Exceptions in ssPostInstall are reported by Inno but do not stop ssDone. }
  if (CurStep = ssDone) and PostInstallSucceeded then begin
    InstallCompleted := True;
    if not RunMaintenance('commit-migration', False) then
      MsgBox(CustomMessage('CleanupFailed') + #13#10 + MaintenanceDetails, mbError, MB_OK);
  end;
end;

function GetCustomSetupExitCode: Integer;
begin
  Result := 0;
  if MigrationPrepared and not InstallCompleted then Result := 1;
end;

procedure DeinitializeSetup;
begin
  if MigrationPrepared and not InstallCompleted then begin
    if not RunMaintenance('rollback-migration', False) then
      MsgBox(CustomMessage('RollbackFailed') + #13#10 + MaintenanceDetails, mbError, MB_OK);
    RestoreUninstallLogs;
  end;
end;

function InitializeUninstall: Boolean;
var OptionsForm: TSetupForm; Choice: TNewCheckBox; Help: TNewStaticText;
  ContinueButton, CancelButton: TNewButton;
begin
  Result := False;
  DeleteUserData := False;
#ifndef ValidationBuild
  if CheckForMutexes('Local\Ameow.SingleInstance') then begin
    MsgBox(CustomMessage('CloseAmeow'), mbError, MB_OK);
    exit;
  end;
#endif
  if not PlainDestination(ExpandConstant('{app}\Ameow.exe')) or
    (CompareText(GetSHA256OfFile(ExpandConstant('{app}\Ameow.exe')), '{#LauncherHash}') <> 0) then begin
    MsgBox(CustomMessage('MaintenanceFailed'), mbError, MB_OK);
    exit;
  end;
  MaintenanceExe := ExpandConstant('{tmp}\ameow-uninstall-maintenance.exe');
  if not FileCopy(ExpandConstant('{app}\Ameow.exe'), MaintenanceExe, False) then begin
    MsgBox(CustomMessage('MaintenanceFailed'), mbError, MB_OK);
    exit;
  end;
  if not RunMaintenance('inspect', False) then begin
    MsgBox(CustomMessage('MaintenanceFailed') + #13#10 + MaintenanceDetails, mbError, MB_OK);
    exit;
  end;
  if not UninstallSilent then begin
#if VER >= EncodeVer(6, 6, 0)
    OptionsForm := CreateCustomForm(ScaleX(440), ScaleY(210), True, True);
#else
    OptionsForm := CreateCustomForm;
    OptionsForm.ClientWidth := ScaleX(440);
    OptionsForm.ClientHeight := ScaleY(210);
#endif
    try
      OptionsForm.Caption := CustomMessage('UninstallOptions');
      Choice := TNewCheckBox.Create(OptionsForm);
      Choice.Parent := OptionsForm;
      Choice.SetBounds(ScaleX(16), ScaleY(16), ScaleX(408), ScaleY(24));
      Choice.Caption := CustomMessage('DeleteUserData');
      Choice.Checked := False;
      Help := TNewStaticText.Create(OptionsForm);
      Help.Parent := OptionsForm;
      Help.SetBounds(ScaleX(36), ScaleY(48), ScaleX(388), ScaleY(110));
      Help.AutoSize := False;
      Help.WordWrap := True;
      Help.Caption := CustomMessage('DeleteUserDataHelp');
      ContinueButton := TNewButton.Create(OptionsForm);
      ContinueButton.Parent := OptionsForm;
      ContinueButton.SetBounds(ScaleX(230), ScaleY(170), ScaleX(100), ScaleY(26));
      ContinueButton.Caption := CustomMessage('ContinueUninstall');
      ContinueButton.ModalResult := mrOk;
      ContinueButton.Default := True;
      CancelButton := TNewButton.Create(OptionsForm);
      CancelButton.Parent := OptionsForm;
      CancelButton.SetBounds(ScaleX(338), ScaleY(170), ScaleX(86), ScaleY(26));
      CancelButton.Caption := SetupMessage(msgButtonCancel);
      CancelButton.ModalResult := mrCancel;
      CancelButton.Cancel := True;
      if OptionsForm.ShowModal <> mrOk then exit;
      DeleteUserData := Choice.Checked;
    finally
      OptionsForm.Free;
    end;
  end;
  Result := True;
end;

procedure RemoveOwnedShortcut(const Path: String);
var Shell, Shortcut: Variant; Target: String;
begin
  if not FileExists(Path) then exit;
  if not PlainDestination(Path) then begin
    Log('Retained shortcut at a reparse path: ' + Path);
    exit;
  end;
  try
    Shell := CreateOleObject('WScript.Shell');
    Shortcut := Shell.CreateShortcut(Path);
    Target := Shortcut.TargetPath;
    if (CompareText(Target, ExpandConstant('{app}\Ameow.exe')) = 0) or
       (CompareText(Target, ExpandConstant('{app}\AmeowLauncher.exe')) = 0) then begin
      if not DeleteFile(Path) then
        RaiseException(CustomMessage('CleanupFailed') + #13#10 + Path);
    end else Log('Retained shortcut owned by another copy: ' + Path);
  except
    RaiseException(CustomMessage('CleanupFailed') + #13#10 + Path + #13#10 + GetExceptionMessage);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  { Signed slot ownership must be read before Inno removes its logged files. }
  if CurUninstallStep = usUninstall then begin
    if not RunMaintenance('cleanup', DeleteUserData) then
      RaiseException(CustomMessage('CleanupFailed') + #13#10 + MaintenanceDetails);
    if DeleteUserData and (Pos('E_INSTALLER_SHARED_', MaintenanceDetails) > 0) then
      MsgBox(CustomMessage('SharedDataKept'), mbInformation, MB_OK);
    RemoveOwnedShortcut(ExpandConstant('{group}\{#ApplicationName}.lnk'));
    RemoveOwnedShortcut(ExpandConstant('{autodesktop}\{#ApplicationName}.lnk'));
    RemoveDir(ExpandConstant('{group}'));
  end;
  if CurUninstallStep = usPostUninstall then
    if not RunMaintenance('restore-registration', False) then
      RaiseException(CustomMessage('CleanupFailed') + #13#10 + MaintenanceDetails);
end;
