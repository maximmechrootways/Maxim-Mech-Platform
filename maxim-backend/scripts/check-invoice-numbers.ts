import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { getIncomingInvoiceAttachmentBuffer } from '../src/services/incomingInvoiceService'
import { extractInvoicePdfText } from '../src/lib/invoicePdfText'

async function main() {
    const invoices = await prisma.incomingInvoice.findMany({
        include: { attachments: { take: 1 } },
        orderBy: { receivedAt: 'desc' },
    })
    for (const inv of invoices) {
        const att = inv.attachments[0]
        const text = att
            ? await extractInvoicePdfText((await getIncomingInvoiceAttachmentBuffer(inv.id, att.id)).buffer)
            : ''
        console.log('\n---', inv.vendorName, '---')
        console.log('DB invoice#:', inv.invoiceNumber)
        console.log('subject:', inv.emailSubject)
        console.log('sample:', text.slice(0, 400))
    }
}

main().finally(() => prisma.$disconnect())
