# GX10 Local RAG

Self-contained local document store + embedding + retrieval stack for the ASUS GX10
("Ascent" / DGX Spark). Runs entirely in Docker. Frank (the Maxim backend on Azure)
queries it over a Cloudflare Tunnel via the `search_local_documents` tool.

```
USB → burner desktop app (or .bat SMB fallback) → GX10 inbox
                                              → Ollama embed + pgvector
Maxim / Frank / Project Document Directory ← Cloudflare tunnel ← GX10 API
```

## Setup on the GX10 (one time)

1. Copy this folder to the box:

   ```bash
   scp -r gx10-local-rag maximmech@192.168.1.198:~/
   ```

2. Create the data directory and env file:

   ```bash
   ssh maximmech@192.168.1.198
   sudo mkdir -p /srv/local-rag/inbox && sudo chown -R $USER /srv/local-rag
   cd ~/gx10-local-rag
   cp .env.example .env
   openssl rand -hex 32   # use as GX10_API_KEY
   nano .env              # fill in POSTGRES_PASSWORD, GX10_API_KEY, SAMBA_PASSWORD, CLOUDFLARE_TUNNEL_TOKEN
   ```

3. Create the Cloudflare Tunnel (dash.cloudflare.com → Zero Trust → Networks →
   Tunnels → Create): name it `gx10`, choose Docker, copy the token into `.env`,
   and add a public hostname (e.g. `gx10.maximmech.com`) pointing at
   `http://api:8080`.

4. Start everything:

   ```bash
   docker compose up -d --build
   docker compose logs -f api   # first boot pulls the bge-m3 model (~1.2GB)
   ```

5. Keep the stack (and Cloudflare tunnel) up **24/7** across reboots and drops:

   ```bash
   cd ~/gx10-local-rag
   chmod +x scripts/install-24x7.sh
   ./scripts/install-24x7.sh
   ```

   That enables Docker on boot, starts `api` + `cloudflared` via systemd, and runs a
   watchdog every 5 minutes that restarts the tunnel if `https://gx10.maximmech.com/health`
   fails. Employees on maximmech.com keep seeing Local Archive without anyone SSHing in.

   Check anytime:

   ```bash
   docker compose ps
   curl -s https://gx10.maximmech.com/health
   systemctl list-timers | grep gx10
   tail -20 ~/gx10-local-rag/watchdog.log
   ```

   Cloudflare dashboard → Zero Trust → Tunnels → `gx10` should stay **Healthy**.
   Leave the GX10 powered on and plugged into office network / UPS if you have one.

5. Verify:

   ```bash
   curl http://localhost:8080/health
   curl https://gx10.maximmech.com/health   # through the tunnel
   ```

## Ingesting documents

Drop files **or entire folders** into the inbox — folder structure is preserved:

- The **top-level folder name becomes the project** (e.g. drop `ONTC Station/` and
  every file inside is tagged project "ONTC Station"; Frank can filter searches by it).
- Nested folders (drawings, specs, RFIs, ...) are kept as the folder path.
- Searchable types (`.pdf` with text layer, `.docx`, `.txt`, `.md`) are chunked and
  embedded. **Everything else is still archived** (downloadable, not searchable),
  so whole project folders can be dropped as-is.
- Duplicates (same content, same project) are skipped. OS junk (`Thumbs.db`,
  `System Volume Information`, ...) is cleaned up automatically.
- Scanned image-only PDFs are archived but fail indexing with a clear error in
  `/documents` — OCR is a follow-up (PaddleOCR or Azure Document Intelligence).

Ways to get files in:

- **Burner desktop app (recommended):** see `desktop/README.md` — USB detect, progress, library, PDF viewer.
- **PowerShell fallback:** see `burner-laptop/README.md` — `Upload USB to Maxim.bat` → SMB inbox.
- **LAN browser:** `http://192.168.1.198:8080` with `UPLOAD_PASSCODE`.
- **Directly on the GX10:** `cp -r /media/$USER/<drive>/* /srv/local-rag/inbox/`.

## API

All endpoints except `/`, `/health` require `X-API-Key` (uploads also accept `X-Upload-Code`).

| Endpoint | Purpose |
|---|---|
| `GET /health` | doc/chunk/project counts |
| `POST /search` `{query, limit, project?}` | semantic search |
| `GET /tree` | nested project → folders → files |
| `GET /documents` | flat list |
| `GET /documents/{id}/file` | raw bytes |
| `DELETE /documents/{id}` | delete one file + index |
| `DELETE /projects/{name}` | delete entire project |
| `POST /upload` | multipart into inbox (`project`, `relpath`) |
| `GET /projects` | per-project counts |

## Maxim backend (Azure)

| Var | Value |
|---|---|
| `GX10_API_URL` | `https://gx10.maximmech.com` |
| `GX10_API_KEY` | same as GX10 `.env` |

On maximmech.com: **Project Document Directory → Current/Past Projects → Local Archive**, plus **Local Archive (Unlinked)** for unmatched USB project names. Frank uses `search_local_documents`.

## Notes

- Embedding model is `bge-m3` (1024-dim) via Ollama with GPU. To change models,
  update `EMBED_MODEL`/`EMBED_DIMENSIONS` in `.env` **and** the `vector(1024)`
  columns in `schema.sql`, then re-ingest (existing vectors are incompatible
  across models).
- The vector DB is local Postgres (pgvector), separate from Neon. Nothing here
  touches the existing cloud pipeline (Voyage + Neon `DocumentChunk`).
- Chunking parameters intentionally mirror `documentIngestionService.ts`
  (400 words, 50 overlap) so retrieval behaves consistently across both stores.
