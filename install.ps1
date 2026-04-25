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

Write-Host "`nDownloading core files..." -ForegroundColor Yellow

$base = "https://raw.githubusercontent.com/supercomputer231-eng/H20Sender/main"

Invoke-WebRequest -Uri "$base/test.mjs"          -OutFile "test.mjs"          -UseBasicParsing
Invoke-WebRequest -Uri "$base/placeholders.js"   -OutFile "placeholders.js"   -UseBasicParsing

Write-Host "✅ Core files downloaded." -ForegroundColor Green

# Create necessary .txt files if they don't exist
Write-Host "`nCreating required .txt files..." -ForegroundColor Yellow

if (-not (Test-Path "Leads.txt")) {
    "example@email.com" | Out-File -FilePath "Leads.txt" -Encoding UTF8
    Write-Host "Created Leads.txt (with example email)" -ForegroundColor Green
}

if (-not (Test-Path "fromname.txt")) {
    "DocuPay Official`nOfficial Support" | Out-File -FilePath "fromname.txt" -Encoding UTF8
    Write-Host "Created fromname.txt" -ForegroundColor Green
}

if (-not (Test-Path "subject.txt")) {
    "Important Document`nSettlement Notice" | Out-File -FilePath "subject.txt" -Encoding UTF8
    Write-Host "Created subject.txt" -ForegroundColor Green
}

if (-not (Test-Path "token.txt")) {
    "PUT_YOUR_TOKEN_HERE" | Out-File -FilePath "token.txt" -Encoding UTF8
    Write-Host "Created token.txt (Please edit this with your real token)" -ForegroundColor Yellow
}

# Install packages
Write-Host "`nInstalling required packages..." -ForegroundColor Yellow
npm install puppeteer qrcode p-limit nodemailer

Write-Host "`n===========================================" -ForegroundColor Cyan
Write-Host "✅ SETUP COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project ready at: $projectPath" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Put your real token in token.txt" -ForegroundColor White
Write-Host "2. Add your leads to Leads.txt" -ForegroundColor White
Write-Host "3. Run: node test.mjs" -ForegroundColor White
Write-Host ""
Write-Host "Controls: P = Pause    R = Resume    Q = Quit" -ForegroundColor Yellow
Write-Host ""

pause
