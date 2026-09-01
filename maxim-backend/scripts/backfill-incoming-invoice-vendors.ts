import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { guessVendorFromPdfText } from '../src/lib/invoicePdfText'
import { guessVendorFromEmailMetadata } from '../src/services/incomingInvoiceDocumentResolver'

async function main() {
    const rows = await prisma.incomingInvoice.findMany({
        where: { OR: [{ vendorName: null }, { vendorName: '' }] },
        include: { attachments: { orderBy: { attachmentIndex: 'asc' } } },
    })

    let updated = 0
    for (const row of rows) {
        const ocrText = row.attachments.map((attachment) => attachment.ocrText || '').join('\n')
        const vendor = guessVendorFromEmailMetadata(row.emailFrom || '', row.emailBodyText || '')
            || guessVendorFromPdfText(ocrText, {
                from: row.emailFrom || '',
                subject: row.emailSubject || '',
                bodyText: row.emailBodyText || '',
            })
        if (!vendor) {
            console.log('skip', row.id, row.emailSubject)
            continue
        }
        await prisma.incomingInvoice.update({
            where: { id: row.id },
            data: { vendorName: vendor },
        })
        console.log('updated', row.emailSubject, '->', vendor)
        updated += 1
    }
    console.log(`Done. Updated ${updated} of ${rows.length} rows.`)
}

main()
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
