; installer.iss — Inno Setup script for AI Cursor (Windows)
; Version is passed from CI: ISCC installer.iss /DMyAppVersion=0.3.0
; Output: dist\AIcursor-windows-setup.exe

#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif

#define AppName      "AI Cursor"
#define AppPublisher "AI Cursor"
#define AppURL       "https://tokenlift.vercel.app"
#define AppExe       "AIcursor.exe"

[Setup]
AppId={{F3A2B1C0-4D5E-6F7A-8B9C-0D1E2F3A4B5C}
AppName={#AppName}
AppVersion={#MyAppVersion}
AppVerName={#AppName} {#MyAppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=dist
OutputBaseFilename=AIcursor-windows-setup
SetupIconFile=icons\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Add a shortcut to my Desktop";  GroupDescription: "Shortcuts:"; Flags: unchecked
Name: "startuprun";  Description: "Start AI Cursor when I log in"; GroupDescription: "Startup:";   Flags: checked

[Files]
Source: "dist\AIcursor-windows\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}";           Filename: "{app}\{#AppExe}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#AppName}";   Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "{#AppName}"; \
  ValueData: """{app}\{#AppExe}"""; \
  Flags: uninsdeletevalue; Tasks: startuprun

[Run]
Filename: "{app}\{#AppExe}"; Description: "Launch {#AppName} now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill.exe"; Parameters: "/f /im {#AppExe}"; Flags: runhidden
