@echo off
rem KEM Site – one backup run (also used by the nightly scheduled task).
cd /d "%~dp0..\.."
if not exist data\logs mkdir data\logs
call npm run backup >> data\logs\backup.log 2>&1
