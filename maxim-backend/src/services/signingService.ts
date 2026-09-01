import { prisma } from '../lib/prisma'

export async function listSignatureRequests(userId: string, userRole: string) {
    const all = await prisma.signatureRequest.findMany({
        where: { status: { in: ['pending', 'completed'] } },
        orderBy: { dueDate: 'asc' },
    })
    const forUser = all.filter((r) => {
        const signers = (r.requiredSigners as any[]) || []
        return signers.some((s: any) => s.userId === userId)
    })
    if (userRole === 'labourer') {
        return forUser.map(toSigningResponse)
    }
    return all.map(toSigningResponse)
}

function toSigningResponse(r: any) {
    return {
        id: r.id,
        documentName: r.documentName,
        dueDate: r.dueDate,
        remindersSent: r.remindersSent,
        requiredSigners: r.requiredSigners || [],
        status: r.status,
    }
}

export async function getSignatureRequestById(id: string, userId: string, userRole: string) {
    const r = await prisma.signatureRequest.findUnique({ where: { id } })
    if (!r) throw { status: 404, message: 'Signature request not found' }
    const signers = (r.requiredSigners as any[]) || []
    const isSigner = signers.some((s: any) => s.userId === userId)
    if (!isSigner && userRole !== 'owner' && userRole !== 'hr') throw { status: 403, message: 'Forbidden' }
    return toSigningResponse(r)
}

export async function signRequest(id: string, userId: string, userName: string) {
    const r = await prisma.signatureRequest.findUnique({ where: { id } })
    if (!r) throw { status: 404, message: 'Signature request not found' }
    const signers = (r.requiredSigners as any[]) || []
    const mySigner = signers.find((s: any) => s.userId === userId)
    if (!mySigner) throw { status: 403, message: 'You are not a required signer' }
    if (mySigner.status === 'signed') throw { status: 400, message: 'Already signed' }

    const updated = signers.map((s: any) =>
        s.userId === userId ? { ...s, status: 'signed', signedAt: new Date().toISOString() } : s
    )
    const allSigned = updated.every((s: any) => s.status === 'signed')
    await prisma.signatureRequest.update({
        where: { id },
        data: { requiredSigners: updated as any, status: allSigned ? 'completed' : 'pending' },
    })
    return { message: 'Signature recorded', allSigned }
}
