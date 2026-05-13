#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif

[Setup]
AppName=AI Cursor
AppVersion={#MyAppVersion}
AppPublisher=AI Cursor
AppPublisherURL=https://tokenlift.vercel.app
DefaultDirName={autopf}\AI Cursor
DefaultGroupName=AI Cursor
OutputDir=dist
OutputBaseFilename=AIcursor-windows-setup
SetupIconFile=icons\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
UninstallDisplayName=AI Cursor

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Add a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
Source: "dist\AIcursor-windows\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\AI Cursor"; Filename: "{app}\AIcursor.exe"
Name: "{group}\Uninstall AI Cursor"; Filename: "{uninstallexe}"
Name: "{commondesktop}\AI Cursor"; Filename: "{app}\AIcursor.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\AIcursor.exe"; Description: "Launch AI Cursor now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill.exe"; Parameters: "/f /im AIcursor.exe"; Flags: runhidden
