# test-deploy-email.ps1 — Test deployment email alerting configuration
# Run this script to verify SMTP settings without triggering a real deployment failure.

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "=== Flight-Points Deploy Email Test ===" -ForegroundColor Cyan
Write-Host ""

# Load SMTP settings from environment and .env.local
$script:SmtpTo       = $env:SMTP_TO
$script:SmtpFrom     = $env:SMTP_FROM
$script:SmtpServer   = $env:SMTP_SERVER
$script:SmtpPort     = if ($env:SMTP_PORT) { [int]$env:SMTP_PORT } else { 587 }
$script:SmtpUser     = $env:SMTP_USER
$script:SmtpPass     = $env:SMTP_PASS

# Load from .env.local if not in environment
$envFile = Join-Path $ProjectDir '.env.local'
if (Test-Path $envFile) {
    Write-Host "Loading SMTP settings from .env.local..." -ForegroundColor Gray
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*(SMTP_\w+)\s*=\s*(.+)$') {
            $key = $Matches[1].Trim()
            $val = $Matches[2].Trim().Trim('"').Trim("'")
            switch ($key) {
                'SMTP_TO'     { if (-not $script:SmtpTo)     { $script:SmtpTo     = $val } }
                'SMTP_FROM'   { if (-not $script:SmtpFrom)   { $script:SmtpFrom   = $val } }
                'SMTP_SERVER' { if (-not $script:SmtpServer) { $script:SmtpServer = $val } }
                'SMTP_PORT'   { if (-not $script:SmtpPort -or $script:SmtpPort -eq 587) { $script:SmtpPort = [int]$val } }
                'SMTP_USER'   { if (-not $script:SmtpUser)   { $script:SmtpUser   = $val } }
                'SMTP_PASS'   { if (-not $script:SmtpPass)   { $script:SmtpPass   = $val } }
            }
        }
    }
}

# Display current configuration
Write-Host ""
Write-Host "Current SMTP Configuration:" -ForegroundColor Yellow
Write-Host "  SMTP_TO:     $script:SmtpTo"
Write-Host "  SMTP_FROM:   $script:SmtpFrom"
Write-Host "  SMTP_SERVER: $script:SmtpServer"
Write-Host "  SMTP_PORT:   $script:SmtpPort"
Write-Host "  SMTP_USER:   $script:SmtpUser"
Write-Host "  SMTP_PASS:   $(if($script:SmtpPass){('*' * 8)}else{'(not set)'})"
Write-Host ""

# Validate configuration
if (-not $script:SmtpTo -or -not $script:SmtpServer -or -not $script:SmtpFrom) {
    Write-Host "ERROR: Email alerting is not configured." -ForegroundColor Red
    Write-Host ""
    Write-Host "Required variables in .env.local:" -ForegroundColor Yellow
    Write-Host "  SMTP_TO=your-email@domain.com"
    Write-Host "  SMTP_FROM=alerts@your-domain.com"
    Write-Host "  SMTP_SERVER=smtp.your-provider.com"
    Write-Host "  SMTP_PORT=587"
    Write-Host "  SMTP_USER=your-smtp-username"
    Write-Host "  SMTP_PASS=your-smtp-password-or-app-password"
    Write-Host ""
    exit 1
}

# Ask for confirmation
Write-Host "This will send a test email to: $script:SmtpTo" -ForegroundColor Cyan
$confirm = Read-Host "Continue? (Y/N)"
if ($confirm -ne 'Y' -and $confirm -ne 'y') {
    Write-Host "Test cancelled." -ForegroundColor Gray
    exit 0
}

# Send test email
Write-Host ""
Write-Host "Sending test email..." -ForegroundColor Yellow

try {
    $subject = "[Flight-Points] Deploy Email Test - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    $body = @"
This is a TEST email from the Flight-Points deployment system.

If you are receiving this, your SMTP configuration is working correctly.

Configuration:
  Server:   $script:SmtpServer
  Port:     $script:SmtpPort
  From:     $script:SmtpFrom
  To:       $script:SmtpTo

Time:    $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Machine: $env:COMPUTERNAME

In production, you will receive emails like this only when auto-deploy FAILS.

---
Flight-Points Auto-Deploy Email Alert System
"@

    $mailParams = @{
        To         = $script:SmtpTo
        From       = $script:SmtpFrom
        Subject    = $subject
        Body       = $body
        SmtpServer = $script:SmtpServer
        Port       = $script:SmtpPort
        UseSsl     = $true
    }

    if ($script:SmtpUser -and $script:SmtpPass) {
        $secPass = ConvertTo-SecureString $script:SmtpPass -AsPlainText -Force
        $cred = New-Object System.Management.Automation.PSCredential($script:SmtpUser, $secPass)
        $mailParams['Credential'] = $cred
    }

    Send-MailMessage @mailParams -ErrorAction Stop

    Write-Host ""
    Write-Host "SUCCESS! Test email sent to $script:SmtpTo" -ForegroundColor Green
    Write-Host ""
    Write-Host "Check your inbox. If you do not see it:" -ForegroundColor Yellow
    Write-Host "  1. Check spam/junk folder"
    Write-Host "  2. Verify SMTP credentials and server settings"
    Write-Host "  3. Ensure firewall allows outbound SMTP traffic"
    Write-Host "  4. For Gmail: use an App Password, not your regular password"
    Write-Host ""
}
catch {
    Write-Host ""
    Write-Host "FAILED to send test email!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error details:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting tips:" -ForegroundColor Yellow
    Write-Host "  - Verify SMTP_SERVER and SMTP_PORT are correct"
    Write-Host "  - Check SMTP_USER and SMTP_PASS credentials"
    Write-Host "  - For Gmail/Google Workspace: use an App Password"
    Write-Host "  - Ensure outbound SMTP is allowed on the server firewall"
    Write-Host "  - Try testing with a different SMTP provider"
    Write-Host ""
    exit 1
}