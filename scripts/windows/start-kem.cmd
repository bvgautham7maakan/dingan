@echo off
rem KEM Site – runs the app and restarts it if it stops. Output goes to data\logs\server.log.
cd /d "%~dp0..\.."
if not exist data\logs mkdir data\logs
:loop
echo %date% %time% starting KEM Site >> data\logs\server.log
call npm start >> data\logs\server.log 2>&1
echo %date% %time% stopped with code %errorlevel% – restarting in 10 s >> data\logs\server.log
timeout /t 10 /nobreak > nul
goto loop
