; The server installer is elevated. Keep the shared service private to the
; clinic LAN; clients only need outbound network access.
!macro customInstall
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="Lab LMS Server - TCP 3000"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="Lab LMS Server - UDP Discovery 32480"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="Lab LMS Server - TCP 3000" dir=in action=allow protocol=TCP localport=3000 profile=private'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="Lab LMS Server - UDP Discovery 32480" dir=in action=allow protocol=UDP localport=32480 profile=private'
  Pop $0
!macroend

!macro customUnInstall
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="Lab LMS Server - TCP 3000"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="Lab LMS Server - UDP Discovery 32480"'
  Pop $0
!macroend
