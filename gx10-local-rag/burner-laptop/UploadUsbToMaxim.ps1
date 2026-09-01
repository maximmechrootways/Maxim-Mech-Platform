# Upload USB to Maxim - copies a chosen project folder from a USB drive to the
# GX10 inbox share. The folder name becomes the project in the local archive.
#
# Launched by "Upload USB to Maxim.bat". Credentials are stored once by
# Setup-BurnerLaptop.ps1 (cmdkey), so no password prompt appears here.

$Share = '\\192.168.1.198\inbox'
$exitCode = 0
$junkDirNames = @('System Volume Information', '$RECYCLE.BIN', '.Trashes', '.Spotlight-V100', '.fseventsd')

function Write-Big([string]$Text, [string]$Color = 'White') {
    Write-Host ''
    Write-Host ("  " + $Text) -ForegroundColor $Color
    Write-Host ''
}

try {
    try { $Host.UI.RawUI.WindowTitle = 'Upload USB to Maxim' } catch { }
    Clear-Host
    Write-Host '=============================================' -ForegroundColor Cyan
    Write-Host '          UPLOAD USB TO MAXIM' -ForegroundColor Cyan
    Write-Host '=============================================' -ForegroundColor Cyan

    if (-not (Test-Path $Share)) {
        Write-Big 'CANNOT REACH THE MAXIM SERVER.' 'Red'
        Write-Host '  Make sure this laptop is connected to the office Wi-Fi/network,'
        Write-Host '  then close this window and try again.'
        $exitCode = 1
        return
    }

    $usbDrives = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=2' | Where-Object { $_.Size -gt 0 })
    if ($usbDrives.Count -eq 0) {
        Write-Big 'NO USB DRIVE FOUND.' 'Yellow'
        Write-Host '  Plug the USB key into this laptop, wait 5 seconds,'
        Write-Host '  then double-click the icon again.'
        $exitCode = 1
        return
    }

    # Build list of top-level project folders across all USB drives
    $choices = @()
    foreach ($drive in $usbDrives) {
        $root = "$($drive.DeviceID)\"
        $label = if ($drive.VolumeName) { $drive.VolumeName } else { 'USB' }
        $dirs = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
            Where-Object { $junkDirNames -notcontains $_.Name }
        foreach ($d in $dirs) {
            $choices += [pscustomobject]@{
                DriveLabel = $label
                DriveRoot  = $root
                Name       = $d.Name
                FullPath   = $d.FullName
            }
        }
    }

    if ($choices.Count -eq 0) {
        Write-Big 'NO PROJECT FOLDERS FOUND ON THE USB.' 'Yellow'
        Write-Host '  Put your files inside a folder on the USB (e.g. VIA RAIL ONTC),'
        Write-Host '  then run this again. Loose files at the USB root are not uploaded.'
        $exitCode = 1
        return
    }

    Write-Host ''
    Write-Host '  Pick which project folder to upload:' -ForegroundColor Cyan
    Write-Host ''
    for ($i = 0; $i -lt $choices.Count; $i++) {
        $c = $choices[$i]
        Write-Host ("    [{0}]  {1}   (on {2} {3})" -f ($i + 1), $c.Name, $c.DriveLabel, $c.DriveRoot.TrimEnd('\'))
    }
    Write-Host ''
    Write-Host '    [A]  Upload ALL folders listed above'
    Write-Host '    [Q]  Quit without uploading'
    Write-Host ''

    $pick = Read-Host '  Enter number (or A / Q)'
    $pick = ($pick).Trim()

    $toUpload = @()
    if ($pick -match '^[Qq]$') {
        Write-Big 'Cancelled - nothing uploaded.' 'Yellow'
        return
    } elseif ($pick -match '^[Aa]$') {
        $toUpload = $choices
    } elseif ($pick -match '^\d+$') {
        $idx = [int]$pick - 1
        if ($idx -lt 0 -or $idx -ge $choices.Count) {
            Write-Big 'Invalid choice.' 'Red'
            $exitCode = 1
            return
        }
        $toUpload = @($choices[$idx])
    } else {
        # Allow typing part of the folder name
        $match = @($choices | Where-Object { $_.Name -like "*$pick*" })
        if ($match.Count -eq 1) {
            $toUpload = $match
        } elseif ($match.Count -gt 1) {
            Write-Big 'That matched more than one folder - type the number instead.' 'Yellow'
            $exitCode = 1
            return
        } else {
            Write-Big 'Invalid choice.' 'Red'
            $exitCode = 1
            return
        }
    }

    $failed = $false
    foreach ($item in $toUpload) {
        $dest = Join-Path $Share $item.Name
        Write-Big ("Uploading: {0}" -f $item.Name) 'Green'
        Write-Host ("  From: {0}" -f $item.FullPath)
        Write-Host ("  To:   {0}" -f $dest)
        Write-Host '  Leave this window open until it says DONE.'
        Write-Host ''

        if (-not (Test-Path -LiteralPath $dest)) {
            New-Item -ItemType Directory -Path $dest -Force | Out-Null
        }

        robocopy $item.FullPath $dest /E /R:1 /W:2 /XO `
            /XD 'System Volume Information' '$RECYCLE.BIN' '.Trashes' '.Spotlight-V100' `
            /XF 'Thumbs.db' 'desktop.ini' 'autorun.inf' '.DS_Store' `
            /NP /NDL /NJH

        if ($LASTEXITCODE -ge 8) {
            $failed = $true
            Write-Big ("PROBLEM COPYING {0} - some files did not make it." -f $item.Name) 'Red'
        } else {
            Write-Big ("DONE - {0} uploaded to Maxim." -f $item.Name) 'Green'
        }
    }

    if ($failed) {
        Write-Host '  Try again, or call IT if it keeps failing.' -ForegroundColor Yellow
        $exitCode = 1
    } else {
        Write-Host '  You can unplug the USB key now.' -ForegroundColor Cyan
        Write-Host '  Files are being indexed automatically - ask Frank about them in a few minutes.'
    }
} catch {
    Write-Big 'UNEXPECTED ERROR' 'Red'
    Write-Host ("  " + $_.Exception.Message) -ForegroundColor Red
    $exitCode = 1
} finally {
    Write-Host ''
    Read-Host 'Press Enter to close'
    exit $exitCode
}
