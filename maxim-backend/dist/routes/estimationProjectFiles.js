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
const estimationProjectFileService = __importStar(require("../services/estimationProjectFileService"));
const router = (0, express_1.Router)();
const uploadDir = path_1.default.resolve(process.env.UPLOAD_DIR || 'uploads');
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10)) * 1024 * 1024;
const ALLOWED_NAME = /\.(pdf|png|jpe?g|gif|webp|docx?|xlsx?|csv|txt|zip)$/i;
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        if (!fs_1.default.existsSync(uploadDir))
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (_req, _file, cb) => {
        cb(null, `est-${Date.now()}-${(0, uuid_1.v4)()}.tmp`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_NAME.test(file.originalname)) {
            return cb(new Error('Allowed: PDF, images, Word, Excel, CSV, TXT, ZIP (by file extension).'));
        }
        cb(null, true);
    },
});
router.get('/', authenticate_1.authenticate, async (req, res, next) => {
    try {
        const folderParam = typeof req.query.folder === 'string' ? req.query.folder : undefined;
        const folder = folderParam ? estimationProjectFileService.parseEstimationFolder(folderParam) : undefined;
        if (folderParam && !folder) {
            return res.status(400).json({ error: 'Invalid folder filter' });
        }
        const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined;
        const list = await estimationProjectFileService.listFiles(req.user.role, folder ?? undefined, siteId);
        res.json(list);
    }
    catch (e) {
        next(e);
    }
});
router.post('/', authenticate_1.authenticate, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File is required' });
        }
        const body = req.body;
        const folderRaw = body?.folder ?? '';
        const name = body?.name || undefined;
        const siteId = body?.siteId || undefined;
        const notes = body?.notes || undefined;
        const row = await estimationProjectFileService.uploadFile(req.user.id, req.user.role, req.file, { folder: folderRaw, name, siteId, notes });
        res.status(201).json(row);
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
router.get('/:id/file', authenticate_1.authenticate, async (req, res, next) => {
    try {
        const doc = await estimationProjectFileService.getFileMetaForUser(req.params.id, req.user.role);
        const { getBlobSasUrl } = await Promise.resolve().then(() => __importStar(require('../services/blobStorageService')));
        const sasUrl = await getBlobSasUrl(doc.filePath, 5);
        const blobRes = await fetch(sasUrl);
        if (!blobRes.ok)
            return res.status(404).json({ error: 'File not found' });
        const asDownload = String(req.query.download || '').toLowerCase() === 'true';
        const mime = doc.mimeType || blobRes.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const disposition = asDownload ? 'attachment' : 'inline';
        const safeName = (doc.originalName || 'document').replace(/"/g, '');
        res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
        const arrayBuffer = await blobRes.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
    }
    catch (e) {
        next(e);
    }
});
router.delete('/:id', authenticate_1.authenticate, async (req, res, next) => {
    try {
        await estimationProjectFileService.removeFile(req.params.id, req.user.role);
        res.json({ message: 'Deleted' });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
