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
; Bundled starter model (qwen2.5:0.5b) — staged by CI before build
; These files are installed to the Ollama models dir so the app starts immediately.
Source: "ollama_starter\blobs\*";                                                  DestDir: "{userappdata}\Pushpa\models\blobs";                                       Flags: onlyifdoesntexist; Check: BundledModelExists
Source: "ollama_starter\manifests\registry.ollama.ai\library\qwen2.5\0.5b";       DestDir: "{userappdata}\Pushpa\models\manifests\registry.ollama.ai\library\qwen2.5"; Flags: onlyifdoesntexist; Check: BundledModelExists

[Icons]
Name: "{userprograms}\AI Cursor"; Filename: "{app}\AIcursor.exe"
Name: "{userdesktop}\AI Cursor"; Filename: "{app}\AIcursor.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\AIcursor.exe"; Description: "Launch AI Cursor now"; Flags: nowait postinstall

[UninstallRun]
Filename: "taskkill.exe"; Parameters: "/f /im AIcursor.exe"; Flags: runhidden
Filename: "taskkill.exe"; Parameters: "/f /im ollama.exe"; Flags: runhidden

[UninstallDelete]
Type: filesandordirs; Name: "{userappdata}\Pushpa"

[Code]
function BundledModelExists(): Boolean;
begin
  Result := FileExists(ExpandConstant('{src}\ollama_starter\manifests\registry.ollama.ai\library\qwen2.5\0.5b'));
end;
