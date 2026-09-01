"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const authenticate_1 = require("../middleware/authenticate");
const equipmentService_1 = require("../services/equipmentService");
const carInsuranceService_1 = require("../services/carInsuranceService");
const router = (0, express_1.Router)();
const uploadDir = path_1.default.resolve(process.env.UPLOAD_DIR || 'uploads');
if (!fs_1.default.existsSync(uploadDir))
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, _file, cb) => cb(null, `eq-${Date.now()}-${(0, uuid_1.v4)()}.tmp`),
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
        if (!allowed.includes(file.mimetype))
            return cb(new Error('Only PDF and PNG/JPEG images are allowed'));
        cb(null, true);
    },
});
router.use(authenticate_1.authenticate);
router.get('/', async (req, res, next) => {
    try {
        const list = await (0, equipmentService_1.listEquipment)(req.user.id, req.user.role);
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const created = await (0, equipmentService_1.createEquipment)(req.user.role, req.body);
        res.status(201).json(created);
    }
    catch (e) {
        next(e);
    }
});
router.get('/car-insurance', async (req, res, next) => {
    try {
        const data = await (0, carInsuranceService_1.getFleetCarInsurance)(req.user.role);
        res.status(200).json(data);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/car-insurance', async (req, res, next) => {
    try {
        const data = await (0, carInsuranceService_1.updateFleetCarInsurancePolicy)(req.user.role, req.body);
        res.status(200).json(data);
    }
    catch (e) {
        next(e);
    }
});
router.post('/car-insurance/vehicles', async (req, res, next) => {
    try {
        const row = await (0, carInsuranceService_1.addFleetCarInsuranceVehicle)(req.user.role, req.body);
        res.status(201).json(row);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/car-insurance/vehicles/:vehicleId', async (req, res, next) => {
    try {
        const row = await (0, carInsuranceService_1.updateFleetCarInsuranceVehicle)(req.user.role, req.params.vehicleId, req.body);
        res.status(200).json(row);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/car-insurance/vehicles/:vehicleId', async (req, res, next) => {
    try {
        await (0, carInsuranceService_1.deleteFleetCarInsuranceVehicle)(req.user.role, req.params.vehicleId);
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const row = await (0, equipmentService_1.getEquipmentById)(req.params.id, req.user.role);
        res.status(200).json(row);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const row = await (0, equipmentService_1.updateEquipment)(req.params.id, req.user.role, req.body);
        res.status(200).json(row);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        await (0, equipmentService_1.deleteEquipment)(req.params.id, req.user.role);
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/maintenance-records', async (req, res, next) => {
    try {
        const row = await (0, equipmentService_1.addMaintenanceRecord)(req.params.id, req.user.role, req.body);
        res.status(201).json(row);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:equipmentId/maintenance-records/:recordId', async (req, res, next) => {
    try {
        const row = await (0, equipmentService_1.updateMaintenanceRecord)(req.params.equipmentId, req.params.recordId, req.user.role, req.body);
        res.status(200).json(row);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:equipmentId/maintenance-records/:recordId', async (req, res, next) => {
    try {
        await (0, equipmentService_1.deleteMaintenanceRecord)(req.params.equipmentId, req.params.recordId, req.user.role);
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/cost-entries', async (req, res, next) => {
    try {
        const row = await (0, equipmentService_1.addCostEntry)(req.params.id, req.user.role, req.body);
        res.status(201).json(row);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:equipmentId/cost-entries/:costId', async (req, res, next) => {
    try {
        const row = await (0, equipmentService_1.updateCostEntry)(req.params.equipmentId, req.params.costId, req.user.role, req.body);
        res.status(200).json(row);
    }
    catch (e) {
        next(e);
    }
});
router.post('/:equipmentId/cost-entries/:costId/invoice', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'No file' });
        const row = await (0, equipmentService_1.uploadCostInvoice)(req.params.equipmentId, req.params.costId, req.user.role, req.file);
        res.status(200).json(row);
    }
    catch (e) {
        if (req.file?.path && fs_1.default.existsSync(req.file.path)) {
            try {
                fs_1.default.unlinkSync(req.file.path);
            }
            catch { /* ignore */ }
        }
        next(e);
    }
});
router.delete('/:equipmentId/cost-entries/:costId', async (req, res, next) => {
    try {
        await (0, equipmentService_1.deleteCostEntry)(req.params.equipmentId, req.params.costId, req.user.role);
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/insurance', async (req, res, next) => {
    try {
        const row = await (0, equipmentService_1.addInsurance)(req.params.id, req.user.role, req.body);
        res.status(201).json(row);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:equipmentId/insurance/:insuranceId', async (req, res, next) => {
    try {
        const row = await (0, equipmentService_1.updateInsurance)(req.params.equipmentId, req.params.insuranceId, req.user.role, req.body);
        res.status(200).json(row);
    }
    catch (e) {
        next(e);
    }
});
router.post('/:equipmentId/insurance/:insuranceId/policy', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'No file' });
        const row = await (0, equipmentService_1.uploadInsurancePolicy)(req.params.equipmentId, req.params.insuranceId, req.user.role, req.file);
        res.status(200).json(row);
    }
    catch (e) {
        if (req.file?.path && fs_1.default.existsSync(req.file.path)) {
            try {
                fs_1.default.unlinkSync(req.file.path);
            }
            catch { /* ignore */ }
        }
        next(e);
    }
});
router.delete('/:equipmentId/insurance/:insuranceId', async (req, res, next) => {
    try {
        await (0, equipmentService_1.deleteInsurance)(req.params.equipmentId, req.params.insuranceId, req.user.role);
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/inspection-submissions', async (req, res, next) => {
    try {
        const submissionId = String(req.body?.submissionId || '');
        const row = await (0, equipmentService_1.addInspectionSubmission)(req.params.id, req.user.role, submissionId);
        res.status(200).json(row);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:equipmentId/inspection-submissions/:submissionId', async (req, res, next) => {
    try {
        const row = await (0, equipmentService_1.removeInspectionSubmission)(req.params.equipmentId, req.user.role, req.params.submissionId);
        res.status(200).json(row);
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
