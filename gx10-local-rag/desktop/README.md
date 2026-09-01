# Maxim Local Archive Studio

Windows Electron app for the burner laptop: drag USB/folders into a chosen GX10
project, watch progress, and explore the archive as a live **3D globe**.

## Setup once (dev machine)

```bash
cd gx10-local-rag/desktop
npm install
npm run dev
```

Open **Settings**, set:

- GX10 URL: `http://192.168.1.198:8080` (or current LAN IP)
- API key: same as `GX10_API_KEY` on the GX10 `.env`

## Build portable EXE for the burner

```bash
npm run pack
```

Output: `dist-installer/Maxim-Local-Archive-1.1.0.exe` — copy to the burner Desktop.

## How the crew uses it

1. Plug in the USB (same Wi‑Fi/LAN as the GX10).
2. Open **Maxim Local Archive**.
3. **Studio** (left): pick or create a **destination project**, optional subfolder.
4. Drag a folder onto the drop zone, or **List folders** on the USB and pick one.
5. Click **Send to Maxim**.
6. **Archive globe** (right): orbit/zoom; click a project/folder to set destination; click a file to open **Viewer**.

Top-level GX10 project names that match a Maxim job/site appear under Project Document Directory on maximmech.com.

## PowerShell fallback

See `../burner-laptop/` if the EXE is not installed — SMB + folder picker script.
