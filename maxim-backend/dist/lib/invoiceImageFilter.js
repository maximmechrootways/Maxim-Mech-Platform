"use strict";
/**
 * Heuristics for deciding whether an *image* email attachment (PNG/JPEG/etc.)
 * is an actual invoice/receipt/statement document versus a decorative image
 * such as a company logo or email-signature banner.
 *
 * PDFs are intentionally NOT handled here — they are always treated as
 * documents. This guard only applies to image attachments so that logos pasted
 * at the bottom of an email no longer get turned into bogus invoice records.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isImageAttachmentType = isImageAttachmentType;
exports.imageTextHasFinancialContent = imageTextHasFinancialContent;
exports.readImageDimensions = readImageDimensions;
exports.classifyInvoiceImageAttachment = classifyInvoiceImageAttachment;
// A real scanned/photographed invoice is large. Logos and signature images are
// small. These thresholds are deliberately conservative so we don't drop a
// genuine document when OCR text is unavailable.
const MIN_DOCUMENT_LONG_SIDE_PX = 900;
const MIN_DOCUMENT_AREA_PX = 480000;
// Minimum amount of OCR text before we'll judge an image purely on its content.
const MIN_OCR_TEXT_FOR_CONTENT_CHECK = 25;
function isImageAttachmentType(mimeType, filename) {
    const mime = (mimeType || '').toLowerCase();
    const name = (filename || '').toLowerCase();
    return mime.startsWith('image/') || /\.(png|jpe?g|webp|tiff?|gif|bmp)$/.test(name);
}
const MONEY_RE = /\b\d{1,3}(?:,\d{3})*\.\d{2}\b/;
const FINANCE_KEYWORD_PATTERNS = [
    /\binvoice\b/i,
    /\breceipt\b/i,
    /\bstatement\b/i,
    /\bsub\s*-?\s*total\b/i,
    /\btotal\b/i,
    /\bbalance\b/i,
    /\bamount\s+(?:due|owing|paid)\b/i,
    /\btax\b/i,
    /\bhst\b/i,
    /\bgst\b/i,
    /\bpst\b/i,
    /\bqst\b/i,
    /\bvat\b/i,
    /\bpayment\b/i,
    /\bdue\s+date\b/i,
    /\bpurchase\s+order\b/i,
    /\bp\.?o\.?\s*(?:no|number|#)/i,
    /\bqty\b/i,
    /\bquantity\b/i,
    /\bunit\s+price\b/i,
    /\bremit\b/i,
    /\bbill\s+to\b/i,
];
/** True when OCR text from an image reads like a financial document. */
function imageTextHasFinancialContent(text) {
    if (!text)
        return false;
    if (MONEY_RE.test(text))
        return true;
    let hits = 0;
    for (const pattern of FINANCE_KEYWORD_PATTERNS) {
        if (pattern.test(text)) {
            hits += 1;
            if (hits >= 2)
                return true;
        }
    }
    return false;
}
function readJpegDimensions(buffer) {
    const len = buffer.length;
    let offset = 2;
    while (offset + 9 < len) {
        if (buffer[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        let marker = buffer[offset + 1];
        while (marker === 0xff && offset + 1 < len) {
            offset += 1;
            marker = buffer[offset + 1];
        }
        offset += 2;
        const isStartOfFrame = (marker >= 0xc0 && marker <= 0xc3) ||
            (marker >= 0xc5 && marker <= 0xc7) ||
            (marker >= 0xc9 && marker <= 0xcb) ||
            (marker >= 0xcd && marker <= 0xcf);
        if (isStartOfFrame) {
            if (offset + 7 > len)
                return null;
            const height = buffer.readUInt16BE(offset + 3);
            const width = buffer.readUInt16BE(offset + 5);
            if (width > 0 && height > 0)
                return { width, height };
            return null;
        }
        // Standalone markers carry no length payload.
        if ((marker >= 0xd0 && marker <= 0xd9) || marker === 0x01)
            continue;
        if (offset + 2 > len)
            return null;
        const segmentLength = buffer.readUInt16BE(offset);
        if (segmentLength < 2)
            return null;
        offset += segmentLength;
    }
    return null;
}
function readWebpDimensions(buffer) {
    const format = buffer.toString('ascii', 12, 16);
    if (format === 'VP8 ') {
        if (buffer.length < 30)
            return null;
        const width = buffer.readUInt16LE(26) & 0x3fff;
        const height = buffer.readUInt16LE(28) & 0x3fff;
        if (width > 0 && height > 0)
            return { width, height };
        return null;
    }
    if (format === 'VP8L') {
        if (buffer.length < 25)
            return null;
        const b0 = buffer[21];
        const b1 = buffer[22];
        const b2 = buffer[23];
        const b3 = buffer[24];
        const width = 1 + (((b1 & 0x3f) << 8) | b0);
        const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
        if (width > 0 && height > 0)
            return { width, height };
        return null;
    }
    if (format === 'VP8X') {
        if (buffer.length < 30)
            return null;
        const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
        const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
        if (width > 0 && height > 0)
            return { width, height };
        return null;
    }
    return null;
}
/** Best-effort intrinsic pixel dimensions from common image headers. */
function readImageDimensions(buffer) {
    if (!buffer || buffer.length < 24)
        return null;
    // PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 &&
        buffer[2] === 0x4e && buffer[3] === 0x47) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return width > 0 && height > 0 ? { width, height } : null;
    }
    // GIF
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        const width = buffer.readUInt16LE(6);
        const height = buffer.readUInt16LE(8);
        return width > 0 && height > 0 ? { width, height } : null;
    }
    // BMP
    if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
        const width = buffer.readInt32LE(18);
        const height = Math.abs(buffer.readInt32LE(22));
        return width > 0 && height > 0 ? { width, height } : null;
    }
    // JPEG
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        return readJpegDimensions(buffer);
    }
    // WebP (RIFF....WEBP)
    if (buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP') {
        return readWebpDimensions(buffer);
    }
    return null;
}
/**
 * Decide whether an image attachment is a real invoice/document.
 *
 * Order of evidence:
 *  1. OCR text that reads like a financial document → accept.
 *  2. Enough OCR text but no financial signals → reject (logo/marketing image).
 *  3. Little/no OCR text → fall back to image size; logos are small, scans are large.
 */
function classifyInvoiceImageAttachment(input) {
    const text = (input.ocrText || '').trim();
    const dimensions = readImageDimensions(input.buffer);
    if (imageTextHasFinancialContent(text)) {
        return { isLikelyInvoice: true, reason: 'financial_content', dimensions };
    }
    if (text.length >= MIN_OCR_TEXT_FOR_CONTENT_CHECK) {
        return { isLikelyInvoice: false, reason: 'image_text_not_financial', dimensions };
    }
    if (!dimensions) {
        return { isLikelyInvoice: false, reason: 'image_unverifiable_no_text', dimensions };
    }
    const longSide = Math.max(dimensions.width, dimensions.height);
    const area = dimensions.width * dimensions.height;
    if (longSide < MIN_DOCUMENT_LONG_SIDE_PX || area < MIN_DOCUMENT_AREA_PX) {
        return { isLikelyInvoice: false, reason: 'image_too_small_for_document', dimensions };
    }
    return { isLikelyInvoice: true, reason: 'large_image_possible_scan', dimensions };
}
