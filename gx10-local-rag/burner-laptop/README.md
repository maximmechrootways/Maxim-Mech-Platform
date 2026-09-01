# Burner laptop setup (USB → Maxim)

Two ways to get files onto the GX10. Prefer the desktop app; keep this PowerShell kit as fallback.

## Primary: Maxim Local Archive Studio (desktop app)

See [`../desktop/README.md`](../desktop/README.md). Portable EXE with drag-drop intake, project destination picker, and a 3D archive globe.

## Fallback: PowerShell + SMB (this folder)

### One-time setup

1. Copy this `burner-laptop` folder onto the laptop (anywhere, e.g. `C:\Maxim\burner-laptop`).
2. Right-click `Setup-BurnerLaptop.ps1` → **Run with PowerShell**.
3. Enter the inbox password when prompted (the `SAMBA_PASSWORD` from the GX10's `.env`).

That stores the credentials (no future password prompts), maps the inbox as
drive **M:** in File Explorer, and puts **"Upload USB to Maxim"** on the desktop
(a shortcut that runs the PowerShell upload script).

Already set up and only need the desktop icon? Right-click `Make-DesktopShortcut.ps1` → **Run with PowerShell**.

**Note:** Do not double-click the `.ps1` file itself — Windows opens it in Notepad. Use the Desktop shortcut (or the `.bat`).

### Daily use

1. Plug the USB key into the laptop
2. Double-click **Upload USB to Maxim** on the desktop
3. Pick the **project folder** from the list (e.g. `VIA RAIL ONTC`) — it does **not** copy the whole USB
4. Wait until the window says **DONE**, then unplug

Files are indexed automatically on the server — ask Frank about them a few minutes later, or open **Project Document Directory → Local Archive** on maximmech.com.

### Tips for organized projects

- Put files inside a folder named after the job **on the USB key** (e.g.
  `ONTC Station/drawings/...`). The folder name becomes the project in Maxim.
- Re-running the upload is safe: files that already made it over are skipped (SHA-256).
- Power users can also drag folders onto drive **M:** in File Explorer.

### Troubleshooting

- **"CANNOT REACH THE MAXIM SERVER"** — laptop isn't on the office network.
- **"NO USB DRIVE FOUND"** — wait a few seconds after plugging in, then retry.
- **Password changed on the GX10** — re-run `Setup-BurnerLaptop.ps1`.
