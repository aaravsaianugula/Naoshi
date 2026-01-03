# Mesher One-Line Installer

$ErrorActionPreference = "Stop"
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "       Mesher App Installer" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Setup Install Directory
$InstallDir = "$env:LOCALAPPDATA\Mesher"
Write-Host "[1/5] Preparing Install Directory:" -NoNewline
Write-Host " $InstallDir" -ForegroundColor Yellow

if (Test-Path $InstallDir) {
    Write-Host "      Cleaning old installation..." -ForegroundColor Gray
    Remove-Item -Path $InstallDir -Recurse -Force
}
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Set-Location $InstallDir

# 2. Download Application
Write-Host "[2/5] Downloading latest version..."
$ZipUrl = "https://github.com/aaravsaianugula/Mesher/archive/refs/heads/main.zip"
$ZipFile = "$InstallDir\source.zip"

try {
    Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipFile
} catch {
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

Write-Host "      Installing dependencies (this may take a minute)..."
.\venv\Scripts\python.exe -m pip install --upgrade pip --quiet
.\venv\Scripts\pip install -r requirements.txt --quiet

# 5. Create Shortcut
Write-Host "[5/5] Creating Desktop Shortcut..."
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Mesher.lnk")
$Shortcut.TargetPath = "$InstallDir\start.bat"
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.WindowStyle = 1
$Shortcut.IconLocation = "$InstallDir\web\logo.png"
$Shortcut.Description = "Mesher - Precision STL Repair"
$Shortcut.Save()

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "      Installation Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "You can now open 'Mesher' from your Desktop."
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
