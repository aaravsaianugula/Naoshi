# Naoshi One-Line Installer

$ErrorActionPreference = "Stop"
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "       Naoshi App Installer" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Setup Install Directory & Clean Old Versions
$InstallDir = "$env:LOCALAPPDATA\Naoshi"
$ShortcutPath = "$env:USERPROFILE\Desktop\Naoshi.lnk"

Write-Host "[1/5] Preparing Install Directory..."
$StartMenuShortcutPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Naoshi.lnk"

if (Test-Path $ShortcutPath) {
    Write-Host "      Removing old desktop shortcut..." -ForegroundColor Gray
    Remove-Item -Path $ShortcutPath -Force
}
if (Test-Path $StartMenuShortcutPath) {
    Write-Host "      Removing old Start Menu shortcut..." -ForegroundColor Gray
    Remove-Item -Path $StartMenuShortcutPath -Force
}

if (Test-Path $InstallDir) {
    Write-Host "      Cleaning old installation..." -ForegroundColor Gray
    Remove-Item -Path $InstallDir -Recurse -Force
}
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Set-Location $InstallDir

# 2. Download Application
Write-Host "[2/5] Downloading latest version..."
$ZipUrl = "https://github.com/aaravsaianugula/Naoshi/archive/refs/heads/main.zip"
$ZipFile = "$InstallDir\source.zip"

try {
    Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipFile
}
catch {
    Write-Host "Error downloading file. Please check your internet connection." -ForegroundColor Red
    exit 1
}

# 3. Extract Files
Write-Host "[3/5] Extracting files..."
Expand-Archive -Path $ZipFile -DestinationPath $InstallDir -Force
Remove-Item $ZipFile

# Move files from subdirectory to root of InstallDir
$SubDir = Get-ChildItem -Path $InstallDir -Directory | Select-Object -First 1
Get-ChildItem -Path $SubDir.FullName | Move-Item -Destination $InstallDir -Force
Remove-Item $SubDir.FullName -Recurse -Force

# 4. Setup Environment
Write-Host "[4/5] Setting up Python Environment..."

if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Python is not installed." -ForegroundColor Red
    Write-Host "Please install Python 3.10+ from python.org" -ForegroundColor White
    exit 1
}

python -m venv venv
if (-not (Test-Path "venv")) {
    Write-Host "Error creating virtual environment." -ForegroundColor Red
    exit 1
}

Write-Host "      Installing Python dependencies (this may take a minute)..."
.\venv\Scripts\python.exe -m pip install --upgrade pip --quiet
.\venv\Scripts\pip install -r requirements.txt --quiet

# Install Node.js dependencies for web frontend
Write-Host "      Installing Node.js dependencies..."
if (-not (Get-Command "npm.cmd" -ErrorAction SilentlyContinue)) {
    Write-Host "Warning: npm not found. Web dependencies will not be installed." -ForegroundColor Yellow
    Write-Host "         Install Node.js from https://nodejs.org for full functionality." -ForegroundColor Yellow
}
else {
    Set-Location "$InstallDir\web"
    # Use npm.cmd directly to avoid PowerShell execution policy issues with npm.ps1
    npm.cmd install --quiet 2>$null
    Set-Location $InstallDir
}

# 5. Create Shortcuts (Desktop + Start Menu for search bar access)
Write-Host "[5/5] Creating Shortcuts..."
$WshShell = New-Object -comObject WScript.Shell

# Desktop Shortcut
$DesktopShortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Naoshi.lnk")
$DesktopShortcut.TargetPath = "$InstallDir\start.bat"
$DesktopShortcut.WorkingDirectory = $InstallDir
$DesktopShortcut.WindowStyle = 1
$DesktopShortcut.IconLocation = "$InstallDir\icon.ico"
$DesktopShortcut.Description = "Naoshi - Precision STL Repair"
$DesktopShortcut.Save()

# Start Menu Shortcut (for Windows Search and Start Menu access)
$StartMenuPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Naoshi.lnk"
$StartMenuShortcut = $WshShell.CreateShortcut($StartMenuPath)
$StartMenuShortcut.TargetPath = "$InstallDir\start.bat"
$StartMenuShortcut.WorkingDirectory = $InstallDir
$StartMenuShortcut.WindowStyle = 1
$StartMenuShortcut.IconLocation = "$InstallDir\icon.ico"
$StartMenuShortcut.Description = "Naoshi - Precision STL Repair"
$StartMenuShortcut.Save()

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "      Installation Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "You can now open 'Naoshi' from your Desktop or Windows Search bar."
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

