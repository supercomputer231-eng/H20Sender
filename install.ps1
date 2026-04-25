# H20Sender/install.ps1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Set-ExecutionPolicy Bypass -Scope Process -Force

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "   H20 Email Sender - One-Click Installer" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found. Installing..." -ForegroundColor Yellow
    $url = "https://nodejs.org/dist/v24.15.0/node-v24.15.0-x64.msi"
    $out = "$env:TEMP\node.msi"
    Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i `"$out`" /qn /norestart ADDLOCAL=ALL" -Wait
    Write-Host "Node.js installed. Please CLOSE this window and run again." -ForegroundColor Green
    pause
    exit
}

Write-Host "✅ Node.js detected: $(node --version)" -ForegroundColor Green

# Setup folder
$projectPath = "$env:USERPROFILE\Desktop\H20Sender"
if (-not (Test-Path $projectPath)) {
    New-Item -ItemType Directory -Path $projectPath | Out-Null
}
Set-Location $projectPath

Write-Host "`nDownloading project files..." -ForegroundColor Yellow

# Direct download of all files from your repo (since it's public now)
$base = "https://raw.githubusercontent.com/supercomputer231-eng/H20Sender/main"

Invoke-WebRequest -Uri "$base/test.mjs"          -OutFile "test.mjs" -UseBasicParsing
Invoke-WebRequest -Uri "$base/placeholders.js"   -OutFile "placeholders.js" -UseBasicParsing
Invoke-WebRequest -Uri "$base/install.ps1"       -OutFile "install.ps1" -UseBasicParsing

Write-Host "✅ Project files downloaded." -ForegroundColor Green

# Install packages
Write-Host "`nInstalling required packages..." -ForegroundColor Yellow
npm install puppeteer qrcode p-limit nodemailer

Write-Host "`n===========================================" -ForegroundColor Cyan
Write-Host "✅ SETUP COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project ready at: $projectPath" -ForegroundColor White
Write-Host ""
Write-Host "To start the sender:" -ForegroundColor Yellow
Write-Host "   node test.mjs" -ForegroundColor White
Write-Host ""
Write-Host "Controls: P = Pause    R = Resume    Q = Quit + Summary" -ForegroundColor Yellow
Write-Host ""

pause
