; The server installer is elevated. Keep the shared service private to the
; clinic LAN; clients only need outbound network access.
!macro customInstall
  ; Start the central server automatically for the Windows account used by
  ; the laboratory. The app verifies this entry again whenever it launches.
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LabShield Server" '"$INSTDIR\LabShield Server.exe"'
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="LabShield Server - TCP 3000"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="LabShield Server - UDP Discovery 32480"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="LabShield Server - TCP 3000" dir=in action=allow protocol=TCP localport=3000 profile=private'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="LabShield Server - UDP Discovery 32480" dir=in action=allow protocol=UDP localport=32480 profile=private'
  Pop $0
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LabShield Server"
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="LabShield Server - TCP 3000"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="LabShield Server - UDP Discovery 32480"'
  Pop $0
!macroend
