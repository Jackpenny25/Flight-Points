@echo off
if /i "%~1" neq "fromcmd" (
	start "" cmd /k "%~f0" fromcmd
	exit /b
)
cd /d C:\Users\Admin\Desktop\Flight-Points\Code\Flight-Points
git pull
npm install
npm run build
net stop cadet-website
net start cadet-website
echo.
echo Press any key to close...
pause
