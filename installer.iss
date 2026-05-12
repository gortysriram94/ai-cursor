; installer.iss — Inno Setup script for AI Cursor (Windows)
;
; Requirements:
;   1. Build the app first:  python build.py --no-zip
;   2. Install Inno Setup:   https://jrsoftware.org/isdl.php  (free)
;      OR via Chocolatey:    choco install innosetup
;   3. Compile:              iscc installer.iss
;
; Output: dist\AIcursor-windows-setup.exe
;   — Single-file installer, ~45 MB
;   — No admin required (installs per-user)
;   — Creates Start Menu + optional Desktop shortcut
;   — Optional auto-start on login
;   — Clean uninstaller included

#define AppName      "AI Cursor"
#define AppVersion   "0.1.0"
#define AppPublisher "AI Cursor"
#define AppURL       "https://www.techtonixmedia.com"
#define AppExe       "AIcursor.exe"

[Setup]
AppId={{F3A2B1C0-4D5E-6F7A-8B9C-0D1E2F3A4B5C}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
; No UAC prompt — installs into user profile if not admin
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=dist
OutputBaseFilename=AIcursor-windows-setup
SetupIconFile=icons\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
DisableWelcomePage=no
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Add a shortcut to my Desktop";   GroupDescription: "Shortcuts:"; Flags: unchecked
Name: "startuprun";  Description: "Start AI Cursor when I log in";  GroupDescription: "Startup:";   Flags: checked

[Files]
Source: "dist\AIcursor-windows\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}";           Filename: "{app}\{#AppExe}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#AppName}";   Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Registry]
; Auto-start at login (HKCU = no admin needed, removed on uninstall)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "{#AppName}"; \
  ValueData: """{app}\{#AppExe}"""; \
  Flags: uninsdeletevalue; Tasks: startuprun

[Run]
Filename: "{app}\{#AppExe}"; \
  Description: "Launch {#AppName} now"; \
  Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill.exe"; Parameters: "/f /im {#AppExe}"; Flags: runhidden
