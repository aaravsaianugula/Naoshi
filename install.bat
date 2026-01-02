@echo off
title Mesher Installer
color 0f

echo ==========================================
echo      Mesher App Installer
echo ==========================================
echo.

echo [1/3] Checking environment...
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

echo [2/3] Installing dependencies...
call venv\Scripts\activate.bat
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo Error installing dependencies.
    pause
    exit /b
)

echo [3/3] Creating Desktop Shortcut...
python setup_shortcut.py

echo.
echo ==========================================
echo      Installation Complete!
echo ==========================================
echo.
echo You can now open "Mesher" from your Desktop.
echo.
pause
