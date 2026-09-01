# High-quality CAD viewing (DWG / DXF / RVT / …)

Maxim uses **Autodesk Platform Services (APS) Viewer** — the same engine behind Autodesk Construction Cloud — for accurate layers, pan/zoom, measure, and model structure.

## One-time setup

1. Create an app at [aps.autodesk.com/myapps](https://aps.autodesk.com/myapps) (type: **Traditional Web App** / Server).
2. Note **Client ID** and **Client Secret**.
3. On Azure App Service (Maxim backend), set:

| Variable | Value |
|---|---|
| `APS_CLIENT_ID` | your client id |
| `APS_CLIENT_SECRET` | your client secret |
| `APS_BUCKET_KEY` | optional; defaults to a unique key derived from the client id |

4. Redeploy / restart the API so Prisma migration `20260713000000_cad_derivative` applies (creates the `CadDerivative` cache table).

## How it works

1. User opens a `.dwg` (etc.) from **Local Archive** on maximmech.com.
2. Backend pulls the file from the GX10, uploads it to APS Object Storage, and starts an **SVF2** Model Derivative job.
3. Frontend polls until translation succeeds, then loads the Autodesk Viewer with a short-lived `viewables:read` token.
4. Repeat opens are fast — results are cached by document id + content hash in `CadDerivative`.

## Privacy note

Drawing bytes are sent to Autodesk’s cloud for translation (required for Viewer-quality fidelity). Files remain on the GX10 as the source of truth; APS holds a derivative for viewing.

## Supported extensions

`.dwg` `.dxf` `.dwf` `.dwfx` `.rvt` `.rfa` `.rte` `.nwd` `.nwc` `.ifc` `.step` `.stp` `.iges` `.igs` `.f3d` `.fbx` `.obj` `.stl`
