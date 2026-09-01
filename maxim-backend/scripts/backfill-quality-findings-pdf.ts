/**
 * Backfill SubmissionQualityFinding rows for existing non-draft PDF submissions.
 * Run: npx ts-node -r dotenv/config scripts/backfill-quality-findings-pdf.ts
 */
import { prisma } from '../src/lib/prisma'
import { recomputePdfSubmissionFindings } from '../src/services/qualityFindings/recomputePdfSubmissionFindings'

const BATCH = 25
const DELAY_MS = 50

async function main() {
  const ids = await prisma.pdfSubmission.findMany({
    where: { status: { in: ['SUBMITTED', 'APPROVED', 'AWAITING_SIGNATURES', 'RESUBMIT_REQUIRED'] } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`[backfill-quality-findings] ${ids.length} submissions`)
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    await Promise.all(
      chunk.map(async ({ id }) => {
        try {
          await recomputePdfSubmissionFindings(id)
        } catch (e) {
          console.error(`[backfill-quality-findings] failed ${id}`, e)
        }
      })
    )
    if (i + BATCH < ids.length && DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, DELAY_MS))
    }
  }
  console.log('[backfill-quality-findings] done')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
