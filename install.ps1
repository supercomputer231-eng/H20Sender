# H20Sender/install.ps1 - Full Auto Installer
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Set-ExecutionPolicy Bypass -Scope Process -Force

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "   H20 Email Sender - Full Automatic Installer" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# ====================== NODE.JS AUTO INSTALL ======================
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found. Downloading and installing silently..." -ForegroundColor Yellow
    
    $nodeUrl = "https://nodejs.org/dist/v24.15.0/node-v24.15.0-x64.msi"
    $nodeMsi = "$env:TEMP\node-v24.15.0-x64.msi"
    
    try {
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi -UseBasicParsing
        Start-Process msiexec.exe -ArgumentList "/i `"$nodeMsi`" /qn /norestart ADDLOCAL=ALL" -Wait -NoNewWindow
        Write-Host "✅ Node.js installed successfully" -ForegroundColor Green
        Write-Host "Please CLOSE this PowerShell window and run the installer again." -ForegroundColor Yellow
        pause
        exit
    } catch {
        Write-Host "❌ Failed to install Node.js automatically." -ForegroundColor Red
        Write-Host "Please install Node.js manually from https://nodejs.org" -ForegroundColor Yellow
        pause
        exit
    }
} else {
    Write-Host "✅ Node.js detected: $(node --version)" -ForegroundColor Green
}

# ====================== PROJECT SETUP ======================
$projectPath = "$env:USERPROFILE\Desktop\H20Sender"
if (-not (Test-Path $projectPath)) {
    New-Item -ItemType Directory -Path $projectPath | Out-Null
}
Set-Location $projectPath

Write-Host "`nDownloading all files from GitHub..." -ForegroundColor Yellow

$base = "https://raw.githubusercontent.com/supercomputer231-eng/H20Sender/main"

$files = @(
    "test.mjs", "placeholders.js", "message.html", "attachment.html",
    "Leads.txt", "fromname.txt", "subject.txt", "token.txt", "install.ps1"
)

foreach ($file in $files) {
    try {
        Invoke-WebRequest -Uri "$base/$file" -OutFile $file -UseBasicParsing -ErrorAction Stop
        Write-Host "Downloaded: $file" -ForegroundColor Green
    } catch {
        Write-Host "Warning: Could not download $file" -ForegroundColor Yellow
    }
}

# ====================== NPM PACKAGES ======================
Write-Host "`nInstalling required npm packages..." -ForegroundColor Yellow
npm install puppeteer qrcode p-limit nodemailer

Write-Host "`n===========================================" -ForegroundColor Cyan
Write-Host "✅ FULL INSTALLATION COMPLETED!" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project is ready at: $projectPath" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Put your token in token.txt" -ForegroundColor White
Write-Host "2. Add leads to Leads.txt" -ForegroundColor White
Write-Host "3. Run: node test.mjs" -ForegroundColor White
Write-Host ""
Write-Host "Controls: P = Pause | R = Resume | Q = Quit" -ForegroundColor Yellow
Write-Host ""

pause
