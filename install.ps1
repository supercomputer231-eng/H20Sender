# H20Sender/install.ps1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Set-ExecutionPolicy Bypass -Scope Process -Force

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "   H20 Email Sender - One-Click Installer" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# Auto install Node.js if missing (MSI method - more reliable)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Downloading & Installing Node.js LTS..." -ForegroundColor Yellow
    $url = "https://nodejs.org/dist/v24.15.0/node-v24.15.0-x64.msi"
    $out = "$env:TEMP\node.msi"
    Invoke-WebRequest -Uri $url -OutFile $out
    Start-Process msiexec.exe -ArgumentList "/i `"$out`" /qn /norestart" -Wait
    Write-Host "Node.js installed. Please close this window and run the installer again." -ForegroundColor Green
    pause; exit
}

# Create project folder
$path = "$env:USERPROFILE\Desktop\H20Sender"
if (-not (Test-Path $path)) { New-Item -ItemType Directory -Path $path | Out-Null }
Set-Location $path

# Clone or download the repo
Write-Host "Downloading sender files..." -ForegroundColor Yellow
git clone https://github.com/YOUR_USERNAME/H20Sender.git . 2>$null
if (-not $?) {
    Invoke-WebRequest -Uri "https://github.com/YOUR_USERNAME/H20Sender/archive/refs/heads/main.zip" -OutFile "repo.zip"
    Expand-Archive "repo.zip" -DestinationPath . -Force
    Move-Item -Path "H20Sender-main\*" -Destination . -Force
}

# Install packages
npm install puppeteer qrcode p-limit nodemailer

Write-Host "`n✅ Installation Finished!" -ForegroundColor Green
Write-Host "Run the sender:   node test.mjs" -ForegroundColor Yellow
Write-Host "Controls: P = Pause | R = Resume | Q = Quit" -ForegroundColor Yellow
pause
