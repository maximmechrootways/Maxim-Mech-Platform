import { prisma } from '../lib/prisma'
import type { Prisma } from '@prisma/client'
import { recomputePdfSubmissionFindings } from './qualityFindings/recomputePdfSubmissionFindings'
import * as jobService from './jobService'
import * as notificationService from './notificationService'
import { deleteBlob, getBlobBuffer, uploadBufferToBlob } from './blobStorageService'
import { attachTopicPdfToSubmissionBlob } from './toolboxTopicService'
import { buildNearMissSummaryPdfBuffer } from './nearMissService'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

const WIN_ANSI_REPLACEMENTS: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '–': '-',
  '—': '-',
  '−': '-',
  '…': '...',
  '•': '*',
}

function toWinAnsiSafeText(value: unknown): string {
  const raw = String(value ?? '')
  const replaced = raw.replace(/[₀-₉⁰¹²³⁴⁵⁶⁷⁸⁹–—−…•]/g, (char) => WIN_ANSI_REPLACEMENTS[char] ?? char)
  const normalized = replaced.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  return normalized.replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '?')
}

function isOwnerOrHr(role: string) {
  return role === 'owner' || role === 'hr'
}

function schedulePdfQualityFindingRecompute(submissionId: string) {
  void recomputePdfSubmissionFindings(submissionId).catch((err) => {
    console.error('[recomputePdfSubmissionFindings]', submissionId, err)
  })
}

function normalizeBlobName(pathLike: string): string {
  const raw = String(pathLike || '').trim()
  if (!raw) return ''
  const cleaned = raw.replace(/^\/+/, '')
  if (/^https?:\/\//i.test(cleaned)) {
    try {
      const url = new URL(cleaned)
      const pathParts = url.pathname.replace(/^\/+/, '').split('/').filter(Boolean)
      if (pathParts.length >= 2) {
        // Typical Azure blob URL path: /<container>/<blobName...>
        return pathParts.slice(1).join('/')
      }
      return pathParts.join('/')
    } catch {
      // Fall through to non-URL normalization below.
    }
  }
  return cleaned.replace(/^uploads\//i, '').replace(/^api\/uploads\//i, '')
}

function wrapPdfText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const raw = toWinAnsiSafeText(text).replace(/\r/g, '')
  const inputLines = raw.split('\n')
  const output: string[] = []
  for (const inputLine of inputLines) {
    const words = inputLine.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      output.push('')
      continue
    }
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate
      } else {
        if (current) output.push(current)
        current = word
      }
    }
    if (current) output.push(current)
  }
  return output.length > 0 ? output : ['']
}

async function buildSubmissionSummaryPdfBuffer(submission: any): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const margin = 40
  const titleSize = 14
  const textSize = 11
  const lineHeight = 16

  let page = doc.addPage()
  let { width, height } = page.getSize()
  let y = height - margin

  const ensureSpace = (needed = lineHeight) => {
    if (y - needed < margin) {
      page = doc.addPage()
      ;({ width, height } = page.getSize())
      y = height - margin
    }
  }

  const drawLine = (line: string, options?: { isBold?: boolean; size?: number }) => {
    const size = options?.size ?? textSize
    ensureSpace(lineHeight + 2)
    page.drawText(toWinAnsiSafeText(line), {
      x: margin,
      y,
      size,
      font: options?.isBold ? bold : regular,
    })
    y -= lineHeight
  }

  const drawParagraph = (text: string, options?: { isBold?: boolean }) => {
    const lines = wrapPdfText(text, width - margin * 2, options?.isBold ? bold : regular, textSize)
    for (const line of lines) drawLine(line, { isBold: options?.isBold })
  }

  const drawSignatureImage = async (imageData: string) => {
    const raw = String(imageData ?? '').trim()
    if (!raw.startsWith('data:image/')) return false
    const parts = raw.split(',')
    if (parts.length < 2) return false
    const header = parts[0].toLowerCase()
    const b64 = parts.slice(1).join(',')
    const bytes = Buffer.from(b64, 'base64')
    if (!bytes.length) return false

    let embedded: any = null
    try {
      if (header.includes('png')) embedded = await doc.embedPng(bytes)
      else embedded = await doc.embedJpg(bytes)
    } catch {
      try {
        embedded = await doc.embedPng(bytes)
      } catch {
        try {
          embedded = await doc.embedJpg(bytes)
        } catch {
          embedded = null
        }
      }
    }
    if (!embedded) return false

    const maxW = Math.min(260, width - margin * 2)
    const maxH = 90
    const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1)
    const drawW = embedded.width * scale
    const drawH = embedded.height * scale

    ensureSpace(drawH + 8)
    page.drawImage(embedded, {
      x: margin,
      y: y - drawH + 2,
      width: drawW,
      height: drawH,
    })
    y -= drawH + 8
    return true
  }

  const title = String(submission?.title || submission?.template?.name || 'Form Submission')
  drawLine(title, { isBold: true, size: titleSize })
  drawLine(`Status: ${String(submission?.status ?? '—')}`)
  drawLine(`Submitted by: ${String(submission?.submittedBy?.displayName ?? '—')}`)
  drawLine(
    `Submitted at: ${
      submission?.submittedAt ? new Date(submission.submittedAt).toLocaleString() : submission?.createdAt ? new Date(submission.createdAt).toLocaleString() : '—'
    }`
  )
  if (submission?.job?.title) {
    drawLine(`Job: ${submission.job.title}${submission.job.siteName ? ` · ${submission.job.siteName}` : ''}`)
  }
  y -= 6
  drawLine('Field values', { isBold: true })

  const fields = Array.isArray(submission?.template?.fields) ? submission.template.fields : []
  const values = Array.isArray(submission?.values) ? submission.values : []
  const valueMap = new Map<string, unknown>(values.map((v: any) => [String(v.fieldId), v.value]))

  if (fields.length === 0) {
    drawLine('No template fields recorded.')
  } else {
    for (const field of fields) {
      const label = String(field?.label || field?.id || 'Field')
      const rawValue = valueMap.get(String(field?.id))
      if (rawValue == null || String(rawValue).trim() === '') continue
      const type = String(field?.type || '').toUpperCase()
      const valueText = type === 'SIGNATURE' ? '[signature captured]' : String(rawValue)
      drawParagraph(`${label}: ${valueText}`)
    }
  }

  const signatures = Array.isArray(submission?.signatures) ? submission.signatures : []
  if (signatures.length > 0) {
    y -= 6
    drawLine('Signatures', { isBold: true })
    for (const sig of signatures) {
      const signer = String(sig?.signerName || sig?.signer?.displayName || 'Signer')
      const signedAt = sig?.signedAt ? new Date(sig.signedAt).toLocaleString() : '—'
      drawLine(`${signer} · ${signedAt}`, { isBold: true })
      const drew = await drawSignatureImage(String(sig?.imageData ?? ''))
      if (!drew) drawLine('[signature image unavailable]')
    }
  }

  const bytes = await doc.save()
  return Buffer.from(bytes)
}

async function buildSubmissionSummaryPdfFromRecord(s: {
  title?: string | null
  status?: string
  submittedAt?: Date | null
  createdAt?: Date
  submittedById?: string | null
  fieldValues?: unknown
  template?: { name?: string; fields?: Array<{ id: string; label?: string; type?: string }> }
}) {
  const submitter =
    s.submittedById != null
      ? await prisma.user.findUnique({
          where: { id: s.submittedById },
          select: { firstName: true, lastName: true },
        })
      : null

  const fieldValues = (s.fieldValues as Record<string, unknown>) || {}
  const values = Object.entries(fieldValues)
    .filter(([k]) => k !== LINKED_JOB_FIELD_KEY && (!k.startsWith('__') || k.startsWith('__dha_')))
    .map(([fieldId, value]) => ({ fieldId, value }))
  const signatures = parseSignatures(fieldValues).map((sig, i) => ({
    id: `sig-${i}`,
    signerRole: sig.signerRole,
    imageData: sig.imageData,
    fieldId: sig.fieldId,
    signedAt: sig.signedAt,
    signerName: sig.signerName,
  }))

  return buildSubmissionSummaryPdfBuffer({
    title: s.title ?? undefined,
    status: s.status ?? 'SUBMITTED',
    submittedAt: s.submittedAt ?? undefined,
    createdAt: s.createdAt ?? undefined,
    submittedBy: submitter ? { displayName: `${submitter.firstName} ${submitter.lastName}`.trim() } : undefined,
    template: {
      name: s.template?.name ?? 'Form Submission',
      fields: s.template?.fields ?? [],
    },
    values,
    signatures,
  })
}

async function buildDailyHazardSummaryPdfBuffer(record: {
  id: string
  date: string
  projectTitle?: string | null
  projectId: string
  siteName?: string | null
  musterPoint?: string | null
  supervisorName?: string | null
  jobNumber?: string | null
  weatherTemp?: string | null
  weatherConditions?: unknown
  nearestHospital?: string | null
  emergencyCoordinator?: string | null
  activities?: unknown
  hazards?: unknown
  controls?: unknown
  ppe?: unknown
  workplaceViolence?: unknown
  workplaceViolenceActions?: string | null
  toolsReplaced?: string | null
  additionalComments?: string | null
  signatures?: unknown
  submittedById?: string | null
  submittedBy?: string | null
  submittedAt?: Date | null
  approved?: boolean
  approvedAt?: Date | null
  approvedByName?: string | null
}) {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const margin = 40
  const titleSize = 14
  const textSize = 11
  const lineHeight = 16

  let page = doc.addPage()
  let { width, height } = page.getSize()
  let y = height - margin

  const ensureSpace = (needed = lineHeight) => {
    if (y - needed < margin) {
      page = doc.addPage()
      ;({ width, height } = page.getSize())
      y = height - margin
    }
  }

  const drawLine = (line: string, options?: { isBold?: boolean; size?: number }) => {
    const size = options?.size ?? textSize
    ensureSpace(lineHeight + 2)
    page.drawText(toWinAnsiSafeText(line), {
      x: margin,
      y,
      size,
      font: options?.isBold ? bold : regular,
    })
    y -= lineHeight
  }

  const drawParagraph = (text: string, options?: { isBold?: boolean }) => {
    const lines = wrapPdfText(text, width - margin * 2, options?.isBold ? bold : regular, textSize)
    for (const line of lines) drawLine(line, { isBold: options?.isBold })
  }

  const toList = (value: unknown): string[] => (Array.isArray(value) ? value.map((v) => String(v ?? '').trim()).filter(Boolean) : [])

  const submitter =
    record.submittedById != null
      ? await prisma.user.findUnique({
          where: { id: record.submittedById },
          select: { firstName: true, lastName: true, email: true },
        })
      : null
  const submitterName =
    submitter != null
      ? `${submitter.firstName ?? ''} ${submitter.lastName ?? ''}`.trim() || submitter.email
      : String(record.submittedBy ?? '—')

  drawLine(`Daily Hazard Analysis — ${record.date}`, { isBold: true, size: titleSize })
  drawLine(`Project: ${record.projectTitle ?? record.projectId ?? '—'}`)
  drawLine(`Site: ${record.siteName ?? '—'}`)
  drawLine(`Muster Point: ${record.musterPoint ?? '—'}`)
  drawLine(`Supervisor: ${record.supervisorName ?? '—'}`)
  drawLine(`Job Number: ${record.jobNumber ?? '—'}`)
  drawLine(`Submitted By: ${submitterName}`)
  drawLine(`Submitted At: ${record.submittedAt ? new Date(record.submittedAt).toLocaleString() : '—'}`)
  if (record.approved) {
    drawLine(
      `Approved: Yes · ${record.approvedByName ?? '—'} · ${record.approvedAt ? new Date(record.approvedAt).toLocaleString() : '—'}`
    )
  } else {
    drawLine('Approved: Pending HR/Owner review')
  }

  const weather = [record.weatherTemp ? `${record.weatherTemp}°C` : '', ...toList(record.weatherConditions)].filter(Boolean).join(' · ')
  if (weather) drawLine(`Weather: ${weather}`)
  if (record.nearestHospital) drawLine(`Nearest Hospital: ${record.nearestHospital}`)
  if (record.emergencyCoordinator) drawLine(`Emergency Coordinator: ${record.emergencyCoordinator}`)

  y -= 6
  drawLine('Activities', { isBold: true })
  const activities = toList(record.activities)
  drawParagraph(activities.length > 0 ? activities.join(', ') : '—')

  y -= 6
  drawLine('Hazards', { isBold: true })
  const hazards = toList(record.hazards)
  drawParagraph(hazards.length > 0 ? hazards.join(', ') : '—')

  y -= 6
  drawLine('Controls', { isBold: true })
  const controls = toList(record.controls)
  drawParagraph(controls.length > 0 ? controls.join(', ') : '—')

  y -= 6
  drawLine('PPE', { isBold: true })
  const ppe = toList(record.ppe)
  drawParagraph(ppe.length > 0 ? ppe.join(', ') : '—')

  const workplaceViolence = Array.isArray(record.workplaceViolence) ? record.workplaceViolence : []
  if (workplaceViolence.length > 0) {
    y -= 6
    drawLine('Workplace Violence Assessment', { isBold: true })
    for (const row of workplaceViolence as Array<{ question?: unknown; answer?: unknown }>) {
      drawParagraph(`${String(row?.question ?? 'Question')}: ${String(row?.answer ?? '—')}`)
    }
  }

  if (record.workplaceViolenceActions) {
    y -= 6
    drawLine('Workplace Violence Actions', { isBold: true })
    drawParagraph(record.workplaceViolenceActions)
  }

  if (record.toolsReplaced || record.additionalComments) {
    y -= 6
    drawLine('Tool Condition / Comments', { isBold: true })
    if (record.toolsReplaced) drawParagraph(`Tools Replaced: ${record.toolsReplaced}`)
    if (record.additionalComments) drawParagraph(`Additional Comments: ${record.additionalComments}`)
  }

  const signatures = Array.isArray(record.signatures) ? record.signatures : []
  if (signatures.length > 0) {
    y -= 6
    drawLine('Worker Acknowledgements', { isBold: true })
    for (const sig of signatures as Array<{ name?: unknown; timestamp?: unknown }>) {
      drawParagraph(`${String(sig?.name ?? 'Signer')} · ${sig?.timestamp ? new Date(String(sig.timestamp)).toLocaleString() : '—'}`)
    }
  }

  const bytes = await doc.save()
  return Buffer.from(bytes)
}

const CUSTOM_TEMPLATE_PREFIX = 'custom-form://'
const EXPORT_LOGO_PATH = path.resolve(process.cwd(), 'src/assets/maxim-export-logo.png')

/** Stored in submission fieldValues JSON (no DB migration required). */
const LINKED_JOB_FIELD_KEY = '__jobId__'
/** Set to "1" when the user explicitly clicks Save draft on a Daily Hazard form. */
export const DHA_USER_SAVED_DRAFT_KEY = '__dha_user_saved_draft__'

function isDhaTemplateName(name?: string | null): boolean {
  return /daily\s*hazard|daily\s*jha/i.test(String(name ?? ''))
}

export function isExplicitUserSavedDhaDraft(
  fieldValues: Record<string, unknown> | null | undefined,
  templateName?: string | null
): boolean {
  if (!isDhaTemplateName(templateName)) return true
  return String(fieldValues?.[DHA_USER_SAVED_DRAFT_KEY] ?? '').trim() === '1'
}

function extractLinkedJobId(fieldValues: Record<string, unknown> | null | undefined): string | undefined {
  const v = fieldValues?.[LINKED_JOB_FIELD_KEY]
  if (typeof v === 'string' && v.trim()) return v.trim()
  return undefined
}

async function stampExportLogoOnFirstPage(pdfDoc: PDFDocument) {
  if (!fs.existsSync(EXPORT_LOGO_PATH)) return
  const first = pdfDoc.getPage(0)
  if (!first) return
  const logoBytes = fs.readFileSync(EXPORT_LOGO_PATH)
  const logo = await pdfDoc.embedPng(logoBytes)
  const width = 92
  const height = (logo.height / logo.width) * width
  const { width: pageW, height: pageH } = first.getSize()
  first.drawImage(logo, {
    x: Math.max(12, pageW - width - 18),
    y: Math.max(12, pageH - height - 18),
    width,
    height,
  })
}

function extractLinkedJobLabel(fieldValues: Record<string, unknown> | null | undefined): string | undefined {
  if (!fieldValues) return undefined
  for (const [key, raw] of Object.entries(fieldValues)) {
    if (key === LINKED_JOB_FIELD_KEY || key.startsWith('__')) continue
    if (typeof raw !== 'string') continue
    const value = raw.trim()
    if (!value) continue
    // Job dropdown values are persisted as "Job Title · Site Name"
    if (value.includes(' · ')) return value
  }
  return undefined
}

function extractJobSiteTextFromFields(
  fieldValues: Record<string, unknown> | null | undefined,
  templateFields: Array<{ id: string; label?: string }> | undefined
): string | undefined {
  if (!fieldValues || !Array.isArray(templateFields) || templateFields.length === 0) return undefined
  const isJobSiteLike = (label?: string) => {
    const normalized = String(label ?? '').toLowerCase().trim()
    if (!normalized) return false
    return (
      normalized.includes('job site') ||
      normalized === 'project' ||
      normalized.includes('project') ||
      normalized.includes('project/site') ||
      normalized.includes('site') ||
      normalized.includes('location') ||
      normalized.includes('shop')
    )
  }
  const field = templateFields.find((f) => isJobSiteLike(f.label))
  if (!field?.id) return undefined
  const raw = fieldValues[field.id]
  if (typeof raw !== 'string') return undefined
  const value = raw.trim()
  return value || undefined
}

function displayNameFromUser(u: { firstName: string; lastName: string } | null) {
  if (!u) return undefined
  return { displayName: `${u.firstName} ${u.lastName}`.trim() }
}

type ResubmissionHistoryEntry = {
  action: 'requested' | 'resubmitted'
  at: string
  byId?: string
  byName?: string
  reason?: string
}

function normalizeSignerIds(ids?: string[]): string[] {
  if (!Array.isArray(ids)) return []
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))]
}

function parseSignatures(fieldValues: Record<string, unknown>) {
  return ((fieldValues.__signatures__ as Array<{
    signerRole?: string
    imageData?: string
    fieldId?: string | null
    signedAt?: string
    signerId?: string
    signerName?: string
  }>) || [])
}

const SIGNER_FIELD_ASSIGNMENTS_KEY = '__signer_field_assignments__'

type SignerFieldAssignmentRow = { labourerUserId: string; fieldId: string }

function parseSignerFieldAssignments(fieldValues: Record<string, unknown>): SignerFieldAssignmentRow[] {
  const raw = fieldValues[SIGNER_FIELD_ASSIGNMENTS_KEY]
  if (!Array.isArray(raw)) return []
  const out: SignerFieldAssignmentRow[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const labourerUserId = String((row as { labourerUserId?: unknown }).labourerUserId ?? '').trim()
    const fieldId = String((row as { fieldId?: unknown }).fieldId ?? '').trim()
    if (labourerUserId && fieldId) out.push({ labourerUserId, fieldId })
  }
  return out
}

function normalizeSignerFieldAssignmentsInput(
  raw: unknown,
  templateFields: { id: string; type: string }[],
  fieldValues: Record<string, unknown>
): SignerFieldAssignmentRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  const sigFieldIds = new Set(
    templateFields.filter((f) => String(f.type).toUpperCase() === 'SIGNATURE').map((f) => f.id)
  )
  const out: SignerFieldAssignmentRow[] = []
  const seenFields = new Set<string>()
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const labourerUserId = String((row as { labourerUserId?: unknown }).labourerUserId ?? '').trim()
    const fieldId = String((row as { fieldId?: unknown }).fieldId ?? '').trim()
    if (!labourerUserId || !fieldId) {
      throw { status: 400, message: 'Each signature assignment needs a worker and a signature field' }
    }
    if (!sigFieldIds.has(fieldId)) {
      throw { status: 400, message: 'Invalid signature field in assignment' }
    }
    if (seenFields.has(fieldId)) {
      throw { status: 400, message: 'Each signature line can only have one assignee' }
    }
    seenFields.add(fieldId)
    const v = fieldValues[fieldId]
    const filled = v != null && String(v).trim() !== '' && String(v).startsWith('data:image/')
    if (filled) {
      throw { status: 400, message: 'Cannot assign a signer to a line that already has a signature' }
    }
    out.push({ labourerUserId, fieldId })
  }
  return out
}

function hasMeaningfulDraftContent(
  fieldValues: Record<string, unknown> | null | undefined,
  title?: string | null,
  extraPdfBlobPath?: string | null,
  templateName?: string | null
) {
  if (isDhaTemplateName(templateName) && !isExplicitUserSavedDhaDraft(fieldValues, templateName)) {
    return false
  }
  if (String(title ?? '').trim()) return true
  if (String(extraPdfBlobPath ?? '').trim()) return true

  const values = fieldValues ?? {}
  const signatures = parseSignatures(values)
  if (signatures.length > 0) return true

  return Object.entries(values).some(([key, raw]) => {
    if (key === LINKED_JOB_FIELD_KEY || key === '__signatures__' || key === DHA_USER_SAVED_DRAFT_KEY) return false
    if (raw == null) return false
    if (typeof raw === 'string') return raw.trim() !== ''
    if (typeof raw === 'number') return true
    if (typeof raw === 'boolean') return raw
    if (Array.isArray(raw)) return raw.length > 0
    if (typeof raw === 'object') return Object.keys(raw as Record<string, unknown>).length > 0
    return false
  })
}

async function assertCanAccessSubmission(submissionId: string, userId: string, userRole: string) {
  const s = await prisma.pdfSubmission.findUnique({
    where: { id: submissionId },
    include: { signers: true },
  })
  if (!s) throw { status: 404, message: 'Submission not found' }

  if (!isOwnerOrHr(userRole)) {
    if (userRole === 'supervisor') {
      const labourerIds = await jobService.getLabourerIdsSupervisedBy(userId)
      const isSigner = s.signers.some((sig) => sig.labourerUserId === userId)
      const isOwn = s.submittedById === userId
      const isSupervisedLabourer = s.submittedById != null && labourerIds.includes(s.submittedById)
      if (!isOwn && !isSupervisedLabourer && !isSigner) throw { status: 403, message: 'Forbidden' }
    } else {
      const isSigner = s.signers.some((sig) => sig.labourerUserId === userId)
      if (s.submittedById !== userId && !isSigner) throw { status: 403, message: 'Forbidden' }
    }
  }

  return s
}

export async function listSubmissions(
  userId: string,
  userRole: string,
  query?: { submittedById?: string; titleSearch?: string; status?: string }
) {
  const where: Prisma.PdfSubmissionWhereInput = {}
  if (isOwnerOrHr(userRole)) {
    if (query?.submittedById) where.submittedById = query.submittedById
    if (query?.status) where.status = query.status as Prisma.EnumSubmissionStatusFilter
  } else if (userRole === 'supervisor') {
    const labourerIds = await jobService.getLabourerIdsSupervisedBy(userId)
    // Supervisors must see their own drafts/submissions (e.g. toolbox talks) plus team + anything they must sign.
    const orConditions: Prisma.PdfSubmissionWhereInput[] = [
      { submittedById: userId },
      { signers: { some: { labourerUserId: userId } } },
    ]
    if (labourerIds.length > 0) {
      orConditions.push({ submittedById: { in: labourerIds } })
    }
    where.OR = orConditions
    if (query?.status) where.status = query.status as Prisma.EnumSubmissionStatusFilter
  } else {
    where.OR = [{ submittedById: userId }, { signers: { some: { labourerUserId: userId } } }]
    if (query?.status) where.status = query.status as Prisma.EnumSubmissionStatusFilter
  }
  const list = await prisma.pdfSubmission.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      template: {
        select: {
          id: true,
          name: true,
          pageCount: true,
          fields: { select: { id: true, label: true } },
        },
      },
      signers: { select: { labourerUserId: true, signatureStatus: true } },
    },
  })
  type Row = (typeof list)[number]
  let filtered = list
  // Empty drafts should not appear in submissions. A draft is shown only once user
  // has entered real content (beyond internal metadata like linked job id).
  filtered = filtered.filter((s) => {
    if (s.status !== 'DRAFT') return true
    return hasMeaningfulDraftContent(
      s.fieldValues as Record<string, unknown>,
      s.title,
      (s as any).extraPdfBlobPath ?? null,
      s.template.name
    )
  })
  if (isOwnerOrHr(userRole) && query?.titleSearch?.trim()) {
    const q = query.titleSearch.trim().toLowerCase()
    filtered = filtered.filter((s: Row) => {
      const title = (s.title ?? s.template.name) || ''
      return title.toLowerCase().includes(q) || s.template.name.toLowerCase().includes(q)
    })
  }
  const userIds = [...new Set(filtered.map((s) => s.submittedById).filter(Boolean))] as string[]
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : []
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

  const linkedJobIds = [
    ...new Set(
      filtered
        .map((s) => extractLinkedJobId(s.fieldValues as Record<string, unknown>))
        .filter(Boolean)
    ),
  ] as string[]
  const jobs =
    linkedJobIds.length > 0
      ? await prisma.job.findMany({
          where: { id: { in: linkedJobIds } },
          select: { id: true, title: true, site: { select: { name: true } } },
        })
      : []
  const jobMap = Object.fromEntries(jobs.map((j) => [j.id, j]))

  const unresolvedJobLabels = [
    ...new Set(
      filtered
        .filter((s) => !extractLinkedJobId(s.fieldValues as Record<string, unknown>))
        .map((s) => extractLinkedJobLabel(s.fieldValues as Record<string, unknown>))
        .filter(Boolean)
    ),
  ] as string[]

  const fallbackJobs =
    unresolvedJobLabels.length > 0
      ? await prisma.job.findMany({
          select: { id: true, title: true, site: { select: { name: true } } },
        })
      : []
  const fallbackJobLabelMap = Object.fromEntries(
    fallbackJobs.map((j) => [`${j.title}${j.site?.name ? ` · ${j.site.name}` : ''}`.toLowerCase(), j])
  )

  return filtered.map((s: Row) => {
    const fieldValues = s.fieldValues as Record<string, unknown>
    const jid = extractLinkedJobId(fieldValues)
    const label = extractLinkedJobLabel(fieldValues)
    const siteLikeText = extractJobSiteTextFromFields(fieldValues, (s.template as any).fields ?? [])
    const fallbackJob = !jid && label ? fallbackJobLabelMap[String(label).toLowerCase()] : undefined
    const j = jid ? jobMap[jid] : fallbackJob
    return {
      id: s.id,
      templateId: s.templateId,
      templateName: s.template.name,
      title: s.title ?? undefined,
      status: s.status,
      submittedById: s.submittedById,
      submittedBy: s.submittedById ? displayNameFromUser(userMap[s.submittedById] ?? null) : undefined,
      submittedAt: s.submittedAt?.toISOString(),
      createdAt: s.createdAt.toISOString(),
      needsMySignature: s.signers.some((sig) => sig.labourerUserId === userId && sig.signatureStatus !== 'signed'),
      signedSignatureCount: s.signers.filter((sig) => sig.signatureStatus === 'signed').length,
      pendingSignatureCount: s.signers.filter((sig) => sig.signatureStatus !== 'signed').length,
      jobId: jid ?? fallbackJob?.id,
      jobTitle: j?.title,
      jobSiteName: j?.site?.name ?? siteLikeText,
      resubmissionReason: s.resubmissionReason ?? undefined,
      resubmissionRequestedAt: s.resubmissionRequestedAt?.toISOString(),
      resubmittedAt: s.resubmittedAt?.toISOString(),
      userSavedDraft: isExplicitUserSavedDhaDraft(fieldValues, s.template.name),
    }
  })
}

export async function exportMergedSubmissionsPdf(
  userId: string,
  userRole: string,
  submissionRefs: string[]
): Promise<{
  buffer: Buffer
  fileName: string
  includedCount: number
  skipped: Array<{ id: string; reason: string }>
}> {
  const refs = [...new Set((submissionRefs ?? []).map((ref) => String(ref).trim()).filter(Boolean))]
  if (refs.length === 0) throw { status: 400, message: 'At least one submission is required' }
  if (refs.length > 200) throw { status: 400, message: 'Select 200 submissions or fewer per export' }

  const mergedPdf = await PDFDocument.create()
  const skipped: Array<{ id: string; reason: string }> = []
  let includedCount = 0

  for (const ref of refs) {
    const isDhaRef = ref.startsWith('dha:')
    const isNearMissRef = ref.startsWith('near-miss:')
    const id = ref.includes(':') ? ref.split(':').slice(1).join(':') : ref
    if (!id) {
      skipped.push({ id: ref, reason: 'Invalid selection id' })
      continue
    }
    try {
      let sourceBuffer: Buffer
      if (isDhaRef) {
        const dha = await prisma.dailyHazardSubmission.findUnique({ where: { id } })
        if (!dha) throw { status: 404, message: 'Daily Hazard submission not found' }

        if (!isOwnerOrHr(userRole)) {
          if (userRole === 'supervisor') {
            const labourerIds = await jobService.getLabourerIdsSupervisedBy(userId)
            const canView = dha.submittedById === userId || (dha.submittedById != null && labourerIds.includes(dha.submittedById))
            if (!canView) throw { status: 403, message: 'Forbidden' }
          } else {
            if (dha.submittedById !== userId) throw { status: 403, message: 'Forbidden' }
          }
        }

        sourceBuffer = await buildDailyHazardSummaryPdfBuffer({
          id: dha.id,
          date: dha.date,
          projectId: dha.projectId,
          projectTitle: dha.projectTitle,
          siteName: dha.siteName,
          musterPoint: dha.musterPoint,
          supervisorName: dha.supervisorName,
          jobNumber: dha.jobNumber,
          weatherTemp: dha.weatherTemp,
          weatherConditions: dha.weatherConditions,
          nearestHospital: dha.nearestHospital,
          emergencyCoordinator: dha.emergencyCoordinator,
          activities: dha.activities,
          hazards: dha.hazards,
          controls: dha.controls,
          ppe: dha.ppe,
          workplaceViolence: dha.workplaceViolence,
          workplaceViolenceActions: dha.workplaceViolenceActions,
          toolsReplaced: dha.toolsReplaced,
          additionalComments: dha.additionalComments,
          signatures: dha.signatures,
          submittedById: dha.submittedById,
          submittedBy: dha.submittedBy,
          submittedAt: dha.submittedAt,
          approved: Boolean(dha.approved),
          approvedAt: dha.approvedAt,
          approvedByName: dha.approvedByName,
        })
      } else if (isNearMissRef) {
        const nearMiss = await prisma.nearMiss.findUnique({ where: { id } })
        if (!nearMiss) throw { status: 404, message: 'Near-miss report not found' }

        if (!isOwnerOrHr(userRole)) {
          if (userRole === 'supervisor') {
            const labourerIds = await jobService.getLabourerIdsSupervisedBy(userId)
            const canView =
              nearMiss.reportedById === userId ||
              (nearMiss.reportedById != null && labourerIds.includes(nearMiss.reportedById))
            if (!canView) throw { status: 403, message: 'Forbidden' }
          } else if (nearMiss.reportedById !== userId) {
            throw { status: 403, message: 'Forbidden' }
          }
        }

        sourceBuffer = await buildNearMissSummaryPdfBuffer(nearMiss)
      } else {
        const detail = await getSubmissionById(id, userId, userRole)
        const sourcePathRaw = detail.finalPdfBlobPath || detail.template?.filePath
        const sourcePath = normalizeBlobName(sourcePathRaw ?? '')
        if (!sourcePath || sourcePath.startsWith(CUSTOM_TEMPLATE_PREFIX)) {
          // Fallback for native/custom forms that do not have an uploaded source PDF.
          sourceBuffer = await buildSubmissionSummaryPdfBuffer(detail)
        } else {
          try {
            sourceBuffer = await getBlobBuffer(sourcePath)
          } catch {
            // Deployment-safe fallback: if blob retrieval fails (path mismatch, missing blob, permissions),
            // export a generated summary page so the batch export still succeeds.
            sourceBuffer = await buildSubmissionSummaryPdfBuffer(detail)
          }
        }
      }
      const sourceDoc = await PDFDocument.load(sourceBuffer)
      const copiedPages = await mergedPdf.copyPages(sourceDoc, sourceDoc.getPageIndices())
      copiedPages.forEach((p) => mergedPdf.addPage(p))
      includedCount += 1
    } catch (e: any) {
      skipped.push({ id: ref, reason: e?.message ? String(e.message) : 'Could not merge submission' })
    }
  }

  if (includedCount === 0) {
    throw { status: 400, message: 'None of the selected submissions could be exported as PDF' }
  }

  await stampExportLogoOnFirstPage(mergedPdf)

  const bytes = await mergedPdf.save()
  const dateStamp = new Date().toISOString().slice(0, 10)
  return {
    buffer: Buffer.from(bytes),
    fileName: `completed-forms-${dateStamp}.pdf`,
    includedCount,
    skipped,
  }
}

export async function getSubmissionById(id: string, userId: string, userRole: string) {
  const s = await prisma.pdfSubmission.findUnique({
    where: { id },
    include: {
      template: { include: { fields: true } },
      signers: true,
      selectedToolboxTopic: {
        select: {
          id: true,
          topicTitle: true,
          summary: true,
          keyPoints: true,
          sourcePdfUrl: true,
          sourcePageUrl: true,
        },
      },
    },
  })
  if (!s) throw { status: 404, message: 'Submission not found' }
  if (!isOwnerOrHr(userRole)) {
    if (userRole === 'supervisor') {
      const labourerIds = await jobService.getLabourerIdsSupervisedBy(userId)
      const isSigner = s.signers.some((sig) => sig.labourerUserId === userId)
      const isOwn = s.submittedById === userId
      const isSupervisedLabourer =
        s.submittedById != null && labourerIds.includes(s.submittedById)
      if (!isOwn && !isSupervisedLabourer && !isSigner) throw { status: 403, message: 'Forbidden' }
    } else {
      const isSigner = s.signers.some((sig) => sig.labourerUserId === userId)
      if (s.submittedById !== userId && !isSigner) throw { status: 403, message: 'Forbidden' }
    }
  }
  const submitter =
    s.submittedById != null
      ? await prisma.user.findUnique({
          where: { id: s.submittedById },
          select: { firstName: true, lastName: true },
        })
      : null
  const resubmissionRequestedBy =
    s.resubmissionRequestedById != null
      ? await prisma.user.findUnique({
          where: { id: s.resubmissionRequestedById },
          select: { firstName: true, lastName: true },
        })
      : null
  const fieldValues = (s.fieldValues as Record<string, unknown>) || {}
  const linkedJobId = extractLinkedJobId(fieldValues)
  const jobRow =
    linkedJobId != null
      ? await prisma.job.findUnique({
          where: { id: linkedJobId },
          select: { id: true, title: true, site: { select: { name: true } } },
        })
      : null
  const values = Object.entries(fieldValues)
    .filter(([k]) => k !== LINKED_JOB_FIELD_KEY && (!k.startsWith('__') || k.startsWith('__dha_')))
    .map(([fieldId, value]) => ({ fieldId, value }))
  const sigs = parseSignatures(fieldValues)
  const signerIds = [...new Set(sigs.map((sig) => sig.signerId).filter(Boolean))] as string[]
  const tableSignerIds = [...new Set(s.signers.map((sig) => sig.labourerUserId))]
  const mergedSignerIds = [...new Set([...signerIds, ...tableSignerIds])]
  const signerUsers =
    mergedSignerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: mergedSignerIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : []
  const signerMap = Object.fromEntries(signerUsers.map((u) => [u.id, { displayName: `${u.firstName} ${u.lastName}`.trim() }]))
  const signatures = sigs.map((sig, i) => ({
    id: `sig-${i}`,
    signerRole: sig.signerRole,
    imageData: sig.imageData,
    fieldId: sig.fieldId ?? undefined,
    signedAt: sig.signedAt,
    signerName: sig.signerName ?? (sig.signerId ? signerMap[sig.signerId]?.displayName : undefined),
    signer: sig.signerId ? signerMap[sig.signerId] : undefined,
  }))
  return {
    id: s.id,
    title: s.title ?? undefined,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    jobId: linkedJobId,
    job: jobRow
      ? {
          id: jobRow.id,
          title: jobRow.title,
          siteName: jobRow.site?.name,
        }
      : undefined,
    template: {
      id: s.template.id,
      name: s.template.name,
      filePath: s.template.filePath,
      pageCount: s.template.pageCount,
      fields: s.template.fields.map((f: { id: string; label: string; type: string; page: number; x: number; y: number; width: number; height: number; required: boolean }) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        required: f.required,
      })),
    },
    values,
    signatures,
    signers: s.signers.map((sig) => ({
      id: sig.id,
      labourerUserId: sig.labourerUserId,
      signatureStatus: sig.signatureStatus,
      signedAt: sig.signedAt?.toISOString(),
      signer: signerMap[sig.labourerUserId],
    })),
    needsMySignature: s.signers.some((sig) => sig.labourerUserId === userId && sig.signatureStatus !== 'signed'),
    pendingSignatureCount: s.signers.filter((sig) => sig.signatureStatus !== 'signed').length,
    finalPdfBlobPath: s.finalPdfBlobPath ?? undefined,
    selectedToolboxTopic: s.selectedToolboxTopic
      ? {
          id: s.selectedToolboxTopic.id,
          topicTitle: s.selectedToolboxTopic.topicTitle,
          summary: s.selectedToolboxTopic.summary ?? undefined,
          keyPoints: Array.isArray((s.selectedToolboxTopic as any).keyPoints)
            ? (s.selectedToolboxTopic as any).keyPoints.map((item: unknown) => String(item ?? '')).filter(Boolean)
            : [],
          sourcePdfUrl: s.selectedToolboxTopic.sourcePdfUrl,
          sourcePageUrl: s.selectedToolboxTopic.sourcePageUrl ?? undefined,
        }
      : undefined,
    // Prisma types may lag behind local schema changes when `prisma generate` is blocked.
    extraPdfBlobPath: (s as any).extraPdfBlobPath ?? undefined,
    extraPdfOriginalName: (s as any).extraPdfOriginalName ?? undefined,
    submittedBy: displayNameFromUser(submitter),
    resubmissionReason: s.resubmissionReason ?? undefined,
    resubmissionRequestedAt: s.resubmissionRequestedAt?.toISOString(),
    resubmissionRequestedById: s.resubmissionRequestedById ?? undefined,
    resubmissionRequestedBy: displayNameFromUser(resubmissionRequestedBy),
    resubmittedAt: s.resubmittedAt?.toISOString(),
    resubmissionHistory: Array.isArray(s.resubmissionHistory) ? s.resubmissionHistory : [],
    signerFieldAssignments: parseSignerFieldAssignments(fieldValues),
  }
}

export async function uploadExtraPdf(
  submissionId: string,
  uploaderId: string,
  userRole: string,
  file: Express.Multer.File
) {
  if (!file || !file.buffer) throw { status: 400, message: 'PDF file is required' }
  if (!String(file.mimetype).toLowerCase().includes('pdf')) {
    throw { status: 400, message: 'Only PDF files are allowed' }
  }

  const s = await prisma.pdfSubmission.findUnique({
    where: { id: submissionId },
    include: { signers: true },
  })
  if (!s) throw { status: 404, message: 'Submission not found' }

  if (!isOwnerOrHr(userRole)) {
    if (userRole === 'supervisor') {
      const labourerIds = await jobService.getLabourerIdsSupervisedBy(uploaderId)
      const isSigner = s.signers.some((sig) => sig.labourerUserId === uploaderId)
      const isOwn = s.submittedById === uploaderId
      const isSupervisedLabourer = s.submittedById != null && labourerIds.includes(s.submittedById)
      if (!isOwn && !isSupervisedLabourer && !isSigner) throw { status: 403, message: 'Forbidden' }
    } else {
      const isSigner = s.signers.some((sig) => sig.labourerUserId === uploaderId)
      if (s.submittedById !== uploaderId && !isSigner) throw { status: 403, message: 'Forbidden' }
    }
  }

  // Replace existing attachment (if any)
  if ((s as any).extraPdfBlobPath) {
    await deleteBlob((s as any).extraPdfBlobPath)
  }

  const random = Math.random().toString(36).substring(2, 10)
  const ext = '.pdf'
  const blobPath = `submissions/${submissionId}-extra-${Date.now()}-${random}${ext}`
  await uploadBufferToBlob(blobPath, file.buffer, file.mimetype || 'application/pdf')

  const updated = await (prisma.pdfSubmission.update as any)({
    where: { id: submissionId },
    data: {
      extraPdfBlobPath: blobPath,
      extraPdfOriginalName: file.originalname ?? 'attachment.pdf',
    },
    select: { extraPdfBlobPath: true, extraPdfOriginalName: true },
  })

  return updated
}

export async function attachToolboxTopicToSubmission(
  submissionId: string,
  topicId: string,
  userId: string,
  userRole: string
) {
  const s = await assertCanAccessSubmission(submissionId, userId, userRole)
  const { blobPath, originalName } = await attachTopicPdfToSubmissionBlob({ submissionId, topicId })

  if ((s as any).extraPdfBlobPath) {
    await deleteBlob((s as any).extraPdfBlobPath)
  }

  const updated = await (prisma.pdfSubmission.update as any)({
    where: { id: submissionId },
    data: {
      selectedToolboxTopicId: topicId,
      extraPdfBlobPath: blobPath,
      extraPdfOriginalName: originalName,
    },
    select: {
      selectedToolboxTopicId: true,
      extraPdfBlobPath: true,
      extraPdfOriginalName: true,
    },
  })

  return updated
}

export async function removeExtraPdf(submissionId: string, userId: string, userRole: string) {
  const s = await prisma.pdfSubmission.findUnique({
    where: { id: submissionId },
    include: { signers: true },
  })

  if (!s) throw { status: 404, message: 'Submission not found' }

  if (!isOwnerOrHr(userRole)) {
    if (userRole === 'supervisor') {
      const labourerIds = await jobService.getLabourerIdsSupervisedBy(userId)
      const isSigner = s.signers.some((sig) => sig.labourerUserId === userId)
      const isOwn = s.submittedById === userId
      const isSupervisedLabourer = s.submittedById != null && labourerIds.includes(s.submittedById)
      if (!isOwn && !isSupervisedLabourer && !isSigner) throw { status: 403, message: 'Forbidden' }
    } else {
      const isSigner = s.signers.some((sig) => sig.labourerUserId === userId)
      if (s.submittedById !== userId && !isSigner) throw { status: 403, message: 'Forbidden' }
    }
  }

  if ((s as any).extraPdfBlobPath) {
    await deleteBlob((s as any).extraPdfBlobPath)
  }

  const updated = await (prisma.pdfSubmission.update as any)({
    where: { id: submissionId },
    data: {
      extraPdfBlobPath: null,
      extraPdfOriginalName: null,
      selectedToolboxTopicId: null,
    },
    select: { extraPdfBlobPath: true, extraPdfOriginalName: true },
  })

  return updated
}

export async function clearDraftSubmission(submissionId: string, userId: string, userRole: string) {
  const s = await prisma.pdfSubmission.findUnique({
    where: { id: submissionId },
    include: { signers: true },
  })

  if (!s) throw { status: 404, message: 'Submission not found' }
  if (s.status !== 'DRAFT') throw { status: 400, message: 'Can only clear drafts' }

  if (!isOwnerOrHr(userRole)) {
    if (userRole === 'supervisor') {
      const labourerIds = await jobService.getLabourerIdsSupervisedBy(userId)
      const isSigner = s.signers.some((sig) => sig.labourerUserId === userId)
      const isOwn = s.submittedById === userId
      const isSupervisedLabourer = s.submittedById != null && labourerIds.includes(s.submittedById)
      if (!isOwn && !isSupervisedLabourer && !isSigner) throw { status: 403, message: 'Forbidden' }
    } else {
      const isSigner = s.signers.some((sig) => sig.labourerUserId === userId)
      if (s.submittedById !== userId && !isSigner) throw { status: 403, message: 'Forbidden' }
    }
  }

  // Delete extra PDF blob if it exists.
  if ((s as any).extraPdfBlobPath) {
    await deleteBlob((s as any).extraPdfBlobPath)
  }

  const preservedJobId = extractLinkedJobId(s.fieldValues as Record<string, unknown>)
  const clearedFieldValues = preservedJobId ? { [LINKED_JOB_FIELD_KEY]: preservedJobId } : {}

  await prisma.pdfSubmission.update({
    where: { id: submissionId },
    data: {
      fieldValues: clearedFieldValues as any,
      extraPdfBlobPath: null,
      extraPdfOriginalName: null,
      selectedToolboxTopicId: null,
    } as any,
  })

  // Also revert any signer rows to "pending" so the UI starts clean.
  await prisma.pdfSubmissionSigner.updateMany({
    where: { submissionId },
    data: {
      signatureStatus: 'pending',
      signatureImageData: null,
      signedAt: null,
    },
  })

  return { success: true }
}

export async function createSubmission(
  userId: string,
  templateId: string,
  jobId?: string,
  _siteId?: string
) {
  const template = await prisma.pdfTemplate.findUnique({ where: { id: templateId }, include: { fields: true } })
  if (!template) throw { status: 404, message: 'Template not found' }
  const trimmedJob = jobId && String(jobId).trim() ? String(jobId).trim() : undefined
  const initialFieldValues: Record<string, unknown> = {}
  if (trimmedJob) initialFieldValues[LINKED_JOB_FIELD_KEY] = trimmedJob
  const isDhaTemplate = /daily\s*hazard|daily\s*jha/i.test(String(template.name ?? ''))
  const result = await prisma.pdfSubmission.create({
    data: {
      templateId,
      submittedById: userId,
      status: 'DRAFT',
      fieldValues: initialFieldValues as any,
      pdfBlobPath: template.filePath,
      ...(isDhaTemplate ? { title: String(template.name ?? '').trim() || 'Daily Hazard Analysis' } : {}),
    },
    include: { template: { include: { fields: true } } },
  })
  return result
}

export async function updateDraftTitle(
  submissionId: string,
  userId: string,
  userRole: string,
  title: string
) {
  await assertCanAccessSubmission(submissionId, userId, userRole)
  const s = await prisma.pdfSubmission.findUnique({ where: { id: submissionId } })
  if (!s) throw { status: 404, message: 'Submission not found' }
  if (s.status !== 'DRAFT' && s.status !== 'RESUBMIT_REQUIRED') {
    throw { status: 400, message: 'Can only update title on drafts' }
  }
  const trimmed = String(title ?? '').trim()
  await prisma.pdfSubmission.update({
    where: { id: submissionId },
    data: { title: trimmed || null },
  })
  return { success: true, title: trimmed || null }
}

/**
 * Reuses the caller's latest DRAFT for this template so opening "new form" does not flood the DB.
 * Set reuseDraft false when a brand-new draft is required (e.g. per assignment).
 */
export async function findOrCreateDraftSubmission(
  userId: string,
  templateId: string,
  jobId?: string,
  siteId?: string,
  reuseDraft = true,
  draftId?: string
) {
  const requestedDraftId = String(draftId ?? '').trim()
  if (requestedDraftId) {
    const requested = await prisma.pdfSubmission.findUnique({
      where: { id: requestedDraftId },
      include: { template: { include: { fields: true } } },
    })
    const canUseRequested =
      !!requested &&
      requested.templateId === templateId &&
      (requested.status === 'DRAFT' || requested.status === 'RESUBMIT_REQUIRED') &&
      requested.submittedById === userId
    if (canUseRequested) return requested
  }

  const trimmedJob = jobId && String(jobId).trim() ? String(jobId).trim() : null
  if (reuseDraft) {
    const drafts = await prisma.pdfSubmission.findMany({
      where: {
        templateId,
        submittedById: userId,
        status: 'DRAFT',
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { template: { include: { fields: true } } },
    })
    const existing = drafts.find((d) => {
      const jid = extractLinkedJobId(d.fieldValues as Record<string, unknown>)
      if (trimmedJob) return jid === trimmedJob
      return !jid
    })
    if (existing) return existing
  }
  return createSubmission(userId, templateId, jobId, siteId)
}

export async function deleteDraftSubmissions(
  userId: string,
  userRole: string,
  submissionIds: string[]
) {
  const ids = [...new Set((submissionIds ?? []).map((id) => String(id).trim()).filter(Boolean))]
  if (ids.length === 0) return { deleted: 0 }

  const drafts = await prisma.pdfSubmission.findMany({
    where: { id: { in: ids }, status: 'DRAFT' },
  })

  const allowed = drafts.filter((d: any) => isOwnerOrHr(userRole) || d.submittedById === userId)
  if (allowed.length === 0) return { deleted: 0 }

  for (const d of allowed as any[]) {
    if (d.finalPdfBlobPath && !String(d.finalPdfBlobPath).startsWith(CUSTOM_TEMPLATE_PREFIX)) {
      await deleteBlob(String(d.finalPdfBlobPath)).catch(() => {})
    }
    if (d.extraPdfBlobPath) {
      await deleteBlob(String(d.extraPdfBlobPath)).catch(() => {})
    }
  }

  const allowedIds = allowed.map((d: any) => d.id)
  await prisma.submissionQualityFinding.deleteMany({
    where: { sourceType: 'PDF_SUBMISSION', sourceId: { in: allowedIds } },
  })

  await prisma.pdfSubmission.deleteMany({
    where: { id: { in: allowedIds }, status: 'DRAFT' },
  })

  return { deleted: allowed.length }
}

export async function saveValues(submissionId: string, values: Array<{ fieldId: string; value: string }>) {
  const s = await prisma.pdfSubmission.findUnique({ where: { id: submissionId } })
  if (!s) throw { status: 404, message: 'Submission not found' }
  const current = (s.fieldValues as Record<string, unknown>) || {}
  const next = { ...current }
  const preservedJob = extractLinkedJobId(current)
  for (const v of values) next[v.fieldId] = v.value
  if (preservedJob) next[LINKED_JOB_FIELD_KEY] = preservedJob
  await prisma.pdfSubmission.update({
    where: { id: submissionId },
    data: { fieldValues: next as any },
  })
  if (s.status === 'SUBMITTED' || s.status === 'APPROVED' || s.status === 'AWAITING_SIGNATURES') {
    schedulePdfQualityFindingRecompute(submissionId)
  }
  return []
}

export async function addSignature(
  submissionId: string,
  signerId: string,
  signerRole: string,
  imageData: string,
  fieldId?: string,
  signerName?: string
) {
  if (!imageData || !String(imageData).startsWith('data:image/')) {
    throw { status: 400, message: 'Valid signature imageData is required' }
  }
  const s = await prisma.pdfSubmission.findUnique({
    where: { id: submissionId },
    include: { template: { include: { fields: true } }, signers: true },
  })
  if (!s) throw { status: 404, message: 'Submission not found' }
  const signerRow = s.signers.find((sig) => sig.labourerUserId === signerId)
  if (s.status === 'AWAITING_SIGNATURES' && s.signers.length > 0 && !signerRow) {
    throw { status: 403, message: 'You are not assigned as a signer for this submission' }
  }
  const current = (s.fieldValues as Record<string, unknown>) || {}
  const next = { ...current }
  const signatureFields = (s.template.fields ?? []).filter((f) => String(f.type).toUpperCase() === 'SIGNATURE')
  const assignmentRows = parseSignerFieldAssignments(current)
  const assignedFieldForSigner =
    s.status === 'AWAITING_SIGNATURES' && signerRow && assignmentRows.length > 0
      ? assignmentRows.find((a) => a.labourerUserId === signerId)?.fieldId
      : undefined

  let resolvedFieldId: string | undefined
  if (assignedFieldForSigner) {
    const slotVal = next[assignedFieldForSigner]
    const slotEmpty = slotVal == null || String(slotVal).trim() === ''
    if (!slotEmpty) {
      throw { status: 400, message: 'Your assigned signature line is already filled' }
    }
    resolvedFieldId = assignedFieldForSigner
  } else {
    resolvedFieldId =
      fieldId ??
      signatureFields.find((f) => {
        const value = next[f.id]
        return value == null || String(value).trim() === ''
      })?.id
  }
  if (resolvedFieldId) next[resolvedFieldId] = imageData
  if (signerName != null && String(signerName).trim() && resolvedFieldId) {
    const sigField = (s.template.fields ?? []).find((f: { id: string }) => f.id === resolvedFieldId) as { page?: number; y?: number; x?: number } | undefined
    const page = sigField?.page ?? 1
    const samePageFields = (s.template.fields ?? [])
      .filter((f: { page?: number; type?: string }) => (f.page ?? 1) === page && (f as { id?: string }).id)
      .map((f: { id: string; type: string; y?: number; x?: number }) => ({ id: f.id, type: f.type, y: f.y ?? 0, x: f.x ?? 0 }))
      .sort((a, b) => a.y - b.y || a.x - b.x)
    const sigIdx = samePageFields.findIndex((f: { id: string }) => f.id === resolvedFieldId)
    if (sigIdx > 0) {
      const prev = samePageFields[sigIdx - 1] as { id: string; type: string }
      if (String(prev.type).toUpperCase() === 'TEXT') {
        next[prev.id] = String(signerName).trim()
      }
    }
  }
  const sigs = parseSignatures(current)
  const existingIndex = sigs.findIndex((sig) => sig.signerId === signerId && (resolvedFieldId ? sig.fieldId === resolvedFieldId : true))
  const signatureItem = {
    signerId,
    signerRole,
    imageData,
    fieldId: resolvedFieldId ?? null,
    signedAt: new Date().toISOString(),
    signerName: signerName != null ? String(signerName).trim() || undefined : undefined,
  }
  if (existingIndex >= 0) sigs[existingIndex] = signatureItem
  else sigs.push(signatureItem)
  next.__signatures__ = sigs
  await prisma.pdfSubmission.update({
    where: { id: submissionId },
    data: { fieldValues: next as any },
  })
  if (signerRow) {
    await prisma.pdfSubmissionSigner.update({
      where: { id: signerRow.id },
      data: { signatureStatus: 'signed', signatureImageData: imageData, signedAt: new Date() },
    })
  }
  await checkSubmissionCompletion(submissionId)
  return {
    id: `sig-${Math.max(existingIndex, 0)}`,
    signerRole,
    imageData,
    fieldId: resolvedFieldId,
    signedAt: signatureItem.signedAt,
    signerName: signatureItem.signerName,
  }
}

export async function removeSignature(
  submissionId: string,
  userId: string,
  userRole: string,
  match: { signedAt?: string; signerId?: string; fieldId?: string | null; imageData?: string }
) {
  const s = await assertCanAccessSubmission(submissionId, userId, userRole)
  if (s.status === 'APPROVED') throw { status: 400, message: 'Cannot remove signatures from an approved submission' }

  const current = (s.fieldValues as Record<string, unknown>) || {}
  const sigs = parseSignatures(current)
  const signedAt = match?.signedAt ? String(match.signedAt) : ''
  const signerId = match?.signerId ? String(match.signerId) : ''
  const fieldId = match?.fieldId != null ? String(match.fieldId) : ''
  const imageData = match?.imageData ? String(match.imageData) : ''

  const nextSigs = sigs.filter((sig) => {
    if (!signedAt) return true
    if (String(sig.signedAt ?? '') !== signedAt) return true
    if (signerId && String(sig.signerId ?? '') !== signerId) return true
    if (fieldId && String(sig.fieldId ?? '') !== fieldId) return true
    if (imageData && String(sig.imageData ?? '') !== imageData) return true
    return false
  })

  if (nextSigs.length === sigs.length) {
    throw { status: 404, message: 'Signature not found' }
  }

  const nextValues: any = { ...current, __signatures__: nextSigs }
  await prisma.pdfSubmission.update({
    where: { id: submissionId },
    data: { fieldValues: nextValues },
  })

  // If this signature maps to a signer row, revert that row back to pending.
  if (signerId) {
    const signerRow = s.signers.find((row) => row.labourerUserId === signerId)
    if (signerRow) {
      await prisma.pdfSubmissionSigner.update({
        where: { id: signerRow.id },
        data: { signatureStatus: 'pending', signatureImageData: null, signedAt: null },
      })
    }
  }

  // Do not auto-submit here; completion check will run again on next signature add/submit.
  return { success: true }
}

export async function submitForm(
  submissionId: string,
  title?: string,
  signerUserIds?: string[],
  signerFieldAssignments?: SignerFieldAssignmentRow[]
) {
  const s = await prisma.pdfSubmission.findUnique({
    where: { id: submissionId },
    include: { template: { include: { fields: true } }, signers: true },
  })
  if (!s) throw { status: 404, message: 'Submission not found' }
  const existingHistory = Array.isArray(s.resubmissionHistory) ? (s.resubmissionHistory as unknown as ResubmissionHistoryEntry[]) : []
  const data: { title?: string } = {}
  if (title !== undefined && title !== null) {
    const t = String(title).trim()
    if (t) data.title = t
  }
  if (Object.keys(data).length > 0) {
    await prisma.pdfSubmission.update({
      where: { id: submissionId },
      data: data as any,
    })
  }

  const fieldValuesBase = (s.fieldValues as Record<string, unknown>) || {}
  const mergedFieldValues = { ...fieldValuesBase }

  const assignmentInput = normalizeSignerFieldAssignmentsInput(
    signerFieldAssignments,
    s.template.fields ?? [],
    fieldValuesBase
  )

  const fromRequest = normalizeSignerIds(signerUserIds)
  const fromTemplate = normalizeSignerIds((s.template.assignedUserIds as string[]) || [])

  let requiredSignerIds: string[]
  if (assignmentInput.length > 0) {
    requiredSignerIds = normalizeSignerIds(assignmentInput.map((a) => a.labourerUserId))
    mergedFieldValues[SIGNER_FIELD_ASSIGNMENTS_KEY] = assignmentInput
  } else {
    delete mergedFieldValues[SIGNER_FIELD_ASSIGNMENTS_KEY]
    requiredSignerIds = fromRequest.length > 0 ? fromRequest : fromTemplate
  }

  if (requiredSignerIds.length === 0) {
    delete mergedFieldValues[SIGNER_FIELD_ASSIGNMENTS_KEY]
    const finalPdfBlobPath = await generateFinalSignedPdf(submissionId)
    const updated = await prisma.pdfSubmission.update({
      where: { id: submissionId },
      data: {
        fieldValues: mergedFieldValues as any,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        finalPdfBlobPath: finalPdfBlobPath ?? s.finalPdfBlobPath,
        finalizedAt: finalPdfBlobPath ? new Date() : s.finalizedAt,
        ...(s.status === 'RESUBMIT_REQUIRED'
          ? {
              resubmissionReason: null,
              resubmissionRequestedAt: null,
              resubmissionRequestedById: null,
              resubmittedAt: new Date(),
              resubmissionHistory: [
                ...existingHistory,
                {
                  action: 'resubmitted',
                  at: new Date().toISOString(),
                  byId: s.submittedById ?? undefined,
                },
              ] as any,
            }
          : {}),
      },
      include: { template: { include: { fields: true } } },
    })
    await notificationService.notifyOwnerAndHr({
      title: 'Form submitted to HR',
      body: `"${updated.title ?? updated.template.name}" is ready for HR review.`,
      type: 'alert',
      linkTo: '/library?view=submissions',
      emailPreferenceKey: 'forms_pending',
    }).catch(() => {})
    schedulePdfQualityFindingRecompute(submissionId)
    return updated
  }

  await prisma.pdfSubmission.update({
    where: { id: submissionId },
    data: { fieldValues: mergedFieldValues as any },
  })

  const existing = new Map(s.signers.map((sig) => [sig.labourerUserId, sig]))
  const newSignerIds = new Set(requiredSignerIds.filter((id) => !existing.has(id)))
  for (const labourerUserId of requiredSignerIds) {
    if (existing.has(labourerUserId)) continue
    await prisma.pdfSubmissionSigner.create({
      data: {
        submissionId,
        labourerUserId,
        signatureStatus: 'pending',
      },
    })
  }

  const fieldValues = mergedFieldValues
  const signatureRows = parseSignatures(fieldValues)
  const signedIds = new Set(signatureRows.map((sig) => sig.signerId).filter(Boolean) as string[])
  const refreshedSigners = await prisma.pdfSubmissionSigner.findMany({ where: { submissionId } })
  for (const signer of refreshedSigners) {
    // Do not sync from __signatures__ for signer rows we just created: they must sign via addSignature.
    // This keeps "send to labourers to sign" as AWAITING_SIGNATURES until they actually sign.
    if (newSignerIds.has(signer.labourerUserId)) continue
    if (signedIds.has(signer.labourerUserId) && signer.signatureStatus !== 'signed') {
      await prisma.pdfSubmissionSigner.update({
        where: { id: signer.id },
        data: { signatureStatus: 'signed', signedAt: new Date() },
      })
    }
  }

  await prisma.pdfSubmission.update({
    where: { id: submissionId },
    data: {
      status: 'AWAITING_SIGNATURES',
      ...(s.status === 'RESUBMIT_REQUIRED'
        ? {
            resubmissionReason: null,
            resubmissionRequestedAt: null,
            resubmissionRequestedById: null,
            resubmittedAt: new Date(),
            resubmissionHistory: [
              ...existingHistory,
              {
                action: 'resubmitted',
                at: new Date().toISOString(),
                byId: s.submittedById ?? undefined,
              },
            ] as any,
          }
        : {}),
    },
  })

  // Field values were persisted above; same as no-signer submit — recompute Form Red Flags from checklist answers.
  schedulePdfQualityFindingRecompute(submissionId)

  const pendingSigners = await prisma.pdfSubmissionSigner.findMany({
    where: { submissionId, signatureStatus: { not: 'signed' } },
    select: { labourerUserId: true },
  })
  for (const signer of pendingSigners) {
    await notificationService.createNotification({
      userId: signer.labourerUserId,
      title: 'Document waiting for your signature',
      body: `A form is waiting for your signature before it can be sent to HR.`,
      type: 'alert',
      linkTo: `/forms/${submissionId}`,
      emailPreferenceKey: 'signature_required',
    }).catch(() => {})
  }

  await checkSubmissionCompletion(submissionId)
  return prisma.pdfSubmission.findUnique({
    where: { id: submissionId },
    include: { template: { include: { fields: true } } },
  })
}

export async function notifySubmissionToHr(submissionId: string, userId: string, userRole: string) {
  if (userRole !== 'owner' && userRole !== 'supervisor') {
    throw { status: 403, message: 'Only Owner or Supervisor can forward to HR' }
  }
  const s = await prisma.pdfSubmission.findUnique({
    where: { id: submissionId },
    include: { template: { select: { name: true } } },
  })
  if (!s) throw { status: 404, message: 'Submission not found' }
  const title = s.title ?? s.template?.name ?? 'Form'
  const sender = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  })
  const senderName = sender ? `${sender.firstName} ${sender.lastName}`.trim() || 'A supervisor' : 'A supervisor'
  await notificationService.notifyOwnerAndHr({
    title: 'Form forwarded for review',
    body: `${senderName} has forwarded "${title}" for HR review.`,
    type: 'info',
    linkTo: `/forms/${submissionId}`,
    emailPreferenceKey: 'forms_pending',
  }).catch(() => {})
  return { notified: true }
}

export async function approveSubmission(submissionId: string, userRole: string) {
  if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can approve' }
  const s = await prisma.pdfSubmission.findUnique({
    where: { id: submissionId },
    include: { template: { select: { name: true } } },
  })
  if (!s) throw { status: 404, message: 'Submission not found' }
  if (s.status !== 'SUBMITTED' && s.status !== 'AWAITING_SIGNATURES') {
    throw { status: 400, message: 'Only submitted forms can be approved' }
  }
  const updated = await prisma.pdfSubmission.update({
    where: { id: submissionId },
    data: { status: 'APPROVED' },
  })
  schedulePdfQualityFindingRecompute(submissionId)
  if (updated.submittedById) {
    await notificationService.createNotification({
      userId: updated.submittedById,
      title: 'Form approved',
      body: `Your submission "${s.template?.name ?? 'Form'}" has been approved.`,
      type: 'info',
      linkTo: '/forms',
      emailPreferenceKey: 'forms_pending',
    }).catch(() => {})
  }
  return updated
}

export async function requestSubmissionResubmission(
  submissionId: string,
  requesterId: string,
  userRole: string,
  reason: string
) {
  if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can request resubmission' }
  const trimmedReason = String(reason ?? '').trim()
  if (!trimmedReason) throw { status: 400, message: 'A resubmission reason is required' }

  const s = await prisma.pdfSubmission.findUnique({
    where: { id: submissionId },
    include: { template: { select: { name: true } } },
  })
  if (!s) throw { status: 404, message: 'Submission not found' }
  if (s.status !== 'SUBMITTED' && s.status !== 'AWAITING_SIGNATURES') {
    throw { status: 400, message: 'Only submitted forms can be sent back for resubmission' }
  }

  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { firstName: true, lastName: true },
  })
  const requesterName = requester ? `${requester.firstName} ${requester.lastName}`.trim() : 'HR'
  const existingHistory = Array.isArray(s.resubmissionHistory) ? (s.resubmissionHistory as unknown as ResubmissionHistoryEntry[]) : []

  const updated = await prisma.pdfSubmission.update({
    where: { id: submissionId },
    data: {
      status: 'RESUBMIT_REQUIRED',
      resubmissionReason: trimmedReason,
      resubmissionRequestedAt: new Date(),
      resubmissionRequestedById: requesterId,
      resubmissionHistory: [
        ...existingHistory,
        {
          action: 'requested',
          at: new Date().toISOString(),
          byId: requesterId,
          byName: requesterName,
          reason: trimmedReason,
        },
      ] as any,
    },
  })

  if (updated.submittedById) {
    await notificationService.createNotification({
      userId: updated.submittedById,
      title: 'Resubmission required',
      body: `${requesterName} sent "${s.title ?? s.template?.name ?? 'Form'}" back for changes. Reason: ${trimmedReason}`,
      type: 'alert',
      linkTo: `/forms/new/${updated.templateId}?draftId=${updated.id}`,
      emailPreferenceKey: 'forms_pending',
    }).catch(() => {})
  }

  return updated
}

export async function updateSubmissionStatus(
  id: string,
  userRole: string,
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'AWAITING_SIGNATURES' | 'RESUBMIT_REQUIRED'
) {
  if (!isOwnerOrHr(userRole) && status === 'APPROVED') {
    throw { status: 403, message: 'Only Owner or HR can approve' }
  }
  const s = await prisma.pdfSubmission.findUnique({
    where: { id },
    include: { template: { select: { name: true } } },
  })
  if (!s) throw { status: 404, message: 'Submission not found' }
  const updated = await prisma.pdfSubmission.update({
    where: { id },
    data: {
      status,
      ...(status === 'SUBMITTED' && { submittedAt: new Date() }),
    },
  })
  if (status === 'APPROVED' && updated.submittedById) {
    await notificationService.createNotification({
      userId: updated.submittedById,
      title: 'Form approved',
      body: `Your submission "${s.template?.name ?? 'Form'}" has been approved.`,
      type: 'info',
      linkTo: '/forms',
      emailPreferenceKey: 'forms_pending',
    }).catch(() => {})
  }
  return updated
}

export async function deleteSubmissionForAdmin(submissionId: string, userRole: string) {
  if (!isOwnerOrHr(userRole)) throw { status: 403, message: 'Only Owner or HR can delete submissions' }

  const s = await prisma.pdfSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      title: true,
      templateId: true,
      pdfBlobPath: true,
      finalPdfBlobPath: true,
    },
  })
  if (!s) throw { status: 404, message: 'Submission not found' }

  // Delete per-submission final PDF blob if it exists (templates are shared so we do not delete source blobs).
  if (s.finalPdfBlobPath && !s.finalPdfBlobPath.startsWith(CUSTOM_TEMPLATE_PREFIX)) {
    await deleteBlob(s.finalPdfBlobPath)
  }

  await prisma.submissionQualityFinding.deleteMany({
    where: { sourceType: 'PDF_SUBMISSION', sourceId: submissionId },
  })

  await prisma.pdfSubmission.delete({ where: { id: submissionId } })
  return {
    message: 'Submission deleted',
    id: submissionId,
    title: s.title ?? undefined,
  }
}

async function generateFinalSignedPdf(submissionId: string): Promise<string | undefined> {
  const s = await prisma.pdfSubmission.findUnique({
    where: { id: submissionId },
    include: { template: { include: { fields: true } }, signers: true },
  })
  if (!s) return undefined
  const sourcePath = s.pdfBlobPath ?? s.template.filePath
  let sourceBuffer: Buffer
  if (!sourcePath || sourcePath.startsWith(CUSTOM_TEMPLATE_PREFIX)) {
    // Native/custom templates have no source blob; generate a summary page as base content.
    sourceBuffer = await buildSubmissionSummaryPdfFromRecord(s as any)
  } else {
    sourceBuffer = await getBlobBuffer(sourcePath)
  }
  const pdfDoc = await PDFDocument.load(sourceBuffer)
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fieldValues = (s.fieldValues as Record<string, unknown>) || {}
  const signatures = parseSignatures(fieldValues)

  // Some templates can accumulate duplicate signature payloads for the same signer
  // across multiple signature placeholders. Keep one placement per signer/image and
  // prefer the field on the latest page so signatures do not repeat on every page.
  const dedupedSignatures = (() => {
    const bySigner = new Map<
      string,
      { sig: (typeof signatures)[number]; page: number; index: number }
    >()
    signatures.forEach((sig, index) => {
      const signerKey = `${String(sig.signerId ?? '').trim()}|${String(sig.signerName ?? '').trim()}|${String(sig.imageData ?? '').slice(0, 120)}`
      const field = s.template.fields.find((f) => f.id === sig.fieldId && f.type === 'SIGNATURE')
      const page = Math.max(Number(field?.page ?? 1), 1)
      const existing = bySigner.get(signerKey)
      if (!existing || page > existing.page || (page === existing.page && index > existing.index)) {
        bySigner.set(signerKey, { sig, page, index })
      }
    })
    return [...bySigner.values()]
      .sort((a, b) => a.index - b.index)
      .map((row) => row.sig)
  })()

  for (const sig of dedupedSignatures) {
    if (!sig.imageData || !sig.fieldId) continue
    const field = s.template.fields.find((f) => f.id === sig.fieldId && f.type === 'SIGNATURE')
    if (!field) continue
    const pageIndex = Math.max((field.page ?? 1) - 1, 0)
    const page = pdfDoc.getPage(pageIndex)
    const { width, height } = page.getSize()
    const w = Math.max((field.width ?? 0.2) * width, 24)
    const h = Math.max((field.height ?? 0.06) * height, 18)
    const x = Math.max((field.x ?? 0) * width, 0)
    const y = height - ((field.y ?? 0) * height) - h
    try {
      const b64 = String(sig.imageData).split(',')[1] || ''
      const png = await pdfDoc.embedPng(Buffer.from(b64, 'base64'))
      page.drawImage(png, { x, y, width: w, height: h })
    } catch {
      // Skip invalid signature payload and continue.
    }
  }

  if (s.signers.length > 0 && s.signers.every((signer) => signer.signatureStatus === 'signed')) {
    const lastPage = pdfDoc.getPage(pdfDoc.getPageCount() - 1)
    lastPage.drawText(`All required signatures captured (${s.signers.length}).`, {
      x: 30,
      y: 20,
      size: 9,
      font: helvetica,
    })
  }

  // If a supporting PDF is attached (e.g. toolbox talk reference), append it to the finalized file.
  if ((s as any).extraPdfBlobPath) {
    try {
      const extraPdfBuffer = await getBlobBuffer(String((s as any).extraPdfBlobPath))
      const extraDoc = await PDFDocument.load(extraPdfBuffer)
      const extraPages = await pdfDoc.copyPages(extraDoc, extraDoc.getPageIndices())
      for (const page of extraPages) pdfDoc.addPage(page)
    } catch {
      // Do not fail finalization if optional attachment processing fails.
    }
  }

  const finalBytes = await pdfDoc.save()
  const blobPath = `submissions/${submissionId}-signed.pdf`
  await uploadBufferToBlob(blobPath, Buffer.from(finalBytes), 'application/pdf')
  return blobPath
}

export async function checkSubmissionCompletion(submissionId: string) {
  const s = await prisma.pdfSubmission.findUnique({
    where: { id: submissionId },
    include: { template: true, signers: true },
  })
  if (!s || s.signers.length === 0) return { completed: false }
  const allSigned = s.signers.every((sig) => sig.signatureStatus === 'signed')
  if (!allSigned) return { completed: false }

  const finalPdfBlobPath = s.finalPdfBlobPath ?? (await generateFinalSignedPdf(submissionId))
  const updated = await prisma.pdfSubmission.update({
    where: { id: submissionId },
    data: {
      status: 'SUBMITTED',
      submittedAt: s.submittedAt ?? new Date(),
      finalPdfBlobPath: finalPdfBlobPath ?? s.finalPdfBlobPath,
      finalizedAt: new Date(),
    },
    include: { template: true },
  })

  await notificationService.notifyOwnerAndHr({
    title: 'Form ready for HR',
    body: `All labourer signatures are complete for "${updated.title ?? updated.template.name}".`,
    type: 'alert',
    linkTo: '/library?view=submissions',
    emailPreferenceKey: 'forms_pending',
  }).catch(() => {})

  schedulePdfQualityFindingRecompute(submissionId)

  return { completed: true, submissionId: updated.id, finalPdfBlobPath: updated.finalPdfBlobPath ?? undefined }
}

/**
 * Returns a summary of toolbox talk submissions linked to a specific job/project.
 * Toolbox talks are identified by template names containing 'tool box' or 'toolbox'.
 * Job linkage is via the __jobId__ key stored inside fieldValues JSON.
 */
export async function getToolboxTalkSummaryByJob(jobId: string) {
  // Find toolbox-talk template IDs
  const toolboxTemplates = await prisma.pdfTemplate.findMany({
    where: {
      OR: [
        { name: { contains: 'toolbox', mode: 'insensitive' } },
        { name: { contains: 'tool box', mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  })
  const templateIds = toolboxTemplates.map((t) => t.id)
  if (templateIds.length === 0) return { total: 0, submitted: 0, approved: 0 }

  // Fetch all submissions for those templates
  const submissions = await prisma.pdfSubmission.findMany({
    where: { templateId: { in: templateIds } },
    select: { id: true, status: true, fieldValues: true, title: true, createdAt: true, template: { select: { name: true } } },
    orderBy: { createdAt: 'desc' }
  })

  // Filter to only submissions linked to this jobId
  const linked = submissions.filter((s) => {
    const jid = extractLinkedJobId(s.fieldValues as Record<string, unknown>)
    return jid === jobId
  })

  return {
    total: linked.length,
    submitted: linked.filter((s) => s.status === 'SUBMITTED' || s.status === 'APPROVED').length,
    approved: linked.filter((s) => s.status === 'APPROVED').length,
    recentTalks: linked.slice(0, 5).map(s => ({
      id: s.id,
      title: s.title || s.template.name || 'Untitled Toolbox Talk',
      date: s.createdAt,
      status: s.status
    }))
  }
}

/**
 * Returns submitted forms for a job, limited to labourers/supervisors assigned
 * either directly to the job or to the parent site.
 */
export async function getAssignedPersonnelSubmissionsByJob(jobId: string, userId: string, userRole: string) {
  if (!(userRole === 'owner' || userRole === 'hr' || userRole === 'supervisor')) {
    throw { status: 403, message: 'Forbidden' }
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      supervisors: { select: { userId: true } },
      labourers: { select: { userId: true } },
      site: {
        select: {
          siteSupervisors: { select: { userId: true } },
          siteLabourers: { select: { userId: true } },
        },
      },
    },
  })
  if (!job) throw { status: 404, message: 'Job not found' }

  if (userRole === 'supervisor') {
    const canView =
      job.supervisors.some((s) => s.userId === userId) ||
      job.site?.siteSupervisors?.some((s) => s.userId === userId)
    if (!canView) throw { status: 403, message: 'Forbidden' }
  }

  const assignedIds = [
    ...new Set([
      ...job.supervisors.map((s) => s.userId),
      ...job.labourers.map((l) => l.userId),
      ...(job.site?.siteSupervisors ?? []).map((s) => s.userId),
      ...(job.site?.siteLabourers ?? []).map((l) => l.userId),
    ]),
  ]
  if (assignedIds.length === 0) return []

  const assignedUsers = await prisma.user.findMany({
    where: { id: { in: assignedIds }, role: { in: ['labourer', 'supervisor'] } },
    select: { id: true, firstName: true, lastName: true, role: true },
  })
  const assignedUserIds = assignedUsers.map((u) => u.id)
  if (assignedUserIds.length === 0) return []

  const submissions = await prisma.pdfSubmission.findMany({
    where: {
      submittedById: { in: assignedUserIds },
      status: { in: ['SUBMITTED', 'APPROVED', 'AWAITING_SIGNATURES'] },
    },
    select: {
      id: true,
      title: true,
      status: true,
      submittedById: true,
      submittedAt: true,
      createdAt: true,
      fieldValues: true,
      template: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const userMap = Object.fromEntries(
    assignedUsers.map((u) => [u.id, { name: `${u.firstName} ${u.lastName}`.trim(), role: u.role }])
  )

  const directJobAssignedIds = new Set([
    ...job.supervisors.map((s) => s.userId),
    ...job.labourers.map((l) => l.userId),
  ])

  return submissions
    .filter((s) => {
      const linkedJobId = extractLinkedJobId(s.fieldValues as Record<string, unknown>)
      if (linkedJobId === jobId) return true

      // Backward compatibility: older submissions may not have a linked job id.
      // If the submitter is directly assigned to this job, include it.
      if (!linkedJobId && s.submittedById && directJobAssignedIds.has(s.submittedById)) return true

      return false
    })
    .map((s) => ({
      id: s.id,
      title: s.title ?? s.template.name ?? 'Untitled form',
      templateName: s.template.name,
      status: s.status,
      submittedAt: s.submittedAt?.toISOString() ?? s.createdAt.toISOString(),
      submittedById: s.submittedById,
      submittedByName: s.submittedById ? userMap[s.submittedById]?.name : undefined,
      submittedByRole: s.submittedById ? userMap[s.submittedById]?.role : undefined,
    }))
}
