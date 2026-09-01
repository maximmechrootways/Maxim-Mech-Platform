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
const subcontractorService_1 = require("../services/subcontractorService");
const router = (0, express_1.Router)();
const uploadDir = path_1.default.resolve(process.env.UPLOAD_DIR || 'uploads');
if (!fs_1.default.existsSync(uploadDir))
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname) || '.pdf';
        cb(null, `sub-${Date.now()}-${(0, uuid_1.v4)()}${ext}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error('Only PDF, images (PNG, JPEG), and Word documents are allowed'));
        }
        cb(null, true);
    },
});
const uploadInsurancePdf = (0, multer_1.default)({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
    fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (allowed.includes(file.mimetype))
            return cb(null, true);
        return cb(new Error('Only PDF, images (PNG, JPEG), and Word documents are allowed'));
    },
});
router.use(authenticate_1.authenticate);
// Read uploaded subcontractor file (contract/cert/doc) as binary for quick view/download.
router.get('/files/:fileName', async (req, res, next) => {
    try {
        if (!['owner', 'hr'].includes(req.user.role))
            throw { status: 403, message: 'Forbidden' };
        const safeName = path_1.default.basename(req.params.fileName || '');
        if (!safeName || safeName !== req.params.fileName)
            throw { status: 400, message: 'Invalid file name' };
        const fullPath = path_1.default.join(uploadDir, safeName);
        if (!fs_1.default.existsSync(fullPath))
            throw { status: 404, message: 'File not found' };
        const ext = path_1.default.extname(safeName).toLowerCase();
        const contentType = ext === '.pdf' ? 'application/pdf'
            : ext === '.png' ? 'image/png'
                : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
                    : 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.sendFile(fullPath);
    }
    catch (e) {
        next(e);
    }
});
router.get('/', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const list = await (0, subcontractorService_1.listSubcontractors)(userId, role);
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.get('/all-certifications', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const certs = await (0, subcontractorService_1.listAllSubcontractorCertifications)(userId, role);
        res.status(200).json(certs);
    }
    catch (e) {
        next(e);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const sub = await (0, subcontractorService_1.getSubcontractorById)(req.params.id, req.user.id, req.user.role);
        res.status(200).json(sub);
    }
    catch (e) {
        next(e);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const sub = await (0, subcontractorService_1.createSubcontractor)(userId, role, req.body);
        res.status(201).json(sub);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const sub = await (0, subcontractorService_1.updateSubcontractor)(req.params.id, req.user.role, req.body);
        res.status(200).json(sub);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        await (0, subcontractorService_1.deleteSubcontractor)(req.params.id, req.user.role);
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
// ================= WSIB Injury Summary Report PDF =================
router.post('/:id/wsib-injury-report-pdf', uploadInsurancePdf.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            throw { status: 400, message: 'PDF file is required' };
        const result = await (0, subcontractorService_1.upsertSubcontractorWsibPdf)(req.params.id, req.user.role, {
            filePath: req.file.filename,
            originalName: req.file.originalname,
        });
        if (result.oldFilePath) {
            const p = path_1.default.join(uploadDir, result.oldFilePath);
            if (fs_1.default.existsSync(p))
                fs_1.default.unlinkSync(p);
        }
        res.status(200).json(result.sub);
    }
    catch (e) {
        if (req.file && fs_1.default.existsSync(req.file.path))
            fs_1.default.unlinkSync(req.file.path);
        next(e);
    }
});
// ================= HR Safety Agreement PDF =================
router.post('/:id/hr-safety-agreement-pdf', uploadInsurancePdf.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            throw { status: 400, message: 'PDF file is required' };
        const result = await (0, subcontractorService_1.upsertSubcontractorHrSafetyPdf)(req.params.id, req.user.role, {
            filePath: req.file.filename,
            originalName: req.file.originalname,
        });
        if (result.oldFilePath) {
            const p = path_1.default.join(uploadDir, result.oldFilePath);
            if (fs_1.default.existsSync(p))
                fs_1.default.unlinkSync(p);
        }
        res.status(200).json(result.sub);
    }
    catch (e) {
        if (req.file && fs_1.default.existsSync(req.file.path))
            fs_1.default.unlinkSync(req.file.path);
        next(e);
    }
});
// ================= FORM 1000 PDF =================
router.post('/:id/form1000-pdf', uploadInsurancePdf.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            throw { status: 400, message: 'PDF file is required' };
        const result = await (0, subcontractorService_1.upsertSubcontractorForm1000Pdf)(req.params.id, req.user.role, {
            filePath: req.file.filename,
            originalName: req.file.originalname,
        });
        if (result.oldFilePath) {
            const p = path_1.default.join(uploadDir, result.oldFilePath);
            if (fs_1.default.existsSync(p))
                fs_1.default.unlinkSync(p);
        }
        res.status(200).json(result.sub);
    }
    catch (e) {
        if (req.file && fs_1.default.existsSync(req.file.path))
            fs_1.default.unlinkSync(req.file.path);
        next(e);
    }
});
// ================= Insurance CRUD (multi-insurance) =================
router.post('/:id/insurances', upload.single('file'), async (req, res, next) => {
    try {
        const data = {
            type: req.body.type,
            policyNumber: req.body.policyNumber,
            expiresAt: req.body.expiresAt,
        };
        if (req.file) {
            data.filePath = req.file.filename;
            data.originalName = req.file.originalname;
        }
        const insurance = await (0, subcontractorService_1.addSubcontractorInsurance)(req.params.id, req.user.role, data);
        res.status(201).json(insurance);
    }
    catch (e) {
        if (req.file && fs_1.default.existsSync(req.file.path))
            fs_1.default.unlinkSync(req.file.path);
        next(e);
    }
});
router.delete('/:id/insurances/:insuranceId', async (req, res, next) => {
    try {
        const existing = await (0, subcontractorService_1.deleteSubcontractorInsurance)(req.params.insuranceId, req.user.role);
        if (existing.filePath) {
            const p = path_1.default.join(uploadDir, existing.filePath);
            if (fs_1.default.existsSync(p))
                fs_1.default.unlinkSync(p);
        }
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
// ================= H&S Manual PDF =================
router.post('/:id/hs-manual-pdf', uploadInsurancePdf.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            throw { status: 400, message: 'PDF file is required' };
        const result = await (0, subcontractorService_1.upsertSubcontractorHSManualPdf)(req.params.id, req.user.role, {
            filePath: req.file.filename,
            originalName: req.file.originalname,
        });
        if (result.oldFilePath) {
            const p = path_1.default.join(uploadDir, result.oldFilePath);
            if (fs_1.default.existsSync(p))
                fs_1.default.unlinkSync(p);
        }
        res.status(200).json(result.sub);
    }
    catch (e) {
        if (req.file && fs_1.default.existsSync(req.file.path))
            fs_1.default.unlinkSync(req.file.path);
        next(e);
    }
});
router.post('/:id/certifications', upload.single('file'), async (req, res, next) => {
    try {
        const data = { ...req.body };
        if (req.file) {
            data.fileName = req.file.originalname;
            data.filePath = req.file.filename;
        }
        const uploaderName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
        const cert = await (0, subcontractorService_1.addSubcontractorCertification)(req.params.id, req.user.role, data, req.user.id, uploaderName);
        res.status(201).json(cert);
    }
    catch (e) {
        if (req.file && fs_1.default.existsSync(req.file.path))
            fs_1.default.unlinkSync(req.file.path);
        next(e);
    }
});
router.patch('/:id/certifications/:certId', async (req, res, next) => {
    try {
        const cert = await (0, subcontractorService_1.updateSubcontractorCertification)(req.params.certId, req.user.role, req.body);
        res.status(200).json(cert);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id/certifications/:certId', async (req, res, next) => {
    try {
        // ideally delete file from fs if it exists, skipping for brevity/safety unless detailed
        await (0, subcontractorService_1.removeSubcontractorCertification)(req.params.certId, req.user.role);
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
// ================= Contracts Routes =================
router.post('/:id/contracts', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            throw { status: 400, message: 'No file uploaded' };
        }
        const data = {
            startDate: req.body.startDate,
            endDate: req.body.endDate,
            personnelId: req.body.personnelId,
            filePath: req.file.filename,
            originalName: req.file.originalname
        };
        const contract = await (0, subcontractorService_1.addSubcontractorContract)(req.params.id, req.user.role, data);
        res.status(201).json(contract);
    }
    catch (e) {
        if (req.file && fs_1.default.existsSync(req.file.path))
            fs_1.default.unlinkSync(req.file.path);
        next(e);
    }
});
router.delete('/:id/contracts/:contractId', async (req, res, next) => {
    try {
        const contract = await (0, subcontractorService_1.removeSubcontractorContract)(req.params.contractId, req.user.role);
        if (contract.filePath) {
            const p = path_1.default.join(uploadDir, contract.filePath);
            if (fs_1.default.existsSync(p))
                fs_1.default.unlinkSync(p);
        }
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
// ================= Personnel Routes =================
router.get('/:id/personnel', async (req, res, next) => {
    try {
        const list = await (0, subcontractorService_1.listSubcontractorPersonnel)(req.params.id, req.user.role);
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/personnel', async (req, res, next) => {
    try {
        const p = await (0, subcontractorService_1.addSubcontractorPersonnel)(req.params.id, req.user.role, req.body);
        res.status(201).json(p);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id/personnel/:personnelId', async (req, res, next) => {
    try {
        const p = await (0, subcontractorService_1.updateSubcontractorPersonnel)(req.params.personnelId, req.user.role, req.body);
        res.status(200).json(p);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id/personnel/:personnelId', async (req, res, next) => {
    try {
        await (0, subcontractorService_1.removeSubcontractorPersonnel)(req.params.personnelId, req.user.role);
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
// Personnel Job Assignments
router.post('/:id/personnel/:personnelId/jobs', async (req, res, next) => {
    try {
        const a = await (0, subcontractorService_1.addPersonnelJobAssignment)(req.params.id, req.params.personnelId, req.body.jobId, req.user.id, req.user.role);
        res.status(201).json(a);
    }
    catch (e) {
        next(e);
    }
});
router.patch('/:id/personnel/:personnelId/jobs/:assignmentId', async (req, res, next) => {
    try {
        const a = await (0, subcontractorService_1.updatePersonnelJobAssignment)(req.params.assignmentId, req.user.role, req.body);
        res.status(200).json(a);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id/personnel/:personnelId/jobs/:assignmentId', async (req, res, next) => {
    try {
        await (0, subcontractorService_1.removePersonnelJobAssignment)(req.params.assignmentId, req.user.role);
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
// Personnel Job Check-ins
router.get('/:id/personnel-checkins', async (req, res, next) => {
    try {
        const checkins = await (0, subcontractorService_1.listSubcontractorPersonnelCheckIns)(req.params.id, req.user.role);
        res.status(200).json(checkins);
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/personnel/:personnelId/jobs/:jobId/checkin', async (req, res, next) => {
    try {
        const c = await (0, subcontractorService_1.checkInSubcontractorPersonnel)(req.params.personnelId, req.params.jobId, req.body.date, req.user.role);
        res.status(200).json(c);
    }
    catch (e) {
        next(e);
    }
});
router.post('/:id/personnel/:personnelId/jobs/:jobId/checkout', async (req, res, next) => {
    try {
        const c = await (0, subcontractorService_1.checkOutSubcontractorPersonnel)(req.params.personnelId, req.params.jobId, req.body.date, req.user.role);
        res.status(200).json(c);
    }
    catch (e) {
        next(e);
    }
});
// Personnel Certifications
router.post('/:id/personnel/:personnelId/certifications', upload.single('file'), async (req, res, next) => {
    try {
        const data = { ...req.body };
        if (req.file) {
            data.fileName = req.file.originalname;
            data.filePath = req.file.filename;
        }
        const uploaderName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
        const c = await (0, subcontractorService_1.addPersonnelCertification)(req.params.personnelId, req.user.role, data, req.user.id, uploaderName);
        res.status(201).json(c);
    }
    catch (e) {
        if (req.file && fs_1.default.existsSync(req.file.path))
            fs_1.default.unlinkSync(req.file.path);
        next(e);
    }
});
router.patch('/:id/personnel/:personnelId/certifications/:certId', async (req, res, next) => {
    try {
        const c = await (0, subcontractorService_1.updatePersonnelCertification)(req.params.certId, req.user.role, req.body);
        res.status(200).json(c);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id/personnel/:personnelId/certifications/:certId', async (req, res, next) => {
    try {
        await (0, subcontractorService_1.removePersonnelCertification)(req.params.certId, req.user.role);
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
// Personnel Documents (Contracts, etc)
router.post('/:id/personnel/:personnelId/documents', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            throw { status: 400, message: 'File is required' };
        const data = {
            name: req.body.name || req.file.originalname,
            category: req.body.category || 'contract',
            filePath: req.file.filename,
        };
        const d = await (0, subcontractorService_1.addPersonnelDocument)(req.params.personnelId, req.user.role, data);
        res.status(201).json(d);
    }
    catch (e) {
        if (req.file && fs_1.default.existsSync(req.file.path))
            fs_1.default.unlinkSync(req.file.path);
        next(e);
    }
});
router.delete('/:id/personnel/:personnelId/documents/:docId', async (req, res, next) => {
    try {
        const doc = await (0, subcontractorService_1.removePersonnelDocument)(req.params.docId, req.user.role);
        if (doc && doc.filePath) {
            const fullPath = path_1.default.join(uploadDir, doc.filePath);
            if (fs_1.default.existsSync(fullPath))
                fs_1.default.unlinkSync(fullPath);
        }
        res.status(200).json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
