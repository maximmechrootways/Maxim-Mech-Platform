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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../middleware/authenticate");
const libraryDocumentService = __importStar(require("../services/libraryDocumentService"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// GET /api/library — all documents the user can see (role/visibility filtered)
router.get('/', async (req, res) => {
    try {
        const { type, siteId } = req.query;
        const list = await libraryDocumentService.listLibraryDocuments(req.user.id, req.user.role);
        let docs = list;
        if (type && typeof type === 'string')
            docs = docs.filter((d) => d.type === type);
        if (siteId && typeof siteId === 'string')
            docs = docs.filter((d) => d.siteId === siteId);
        res.status(200).json(docs);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch documents';
        console.error('GET /api/library error:', err);
        res.status(500).json({ error: message });
    }
});
// GET /api/library/:id
router.get('/:id', async (req, res) => {
    try {
        const doc = await libraryDocumentService.getLibraryDocumentById(req.params.id, req.user.id, req.user.role);
        res.status(200).json(doc);
    }
    catch (err) {
        const e = err;
        if (e.status === 404)
            return res.status(404).json({ error: e.message ?? 'Document not found' });
        if (e.status === 403)
            return res.status(403).json({ error: e.message ?? 'Forbidden' });
        const message = e.message ?? 'Failed to fetch document';
        res.status(500).json({ error: message });
    }
});
exports.default = router;
