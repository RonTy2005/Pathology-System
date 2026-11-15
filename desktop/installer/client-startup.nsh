; Start the workstation client automatically for the Windows account used by
; the laboratory. No inbound firewall rule is required for client PCs.
!macro customInstall
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LabShield" '"$INSTDIR\LabShield.exe" --autostart'
  SetShellVarContext current
  CreateDirectory "$SMSTARTUP"
  Push $OUTDIR
  SetOutPath "$INSTDIR"
  CreateShortCut "$SMSTARTUP\LabShield.lnk" "$INSTDIR\LabShield.exe" "--autostart" "$INSTDIR\LabShield.exe" 0 SW_SHOWNORMAL
  Pop $0
  SetOutPath "$0"
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LabShield"
  SetShellVarContext current
  Delete "$SMSTARTUP\LabShield.lnk"
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\app\desktop\startupTask.ps1" -Mode Remove -ExecutablePath "$INSTDIR\LabShield.exe" -AppMode client'
  Pop $0
!macroend
