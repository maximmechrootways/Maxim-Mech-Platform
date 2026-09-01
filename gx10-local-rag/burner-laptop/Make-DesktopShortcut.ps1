# Creates a Desktop shortcut that double-click runs UploadUsbToMaxim.ps1 via PowerShell.
$scriptDir = $PSScriptRoot
$ps1 = Join-Path $scriptDir 'UploadUsbToMaxim.ps1'
if (-not (Test-Path $ps1)) {
    Write-Host "Missing UploadUsbToMaxim.ps1 next to this file." -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Upload USB to Maxim.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`""
$shortcut.WorkingDirectory = $scriptDir
$shortcut.WindowStyle = 1
$shortcut.Description = 'Upload a chosen USB project folder to Maxim'
$shortcut.Save()
Write-Host "Created: $lnkPath" -ForegroundColor Green
Write-Host 'Double-click that shortcut (not the .ps1 file) to upload.' -ForegroundColor Cyan
Read-Host 'Press Enter to close'
