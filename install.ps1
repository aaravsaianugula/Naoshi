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
if (Test-Path $ShortcutPath) {
    Write-Host "      Removing old shortcut..." -ForegroundColor Gray
    Remove-Item -Path $ShortcutPath -Force
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
if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
    Write-Host "Warning: npm not found. Web dependencies will not be installed." -ForegroundColor Yellow
    Write-Host "         Install Node.js from https://nodejs.org for full functionality." -ForegroundColor Yellow
}
else {
    Set-Location "$InstallDir\web"
    npm install --quiet 2>$null
    Set-Location $InstallDir
}

# 5. Create Shortcut
Write-Host "[5/5] Creating Desktop Shortcut..."
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Naoshi.lnk")
$Shortcut.TargetPath = "$InstallDir\start.bat"
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.WindowStyle = 1
$Shortcut.IconLocation = "$InstallDir\web\logo.png"
$Shortcut.Description = "Naoshi - Precision STL Repair"
$Shortcut.Save()

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "      Installation Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "You can now open 'Naoshi' from your Desktop."
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

