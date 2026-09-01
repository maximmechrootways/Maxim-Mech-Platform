import { extractPagesWithOCR } from './document-intelligence-extractor'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text?: string }>

function azureOcrConfigured(): boolean {
    return Boolean(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY)
}

async function extractWithPdfParse(buffer: Buffer): Promise<string> {
    const parsed = await pdfParse(buffer)
    return String(parsed.text || '').replace(/\s+/g, ' ').trim()
}

function isImageAttachment(mimeType?: string, filename?: string): boolean {
    const mime = (mimeType || '').toLowerCase()
    const name = (filename || '').toLowerCase()
    return mime.startsWith('image/')
        || /\.(png|jpe?g|webp|tiff?)$/.test(name)
}

/**
 * Extract readable text from an invoice/receipt attachment (PDF or image).
 * Prefers Azure Document Intelligence when configured; falls back to pdf-parse for text-layer PDFs.
 */
export async function extractInvoiceAttachmentText(
    buffer: Buffer,
    options?: { mimeType?: string; filename?: string },
): Promise<string> {
    if (azureOcrConfigured()) {
        try {
            const pages = await extractPagesWithOCR(buffer)
            const text = pages.map((page) => page.text).join('\n').trim()
            if (text.length > 20) return text
        } catch (error) {
            console.warn('[invoice-pdf] Azure OCR failed:', error)
            if (isImageAttachment(options?.mimeType, options?.filename)) {
                throw new Error('Could not extract text from image — configure Azure Document Intelligence')
            }
        }
    } else if (isImageAttachment(options?.mimeType, options?.filename)) {
        throw new Error('Image receipts require Azure Document Intelligence on the server')
    }

    const text = await extractWithPdfParse(buffer)
    if (text.length > 0) return text

    throw new Error('Could not extract text from attachment')
}

/** @deprecated Use extractInvoiceAttachmentText */
export async function extractInvoicePdfText(buffer: Buffer): Promise<string> {
    return extractInvoiceAttachmentText(buffer)
}

function normalizeSlashDate(value: string): string {
    const [month, day, year] = value.split('/')
    if (!month || !day || !year) return value
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

export type PdfInvoiceAmounts = {
    subtotal: number | null
    taxAmount: number | null
    totalAmount: number | null
}

export type BasicPdfInvoiceExtraction = {
    vendor?: { name?: string }
    invoiceNumber?: string
    invoiceDate?: string
    dueDate?: string
    subtotal?: number
    taxAmount?: number
    totalAmount?: number
    currency?: string
    poNumber?: string
    confidence?: number
    notes?: string
}

function parseMoneyToken(raw: string | undefined): number | null {
    if (!raw) return null
    const cleaned = raw.replace(/[$,\s]/g, '').replace(/^-+|-+$/g, '')
    const value = Number(cleaned)
    if (!Number.isFinite(value) || value <= 0) return null
    return Number(value.toFixed(2))
}

const VENDOR_STOP_RE =
    /\s+(?:\d+\s+(?:[A-Z][A-Za-z]*\s+){0,3}(?:ST|STREET|DR|DRIVE|RD|ROAD|AVE|AVENUE|BLVD|BOULEVARD|LANE|WAY|UNIT|#)|PO\s*BOX|Tel:|Fax:|E-?Mail:|GST\/HST|INVOICE\s+NO|Page:|Statement\s+Date|Customer\s*#|Bill\s+To:|RECEIVED\s+BY)/i

const NOT_VENDOR_RE =
    /\b(?:maxim\s+mechanical|nobleton\s+lakes|etobicoke|forwarded\s+message)\b/i

/** Trim addresses, remit blocks, and contact info from a vendor string. */
export function cleanVendorName(raw: string | undefined | null): string | null {
    if (!raw) return null
    let name = raw
        .replace(/\s+/g, ' ')
        .replace(/^(?:INVOICE\s+)?(?:SEND\s+ALL\s+PAYMENTS\s+TO:|PLEASE\s+REMIT(?:\s+ALL\s+PAYMENTS)?\s+TO:|REMIT\s+TO:)\s*/i, '')
        .replace(/^Page:\s*[\d/]+\s*/i, '')
        .replace(/\bStatement\b/gi, ' ')
        .trim()

    const stop = name.match(VENDOR_STOP_RE)
    if (stop?.index != null && stop.index > 4) {
        name = name.slice(0, stop.index).trim()
    }

    const inc = name.match(/^(.{2,90}?\b(?:INC|LTD|CORP|LLC|LP|CO)\.?)(?:\s|$)/i)
    if (inc?.[1] && inc[1].length <= 80) name = inc[1].trim()

    if (name.length > 80) name = name.slice(0, 80).trim()

    name = name.replace(/[®,]/g, (m) => (m === '®' ? '' : m)).replace(/\s+/g, ' ').trim()
    if (name.length < 2 || NOT_VENDOR_RE.test(name)) return null
    return name
}

function guessVendorFromSubject(subject: string | undefined): string | null {
    if (!subject) return null
    const cleaned = subject.replace(/^fwd:\s*/i, '').trim()
    const patterns = [
        /your\s+(.+?)\s+invoices?\b/i,
        /your\s+(.+?)\s+statement\b/i,
        /from\s+(.+?)\s+invoices?\b/i,
        /invoice\s+from\s+(.+?)$/i,
    ]
    for (const pattern of patterns) {
        const match = cleaned.match(pattern)
        if (match?.[1]) {
            const name = cleanVendorName(match[1])
            if (name) return name
        }
    }
    return null
}

/** Best-effort vendor company name from PDF text and email context. */
export function guessVendorFromPdfText(
    text: string,
    context?: { from?: string; subject?: string; bodyText?: string },
): string | null {
    const compact = text.replace(/\s+/g, ' ').trim()
    const candidates: string[] = []

    const subjectVendor = guessVendorFromSubject(context?.subject)
    if (subjectVendor) candidates.push(subjectVendor)

    const bodyVendor = guessVendorFromEmailBody(context?.bodyText)
    if (bodyVendor) candidates.push(bodyVendor)

    const remit = compact.match(
        /(?:REMIT\s+TO|SEND\s+ALL\s+PAYMENTS\s+TO):\s*([A-Z0-9][^.]{3,100}?(?:INC|LTD|CORP|LLC|LP|CO)\.?)/i,
    )
    if (remit?.[1]) candidates.push(cleanVendorName(remit[1])!)

    const brandRentals = compact.match(/\b(SUNBELT®?\s*RENTALS(?:\s+OF\s+CANADA)?(?:\s+INC)?\.?)/i)
    if (brandRentals?.[1]) candidates.push(cleanVendorName(brandRentals[1].replace(/®/g, ''))!)

    const bdiCanada = compact.match(/\b(BDI\s+Canada\s+Inc\.?)\b/i)
    if (bdiCanada?.[1]) candidates.push(cleanVendorName(bdiCanada[1])!)

    const liftEquipment = compact.match(/\b([A-Z][A-Z\s-]{2,40}LIFT\s+EQUIPMENT)\b/)
    if (liftEquipment?.[1]) candidates.push(cleanVendorName(liftEquipment[1])!)

    const startCompany = compact.match(/^([A-Z][A-Za-z0-9\s&.'-]{2,70}?\b(?:INC|LTD|CORP|LLC|LP)\.?)\b/)
    if (startCompany?.[1]) candidates.push(cleanVendorName(startCompany[1])!)

    const beforeInvoice = compact.match(/^([A-Z][A-Za-z0-9\s&.'-]{2,70}?)\s+INVOICE\b/)
    if (beforeInvoice?.[1]) candidates.push(cleanVendorName(beforeInvoice[1])!)

    const equipmentService = compact.match(/([A-Z][A-Za-z0-9\s&.'-]{2,50}?\b(?:INC|LTD|CORP)\.?)\s+\d{1,5}\s+[A-Za-z]/)
    if (equipmentService?.[1]) candidates.push(cleanVendorName(equipmentService[1])!)

    const valid = candidates.filter((c): c is string => Boolean(c && c.length >= 3 && !NOT_VENDOR_RE.test(c)))
    if (valid.length === 0) return null

  valid.sort((a, b) => {
        const aFromSubject = a === subjectVendor ? 0 : 1
        const bFromSubject = b === subjectVendor ? 0 : 1
        if (aFromSubject !== bFromSubject) return aFromSubject - bFromSubject
        return a.length - b.length
    })
    return valid[0]
}

const KNOWN_VENDOR_DOMAINS: Record<string, string> = {
    'torcanlift.com': 'Torcan Lift Equipment',
    'sunbeltrentals.com': 'Sunbelt Rentals',
    'traditionalair.com': 'Traditional Air Systems',
    'nextsupply.ca': 'Next Supply',
    'bdi-canada.com': 'BDI Canada',
    'bdiexpress.com': 'BDI Canada',
    'kilmerenv.com': 'Kilmer Environmental',
    'classictowing.ca': 'Classic Towing',
    'flextech-ind.com': 'Flextech Industries',
    'proventilation.com': 'ProVent',
}

function vendorFromEmailAddress(email: string): string | null {
    const normalized = email.trim().toLowerCase()
    const domain = normalized.split('@')[1]
    if (!domain) return null
    if (KNOWN_VENDOR_DOMAINS[domain]) return KNOWN_VENDOR_DOMAINS[domain]

    const base = domain.split('.')[0]
    if (/^(gmail|googlemail|outlook|hotmail|yahoo|maximmech)/.test(base)) return null
    if (base.includes('torcan') && base.includes('lift')) return 'Torcan Lift Equipment'
    if (base.includes('sunbelt')) return 'Sunbelt Rentals'
    if (base.includes('traditional') && base.includes('air')) return 'Traditional Air Systems'
    if (base === 'nextsupply' || base.includes('nextsupply')) return 'Next Supply'
    if (base === 'bdi-canada' || base.includes('bdi')) return 'BDI Canada'
    return null
}

const FREE_EMAIL_PROVIDERS = /^(gmail|googlemail|outlook|hotmail|live|yahoo|ymail|icloud|me|aol|proton|protonmail|maximmech|maximmechinc)$/

/** Turn a sender domain into a readable vendor name (last resort). */
function vendorNameFromDomain(domain: string | undefined): string | null {
    if (!domain) return null
    const base = domain.split('.')[0]
    if (!base || FREE_EMAIL_PROVIDERS.test(base)) return null
    const words = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (words.length < 2) return null
    const titled = words
        .split(' ')
        .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
        .join(' ')
    if (NOT_VENDOR_RE.test(titled)) return null
    return titled
}

const VENDOR_SUFFIX_RE = /\b(INC|LTD|LLC|CORP|CO|LP|GROUP|HOLDINGS|SYSTEMS|RENTALS|SUPPLY|EQUIPMENT|MECHANICAL|ENVIRONMENTAL|INDUSTRIES|SERVICES|SOLUTIONS|CONSTRUCTION|ELECTRIC|PLUMBING)\b/i

/**
 * Best-effort vendor from the email "From" header. Order of trust:
 *  1. Known vendor domain map.
 *  2. Display name that clearly names a company (carries a corporate suffix).
 *  3. Readable name derived from the sender domain.
 * Returns null for our own mailbox and generic free-email providers so we never
 * label an invoice with a forwarder's personal name.
 */
export function guessVendorFromSender(from: string | undefined | null): string | null {
    if (!from) return null
    const raw = from.trim()

    const emailMatch = raw.match(/<([^>]+@[^>]+)>/) ?? raw.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i)
    const email = emailMatch?.[1]?.trim().toLowerCase()
    const domain = email?.split('@')[1]

    if (email) {
        const known = vendorFromEmailAddress(email)
        if (known) return known
    }

    const displayMatch = raw.match(/^\s*"?([^"<]+?)"?\s*</)
    const display = displayMatch?.[1]?.trim()
    if (display && !display.includes('@')) {
        const cleaned = cleanVendorName(display)
        if (cleaned && VENDOR_SUFFIX_RE.test(cleaned)) return cleaned
    }

    return vendorNameFromDomain(domain)
}

function guessVendorFromEmailBody(body: string | undefined): string | null {
    if (!body) return null

    for (const match of body.matchAll(/From:\s*<?([^>\n]+@[^>\n>]+)>?/gi)) {
        const fromVendor = vendorFromEmailAddress(match[1])
        if (fromVendor) return fromVendor
    }

    for (const match of body.matchAll(/<?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})>?/gi)) {
        const emailVendor = vendorFromEmailAddress(match[1])
        if (emailVendor) return emailVendor
    }

    const namedCompany = body.match(/\*?(BDI\s+Canada\s+Inc\.?)\*?/i)
    if (namedCompany?.[1]) return cleanVendorName(namedCompany[1])

    const torcan = body.match(/\b(TORCAN\s+LIFT\s+EQUIPMENT)\b/i)
    if (torcan?.[1]) return cleanVendorName(torcan[1])

    return null
}

function isStatementDocument(text: string): boolean {
    return /\bStatement\b/i.test(text) && /Balance\s*Due/i.test(text)
}

function parseSubtotalTaxTotalTriple(text: string): PdfInvoiceAmounts | null {
    const triple = text.match(/(\d{1,7}\.\d{2})\s+(\d{1,7}\.\d{2})\s+(\d{1,7}\.\d{2})/)
    if (!triple) return null
    const subtotal = parseMoneyToken(triple[1])
    const taxAmount = parseMoneyToken(triple[2])
    const totalAmount = parseMoneyToken(triple[3])
    if (subtotal == null || taxAmount == null || totalAmount == null) return null
    if (Math.abs(totalAmount - (subtotal + taxAmount)) > 0.05) return null
    return { subtotal, taxAmount, totalAmount }
}

/** Extract subtotal, tax, and final total from labeled PDF text. */
export function guessAmountsFromPdfText(text: string): PdfInvoiceAmounts {
    const compact = text.replace(/\s+/g, ' ').trim()
    const statement = isStatementDocument(compact)

    let subtotal: number | null = null
    let taxAmount: number | null = null
    let totalAmount: number | null = null

    if (statement) {
        const balanceMatches = [...compact.matchAll(/Balance\s*Due\s*-?\$?\s*([\d,]+\.\d{2})/gi)]
        const balanceValues = balanceMatches
            .map((match) => parseMoneyToken(match[1]))
            .filter((value): value is number => value != null)
        if (balanceValues.length > 0) {
            totalAmount = balanceValues[balanceValues.length - 1]
        }
        const currentMatch = compact.match(/\bCurrent\s*([\d,]+\.\d{2})/i)
        if (currentMatch && totalAmount == null) {
            totalAmount = parseMoneyToken(currentMatch[1])
        }
        return { subtotal: null, taxAmount: null, totalAmount }
    }

    const triple = parseSubtotalTaxTotalTriple(compact)
    if (triple) return triple

    const subtotalPatterns = [
        /\bSub\s*-?\s*total\s*:?\s*([\d,]+\.\d{2})/i,
        /\bINVOICE\s+TOTAL\s+AREA\s+SUBTOTAL\s+([\d,]+\.\d{2})/i,
    ]
    for (const pattern of subtotalPatterns) {
        const match = compact.match(pattern)
        const value = parseMoneyToken(match?.[1])
        if (value != null) {
            subtotal = value
            break
        }
    }

    const taxPatterns = [
        /\bHST\s*(?:\(\s*\d+\s*%?\s*\))?\s*([\d,]+\.\d{2})/i,
        /\bGST\s*(?:\(\s*\d+\s*%?\s*\))?\s*([\d,]+\.\d{2})/i,
        /\bPST\s*([\d,]+\.\d{2})/i,
        /\bQST\s*([\d,]+\.\d{2})/i,
        /\bVAT\s*([\d,]+\.\d{2})/i,
        /\bHST(?!\s*#)\s*([\d,]+\.\d{2})/i,
    ]
    for (const pattern of taxPatterns) {
        const match = compact.match(pattern)
        const value = parseMoneyToken(match?.[1])
        if (value != null) {
            taxAmount = value
            break
        }
    }

    const totalPatterns = [
        /\bBalance\s*Due\s*-?\$?\s*([\d,]+\.\d{2})/i,
        /\bAmount\s*Owing\s*([\d,]+\.\d{2})/i,
        /\bAmount\s*Due\s*-?\$?\s*([\d,]+\.\d{2})/i,
        /\bTotal\s*Amount\s*([\d,]+\.\d{2})/i,
        /\bInvoice\s*Total\s*([\d,]+\.\d{2})/i,
        /\bGrand\s*Total\s*([\d,]+\.\d{2})/i,
        /(?<!Sub)\bTotal\s*:?\s*([\d,]+\.\d{2})/i,
    ]
    for (const pattern of totalPatterns) {
        const match = compact.match(pattern)
        const value = parseMoneyToken(match?.[1])
        if (value != null) {
            totalAmount = value
            break
        }
    }

    if (totalAmount == null && subtotal != null && taxAmount != null) {
        totalAmount = Number((subtotal + taxAmount).toFixed(2))
    }

    if (subtotal == null || totalAmount == null) {
        const lineItemMatch = compact.match(/(\d{1,4})(\d{1,3}\.\d{2})(\d{1,3}(?:,\d{3})*\.\d{2})/)
        if (lineItemMatch) {
            const lineTotal = parseMoneyToken(lineItemMatch[3])
            if (lineTotal != null) {
                if (subtotal == null) subtotal = lineTotal
                if (totalAmount == null && taxAmount == null) totalAmount = lineTotal
            }
        }
    }

    if (totalAmount != null && subtotal != null && taxAmount != null) {
        const expected = Number((subtotal + taxAmount).toFixed(2))
        if (Math.abs(totalAmount - subtotal) < 0.01 && expected > subtotal) {
            totalAmount = expected
        }
    }

    return { subtotal, taxAmount, totalAmount }
}

const INVALID_INVOICE_TOKENS = new Set([
    'date', 'customer', 'page', 'view', 'box', 'charge', 'paid', 'balance',
    'invoice', 'number', 'no', 'total', 'subtotal', 'amount', 'po', 'job',
    'name', 'remit', 'statement', 'current', 'days',
])

/** Reject label words mistaken for invoice numbers (Date, Customer, etc.). */
export function isValidInvoiceNumber(value: string | undefined | null): boolean {
    if (!value) return false
    const trimmed = value.trim()
    if (trimmed.length < 3 || trimmed.length > 40) return false
    if (INVALID_INVOICE_TOKENS.has(trimmed.toLowerCase())) return false
    if (!/\d/.test(trimmed)) return false
    if (/^charge|^balance|^paid/i.test(trimmed)) return false
    return true
}

export function guessInvoiceNumberFromPdfText(
    text: string,
    context?: { subject?: string },
): string | null {
    if (context?.subject) {
        const stmt = context.subject.replace(/^fwd:\s*/i, '').match(/statement\s+(\d{4,})/i)
        if (stmt?.[1] && isValidInvoiceNumber(stmt[1])) return stmt[1].trim()
    }

    const compact = text.replace(/\s+/g, ' ').trim()
    const candidates: string[] = []

    const leading = compact.match(/^(\d{6,}-\d{3,4})\b/)
    if (leading?.[1]) candidates.push(leading[1])

    const invNoGlued = compact.match(/Invoice\s+No\.?:\s*(?:Date:\s*)?(?:Page:\s*)?(\d{4,})/i)
    if (invNoGlued?.[1]) candidates.push(invNoGlued[1])

    const invHash = compact.match(/INVOICE\s*#\s*([A-Z0-9][\w-]{2,})/i)
    if (invHash?.[1]) candidates.push(invHash[1])

    const invNo = compact.match(/INVOICE\s*(?:NO\.?|NUMBER)\s*[:#]?\s*([A-Z0-9][\w-]{2,})/i)
    if (invNo?.[1]) candidates.push(invNo[1])

    const longDash = compact.match(/\b(\d{8,}-\d{3,4})\b/)
    if (longDash?.[1]) candidates.push(longDash[1])

    for (const candidate of candidates) {
        if (isValidInvoiceNumber(candidate)) return candidate.trim()
    }
    return null
}

const INVALID_PO_TOKENS = new Set([
    'box', 'no', 'number', 'customer', 'charge', 'job', 'date', 'page',
    'invoice', 'remit', 'paid', 'balance', 'total', 'amount', 'name',
])

export function isValidPoNumber(value: string | undefined | null): boolean {
    if (!value) return false
    const trimmed = value.trim()
    if (trimmed.length < 2 || trimmed.length > 30) return false
    if (INVALID_PO_TOKENS.has(trimmed.toLowerCase())) return false
    if (!/\d/.test(trimmed)) return false
    return true
}

export function guessPoNumberFromPdfText(text: string): string | null {
    const compact = text.replace(/\s+/g, ' ').trim()
    const patterns = [
        /PURCHASE\s+ORDER\s*(?:NO\.?|NUMBER|#)?\s*[:#]?\s*([A-Z0-9][\w-]{1,24})/i,
        /(?<!PO\s)P\.?O\.?\s*(?:NO\.?|NUMBER|#)\s*[:#]?\s*([A-Z0-9][\w-]{1,24})/i,
        /JOB\s*(?:NO\.?|NUMBER|#)\s*[:#]?\s*([A-Z0-9][\w-]{1,24})/i,
    ]
    for (const pattern of patterns) {
        const match = compact.match(pattern)
        const value = match?.[1]?.trim()
        if (value && isValidPoNumber(value)) return value
    }
    return null
}

/** Regex-based extraction when Claude is unavailable or fails. */
export function extractBasicInvoiceFieldsFromPdfText(
    text: string,
    context?: { subject?: string; from?: string; bodyText?: string },
): BasicPdfInvoiceExtraction {
    const compact = text.replace(/\s+/g, ' ').trim()
    const vendorName = guessVendorFromPdfText(compact, context)
    const invoiceNumber = guessInvoiceNumberFromPdfText(compact, { subject: context?.subject })
    const invoiceDateMatch = compact.match(
        /(?:INVOICE\s*)?DATE\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i,
    )
    const dueDateMatch = compact.match(/DUE\s*(?:DATE)?\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i)
    const poNumber = guessPoNumberFromPdfText(compact)

    const amounts = guessAmountsFromPdfText(compact)
    const currency = /\bUSD\b/i.test(compact) ? 'USD' : 'CAD'

    return {
        vendor: vendorName ? { name: vendorName } : undefined,
        invoiceNumber: invoiceNumber ?? undefined,
        invoiceDate: invoiceDateMatch?.[1]?.includes('/')
            ? normalizeSlashDate(invoiceDateMatch[1])
            : invoiceDateMatch?.[1],
        dueDate: dueDateMatch?.[1]?.includes('/')
            ? normalizeSlashDate(dueDateMatch[1])
            : dueDateMatch?.[1],
        poNumber: poNumber ?? undefined,
        subtotal: amounts.subtotal ?? undefined,
        taxAmount: amounts.taxAmount ?? undefined,
        totalAmount: amounts.totalAmount ?? undefined,
        currency,
        confidence: 0.45,
        notes: 'Extracted from PDF text',
    }
}

/** Best-effort final invoice total from OCR text when AI omits totalAmount. */
export function guessTotalFromPdfText(text: string): number | null {
    return guessAmountsFromPdfText(text).totalAmount
}
