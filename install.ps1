# H20Sender/install.ps1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Set-ExecutionPolicy Bypass -Scope Process -Force

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "   H20 Email Sender - Full One-Click Installer" -ForegroundColor Cyan
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

# Setup project folder
$projectPath = "$env:USERPROFILE\Desktop\H20Sender"
if (-not (Test-Path $projectPath)) {
    New-Item -ItemType Directory -Path $projectPath | Out-Null
}
Set-Location $projectPath

Write-Host "`nDownloading ALL files from GitHub..." -ForegroundColor Yellow

$base = "https://raw.githubusercontent.com/supercomputer231-eng/H20Sender/main"

# Download all important files
$files = @(
    "test.mjs",
    "placeholders.js",
    "message.html",
    "attachment.html",
    "Leads.txt",
    "fromname.txt",
    "subject.txt",
    "token.txt",
    "install.ps1"
)

foreach ($file in $files) {
    try {
        Invoke-WebRequest -Uri "$base/$file" -OutFile $file -UseBasicParsing -ErrorAction Stop
        Write-Host "Downloaded: $file" -ForegroundColor Green
    } catch {
        Write-Host "Skipped (not found): $file" -ForegroundColor Yellow
    }
}

# Install npm packages
Write-Host "`nInstalling required packages..." -ForegroundColor Yellow
npm install puppeteer qrcode p-limit nodemailer

Write-Host "`n===========================================" -ForegroundColor Cyan
Write-Host "✅ FULL INSTALLATION COMPLETED!" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project Location: $projectPath" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Edit token.txt with your real token" -ForegroundColor White
Write-Host "2. Add your email leads to Leads.txt" -ForegroundColor White
Write-Host "3. Run the sender: node test.mjs" -ForegroundColor White
Write-Host ""
Write-Host "Controls: P = Pause    R = Resume    Q = Quit + Summary" -ForegroundColor Yellow
Write-Host ""

pause
