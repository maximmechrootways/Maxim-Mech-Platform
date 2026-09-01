import fs from 'fs'
import path from 'path'

/** PDF magic bytes: %PDF (0x25 0x50 0x44 0x46) */
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46])
const MAGIC_LEN = 4
/** PNG: 89 50 4E 47 0D 0A 1A 0A */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_LEN = 8
/** JPEG: FF D8 FF */
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])
const JPEG_LEN = 3
/** ZIP / OOXML (docx, xlsx): PK */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b])
/** OLE compound (legacy .doc / .xls): D0 CF 11 E0 */
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0])
/** Windows executable */
const EXE_MAGIC = Buffer.from([0x4d, 0x5a])

function readMagic(filePath: string, len: number): Buffer | null {
    try {
        const fd = fs.openSync(filePath, 'r')
        const buf = Buffer.alloc(len)
        const read = fs.readSync(fd, buf, 0, len, 0)
        fs.closeSync(fd)
        return read === len ? buf : null
    } catch {
        return null
    }
}

/**
 * Verify that the file at filePath is a real PDF by checking magic bytes.
 * Rejects executables or other files renamed to .pdf.
 */
export function isPdfByMagic(filePath: string): boolean {
    const buf = readMagic(filePath, MAGIC_LEN)
    return buf !== null && buf.equals(PDF_MAGIC)
}

export function isPngByMagic(filePath: string): boolean {
    const buf = readMagic(filePath, PNG_LEN)
    return buf !== null && buf.equals(PNG_MAGIC)
}

export function isJpegByMagic(filePath: string): boolean {
    const buf = readMagic(filePath, JPEG_LEN)
    return buf !== null && buf.equals(JPEG_MAGIC)
}

export function isZipByMagic(filePath: string): boolean {
    const buf = readMagic(filePath, 2)
    return buf !== null && buf.equals(ZIP_MAGIC)
}

export function isOleByMagic(filePath: string): boolean {
    const buf = readMagic(filePath, 4)
    return buf !== null && buf.equals(OLE_MAGIC)
}

function isExecutableByMagic(filePath: string): boolean {
    const buf = readMagic(filePath, 2)
    return buf !== null && buf.equals(EXE_MAGIC)
}

/** Result of validating uploaded file by magic bytes; 'reject' means not allowed. */
export type ValidatedFileType =
    | 'pdf'
    | 'png'
    | 'jpeg'
    | 'doc'
    | 'docx'
    | 'xls'
    | 'xlsx'
    | 'csv'
    | 'txt'
    | 'zip'
    | 'reject'

export const LIBRARY_ALLOWED_MIME_TYPES = [
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
] as const

const SAFE_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.zip']

/**
 * Validate file content by magic bytes. Returns allowed type or 'reject'.
 * Use this for document uploads that allow PDF and images.
 */
export function getValidatedDocumentType(filePath: string, mimetype: string): ValidatedFileType {
    const mime = (mimetype || '').toLowerCase()
    if (mime === 'application/pdf' && isPdfByMagic(filePath)) return 'pdf'
    if (mime === 'image/png' && isPngByMagic(filePath)) return 'png'
    if ((mime === 'image/jpeg' || mime === 'image/jpg') && isJpegByMagic(filePath)) return 'jpeg'

    if (
        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
        isZipByMagic(filePath)
    ) {
        return 'docx'
    }
    if (
        mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
        isZipByMagic(filePath)
    ) {
        return 'xlsx'
    }
    if ((mime === 'application/zip' || mime === 'application/x-zip-compressed') && isZipByMagic(filePath)) {
        return 'zip'
    }
    if (mime === 'application/msword' && isOleByMagic(filePath)) return 'doc'
    if (mime === 'application/vnd.ms-excel' && (isOleByMagic(filePath) || isZipByMagic(filePath))) {
        return 'xls'
    }
    if (
        (mime === 'text/csv' || mime === 'application/csv' || mime === 'text/plain') &&
        !isExecutableByMagic(filePath) &&
        !isPdfByMagic(filePath) &&
        !isOleByMagic(filePath)
    ) {
        return mime === 'text/plain' ? 'txt' : 'csv'
    }
    return 'reject'
}

/**
 * Sanitize display name for uploads: alphanumeric, spaces, hyphen, underscore, valid extension.
 * Returns a safe filename (no path traversal, no double extension).
 */
export function sanitizeDocumentName(name: string | undefined): string {
    if (!name || typeof name !== 'string') return 'document.pdf'
    const base = path.basename(name).replace(/\s+/g, ' ').trim()
    const safe = base.replace(/[^a-zA-Z0-9._\-\s]/g, '').slice(0, 200) || 'document'
    const ext = path.extname(safe).toLowerCase()
    const finalExt = SAFE_EXTS.includes(ext) ? ext : '.pdf'
    const withoutExt = safe.replace(/\.[^.]*$/, '').trim() || 'document'
    return `${withoutExt}${finalExt}`
}
