import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { rescanIncomingInvoiceFromPdf } from '../src/services/incomingInvoiceService'

async function main() {
    const invoices = await prisma.incomingInvoice.findMany({
        select: { id: true, vendorName: true, invoiceNumber: true },
        orderBy: { createdAt: 'asc' },
    })
    for (const invoice of invoices) {
        const updated = await rescanIncomingInvoiceFromPdf(invoice.id)
        console.log(
            `${invoice.vendorName || invoice.invoiceNumber || invoice.id}: subtotal=${updated.subtotal} tax=${updated.taxAmount} total=${updated.totalAmount}`,
        )
    }
}

main().finally(() => prisma.$disconnect())
