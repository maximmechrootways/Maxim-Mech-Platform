import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import {
    bootstrapOutgoingInvoiceIntegration,
    getOutgoingInvoicePipelineStatus,
    pollSentOutgoingInvoiceEmails,
    processOutgoingInvoiceQueue,
} from '../services/outgoingInvoiceIngestionService'
import {
    deleteOutgoingInvoice,
    getOutgoingInvoiceAttachmentBuffer,
    getOutgoingInvoiceAttachmentDownloadUrl,
    getOutgoingInvoiceDetail,
    listOutgoingInvoices,
    rescanOutgoingInvoiceFromPdf,
    summaryOutgoingInvoices,
    updateOutgoingInvoice,
} from '../services/outgoingInvoiceService'

const router = Router()
router.use(authenticate)

function requireOwnerOrHr(role: string | undefined) {
    return role === 'owner' || role === 'hr'
}

router.get('/summary', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can view outgoing invoices' })
        }
        res.json(await summaryOutgoingInvoices())
    } catch (e) {
        next(e)
    }
})

router.get('/admin/status', async (req, res, next) => {
    try {
        if (req.user?.role !== 'owner') {
            return res.status(403).json({ error: 'Only Owner can view invoice pipeline status' })
        }
        res.json(await getOutgoingInvoicePipelineStatus())
    } catch (e) {
        next(e)
    }
})

router.post('/admin/setup-trigger', async (req, res, next) => {
    try {
        if (req.user?.role !== 'owner') {
            return res.status(403).json({ error: 'Only Owner can bootstrap outgoing invoice integration' })
        }
        res.json(await bootstrapOutgoingInvoiceIntegration())
    } catch (e) {
        next(e)
    }
})

router.post('/admin/sync', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can sync outgoing invoices' })
        }
        const poll = await pollSentOutgoingInvoiceEmails()
        const processed = await processOutgoingInvoiceQueue(10)
        const status = await getOutgoingInvoicePipelineStatus()
        res.json({ ...poll, ...processed, status })
    } catch (e) {
        next(e)
    }
})

router.patch('/:id', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can edit outgoing invoices' })
        }
        const body = req.body as Record<string, unknown>
        const num = (key: string) => {
            const raw = body[key]
            if (raw == null || raw === '') return null
            const value = Number(raw)
            return Number.isFinite(value) ? value : null
        }
        const str = (key: string) => {
            const raw = body[key]
            return raw == null ? undefined : String(raw)
        }
        res.json(await updateOutgoingInvoice(req.params.id, {
            customerName: str('customerName'),
            invoiceNumber: str('invoiceNumber'),
            invoiceDate: str('invoiceDate'),
            dueDate: str('dueDate'),
            subtotal: body.subtotal !== undefined ? num('subtotal') : undefined,
            taxAmount: body.taxAmount !== undefined ? num('taxAmount') : undefined,
            totalAmount: body.totalAmount !== undefined ? num('totalAmount') : undefined,
            paidAmount: body.paidAmount !== undefined ? num('paidAmount') : undefined,
            currency: str('currency'),
            orderNumber: str('orderNumber'),
            supplierNumber: str('supplierNumber'),
            projectName: str('projectName'),
            jobId: body.jobId === null || body.jobId === '' ? null : str('jobId'),
            paid: body.paid === true ? true : body.paid === false ? false : undefined,
            reviewed: body.reviewed === true ? true : body.reviewed === false ? false : undefined,
            reviewedById: req.user?.id ?? null,
            paymentTerms: str('paymentTerms'),
            notes: str('notes'),
        }))
    } catch (e: any) {
        if (e?.status === 404) return res.status(404).json({ error: e.message })
        if (e?.status === 400) return res.status(400).json({ error: e.message })
        next(e)
    }
})

router.post('/:id/rescan', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can rescan outgoing invoices' })
        }
        res.json(await rescanOutgoingInvoiceFromPdf(req.params.id))
    } catch (e: any) {
        if (e?.status === 404) return res.status(404).json({ error: e.message })
        if (e?.status === 400) return res.status(400).json({ error: e.message })
        next(e)
    }
})

router.delete('/:id', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can delete outgoing invoices' })
        }
        res.json(await deleteOutgoingInvoice(req.params.id))
    } catch (e: any) {
        if (e?.status === 404) return res.status(404).json({ error: e.message })
        next(e)
    }
})

router.get('/:id/attachments/:attachmentId/file', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can view invoice attachments' })
        }
        const { buffer, originalName, mimeType } = await getOutgoingInvoiceAttachmentBuffer(
            req.params.id,
            req.params.attachmentId,
        )
        res.setHeader('Content-Type', mimeType)
        res.setHeader('Content-Disposition', `inline; filename="${originalName.replace(/"/g, '')}"`)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.send(buffer)
    } catch (e: any) {
        if (e?.status === 404) return res.status(404).json({ error: e.message })
        next(e)
    }
})

router.get('/:id/attachments/:attachmentId/download', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can download invoice attachments' })
        }
        const result = await getOutgoingInvoiceAttachmentDownloadUrl(req.params.id, req.params.attachmentId)
        res.json(result)
    } catch (e: any) {
        if (e?.status === 404) return res.status(404).json({ error: e.message })
        next(e)
    }
})

router.get('/:id', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can view outgoing invoices' })
        }
        res.json(await getOutgoingInvoiceDetail(req.params.id))
    } catch (e: any) {
        if (e?.status === 404) return res.status(404).json({ error: e.message })
        next(e)
    }
})

router.get('/', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can view outgoing invoices' })
        }
        const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined
        const customer = typeof req.query.customer === 'string' ? req.query.customer.trim() : undefined
        const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined
        const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined
        const status = typeof req.query.status === 'string' ? req.query.status : undefined
        const reviewed = typeof req.query.reviewed === 'string' ? req.query.reviewed : undefined
        const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined
        const limit = req.query.limit ? Number(req.query.limit) : undefined
        const offset = req.query.offset ? Number(req.query.offset) : undefined
        const minTotal = req.query.minTotal != null && req.query.minTotal !== ''
            ? Number(req.query.minTotal)
            : undefined
        const maxTotal = req.query.maxTotal != null && req.query.maxTotal !== ''
            ? Number(req.query.maxTotal)
            : undefined

        const result = await listOutgoingInvoices({
            q,
            customer,
            dateFrom,
            dateTo,
            minTotal: Number.isFinite(minTotal) ? minTotal : undefined,
            maxTotal: Number.isFinite(maxTotal) ? maxTotal : undefined,
            status,
            reviewed,
            sort,
            limit,
            offset,
        })
        res.setHeader('X-Total-Count', String(result.total))
        res.json(result)
    } catch (e) {
        next(e)
    }
})

export default router
