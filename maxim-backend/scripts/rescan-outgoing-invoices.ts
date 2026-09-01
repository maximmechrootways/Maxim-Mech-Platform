import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { rescanOutgoingInvoiceFromPdf } from '../src/services/outgoingInvoiceService'

async function main() {
    const invoices = await prisma.outgoingInvoice.findMany({
        select: { id: true, customerName: true, invoiceNumber: true, orderNumber: true, dueDate: true },
        orderBy: { createdAt: 'asc' },
    })
    for (const invoice of invoices) {
        const updated = await rescanOutgoingInvoiceFromPdf(invoice.id)
        console.log(
            `${updated.customerName || invoice.customerName || updated.invoiceNumber || invoice.id}: `
            + `order=${updated.orderNumber || '—'} due=${updated.dueDate?.slice(0, 10) || '—'}`,
        )
    }
}

main().finally(() => prisma.$disconnect())
