#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{8D6B4F9A-3C21-4F7D-9B10-5E6C1D4E3A99}
AppName=VEX IQ 3D CAD Viewer
AppVersion={#AppVersion}
AppPublisher=VEX RU Community
AppPublisherURL=https://github.com/vex-ru/vex-iq-step
DefaultDirName={localappdata}\Programs\VEX-IQ-Viewer
DefaultGroupName=VEX IQ 3D CAD Viewer
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=VEX-IQ-Viewer-Windows-x64-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\target\release\vex-iq-viewer.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\VEX IQ 3D CAD Viewer"; Filename: "{app}\vex-iq-viewer.exe"
Name: "{autodesktop}\VEX IQ 3D CAD Viewer"; Filename: "{app}\vex-iq-viewer.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\vex-iq-viewer.exe"; Description: "{cm:LaunchProgram,VEX IQ 3D CAD Viewer}"; Flags: nowait postinstall skipifsilent
