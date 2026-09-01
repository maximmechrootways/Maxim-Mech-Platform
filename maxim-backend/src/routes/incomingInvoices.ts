import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { authenticate } from '../middleware/authenticate'
import {
    bootstrapInvoiceInboxIntegration,
    getIncomingInvoicePipelineStatus,
    pollUnreadInvoiceEmails,
    processIncomingInvoiceQueue,
} from '../services/incomingInvoiceIngestionService'
import {
    createManualIncomingInvoice,
    deleteIncomingInvoice,
    getIncomingInvoiceAttachmentBuffer,
    getIncomingInvoiceAttachmentDownloadUrl,
    getIncomingInvoiceDetail,
    listIncomingInvoices,
    rescanIncomingInvoiceFromPdf,
    summaryIncomingInvoices,
    updateIncomingInvoice,
} from '../services/incomingInvoiceService'

const router = Router()
router.use(authenticate)

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadDir),
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname) || '.pdf'
            cb(null, `invoice-manual-${Date.now()}${ext}`)
        },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf' && !file.originalname.toLowerCase().endsWith('.pdf')) {
            return cb(new Error('Only PDF attachments are allowed'))
        }
        cb(null, true)
    },
})

function requireOwnerOrHr(role: string | undefined) {
    return role === 'owner' || role === 'hr'
}

router.get('/summary', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can view incoming invoices' })
        }
        res.json(await summaryIncomingInvoices())
    } catch (e) {
        next(e)
    }
})

router.get('/admin/status', async (req, res, next) => {
    try {
        if (req.user?.role !== 'owner') {
            return res.status(403).json({ error: 'Only Owner can view invoice pipeline status' })
        }
        res.json(await getIncomingInvoicePipelineStatus())
    } catch (e) {
        next(e)
    }
})

router.post('/admin/setup-trigger', async (req, res, next) => {
    try {
        if (req.user?.role !== 'owner') {
            return res.status(403).json({ error: 'Only Owner can bootstrap invoice inbox integration' })
        }
        res.json(await bootstrapInvoiceInboxIntegration())
    } catch (e) {
        next(e)
    }
})

router.post('/admin/sync', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can sync invoice inbox' })
        }
        const poll = await pollUnreadInvoiceEmails()
        const processed = await processIncomingInvoiceQueue(10)
        const status = await getIncomingInvoicePipelineStatus()
        res.json({ ...poll, ...processed, status })
    } catch (e) {
        next(e)
    }
})

router.post('/', upload.single('file'), async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can create invoices' })
        }
        const body = req.body as Record<string, string>
        let pdfBuffer: Buffer | undefined
        if (req.file) {
            pdfBuffer = fs.readFileSync(req.file.path)
            fs.unlinkSync(req.file.path)
        }
        const totalRaw = body.totalAmount?.trim()
        const totalAmount = totalRaw ? Number(totalRaw) : undefined
        const invoice = await createManualIncomingInvoice({
            vendorName: body.vendorName || '',
            invoiceNumber: body.invoiceNumber,
            invoiceDate: body.invoiceDate,
            dueDate: body.dueDate,
            totalAmount: Number.isFinite(totalAmount) ? totalAmount : undefined,
            currency: body.currency,
            poNumber: body.poNumber,
            jobReference: body.jobReference,
            paymentTerms: body.paymentTerms,
            emailSubject: body.emailSubject,
            emailBodyText: body.emailBodyText,
            pdfBuffer,
            pdfOriginalName: req.file?.originalname,
            pdfMimeType: req.file?.mimetype,
        })
        res.status(201).json(invoice)
    } catch (e: any) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
        if (e?.status === 400) return res.status(400).json({ error: e.message })
        next(e)
    }
})

router.patch('/:id', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can edit invoices' })
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
        res.json(await updateIncomingInvoice(req.params.id, {
            vendorName: str('vendorName'),
            invoiceNumber: str('invoiceNumber'),
            invoiceDate: str('invoiceDate'),
            dueDate: str('dueDate'),
            subtotal: body.subtotal !== undefined ? num('subtotal') : undefined,
            taxAmount: body.taxAmount !== undefined ? num('taxAmount') : undefined,
            totalAmount: body.totalAmount !== undefined ? num('totalAmount') : undefined,
            currency: str('currency'),
            poNumber: str('poNumber'),
            jobReference: str('jobReference'),
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
            return res.status(403).json({ error: 'Only Owner or HR can rescan invoices' })
        }
        res.json(await rescanIncomingInvoiceFromPdf(req.params.id))
    } catch (e: any) {
        if (e?.status === 404) return res.status(404).json({ error: e.message })
        if (e?.status === 400) return res.status(400).json({ error: e.message })
        next(e)
    }
})

router.delete('/:id', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can delete invoices' })
        }
        res.json(await deleteIncomingInvoice(req.params.id))
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
        const { buffer, originalName, mimeType } = await getIncomingInvoiceAttachmentBuffer(
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
        const result = await getIncomingInvoiceAttachmentDownloadUrl(req.params.id, req.params.attachmentId)
        res.json(result)
    } catch (e: any) {
        if (e?.status === 404) return res.status(404).json({ error: e.message })
        next(e)
    }
})

router.get('/:id', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can view incoming invoices' })
        }
        res.json(await getIncomingInvoiceDetail(req.params.id))
    } catch (e: any) {
        if (e?.status === 404) return res.status(404).json({ error: e.message })
        next(e)
    }
})

router.get('/', async (req, res, next) => {
    try {
        if (!requireOwnerOrHr(req.user?.role)) {
            return res.status(403).json({ error: 'Only Owner or HR can view incoming invoices' })
        }
        const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined
        const vendor = typeof req.query.vendor === 'string' ? req.query.vendor.trim() : undefined
        const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined
        const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined
        const status = typeof req.query.status === 'string' ? req.query.status : undefined
        const documentType = typeof req.query.documentType === 'string' ? req.query.documentType : undefined
        const paid = typeof req.query.paid === 'string' ? req.query.paid : undefined
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

        const result = await listIncomingInvoices({
            q,
            vendor,
            dateFrom,
            dateTo,
            minTotal: Number.isFinite(minTotal) ? minTotal : undefined,
            maxTotal: Number.isFinite(maxTotal) ? maxTotal : undefined,
            status,
            documentType,
            paid,
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
