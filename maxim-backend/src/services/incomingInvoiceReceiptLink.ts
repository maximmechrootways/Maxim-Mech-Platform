import { prisma } from '../lib/prisma'
import type { FinanceDocumentType } from './incomingInvoiceAiService'

export async function findMatchingInvoiceForReceipt(input: {
    vendorName?: string | null
    invoiceNumber?: string | null
    totalAmount?: number | null
}): Promise<string | null> {
    const invoiceNumber = input.invoiceNumber?.trim()
    if (!invoiceNumber) return null

    const vendorName = input.vendorName?.trim()
    const candidates = await prisma.incomingInvoice.findMany({
        where: {
            documentType: 'INVOICE',
            invoiceNumber: { equals: invoiceNumber, mode: 'insensitive' },
            ...(vendorName
                ? { vendorName: { contains: vendorName.slice(0, 24), mode: 'insensitive' } }
                : {}),
        },
        orderBy: { receivedAt: 'desc' },
        take: 5,
        select: { id: true, totalAmount: true },
    })

    if (!candidates.length) return null
    if (input.totalAmount == null || candidates.length === 1) return candidates[0].id

    const target = input.totalAmount
    const withAmount = candidates.find((row) => {
        if (row.totalAmount == null) return false
        return Math.abs(Number(row.totalAmount) - target) < 0.02
    })
    return (withAmount ?? candidates[0]).id
}

export async function applyReceiptLinking(input: {
    documentType: FinanceDocumentType
    vendorName?: string | null
    invoiceNumber?: string | null
    totalAmount?: number | null
}): Promise<{ relatedInvoiceId: string | null; markPaid: boolean }> {
    if (input.documentType !== 'RECEIPT') {
        return { relatedInvoiceId: null, markPaid: false }
    }

    const relatedInvoiceId = await findMatchingInvoiceForReceipt(input)
    if (!relatedInvoiceId) {
        return { relatedInvoiceId: null, markPaid: false }
    }

    await prisma.incomingInvoice.update({
        where: { id: relatedInvoiceId },
        data: { paidAt: new Date() },
    })

    return { relatedInvoiceId, markPaid: true }
}
