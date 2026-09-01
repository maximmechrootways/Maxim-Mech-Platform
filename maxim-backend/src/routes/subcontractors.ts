import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware/authenticate'
import {
    listSubcontractors,
    getSubcontractorById,
    createSubcontractor,
    updateSubcontractor,
    deleteSubcontractor,
    listAllSubcontractorCertifications,
    addSubcontractorCertification,
    updateSubcontractorCertification,
    removeSubcontractorCertification,
    listSubcontractorPersonnel,
    addSubcontractorPersonnel,
    updateSubcontractorPersonnel,
    removeSubcontractorPersonnel,
    addPersonnelJobAssignment,
    updatePersonnelJobAssignment,
    removePersonnelJobAssignment,
    addPersonnelCertification,
    updatePersonnelCertification,
    removePersonnelCertification,
    addPersonnelDocument,
    removePersonnelDocument,
    addSubcontractorContract,
    removeSubcontractorContract,
    upsertSubcontractorHSManualPdf,
    upsertSubcontractorWsibPdf,
    upsertSubcontractorHrSafetyPdf,
    upsertSubcontractorForm1000Pdf,
    addSubcontractorInsurance,
    deleteSubcontractorInsurance,
    checkInSubcontractorPersonnel,
    checkOutSubcontractorPersonnel,
    listSubcontractorPersonnelCheckIns,
} from '../services/subcontractorService'

const router = Router()

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || '.pdf'
        cb(null, `sub-${Date.now()}-${uuidv4()}${ext}`)
    },
})

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error('Only PDF, images (PNG, JPEG), and Word documents are allowed'))
        }
        cb(null, true)
    },
})

const uploadInsurancePdf = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
    fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
        if (allowed.includes(file.mimetype)) return cb(null, true)
        return cb(new Error('Only PDF, images (PNG, JPEG), and Word documents are allowed'))
    },
})

router.use(authenticate)

// Read uploaded subcontractor file (contract/cert/doc) as binary for quick view/download.
router.get('/files/:fileName', async (req, res, next) => {
    try {
        if (!['owner', 'hr'].includes(req.user!.role)) throw { status: 403, message: 'Forbidden' }
        const safeName = path.basename(req.params.fileName || '')
        if (!safeName || safeName !== req.params.fileName) throw { status: 400, message: 'Invalid file name' }
        const fullPath = path.join(uploadDir, safeName)
        if (!fs.existsSync(fullPath)) throw { status: 404, message: 'File not found' }

        const ext = path.extname(safeName).toLowerCase()
        const contentType =
            ext === '.pdf' ? 'application/pdf'
                : ext === '.png' ? 'image/png'
                    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
                        : 'application/octet-stream'
        res.setHeader('Content-Type', contentType)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.sendFile(fullPath)
    } catch (e) {
        next(e)
    }
})

router.get('/', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const list = await listSubcontractors(userId, role)
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.get('/all-certifications', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const certs = await listAllSubcontractorCertifications(userId, role)
        res.status(200).json(certs)
    } catch (e) {
        next(e)
    }
})

router.get('/:id', async (req, res, next) => {
    try {
        const sub = await getSubcontractorById(req.params.id, req.user!.id, req.user!.role)
        res.status(200).json(sub)
    } catch (e) {
        next(e)
    }
})

router.post('/', async (req, res, next) => {
    try {
        const userId = req.user!.id
        const role = req.user!.role
        const sub = await createSubcontractor(userId, role, req.body)
        res.status(201).json(sub)
    } catch (e) {
        next(e)
    }
})

router.patch('/:id', async (req, res, next) => {
    try {
        const sub = await updateSubcontractor(req.params.id, req.user!.role, req.body)
        res.status(200).json(sub)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id', async (req, res, next) => {
    try {
        await deleteSubcontractor(req.params.id, req.user!.role)
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

// ================= WSIB Injury Summary Report PDF =================
router.post('/:id/wsib-injury-report-pdf', uploadInsurancePdf.single('file'), async (req, res, next) => {
    try {
        if (!req.file) throw { status: 400, message: 'PDF file is required' }
        const result = await upsertSubcontractorWsibPdf(req.params.id, req.user!.role, {
            filePath: req.file.filename,
            originalName: req.file.originalname,
        })
        if (result.oldFilePath) {
            const p = path.join(uploadDir, result.oldFilePath)
            if (fs.existsSync(p)) fs.unlinkSync(p)
        }
        res.status(200).json(result.sub)
    } catch (e: any) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
        next(e)
    }
})

// ================= HR Safety Agreement PDF =================
router.post('/:id/hr-safety-agreement-pdf', uploadInsurancePdf.single('file'), async (req, res, next) => {
    try {
        if (!req.file) throw { status: 400, message: 'PDF file is required' }
        const result = await upsertSubcontractorHrSafetyPdf(req.params.id, req.user!.role, {
            filePath: req.file.filename,
            originalName: req.file.originalname,
        })
        if (result.oldFilePath) {
            const p = path.join(uploadDir, result.oldFilePath)
            if (fs.existsSync(p)) fs.unlinkSync(p)
        }
        res.status(200).json(result.sub)
    } catch (e: any) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
        next(e)
    }
})

// ================= FORM 1000 PDF =================
router.post('/:id/form1000-pdf', uploadInsurancePdf.single('file'), async (req, res, next) => {
    try {
        if (!req.file) throw { status: 400, message: 'PDF file is required' }
        const result = await upsertSubcontractorForm1000Pdf(req.params.id, req.user!.role, {
            filePath: req.file.filename,
            originalName: req.file.originalname,
        })
        if (result.oldFilePath) {
            const p = path.join(uploadDir, result.oldFilePath)
            if (fs.existsSync(p)) fs.unlinkSync(p)
        }
        res.status(200).json(result.sub)
    } catch (e: any) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
        next(e)
    }
})

// ================= Insurance CRUD (multi-insurance) =================
router.post('/:id/insurances', upload.single('file'), async (req, res, next) => {
    try {
        const data: any = {
            type: req.body.type,
            policyNumber: req.body.policyNumber,
            expiresAt: req.body.expiresAt,
        }
        if (req.file) {
            data.filePath = req.file.filename
            data.originalName = req.file.originalname
        }
        const insurance = await addSubcontractorInsurance(req.params.id, req.user!.role, data)
        res.status(201).json(insurance)
    } catch (e) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
        next(e)
    }
})

router.delete('/:id/insurances/:insuranceId', async (req, res, next) => {
    try {
        const existing = await deleteSubcontractorInsurance(req.params.insuranceId, req.user!.role)
        if (existing.filePath) {
            const p = path.join(uploadDir, existing.filePath)
            if (fs.existsSync(p)) fs.unlinkSync(p)
        }
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

// ================= H&S Manual PDF =================
router.post('/:id/hs-manual-pdf', uploadInsurancePdf.single('file'), async (req, res, next) => {
    try {
        if (!req.file) throw { status: 400, message: 'PDF file is required' }
        const result = await upsertSubcontractorHSManualPdf(req.params.id, req.user!.role, {
            filePath: req.file.filename,
            originalName: req.file.originalname,
        })
        if (result.oldFilePath) {
            const p = path.join(uploadDir, result.oldFilePath)
            if (fs.existsSync(p)) fs.unlinkSync(p)
        }
        res.status(200).json(result.sub)
    } catch (e: any) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
        next(e)
    }
})

router.post('/:id/certifications', upload.single('file'), async (req, res, next) => {
    try {
        const data = { ...req.body }
        if (req.file) {
            data.fileName = req.file.originalname
            data.filePath = req.file.filename
        }
        const uploaderName = `${(req.user as any).firstName || ''} ${(req.user as any).lastName || ''}`.trim() || req.user!.email
        const cert = await addSubcontractorCertification(req.params.id, req.user!.role, data, req.user!.id, uploaderName)
        res.status(201).json(cert)
    } catch (e) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
        next(e)
    }
})

router.patch('/:id/certifications/:certId', async (req, res, next) => {
    try {
        const cert = await updateSubcontractorCertification(req.params.certId, req.user!.role, req.body)
        res.status(200).json(cert)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id/certifications/:certId', async (req, res, next) => {
    try {
        // ideally delete file from fs if it exists, skipping for brevity/safety unless detailed
        await removeSubcontractorCertification(req.params.certId, req.user!.role)
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

// ================= Contracts Routes =================

router.post('/:id/contracts', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            throw { status: 400, message: 'No file uploaded' }
        }
        const data = {
            startDate: req.body.startDate,
            endDate: req.body.endDate,
            personnelId: req.body.personnelId,
            filePath: req.file.filename,
            originalName: req.file.originalname
        }
        const contract = await addSubcontractorContract(req.params.id, req.user!.role, data)
        res.status(201).json(contract)
    } catch (e) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
        next(e)
    }
})

router.delete('/:id/contracts/:contractId', async (req, res, next) => {
    try {
        const contract = await removeSubcontractorContract(req.params.contractId, req.user!.role)
        if (contract.filePath) {
            const p = path.join(uploadDir, contract.filePath)
            if (fs.existsSync(p)) fs.unlinkSync(p)
        }
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

// ================= Personnel Routes =================

router.get('/:id/personnel', async (req, res, next) => {
    try {
        const list = await listSubcontractorPersonnel(req.params.id, req.user!.role)
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.post('/:id/personnel', async (req, res, next) => {
    try {
        const p = await addSubcontractorPersonnel(req.params.id, req.user!.role, req.body)
        res.status(201).json(p)
    } catch (e) {
        next(e)
    }
})

router.patch('/:id/personnel/:personnelId', async (req, res, next) => {
    try {
        const p = await updateSubcontractorPersonnel(req.params.personnelId, req.user!.role, req.body)
        res.status(200).json(p)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id/personnel/:personnelId', async (req, res, next) => {
    try {
        await removeSubcontractorPersonnel(req.params.personnelId, req.user!.role)
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

// Personnel Job Assignments
router.post('/:id/personnel/:personnelId/jobs', async (req, res, next) => {
    try {
        const a = await addPersonnelJobAssignment(
            req.params.id,
            req.params.personnelId,
            req.body.jobId,
            req.user!.id,
            req.user!.role
        )
        res.status(201).json(a)
    } catch (e) {
        next(e)
    }
})

router.patch('/:id/personnel/:personnelId/jobs/:assignmentId', async (req, res, next) => {
    try {
        const a = await updatePersonnelJobAssignment(req.params.assignmentId, req.user!.role, req.body)
        res.status(200).json(a)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id/personnel/:personnelId/jobs/:assignmentId', async (req, res, next) => {
    try {
        await removePersonnelJobAssignment(req.params.assignmentId, req.user!.role)
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

// Personnel Job Check-ins
router.get('/:id/personnel-checkins', async (req, res, next) => {
    try {
        const checkins = await listSubcontractorPersonnelCheckIns(req.params.id, req.user!.role)
        res.status(200).json(checkins)
    } catch (e) {
        next(e)
    }
})

router.post('/:id/personnel/:personnelId/jobs/:jobId/checkin', async (req, res, next) => {
    try {
        const c = await checkInSubcontractorPersonnel(req.params.personnelId, req.params.jobId, req.body.date, req.user!.role)
        res.status(200).json(c)
    } catch (e) {
        next(e)
    }
})

router.post('/:id/personnel/:personnelId/jobs/:jobId/checkout', async (req, res, next) => {
    try {
        const c = await checkOutSubcontractorPersonnel(req.params.personnelId, req.params.jobId, req.body.date, req.user!.role)
        res.status(200).json(c)
    } catch (e) {
        next(e)
    }
})

// Personnel Certifications
router.post('/:id/personnel/:personnelId/certifications', upload.single('file'), async (req, res, next) => {
    try {
        const data = { ...req.body }
        if (req.file) {
            data.fileName = req.file.originalname
            data.filePath = req.file.filename
        }
        const uploaderName = `${(req.user as any).firstName || ''} ${(req.user as any).lastName || ''}`.trim() || req.user!.email
        const c = await addPersonnelCertification(req.params.personnelId, req.user!.role, data, req.user!.id, uploaderName)
        res.status(201).json(c)
    } catch (e) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
        next(e)
    }
})

router.patch('/:id/personnel/:personnelId/certifications/:certId', async (req, res, next) => {
    try {
        const c = await updatePersonnelCertification(req.params.certId, req.user!.role, req.body)
        res.status(200).json(c)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id/personnel/:personnelId/certifications/:certId', async (req, res, next) => {
    try {
        await removePersonnelCertification(req.params.certId, req.user!.role)
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

// Personnel Documents (Contracts, etc)
router.post('/:id/personnel/:personnelId/documents', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) throw { status: 400, message: 'File is required' }
        const data = {
            name: req.body.name || req.file.originalname,
            category: req.body.category || 'contract',
            filePath: req.file.filename,
        }
        const d = await addPersonnelDocument(req.params.personnelId, req.user!.role, data)
        res.status(201).json(d)
    } catch (e) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
        next(e)
    }
})

router.delete('/:id/personnel/:personnelId/documents/:docId', async (req, res, next) => {
    try {
        const doc = await removePersonnelDocument(req.params.docId, req.user!.role)
        if (doc && doc.filePath) {
            const fullPath = path.join(uploadDir, doc.filePath)
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
        }
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

export default router
