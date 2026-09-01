"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findMatchingInvoiceForReceipt = findMatchingInvoiceForReceipt;
exports.applyReceiptLinking = applyReceiptLinking;
const prisma_1 = require("../lib/prisma");
async function findMatchingInvoiceForReceipt(input) {
    const invoiceNumber = input.invoiceNumber?.trim();
    if (!invoiceNumber)
        return null;
    const vendorName = input.vendorName?.trim();
    const candidates = await prisma_1.prisma.incomingInvoice.findMany({
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
    });
    if (!candidates.length)
        return null;
    if (input.totalAmount == null || candidates.length === 1)
        return candidates[0].id;
    const target = input.totalAmount;
    const withAmount = candidates.find((row) => {
        if (row.totalAmount == null)
            return false;
        return Math.abs(Number(row.totalAmount) - target) < 0.02;
    });
    return (withAmount ?? candidates[0]).id;
}
async function applyReceiptLinking(input) {
    if (input.documentType !== 'RECEIPT') {
        return { relatedInvoiceId: null, markPaid: false };
    }
    const relatedInvoiceId = await findMatchingInvoiceForReceipt(input);
    if (!relatedInvoiceId) {
        return { relatedInvoiceId: null, markPaid: false };
    }
    await prisma_1.prisma.incomingInvoice.update({
        where: { id: relatedInvoiceId },
        data: { paidAt: new Date() },
    });
    return { relatedInvoiceId, markPaid: true };
}
