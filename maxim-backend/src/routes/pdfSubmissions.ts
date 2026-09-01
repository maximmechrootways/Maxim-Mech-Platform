import { Router } from 'express'
import multer from 'multer'
import { authenticate } from '../middleware/authenticate'
import {
  listSubmissions,
  getSubmissionById,
  findOrCreateDraftSubmission,
  updateSubmissionStatus,
  saveValues,
  addSignature,
  submitForm,
  approveSubmission,
  requestSubmissionResubmission,
  notifySubmissionToHr,
  uploadExtraPdf,
  removeExtraPdf,
  attachToolboxTopicToSubmission,
  clearDraftSubmission,
  updateDraftTitle,
  deleteSubmissionForAdmin,
  deleteDraftSubmissions,
  removeSignature,
  getToolboxTalkSummaryByJob,
  getAssignedPersonnelSubmissionsByJob,
  exportMergedSubmissionsPdf,
} from '../services/pdfSubmissionService'

const router = Router()

router.use(authenticate)

const uploadExtraPdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (String(file.mimetype).toLowerCase().includes('pdf')) return cb(null, true)
    return cb(new Error('Only PDF files are allowed'))
  },
})

router.get('/', async (req, res, next) => {
  try {
    const query = {
      submittedById: req.query.submittedById as string | undefined,
      titleSearch: req.query.titleSearch as string | undefined,
      status: req.query.status as string | undefined,
    }
    const list = await listSubmissions(req.user!.id, req.user!.role, query)
    res.status(200).json(list)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// Toolbox talk summary for a specific project (job)
router.get('/by-job/:jobId/toolbox-summary', async (req, res, next) => {
  try {
    const summary = await getToolboxTalkSummaryByJob(req.params.jobId)
    res.status(200).json(summary)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// Recently submitted forms by labourers/supervisors assigned to this job/site.
router.get('/by-job/:jobId/assigned-submissions', async (req, res, next) => {
  try {
    const rows = await getAssignedPersonnelSubmissionsByJob(req.params.jobId, req.user!.id, req.user!.role)
    res.status(200).json(rows)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.post('/bulk-delete-drafts', async (req, res, next) => {
  try {
    const submissionIds = Array.isArray(req.body?.submissionIds)
      ? req.body.submissionIds.map((id: unknown) => String(id))
      : []
    const result = await deleteDraftSubmissions(req.user!.id, req.user!.role, submissionIds)
    res.status(200).json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.post('/export-merged-pdf', async (req, res, next) => {
  try {
    const submissionRefs = Array.isArray(req.body?.submissionRefs)
      ? req.body.submissionRefs.map((ref: unknown) => String(ref))
      : Array.isArray(req.body?.submissionIds)
      ? req.body.submissionIds.map((id: unknown) => String(id))
      : []
    const result = await exportMergedSubmissionsPdf(req.user!.id, req.user!.role, submissionRefs)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`)
    res.setHeader('X-Merged-Included-Count', String(result.includedCount))
    res.setHeader('X-Merged-Skipped-Count', String(result.skipped.length))
    res.status(200).send(result.buffer)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const submission = await getSubmissionById(req.params.id, req.user!.id, req.user!.role)
    res.status(200).json(submission)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { templateId, jobId, siteId, reuseDraft, draftId } = req.body || {}
    if (!templateId) return res.status(400).json({ error: 'templateId required' })
    // Default: reuse existing DRAFT for this user+template (avoids draft spam). Pass reuseDraft: false for a fresh draft.
    const shouldReuse = reuseDraft !== false
    const sub = await findOrCreateDraftSubmission(req.user!.id, templateId, jobId, siteId, shouldReuse, draftId)
    res.status(201).json(sub)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.patch('/:id/title', async (req, res, next) => {
  try {
    const title = req.body?.title != null ? String(req.body.title) : ''
    const result = await updateDraftTitle(req.params.id, req.user!.id, req.user!.role, title)
    res.status(200).json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.patch('/:id/values', async (req, res, next) => {
  try {
    const { values } = req.body || {}
    const sub = await getSubmissionById(req.params.id, req.user!.id, req.user!.role)
    const role = req.user!.role
    if ((sub.status === 'SUBMITTED' || sub.status === 'APPROVED') && role !== 'owner' && role !== 'hr') {
      return res.status(403).json({ error: 'Only Owner or HR can edit a submitted or approved form' })
    }
    await saveValues(req.params.id, Array.isArray(values) ? values : [])
    res.status(200).json({ success: true })
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// Upload an extra PDF attachment while the form is being filled out
router.post('/:id/extra-pdf', uploadExtraPdfUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF file is required' })
    const result = await uploadExtraPdf(req.params.id, req.user!.id, req.user!.role, req.file)
    res.status(200).json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.delete('/:id/extra-pdf', async (req, res, next) => {
  try {
    const result = await removeExtraPdf(req.params.id, req.user!.id, req.user!.role)
    res.status(200).json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// Copy the selected toolbox topic source PDF into this submission's attachment slot
router.post('/:id/topic/:topicId/attach', async (req, res, next) => {
  try {
    const result = await attachToolboxTopicToSubmission(req.params.id, req.params.topicId, req.user!.id, req.user!.role)
    res.status(200).json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// Clear all saved draft data (field values, signatures, and the optional extra PDF)
router.post('/:id/clear', async (req, res, next) => {
  try {
    const result = await clearDraftSubmission(req.params.id, req.user!.id, req.user!.role)
    res.status(200).json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.post('/:id/signatures', async (req, res, next) => {
  try {
    const { signerRole, imageData, fieldId, signerUserId, signerName } = req.body || {}
    const actingRole = req.user!.role
    const canSignForAnother = actingRole === 'owner' || actingRole === 'hr' || actingRole === 'supervisor'
    const effectiveSignerId = canSignForAnother && signerUserId ? String(signerUserId) : req.user!.id
    const sig = await addSignature(
      req.params.id,
      effectiveSignerId,
      signerRole ?? 'Worker',
      imageData ?? '',
      fieldId,
      signerName
    )
    res.status(200).json(sig)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.delete('/:id/signatures', async (req, res, next) => {
  try {
    const { signedAt, signerId, fieldId, imageData } = req.body || {}
    const result = await removeSignature(req.params.id, req.user!.id, req.user!.role, {
      signedAt: signedAt != null ? String(signedAt) : undefined,
      signerId: signerId != null ? String(signerId) : undefined,
      fieldId: fieldId != null ? String(fieldId) : undefined,
      imageData: imageData != null ? String(imageData) : undefined,
    })
    res.status(200).json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.post('/:id/submit', async (req, res, next) => {
  try {
    const title = req.body?.title != null ? String(req.body.title) : undefined
    const signerUserIds = Array.isArray(req.body?.signerUserIds) ? req.body.signerUserIds.map((id: unknown) => String(id)) : undefined
    const rawAssignments = req.body?.signerFieldAssignments
    const signerFieldAssignments = Array.isArray(rawAssignments)
      ? rawAssignments
          .map((row: unknown) => {
            if (!row || typeof row !== 'object') return null
            const labourerUserId = String((row as { labourerUserId?: unknown }).labourerUserId ?? '').trim()
            const fieldId = String((row as { fieldId?: unknown }).fieldId ?? '').trim()
            if (!labourerUserId || !fieldId) return null
            return { labourerUserId, fieldId }
          })
          .filter(Boolean)
      : undefined
    const sub = await submitForm(req.params.id, title, signerUserIds, signerFieldAssignments as { labourerUserId: string; fieldId: string }[] | undefined)
    res.status(200).json(sub)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.patch('/:id/approve', async (req, res, next) => {
  try {
    const sub = await approveSubmission(req.params.id, req.user!.role)
    res.status(200).json(sub)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.post('/:id/request-resubmission', async (req, res, next) => {
  try {
    const reason = req.body?.reason != null ? String(req.body.reason) : ''
    const sub = await requestSubmissionResubmission(req.params.id, req.user!.id, req.user!.role, reason)
    res.status(200).json(sub)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.post('/:id/notify-hr', async (req, res, next) => {
  try {
    const result = await notifySubmissionToHr(req.params.id, req.user!.id, req.user!.role)
    res.status(200).json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const { status } = req.body || {}
    if (!status) return res.status(400).json({ error: 'status is required' })
    const result = await updateSubmissionStatus(
      req.params.id,
      req.user!.role,
      status
    )
    res.status(200).json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await deleteSubmissionForAdmin(req.params.id, req.user!.role)
    res.status(200).json(result)
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

export default router
