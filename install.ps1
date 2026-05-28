# H20Sender/install.ps1 - Full Auto Installer (Updated with Chrome)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Set-ExecutionPolicy Bypass -Scope Process -Force

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host " H20 Email Sender - Full Automatic Installer" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# ====================== AUTO INSTALL NODE.JS ======================
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found. Installing Node.js LTS..." -ForegroundColor Yellow
   
    $nodeUrl = "https://nodejs.org/dist/v24.15.0/node-v24.15.0-x64.msi"
    $nodeMsi = "$env:TEMP\node-v24.15.0-x64.msi"
   
    try {
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi -UseBasicParsing
        Start-Process msiexec.exe -ArgumentList "/i `"$nodeMsi`" /qn /norestart ADDLOCAL=ALL" -Wait -NoNewWindow
        Write-Host "✅ Node.js installed successfully!" -ForegroundColor Green
        Write-Host "Please CLOSE this PowerShell window and run again." -ForegroundColor Yellow
        pause
        exit
    } catch {
        Write-Host "❌ Failed to install Node.js." -ForegroundColor Red
        Write-Host "Install manually from: https://nodejs.org" -ForegroundColor Yellow
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

Write-Host "`nDownloading project files..." -ForegroundColor Yellow

$base = "https://raw.githubusercontent.com/supercomputer231-eng/H20Sender/main"
$files = @("test.mjs","placeholders.js","message.html","attachment.html","Leads.txt","fromname.txt","subject.txt","token.txt","config.js")

foreach ($file in $files) {
    try {
        Invoke-WebRequest -Uri "$base/$file" -OutFile $file -UseBasicParsing -ErrorAction Stop
        Write-Host "Downloaded: $file" -ForegroundColor Green
    } catch {
        Write-Host "Warning: Could not download $file" -ForegroundColor Yellow
    }
}

# ====================== FIX MODULE ======================
if (-not (Test-Path "package.json")) { "{}" | Set-Content "package.json" }
$pkg = Get-Content "package.json" | ConvertFrom-Json
$pkg | Add-Member -NotePropertyName "type" -NotePropertyValue "module" -Force
$pkg | ConvertTo-Json -Depth 10 | Set-Content "package.json"

# ====================== CREATE TXT FILES ======================
Write-Host "`nCreating required files..." -ForegroundColor Yellow
if (-not (Test-Path "Leads.txt")) { "test@email.com" | Out-File -FilePath "Leads.txt" -Encoding UTF8 }
if (-not (Test-Path "fromname.txt")) { "DocuPay Official`nSupport Team" | Out-File -FilePath "fromname.txt" -Encoding UTF8 }
if (-not (Test-Path "subject.txt")) { "Important Document`nSettlement Notice" | Out-File -FilePath "subject.txt" -Encoding UTF8 }
if (-not (Test-Path "token.txt")) { 
    "PUT_YOUR_TOKEN_HERE" | Out-File -FilePath "token.txt" -Encoding UTF8 
}

# ====================== INSTALL CHROME BROWSER ======================
Write-Host "`nChecking for Google Chrome..." -ForegroundColor Yellow

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
    Write-Host "Chrome not found. Installing Google Chrome..." -ForegroundColor Yellow
    $chromeUrl = "https://dl.google.com/chrome/install/latest/chrome_installer.exe"
    $installer = "$env:TEMP\chrome_installer.exe"
    
    try {
        Invoke-WebRequest -Uri $chromeUrl -OutFile $installer
        Start-Process $installer -ArgumentList "/silent /install" -Wait -NoNewWindow
        Write-Host "✅ Google Chrome installed successfully!" -ForegroundColor Green
    } catch {
        Write-Host "⚠️ Could not install Chrome automatically. Please install manually." -ForegroundColor Yellow
    }
} else {
    Write-Host "✅ Google Chrome detected" -ForegroundColor Green
}

# ====================== INSTALL NPM PACKAGES ======================
Write-Host "`nInstalling npm packages..." -ForegroundColor Yellow

npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth ^
    qrcode p-limit nodemailer cli-progress chalk ora

Write-Host "`n===========================================" -ForegroundColor Cyan
Write-Host "✅ INSTALLATION COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Project Location: $projectPath" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Put your token in token.txt" -ForegroundColor White
Write-Host "2. Add emails to Leads.txt" -ForegroundColor White
Write-Host "3. Run: node test.mjs" -ForegroundColor White
Write-Host ""

pause
