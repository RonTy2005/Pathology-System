; Start the workstation client automatically for the Windows account used by
; the laboratory. No inbound firewall rule is required for client PCs.
!macro customInstall
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LabShield" '"$INSTDIR\LabShield.exe"'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LabShield"
!macroend
