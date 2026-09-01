import dotenv from 'dotenv'
dotenv.config()
import { prisma } from '../src/lib/prisma'
import { getBlobBuffer } from '../src/services/blobStorageService'
import { deleteIncomingInvoice } from '../src/services/incomingInvoiceService'
import { classifyInvoiceImageAttachment, isImageAttachmentType } from '../src/lib/invoiceImageFilter'

/**
 * Cleans up bogus incoming invoices that were created from decorative images
 * (company logos / email-signature banners) before the image filter existed.
 *
 * Safe by default: prints a dry-run report and changes nothing. Pass --apply to
 * actually delete the flagged invoices (and their stored blobs).
 *
 * Only auto-ingested invoices whose attachments are ALL images are considered.
 * PDF invoices, manual invoices, and mixed PDF+image invoices are left alone,
 * so legitimate documents and user edits (paid status, job, notes) are never
 * touched.
 */

const APPLY = process.argv.includes('--apply')

async function main() {
    const invoices = await prisma.incomingInvoice.findMany({
        where: { NOT: { gmailMessageId: { startsWith: 'manual:' } } },
        include: { attachments: { orderBy: { attachmentIndex: 'asc' } } },
        orderBy: { receivedAt: 'desc' },
    })

    let scanned = 0
    let flagged = 0
    let deleted = 0
    let unverifiable = 0
    let keptHasData = 0

    for (const invoice of invoices) {
        if (invoice.attachments.length === 0) continue

        const imageAttachments = invoice.attachments.filter((a) =>
            isImageAttachmentType(a.mimeType ?? undefined, a.originalName),
        )
        // Only image-only invoices can be logo artifacts. Skip anything with a PDF.
        if (imageAttachments.length === 0) continue
        if (imageAttachments.length !== invoice.attachments.length) continue

        scanned += 1

        let allLogos = true
        let couldVerify = true
        const reasons: string[] = []

        for (const att of imageAttachments) {
            let buffer: Buffer | null = null
            try {
                buffer = await getBlobBuffer(att.filePath)
            } catch {
                buffer = null
            }
            if (!buffer) {
                // Can't read the file — be conservative and keep the invoice.
                couldVerify = false
                break
            }
            const decision = classifyInvoiceImageAttachment({ buffer, ocrText: att.ocrText })
            reasons.push(`${att.originalName}:${decision.reason}`)
            if (decision.isLikelyInvoice) {
                allLogos = false
                break
            }
        }

        if (!couldVerify) {
            unverifiable += 1
            console.log(`[skip:unverifiable] ${invoice.id} "${invoice.emailSubject ?? ''}" (blob unreadable)`)
            continue
        }
        if (!allLogos) continue

        // Final safety net: never delete a row that carries real document data.
        // If any financial field was extracted, treat it as a genuine
        // invoice/statement/receipt and keep it regardless of the image check.
        const hasFinancialData = Boolean(
            invoice.totalAmount != null ||
            invoice.subtotal != null ||
            invoice.taxAmount != null ||
            (invoice.vendorName && invoice.vendorName.trim()) ||
            (invoice.invoiceNumber && invoice.invoiceNumber.trim()) ||
            (invoice.poNumber && invoice.poNumber.trim()),
        )
        if (hasFinancialData) {
            keptHasData += 1
            console.log(
                `[keep:has-data] ${invoice.id} subject="${invoice.emailSubject ?? ''}" ` +
                `vendor=${invoice.vendorName ?? '—'} total=${invoice.totalAmount ?? '—'} ` +
                `invoice#=${invoice.invoiceNumber ?? '—'} po=${invoice.poNumber ?? '—'} (looks like a real document — not deleting)`,
            )
            continue
        }

        flagged += 1
        console.log(
            `[logo-invoice] ${invoice.id} subject="${invoice.emailSubject ?? ''}" ` +
            `vendor=${invoice.vendorName ?? '—'} total=${invoice.totalAmount ?? '—'} ` +
            `type=${invoice.documentType} reasons=${reasons.join(', ')}`,
        )

        if (APPLY) {
            await deleteIncomingInvoice(invoice.id)
            deleted += 1
        }
    }

    console.log('------------------------------------------------------------')
    console.log(`image-only invoices scanned : ${scanned}`)
    console.log(`kept (had real data)        : ${keptHasData}`)
    console.log(`flagged as logo/non-invoice : ${flagged}`)
    console.log(`skipped (unverifiable blob) : ${unverifiable}`)
    console.log(APPLY
        ? `deleted                     : ${deleted}`
        : 'DRY RUN — nothing changed. Re-run with --apply to delete the flagged rows.')
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
