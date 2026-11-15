; The server installer is elevated. Keep the shared service private to the
; clinic LAN; clients only need outbound network access.
!macro customInstall
  ; Start the central server automatically for the Windows account used by
  ; the laboratory. The app verifies this entry again whenever it launches.
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LabShield Server" '"$INSTDIR\LabShield Server.exe" --autostart'
  SetShellVarContext current
  CreateDirectory "$SMSTARTUP"
  Push $OUTDIR
  SetOutPath "$INSTDIR"
  CreateShortCut "$SMSTARTUP\LabShield Server.lnk" "$INSTDIR\LabShield Server.exe" "--autostart" "$INSTDIR\LabShield Server.exe" 0 SW_SHOWNORMAL
  Pop $0
  SetOutPath "$0"
  SetShellVarContext all
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
  SetShellVarContext current
  Delete "$SMSTARTUP\LabShield Server.lnk"
  SetShellVarContext all
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\app\desktop\startupTask.ps1" -Mode Remove -ExecutablePath "$INSTDIR\LabShield Server.exe" -AppMode server'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="LabShield Server - TCP 3000"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="LabShield Server - UDP Discovery 32480"'
  Pop $0
!macroend
