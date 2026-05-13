#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif

[Setup]
AppName=AI Cursor
AppVersion={#MyAppVersion}
AppPublisher=AI Cursor
AppPublisherURL=https://tokenlift.vercel.app
DefaultDirName={localappdata}\AI Cursor
DefaultGroupName=AI Cursor
OutputDir=dist
OutputBaseFilename=AIcursor-windows-setup
SetupIconFile=icons\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
DisableDirPage=yes
UninstallDisplayName=AI Cursor

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Add a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
Source: "dist\AIcursor-windows\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\AI Cursor"; Filename: "{app}\AIcursor.exe"
Name: "{userdesktop}\AI Cursor"; Filename: "{app}\AIcursor.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\AIcursor.exe"; Description: "Launch AI Cursor now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill.exe"; Parameters: "/f /im AIcursor.exe"; Flags: runhidden
Filename: "taskkill.exe"; Parameters: "/f /im ollama.exe"; Flags: runhidden

[UninstallDelete]
Type: filesandordirs; Name: "{userappdata}\Pushpa"
