# PDF Template Editor — Build Status (Step 1)

Completed on this machine:

## Environment check
- **Node:** v24.11.1 (>= 18 ✓)
- **Project layout:** `maxim-backend/`, `maxim-frontend/`, `package.json` at root ✓

## Step 1 — Done
1. **pdf-parse:** `npm install pdf-parse` and `npm install --save-dev @types/pdf-parse` in `maxim-backend` ✓
2. **Prisma schema:** Added to `prisma/schema.prisma`:
   - Enums: `FieldType` (TEXT, DATE, SIGNATURE, CHECKBOX, NUMBER), `SubmissionStatus` (DRAFT, SUBMITTED, APPROVED, AWAITING_SIGNATURES)
   - Models: `PdfTemplate`, `PdfField`, `PdfSubmission`
   - User relation: `pdfTemplatesCreated` / `"TemplateCreator"` on `User`
3. **Uploads folder:** `maxim-backend/uploads` created ✓
4. **Prisma generate:** `npm run db:generate` succeeded ✓

## What you need to do locally

1. **Create `maxim-backend/.env`** (not committed). Copy from `maxim-backend/.env.example` and set:
   - `DATABASE_URL` — your PostgreSQL connection string (e.g. `postgresql://USER:PASSWORD@localhost:5432/maxim_mech` or your Neon/cloud URL)
   - `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PORT`, `UPLOAD_DIR=uploads`, etc.

2. **Run the migration:**
   ```bash
   cd maxim-backend
   npm run db:migrate -- --name add_pdf_template_editor
   ```

3. **Optional:** If you use the Azure backend URL in frontend, ensure `maxim-frontend/.env` has `VITE_API_URL` pointing at your backend (e.g. `https://your-backend.canadaeast-01.azurewebsites.net` or `http://localhost:3000` for local).

---

**Note:** The instructions mentioned five models; the paste was cut off after `PdfTemplate`. Added: `PdfTemplate`, `PdfField`, `PdfSubmission`. If the backend dev had two more models (e.g. for file metadata or audit), they can add them in a follow-up migration.
