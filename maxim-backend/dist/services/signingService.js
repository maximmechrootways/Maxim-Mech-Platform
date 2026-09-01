"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSignatureRequests = listSignatureRequests;
exports.getSignatureRequestById = getSignatureRequestById;
exports.signRequest = signRequest;
const prisma_1 = require("../lib/prisma");
async function listSignatureRequests(userId, userRole) {
    const all = await prisma_1.prisma.signatureRequest.findMany({
        where: { status: { in: ['pending', 'completed'] } },
        orderBy: { dueDate: 'asc' },
    });
    const forUser = all.filter((r) => {
        const signers = r.requiredSigners || [];
        return signers.some((s) => s.userId === userId);
    });
    if (userRole === 'labourer') {
        return forUser.map(toSigningResponse);
    }
    return all.map(toSigningResponse);
}
function toSigningResponse(r) {
    return {
        id: r.id,
        documentName: r.documentName,
        dueDate: r.dueDate,
        remindersSent: r.remindersSent,
        requiredSigners: r.requiredSigners || [],
        status: r.status,
    };
}
async function getSignatureRequestById(id, userId, userRole) {
    const r = await prisma_1.prisma.signatureRequest.findUnique({ where: { id } });
    if (!r)
        throw { status: 404, message: 'Signature request not found' };
    const signers = r.requiredSigners || [];
    const isSigner = signers.some((s) => s.userId === userId);
    if (!isSigner && userRole !== 'owner' && userRole !== 'hr')
        throw { status: 403, message: 'Forbidden' };
    return toSigningResponse(r);
}
async function signRequest(id, userId, userName) {
    const r = await prisma_1.prisma.signatureRequest.findUnique({ where: { id } });
    if (!r)
        throw { status: 404, message: 'Signature request not found' };
    const signers = r.requiredSigners || [];
    const mySigner = signers.find((s) => s.userId === userId);
    if (!mySigner)
        throw { status: 403, message: 'You are not a required signer' };
    if (mySigner.status === 'signed')
        throw { status: 400, message: 'Already signed' };
    const updated = signers.map((s) => s.userId === userId ? { ...s, status: 'signed', signedAt: new Date().toISOString() } : s);
    const allSigned = updated.every((s) => s.status === 'signed');
    await prisma_1.prisma.signatureRequest.update({
        where: { id },
        data: { requiredSigners: updated, status: allSigned ? 'completed' : 'pending' },
    });
    return { message: 'Signature recorded', allSigned };
}
