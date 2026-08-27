@echo off
setlocal
cd /d "%~dp0"
echo Starting the Lab LMS LAN server...
echo Keep this window open while staff are using the system.
npm run start:lan
pause
