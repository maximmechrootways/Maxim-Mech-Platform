# One-time setup for the burner laptop. Run this once (right-click -> Run with PowerShell).
# - Stores the Maxim inbox credentials so no password prompts ever appear
# - Maps the inbox as drive M: for drag-and-drop in File Explorer
# - Puts an "Upload USB to Maxim" shortcut on the desktop that runs the PowerShell script

$Server = '192.168.1.198'
$Share = "\\$Server\inbox"

Write-Host 'Setting up this laptop for Maxim USB uploads...' -ForegroundColor Cyan

$cred = Get-Credential -UserName 'maxim' -Message 'Enter the Maxim inbox password (SAMBA_PASSWORD from the GX10)'
cmdkey /add:$Server /user:$($cred.UserName) /pass:$($cred.GetNetworkCredential().Password) | Out-Null

if (Test-Path 'M:\') { net use M: /delete /y | Out-Null }
net use M: $Share /persistent:yes | Out-Null
if (Test-Path 'M:\') {
    Write-Host 'Mapped M: -> Maxim inbox (drag folders there anytime).' -ForegroundColor Green
} else {
    Write-Host 'Could not map M: - check the network connection and password.' -ForegroundColor Red
}

# Keep scripts in a stable folder next to this setup file
$scriptDir = $PSScriptRoot
$ps1 = Join-Path $scriptDir 'UploadUsbToMaxim.ps1'
$bat = Join-Path $scriptDir 'Upload USB to Maxim.bat'

$desktop = [Environment]::GetFolderPath('Desktop')

# Desktop shortcut that launches PowerShell with the upload script
$lnkPath = Join-Path $desktop 'Upload USB to Maxim.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`""
$shortcut.WorkingDirectory = $scriptDir
$shortcut.WindowStyle = 1
$shortcut.Description = 'Upload a chosen USB project folder to Maxim'
$shortcut.Save()

Write-Host "Put 'Upload USB to Maxim' shortcut on the desktop." -ForegroundColor Green
Write-Host "  (runs: $ps1)" -ForegroundColor DarkGray

# Also leave the .bat as a backup next to the scripts
if (Test-Path $bat) {
    Write-Host 'BAT fallback is still available in the burner-laptop folder.' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host 'Done. Workflow from now on:' -ForegroundColor Cyan
Write-Host '  1. Plug in the USB key'
Write-Host '  2. Double-click "Upload USB to Maxim" on the desktop'
Write-Host '  3. Pick the project folder, wait for DONE, unplug'
Read-Host 'Press Enter to close'
