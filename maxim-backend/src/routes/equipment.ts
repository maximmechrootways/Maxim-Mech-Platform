import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware/authenticate'
import {
    listEquipment,
    getEquipmentById,
    createEquipment,
    updateEquipment,
    deleteEquipment,
    addMaintenanceRecord,
    updateMaintenanceRecord,
    deleteMaintenanceRecord,
    addCostEntry,
    updateCostEntry,
    uploadCostInvoice,
    deleteCostEntry,
    addInsurance,
    updateInsurance,
    uploadInsurancePolicy,
    deleteInsurance,
    addInspectionSubmission,
    removeInspectionSubmission,
} from '../services/equipmentService'
import {
    getFleetCarInsurance,
    updateFleetCarInsurancePolicy,
    addFleetCarInsuranceVehicle,
    updateFleetCarInsuranceVehicle,
    deleteFleetCarInsuranceVehicle,
} from '../services/carInsuranceService'

const router = Router()

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, _file, cb) => cb(null, `eq-${Date.now()}-${uuidv4()}.tmp`),
})

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
        if (!allowed.includes(file.mimetype)) return cb(new Error('Only PDF and PNG/JPEG images are allowed'))
        cb(null, true)
    },
})

router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const list = await listEquipment(req.user!.id, req.user!.role)
        res.status(200).json(list)
    } catch (e) {
        next(e)
    }
})

router.post('/', async (req, res, next) => {
    try {
        const created = await createEquipment(req.user!.role, req.body)
        res.status(201).json(created)
    } catch (e) {
        next(e)
    }
})

router.get('/car-insurance', async (req, res, next) => {
    try {
        const data = await getFleetCarInsurance(req.user!.role)
        res.status(200).json(data)
    } catch (e) {
        next(e)
    }
})

router.patch('/car-insurance', async (req, res, next) => {
    try {
        const data = await updateFleetCarInsurancePolicy(req.user!.role, req.body)
        res.status(200).json(data)
    } catch (e) {
        next(e)
    }
})

router.post('/car-insurance/vehicles', async (req, res, next) => {
    try {
        const row = await addFleetCarInsuranceVehicle(req.user!.role, req.body)
        res.status(201).json(row)
    } catch (e) {
        next(e)
    }
})

router.patch('/car-insurance/vehicles/:vehicleId', async (req, res, next) => {
    try {
        const row = await updateFleetCarInsuranceVehicle(req.user!.role, req.params.vehicleId, req.body)
        res.status(200).json(row)
    } catch (e) {
        next(e)
    }
})

router.delete('/car-insurance/vehicles/:vehicleId', async (req, res, next) => {
    try {
        await deleteFleetCarInsuranceVehicle(req.user!.role, req.params.vehicleId)
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

router.get('/:id', async (req, res, next) => {
    try {
        const row = await getEquipmentById(req.params.id, req.user!.role)
        res.status(200).json(row)
    } catch (e) {
        next(e)
    }
})

router.patch('/:id', async (req, res, next) => {
    try {
        const row = await updateEquipment(req.params.id, req.user!.role, req.body)
        res.status(200).json(row)
    } catch (e) {
        next(e)
    }
})

router.delete('/:id', async (req, res, next) => {
    try {
        await deleteEquipment(req.params.id, req.user!.role)
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

router.post('/:id/maintenance-records', async (req, res, next) => {
    try {
        const row = await addMaintenanceRecord(req.params.id, req.user!.role, req.body)
        res.status(201).json(row)
    } catch (e) {
        next(e)
    }
})

router.patch('/:equipmentId/maintenance-records/:recordId', async (req, res, next) => {
    try {
        const row = await updateMaintenanceRecord(
            req.params.equipmentId,
            req.params.recordId,
            req.user!.role,
            req.body
        )
        res.status(200).json(row)
    } catch (e) {
        next(e)
    }
})

router.delete('/:equipmentId/maintenance-records/:recordId', async (req, res, next) => {
    try {
        await deleteMaintenanceRecord(req.params.equipmentId, req.params.recordId, req.user!.role)
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

router.post('/:id/cost-entries', async (req, res, next) => {
    try {
        const row = await addCostEntry(req.params.id, req.user!.role, req.body)
        res.status(201).json(row)
    } catch (e) {
        next(e)
    }
})

router.patch('/:equipmentId/cost-entries/:costId', async (req, res, next) => {
    try {
        const row = await updateCostEntry(req.params.equipmentId, req.params.costId, req.user!.role, req.body)
        res.status(200).json(row)
    } catch (e) {
        next(e)
    }
})

router.post('/:equipmentId/cost-entries/:costId/invoice', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file' })
        const row = await uploadCostInvoice(req.params.equipmentId, req.params.costId, req.user!.role, req.file)
        res.status(200).json(row)
    } catch (e: any) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
        }
        next(e)
    }
})

router.delete('/:equipmentId/cost-entries/:costId', async (req, res, next) => {
    try {
        await deleteCostEntry(req.params.equipmentId, req.params.costId, req.user!.role)
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

router.post('/:id/insurance', async (req, res, next) => {
    try {
        const row = await addInsurance(req.params.id, req.user!.role, req.body)
        res.status(201).json(row)
    } catch (e) {
        next(e)
    }
})

router.patch('/:equipmentId/insurance/:insuranceId', async (req, res, next) => {
    try {
        const row = await updateInsurance(req.params.equipmentId, req.params.insuranceId, req.user!.role, req.body)
        res.status(200).json(row)
    } catch (e) {
        next(e)
    }
})

router.post('/:equipmentId/insurance/:insuranceId/policy', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file' })
        const row = await uploadInsurancePolicy(
            req.params.equipmentId,
            req.params.insuranceId,
            req.user!.role,
            req.file
        )
        res.status(200).json(row)
    } catch (e: any) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
        }
        next(e)
    }
})

router.delete('/:equipmentId/insurance/:insuranceId', async (req, res, next) => {
    try {
        await deleteInsurance(req.params.equipmentId, req.params.insuranceId, req.user!.role)
        res.status(200).json({ message: 'Deleted' })
    } catch (e) {
        next(e)
    }
})

router.post('/:id/inspection-submissions', async (req, res, next) => {
    try {
        const submissionId = String(req.body?.submissionId || '')
        const row = await addInspectionSubmission(req.params.id, req.user!.role, submissionId)
        res.status(200).json(row)
    } catch (e) {
        next(e)
    }
})

router.delete('/:equipmentId/inspection-submissions/:submissionId', async (req, res, next) => {
    try {
        const row = await removeInspectionSubmission(
            req.params.equipmentId,
            req.user!.role,
            req.params.submissionId
        )
        res.status(200).json(row)
    } catch (e) {
        next(e)
    }
})

export default router
