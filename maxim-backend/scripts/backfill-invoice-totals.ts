import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { rescanIncomingInvoiceFromPdf } from '../src/services/incomingInvoiceService'

async function main() {
    const invoices = await prisma.incomingInvoice.findMany({
        where: { totalAmount: null },
        select: { id: true, vendorName: true, invoiceNumber: true },
        orderBy: { createdAt: 'asc' },
    })
    console.log(`Backfilling ${invoices.length} invoice(s) with missing totals…`)
    for (const invoice of invoices) {
        try {
            const updated = await rescanIncomingInvoiceFromPdf(invoice.id)
            console.log(
                `✓ ${invoice.vendorName || invoice.invoiceNumber || invoice.id}: total=${updated.totalAmount ?? '—'}`,
            )
        } catch (error) {
            console.error(`✗ ${invoice.id}:`, error instanceof Error ? error.message : error)
        }
    }
}

main().finally(() => prisma.$disconnect())
