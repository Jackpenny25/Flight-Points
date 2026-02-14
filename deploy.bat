@echo off
if /i "%~1" neq "fromcmd" (
	start "" cmd /k "%~f0" fromcmd
	exit /b
)
net session >nul 2>&1
if %errorlevel% neq 0 (
	echo Requesting administrative privileges...
	powershell -Command "Start-Process cmd -ArgumentList '/k \"%~f0\" fromcmd' -Verb RunAs"
	exit
)
cd /d "%~dp0"

:: Prevent commits from this device
call git config --local core.hooksPath /dev/null

:: Automatically resolve conflicts by resetting unmerged files
call git reset --merge
call git clean -fd

set "HAS_CHANGES="
for /f "delims=" %%A in ('git status --porcelain') do set "HAS_CHANGES=1"
if defined HAS_CHANGES (
	call git stash push -u -m "auto-stash before pull"
)
call git pull --no-rebase
if defined HAS_CHANGES (
	call git stash pop
)
call npm install --no-fund --no-audit
call npm run build
sc query "flight-points" >nul 2>&1
if %errorlevel%==0 (
	net stop "flight-points"
	net start "flight-points"
) else (
	echo Service "flight-points" not found. Skipping restart.
)
echo.
echo Press any key to close...
pause >nul
