import { prisma } from '../src/lib/prisma'
import { guessDocumentTypeFromText } from '../src/services/incomingInvoiceDocumentResolver'
import { applyReceiptLinking } from '../src/services/incomingInvoiceReceiptLink'

async function main() {
    const invoices = await prisma.incomingInvoice.findMany({
        include: { attachments: { orderBy: { attachmentIndex: 'asc' } } },
        orderBy: { receivedAt: 'desc' },
    })

    for (const invoice of invoices) {
        const text = invoice.attachments.map((attachment) => attachment.ocrText || '').join('\n')
        const documentType = guessDocumentTypeFromText(text, {
            subject: invoice.emailSubject || '',
            filename: invoice.attachments[0]?.originalName,
        })

        const receiptLink = documentType === 'RECEIPT'
            ? await applyReceiptLinking({
                documentType,
                vendorName: invoice.vendorName,
                invoiceNumber: invoice.invoiceNumber,
                totalAmount: invoice.totalAmount != null ? Number(invoice.totalAmount) : null,
            })
            : { relatedInvoiceId: invoice.relatedInvoiceId, markPaid: false }

        await prisma.incomingInvoice.update({
            where: { id: invoice.id },
            data: {
                documentType,
                relatedInvoiceId: receiptLink.relatedInvoiceId ?? invoice.relatedInvoiceId,
                paidAt: documentType === 'RECEIPT'
                    ? (invoice.paidAt ?? new Date())
                    : invoice.paidAt,
            },
        })

        console.log(
            `${invoice.vendorName || invoice.emailSubject || invoice.id}: ${invoice.documentType} -> ${documentType}`,
        )
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
