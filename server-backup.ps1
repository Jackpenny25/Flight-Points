Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ==========================================
# Flight-Points Server Backup Script
# ==========================================
# Creates dated backups for:
# 1) PostgreSQL database (pg_dump)
# 2) Optional file/folder copies
#
# Edit settings in the CONFIGURATION section below.

# ---------- CONFIGURATION (EDIT THESE) ----------
$BackupName = 'flight-points'
$BackupRoot = 'C:\inetpub\wwwroot\Flight-Points\Backups'
$LogDir = 'C:\inetpub\wwwroot\Flight-Points\Logs\Backup'
$LogFile = Join-Path $LogDir "backup-$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').log"
if (!(Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$KeepDays = 30

# DATABASE BACKUP
$EnableDatabaseBackup = $true
$EnvFilePath = Join-Path $PSScriptRoot '.env.local'
# Leave blank to auto-detect from Program Files, or set full path e.g. 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe'
$PgDumpPath = ''

# FILE/FOLDER BACKUP
$EnableFileBackup = $false
$CreateZip = $true

# Add every folder/file path you want backed up here.
$BackupSources = @(
    'C:\Path\To\Flight-Points',
    'C:\Path\To\AnotherFolder'
)
# -----------------------------------------------

# Auto-detect pg_dump if not explicitly set
if ($EnableDatabaseBackup -and [string]::IsNullOrWhiteSpace($PgDumpPath)) {
    # Check PATH first
    $found = Get-Command 'pg_dump' -ErrorAction SilentlyContinue
    if ($found) {
        $PgDumpPath = $found.Source
    } else {
        # Search common PostgreSQL install directories
        $pgDirs = @(
            'C:\Program Files\PostgreSQL',
            'C:\Program Files (x86)\PostgreSQL'
        )
        foreach ($pgDir in $pgDirs) {
            if (Test-Path $pgDir) {
                $latest = Get-ChildItem -Path $pgDir -Directory |
                    Sort-Object { [int]($_.Name -replace '[^\d]','') } -Descending |
                    Select-Object -First 1
                if ($latest) {
                    $candidate = Join-Path $latest.FullName 'bin\pg_dump.exe'
                    if (Test-Path $candidate) {
                        $PgDumpPath = $candidate
                        break
                    }
                }
            }
        }
    }

    if ([string]::IsNullOrWhiteSpace($PgDumpPath)) {
        throw "pg_dump not found. Set `$PgDumpPath in the CONFIGURATION section to the full path of pg_dump.exe"
    }

Write-Log "Auto-detected pg_dump: $PgDumpPath"
}

function Get-DatabaseUrlFromEnvFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath
    )

    if (-not (Test-Path -Path $FilePath)) {
        throw "Could not find env file: $FilePath"
    }

    $line = Get-Content -Path $FilePath |
        Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
        Select-Object -First 1

    if (-not $line) {
        throw "DATABASE_URL not found in $FilePath"
    }

    $value = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim()
    $value = $value.Trim('"').Trim("'")

    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "DATABASE_URL is empty in $FilePath"
    }

    return $value
}

function Write-Log {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
}

function New-SafeName {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $invalid = [System.IO.Path]::GetInvalidFileNameChars()
    $chars = $Value.ToCharArray() | ForEach-Object {
        if ($invalid -contains $_) { '_' } else { $_ }
    }
    return (-join $chars)
}

if (-not $EnableDatabaseBackup -and -not $EnableFileBackup) {
    throw 'Both $EnableDatabaseBackup and $EnableFileBackup are disabled. Enable at least one.'
}

if (-not (Test-Path -Path $BackupRoot)) {
    New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dbBackupRoot = Join-Path $BackupRoot 'database'
$fileBackupRoot = Join-Path $BackupRoot 'files'

if ($EnableDatabaseBackup -and -not (Test-Path -Path $dbBackupRoot)) {
    New-Item -ItemType Directory -Path $dbBackupRoot -Force | Out-Null
}

if ($EnableFileBackup -and -not (Test-Path -Path $fileBackupRoot)) {
    New-Item -ItemType Directory -Path $fileBackupRoot -Force | Out-Null
}

Write-Log "Starting backup: $BackupName"
Write-Log "Backup root: $BackupRoot"

if ($EnableDatabaseBackup) {
    Write-Log 'Running PostgreSQL backup...'

    $databaseUrl = Get-DatabaseUrlFromEnvFile -FilePath $EnvFilePath
    $dbFilePath = Join-Path $dbBackupRoot ("$BackupName-db-$timestamp.dump")

    & $PgDumpPath "--dbname=$databaseUrl" '--format=custom' "--file=$dbFilePath" '--no-owner' '--no-privileges'
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump failed with exit code $LASTEXITCODE"
    }

    Write-Log "Database backup complete: $dbFilePath"
}

if ($EnableFileBackup) {
    if (-not $BackupSources -or $BackupSources.Count -eq 0) {
        throw 'File backup is enabled but $BackupSources is empty. Add at least one path.'
    }

    $stagingDir = Join-Path $fileBackupRoot ("$BackupName-staging-$timestamp")
    $backupDir = Join-Path $fileBackupRoot ("$BackupName-$timestamp")
    $zipPath = "$backupDir.zip"

    New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null

    Write-Log 'Running file/folder backup...'

    $copiedCount = 0
    foreach ($source in $BackupSources) {
        if (-not (Test-Path -Path $source)) {
            Write-Warning "Skipping missing path: $source"
            continue
        }

        $leaf = Split-Path -Path $source -Leaf
        if ([string]::IsNullOrWhiteSpace($leaf)) {
            $leaf = (New-SafeName -Value $source).Trim('_')
        }

        $targetName = "{0}-{1}" -f $copiedCount, (New-SafeName -Value $leaf)
        $targetPath = Join-Path $stagingDir $targetName

        Copy-Item -Path $source -Destination $targetPath -Recurse -Force
        Write-Log "Backed up: $source"
        $copiedCount++
    }

    if ($copiedCount -eq 0) {
        Remove-Item -Path $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
        throw 'No configured source paths could be backed up. Check $BackupSources.'
    }

    if ($CreateZip) {
        if (Test-Path -Path $zipPath) {
            Remove-Item -Path $zipPath -Force
        }

        Compress-Archive -Path (Join-Path $stagingDir '*') -DestinationPath $zipPath -Force
        Remove-Item -Path $stagingDir -Recurse -Force
        Write-Log "File backup complete: $zipPath"
    } else {
        Move-Item -Path $stagingDir -Destination $backupDir -Force
        Write-Log "File backup complete: $backupDir"
    }
}

if ($KeepDays -gt 0) {
    $cutoff = (Get-Date).AddDays(-$KeepDays)

    Get-ChildItem -Path $dbBackupRoot -File -Filter "$BackupName-db-*.dump" -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        Remove-Item -Force -ErrorAction SilentlyContinue

    if ($EnableFileBackup) {
        Get-ChildItem -Path $fileBackupRoot -File -Filter "$BackupName-*.zip" -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -lt $cutoff } |
            Remove-Item -Force -ErrorAction SilentlyContinue

        Get-ChildItem -Path $fileBackupRoot -Directory -Filter "$BackupName-*" -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notlike '*staging*' -and $_.LastWriteTime -lt $cutoff } |
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Log 'Done.'