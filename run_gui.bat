@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Detect venv
if exist .venv\Scripts\python.exe (
  set "PYEXE=.venv\Scripts\python.exe"
) else (
  set "PYEXE=python"
)

%PYEXE% -m pip show manim >nul 2>&1
if errorlevel 1 (
  echo Installing required packages...
  %PYEXE% -m pip install -r requirements.txt
)

%PYEXE% -c "import runpy; runpy.run_module('src.gui', run_name='__main__')"

if errorlevel 1 (
  echo.
  echo GUI failed to start. Ensure ffmpeg is installed and try again.
  echo Install via Chocolatey: choco install ffmpeg -y
  pause
)

endlocal
