@echo off
if /i "%~1" neq "fromcmd" (
	start "" cmd /k "%~f0" fromcmd
	exit /b
)
cd /d "%~dp0"
set "HAS_CHANGES="
for /f "delims=" %%A in ('git status --porcelain') do set "HAS_CHANGES=1"
if defined HAS_CHANGES (
	call git stash push -u -m "auto-stash before pull"
)
call git pull
if defined HAS_CHANGES (
	call git stash pop
)
call npm install --no-fund --no-audit
call npm run build
net session >nul 2>&1
set "IS_ADMIN=%errorlevel%"
sc query "flight-points" >nul 2>&1
if %errorlevel%==0 (
	if "%IS_ADMIN%"=="0" (
		net stop "flight-points"
		net start "flight-points"
	) else (
		echo Service found, but this shell is not elevated. Skipping restart.
	)
) else (
	echo Service "flight-points" not found. Skipping restart.
)
echo.
echo Press any key to close...
pause >nul
