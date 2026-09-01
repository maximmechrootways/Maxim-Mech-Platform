"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const fileValidation_1 = require("../utils/fileValidation");
const inspectionAttachmentService = __importStar(require("../services/inspectionAttachmentService"));
const router = (0, express_1.Router)();
const uploadDir = path_1.default.resolve(process.env.UPLOAD_DIR || 'uploads');
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10)) * 1024 * 1024;
const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        if (!fs_1.default.existsSync(uploadDir))
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (_req, _file, cb) => {
        cb(null, `insp-att-${Date.now()}-${(0, uuid_1.v4)()}.tmp`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.includes(file.mimetype)) {
            return cb(new Error('Only PDF and images (PNG, JPEG) are allowed'));
        }
        cb(null, true);
    },
});
router.get('/', authenticate_1.authenticate, async (req, res, next) => {
    try {
        const scheduleId = req.query.scheduleId;
        const list = await inspectionAttachmentService.listAllAttachments(req.user.role);
        res.status(200).json(list);
    }
    catch (e) {
        next(e);
    }
});
router.post('/', authenticate_1.authenticate, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'File is required' });
        const validated = (0, fileValidation_1.getValidatedDocumentType)(req.file.path, req.file.mimetype);
        if (validated === 'reject') {
            try {
                fs_1.default.unlinkSync(req.file.path);
            }
            catch { /* ignore */ }
            return res.status(400).json({ error: 'File content invalid. Only PDF and images (PNG, JPEG) are allowed.' });
        }
        const ext = validated === 'jpeg' ? 'jpg' : validated;
        const safeName = `insp-att-${Date.now()}-${(0, uuid_1.v4)()}.${ext}`;
        const newPath = path_1.default.join(uploadDir, safeName);
        fs_1.default.renameSync(req.file.path, newPath);
        req.file.path = newPath;
        req.file.filename = safeName;
        const scheduleId = (req.body && req.body.scheduleId);
        const notes = (req.body && req.body.notes);
        const doc = await inspectionAttachmentService.upload(req.user.id, req.user.role, req.file, { scheduleId, notes });
        res.status(201).json(doc);
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
router.get('/:id/file-url', authenticate_1.authenticate, async (req, res, next) => {
    try {
        const result = await inspectionAttachmentService.getFileUrl(req.params.id, req.user.role);
        res.status(200).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id', authenticate_1.authenticate, async (req, res, next) => {
    try {
        await inspectionAttachmentService.remove(req.params.id, req.user.role);
        res.status(200).json({ message: 'Attachment deleted' });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
