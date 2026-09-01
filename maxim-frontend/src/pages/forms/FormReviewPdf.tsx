import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useUser } from '@/contexts/UserContext'
import { NotFound } from '@/components/ui/NotFound'
import {
  deletePdfSubmission,
  fetchPdfSubmission,
  fetchPdfBlob,
  approvePdfSubmission,
  requestPdfSubmissionResubmission,
  type PdfSubmissionDetail,
} from '@/api/library'
import { pdfDataUrlToImageDataUrls } from '@/utils/pdfToImages'
import { api } from '@/api'
import SignatureModal from '@/components/pdf/SignatureModal'
import { Card } from '@/components/ui/Card'
import { useNavigate } from 'react-router-dom'
import { quickViewBlob, downloadBlob } from '@/utils/fileActions'
import { getDhaTaskLibraryEntry } from '@/data/dhaTaskLibrary'
import maximExportLogoSvgRaw from '@/assets/maxim-export-logo.inline.svg?raw'
import { isWashroomInspectionStyleTemplateName } from '@/utils/washroomTemplate'
import {
  preloadImageDataUrls,
  preloadImageDataUrlsAsync,
  printElementViaIframe,
  waitForAllImagesIn,
} from '@/utils/printDocument'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

const CUSTOM_TEMPLATE_PREFIX = 'custom-form://'
const SUBMISSIONS_BACK_TO = '/library?view=submissions&from=safety'
const DHA_WORKPLACE_VIOLENCE_QUESTIONS = [
  'History of threats or Violence?',
  'Near historically high crime area?',
  'Concerns voice by JHSC or workers?',
  'Workers required to work alone, late evenings or early mornings?',
  'Workers in contact with public?',
] as const

/** Match toolbox / daily-hazard style "Attendee 1 Name" / "Attendee 1 Signature" labels */
function getAttendeeSlotFromLabel(label?: string): { num: number; kind: string } | null {
  const m = String(label ?? '').match(/attendee\s*(\d+)\s*(name|signature)/i)
  if (!m) return null
  return { num: Number(m[1]), kind: String(m[2]).toLowerCase() }
}

function parseCustomFieldSpec(label?: string) {
  const raw = String(label ?? '').trim()
  if (!raw.startsWith('[DROPDOWN]')) return null
  const body = raw.replace(/^\[DROPDOWN\]/, '')
  const [question, optionsRaw = ''] = body.split('::')
  const options = optionsRaw
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
  return {
    label: question?.trim() || 'Select option',
    options,
  }
}

function parseJobDropdownMarker(label?: string) {
  const raw = String(label ?? '').trim()
  if (!raw.startsWith('[JOB_DROPDOWN]')) return null
  const question = raw.replace(/^\[JOB_DROPDOWN\]/, '').trim()
  return { label: question || 'Project' }
}

function simplifyIncidentDisplayLabel(label: string) {
  return String(label ?? '')
    .replace(/\((?:dd\/mm\/yyyy|hh:mm)\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanDisplayLabel(label: string) {
  return String(label ?? '')
    .replace(/\s*:+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatPipelineReviewSectionTitle(title: string) {
  const normalized = cleanDisplayLabel(title)
  if (!normalized) return 'Section'
  if (/project\s*&\s*location/i.test(normalized)) return 'Project & Location'
  if (/system\s*type/i.test(normalized)) return 'System Type'
  if (/system\s*composition/i.test(normalized)) return 'System Composition'
  if (/connection\s*procedure/i.test(normalized)) return 'Connection Procedure'
  if (/test\s*description/i.test(normalized)) return 'Test Description'
  if (/test\s*witnessed\s*by/i.test(normalized)) return 'Test Witnessed By'
  if (/record\s*&\s*identification/i.test(normalized)) return 'Record & Identification'
  return normalized
}

function formatPipelineReviewLabel(label: string) {
  const normalized = cleanDisplayLabel(label)
  if (!normalized) return 'Field'
  return normalized
    .replace(/^connection procedure\s*[-—]\s*/i, '')
    .replace(/^inspection\s*[-—]\s*/i, 'Inspection: ')
    .replace(/^pressure test\s*[-—]\s*/i, 'Pressure test: ')
    .replace(/\s*[-—]\s*print name$/i, ' (print name)')
    .replace(/\s*[-—]\s*signature$/i, ' (signature)')
    .replace(/\s*[-—]\s*date$/i, ' (date)')
}

function parseWeeklyHazardFieldMeta(field: { label?: string } | null | undefined):
  | { row: number; kind: 'item' | 'hazards' | 'likelihood' | 'corrective' | 'repeat' | 'dateResolved' | 'comments' }
  | null {
  const rawLabel = String(field?.label ?? '')
  const match = rawLabel.match(/^Hazard Row\s*(\d+)\s*:\s*(.+)$/i)
  if (!match) return null
  const row = Number(match[1])
  if (!Number.isFinite(row) || row <= 0) return null
  const desc = String(match[2] ?? '').toLowerCase()
  if (desc.includes('item') || desc.includes('location')) return { row, kind: 'item' }
  if (desc.includes('hazards observed')) return { row, kind: 'hazards' }
  if (desc.includes('likelihood')) return { row, kind: 'likelihood' }
  if (desc.includes('corrective measures')) return { row, kind: 'corrective' }
  if (desc.includes('repeat')) return { row, kind: 'repeat' }
  if (desc.includes('date resolved')) return { row, kind: 'dateResolved' }
  if (desc.includes('comments') || desc.includes('follow-up') || desc.includes('near miss')) return { row, kind: 'comments' }
  return null
}

function normalizeChecklistChoice(value: unknown): 'standard' | 'substandard' | 'na' | 'yes' | 'no' | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'standard') return 'standard'
  if (normalized === 'substandard') return 'substandard'
  if (normalized === 'yes') return 'yes'
  if (normalized === 'no') return 'no'
  if (normalized === 'na' || normalized === 'n/a' || normalized === 'missing') return 'na'
  return null
}

function normalizeWashroomChecklistChoice(value: unknown): 'yes' | 'no' | 'na' | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'yes' || normalized === 'true' || normalized === 'standard') return 'yes'
  if (normalized === 'no' || normalized === 'false' || normalized === 'substandard') return 'no'
  if (normalized === 'na' || normalized === 'n/a' || normalized === 'missing') return 'na'
  return null
}

function normalizeWeeklyChecklistLabel(label?: string) {
  return String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const WEEKLY_CHECKLIST_CATEGORY_BY_LABEL: Record<string, number> = {
  'housekeeping': 0,
  'guardrails secured': 0,
  'access egress areas': 0,
  'stairs ramps': 0,
  'dust control': 0,
  'head protections': 0,
  'head protection': 0,
  'foot protection': 0,
  'eye face protection': 0,
  'hearing protection': 0,
  'gloves protective clothing': 0,
  'respiratory protection': 0,
  'reflective traffic vests': 0,
  'fall protection harness': 0,
  'gas canisters closed': 1,
  'items stored stacked': 1,
  'chemicals labelled': 1,
  'proper storage location': 1,
  'compressed gas use and storage': 1,
  'flammables fuel storage': 1,
  'ventilation where required': 1,
  'asphalt material': 1,
  'protective coverings': 1,
  'staging and unloading areas identified': 1,
  'spill kits available': 1,
  'guarding in place': 1,
  'lockout tag equipment': 1,
  'vehicle storage condition': 2,
  'electrical cords': 2,
  'lifting equipment condition': 2,
  'scaffolding components': 2,
  'signal person where required conditions': 2,
  'hoists cranes': 2,
  'rappelling devices': 2,
  'welding cutting equipment': 2,
  'ladders condition and setup': 2,
  'power tools cords and body': 2,
  'hand tool condition': 2,
  'fuel powered tools': 2,
  'working platforms': 2,
  'fire extinguishers': 3,
  'emergency eyewash': 3,
  'first aid kit': 3,
  'fall prevention plan': 3,
  'emergency contact numbers postings': 3,
  'hospital map directions': 3,
  'electrical panels secured': 3,
  'gfcis ground fault': 3,
  'locates underground': 3,
  'washrooms water stations': 3,
  'alert system': 3,
  'overhead conductors': 3,
  'spill kits': 3,
  'site required postings': 4,
  'job work order': 4,
  'safety talks': 4,
  'daily jha completed': 4,
  'safe work practices and procedures': 4,
  'current msds': 4,
  'training records available': 4,
  'operators manuals': 4,
  'weekly inspections': 4,
  'site hazard assessment documents sheets': 4,
  'progressive discipline form': 4,
  'reporting forms': 4,
  'investigation package': 4,
  'lunchroom lockers': 5,
  'first aid training': 5,
  'visitors sign in area': 5,
  'desks tables chairs': 5,
  'policy statements safety violence and harassment': 5,
  'form 82 1234 poster': 5,
  'workplace inspections': 5,
  'mol orders copies': 5,
  'required regulations': 5,
  'regulation 1101': 5,
  'orientation guidelines': 5,
  'snow removal': 5,
}

function getWeeklyChecklistCategoryIndex(label?: string): number | null {
  const normalized = normalizeWeeklyChecklistLabel(label)
  if (!normalized) return null
  return Object.prototype.hasOwnProperty.call(WEEKLY_CHECKLIST_CATEGORY_BY_LABEL, normalized)
    ? WEEKLY_CHECKLIST_CATEGORY_BY_LABEL[normalized]
    : null
}

function isBlankReviewValue(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  const compact = normalized.replace(/\s+/g, '')
  return (
    normalized === '' ||
    normalized === '-' ||
    normalized === '—' ||
    normalized === '–' ||
    normalized === 'n/a' ||
    normalized === 'na' ||
    normalized === 'none' ||
    normalized === 'null' ||
    normalized === 'undefined' ||
    compact === 'n/a' ||
    compact === 'na' ||
    compact === 'select...' ||
    compact === 'select…' ||
    compact === 'select'
  )
}

function normalizeDhaLabel(raw?: string) {
  return String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function dhaRiskScore(risk?: string) {
  const value = String(risk ?? '').trim().toLowerCase()
  if (value === 'low') return 1
  if (value === 'medium') return 2
  if (value === 'high') return 3
  if (value === 'critical') return 4
  return null
}

function dhaRiskPillClass(risk?: string) {
  const value = String(risk ?? '').trim().toLowerCase()
  if (value === 'critical') return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-200 dark:border-red-700'
  if (value === 'high') return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-700'
  if (value === 'medium') return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-700'
  if (value === 'low') return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-700'
  return 'bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-600'
}

type ContinuousLimitStatus = {
  tone: 'ok' | 'alert' | 'unknown'
  emoji: string
  message: string
}

function parseNumericReading(value: string): number | null {
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const num = Number(match[0])
  return Number.isFinite(num) ? num : null
}

function getContinuousMonitoringLimitStatus(label: string, value: string): ContinuousLimitStatus | null {
  const normalizedLabel = String(label ?? '').toLowerCase()
  const reading = parseNumericReading(value)
  if (reading == null) {
    return {
      tone: 'unknown',
      emoji: '❓',
      message: 'Not a numeric reading',
    }
  }

  if (normalizedLabel.includes('o2')) {
    const inRange = reading >= 19.5 && reading <= 23
    return inRange
      ? { tone: 'ok', emoji: '✅', message: 'Within O2 acceptable range (19.5%-23%)' }
      : { tone: 'alert', emoji: '🚨', message: 'Outside O2 acceptable range (19.5%-23%)' }
  }
  if (normalizedLabel.includes('lel')) {
    const inRange = reading < 10
    return inRange
      ? { tone: 'ok', emoji: '✅', message: 'Within LEL acceptable limit (<10%)' }
      : { tone: 'alert', emoji: '🚨', message: 'Outside LEL acceptable limit (<10%)' }
  }
  if (normalizedLabel.includes('carbon monoxide') || normalizedLabel.includes('co ppm')) {
    const inRange = reading < 6
    return inRange
      ? { tone: 'ok', emoji: '✅', message: 'Within CO acceptable limit (<6 ppm)' }
      : { tone: 'alert', emoji: '🚨', message: 'Outside CO acceptable limit (<6 ppm)' }
  }
  if (normalizedLabel.includes('carbon dioxide') || normalizedLabel.includes('co2')) {
    const inRange = reading < 1250
    return inRange
      ? { tone: 'ok', emoji: '✅', message: 'Within CO2 acceptable limit (<1250 ppm)' }
      : { tone: 'alert', emoji: '🚨', message: 'Outside CO2 acceptable limit (<1250 ppm)' }
  }
  if (normalizedLabel.includes('hydrogen sulfide') || normalizedLabel.includes('h2s')) {
    const inRange = reading < 2.5
    return inRange
      ? { tone: 'ok', emoji: '✅', message: 'Within H2S acceptable limit (<2.5 ppm)' }
      : { tone: 'alert', emoji: '🚨', message: 'Outside H2S acceptable limit (<2.5 ppm)' }
  }
  return {
    tone: 'unknown',
    emoji: '❓',
    message: 'No configured acceptable limit for this metric',
  }
}

function parseWashroomChecklistItemLabel(label?: string) {
  const raw = String(label ?? '').trim()
  const match = raw.match(/^\[WASHROOM_ITEM\](.+?)::(.*)$/)
  if (!match) return null
  return { item: String(match[1] ?? '').trim(), description: String(match[2] ?? '').trim() }
}

function parseWashroomChecklistNotesLabel(label?: string) {
  const raw = String(label ?? '').trim()
  const match = raw.match(/^\[WASHROOM_NOTES\](.+)$/)
  if (!match) return null
  return { item: String(match[1] ?? '').trim() }
}

function isWashroomChecklistMetaLabel(label?: string) {
  const raw = String(label ?? '').trim()
  return raw.startsWith('[WASHROOM_ITEM]') || raw.startsWith('[WASHROOM_NOTES]')
}

function parseSectionMarker(label?: string) {
  const raw = String(label ?? '').trim()
  if (!raw.startsWith('[SECTION]')) return null
  const title = raw.replace(/^\[SECTION\]/, '').trim()
  return { title: title || 'Section' }
}

/** Match FormFill: numbered sections like "7) Lift System" and legacy ") Lift System" from bad stripping. */
function formatEquipmentInspectionReviewSectionTitle(raw: string) {
  let t = String(raw ?? '').trim()
  t = t.replace(/^\d+\)\s*/, '').replace(/^\)\s*/, '').trim()
  if (/^section\s*—/i.test(t)) return t
  return t ? `Section — ${t}` : 'Section'
}

function isCollectSignaturesMarker(label?: string) {
  return String(label ?? '').trim() === '[COLLECT_SIGNATURES]'
}

function isLotoRowLabel(label?: string) {
  return /^\d+\)\s*:?\s*$/.test(String(label ?? '').trim())
}

function parseLotoRowNumber(label?: string) {
  const m = String(label ?? '').trim().match(/^(\d+)\)\s*:?\s*$/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function parseLotoRowValue(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return { equipment: '', location: '', energyType: '', lockRemoved: '' }
  const parts = raw.split('|').map((p) => p.trim())
  return {
    equipment: parts[0] ?? '',
    location: parts[1] ?? '',
    energyType: parts[2] ?? '',
    lockRemoved: parts[3] ?? '',
  }
}

export function FormReviewPdf() {
  const { id } = useParams<{ id: string }>()
  const { user } = useUser()
  const navigate = useNavigate()
  const [submission, setSubmission] = useState<PdfSubmissionDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pageImages, setPageImages] = useState<string[]>([])
  const [loadingPdf, setLoadingPdf] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [approving, setApproving] = useState(false)
  const [signing, setSigning] = useState(false)
  const [showSignModal, setShowSignModal] = useState(false)
  const [forwardingToHr, setForwardingToHr] = useState(false)
  const [requestingResubmission, setRequestingResubmission] = useState(false)
  const [resubmitModalOpen, setResubmitModalOpen] = useState(false)
  const [resubmitReason, setResubmitReason] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [signingWorkerId, setSigningWorkerId] = useState<string>('')
  const [loadComplete, setLoadComplete] = useState(false)
  const printContentRef = useRef<HTMLDivElement>(null)
  const isCustomTemplate = Boolean(submission?.template?.filePath?.startsWith(CUSTOM_TEMPLATE_PREFIX))

  useEffect(() => {
    if (!id) {
      setLoadComplete(true)
      return
    }
    setLoadComplete(false)
    setSubmission(null)
    setLoadError(null)
    fetchPdfSubmission(id).then(({ submission: data, error }) => {
      setSubmission(data ?? null)
      setLoadError(error ?? null)
      setLoadComplete(true)
    })
  }, [id])

  useEffect(() => {
    if (isCustomTemplate) {
      setPageImages([])
      setLoadingPdf(false)
      return
    }
    const filePath = submission?.finalPdfBlobPath || submission?.template?.filePath
    if (!filePath) {
      setPageImages([])
      setLoadingPdf(false)
      return
    }
    setLoadingPdf(true)
    fetchPdfBlob(filePath)
      .then(blob => blobToDataUrl(blob))
      .then(dataUrl => pdfDataUrlToImageDataUrls(dataUrl))
      .then(setPageImages)
      .catch(() => setPageImages([]))
      .finally(() => setLoadingPdf(false))
  }, [submission?.template?.filePath, submission?.finalPdfBlobPath, isCustomTemplate])

  useEffect(() => {
    preloadImageDataUrls(pageImages)
  }, [pageImages])

  const pageCount = submission?.template?.pageCount ?? (pageImages.length || 1)
  const templateFields = useMemo(() => {
    return Array.isArray(submission?.template?.fields) ? submission!.template!.fields : []
  }, [submission?.template?.fields])
  const signerRows = useMemo(() => {
    return Array.isArray(submission?.signers) ? submission!.signers! : []
  }, [submission?.signers])
  const signatures = useMemo(() => {
    return Array.isArray(submission?.signatures) ? submission!.signatures! : []
  }, [submission?.signatures])

  const valueByFieldId = useMemo(() => {
    const map: Record<string, string | number | boolean> = {}
    const vals = Array.isArray(submission?.values) ? submission!.values : []
    vals.forEach((v) => {
      if (v.fieldId != null) map[v.fieldId] = v.value as string | number | boolean
    })
    return map
  }, [submission?.values])

  useEffect(() => {
    if (!isCustomTemplate) return
    const urls: string[] = []
    signatures.forEach((s) => {
      if (typeof s.imageData === 'string' && s.imageData.startsWith('data:')) urls.push(s.imageData)
    })
    Object.values(valueByFieldId).forEach((v) => {
      if (typeof v === 'string' && v.startsWith('data:image')) urls.push(v)
    })
    preloadImageDataUrls(urls)
  }, [isCustomTemplate, signatures, valueByFieldId])

  const templateFieldIdSet = useMemo(() => new Set(templateFields.map((f) => f.id)), [templateFields])
  const unmappedLegacyValues = useMemo(() => {
    const vals = Array.isArray(submission?.values) ? submission!.values : []
    return vals
      .filter((v) => v?.fieldId && !templateFieldIdSet.has(v.fieldId))
      .map((v) => ({ fieldId: String(v.fieldId), value: v.value }))
      .filter((row) => row.value != null && String(row.value).trim() !== '')
      .sort((a, b) => a.fieldId.localeCompare(b.fieldId))
  }, [submission?.values, templateFieldIdSet])
  const signatureFields = useMemo(() => {
    const list = templateFields.filter((f) => (f.type || '').toUpperCase() === 'SIGNATURE')
    list.sort((a, b) => (a.page ?? 1) - (b.page ?? 1) || (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))
    return list
  }, [templateFields])
  const signerFieldAssignments = useMemo(() => {
    const raw = submission?.signerFieldAssignments
    return Array.isArray(raw) ? raw : []
  }, [submission?.signerFieldAssignments])
  const nextSignatureFieldId = useMemo(() => {
    const effectiveSignerId =
      signingWorkerId || (submission?.needsMySignature && user?.id ? user.id : '')
    if (signerFieldAssignments.length > 0 && effectiveSignerId) {
      const row = signerFieldAssignments.find((a) => a.labourerUserId === effectiveSignerId)
      if (row?.fieldId) {
        const value = valueByFieldId[row.fieldId]
        if (value == null || String(value).trim() === '') return row.fieldId
        return undefined
      }
    }
    const candidate = signatureFields.find((field) => {
      const value = valueByFieldId[field.id]
      return value == null || String(value).trim() === ''
    })
    return candidate?.id
  }, [
    signatureFields,
    valueByFieldId,
    signerFieldAssignments,
    signingWorkerId,
    submission?.needsMySignature,
    user?.id,
  ])

  /** Must run every render — do not place after conditional returns (Rules of Hooks). */
  const signaturesCollected = useMemo(() => {
    const list = signatures.filter((s) => !!s.imageData)
    return list.sort((a, b) => {
      const ta = a.signedAt ? new Date(a.signedAt).getTime() : 0
      const tb = b.signedAt ? new Date(b.signedAt).getTime() : 0
      return tb - ta
    })
  }, [signatures])

  const selectedSigningWorker = useMemo(() => {
    if (!signingWorkerId) return null
    return signerRows.find((s) => s.labourerUserId === signingWorkerId) ?? null
  }, [signerRows, signingWorkerId])

  const selectedSigningWorkerSigned = selectedSigningWorker?.signatureStatus === 'signed'

  const signingWorkerLabel = useMemo(() => {
    if (!selectedSigningWorker) return ''
    return selectedSigningWorker.signer?.displayName ?? selectedSigningWorker.labourerUserId
  }, [selectedSigningWorker])

  const signingWorkerOptions = useMemo(() => {
    const signers = signerRows
    const isLabourer = user?.role === 'labourer'
    if (isLabourer) return signers.filter((s) => s.labourerUserId === user?.id)
    return signers
  }, [signerRows, user?.id, user?.role])

  /** PdfSubmissionSigner rows not yet signed — used to show who still needs to sign (e.g. DHA). */
  const pendingSignersForDisplay = useMemo(() => {
    return signerRows
      .filter((s) => String(s.signatureStatus ?? '').toLowerCase() !== 'signed')
      .map((s) => {
        const name = s.signer?.displayName?.trim()
        return {
          labourerUserId: s.labourerUserId,
          displayName: name && name.length > 0 ? name : `User ID: ${s.labourerUserId}`,
        }
      })
  }, [signerRows])

  /**
   * Native forms store signature images on template field ids; __signatures__ may be empty.
   * Build a single list for HR review (SUBMITTED / APPROVED / AWAITING_SIGNATURES).
   */
  const customTemplateSignatureRows = useMemo(() => {
    type Row = {
      key: string
      imageData: string
      name: string
      signedAt?: string
      fieldLabel?: string
    }
    const rows: Row[] = []
    if (templateFields.length === 0) return rows

    const sigFields = templateFields
      .filter((f) => (f.type || '').toUpperCase() === 'SIGNATURE')
      .sort((a, b) => {
        const sa = getAttendeeSlotFromLabel(a.label)?.num ?? 0
        const sb = getAttendeeSlotFromLabel(b.label)?.num ?? 0
        if (sa !== sb) return sa - sb
        return (a.page ?? 1) - (b.page ?? 1) || (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0)
      })

    const seenFieldIds = new Set<string>()
    for (const sf of sigFields) {
      const raw = valueByFieldId[sf.id]
      const str = raw != null ? String(raw).trim() : ''
      if (!str.startsWith('data:image/')) continue
      seenFieldIds.add(sf.id)
      const slot = getAttendeeSlotFromLabel(sf.label)
      let nameFromField = ''
      if (slot) {
        const nameField = templateFields.find((f) => {
          const s = getAttendeeSlotFromLabel(f.label)
          return s && s.num === slot.num && s.kind === 'name'
        })
        if (nameField) {
          const nv = valueByFieldId[nameField.id]
          nameFromField = nv != null ? String(nv).trim() : ''
        }
      }
      const meta = signatures.find((s) => s.fieldId === sf.id && s.imageData)
      const name =
        nameFromField ||
        (meta?.signerName && String(meta.signerName).trim()) ||
        meta?.signer?.displayName ||
        (sf.label ? String(sf.label) : 'Participant')
      rows.push({
        key: sf.id,
        imageData: str,
        name,
        signedAt: meta?.signedAt,
        fieldLabel: sf.label,
      })
    }

    for (const sig of signatures) {
      if (!sig.imageData) continue
      const fid = sig.fieldId
      if (fid && seenFieldIds.has(fid)) continue
      const key = fid ?? sig.id
      if (rows.some((r) => r.key === key)) continue
      rows.push({
        key,
        imageData: sig.imageData,
        name: sig.signerName ?? sig.signer?.displayName ?? 'Signer',
        signedAt: sig.signedAt,
      })
    }

    return rows
  }, [templateFields, valueByFieldId, signatures])

  const showCustomSignaturesSection =
    templateFields.some((f) => (f.type || '').toUpperCase() === 'SIGNATURE') ||
    customTemplateSignatureRows.length > 0 ||
    signaturesCollected.length > 0

  const isWeeklyProjectInspectionTemplate = /weekly\s*project\s*inspection/i.test(String(submission?.template?.name ?? ''))
  const isDailyHazardTemplate = /daily\s*hazard|daily\s*jha/i.test(String(submission?.template?.name ?? ''))
  const isHotWorkPermitTemplate = /hot\s*work\s*permit/i.test(String(submission?.template?.name ?? ''))
  const isConfinedSpaceEntryPermitTemplate = /confined\s*space\s*entry\s*permit/i.test(String(submission?.template?.name ?? ''))
  const isWashroomInspectionTemplate = isWashroomInspectionStyleTemplateName(submission?.template?.name)
  const isFallArrestInspectionTemplate = /fall\s*arrest\s*inspection(\s*checklist)?/i.test(String(submission?.template?.name ?? ''))
  const isIncidentReportsTemplate = /incident\s*reports\s*form/i.test(String(submission?.template?.name ?? ''))
  const isInvestigationKitTemplate = /investigation\s*kit|investigation\s*report/i.test(String(submission?.template?.name ?? ''))
  const isCriticalTaskRiskRegisterTemplate =
    /critical\s*task\s*inventory/i.test(String(submission?.template?.name ?? '')) &&
    /risk\s*register/i.test(String(submission?.template?.name ?? ''))
  const isLegislativeComplianceTemplate = /legislative\s*compliance|compliance\s*evaluation/i.test(String(submission?.template?.name ?? ''))
  const isPowerElevatingTemplate = /power\s*(?:elevating|elevating\s*\/\s*work|work\s*platform)/i.test(String(submission?.template?.name ?? ''))
  const isEquipmentInspectionTemplate = /equipment\s*inspection/i.test(String(submission?.template?.name ?? ''))
  const isPipelineSafetyFormTemplate =
    /pressure\s*testing\s*checklist/i.test(String(submission?.template?.name ?? '')) ||
    /active\s*pipeline\s*connections.*hydrocarbon/i.test(String(submission?.template?.name ?? '')) ||
    /drain\s*and\s*vent\s*test\s*form/i.test(String(submission?.template?.name ?? ''))
  const useEnhancedSectionReview =
    isHotWorkPermitTemplate ||
    isIncidentReportsTemplate ||
    isInvestigationKitTemplate ||
    isLegislativeComplianceTemplate ||
    isPowerElevatingTemplate ||
    isEquipmentInspectionTemplate ||
    isPipelineSafetyFormTemplate
  const isLotoTemplate = /lock\s*out|tag\s*out|loto/i.test(String(submission?.template?.name ?? ''))

  const dhaStructuredReview = useMemo(() => {
    const empty = {
      fields: {
        date: '—',
        project: '—',
        musterPoint: '—',
        supervisor: '—',
        jobNumber: '—',
        weather: '—',
        nearestHospital: '—',
        emergencyCoordinator: '—',
        correctiveActions: '—',
        toolsCondition: '—',
        additionalComments: '—',
      },
      checkedWeather: [] as string[],
      selectedActivities: [] as string[],
      selectedHazards: [] as string[],
      selectedControls: [] as string[],
      selectedExternalHazards: [] as string[],
      selectedPpe: [] as string[],
      violenceAnswers: [] as Array<{ question: string; answer: string }>,
      signatures: [] as typeof customTemplateSignatureRows,
    }
    if (!isDailyHazardTemplate) return empty

    const resolvedByLabel = new Map<string, string>()
    for (const field of templateFields) {
      const rawLabel = parseJobDropdownMarker(field.label)?.label ?? parseCustomFieldSpec(field.label)?.label ?? field.label ?? ''
      const label = normalizeDhaLabel(rawLabel)
      const value = String(valueByFieldId[field.id] ?? '').trim()
      if (!value) continue
      resolvedByLabel.set(label, value)
    }

    const getByAliases = (aliases: string[][], opts?: { preferNonBoolean?: boolean }) => {
      const entries = Array.from(resolvedByLabel.entries())
      const isBooleanish = (v: string) => {
        const n = normalizeDhaLabel(v)
        return n === 'true' || n === 'false' || n === 'yes' || n === 'no' || n === 'checked' || n === 'unchecked'
      }
      for (const aliasParts of aliases) {
        const exact = entries.find(([label]) => label === normalizeDhaLabel(aliasParts.join(' ')))
        if (exact?.[1]) {
          if (opts?.preferNonBoolean && isBooleanish(exact[1])) continue
          return exact[1]
        }
      }
      for (const aliasParts of aliases) {
        const hit = entries.find(([label]) =>
          aliasParts.every((part) => label.includes(normalizeDhaLabel(part)))
        )
        if (hit?.[1]) {
          if (opts?.preferNonBoolean && isBooleanish(hit[1])) continue
          return hit[1]
        }
      }
      return '—'
    }

    const activities = [
      'CONCRETE FORMING & POURING', 'CONFINED SPACE', 'CRANE USE HOISTING AND RIGGING', 'DEMOLITION',
      'DRYWALL INSTALLATION/FINISHING', 'ELECTRICAL WORK', 'EQUIPMENT/TOOL USE', 'EXCAVATION & TRENCHING',
      'FLOORING INSTALLATION', 'HARDWARE INSTALLATION', 'HAZARDOUS ENERGY CONTROL (LOTO)', 'HOT-WORK',
      'HOUSEKEEPING', 'HVAC WORK', 'MANUAL MATERIAL STORAGE & HANDLING', 'PAINTING', 'PLUMBING WORK',
      'SPRINKLER WORK', 'TRUCK LOADING & UNLOADING', 'WORK PLATFORM USE (LADDER/SCAFFOLD)', 'WORKING AT HEIGHTS',
    ]
    const hazards = [
      'ADJACENT PUBLIC AREAS', 'COLD STRESS', 'DAMAGED EQUIPMENT', 'DESIGNATED SUBSTANCES',
      'DUSTS MISTS FUMES', 'FALLS', 'HAZARDOUS ENERGY', 'HAZARDOUS MATERIALS/CHEMICALS',
      'HEAT STRESS', 'LACK OF SUBCONTRACTOR PROCEDURES', 'LACK OF TRAINING', 'NOISE',
      'POOR LIGHTING', 'RESPIRATORY HAZARDS', 'SITE VISIBILITY (HILL BEND NIGHT WORK)', 'SLIPS TRIPS', 'UNDERGROUND UTILITIES',
    ]
    const controls = [
      'ADEQUATE DRINKING WATER AVAILABLE', 'DUST CONTROL MEASURES', 'EMERGENCY RESPONSE PROCEDURES',
      'EQUIPMENT/TOOL INSPECTIONS', 'FALL PREVENTION PLAN', 'HAZARDOUS ENERGY CONTROL (LOTO)', 'HOUSEKEEPING',
      '(M)SDS AVAILABLE', 'MECHANICAL VENTILATION', 'NATURAL VENTILATION', 'NOISE MONITORING',
      'PERSONAL PROTECTIVE EQUIPMENT', 'SAFE ACCESS/EGRESS TO WORK AREAS', 'SIGNAL PERSONS AVAILABLE',
      'SUBCONTRACTOR PROCEDURES IN PLACE', 'TEMPORARY LIGHTING', 'TRAFFIC MANAGEMENT PLAN', 'TRAINING CERTIFICATIONS', 'UTILITY LOCATES',
    ]
    const externalHazards = ['INCLEMENT WEATHER', 'HIGH WINDS', 'TRAFFIC', 'NEIGHBOURING CONSTRUCTION', 'PUBLIC ACCESS', 'PUBLIC PROTECTION IN PLACE', 'OVERHEAD HAZARDS']
    const ppe = ['HEAD PROTECTION', 'FOOT PROTECTION', 'EYE PROTECTION', 'ARC FLASH', 'HEARING PROTECTION', 'FALL PROTECTION', 'HAND PROTECTION', 'SKIN PROTECTION', 'RESPIRATORY PROTECTION', 'HI-VIS PROTECTION']
    const violenceQuestions = [
      'History of threats or Violence?',
      'Near historically high crime area?',
      'Concerns voice by JHSC or workers?',
      'Workers required to work alone, late evenings or early mornings?',
      'Workers in contact with public?',
    ]
    const weatherLabels = ['Rain', 'Snow', 'Wind', 'Lightning', 'Sun', 'Overcast']
    const selectedActivities = activities.filter((item) => {
      const v = resolvedByLabel.get(normalizeDhaLabel(item))
      return v === 'true' || v === '1' || normalizeDhaLabel(v) === 'yes'
    })
    const selectedHazards = hazards.filter((item) => {
      const v = resolvedByLabel.get(normalizeDhaLabel(item))
      return v === 'true' || v === '1' || normalizeDhaLabel(v) === 'yes'
    })
    const selectedControls = controls.filter((item) => {
      const v = resolvedByLabel.get(normalizeDhaLabel(item))
      return v === 'true' || v === '1' || normalizeDhaLabel(v) === 'yes'
    })
    const selectedExternalHazards = externalHazards.filter((item) => {
      const v = resolvedByLabel.get(normalizeDhaLabel(item))
      return v === 'true' || v === '1' || normalizeDhaLabel(v) === 'yes'
    })
    const selectedPpe = ppe.filter((item) => {
      const v = resolvedByLabel.get(normalizeDhaLabel(item))
      return v === 'true' || v === '1' || normalizeDhaLabel(v) === 'yes'
    })
    const violenceAnswers = violenceQuestions.map((question) => {
      const raw = resolvedByLabel.get(normalizeDhaLabel(question)) ?? ''
      const norm = normalizeDhaLabel(raw)
      const answer = norm === 'yes' ? 'Yes' : norm === 'no' ? 'No' : '—'
      return { question, answer }
    })
    const weatherAliases: Record<string, string[]> = {
      Rain: ['rain'],
      Snow: ['snow'],
      Wind: ['wind'],
      Lightning: ['lightning'],
      Sun: ['sun'],
      Overcast: ['overcast'],
    }
    const checkedWeather = weatherLabels.filter((item) => {
      const aliases = weatherAliases[item] ?? [item]
      return aliases.some((aliasRaw) => {
        const alias = normalizeDhaLabel(aliasRaw)
        const v = Array.from(resolvedByLabel.entries()).find(([label]) =>
          label === alias || label.includes(alias) || alias.includes(label)
        )?.[1]
        if (!v) return false
        return v === 'true' || v === '1' || normalizeDhaLabel(v) === 'yes' || normalizeDhaLabel(v) === 'checked'
      })
    })
    const syntheticWeather = String(valueByFieldId['__dha_weather__'] ?? '').trim()
    const syntheticNearestHospital = String(valueByFieldId['__dha_nearest_hospital__'] ?? '').trim()
    const syntheticEmergencyCoordinator = String(valueByFieldId['__dha_emergency_coordinator__'] ?? '').trim()
    const syntheticViolenceActions = String(valueByFieldId['__dha_violence_actions__'] ?? '').trim()
    const syntheticWeatherConditions = String(valueByFieldId['__dha_weather_conditions__'] ?? '').trim()
    const syntheticViolenceAnswers = DHA_WORKPLACE_VIOLENCE_QUESTIONS.map((question, idx) => {
      const raw = String(valueByFieldId[`__dha_violence_q_${idx}__`] ?? '').trim().toLowerCase()
      const answer = raw === 'yes' ? 'Yes' : raw === 'no' ? 'No' : '—'
      return { question, answer }
    })

    return {
      fields: {
        date: getByAliases([['date'], ['inspection', 'date']]),
        project: getByAliases([['project'], ['job', 'project']]),
        musterPoint: getByAliases([['muster', 'point'], ['meeting', 'point']]),
        supervisor: getByAliases([['supervisor']]),
        jobNumber: getByAliases([['job', 'number']]),
        weather: syntheticWeather || getByAliases([['weather', 'c'], ['weather', 'temp'], ['temperature'], ['weather']], { preferNonBoolean: true }),
        nearestHospital: syntheticNearestHospital || getByAliases([['nearest', 'hospital'], ['nearest', 'hosptial'], ['hospital', 'name'], ['hospital']], { preferNonBoolean: true }),
        emergencyCoordinator: syntheticEmergencyCoordinator || getByAliases([['emergency', 'response', 'coordinator'], ['emergency', 'coordinator'], ['response', 'coordinator']]),
        correctiveActions: syntheticViolenceActions || getByAliases([['corrective', 'actions'], ['violence', 'actions']]),
        toolsCondition: getByAliases([['tools', 'replaced'], ['tools', 'repaired'], ['equipment', 'replaced'], ['equipment', 'repaired']]),
        additionalComments: getByAliases([['additional', 'comments'], ['comments', 'concerns'], ['comments']]),
      },
      checkedWeather: syntheticWeatherConditions
        ? syntheticWeatherConditions.split('|').map((s) => s.trim()).filter(Boolean)
        : checkedWeather,
      selectedActivities,
      selectedHazards,
      selectedControls,
      selectedExternalHazards,
      selectedPpe,
      violenceAnswers: syntheticViolenceAnswers.some((r) => r.answer !== '—') ? syntheticViolenceAnswers : violenceAnswers,
      signatures: customTemplateSignatureRows,
    }
  }, [isDailyHazardTemplate, templateFields, valueByFieldId, customTemplateSignatureRows])

  const confinedSpaceStructuredReview = useMemo(() => {
    type ConfinedItem = {
      id: string
      label: string
      value: string
      choice?: 'yes' | 'no' | 'na'
      isSignature?: boolean
    }
    type ConfinedSection = {
      key: string
      title: string
      order: number
      infoLines: string[]
      items: ConfinedItem[]
    }
    const empty = { sections: [] as ConfinedSection[], handledFieldIds: new Set<string>() }
    if (!isConfinedSpaceEntryPermitTemplate) return empty

    const sections = new Map<string, ConfinedSection>()
    const handledFieldIds = new Set<string>()
    let activeKey = 'permit-details'
    let activeTitle = 'Permit details'
    let activeOrder = 0

    const sectionOrder = (title: string) => {
      const normalized = title.toLowerCase()
      if (normalized.includes('permit details')) return 0
      if (normalized.includes('hazards')) return 100
      if (normalized.includes('atmospheric testing')) return 200
      if (normalized.includes('continuous monitoring')) return 250
      if (normalized.includes('personnel')) return 300
      if (normalized.includes('rescue')) return 400
      if (normalized.includes('acknowledgements')) return 500
      if (normalized.includes('signatures')) return 600
      return 900
    }

    const ensureSection = (key: string, title: string, order: number) => {
      const existing = sections.get(key)
      if (existing) return existing
      const created: ConfinedSection = { key, title, order, infoLines: [], items: [] }
      sections.set(key, created)
      return created
    }

    ensureSection(activeKey, activeTitle, activeOrder)

    for (const field of templateFields) {
      const sectionMarker = parseSectionMarker(field.label)
      if (sectionMarker) {
        handledFieldIds.add(field.id)
        activeTitle = cleanDisplayLabel(sectionMarker.title)
        activeKey = activeTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        activeOrder = sectionOrder(activeTitle)
        ensureSection(activeKey, activeTitle || 'Section', activeOrder)
        continue
      }
      if (isCollectSignaturesMarker(field.label)) {
        handledFieldIds.add(field.id)
        continue
      }

      const rawLabel = String(field.label ?? '').trim()
      if (rawLabel.startsWith('[INFO]')) {
        handledFieldIds.add(field.id)
        const infoText = cleanDisplayLabel(rawLabel.replace(/^\[INFO\]/, '').trim())
        if (infoText) ensureSection(activeKey, activeTitle, activeOrder).infoLines.push(infoText)
        continue
      }

      const rawValue = valueByFieldId[field.id]
      if (isBlankReviewValue(rawValue)) continue

      const fieldType = (field.type || '').toUpperCase()
      const resolvedLabel = cleanDisplayLabel(
        simplifyIncidentDisplayLabel(
          (
            parseJobDropdownMarker(rawLabel)?.label ??
            parseCustomFieldSpec(rawLabel)?.label ??
            rawLabel
          ) || 'Field'
        )
      )

      let choice: 'yes' | 'no' | 'na' | undefined
      let valueText = String(rawValue ?? '').trim()
      if (fieldType === 'CHECKBOX') {
        const normalized = normalizeChecklistChoice(rawValue)
        choice =
          normalized === 'yes' || normalized === 'standard'
            ? 'yes'
            : normalized === 'no' || normalized === 'substandard'
              ? 'no'
              : normalized === 'na'
                ? 'na'
                : undefined
        valueText = choice === 'yes' ? 'Yes' : choice === 'no' ? 'No' : choice === 'na' ? 'N/A' : valueText
      }

      handledFieldIds.add(field.id)
      ensureSection(activeKey, activeTitle, activeOrder).items.push({
        id: field.id,
        label: resolvedLabel,
        value: valueText,
        choice,
        isSignature: fieldType === 'SIGNATURE' && valueText.startsWith('data:image/'),
      })
    }

    return {
      sections: Array.from(sections.values())
        .filter((section) => section.infoLines.length > 0 || section.items.length > 0)
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
      handledFieldIds,
    }
  }, [isConfinedSpaceEntryPermitTemplate, templateFields, valueByFieldId])

  const criticalTaskStructuredReview = useMemo(() => {
    type Section = {
      key: string
      title: string
      order: number
      items: Array<{ id: string; label: string; value: string }>
    }
    const empty = { sections: [] as Section[], handledFieldIds: new Set<string>() }
    if (!isCriticalTaskRiskRegisterTemplate) return empty

    const sections = new Map<string, Section>()
    const handledFieldIds = new Set<string>()
    let activeKey = 'register-header'

    const getOrCreateSection = (key: string, title: string, order: number) => {
      const existing = sections.get(key)
      if (existing) return existing
      const created: Section = { key, title, order, items: [] }
      sections.set(key, created)
      return created
    }

    for (const field of templateFields) {
      const marker = parseSectionMarker(field.label)
      if (marker) {
        handledFieldIds.add(field.id)
        const markerTitle = cleanDisplayLabel(marker.title)
        const markerNorm = markerTitle.toLowerCase()
        const taskMatch = markerNorm.match(/^critical task\s+(\d+)$/)
        if (taskMatch) {
          const n = Number(taskMatch[1])
          activeKey = `task-${n}`
          getOrCreateSection(activeKey, `Critical task ${n}`, 100 + n)
          continue
        }
        if (markerNorm.includes('register header')) {
          activeKey = 'register-header'
          getOrCreateSection('register-header', 'Register header', 0)
          continue
        }
        if (markerNorm.includes('summary')) {
          activeKey = 'summary-register-maintenance'
          getOrCreateSection(activeKey, 'Summary & register maintenance', 1000)
          continue
        }
        if (markerNorm.includes('approval')) {
          activeKey = 'approval-optional'
          getOrCreateSection(activeKey, 'Approval (optional)', 1100)
          continue
        }
        activeKey = markerNorm.replace(/[^a-z0-9]+/g, '-')
        getOrCreateSection(activeKey, markerTitle || 'Section', 1500)
        continue
      }

      if (isCollectSignaturesMarker(field.label)) {
        handledFieldIds.add(field.id)
        continue
      }

      const raw = valueByFieldId[field.id]
      if (isBlankReviewValue(raw)) continue

      const rawLabel = String(field.label ?? '')
      const parsedLabel = cleanDisplayLabel(
        simplifyIncidentDisplayLabel(
          (
            parseJobDropdownMarker(rawLabel)?.label ??
            parseCustomFieldSpec(rawLabel)?.label ??
            rawLabel.trim()
          ) || 'Field'
        )
      )
      const fieldType = (field.type || '').toUpperCase()
      let valueText = String(raw ?? '').trim()
      if (fieldType === 'CHECKBOX') {
        const choice = normalizeChecklistChoice(raw)
        valueText =
          choice === 'yes' || choice === 'standard'
            ? 'Yes'
            : choice === 'no' || choice === 'substandard'
              ? 'No'
              : choice === 'na'
                ? 'N/A'
                : valueText
      }

      let sectionKey = activeKey
      let sectionTitle = 'Register header'
      let order = 0
      let itemLabel = parsedLabel

      const taskLabelMatch = parsedLabel.match(/^task\s+(\d+)\s*[—-]\s*(.+)$/i)
      if (taskLabelMatch) {
        const n = Number(taskLabelMatch[1])
        sectionKey = `task-${n}`
        sectionTitle = `Critical task ${n}`
        order = 100 + n
        itemLabel = cleanDisplayLabel(taskLabelMatch[2] ?? parsedLabel)
      } else if (sectionKey.startsWith('task-')) {
        const n = Number(sectionKey.replace('task-', ''))
        sectionTitle = Number.isFinite(n) ? `Critical task ${n}` : 'Critical task'
        order = Number.isFinite(n) ? 100 + n : 100
      } else if (sectionKey === 'summary-register-maintenance') {
        sectionTitle = 'Summary & register maintenance'
        order = 1000
      } else if (sectionKey === 'approval-optional') {
        sectionTitle = 'Approval (optional)'
        order = 1100
      } else {
        sectionKey = 'register-header'
        sectionTitle = 'Register header'
        order = 0
      }

      handledFieldIds.add(field.id)
      getOrCreateSection(sectionKey, sectionTitle, order).items.push({
        id: field.id,
        label: itemLabel,
        value: valueText || '—',
      })
    }

    const ordered = Array.from(sections.values())
      .filter((section) => section.items.length > 0)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))

    return { sections: ordered, handledFieldIds }
  }, [isCriticalTaskRiskRegisterTemplate, templateFields, valueByFieldId])

  const fallArrestStructuredReview = useMemo(() => {
    if (!isFallArrestInspectionTemplate) {
      return {
        header: { dayOfWeek: '', inspectedBy: '', location: '', inspectionDate: '', infoLines: [] as string[] },
        checklistRows: [] as Array<{ fieldId: string; group: string; item: string; choice: 'standard' | 'substandard' | 'na' | 'yes' | 'no' | null }>,
        comments: '',
        handledFieldIds: new Set<string>(),
      }
    }

    const handledFieldIds = new Set<string>()
    const header = { dayOfWeek: '', inspectedBy: '', location: '', inspectionDate: '', infoLines: [] as string[] }
    const checklistRows: Array<{ fieldId: string; group: string; item: string; choice: 'standard' | 'substandard' | 'na' | 'yes' | 'no' | null }> = []
    let comments = ''
    let activeSection = ''

    for (const field of templateFields) {
      const section = parseSectionMarker(field.label)
      if (section) {
        activeSection = section.title.trim().toLowerCase()
        handledFieldIds.add(field.id)
        continue
      }

      const rawLabel = String(field.label ?? '').trim()
      const value = valueByFieldId[field.id]
      const valueText = value != null ? String(value).trim() : ''
      const lowerLabel = rawLabel.toLowerCase()

      if (activeSection === 'header') {
        handledFieldIds.add(field.id)
        if (lowerLabel === 'day of the week') header.dayOfWeek = valueText
        else if (lowerLabel === 'inspected by') header.inspectedBy = valueText
        else if (lowerLabel === 'location') header.location = valueText
        else if (lowerLabel === 'inspection date') header.inspectionDate = valueText
        else if (rawLabel.startsWith('[INFO]')) header.infoLines.push(rawLabel.replace(/^\[INFO\]/, '').trim())
        continue
      }

      if (activeSection === 'daily checklist' && (field.type || '').toUpperCase() === 'CHECKBOX') {
        handledFieldIds.add(field.id)
        const parts = rawLabel.split(':')
        const group = parts[0]?.trim() || 'Checklist'
        const item = parts.slice(1).join(':').trim() || rawLabel
        checklistRows.push({
          fieldId: field.id,
          group,
          item,
          choice: normalizeChecklistChoice(value),
        })
        continue
      }

      if (activeSection === 'comments / notes') {
        handledFieldIds.add(field.id)
        if (lowerLabel.includes('comments / notes')) comments = valueText
      }
    }

    return { header, checklistRows, comments, handledFieldIds }
  }, [isFallArrestInspectionTemplate, templateFields, valueByFieldId])

  const lotoStructuredReview = useMemo(() => {
    if (!isLotoTemplate) {
      return { rowFields: [] as Array<{ id: string; slotLabel: string }>, collectFieldId: null as string | null, handledFieldIds: new Set<string>() }
    }

    const rowFields: Array<{ id: string; slotLabel: string }> = []
    const handledFieldIds = new Set<string>()
    let collectFieldId: string | null = null
    let insideLotoSection = false

    for (const field of templateFields) {
      const section = parseSectionMarker(field.label)
      if (section) {
        const title = section.title.toLowerCase()
        const isLotoSection = title.includes('equipment/machine') && title.includes('energy type') && title.includes('lock removed')
        insideLotoSection = isLotoSection
        if (isLotoSection) handledFieldIds.add(field.id)
        continue
      }
      if (!insideLotoSection) continue
      if (isLotoRowLabel(field.label)) {
        const rowNum = parseLotoRowNumber(field.label)
        if (rowNum != null && rowNum <= 6) {
          rowFields.push({ id: field.id, slotLabel: String(rowNum) })
        }
        handledFieldIds.add(field.id)
        continue
      }
      if (isCollectSignaturesMarker(field.label)) {
        collectFieldId = null
        handledFieldIds.add(field.id)
      }
    }

    return { rowFields, collectFieldId, handledFieldIds }
  }, [isLotoTemplate, templateFields])

  const enhancedStructuredReview = useMemo(() => {
    type IncidentSection = {
      key: string
      title: string
      markerFieldId?: string
      items: Array<{ id: string; label: string; value: string }>
    }
    const empty = { sections: [] as IncidentSection[], handledFieldIds: new Set<string>() }
    if (!useEnhancedSectionReview) return empty

    const sections: IncidentSection[] = []
    const collectSignatureFieldIds: string[] = []
    let current: IncidentSection = { key: 'general', title: 'General Information', items: [] }

    const flushCurrent = () => {
      if (current.items.length > 0) sections.push(current)
    }

    for (const field of templateFields) {
      const section = parseSectionMarker(field.label)
      if (section) {
        flushCurrent()
        const normalizedTitle = section.title.replace(/\s*:\s*$/, '').trim()
        const displayTitle = isPipelineSafetyFormTemplate
          ? formatPipelineReviewSectionTitle(normalizedTitle)
          : normalizedTitle
        current = {
          key: `${displayTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${sections.length + 1}`,
          title: displayTitle || `Section ${sections.length + 1}`,
          markerFieldId: field.id,
          items: [],
        }
        continue
      }

      if (isCollectSignaturesMarker(field.label)) {
        collectSignatureFieldIds.push(field.id)
        continue
      }

      const rawLabel = String(field.label ?? '')
      const label =
        (
          parseJobDropdownMarker(rawLabel)?.label ??
          parseCustomFieldSpec(rawLabel)?.label ??
          rawLabel.trim()
        ) || 'Field'
      const baseLabel = cleanDisplayLabel(simplifyIncidentDisplayLabel(label))
      const displayLabel = isPipelineSafetyFormTemplate
        ? formatPipelineReviewLabel(baseLabel)
        : baseLabel

      const rawValue = valueByFieldId[field.id]
      const fieldType = (field.type || '').toUpperCase()
      let valueText = '—'
      if (fieldType === 'CHECKBOX') {
        const choice = normalizeChecklistChoice(rawValue)
        if (choice === 'yes' || choice === 'standard') valueText = 'Yes'
        else if (choice === 'no' || choice === 'substandard') valueText = 'No'
        else if (choice === 'na') valueText = 'N/A'
        else if (rawValue === true || rawValue === 'true' || rawValue === '1') valueText = 'Yes'
        else if (rawValue === false || rawValue === 'false' || rawValue === '0') valueText = 'No'
        else valueText = '—'
      } else if (rawValue != null && String(rawValue).trim() !== '') {
        valueText = String(rawValue)
      }

      current.items.push({ id: field.id, label: displayLabel, value: valueText })
    }

    flushCurrent()
    const normalize = (text: string) =>
      String(text ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')

    const valueForLabel = (label: string) => {
      const wanted = normalize(label)
      for (const section of sections) {
        const item = section.items.find((row) => normalize(row.label) === wanted)
        if (item) return normalize(item.value)
      }
      return ''
    }

    const severityChoice = valueForLabel('severity')
    const noInjurySelected = severityChoice === 'no injury'
    const firstAidGivenNo = valueForLabel('was first aid treatment given?') === 'no'
    const takenToHospitalNo = valueForLabel('was the injured person taken to hospital?') === 'no'
    const treatedByPhysicianNo = valueForLabel('was the person treated by a physician?') === 'no'
    const lostTimeChoice = valueForLabel('miss work time due to incident?')
    const noLostTimeSelected =
      lostTimeChoice.includes('returned to regular duties with no lost time') ||
      lostTimeChoice.includes('returned to modified duties with no lost time')

    const filteredSections = sections
      .map((section) => {
        const sectionTitle = normalize(section.title)
        const isBodyPartsSection = sectionTitle.includes('body parts injured')
        const isInjuryCaseSection = sectionTitle.includes('to be completed in case of injury/illness')
        const isFirstAidSection = sectionTitle.includes('details of first aid treatment given')
        const isProfessionalMedicalSection = sectionTitle.includes('professional medical treatment')

        const items = section.items.filter((item) => {
          if (item.value === '—') return false

          const label = normalize(item.label)
          const isFirstAidQuestion = label === 'was first aid treatment given?'
          const isHospitalQuestion = label === 'was the injured person taken to hospital?'
          const isFirstAidDetailField = label.includes('name of first aid attendant')
          const isProfessionalMedicalDetailField =
            label.includes('name of hospital') ||
            label.includes('hospital address') ||
            label.includes('mode of transportation') ||
            label.includes('was the person treated by a physician?') ||
            label.includes('name of physician') ||
            label.includes('treatment or care received')
          const isPhysicianFollowupField =
            label.includes('name of physician') ||
            label.includes('treatment or care received')
          const isLostTimeFollowupField =
            label.includes('how many days of work did you or the injured person miss?') ||
            label.includes('when did you or the injured person first return to work')

          const isInjuryCaseField =
            label.includes('name of the injured person') ||
            label.includes('status of injured person') ||
            label.includes('injured person phone number') ||
            label.includes('injured job title')

          if (isIncidentReportsTemplate && noInjurySelected) {
            if (isBodyPartsSection || isInjuryCaseSection || isFirstAidSection || isProfessionalMedicalSection) return false
            if (isInjuryCaseField || isFirstAidQuestion || isFirstAidDetailField || isHospitalQuestion || isProfessionalMedicalDetailField) return false
          }

          if (isIncidentReportsTemplate && firstAidGivenNo && isFirstAidSection && isFirstAidDetailField) return false
          if (isIncidentReportsTemplate && takenToHospitalNo && isProfessionalMedicalSection && isProfessionalMedicalDetailField && !isHospitalQuestion) return false
          if (isIncidentReportsTemplate && treatedByPhysicianNo && isProfessionalMedicalSection && isPhysicianFollowupField) return false
          if (isIncidentReportsTemplate && noLostTimeSelected && isLostTimeFollowupField) return false

          return true
        })

        if (items.length === 0) return null
        return { ...section, items }
      })
      .filter(Boolean) as IncidentSection[]

    const legacySections: IncidentSection[] = []
    if (filteredSections.length === 0 && unmappedLegacyValues.length > 0) {
      const legacyQueue = unmappedLegacyValues.map((row) => String(row.value ?? '').trim()).filter(Boolean)
      const popBy = (matcher: (value: string) => boolean) => {
        const idx = legacyQueue.findIndex(matcher)
        if (idx >= 0) return legacyQueue.splice(idx, 1)[0]
        return legacyQueue.shift() ?? ''
      }
      let currentLegacySection: IncidentSection = { key: 'legacy-general', title: 'General Information', items: [] }
      const flushLegacySection = () => {
        if (currentLegacySection.items.length > 0) legacySections.push(currentLegacySection)
      }
      for (const field of templateFields) {
        const section = parseSectionMarker(field.label)
        if (section) {
          flushLegacySection()
          const normalizedTitle = section.title.replace(/\s*:\s*$/, '').trim()
          currentLegacySection = {
            key: `legacy-${normalizedTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${legacySections.length + 1}`,
            title: normalizedTitle || `Section ${legacySections.length + 1}`,
            markerFieldId: field.id,
            items: [],
          }
          continue
        }
        if (isCollectSignaturesMarker(field.label)) continue

        const rawLabel = String(field.label ?? '')
        const label =
          (
            parseJobDropdownMarker(rawLabel)?.label ??
            parseCustomFieldSpec(rawLabel)?.label ??
            rawLabel.trim()
          ) || 'Field'
        const displayLabel = cleanDisplayLabel(simplifyIncidentDisplayLabel(label))
        const fieldType = (field.type || '').toUpperCase()

        let valueText = ''
        if (fieldType === 'CHECKBOX') {
          const raw = popBy((value) => normalizeChecklistChoice(value) != null)
          const choice = normalizeChecklistChoice(raw)
          valueText = choice === 'yes' || choice === 'standard' ? 'Yes' : choice === 'no' || choice === 'substandard' ? 'No' : choice === 'na' ? 'N/A' : ''
        } else if (fieldType === 'SIGNATURE') {
          valueText = popBy((value) => value.startsWith('data:image/'))
        } else if (fieldType === 'DATE') {
          valueText = popBy((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
        } else {
          valueText = popBy((value) => value !== '')
        }

        if (valueText) {
          currentLegacySection.items.push({ id: field.id, label: displayLabel, value: valueText })
        }
      }
      flushLegacySection()
    }

    let finalSections = filteredSections.length > 0 ? filteredSections : legacySections

    if (isEquipmentInspectionTemplate && finalSections.length > 0) {
      const headerKeys = new Set(['shop/site', 'location/address', 'unit #', 'operator', 'date', 'hour metre', 'shift'])
      const normItem = (label: string) =>
        String(label ?? '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .replace('hour meter', 'hour metre')
      const isHeaderItem = (item: (typeof finalSections)[0]['items'][0]) => headerKeys.has(normItem(item.label))
      const headerOrder = (label: string) => {
        const n = normItem(label)
        const order = ['shop/site', 'location/address', 'unit #', 'operator', 'date', 'hour metre', 'shift']
        const i = order.indexOf(n)
        return i === -1 ? 999 : i
      }
      const pulled: typeof finalSections[0]['items'] = []
      finalSections = finalSections
        .map((section) => {
          const title = formatEquipmentInspectionReviewSectionTitle(section.title)
          const items = section.items.filter((item) => {
            if (isHeaderItem(item)) {
              pulled.push(item)
              return false
            }
            return true
          })
          return { ...section, title, items }
        })
        .filter((s) => s.items.length > 0)
      pulled.sort((a, b) => headerOrder(a.label) - headerOrder(b.label))
      if (pulled.length > 0) {
        finalSections = [
          {
            key: 'equipment-site-header',
            title: 'Section — Site & operator details',
            items: pulled,
            markerFieldId: undefined,
          },
          ...finalSections,
        ]
      }
    }

    const handledFieldIds = new Set<string>(collectSignatureFieldIds)
    if (finalSections.length > 0) {
      // Enhanced templates should render only the structured cards, not the generic
      // per-field fallback rows below. Mark all template fields as handled.
      for (const field of templateFields) handledFieldIds.add(field.id)
      for (const section of finalSections) {
        if (section.markerFieldId) handledFieldIds.add(section.markerFieldId)
        for (const item of section.items) handledFieldIds.add(item.id)
      }
    }

    return { sections: finalSections, handledFieldIds }
  }, [useEnhancedSectionReview, isEquipmentInspectionTemplate, isIncidentReportsTemplate, isPipelineSafetyFormTemplate, templateFields, valueByFieldId, unmappedLegacyValues])

  const washroomRowsForReview = useMemo(() => {
    if (!isWashroomInspectionTemplate) return []
    const rows: Array<{ item: string; description: string; choiceFieldId?: string; notesFieldId?: string }> = []
    const rowMap = new Map<string, { item: string; description: string; choiceFieldId?: string; notesFieldId?: string }>()
    const upsertRow = (itemName: string, description = '') => {
      const key = itemName.toLowerCase()
      let row = rowMap.get(key)
      if (!row) {
        row = { item: itemName, description }
        rowMap.set(key, row)
        rows.push(row)
      } else if (!row.description && description) {
        row.description = description
      }
      return row
    }

    for (const field of templateFields) {
      const itemMeta = parseWashroomChecklistItemLabel(field.label)
      if (itemMeta) {
        const row = upsertRow(itemMeta.item, itemMeta.description)
        row.choiceFieldId = field.id
        continue
      }
      const notesMeta = parseWashroomChecklistNotesLabel(field.label)
      if (notesMeta) {
        const row = upsertRow(notesMeta.item)
        row.notesFieldId = field.id
      }
    }

    const checklistTopOrder = ['Toilet Paper', 'Lighting', 'Maintenance Log', 'Maintenance Notes']
    return rows.sort((a, b) => {
      const ai = checklistTopOrder.findIndex((name) => name.toLowerCase() === a.item.toLowerCase())
      const bi = checklistTopOrder.findIndex((name) => name.toLowerCase() === b.item.toLowerCase())
      const aRank = ai === -1 ? Number.MAX_SAFE_INTEGER : ai
      const bRank = bi === -1 ? Number.MAX_SAFE_INTEGER : bi
      if (aRank !== bRank) return aRank - bRank
      return a.item.localeCompare(b.item)
    })
  }, [isWashroomInspectionTemplate, templateFields])

  const washroomLegacyFallback = useMemo(() => {
    if (!isWashroomInspectionTemplate || unmappedLegacyValues.length === 0) {
      return {
        choiceByItem: new Map<string, 'yes' | 'no' | 'na'>(),
        notesByItem: new Map<string, string>(),
        dateValue: '',
        timeValue: '',
        facilityValue: '',
        inspectorValue: '',
        signatureValue: '',
      }
    }
    const choices = unmappedLegacyValues
      .map((row) => normalizeWashroomChecklistChoice(row.value))
      .filter(Boolean) as Array<'yes' | 'no' | 'na'>
    const nonChoiceValues = unmappedLegacyValues
      .map((row) => String(row.value ?? '').trim())
      .filter((value) => value && !normalizeWashroomChecklistChoice(value))
    const signatureValue = nonChoiceValues.find((value) => value.startsWith('data:image/')) ?? ''
    const nonSignatureValues = nonChoiceValues.filter((value) => value !== signatureValue)
    const dateValue = nonSignatureValues.find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)) ?? ''
    const remainingAfterDate = nonSignatureValues.filter((value) => value !== dateValue)
    const tail = remainingAfterDate.slice(-3)
    const [timeValue = '', facilityValue = '', inspectorValue = ''] = tail
    const notesPool = remainingAfterDate.slice(0, Math.max(remainingAfterDate.length - tail.length, 0))

    const choiceByItem = new Map<string, 'yes' | 'no' | 'na'>()
    washroomRowsForReview.forEach((row, index) => {
      const choice = choices[index]
      if (choice) choiceByItem.set(row.item, choice)
    })

    const notesByItem = new Map<string, string>()
    washroomRowsForReview.forEach((row) => {
      const note = notesPool.shift()
      if (note) notesByItem.set(row.item, note)
    })

    return { choiceByItem, notesByItem, dateValue, timeValue, facilityValue, inspectorValue, signatureValue }
  }, [isWashroomInspectionTemplate, unmappedLegacyValues, washroomRowsForReview])

  const washroomContactField = useMemo(() => {
    if (!isWashroomInspectionTemplate) return null
    return templateFields.find((field) => {
      const label = String(parseCustomFieldSpec(field.label)?.label ?? field.label ?? '').trim().toLowerCase()
      return label.includes('concerns/observations') && label.includes('escalated')
    }) ?? null
  }, [isWashroomInspectionTemplate, templateFields])

  const washroomSignoffFields = useMemo(() => {
    if (!isWashroomInspectionTemplate) {
      return {
        dateField: null,
        timeField: null,
        facilityField: null,
        inspectorField: null,
        signatureField: null,
      }
    }

    const findField = (name: string) => {
      return templateFields.find((field) => {
        const label = String(parseCustomFieldSpec(field.label)?.label ?? field.label ?? '').trim().toLowerCase()
        return label === name
      }) ?? null
    }

    return {
      dateField: findField('date of inspection'),
      timeField: findField('time'),
      facilityField: findField('facility/location'),
      inspectorField: findField('name of inspector'),
      signatureField: findField('signature'),
    }
  }, [isWashroomInspectionTemplate, templateFields])

  const visibleWeeklyHazardFieldIds = useMemo(() => {
    const visibleIds = new Set<string>()
    if (!isCustomTemplate || !isWeeklyProjectInspectionTemplate) return visibleIds

    const rows = new Map<number, string[]>()
    for (const field of templateFields) {
      const meta = parseWeeklyHazardFieldMeta(field)
      if (!meta) continue
      const list = rows.get(meta.row) ?? []
      list.push(field.id)
      rows.set(meta.row, list)
    }

    for (const rowFieldIds of rows.values()) {
      const hasAnyValue = rowFieldIds.some((fieldId) => {
        const raw = valueByFieldId[fieldId]
        return !isBlankReviewValue(raw)
      })
      if (hasAnyValue) {
        rowFieldIds.forEach((fieldId) => visibleIds.add(fieldId))
      }
    }

    return visibleIds
  }, [isCustomTemplate, isWeeklyProjectInspectionTemplate, templateFields, valueByFieldId])

  const weeklyHeaderDetails = useMemo(() => {
    const empty = {
      rows: [] as Array<{ fieldId: string; label: string; value: string }>,
      handledFieldIds: new Set<string>(),
    }
    if (!isWeeklyProjectInspectionTemplate || !isCustomTemplate) return empty

    const wantedOrder = ['location', 'inspected by', 'reviewed by', 'date time']
    const byKey = new Map<string, { fieldId: string; label: string; value: string }>()
    for (const field of templateFields) {
      const resolvedLabel = String(parseCustomFieldSpec(field.label)?.label ?? field.label ?? '').trim()
      const normalizedLabel = resolvedLabel.toLowerCase().replace(/\s+/g, ' ')
      if (!wantedOrder.includes(normalizedLabel)) continue
      const raw = valueByFieldId[field.id]
      if (isBlankReviewValue(raw)) continue
      byKey.set(normalizedLabel, { fieldId: field.id, label: resolvedLabel, value: String(raw) })
    }

    const rows = wantedOrder
      .map((key) => byKey.get(key))
      .filter(Boolean) as Array<{ fieldId: string; label: string; value: string }>
    const handledFieldIds = new Set(rows.map((row) => row.fieldId))
    return { rows, handledFieldIds }
  }, [isWeeklyProjectInspectionTemplate, isCustomTemplate, templateFields, valueByFieldId])

  const weeklyChecklistReview = useMemo(() => {
    const empty = {
      columns: [] as Array<{
        key: string
        title: string
        items: Array<{ fieldId: string; label: string; choice: 'standard' | 'substandard' | 'na' | 'yes' | 'no' | null }>
      }>,
      handledFieldIds: new Set<string>(),
    }
    if (!isWeeklyProjectInspectionTemplate || !isCustomTemplate) return empty

    const categoryTitles = [
      'General Site Conditions / PPE',
      'Materials / Chemicals / Storage',
      'Equipment / Lifting Devices',
      'Emergency / Response',
      'Site Required Documents',
      'Industrial And Posting',
    ]
    const buckets = categoryTitles.map((title, idx) => ({ key: `weekly-col-${idx}`, title, items: [] as Array<{ fieldId: string; label: string; choice: 'standard' | 'substandard' | 'na' | 'yes' | 'no' | null }> }))
    const unmatched: Array<{ fieldId: string; label: string; choice: 'standard' | 'substandard' | 'na' | 'yes' | 'no' | null }> = []
    const handledFieldIds = new Set<string>()

    const orderedFields = templateFields
      .slice()
      .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))

    for (const field of orderedFields) {
      if (parseSectionMarker(field.label) || isCollectSignaturesMarker(field.label)) {
        handledFieldIds.add(field.id)
        continue
      }
      if ((field.type || '').toUpperCase() !== 'CHECKBOX') continue
      const choice = normalizeChecklistChoice(valueByFieldId[field.id])
      if (!choice) continue
      const resolvedLabel = parseCustomFieldSpec(field.label)?.label ?? field.label ?? 'Checklist item'
      const item = { fieldId: field.id, label: resolvedLabel, choice }
      const categoryIdx = getWeeklyChecklistCategoryIndex(resolvedLabel)
      if (categoryIdx == null) unmatched.push(item)
      else buckets[categoryIdx].items.push(item)
      handledFieldIds.add(field.id)
    }

    for (let i = 0; i < unmatched.length; i += 1) {
      buckets[i % buckets.length].items.push(unmatched[i])
    }

    return {
      columns: buckets.filter((bucket) => bucket.items.length > 0),
      handledFieldIds,
    }
  }, [isWeeklyProjectInspectionTemplate, isCustomTemplate, templateFields, valueByFieldId])

  const handleApprove = async () => {
    if (!id) return
    setApproving(true)
    try {
      if (!submission) return
      // Native custom forms use "Approved by" / "Job Title" fields that should be auto-filled on approve.
      const fields = submission.template?.fields ?? []
      if (fields.length > 0) {
        const approvedByField = fields.find((f) => (f.label ?? '').toLowerCase().includes('approved by'))
        const reviewedByField = fields.find((f) => (f.label ?? '').toLowerCase().includes('reviewed by'))
        const managementInitialsField = fields.find((f) => (f.label ?? '').toLowerCase().includes('management initials'))
        const jobTitleField = fields.find((f) => (f.label ?? '').toLowerCase().includes('job title'))

        const valuesToPatch: Array<{ fieldId: string; value: string }> = []
        const hrName = user?.name ?? 'HR'

        const makeInitials = (displayName: string) => {
          const parts = displayName
            .trim()
            .split(/\s+/)
            .map((p) => p.trim())
            .filter(Boolean)
          if (parts.length === 0) return 'HR'
          if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
          return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
        }

        if (approvedByField?.id) valuesToPatch.push({ fieldId: approvedByField.id, value: hrName })
        if (reviewedByField?.id) valuesToPatch.push({ fieldId: reviewedByField.id, value: hrName })
        if (managementInitialsField?.id) valuesToPatch.push({ fieldId: managementInitialsField.id, value: makeInitials(hrName) })

        if (jobTitleField?.id) {
          const role = user?.role ?? 'hr'
          const mapped =
            role === 'hr' ? 'HR' : role === 'owner' ? 'Owner' : role === 'supervisor' ? 'Supervisor' : role
          valuesToPatch.push({ fieldId: jobTitleField.id, value: String(mapped) })
        }

        if (valuesToPatch.length > 0) {
          await api.patch(`/pdf-submissions/${id}/values`, { values: valuesToPatch }).catch(() => {})
        }
      }

      await approvePdfSubmission(id)
      const { submission: updated } = await fetchPdfSubmission(id)
      if (updated) {
        setSubmission(updated)
        setLoadError(null)
      }
    } finally {
      setApproving(false)
    }
  }
  const handleSign = async (imageData: string, signerName?: string, signerUserId?: string) => {
    if (!id) return
    setSigning(true)
    try {
      await api.post(`/pdf-submissions/${id}/signatures`, {
        signerRole: user?.role ?? 'Labourer',
        imageData,
        fieldId: nextSignatureFieldId,
        ...(signerUserId ? { signerUserId: String(signerUserId) } : {}),
        ...(signerName != null && signerName.trim() && { signerName: signerName.trim() }),
      })
      const { submission: updated } = await fetchPdfSubmission(id)
      if (updated) {
        setSubmission(updated)
        setLoadError(null)
      }
    } finally {
      setSigning(false)
      setShowSignModal(false)
    }
  }
  const handleForwardToHR = async () => {
    if (!id) return
    setForwardingToHr(true)
    try {
      await api.post(`/pdf-submissions/${id}/notify-hr`)
      alert('HR has been notified.')
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Failed to notify HR')
    } finally {
      setForwardingToHr(false)
    }
  }
  const handleRequestResubmission = async () => {
    if (!id) return
    const trimmedReason = resubmitReason.trim()
    if (!trimmedReason) {
      alert('A reason is required before sending the form back.')
      return
    }
    setRequestingResubmission(true)
    try {
      await requestPdfSubmissionResubmission(id, trimmedReason)
      const { submission: updated } = await fetchPdfSubmission(id)
      if (updated) {
        setSubmission(updated)
        setLoadError(null)
      }
      setResubmitModalOpen(false)
      setResubmitReason('')
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e?.message ?? 'Failed to request resubmission')
    } finally {
      setRequestingResubmission(false)
    }
  }

  if (!id) {
    return (
      <NotFound
        title="Invalid link."
        backAction={<Link to={SUBMISSIONS_BACK_TO}>Back to submissions</Link>}
      />
    )
  }

  if (!loadComplete) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-neutral-500 dark:text-neutral-400">
        Loading…
      </div>
    )
  }

  if (!submission) {
    return (
      <NotFound
        title={loadError ?? 'Submission not found.'}
        backAction={<Link to={SUBMISSIONS_BACK_TO}>Back to submissions</Link>}
      />
    )
  }

  const statusVariant =
    submission.status === 'APPROVED'
      ? 'success'
      : submission.status === 'SUBMITTED'
        ? 'info'
        : submission.status === 'AWAITING_SIGNATURES'
          ? 'warning'
          : 'default'
  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'
  const isSupervisorOrOwner = user?.role === 'supervisor' || user?.role === 'owner'
  const canApprove = isOwnerOrHr && (submission.status === 'SUBMITTED' || submission.status === 'AWAITING_SIGNATURES')
  const canRequestResubmission = isOwnerOrHr && (submission.status === 'SUBMITTED' || submission.status === 'AWAITING_SIGNATURES')
  const canSign = !!submission.needsMySignature && submission.status === 'AWAITING_SIGNATURES'
  const canForwardToHr = isSupervisorOrOwner && submission.status === 'SUBMITTED'
  const canDelete = isOwnerOrHr

  const canSignForAnother = user?.role === 'owner' || user?.role === 'hr' || user?.role === 'supervisor'
  const canSignInline = submission.status === 'AWAITING_SIGNATURES' && (submission.needsMySignature || canSignForAnother)

  const supportingPdfValue =
    submission?.extraPdfBlobPath ??
    // Fallback for older naming / alternative payload shapes.
    (submission as any)?.extraPdfUrl ??
    null

  const supportingPdfOriginalName =
    submission?.extraPdfOriginalName ??
    (submission as any)?.extraPdfOriginalName ??
    null

  const handleSupportingPdfQuickView = async () => {
    if (!supportingPdfValue) return

    const blob =
      String(supportingPdfValue).startsWith('http://') || String(supportingPdfValue).startsWith('https://')
        ? await (await fetch(String(supportingPdfValue))).blob()
        : await fetchPdfBlob(String(supportingPdfValue))
    quickViewBlob(blob)
  }

  const handleSupportingPdfDownload = async () => {
    if (!supportingPdfValue) return

    const blob =
      String(supportingPdfValue).startsWith('http://') || String(supportingPdfValue).startsWith('https://')
        ? await (await fetch(String(supportingPdfValue))).blob()
        : await fetchPdfBlob(String(supportingPdfValue))

    const rawName = (supportingPdfOriginalName ?? '').trim()
    const fileName = rawName ? (rawName.toLowerCase().endsWith('.pdf') ? rawName : `${rawName}.pdf`) : 'toolbox-talk-attachment.pdf'
    downloadBlob(blob, fileName)
  }

  const handleDelete = async () => {
    if (!submission) return
    if (!canDelete) return
    const submissionId = submission.id ?? id
    if (!submissionId) return
    const title = submission.template.name ?? 'this submission'
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await deletePdfSubmission(submissionId)
      navigate(SUBMISSIONS_BACK_TO, { replace: true })
    } catch (e: any) {
      const status = e?.response?.status
      const data = e?.response?.data
      const backendMsg =
        e?.response?.data?.error ??
        e?.response?.data?.message ??
        (typeof data === 'string' ? data : null) ??
        null
      const msg = backendMsg ?? e?.message ?? 'Failed to delete submission'
      const idText = submissionId ? ` (id: ${submissionId})` : ''
      const payloadText =
        data && typeof data === 'object' ? ` Payload: ${JSON.stringify(data)}` : data && typeof data === 'string' ? ` Payload: ${data}` : ''
      alert(status ? `Delete failed (${status})${idText}: ${msg}.${payloadText}` : `Delete failed${idText}: ${msg}.${payloadText}`)
    } finally {
      setDeleting(false)
    }
  }

  const handleSaveAsPdf = async () => {
    if (!submission || !printContentRef.current) return
    if (!isCustomTemplate && (loadingPdf || pageImages.length === 0)) {
      window.alert('The form PDF is still loading. Please wait a moment and try again.')
      return
    }
    const root = printContentRef.current
    const title =
      (submission.title && submission.title.trim()) ||
      submission.template?.name ||
      'Form submission'
    if (!isCustomTemplate) {
      await preloadImageDataUrlsAsync(pageImages)
      await printElementViaIframe(root, title, {
        includeAppStyles: false,
        pdfPageSources: pageImages,
      })
      return
    }
    await waitForAllImagesIn(root)
    await printElementViaIframe(root, title, { includeAppStyles: true })
  }

  const pdfPrintReady = isCustomTemplate || (!loadingPdf && pageImages.length > 0)

  const renderPdfPageFieldOverlays = (page: number) =>
    templateFields
      .filter((f) => (f.page ?? 1) === page)
      .map((field) => {
        const x = (field.x ?? 0) * 100
        const y = (field.y ?? 0) * 100
        const w = (field.width ?? 0.1) * 100
        const h = (field.height ?? 0.04) * 100
        const type = (field.type || 'TEXT').toUpperCase()
        const value = valueByFieldId[field.id]

        if (type === 'SIGNATURE') {
          if (submission.finalPdfBlobPath) return null
          const sigIndex = signatureFields.findIndex((sf) => sf.id === field.id)
          const sig = sigIndex >= 0 ? signatures[sigIndex] : undefined
          if (sig?.imageData) {
            const displayName = sig.signerName ?? sig.signer?.displayName
            return (
              <div
                key={field.id}
                className="absolute border border-transparent bg-transparent flex flex-col"
                style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
              >
                <img
                  src={sig.imageData}
                  alt="Signature"
                  className="w-full flex-1 min-h-0 object-contain"
                  loading="eager"
                  decoding="sync"
                />
                {displayName && (
                  <span className="text-xs text-neutral-600 dark:text-neutral-400 truncate mt-0.5">{displayName}</span>
                )}
              </div>
            )
          }
          return null
        }

        if (type === 'CHECKBOX') {
          const checked = value === true || value === 'true' || value === '1' || value === 'yes'
          return (
            <div
              key={field.id}
              className="absolute border border-transparent bg-transparent flex items-center justify-center"
              style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
            >
              {checked ? (
                <svg className="w-full h-full p-0.5 text-green-600" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
              ) : (
                <span className="w-full h-full block" />
              )}
            </div>
          )
        }

        const display = value != null && value !== '' ? String(value) : ''
        return (
          <div
            key={field.id}
            className="absolute border border-transparent bg-transparent text-neutral-900 dark:text-white text-sm p-0.5 overflow-hidden"
            style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
          >
            {display}
          </div>
        )
      })

  return (
    <>
    <div id="form-review-pdf-print-root" ref={printContentRef} className="max-w-4xl mx-auto space-y-4">
      {/* Print header — visible only in print iframe via .print-only */}
      <div
        className="print-only print-flex-row flex-row justify-between items-start gap-3 border-b border-neutral-200 dark:border-neutral-600 pb-3 mb-4"
        aria-hidden
      >
        <div className="min-w-0 flex-1 text-left">
          <h2 className="text-[15px] font-bold text-neutral-900 dark:text-white leading-tight m-0 mb-1">
            {(submission.title && submission.title.trim()) || submission.template.name}
          </h2>
          {submission.submittedBy?.displayName && (
            <p className="text-[9.5px] text-neutral-600 dark:text-neutral-300 m-0 leading-snug">
              Submitted by {submission.submittedBy.displayName}
            </p>
          )}
          {submission.createdAt && (
            <p className="text-[9.5px] text-neutral-600 dark:text-neutral-300 m-0 leading-snug">
              {new Date(submission.createdAt).toLocaleDateString()}
            </p>
          )}
          {submission.job && (
            <p className="text-[9.5px] text-neutral-600 dark:text-neutral-300 m-0 leading-snug">
              Job: {submission.job.title}
              {submission.job.siteName ? ` · ${submission.job.siteName}` : ''}
            </p>
          )}
          <p className="text-[9.5px] text-neutral-600 dark:text-neutral-300 m-0 leading-snug">
            Status:{' '}
            {submission.status === 'SUBMITTED'
              ? 'Pending approval'
              : submission.status === 'RESUBMIT_REQUIRED'
                ? 'Resubmission required'
                : submission.status.replace(/_/g, ' ')}
          </p>
        </div>
        <div
          className="shrink-0 max-w-[40%] [&_svg]:max-w-[168px] [&_svg]:h-auto [&_svg]:block"
          dangerouslySetInnerHTML={{ __html: maximExportLogoSvgRaw }}
        />
      </div>
      {/* Chrome: no-print */}
      <div className="no-print flex flex-wrap items-center gap-4">
        <Link
          to={SUBMISSIONS_BACK_TO}
          className="touch-target p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
          aria-label="Back to submissions"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-bold text-xl text-neutral-900 dark:text-white truncate">
            {(submission.title && submission.title.trim()) || submission.template.name}
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {submission.submittedBy?.displayName && `Submitted by ${submission.submittedBy.displayName}`}
            {submission.createdAt && ` · ${new Date(submission.createdAt).toLocaleDateString()}`}
          </p>
          {submission.job && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">
              Job:{' '}
              <Link to={`/jobs/${submission.job.id}`} className="text-brand-600 dark:text-brand-400 hover:underline font-medium">
                {submission.job.title}
              </Link>
              {submission.job.siteName ? ` · ${submission.job.siteName}` : ''}
            </p>
          )}
        </div>
        <Badge variant={submission.status === 'RESUBMIT_REQUIRED' ? 'danger' : statusVariant}>
          {submission.status === 'SUBMITTED' ? 'Pending approval' : submission.status === 'RESUBMIT_REQUIRED' ? 'Resubmission required' : submission.status}
        </Badge>
        <Button variant="outline" size="sm" onClick={handleSaveAsPdf} disabled={!pdfPrintReady}>
          {loadingPdf && !isCustomTemplate ? 'Loading PDF…' : 'Save as PDF'}
        </Button>
        {canSign && (
          <Button
            size="sm"
            onClick={() => {
              if (isCustomTemplate && user?.id) setSigningWorkerId(user.id)
              setShowSignModal(true)
            }}
            disabled={signing}
          >
            {signing ? 'Saving signature…' : 'Sign now'}
          </Button>
        )}
        {canApprove && (
          <Button size="sm" onClick={handleApprove} disabled={approving}>
            {approving ? 'Saving…' : 'Approve'}
          </Button>
        )}
        {canRequestResubmission && (
          <Button variant="danger" size="sm" onClick={() => setResubmitModalOpen(true)} disabled={requestingResubmission}>
            {requestingResubmission ? 'Sending…' : 'Resubmit'}
          </Button>
        )}
        {canForwardToHr && (
          <Button size="sm" onClick={handleForwardToHR} disabled={forwardingToHr}>
            {forwardingToHr ? 'Sending…' : 'Forward to HR'}
          </Button>
        )}
        {canDelete && (
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        )}
      </div>
      {submission.status === 'AWAITING_SIGNATURES' && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {submission.pendingSignatureCount && submission.pendingSignatureCount > 0
              ? `${submission.pendingSignatureCount} required signature(s) remaining before HR review.`
              : 'Awaiting required signatures before HR review.'}
          </p>
          {pendingSignersForDisplay.length > 0 ? (
            <Card padding="md" className="border-amber-200 dark:border-amber-800/80 bg-amber-50/40 dark:bg-amber-950/25">
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">Outstanding signatures</p>
              <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                These accounts still need to complete their sign-off before this goes to HR.
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-neutral-900 dark:text-neutral-100">
                {pendingSignersForDisplay.map((row) => (
                  <li key={row.labourerUserId} className="flex items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                    <span>{row.displayName}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            signerRows.length === 0 &&
            (submission.pendingSignatureCount ?? 0) > 0 && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Signer names are not available for this submission; try refreshing the page or contact support if this persists.
              </p>
            )
          )}
        </div>
      )}
      {submission.status === 'RESUBMIT_REQUIRED' && (
        <Card padding="md" className="border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20">
          <p className="font-medium text-red-800 dark:text-red-200">Resubmission required</p>
          {submission.resubmissionReason && (
            <p className="mt-1 text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">{submission.resubmissionReason}</p>
          )}
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {submission.resubmissionRequestedBy?.displayName ? `Requested by ${submission.resubmissionRequestedBy.displayName}` : 'Requested by HR'}
            {submission.resubmissionRequestedAt ? ` on ${new Date(submission.resubmissionRequestedAt).toLocaleString()}` : ''}
          </p>
        </Card>
      )}

      {/* Page navigation — no-print */}
      {!isCustomTemplate && pageCount > 1 && (
        <div className="no-print flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            Page {currentPage} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= pageCount}
            onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
          >
            Next
          </Button>
        </div>
      )}

      {isCustomTemplate ? (
        <div className="space-y-4">
          {templateFields.length === 0 ? (
            <Card padding="md" className="space-y-2">
              <h2 className="font-semibold text-neutral-900 dark:text-white">Submitted Values</h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No fields on this template.</p>
            </Card>
          ) : (
            <>
              <div className="border-b border-neutral-200 dark:border-neutral-700 pb-3 mb-1">
                <h2 className="font-display font-semibold text-lg tracking-tight text-neutral-900 dark:text-white">
                  Submitted Values
                </h2>
              </div>
              <div className="space-y-4">
                {isDailyHazardTemplate && (
                  <div className="space-y-4">
                    <Card padding="md" className="space-y-3">
                      <h3 className="font-semibold text-neutral-900 dark:text-white">Section 1 — General Information</h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {[
                          ['Date', dhaStructuredReview.fields.date],
                          ['Project', dhaStructuredReview.fields.project],
                          ['Muster Point', dhaStructuredReview.fields.musterPoint],
                          ['Supervisor', dhaStructuredReview.fields.supervisor],
                          ['Job Number', dhaStructuredReview.fields.jobNumber],
                          ['Weather (°C)', dhaStructuredReview.fields.weather],
                          ['Nearest Hospital', dhaStructuredReview.fields.nearestHospital],
                          ['Emergency Response Coordinator', dhaStructuredReview.fields.emergencyCoordinator],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</p>
                            <p className="mt-1 text-sm text-neutral-900 dark:text-neutral-100">{String(value || '—')}</p>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Weather Conditions</p>
                        <p className="mt-1 text-sm text-neutral-900 dark:text-neutral-100">
                          {dhaStructuredReview.checkedWeather.length > 0 ? dhaStructuredReview.checkedWeather.join(', ') : '—'}
                        </p>
                      </div>
                    </Card>

                    <Card padding="md" className="space-y-3">
                      <h3 className="font-semibold text-neutral-900 dark:text-white">Section 3 — Specific Hazards and Site Considerations</h3>
                      <p className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100">
                        {dhaStructuredReview.selectedHazards.length > 0 ? dhaStructuredReview.selectedHazards.join(', ') : '—'}
                      </p>
                    </Card>

                    <Card padding="md" className="space-y-3">
                      <h3 className="font-semibold text-neutral-900 dark:text-white">Section 4 — Standard Site Controls</h3>
                      <p className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100">
                        {dhaStructuredReview.selectedControls.length > 0 ? dhaStructuredReview.selectedControls.join(', ') : '—'}
                      </p>
                    </Card>

                    <Card padding="md" className="space-y-3">
                      <h3 className="font-semibold text-neutral-900 dark:text-white">Section 5 — External Hazards</h3>
                      <p className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100">
                        {dhaStructuredReview.selectedExternalHazards.length > 0 ? dhaStructuredReview.selectedExternalHazards.join(', ') : '—'}
                      </p>
                    </Card>

                    <Card padding="md" className="space-y-3">
                      <h3 className="font-semibold text-neutral-900 dark:text-white">Section 6 — Personal Protective Equipment Required</h3>
                      <p className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100">
                        {dhaStructuredReview.selectedPpe.length > 0 ? dhaStructuredReview.selectedPpe.join(', ') : '—'}
                      </p>
                    </Card>

                    <Card padding="md" className="space-y-3">
                      <h3 className="font-semibold text-neutral-900 dark:text-white">Section 7 — Tool Condition</h3>
                      <div className="space-y-2">
                        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Tools/Equipment Replaced or Repaired</p>
                          <p className="mt-1 text-sm text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">{dhaStructuredReview.fields.toolsCondition || '—'}</p>
                        </div>
                        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Additional Comments</p>
                          <p className="mt-1 text-sm text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">{dhaStructuredReview.fields.additionalComments || '—'}</p>
                        </div>
                      </div>
                    </Card>

                    <Card padding="md" className="space-y-3">
                      <h3 className="font-semibold text-neutral-900 dark:text-white">Section 8 — Job Hazard Assessment</h3>
                      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                        <table className="w-full min-w-[900px] border-collapse text-sm">
                          <thead className="bg-neutral-100 dark:bg-neutral-800">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Job</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Hazards</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Control Measures</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Risk Rating Before Controls</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Risk Rating After Controls</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dhaStructuredReview.selectedActivities.map((activity) => {
                              const task = getDhaTaskLibraryEntry(activity)
                              const hazards = task?.hazards ?? []
                              const controls = task?.controls ?? []
                              const before = String(task?.riskBeforeControls ?? '').trim()
                              const after = String(task?.riskAfterControls ?? '').trim()
                              const beforeScore = dhaRiskScore(before)
                              const afterScore = dhaRiskScore(after)
                              return (
                                <tr key={`review-dha-jha-${activity}`}>
                                  <td className="px-3 py-2 align-top border border-neutral-200 dark:border-neutral-700">{activity}</td>
                                  <td className="px-3 py-2 align-top border border-neutral-200 dark:border-neutral-700">
                                    {hazards.length > 0 ? hazards.map((h) => <p key={h}>• {h}</p>) : '—'}
                                  </td>
                                  <td className="px-3 py-2 align-top border border-neutral-200 dark:border-neutral-700">
                                    {controls.length > 0 ? controls.map((c) => <p key={c}>• {c}</p>) : '—'}
                                  </td>
                                  <td className="px-3 py-2 align-top border border-neutral-200 dark:border-neutral-700">
                                    {before ? (
                                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${dhaRiskPillClass(before)}`}>
                                        {beforeScore ? `${before} (${beforeScore})` : before}
                                      </span>
                                    ) : '—'}
                                  </td>
                                  <td className="px-3 py-2 align-top border border-neutral-200 dark:border-neutral-700">
                                    {after ? (
                                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${dhaRiskPillClass(after)}`}>
                                        {afterScore ? `${after} (${afterScore})` : after}
                                      </span>
                                    ) : '—'}
                                  </td>
                                </tr>
                              )
                            })}
                            {dhaStructuredReview.selectedActivities.length === 0 && (
                              <tr>
                                <td className="px-3 py-3 text-sm text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700" colSpan={5}>
                                  No Section 2 activities were checked on this submission.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Card>

                    <Card padding="md" className="space-y-3">
                      <h3 className="font-semibold text-neutral-900 dark:text-white">Section 9 — Workplace Violence Assessment</h3>
                      <ul className="space-y-2">
                        {dhaStructuredReview.violenceAnswers.map((row) => (
                          <li key={row.question} className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm flex items-center justify-between gap-3">
                            <span className="text-neutral-900 dark:text-neutral-100">{row.question}</span>
                            <span className="font-medium text-neutral-700 dark:text-neutral-200">{row.answer}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-sm text-neutral-600 dark:text-neutral-300">
                        Corrective actions captured:
                      </p>
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">
                        {dhaStructuredReview.fields.correctiveActions || '—'}
                      </div>
                    </Card>

                    <Card padding="md" className="space-y-3 border-brand-500/50 bg-brand-50/20 dark:bg-brand-900/10">
                      <h3 className="font-semibold text-neutral-900 dark:text-white">Section 10 — Worker Acknowledgement</h3>
                      {submission.status === 'AWAITING_SIGNATURES' && pendingSignersForDisplay.length > 0 && (
                        <div
                          className="rounded-lg border border-amber-200 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/30 px-3 py-2.5"
                          role="status"
                          aria-live="polite"
                        >
                          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                            Still waiting on a signature from
                          </p>
                          <ul className="mt-2 space-y-1 text-sm font-medium text-amber-950 dark:text-amber-50">
                            {pendingSignersForDisplay.map((row) => (
                              <li key={`dha-pending-${row.labourerUserId}`}>{row.displayName}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {dhaStructuredReview.signatures.length === 0 ? (
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">No signatures collected yet.</p>
                      ) : (
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {dhaStructuredReview.signatures.map((row) => (
                            <li
                              key={`dha-review-signature-${row.key}`}
                              className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-800 flex items-start gap-4"
                            >
                              <img
                                src={row.imageData}
                                alt={`Signature of ${row.name}`}
                                className="h-16 max-w-[140px] object-contain border rounded bg-white shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="font-medium text-sm text-neutral-900 dark:text-white">{row.name}</p>
                                {row.signedAt && (
                                  <p className="text-xs text-neutral-500 mt-1">
                                    Signed {new Date(row.signedAt).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  </div>
                )}
                {isWashroomInspectionTemplate && (
                  <div className="space-y-4">
                    {(() => {
                      const { dateField, timeField, facilityField, inspectorField, signatureField } = washroomSignoffFields
                      const signatureValue =
                        (signatureField?.id ? String(valueByFieldId[signatureField.id] ?? '').trim() : '') ||
                        washroomLegacyFallback.signatureValue
                      const signatureMeta = signatureField?.id
                        ? signatures.find((sig) => sig.fieldId === signatureField.id && sig.imageData)
                        : undefined
                      return (
                        <>
                          {washroomRowsForReview.length > 0 && (
                            <Card padding="md" className="space-y-3">
                              <h3 className="font-semibold text-neutral-900 dark:text-white">Section — Washroom Inspection Checklist</h3>
                              <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                                <table className="w-full min-w-[980px] border-collapse text-sm">
                                  <thead className="bg-neutral-100 dark:bg-neutral-800">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700 w-[18%]">Item</th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Description</th>
                                      <th className="px-3 py-2 text-center text-xs font-semibold border border-neutral-200 dark:border-neutral-700 w-[6%]">Yes</th>
                                      <th className="px-3 py-2 text-center text-xs font-semibold border border-neutral-200 dark:border-neutral-700 w-[6%]">No</th>
                                      <th className="px-3 py-2 text-center text-xs font-semibold border border-neutral-200 dark:border-neutral-700 w-[6%]">N/A</th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700 w-[28%]">Notes/Observations</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {washroomRowsForReview.map((row) => {
                                      const choice =
                                        (row.choiceFieldId ? normalizeWashroomChecklistChoice(valueByFieldId[row.choiceFieldId]) : null) ??
                                        washroomLegacyFallback.choiceByItem.get(row.item) ??
                                        null
                                      const notes =
                                        (row.notesFieldId ? String(valueByFieldId[row.notesFieldId] ?? '').trim() : '') ||
                                        washroomLegacyFallback.notesByItem.get(row.item) ||
                                        ''
                                      return (
                                        <tr key={row.item}>
                                          <td className="px-3 py-2 align-top border border-neutral-200 dark:border-neutral-700">{row.item}</td>
                                          <td className="px-3 py-2 align-top border border-neutral-200 dark:border-neutral-700">{row.description || '—'}</td>
                                          {(['yes', 'no', 'na'] as const).map((opt) => (
                                            <td key={opt} className="px-2 py-2 text-center align-top border border-neutral-200 dark:border-neutral-700">
                                              <input
                                                type="checkbox"
                                                checked={choice === opt}
                                                readOnly
                                                className="w-4 h-4 rounded border-neutral-300 text-brand-600 pointer-events-none"
                                                aria-label={`${row.item} ${opt}`}
                                              />
                                            </td>
                                          ))}
                                          <td className="px-3 py-2 align-top border border-neutral-200 dark:border-neutral-700">{notes || '—'}</td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </Card>
                          )}

                          <Card padding="md" className="space-y-3">
                            <h3 className="font-semibold text-neutral-900 dark:text-white">Section — Contact / Follow-up</h3>
                            <div>
                              <p className="text-sm text-neutral-700 dark:text-neutral-200 mb-2">
                                After completing your inspection, are there any concerns/observations that need to be escalated:
                              </p>
                              <div className="min-h-[120px] whitespace-pre-wrap rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white">
                                {washroomContactField?.id && String(valueByFieldId[washroomContactField.id] ?? '').trim()
                                  ? String(valueByFieldId[washroomContactField.id])
                                  : '—'}
                              </div>
                            </div>
                          </Card>

                          <Card padding="md" className="space-y-3">
                            <h3 className="font-semibold text-neutral-900 dark:text-white">Section — Inspection Sign-off</h3>
                            <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                              <table className="w-full min-w-[780px] border-collapse text-sm">
                                <tbody>
                                  <tr>
                                    <td className="px-3 py-2 font-medium border border-neutral-200 dark:border-neutral-700">Date of Inspection:</td>
                                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                                      {(dateField?.id ? String(valueByFieldId[dateField.id] ?? '').trim() : '') || washroomLegacyFallback.dateValue || '—'}
                                    </td>
                                    <td className="px-3 py-2 font-medium border border-neutral-200 dark:border-neutral-700">Time:</td>
                                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                                      {(timeField?.id ? String(valueByFieldId[timeField.id] ?? '').trim() : '') || washroomLegacyFallback.timeValue || '—'}
                                    </td>
                                    <td className="px-3 py-2 font-medium border border-neutral-200 dark:border-neutral-700">Facility/Location:</td>
                                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                                      {(facilityField?.id ? String(valueByFieldId[facilityField.id] ?? '').trim() : '') || washroomLegacyFallback.facilityValue || '—'}
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="px-3 py-2 font-medium border border-neutral-200 dark:border-neutral-700">Name of Inspector:</td>
                                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700" colSpan={3}>
                                      {(inspectorField?.id ? String(valueByFieldId[inspectorField.id] ?? '').trim() : '') || washroomLegacyFallback.inspectorValue || '—'}
                                    </td>
                                    <td className="px-3 py-2 font-medium border border-neutral-200 dark:border-neutral-700">Signature:</td>
                                    <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">
                                      {signatureValue ? (
                                        <div className="space-y-1">
                                          <div className="min-h-[44px] rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2">
                                            <img src={signatureValue} alt="Signature" className="max-h-12 object-contain" />
                                          </div>
                                          {signatureMeta?.signerName && (
                                            <p className="text-xs text-neutral-500 dark:text-neutral-400">{signatureMeta.signerName}</p>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-neutral-400">—</span>
                                      )}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </Card>
                        </>
                      )
                    })()}
                  </div>
                )}
                {isFallArrestInspectionTemplate && (
                  <div className="space-y-4">
                    <Card padding="md" className="space-y-3">
                      <h3 className="font-semibold text-neutral-900 dark:text-white">Section — Header</h3>
                      <div className="grid gap-3 sm:grid-cols-4">
                        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Day of week</p>
                          <p className="mt-1 text-sm text-neutral-900 dark:text-neutral-100">{fallArrestStructuredReview.header.dayOfWeek || '—'}</p>
                        </div>
                        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Inspected by</p>
                          <p className="mt-1 text-sm text-neutral-900 dark:text-neutral-100">{fallArrestStructuredReview.header.inspectedBy || '—'}</p>
                        </div>
                        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Inspection date</p>
                          <p className="mt-1 text-sm text-neutral-900 dark:text-neutral-100">{fallArrestStructuredReview.header.inspectionDate || '—'}</p>
                        </div>
                        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Location</p>
                          <p className="mt-1 text-sm text-neutral-900 dark:text-neutral-100">{fallArrestStructuredReview.header.location || '—'}</p>
                        </div>
                      </div>
                      {fallArrestStructuredReview.header.infoLines.length > 0 && (
                        <ul className="space-y-1">
                          {fallArrestStructuredReview.header.infoLines.map((line, idx) => (
                            <li key={`${line}-${idx}`} className="text-xs text-neutral-600 dark:text-neutral-300">
                              {line}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>

                    {fallArrestStructuredReview.checklistRows.length > 0 && (
                      <Card padding="md" className="space-y-3">
                        <h3 className="font-semibold text-neutral-900 dark:text-white">Section — Daily checklist</h3>
                        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                          <table className="w-full min-w-[860px] border-collapse text-sm">
                            <thead className="bg-neutral-100 dark:bg-neutral-800">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700 w-[20%]">Group</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Item</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700 w-[26%]">Result</th>
                              </tr>
                            </thead>
                            <tbody>
                              {fallArrestStructuredReview.checklistRows.map((row) => {
                                const choice = row.choice
                                const result =
                                  choice === 'standard' || choice === 'yes'
                                    ? { text: 'Up to standard', tone: 'text-emerald-700 dark:text-emerald-300', icon: '✓' }
                                    : choice === 'substandard' || choice === 'no'
                                      ? { text: 'Substandard', tone: 'text-red-700 dark:text-red-300', icon: '✕' }
                                      : choice === 'na'
                                        ? { text: 'N/A', tone: 'text-amber-700 dark:text-amber-300', icon: '•' }
                                        : { text: 'Not marked', tone: 'text-neutral-500 dark:text-neutral-400', icon: '—' }
                                return (
                                  <tr key={row.fieldId}>
                                    <td className="px-3 py-2 align-top border border-neutral-200 dark:border-neutral-700">{row.group}</td>
                                    <td className="px-3 py-2 align-top border border-neutral-200 dark:border-neutral-700">{row.item}</td>
                                    <td className="px-3 py-2 align-top border border-neutral-200 dark:border-neutral-700">
                                      <span className={`inline-flex items-center gap-1 font-medium ${result.tone}`}>
                                        <span aria-hidden>{result.icon}</span>
                                        <span>{result.text}</span>
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    )}

                    <Card padding="md" className="space-y-2">
                      <h3 className="font-semibold text-neutral-900 dark:text-white">Section — Comments / notes</h3>
                      <p className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm whitespace-pre-wrap text-neutral-900 dark:text-neutral-100">
                        {fallArrestStructuredReview.comments || '—'}
                      </p>
                    </Card>
                  </div>
                )}
                {isLotoTemplate && lotoStructuredReview.rowFields.length > 0 && (
                  <Card padding="md" className="space-y-3">
                    <h3 className="font-semibold text-neutral-900 dark:text-white">Section — Equipment/Machine | Location | Energy Type(s) | Lock Removed (Initial)</h3>
                    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                      <table className="w-full min-w-[780px] border-collapse text-sm">
                        <thead className="bg-neutral-100 dark:bg-neutral-800">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700 w-[8%]">#</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Equipment / machine</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Location</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Energy Type(s)</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Lock Removed (Initial)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lotoStructuredReview.rowFields.map((field) => {
                            const row = parseLotoRowValue(valueByFieldId[field.id])
                            return (
                              <tr key={field.id}>
                                <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">{field.slotLabel}</td>
                                <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">{row.equipment || '—'}</td>
                                <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">{row.location || '—'}</td>
                                <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">{row.energyType || '—'}</td>
                                <td className="px-3 py-2 border border-neutral-200 dark:border-neutral-700">{row.lockRemoved || '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {lotoStructuredReview.collectFieldId && (
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
                        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">Collected signatures</p>
                        {String(valueByFieldId[lotoStructuredReview.collectFieldId] ?? '').trim() ? (
                          <div className="flex flex-wrap gap-2">
                            {String(valueByFieldId[lotoStructuredReview.collectFieldId])
                              .split('|')
                              .map((token) => token.trim())
                              .filter(Boolean)
                              .map((token, idx) => (
                                <span key={`${token}-${idx}`} className="inline-flex items-center rounded-md border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-xs">
                                  {token}
                                </span>
                              ))}
                          </div>
                        ) : (
                          <p className="text-sm text-neutral-500 dark:text-neutral-400">—</p>
                        )}
                      </div>
                    )}
                  </Card>
                )}
                {isWeeklyProjectInspectionTemplate && weeklyHeaderDetails.rows.length > 0 && (
                  <Card padding="md" className="space-y-3">
                    <h3 className="font-semibold text-neutral-900 dark:text-white">Section — Inspection Details</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {weeklyHeaderDetails.rows.map((row) => (
                        <div key={row.fieldId} className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                            {row.label}
                          </p>
                          <p className="mt-1 text-sm text-neutral-900 dark:text-neutral-100">{row.value}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
                {isWeeklyProjectInspectionTemplate && weeklyChecklistReview.columns.length > 0 && (
                  <Card padding="md" className="space-y-4">
                    <h3 className="font-semibold text-neutral-900 dark:text-white">Section — Inspection Checklist</h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Organized by Weekly Project Inspection table categories.
                    </p>
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {weeklyChecklistReview.columns.map((column) => (
                        <div key={column.key} className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 space-y-2">
                          <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{column.title}</h4>
                          <ul className="space-y-2">
                            {column.items.map((item) => {
                              const choice = item.choice
                              const status =
                                choice === 'standard' || choice === 'yes'
                                  ? { icon: '✓', text: 'Up to Standard', tone: 'text-emerald-700 dark:text-emerald-300' }
                                  : choice === 'substandard' || choice === 'no'
                                    ? { icon: '✕', text: 'Substandard', tone: 'text-red-700 dark:text-red-300' }
                                    : { icon: '•', text: 'N/A (Missing)', tone: 'text-amber-700 dark:text-amber-300' }
                              return (
                                <li key={item.fieldId} className="rounded-md border border-neutral-200 dark:border-neutral-700 px-2 py-1.5 text-sm">
                                  <span className="text-neutral-900 dark:text-neutral-100">{item.label}: </span>
                                  <span className={`font-medium ${status.tone}`}>
                                    {status.icon} {status.text}
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
                {isCriticalTaskRiskRegisterTemplate && criticalTaskStructuredReview.sections.length > 0 && (
                  <div className="space-y-4">
                    {criticalTaskStructuredReview.sections.map((section) => (
                      <Card key={section.key} padding="md" className="space-y-3">
                        <h3 className="font-semibold text-neutral-900 dark:text-white">{section.title}</h3>
                        <ul className="space-y-2">
                          {section.items.map((item) => {
                            const isSignatureImage = String(item.value).trim().startsWith('data:image/')
                            return (
                              <li key={item.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm">
                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                                  {item.label}
                                </p>
                                {isSignatureImage ? (
                                  <span className="mt-1 inline-flex flex-col gap-1">
                                    <img src={item.value} alt={`${item.label} signature`} className="max-h-14 rounded border border-neutral-300 dark:border-neutral-600 bg-white" />
                                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Signature captured</span>
                                  </span>
                                ) : (
                                  <p className="mt-1 whitespace-pre-wrap break-words text-neutral-900 dark:text-neutral-100">
                                    {item.value}
                                  </p>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      </Card>
                    ))}
                  </div>
                )}
                {isConfinedSpaceEntryPermitTemplate && confinedSpaceStructuredReview.sections.length > 0 && (
                  <div className="space-y-4">
                    {confinedSpaceStructuredReview.sections.map((section) => (
                      <Card key={section.key} padding="md" className="space-y-3">
                        <h3 className="font-semibold text-neutral-900 dark:text-white">{section.title}</h3>
                        {section.infoLines.length > 0 && (
                          <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/40 px-3 py-2 space-y-1">
                            {section.infoLines.map((line, idx) => (
                              <p key={`${section.key}-info-${idx}`} className="text-xs text-neutral-600 dark:text-neutral-300">
                                {line}
                              </p>
                            ))}
                          </div>
                        )}
                        {section.items.length > 0 && (
                          <ul className="space-y-2">
                            {section.items.map((item) => (
                              (() => {
                                const isContinuousMonitoringSection = section.key.includes('continuous-monitoring-documentation')
                                const limitStatus = isContinuousMonitoringSection
                                  ? getContinuousMonitoringLimitStatus(item.label, item.value)
                                  : null
                                const statusTone =
                                  limitStatus?.tone === 'ok'
                                    ? 'text-emerald-700 dark:text-emerald-300'
                                    : limitStatus?.tone === 'alert'
                                      ? 'text-red-700 dark:text-red-300'
                                      : 'text-amber-700 dark:text-amber-300'

                                return (
                                  <li key={item.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                                      {item.label}
                                    </p>
                                    {item.isSignature ? (
                                      <span className="mt-1 inline-flex flex-col gap-1">
                                        <img src={item.value} alt={`${item.label} signature`} className="max-h-14 rounded border border-neutral-300 dark:border-neutral-600 bg-white" />
                                        <span className="text-xs text-neutral-500 dark:text-neutral-400">Signature captured</span>
                                      </span>
                                    ) : item.choice === 'yes' ? (
                                      <span className="mt-1 inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
                                        <span aria-hidden>✓</span>
                                        <span>Yes</span>
                                      </span>
                                    ) : item.choice === 'no' ? (
                                      <span className="mt-1 inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-300">
                                        <span aria-hidden>✕</span>
                                        <span>No</span>
                                      </span>
                                    ) : item.choice === 'na' ? (
                                      <span className="mt-1 inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
                                        <span aria-hidden>•</span>
                                        <span>N/A</span>
                                      </span>
                                    ) : (
                                      <div className="mt-1 space-y-1">
                                        <p className="whitespace-pre-wrap break-words text-neutral-900 dark:text-neutral-100">
                                          {item.value}
                                        </p>
                                        {limitStatus && (
                                          <p className={`text-xs font-medium ${statusTone}`}>
                                            {limitStatus.emoji} {limitStatus.message}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </li>
                                )
                              })()
                            ))}
                          </ul>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
                {useEnhancedSectionReview && enhancedStructuredReview.sections.length > 0 && (
                  <div className="space-y-4">
                    {enhancedStructuredReview.sections.map((section) => (
                      <Card key={section.key} padding="md" className="space-y-3">
                        <h3 className="font-semibold text-neutral-900 dark:text-white">{section.title}</h3>
                        <ul className="space-y-2">
                          {section.items
                            .filter((item) => {
                              // Avoid rendering signature images twice: they are already shown
                              // in the unified "Signatures & who signed" card below.
                              if (!showCustomSignaturesSection) return true
                              return !String(item.value).trim().startsWith('data:image/')
                            })
                            .map((item) => {
                            const normalized = String(item.value).trim().toLowerCase()
                            const isYes = normalized === 'yes'
                            const isNo = normalized === 'no'
                            const isNa = normalized === 'n/a' || normalized === 'na'
                            const isLongValue = String(item.value).trim().length > 120
                            return (
                              <li key={item.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm">
                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                                  {item.label}
                                </p>
                                {String(item.value).trim().startsWith('data:image/') ? (
                                  <span className="mt-1 inline-flex flex-col gap-1">
                                    <img src={item.value} alt={`${item.label} signature`} className="max-h-14 rounded border border-neutral-300 dark:border-neutral-600 bg-white" />
                                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Signature captured</span>
                                  </span>
                                ) : isYes ? (
                                  <span className="mt-1 inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
                                    <span aria-hidden>✓</span>
                                    <span>Yes</span>
                                  </span>
                                ) : isNo ? (
                                  <span className="mt-1 inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-300">
                                    <span aria-hidden>✕</span>
                                    <span>No</span>
                                  </span>
                                ) : isNa ? (
                                  <span className="mt-1 inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
                                    <span aria-hidden>•</span>
                                    <span>N/A</span>
                                  </span>
                                ) : (
                                  <span
                                    className={`mt-1 block whitespace-pre-wrap break-words text-neutral-900 dark:text-neutral-100 ${
                                      isLongValue ? 'rounded-md bg-neutral-50 dark:bg-neutral-800/50 px-2 py-1' : ''
                                    }`}
                                  >
                                    {item.value}
                                  </span>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      </Card>
                    ))}
                  </div>
                )}
                {useEnhancedSectionReview && enhancedStructuredReview.sections.length === 0 && (
                  <Card padding="md">
                    {unmappedLegacyValues.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm text-neutral-600 dark:text-neutral-300">
                          Legacy captured values (template fields were updated after submission):
                        </p>
                        <ul className="space-y-1">
                          {unmappedLegacyValues.map((row, idx) => (
                            <li key={`${row.fieldId}-${idx}`} className="rounded border border-neutral-200 dark:border-neutral-700 px-2 py-1 text-sm">
                              <span className="font-medium text-neutral-600 dark:text-neutral-300">Value {idx + 1}: </span>
                              <span className="text-neutral-900 dark:text-neutral-100">{String(row.value)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        No captured values are available to display for this submission.
                      </p>
                    )}
                  </Card>
                )}
                {templateFields.map((field) => {
                  if (isDailyHazardTemplate) return null
                  const fieldType = (field.type || '').toUpperCase()
                  const isSignatureField = fieldType === 'SIGNATURE'
                  const isAttendeeNameField = fieldType === 'TEXT' && /^Attendee \d+ Name$/i.test(String(field.label ?? '').trim())
                  if (isSignatureField || isAttendeeNameField) return null
                  if (
                    isWashroomInspectionTemplate &&
                    (
                      isWashroomChecklistMetaLabel(field.label) ||
                      parseSectionMarker(field.label) ||
                      field.id === washroomContactField?.id ||
                      field.id === washroomSignoffFields.dateField?.id ||
                      field.id === washroomSignoffFields.timeField?.id ||
                      field.id === washroomSignoffFields.facilityField?.id ||
                      field.id === washroomSignoffFields.inspectorField?.id ||
                      field.id === washroomSignoffFields.signatureField?.id
                    )
                  ) return null
                  if (isFallArrestInspectionTemplate && fallArrestStructuredReview.handledFieldIds.has(field.id)) return null
                  if (isLotoTemplate && lotoStructuredReview.handledFieldIds.has(field.id)) return null
                  if (isWeeklyProjectInspectionTemplate && weeklyHeaderDetails.handledFieldIds.has(field.id)) return null
                  if (isWeeklyProjectInspectionTemplate && weeklyChecklistReview.handledFieldIds.has(field.id)) return null
                  if (isCriticalTaskRiskRegisterTemplate && criticalTaskStructuredReview.handledFieldIds.has(field.id)) return null
                  if (isConfinedSpaceEntryPermitTemplate && confinedSpaceStructuredReview.handledFieldIds.has(field.id)) return null
                  if (useEnhancedSectionReview && enhancedStructuredReview.handledFieldIds.has(field.id)) return null
                  if (useEnhancedSectionReview && enhancedStructuredReview.sections.length === 0) {
                    if (parseSectionMarker(field.label) || isCollectSignaturesMarker(field.label)) return null
                    const raw = valueByFieldId[field.id]
                    if (raw == null || String(raw).trim() === '') return null
                  }

                  const dropdown = parseCustomFieldSpec(field.label)
                  const label = cleanDisplayLabel(dropdown?.label ?? field.label ?? 'Field')
                  const value = valueByFieldId[field.id]

                  if (isWeeklyProjectInspectionTemplate) {
                    const weeklyMeta = parseWeeklyHazardFieldMeta(field)
                    if (weeklyMeta && !visibleWeeklyHazardFieldIds.has(field.id)) return null
                    const isEmpty = isBlankReviewValue(value)
                    const isManagementInitials = String(label).toLowerCase().includes('management initials')
                    if (isManagementInitials && isEmpty) return null
                    if (weeklyMeta && isEmpty) return null
                  }

                  if (isBlankReviewValue(value) && !parseSectionMarker(field.label)) {
                    return null
                  }

                  if (fieldType === 'CHECKBOX') {
                    const checklistChoice = normalizeChecklistChoice(value)
                    if (checklistChoice) {
                      let status: { icon: string; text: string; tone: string }
                      if (isHotWorkPermitTemplate) {
                        const hot =
                          checklistChoice === 'yes' || checklistChoice === 'standard'
                            ? { icon: '✅', text: 'Yes', tone: 'text-emerald-700 dark:text-emerald-300' }
                            : checklistChoice === 'no' || checklistChoice === 'substandard'
                              ? { icon: '❌', text: 'No', tone: 'text-red-700 dark:text-red-300' }
                              : { icon: '⚠️', text: 'N/A', tone: 'text-amber-700 dark:text-amber-300' }
                        status = hot
                      } else {
                        status =
                          checklistChoice === 'standard'
                            ? { icon: '✅', text: 'Up to Standard', tone: 'text-emerald-700 dark:text-emerald-300' }
                            : checklistChoice === 'substandard'
                              ? { icon: '❌', text: 'Substandard', tone: 'text-red-700 dark:text-red-300' }
                              : checklistChoice === 'yes'
                                ? { icon: '✅', text: 'Yes', tone: 'text-emerald-700 dark:text-emerald-300' }
                                : checklistChoice === 'no'
                                  ? { icon: '❌', text: 'No', tone: 'text-red-700 dark:text-red-300' }
                                  : { icon: '⚠️', text: 'N/A (Missing)', tone: 'text-amber-700 dark:text-amber-300' }
                      }
                      return (
                        <div key={field.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 text-sm">
                          <span className="font-medium">{label}: </span>
                          <span className={`font-medium ${status.tone}`}>{status.text} {status.icon}</span>
                        </div>
                      )
                    }

                    const checked = value === true || value === 'true' || value === '1' || value === 'yes'
                    return (
                      <div key={field.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 text-sm">
                        <span className="font-medium">{label}: </span>
                        <span>{checked ? 'Checked' : 'Unchecked'}</span>
                      </div>
                    )
                  }

                  return (
                    <div key={field.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 text-sm">
                      <span className="font-medium">{label}: </span>
                      <span>{value != null && String(value).trim() !== '' ? String(value) : '—'}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Optional supporting PDF for toolbox-talk custom forms */}
          {supportingPdfValue && (
            <Card padding="lg" className="border-brand-500/50 bg-brand-50/20 dark:bg-brand-900/10">
              <h2 className="font-semibold text-lg text-neutral-900 dark:text-white mb-2">
                Tool Box Talks — Supporting PDF (optional)
              </h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                Supporting document attached to this toolbox talk. Use Quick view or Download below.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="min-w-[180px]">
                  <p
                    className="font-medium text-sm text-neutral-900 dark:text-neutral-100 truncate"
                    title={supportingPdfOriginalName ?? 'Toolbox attachment'}
                  >
                    {supportingPdfOriginalName ?? 'Toolbox attachment.pdf'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleSupportingPdfQuickView}>
                    Quick view
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleSupportingPdfDownload}>
                    Download
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {!isDailyHazardTemplate && showCustomSignaturesSection && (
            <Card padding="lg" className="border-brand-500/50 bg-brand-50/20 dark:bg-brand-900/10 space-y-4">
              <h2 className="font-semibold text-neutral-900 dark:text-white">Signatures &amp; who signed</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Participant signatures captured on this form (names come from the form or sign-in account).
              </p>

              {customTemplateSignatureRows.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {submission.status === 'AWAITING_SIGNATURES'
                    ? 'No signatures collected yet.'
                    : 'No participant signatures on file for this submission.'}
                </p>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {customTemplateSignatureRows.map((row) => (
                    <li
                      key={row.key}
                      className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-800 flex items-start gap-4"
                    >
                      <img
                        src={row.imageData}
                        alt={`Signature of ${row.name}`}
                        className="h-16 max-w-[140px] object-contain border rounded bg-white shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-neutral-900 dark:text-white">{row.name}</p>
                        {row.fieldLabel && (
                          <p className="text-xs text-neutral-500 mt-0.5">Field: {row.fieldLabel}</p>
                        )}
                        {row.signedAt && (
                          <p className="text-xs text-neutral-500 mt-1">
                            Signed {new Date(row.signedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {submission.status === 'AWAITING_SIGNATURES' && (
                <>
                  <div className="no-print pt-4 border-t border-neutral-200 dark:border-neutral-700 flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        Select worker to sign
                      </label>
                      <select
                        value={signingWorkerId}
                        onChange={(e) => setSigningWorkerId(e.target.value)}
                        className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                        aria-label="Select worker to sign"
                        disabled={!canSignInline}
                      >
                        <option value="">Select yourself or a worker...</option>
                        {signingWorkerOptions.map((s) => (
                          <option key={s.labourerUserId} value={s.labourerUserId} disabled={s.signatureStatus === 'signed'}>
                            {s.signer?.displayName ?? s.labourerUserId}
                            {s.labourerUserId === user?.id ? ' (Me)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Button
                      type="button"
                      onClick={() => setShowSignModal(true)}
                      disabled={!canSignInline || !signingWorkerId || selectedSigningWorkerSigned || signing}
                    >
                      {signing ? 'Saving…' : 'Add signature'}
                    </Button>
                  </div>
                </>
              )}
            </Card>
          )}
        </div>
      ) : (
      <>
        {!loadingPdf && pageImages.length > 0 && (
          <div className="print-only space-y-0">
            {pageImages.map((src, idx) => (
              <div
                key={`print-page-${idx + 1}`}
                className={`form-review-pdf-print-page relative block w-full max-w-3xl mx-auto${
                  idx === pageImages.length - 1 ? ' form-review-pdf-print-page-last' : ''
                }`}
              >
                <img
                  src={src}
                  alt={`Page ${idx + 1}`}
                  className="pdf-page-img block w-full h-auto"
                  loading="eager"
                  decoding="sync"
                />
                <div className="absolute inset-0 top-0 left-0 right-0 bottom-0">
                  {renderPdfPageFieldOverlays(idx + 1)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="no-print relative inline-block w-full max-w-3xl mx-auto">
          {loadingPdf && (
            <div className="flex items-center justify-center min-h-[400px] text-neutral-500 dark:text-neutral-400">
              Loading PDF…
            </div>
          )}
          {!loadingPdf && pageImages[currentPage - 1] && (
            <div className="relative inline-block w-full max-w-3xl">
              <img
                src={pageImages[currentPage - 1]}
                alt={`Page ${currentPage}`}
                className="block w-full h-auto shadow-lg rounded-lg"
              />
              <div className="absolute inset-0 top-0 left-0 right-0 bottom-0">
                {renderPdfPageFieldOverlays(currentPage)}
              </div>
            </div>
          )}
          {!loadingPdf && !pageImages[currentPage - 1] && pageCount > 0 && (
            <div className="flex items-center justify-center min-h-[200px] text-neutral-500 dark:text-neutral-400">
              No image for this page.
            </div>
          )}
        </div>
      </>
      )}
    </div>
    {showSignModal && (
        <SignatureModal
          fieldLabel={isCustomTemplate ? `Signature for ${signingWorkerLabel || 'Worker'}` : 'Labourer signature'}
          onSave={(imageData, signerNameFromModal) => {
            if (!isCustomTemplate) {
              handleSign(imageData, signerNameFromModal)
              return
            }
            const fallbackSignerId =
              signingWorkerId ||
              (submission?.needsMySignature && user?.id ? user.id : '')
            if (!fallbackSignerId) return
            const fallbackSignerName =
              signingWorkerLabel ||
              (fallbackSignerId === user?.id ? user?.name : '') ||
              signerNameFromModal
            handleSign(imageData, fallbackSignerName, fallbackSignerId)
          }}
          onClose={() => setShowSignModal(false)}
          requireName={!isCustomTemplate && !!submission?.needsMySignature}
        />
      )}
      {resubmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-neutral-800 shadow-xl p-6">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Request resubmission</h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Send this form back to the original creator for corrections and resubmission.
            </p>
            <label className="block mt-4">
              <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Reason</span>
              <textarea
                value={resubmitReason}
                onChange={(e) => setResubmitReason(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white"
                placeholder="Describe what needs to be corrected before HR can approve this form."
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setResubmitModalOpen(false)} disabled={requestingResubmission}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleRequestResubmission} disabled={requestingResubmission || !resubmitReason.trim()}>
                {requestingResubmission ? 'Sending…' : 'Send back for resubmission'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
