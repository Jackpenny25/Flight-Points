@echo off
if /i "%~1" neq "fromcmd" (
	start "" cmd /k "%~f0" fromcmd
	exit /b
)
cd /d C:\Users\Admin\Desktop\Flight-Points\Code\Flight-Points
set "HAS_CHANGES="
for /f "delims=" %%A in ('git status --porcelain') do set "HAS_CHANGES=1"
if defined HAS_CHANGES (
	call git stash push -u -m "auto-stash before pull"
)
call git pull
if defined HAS_CHANGES (
	call git stash pop
)
call npm install
call npm run build
net stop cadet-website
net start cadet-website
echo.
echo Press any key to close...
pause
