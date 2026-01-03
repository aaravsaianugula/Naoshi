@echo off
title Naoshi Installer
color 0f

echo ==========================================
echo      Naoshi App Installer
echo ==========================================
echo.

echo [1/4] Checking environment...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python is not installed.
    echo Please install Python 3.10+ from python.org
    pause
    exit /b
)

if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

echo [2/4] Installing Python dependencies...
call venv\Scripts\activate.bat
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo Error installing Python dependencies.
    pause
    exit /b
)

echo [3/4] Installing web dependencies...
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo Warning: npm not found. Skipping web dependencies.
    echo          Install Node.js from https://nodejs.org for full functionality.
) else (
    cd web
    npm install --quiet 2>nul
    cd ..
)

echo [4/4] Creating Desktop Shortcut...
python setup_shortcut.py

echo.
echo ==========================================
echo      Installation Complete!
echo ==========================================
echo.
echo You can now open "Naoshi" from your Desktop.
echo.
pause
