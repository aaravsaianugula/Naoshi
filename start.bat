@echo off
title Mesher - Precision Model Repair
color 0f

echo ==========================================
echo      Mesher - Precision Model Repair
echo ==========================================
echo.

echo [1/4] Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python is not installed or not in PATH.
    echo Please install Python 3.10+ and try again.
    echo Download from: https://www.python.org/downloads/
    pause
    exit /b
)

echo [2/4] Setting up Environment...
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo [3/4] Installing Dependencies...
python -m pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo Error installing dependencies.
    echo Please check your internet connection.
    pause
    exit /b
)

echo [4/4] Starting Application...
echo.
echo Opening browser...
REM Browser launch handled by python script now to support dynamic ports
REM start http://localhost:8000

echo Starting Server...
echo Press Ctrl+C to stop.
python api_server.py

pause
