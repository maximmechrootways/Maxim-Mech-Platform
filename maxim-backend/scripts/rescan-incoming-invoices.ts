import { prisma } from '../src/lib/prisma'
import { rescanIncomingInvoiceFromPdf } from '../src/services/incomingInvoiceService'

async function main() {
    const invoices = await prisma.incomingInvoice.findMany({
        select: { id: true, vendorName: true, invoiceNumber: true },
        orderBy: { receivedAt: 'desc' },
    })
    for (const invoice of invoices) {
        try {
            const updated = await rescanIncomingInvoiceFromPdf(invoice.id)
            console.log(
                `${invoice.vendorName ?? 'Unknown'}: ${invoice.invoiceNumber ?? '—'} -> ${updated.invoiceNumber ?? '—'}`,
            )
        } catch (error) {
            console.error(`Failed ${invoice.id}:`, error instanceof Error ? error.message : error)
        }
    }
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
