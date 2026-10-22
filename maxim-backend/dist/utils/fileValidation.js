"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIBRARY_ALLOWED_MIME_TYPES = void 0;
exports.isPdfByMagic = isPdfByMagic;
exports.isPngByMagic = isPngByMagic;
exports.isJpegByMagic = isJpegByMagic;
exports.isZipByMagic = isZipByMagic;
exports.isOleByMagic = isOleByMagic;
exports.getValidatedDocumentType = getValidatedDocumentType;
exports.sanitizeDocumentName = sanitizeDocumentName;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/** PDF magic bytes: %PDF (0x25 0x50 0x44 0x46) */
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]);
const MAGIC_LEN = 4;
/** PNG: 89 50 4E 47 0D 0A 1A 0A */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_LEN = 8;
/** JPEG: FF D8 FF */
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const JPEG_LEN = 3;
/** ZIP / OOXML (docx, xlsx): PK */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b]);
/** OLE compound (legacy .doc / .xls): D0 CF 11 E0 */
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
/** Windows executable */
const EXE_MAGIC = Buffer.from([0x4d, 0x5a]);
function readMagic(filePath, len) {
    try {
        const fd = fs_1.default.openSync(filePath, 'r');
        const buf = Buffer.alloc(len);
        const read = fs_1.default.readSync(fd, buf, 0, len, 0);
        fs_1.default.closeSync(fd);
        return read === len ? buf : null;
    }
    catch {
        return null;
    }
}
/**
 * Verify that the file at filePath is a real PDF by checking magic bytes.
 * Rejects executables or other files renamed to .pdf.
 */
function isPdfByMagic(filePath) {
    const buf = readMagic(filePath, MAGIC_LEN);
    return buf !== null && buf.equals(PDF_MAGIC);
}
function isPngByMagic(filePath) {
    const buf = readMagic(filePath, PNG_LEN);
    return buf !== null && buf.equals(PNG_MAGIC);
}
function isJpegByMagic(filePath) {
    const buf = readMagic(filePath, JPEG_LEN);
    return buf !== null && buf.equals(JPEG_MAGIC);
}
function isZipByMagic(filePath) {
    const buf = readMagic(filePath, 2);
    return buf !== null && buf.equals(ZIP_MAGIC);
}
function isOleByMagic(filePath) {
    const buf = readMagic(filePath, 4);
    return buf !== null && buf.equals(OLE_MAGIC);
}
function isExecutableByMagic(filePath) {
    const buf = readMagic(filePath, 2);
    return buf !== null && buf.equals(EXE_MAGIC);
}
exports.LIBRARY_ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'application/csv',
    'application/zip',
    'application/x-zip-compressed',
];
const SAFE_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.zip'];
/**
 * Validate file content by magic bytes. Returns allowed type or 'reject'.
 * Use this for document uploads that allow PDF and images.
 */
function getValidatedDocumentType(filePath, mimetype) {
    const mime = (mimetype || '').toLowerCase();
    if (mime === 'application/pdf' && isPdfByMagic(filePath))
        return 'pdf';
    if (mime === 'image/png' && isPngByMagic(filePath))
        return 'png';
    if ((mime === 'image/jpeg' || mime === 'image/jpg') && isJpegByMagic(filePath))
        return 'jpeg';
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
        isZipByMagic(filePath)) {
        return 'docx';
    }
    if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
        isZipByMagic(filePath)) {
        return 'xlsx';
    }
    if ((mime === 'application/zip' || mime === 'application/x-zip-compressed') && isZipByMagic(filePath)) {
        return 'zip';
    }
    if (mime === 'application/msword' && isOleByMagic(filePath))
        return 'doc';
    if (mime === 'application/vnd.ms-excel' && (isOleByMagic(filePath) || isZipByMagic(filePath))) {
        return 'xls';
    }
    if ((mime === 'text/csv' || mime === 'application/csv' || mime === 'text/plain') &&
        !isExecutableByMagic(filePath) &&
        !isPdfByMagic(filePath) &&
        !isOleByMagic(filePath)) {
        return mime === 'text/plain' ? 'txt' : 'csv';
    }
    return 'reject';
}
/**
 * Sanitize display name for uploads: alphanumeric, spaces, hyphen, underscore, valid extension.
 * Returns a safe filename (no path traversal, no double extension).
 */
function sanitizeDocumentName(name) {
    if (!name || typeof name !== 'string')
        return 'document.pdf';
    const base = path_1.default.basename(name).replace(/\s+/g, ' ').trim();
    const safe = base.replace(/[^a-zA-Z0-9._\-\s]/g, '').slice(0, 200) || 'document';
    const ext = path_1.default.extname(safe).toLowerCase();
    const finalExt = SAFE_EXTS.includes(ext) ? ext : '.pdf';
    const withoutExt = safe.replace(/\.[^.]*$/, '').trim() || 'document';
    return `${withoutExt}${finalExt}`;
}
