import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { getBlobBuffer, uploadBufferToBlob } from '../services/blobStorageService'
import { prisma } from './prisma'
import * as notificationService from '../services/notificationService'

export async function generateFinalSignedPdf(assignmentId: string): Promise<string> {
    const assignment = await prisma.formAssignment.findUnique({
        where: { id: assignmentId },
        include: {
            signatories: { orderBy: { order: 'asc' }, include: { user: true } },
            signableFormTemplate: true,
        },
    })
    if (!assignment) throw new Error('Assignment not found')

    // The signable template doesn't explicitly store a blobPath in our schema.
    // Assuming the template has a document or we generate a blank one.
    // For this demonstration, we'll assume we can create a PDF from scratch
    // or load an existing blank one.
    // Since our system relies on react-pdf and dynamic forms, we might need
    // to build a simple PDF containing the form data. Let's create a PDF document from scratch.

    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    let page = pdfDoc.addPage()
    const { width, height } = page.getSize()

    page.drawText(assignment.signableFormTemplate.name, { x: 50, y: height - 50, size: 20, font })
    page.drawText('Completed Sequential Signatures', { x: 50, y: height - 70, size: 14, font })

    let currentY = height - 100
    for (const sig of assignment.signatories) {
        if (sig.status !== 'signed') continue

        page.drawText(`Name: ${sig.signatoryName ?? sig.user.firstName + ' ' + sig.user.lastName}`, { x: 50, y: currentY, size: 12, font })
        page.drawText(`Date: ${sig.signedAt?.toLocaleDateString('en-CA')}`, { x: 50, y: currentY - 15, size: 10, font, color: rgb(0.4, 0.4, 0.4) })
        
        // If there's field data
        if (sig.fieldValues) {
             const fields = JSON.parse(JSON.stringify(sig.fieldValues))
             let fieldY = currentY - 30
             for (const [key, val] of Object.entries(fields)) {
                 page.drawText(`${key}: ${val}`, { x: 70, y: fieldY, size: 10, font })
                 fieldY -= 15
             }
             currentY = fieldY - 10
        } else {
             currentY -= 30
        }

        if (sig.signatureUrl) {
            try {
                // If it's a blob URL or base64
                // Assume fetchBlobAsBuffer works with our azure blobs.
                // Since `signatureUrl` in our previous implementation is often base64 string
                // we'll try to embed it.
                if (sig.signatureUrl.startsWith('data:image/png;base64,')) {
                    const b64 = sig.signatureUrl.replace('data:image/png;base64,', '')
                    const img = await pdfDoc.embedPng(Buffer.from(b64, 'base64'))
                    page.drawImage(img, { x: 50, y: currentY - 40, width: 100, height: 30 })
                }
            } catch (e) {
                console.error('Failed to embed signature image', e)
            }
        }
        currentY -= 60
        
        if (currentY < 100) {
            page = pdfDoc.addPage()
            currentY = page.getSize().height - 50
        }
    }

    const finalBytes = await pdfDoc.save()
    const outputPath = `documents/signed/${assignmentId}-final.pdf`
    const url = await uploadBufferToBlob(outputPath, Buffer.from(finalBytes), 'application/pdf')
    return url
}

export async function notifyNextSignatory(assignmentId: string): Promise<void> {
    const assignment = await prisma.formAssignment.findUnique({
        where: { id: assignmentId },
        include: {
            signatories: { orderBy: { order: 'asc' } },
            signableFormTemplate: true,
        },
    })
    if (!assignment) return

    const nextSignatory = assignment.signatories.find(s => s.status === 'pending')

    if (!nextSignatory) {
        // All workers have signed
        await routeBackToSupervisor(assignmentId)
        return
    }

    await prisma.formSignatory.update({
        where: { id: nextSignatory.id },
        data: { status: 'notified' }
    })

    await prisma.formAssignment.update({
        where: { id: assignmentId },
        data: {
            currentStep: nextSignatory.order - 1,
            chainStatus: 'in_progress',
            assignedToUserId: nextSignatory.userId, // Update assigned user to the current one
        },
    })

    await notificationService.createNotification({
        userId: nextSignatory.userId,
        title: 'Form requires your signature',
        body: `You have been asked to sign "${assignment.signableFormTemplate.name}". ${
            nextSignatory.order > 1 ? 'Previous workers have already signed.' : ''
        }`,
        type: 'info',
        linkTo: `/daily-forms/sign-sequential/${assignmentId}`,
        emailPreferenceKey: 'signature_required',
    }).catch(() => {})
}

export async function routeBackToSupervisor(assignmentId: string): Promise<void> {
    const assignment = await prisma.formAssignment.findUnique({
        where: { id: assignmentId },
        include: {
            signableFormTemplate: true,
            signatories: { include: { user: { select: { firstName: true, lastName: true } } } },
        },
    })
    if (!assignment) return

    const signatoryNames = assignment.signatories
        .filter(s => s.status === 'signed')
        .map(s => s.signatoryName ?? `${s.user.firstName} ${s.user.lastName}`)
        .join(', ')

    await notificationService.createNotification({
        userId: assignment.assignedById,
        title: 'All workers have signed',
        body: `"${assignment.signableFormTemplate.name}" has been signed by: ${signatoryNames}. You can now review and forward to HR.`,
        type: 'info',
        linkTo: `/library?view=submissions`, // point to submissions tab for review
        emailPreferenceKey: 'forms_pending',
    }).catch(() => {})
}
