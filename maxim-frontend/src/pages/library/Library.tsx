import { useState, useMemo, useEffect, useCallback } from 'react'
import { Link, useSearchParams, useLocation } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconDownload } from '@/components/icons/NavIcons'
import { useUser } from '@/contexts/UserContext'
import { useDocuments } from '@/contexts/DocumentsContext'
import { useSignableTemplates } from '@/contexts/SignableTemplatesContext'
import { canUserViewDocument } from '@/utils/documentAccess'
import { canUserAccessTemplate } from '@/utils/templateAccess'
import { useFormSubmissions } from '@/contexts/FormSubmissionsContext'
import { useSignableSubmissions } from '@/contexts/SignableSubmissionsContext'
import { useSigning } from '@/contexts/SigningContext'
import { fetchPdfTemplates, fetchPdfSubmissions, deletePdfTemplate, deleteDraftPdfSubmissions, exportMergedPdfSubmissions, fetchDailyFormsMyTeam, createFormAssignment, fetchFormAssignments, reviewFormAssignment, replaceLibraryDocumentFile, type PdfTemplateRecord, type PdfSubmissionRecord, type FormAssignmentRecord } from '@/api/library'
import { listDailyHazardSubmissions, type DailyHazardSubmissionSummary } from '@/api/dailyHazardAnalysis'
import { fetchNearMisses, type NearMissRecord } from '@/api/nearMisses'
import { downloadBlob } from '@/utils/fileActions'
import { isWashroomDraftForMyDraftsList } from '@/utils/washroomTemplate'

/** How often the form is typically used — drives Filters on Forms & Documents */
export type FormFrequency = 'daily' | 'weekly' | 'when_needed' | 'other'
export type FormTag = 'niche_bakery'

type FormBox = {
  label: string
  description: string
  icon: string
  staticTo?: string
  templateNamePatterns?: RegExp[]
  formFrequency: FormFrequency
  tags?: FormTag[]
}

/** Resolved card on Forms & Documents (template match + special tiles like upload / subcontractor). */
type LibraryFormCard = FormBox & {
  resolvedTo?: string
  templateId?: string
  isConfigured: boolean
  isUploadCard: boolean
  seeUploadsTo?: string
}

/** Forms & Documents landing: form entry only */
const FORM_BOXES: FormBox[] = [
  {
    label: 'Daily Hazard Assessments Form',
    description: 'Start a daily hazard analysis form.',
    icon: '📋',
    templateNamePatterns: [/daily\s*hazard/i, /daily\s*hazard\s*assessment/i, /daily\s*jha/i],
    formFrequency: 'daily',
  },
  {
    label: 'Tool Box Talks Form',
    description: 'Start this form category and complete your template.',
    icon: '🧰',
    templateNamePatterns: [/tool\s*box/i, /toolbox/i],
    formFrequency: 'weekly',
  },
  {
    label: 'Weekly Project Inspection Form',
    description: 'Start a weekly project inspection form.',
    icon: '🗓️',
    templateNamePatterns: [/weekly.*inspection/i],
    formFrequency: 'weekly',
  },
  {
    label: 'Equipment Inspections Form',
    description: 'Start an equipment inspection form.',
    icon: '🛠️',
    templateNamePatterns: [/equipment\s*inspection/i],
    formFrequency: 'daily',
  },
  {
    label: 'Hot Work Permits Form',
    description: 'Start a hot work permit form.',
    icon: '🔥',
    templateNamePatterns: [/hot\s*work/i],
    formFrequency: 'daily',
  },
  {
    label: 'Fall Arrest Inspection Checklist',
    description: 'Start a fall arrest equipment inspection checklist form.',
    icon: '🦺',
    templateNamePatterns: [/fall\s*arrest/i],
    formFrequency: 'daily',
  },
  {
    label: 'Power Elevating / Work Platforms',
    description: 'Pre-use inspection checklist for power elevating work platforms.',
    icon: '🛗',
    templateNamePatterns: [/power\s+elevating/i, /work\s+platforms/i],
    formFrequency: 'daily',
  },
  {
    label: 'Washroom Inspection Checklist',
    description: 'Pick Peter, Shop, or Main Office washroom, then complete the checklist.',
    icon: '🚻',
    templateNamePatterns: [/washroom\s*inspection\s*checklist/i, /washroom\s*inspection/i],
    formFrequency: 'daily',
  },
  {
    label: 'Pressure Testing Checklist',
    description: 'Capture pressure test setup, gauge details, results, and witness sign-off.',
    icon: '🧪',
    templateNamePatterns: [/pressure\s*testing\s*checklist/i],
    formFrequency: 'when_needed',
  },
  {
    label: 'Active Pipeline Connections — Hydrocarbons',
    description: 'Document active hydrocarbon connection procedure, controls, and final sign-off.',
    icon: '🛢️',
    templateNamePatterns: [/active\s*pipeline\s*connections.*hydrocarbon/i],
    formFrequency: 'when_needed',
  },
  {
    label: 'Drain and Vent Test Form',
    description: 'Record drain and vent testing details, outcomes, and witness signatures.',
    icon: '💨',
    templateNamePatterns: [/drain\s*and\s*vent\s*test\s*form/i],
    formFrequency: 'when_needed',
  },
  {
    label: 'Notice Of Transmittal',
    description: 'Send a notice of transmittal with itemized quantity, item number, and description rows.',
    icon: '📨',
    templateNamePatterns: [/notice\s*of\s*transmittal/i],
    formFrequency: 'when_needed',
  },
  {
    label: 'Work Log',
    description: 'Track daily work entries, hours, crew counts, and both-side supervisor sign-off.',
    icon: '🧾',
    templateNamePatterns: [/work\s*log/i],
    formFrequency: 'daily',
  },
  {
    label: 'Niche Water Softener',
    description: 'Quarterly Niche Bakery water softener inspection checklist and sign-off.',
    icon: '💧',
    templateNamePatterns: [/niche\s*water\s*softener/i],
    formFrequency: 'when_needed',
    tags: ['niche_bakery'],
  },
  {
    label: 'Niche Air Separators',
    description: 'Quarterly Niche Bakery air separators inspection checklist and sign-off.',
    icon: '🌬️',
    templateNamePatterns: [/niche\s*air\s*seporators/i, /niche\s*air\s*separators/i],
    formFrequency: 'when_needed',
    tags: ['niche_bakery'],
  },
  {
    label: 'Niche Buffer Tanks',
    description: 'Quarterly Niche Bakery buffer tanks inspection checklist and sign-off.',
    icon: '🛢️',
    templateNamePatterns: [/niche\s*buffer\s*tanks/i],
    formFrequency: 'when_needed',
    tags: ['niche_bakery'],
  },
  {
    label: 'Niche Expansion Tanks',
    description: 'Quarterly Niche Bakery expansion tanks inspection checklist and sign-off.',
    icon: '🧯',
    templateNamePatterns: [/niche\s*expansion\s*tanks/i],
    formFrequency: 'when_needed',
    tags: ['niche_bakery'],
  },
  {
    label: 'Niche Pumps',
    description: 'Quarterly Niche Bakery pumps inspection checklist and sign-off.',
    icon: '⚙️',
    templateNamePatterns: [/niche\s*pumps/i],
    formFrequency: 'when_needed',
    tags: ['niche_bakery'],
  },
  {
    label: 'Testing and Verification Procedure DEF',
    description: 'Large DEF testing and verification checklist with component matrix and sign-off.',
    icon: '🧪',
    templateNamePatterns: [/testing\s*and\s*verification\s*procedure\s*def/i],
    formFrequency: 'when_needed',
  },
  {
    label: 'INTERIM 2 PM Checklist',
    description: 'VIA RAIL TMC INTERIM 2 preventative maintenance checklist — 19 pages (DEF, Sanding, WWF).',
    icon: '🔧',
    templateNamePatterns: [/interim\s*2\s*pm\s*checklist/i],
    formFrequency: 'when_needed',
  },
  {
    label: 'Underground Piping Inspection',
    description: 'Inspect underground storm and sanitary piping, checklist compliance, and sign-off.',
    icon: '🛠️',
    templateNamePatterns: [/underground\s*piping\s*inspection/i],
    formFrequency: 'when_needed',
  },
  {
    label: 'Incident Reports Form',
    description: 'Start an incident report form.',
    icon: '⚠️',
    templateNamePatterns: [/incident/i],
    formFrequency: 'when_needed',
  },
  {
    label: 'Near Miss Form',
    description: 'Open and submit the near-miss reporting form.',
    icon: '📝',
    templateNamePatterns: [/near\s*[-\s]?miss/i],
    formFrequency: 'when_needed',
  },
  {
    label: 'Confined Space Entry Permit',
    description:
      'Permit for confined space entry: hazards, atmospheric testing, attendant, entrants, rescue. Reference PDF 2026 available to download. Link the submission to a job below or from Job Management.',
    icon: '🧱',
    templateNamePatterns: [/confined\s+space\s+entry\s+permit/i, /confined\s+spaces?\s+entry\s+permit/i],
    formFrequency: 'when_needed',
  },
  {
    label: 'Lock-Out Tag-Out Form',
    description: 'Start a lock-out tag-out form.',
    icon: '🔒',
    templateNamePatterns: [/lock[-\s]*out/i, /tag[-\s]*out/i],
    formFrequency: 'when_needed',
  },
  {
    label: 'Legislative Compliance Evaluation',
    description:
      'Ontario legislative compliance checklist (Y/N/N/A per requirement). Full reference text is in the separate downloadable checklist. Review at least yearly; link the submission to a job below or from Job Management.',
    icon: '✅',
    templateNamePatterns: [/legislative\s+compliance/i, /compliance\s+evaluation/i],
    formFrequency: 'when_needed',
  },
  {
    label: 'Critical Task Inventory & Risk Register',
    description:
      'Inventory critical tasks, hazards, controls, and residual risk. Reference PDF V.2 is available to download. Link the submission to a job below or from Job Management.',
    icon: '📑',
    templateNamePatterns: [/critical\s+task\s+inventory/i, /risk\s+register/i],
    formFrequency: 'when_needed',
  },
  {
    label: 'Investigation Kit',
    description:
      'Investigation Report Form with occurrence details, witnesses, causes, corrective actions, and Voluntary Statement form.',
    icon: '🔍',
    templateNamePatterns: [/investigation\s*kit/i],
    formFrequency: 'when_needed',
  },
]

/** Classify extra PDF templates (not matched to a hub tile) for filtering */
function inferFormFrequencyForTemplateName(name: string): FormFrequency {
  const n = (name || '').toLowerCase()
  if (
    /daily\s*hazard|fall\s*arrest|equipment\s*inspection|power\s+elevating|work\s+platform|hot\s*work|washroom\s*inspection|work\s*log/.test(n) ||
    /peter\s*washroom|shop\s*washroom|main\s*office\s*washroom/.test(n)
  )
    return 'daily'
  if (/weekly.*inspection|tool\s*box|toolbox/.test(n)) return 'weekly'
  if (
    /lock[-\s]*out|tag[-\s]*out|confined\s+space|incident|investigation|near\s*[-\s]?miss|legislative\s+compliance|compliance\s+evaluation|critical\s+task\s+inventory|risk\s+register/.test(
      n
    ) ||
    /pressure\s*testing|active\s*pipeline|drain\s*and\s*vent|notice\s*of\s*transmittal|underground\s*piping\s*inspection/.test(
      n
    )
  )
    return 'when_needed'
  return 'other'
}

const FORM_TAG_FILTERS: { id: 'all' | FormTag; label: string }[] = [
  { id: 'all', label: 'All tags' },
  { id: 'niche_bakery', label: 'Niche Bakery' },
]

/** Filter chips (no separate "Other" — uncategorized tiles only appear under All) */
const FORM_FREQUENCY_FILTERS: { id: 'all' | Exclude<FormFrequency, 'other'>; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'when_needed', label: 'When needed' },
]

export type LibraryView = 'templates' | 'submissions' | 'documents' | 'signing'

type SubmissionFilter = 'all' | 'draft' | 'pending_site_signatures' | 'submitted' | 'approved' | 'rejected' | 'archived' | 'resubmit_required'
type SubmissionSortKey = 'title' | 'template' | 'job' | 'submittedBy' | 'submittedAt' | 'status'
type SubmissionSortDirection = 'asc' | 'desc'
type CombinedSubmissionRow =
  | {
      kind: 'pdf'
      id: string
      title: string
      templateName: string
      jobLabel: string
      submittedBy: string
      submittedAt?: string
      createdAt: string
      status: PdfSubmissionRecord['status']
      resubmissionReason?: string
      raw: PdfSubmissionRecord
    }
  | {
      kind: 'dha'
      id: string
      title: string
      templateName: string
      jobLabel: string
      submittedBy: string
      submittedAt?: string
      createdAt: string
      status: 'SUBMITTED' | 'APPROVED'
      raw: DailyHazardSubmissionSummary
    }
  | {
      kind: 'near-miss'
      id: string
      title: string
      templateName: string
      jobLabel: string
      submittedBy: string
      submittedAt?: string
      createdAt: string
      status: string
      raw: NearMissRecord
    }

type CompletedFormsBucket = {
  id: string
  to: string
  label: string
  description: string
  icon: string
  roles?: Array<'owner' | 'hr' | 'supervisor' | 'labourer'>
}

const COMPLETED_FORMS_BUCKET_PATTERNS: Record<string, RegExp[]> = {
  'daily-hazard': [/daily\s*hazard/i, /daily\s*hazard\s*assessment/i, /daily\s*jha/i],
  'tool-box-talks': [/tool\s*box/i, /toolbox/i],
  'weekly-inspections': [/weekly.*inspection/i],
  'equipment-inspections': [/equipment\s*inspection/i],
  'fall-arrest': [/fall\s*arrest/i],
  'power-elevating': [/power\s+elevating/i, /work\s+platforms/i],
  'washroom-inspections': [
    /washroom\s*inspection/i,
    /peter\s*washroom/i,
    /shop\s*washroom/i,
    /main\s*office\s*washroom/i,
  ],
  'flha': [/flha/i, /field\s*level\s*hazard/i],
  'hot-work': [/hot\s*work/i],
  'incident-reports': [/incident\s*report/i, /incident/i],
  'hazard-reports': [/hazard\s*report/i, /hazard\s*register/i],
  'confined-spaces': [/confined\s+space/i],
  'lockout-tagout': [/lock[-\s]*out/i, /tag[-\s]*out/i],
  'compliance-evaluation': [/legislative\s+compliance/i, /compliance\s+evaluation/i],
  'near-miss': [/near\s*[-\s]?miss/i],
  investigation: [/investigation\s*kit/i, /investigation\s*report/i],
  'pressure-testing': [/pressure\s*testing\s*checklist/i],
  'active-pipeline-hydrocarbons': [/active\s*pipeline\s*connections.*hydrocarbon/i],
  'drain-vent-test': [/drain\s*and\s*vent\s*test\s*form/i],
  'notice-of-transmittal': [/notice\s*of\s*transmittal/i],
  'work-log': [/work\s*log/i],
  'underground-piping-inspection': [/underground\s*piping\s*inspection/i],
}

function matchesCompletedFormsBucket(bucketId: string | null, text: string) {
  if (!bucketId) return true
  const content = (text || '').toLowerCase()
  const patterns = COMPLETED_FORMS_BUCKET_PATTERNS[bucketId]
  if (bucketId === 'other') {
    const allPatterns = Object.values(COMPLETED_FORMS_BUCKET_PATTERNS).flat()
    return !allPatterns.some((pattern) => pattern.test(content))
  }
  if (!patterns?.length) return true
  return patterns.some((pattern) => pattern.test(content))
}

const COMPLETED_FORMS_BUCKETS: CompletedFormsBucket[] = [
  { id: 'daily-hazard', to: '/library?view=submissions&from=safety&bucket=daily-hazard', label: 'Daily Hazard Assessments', description: 'View submitted daily hazard assessment forms.', icon: '📋', roles: ['owner', 'hr'] },
  { id: 'tool-box-talks', to: '/library?view=submissions&from=safety&bucket=tool-box-talks', label: 'Tool Box Talks', description: 'View submitted toolbox talk forms.', icon: '🧰', roles: ['owner', 'hr'] },
  { id: 'weekly-inspections', to: '/library?view=submissions&from=safety&bucket=weekly-inspections', label: 'Weekly Inspections', description: 'View weekly inspection submissions.', icon: '🗓️', roles: ['owner', 'hr'] },
  { id: 'equipment-inspections', to: '/library?view=submissions&from=safety&bucket=equipment-inspections', label: 'Equipment Inspections', description: 'View equipment inspection submissions.', icon: '🛠️', roles: ['owner', 'hr'] },
  { id: 'fall-arrest', to: '/library?view=submissions&from=safety&bucket=fall-arrest', label: 'Fall Arrest', description: 'View fall arrest inspection submissions.', icon: '🦺', roles: ['owner', 'hr'] },
  { id: 'power-elevating', to: '/library?view=submissions&from=safety&bucket=power-elevating', label: 'Power Elevating / Work Platforms', description: 'View power elevating work platform submissions.', icon: '🛗', roles: ['owner', 'hr'] },
  { id: 'washroom-inspections', to: '/library?view=submissions&from=safety&bucket=washroom-inspections', label: 'Washroom Inspections', description: 'View washroom inspection submissions.', icon: '🚻', roles: ['owner', 'hr'] },
  { id: 'flha', to: '/library?view=submissions&from=safety&bucket=flha', label: 'FLHA', description: 'View field-level hazard assessment submissions.', icon: '🧾', roles: ['owner', 'hr'] },
  { id: 'hot-work', to: '/library?view=submissions&from=safety&bucket=hot-work', label: 'Hot Works Permits', description: 'View hot work permit submissions.', icon: '🔥', roles: ['owner', 'hr'] },
  { id: 'incident-reports', to: '/library?view=submissions&from=safety&bucket=incident-reports', label: 'Incident Reports', description: 'View incident report form submissions.', icon: '⚠️', roles: ['owner', 'hr'] },
  { id: 'hazard-reports', to: '/library?view=submissions&from=safety&bucket=hazard-reports', label: 'Hazard Reports', description: 'View hazard report form submissions.', icon: '🚧', roles: ['owner', 'hr'] },
  { id: 'near-miss', to: '/library?view=submissions&from=safety&bucket=near-miss', label: 'Near Miss', description: 'View near miss form submissions.', icon: '📝', roles: ['owner', 'hr'] },
  { id: 'pressure-testing', to: '/library?view=submissions&from=safety&bucket=pressure-testing', label: 'Pressure Testing Checklist', description: 'View pressure testing checklist submissions.', icon: '🧪', roles: ['owner', 'hr'] },
  { id: 'active-pipeline-hydrocarbons', to: '/library?view=submissions&from=safety&bucket=active-pipeline-hydrocarbons', label: 'Active Pipeline Connections — Hydrocarbons', description: 'View active pipeline hydrocarbon connection submissions.', icon: '🛢️', roles: ['owner', 'hr'] },
  { id: 'drain-vent-test', to: '/library?view=submissions&from=safety&bucket=drain-vent-test', label: 'Drain and Vent Test Form', description: 'View drain and vent test form submissions.', icon: '💨', roles: ['owner', 'hr'] },
  { id: 'notice-of-transmittal', to: '/library?view=submissions&from=safety&bucket=notice-of-transmittal', label: 'Notice Of Transmittal', description: 'View Notice Of Transmittal submissions.', icon: '📨', roles: ['owner', 'hr'] },
  { id: 'work-log', to: '/library?view=submissions&from=safety&bucket=work-log', label: 'Work Log', description: 'View Work Log submissions.', icon: '🧾', roles: ['owner', 'hr'] },
  { id: 'underground-piping-inspection', to: '/library?view=submissions&from=safety&bucket=underground-piping-inspection', label: 'Underground Piping Inspection', description: 'View Underground Piping Inspection submissions.', icon: '🛠️', roles: ['owner', 'hr'] },
  { id: 'confined-spaces', to: '/library?view=submissions&from=safety&bucket=confined-spaces', label: 'Confined Spaces', description: 'View confined space form submissions.', icon: '🧱', roles: ['owner', 'hr'] },
  { id: 'investigation', to: '/library?view=submissions&from=safety&bucket=investigation', label: 'Investigation Kit', description: 'View investigation kit submissions.', icon: '🔍', roles: ['owner', 'hr'] },
  { id: 'lockout-tagout', to: '/library?view=submissions&from=safety&bucket=lockout-tagout', label: 'Lock-Out Tag-Out', description: 'View lock-out tag-out submissions.', icon: '🔒', roles: ['owner', 'hr'] },
  { id: 'compliance-evaluation', to: '/library?view=submissions&from=safety&bucket=compliance-evaluation', label: 'Compliance Evaluation', description: 'View compliance evaluation submissions.', icon: '✅', roles: ['owner', 'hr'] },
  { id: 'other', to: '/library?view=submissions&from=safety&bucket=other', label: 'Other Forms', description: 'View other completed forms.', icon: '📄', roles: ['owner', 'hr'] },
]

function canExportSubmissionRow(row: CombinedSubmissionRow) {
  return row.kind === 'dha' || row.kind === 'near-miss' || (row.kind === 'pdf' && row.status !== 'DRAFT' && row.status !== 'RESUBMIT_REQUIRED')
}

export function Library() {
  const { user } = useUser()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = (searchParams.get('view') as LibraryView) || 'templates'
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    const state = location.state as { message?: string } | null
    if (state?.message) {
      setMessage(state.message)
      window.history.replaceState({}, '')
    }
  }, [location.state])
  const submissionFilter = (searchParams.get('status') as SubmissionFilter) || 'submitted'
  const [search, setSearch] = useState('')
  const [submittedByFilter, setSubmittedByFilter] = useState<string>('')
  const [docTypeFilter, setDocTypeFilter] = useState<string>('all')
  const [docSiteFilter, setDocSiteFilter] = useState<string>('all')
  const [signingSearch, setSigningSearch] = useState('')
  const [overwritingDocId, setOverwritingDocId] = useState<string | null>(null)
  const [formFrequencyFilter, setFormFrequencyFilter] = useState<'all' | Exclude<FormFrequency, 'other'>>('all')
  const [formTagFilter, setFormTagFilter] = useState<'all' | FormTag>((searchParams.get('tag') as 'all' | FormTag) || 'all')
  const from = searchParams.get('from')
  const selectedBucket = searchParams.get('bucket')
  const activeBucket = useMemo(() => COMPLETED_FORMS_BUCKETS.find((b) => b.id === selectedBucket) ?? null, [selectedBucket])
  const activeBucketId = activeBucket?.id ?? null
  const backLinkTo = from === 'forms' ? '/library' : '/safety'
  const backLinkLabel = from === 'forms' ? 'Back to Forms & Documents' : 'Back to Health & Safety'
  const showBackLink = !(from === 'safety' && view === 'submissions')
  const pageTitle = from === 'forms' ? 'Forms & Documents' : from === 'safety' ? 'Health & Safety' : 'Forms & Documents'
  const pageSubtitle =
    from === 'safety'
      ? 'Completed submissions and safety documents.'
      : 'Start a form type to fill out a form. Submissions and review are in Health & Safety.'

  const { templates } = useSignableTemplates()
  const { documents, refetch: refetchDocuments } = useDocuments()
  const { submissions: formSubmissions } = useFormSubmissions()
  const { submissions: signableSubmissions } = useSignableSubmissions()
  const { requests: signingRequestsFromApi } = useSigning()
  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'
  const isLabourer = user?.role === 'labourer'
  const isSupervisorOrAbove = user?.role === 'supervisor' || isOwnerOrHr

  const [pdfTemplates, setPdfTemplates] = useState<PdfTemplateRecord[]>([])
  const [pdfSubmissions, setPdfSubmissions] = useState<PdfSubmissionRecord[]>([])
  const [dashboardPdfSubmissions, setDashboardPdfSubmissions] = useState<PdfSubmissionRecord[]>([])
  const [dailyHazardSubmissions, setDailyHazardSubmissions] = useState<DailyHazardSubmissionSummary[]>([])
  const [nearMissSubmissions, setNearMissSubmissions] = useState<NearMissRecord[]>([])
  const [pendingSignatureSubmissions, setPendingSignatureSubmissions] = useState<PdfSubmissionRecord[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [loadingSubmissions, setLoadingSubmissions] = useState(true)
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([])
  const [selectedExportSubmissionIds, setSelectedExportSubmissionIds] = useState<string[]>([])
  const [exportingSelected, setExportingSelected] = useState(false)
  const [submissionDateFrom, setSubmissionDateFrom] = useState('')
  const [submissionDateTo, setSubmissionDateTo] = useState('')
  const [submissionSort, setSubmissionSort] = useState<{ key: SubmissionSortKey; direction: SubmissionSortDirection }>({
    key: 'submittedAt',
    direction: 'desc',
  })
  const [deletingDrafts, setDeletingDrafts] = useState(false)
  const [submissionsMinimized, setSubmissionsMinimized] = useState(false)

  const loadPdfTemplates = useCallback(() => {
    setLoadingTemplates(true)
    fetchPdfTemplates()
      .then(setPdfTemplates)
      .catch(() => setPdfTemplates([]))
      .finally(() => setLoadingTemplates(false))
  }, [])
  const loadPdfSubmissions = useCallback(() => {
    setLoadingSubmissions(true)
    const statusMap: Record<string, string> = {
      all: '',
      draft: 'DRAFT',
      submitted: 'SUBMITTED',
      approved: 'APPROVED',
      rejected: 'REJECTED',
      archived: 'ARCHIVED',
      pending_site_signatures: 'AWAITING_SIGNATURES',
      resubmit_required: 'RESUBMIT_REQUIRED',
    }
    const status = statusMap[submissionFilter] ?? 'SUBMITTED'
    const paramsBase = { submittedById: submittedByFilter || undefined }

    // "Pending approval" must include forms sent for worker signatures (AWAITING_SIGNATURES), not only SUBMITTED.
    if (submissionFilter === 'submitted') {
      Promise.all([
        fetchPdfSubmissions({ status: 'SUBMITTED', ...paramsBase }),
        fetchPdfSubmissions({ status: 'AWAITING_SIGNATURES', ...paramsBase }),
      ])
        .then(([submittedRows, awaitingRows]) => {
          const byId = new Map<string, (typeof submittedRows)[number]>()
          for (const s of submittedRows) byId.set(s.id, s)
          for (const s of awaitingRows) byId.set(s.id, s)
          const merged = Array.from(byId.values()).sort((a, b) => {
            const ta = new Date(a.submittedAt ?? a.createdAt ?? 0).getTime()
            const tb = new Date(b.submittedAt ?? b.createdAt ?? 0).getTime()
            return tb - ta
          })
          setPdfSubmissions(merged)
        })
        .catch(() => setPdfSubmissions([]))
        .finally(() => setLoadingSubmissions(false))
      return
    }

    fetchPdfSubmissions({
      status: status || undefined,
      ...paramsBase,
    })
      .then(setPdfSubmissions)
      .catch(() => setPdfSubmissions([]))
      .finally(() => setLoadingSubmissions(false))
  }, [submissionFilter, submittedByFilter])
  const loadDailyHazardSubmissions = useCallback(() => {
    listDailyHazardSubmissions()
      .then((list) => setDailyHazardSubmissions(Array.isArray(list) ? list : []))
      .catch(() => setDailyHazardSubmissions([]))
  }, [])
  const loadNearMissSubmissions = useCallback(() => {
    fetchNearMisses()
      .then((list) => setNearMissSubmissions(Array.isArray(list) ? list : []))
      .catch(() => setNearMissSubmissions([]))
  }, [])
  const loadDashboardPdfSubmissions = useCallback(() => {
    // Dashboard cards should reflect the true queue across all statuses,
    // independent of the submissions table status dropdown.
    fetchPdfSubmissions()
      .then((rows) => setDashboardPdfSubmissions(Array.isArray(rows) ? rows : []))
      .catch(() => setDashboardPdfSubmissions([]))
  }, [])

  useEffect(() => {
    loadPdfTemplates()
  }, [loadPdfTemplates])
  useEffect(() => {
    loadPdfSubmissions()
  }, [loadPdfSubmissions, submissionFilter, submittedByFilter])
  useEffect(() => {
    if (view !== 'submissions') return
    loadDailyHazardSubmissions()
    loadNearMissSubmissions()
    loadDashboardPdfSubmissions()
  }, [view, loadDailyHazardSubmissions, loadNearMissSubmissions, loadDashboardPdfSubmissions])
  useEffect(() => {
    if (view !== 'signing') return
    fetchPdfSubmissions({ status: 'AWAITING_SIGNATURES' })
      .then(setPendingSignatureSubmissions)
      .catch(() => setPendingSignatureSubmissions([]))
  }, [view])

  // --- Assign modal state ---
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignTemplate, setAssignTemplate] = useState<PdfTemplateRecord | null>(null)
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [assignDueDate, setAssignDueDate] = useState('')
  const [assignRecurrence, setAssignRecurrence] = useState<'once' | 'daily' | 'weekly' | 'monthly'>('once')
  const [assignNote, setAssignNote] = useState('')
  const [assigning, setAssigning] = useState(false)

  const openAssignModal = (template: PdfTemplateRecord) => {
    setAssignTemplate(template)
    setSelectedUserIds([])
    setAssignDueDate('')
    setAssignRecurrence('once')
    setAssignNote('')
    setAssignModalOpen(true)
    fetchDailyFormsMyTeam().then(setTeamMembers).catch(() => setTeamMembers([]))
  }

  const handleAssign = async () => {
    if (!assignTemplate || selectedUserIds.length === 0) return
    setAssigning(true)
    try {
      await createFormAssignment({
        templateId: assignTemplate.id,
        assignedToUserIds: selectedUserIds,
        dueDate: assignDueDate || undefined,
        recurrence: assignRecurrence,
        note: assignNote || undefined,
      })
      setAssignModalOpen(false)
      setMessage(`"${assignTemplate.name}" assigned to ${selectedUserIds.length} labourer(s).`)
    } catch {
      alert('Failed to assign form.')
    } finally {
      setAssigning(false)
    }
  }

  // --- Labourer: assigned forms ---
  const [myAssignments, setMyAssignments] = useState<FormAssignmentRecord[]>([])
  useEffect(() => {
    if (isLabourer || user?.role === 'supervisor') {
      fetchFormAssignments().then(setMyAssignments).catch(() => setMyAssignments([]))
    }
  }, [isLabourer, user?.role])
  const pendingAssignments = useMemo(() => myAssignments.filter(a => ['pending', 'in_progress', 'resubmission_required'].includes(a.status)), [myAssignments])

  // --- Supervisor: submissions awaiting review ---
  const [reviewAssignments, setReviewAssignments] = useState<FormAssignmentRecord[]>([])
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewComment, setReviewComment] = useState('')
  useEffect(() => {
    if (isSupervisorOrAbove) {
      fetchFormAssignments({ status: 'completed' }).then(setReviewAssignments).catch(() => setReviewAssignments([]))
    }
  }, [isSupervisorOrAbove])

  // --- Owner/HR: all assignments for dashboard windows (impending, outstanding, awaiting approval) ---
  const [allAssignmentsOwner, setAllAssignmentsOwner] = useState<FormAssignmentRecord[]>([])
  const [assigneeFilter, setAssigneeFilter] = useState<string>('')
  useEffect(() => {
    if (isOwnerOrHr) {
      fetchFormAssignments(assigneeFilter ? { assignedToId: assigneeFilter } : undefined)
        .then(setAllAssignmentsOwner)
        .catch(() => setAllAssignmentsOwner([]))
    }
  }, [isOwnerOrHr, assigneeFilter])
  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const impendingAssignments = useMemo(() => allAssignmentsOwner.filter((a) => {
    if (['completed', 'reviewed'].includes(a.status)) return false
    if (!a.dueDate) return true
    const d = new Date(a.dueDate + 'T12:00:00')
    return d >= now && d <= in7
  }), [allAssignmentsOwner])
  const outstandingAssignments = useMemo(() => allAssignmentsOwner.filter((a) => ['pending', 'in_progress', 'resubmission_required'].includes(a.status)), [allAssignmentsOwner])
  const awaitingApprovalAssignments = useMemo(() => allAssignmentsOwner.filter((a) => a.status === 'completed'), [allAssignmentsOwner])
  const assigneeOptions = useMemo(() => {
    const seen = new Set<string>()
    return allAssignmentsOwner.filter((a) => !seen.has(a.assignedToId) && (seen.add(a.assignedToId), true)).map((a) => ({ id: a.assignedToId, name: a.assignedTo }))
  }, [allAssignmentsOwner])

  const handleOverwrite = async (docId: string, file: File) => {
    setOverwritingDocId(docId)
    try {
      await replaceLibraryDocumentFile(docId, file)
      await refetchDocuments()
      setMessage('Document replaced. Frank will use the new version within a minute.')
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to replace document. Please try again.')
    } finally {
      setOverwritingDocId(null)
    }
  }

  const handleReview = async (assignmentId: string, action: 'reviewed' | 'resubmission_required') => {
    try {
      await reviewFormAssignment(assignmentId, action, reviewComment || undefined)
      setReviewAssignments(prev => prev.filter(a => a.id !== assignmentId))
      setReviewingId(null)
      setReviewComment('')
    } catch {
      alert('Review failed.')
    }
  }

  const handleForwardToHR = async (assignmentId: string) => {
    try {
      const { forwardAssignmentToHR } = await import('@/api/library')
      await forwardAssignmentToHR(assignmentId)
      alert('Forwarded to HR successfully.')
      setReviewAssignments(prev => prev.filter(a => a.id !== assignmentId))
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to forward to HR')
    }
  }

  const visibleTemplates = useMemo(
    () => templates.filter((t) => canUserAccessTemplate(t, user ?? null)),
    [templates, user]
  )
  const baseSubmissions = useMemo(() => {
    if (isLabourer) return formSubmissions.filter((f) => f.submittedBy === user?.name)
    return formSubmissions
  }, [formSubmissions, isLabourer, user?.name])
  const submittersList = useMemo(() => {
    const seen = new Set<string>()
    const fromPdf = pdfSubmissions
      .filter((s) => s.submittedById && !seen.has(s.submittedById) && (seen.add(s.submittedById), true))
      .map((s) => ({ id: s.submittedById!, name: s.submittedBy?.displayName ?? s.submittedById! }))
    const fromDha = dailyHazardSubmissions
      .filter((s) => s.submittedById && !seen.has(s.submittedById) && (seen.add(s.submittedById), true))
      .map((s) => ({ id: s.submittedById!, name: s.submittedBy ?? s.submittedById! }))
    const fromNearMiss = nearMissSubmissions
      .filter((s) => s.reportedById && !seen.has(s.reportedById) && (seen.add(s.reportedById), true))
      .map((s) => ({ id: s.reportedById!, name: s.reportedBy ?? s.reportedById! }))
    return [...fromPdf, ...fromDha, ...fromNearMiss]
  }, [pdfSubmissions, dailyHazardSubmissions, nearMissSubmissions])

  const filteredPdfSubmissions = useMemo(() => {
    let list = pdfSubmissions
    if (activeBucketId) {
      list = list.filter((s) =>
        matchesCompletedFormsBucket(activeBucketId, `${s.templateName ?? ''} ${s.title ?? ''}`)
      )
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((s) => (s.title ?? s.templateName ?? '').toLowerCase().includes(q))
    }
    if (submissionDateFrom || submissionDateTo) {
      const fromTs = submissionDateFrom ? new Date(`${submissionDateFrom}T00:00:00`).getTime() : null
      const toTs = submissionDateTo ? new Date(`${submissionDateTo}T23:59:59.999`).getTime() : null
      list = list.filter((s) => {
        const raw = s.submittedAt ?? s.createdAt
        if (!raw) return false
        const ts = new Date(raw).getTime()
        if (!Number.isFinite(ts)) return false
        if (fromTs != null && ts < fromTs) return false
        if (toTs != null && ts > toTs) return false
        return true
      })
    }
    return list
  }, [pdfSubmissions, activeBucketId, search, submissionDateFrom, submissionDateTo])
  const filteredDailyHazardSubmissions = useMemo(() => {
    if (!['all', 'submitted', 'approved'].includes(submissionFilter)) return []
    if (activeBucketId && activeBucketId !== 'daily-hazard') return []
    let list = dailyHazardSubmissions
    if (submissionFilter === 'submitted') {
      list = list.filter((s) => !s.approved)
    } else if (submissionFilter === 'approved') {
      list = list.filter((s) => Boolean(s.approved))
    }
    if (submittedByFilter) {
      list = list.filter((s) => s.submittedById === submittedByFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((s) =>
        `${s.projectTitle ?? ''} ${s.siteName ?? ''} ${s.jobNumber ?? ''} ${s.submittedBy ?? ''}`.toLowerCase().includes(q)
      )
    }
    if (submissionDateFrom || submissionDateTo) {
      const fromTs = submissionDateFrom ? new Date(`${submissionDateFrom}T00:00:00`).getTime() : null
      const toTs = submissionDateTo ? new Date(`${submissionDateTo}T23:59:59.999`).getTime() : null
      list = list.filter((s) => {
        const raw = s.submittedAt
        if (!raw) return false
        const ts = new Date(raw).getTime()
        if (!Number.isFinite(ts)) return false
        if (fromTs != null && ts < fromTs) return false
        if (toTs != null && ts > toTs) return false
        return true
      })
    }
    return list
  }, [dailyHazardSubmissions, activeBucketId, submissionFilter, submittedByFilter, search, submissionDateFrom, submissionDateTo])
  const filteredNearMissSubmissions = useMemo(() => {
    if (!['all', 'submitted', 'approved'].includes(submissionFilter)) return []
    if (activeBucketId && activeBucketId !== 'near-miss') return []
    let list = nearMissSubmissions
    if (submissionFilter === 'submitted') {
      list = list.filter((s) => s.status !== 'closed')
    } else if (submissionFilter === 'approved') {
      list = list.filter((s) => s.status === 'closed')
    }
    if (submittedByFilter) {
      list = list.filter((s) => s.reportedById === submittedByFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((s) =>
        `${s.siteName ?? ''} ${s.description ?? ''} ${s.reportedBy ?? ''}`.toLowerCase().includes(q)
      )
    }
    if (submissionDateFrom || submissionDateTo) {
      const fromTs = submissionDateFrom ? new Date(`${submissionDateFrom}T00:00:00`).getTime() : null
      const toTs = submissionDateTo ? new Date(`${submissionDateTo}T23:59:59.999`).getTime() : null
      list = list.filter((s) => {
        const raw = s.reportedAt
        if (!raw) return false
        const ts = new Date(raw).getTime()
        if (!Number.isFinite(ts)) return false
        if (fromTs != null && ts < fromTs) return false
        if (toTs != null && ts > toTs) return false
        return true
      })
    }
    return list
  }, [nearMissSubmissions, activeBucketId, submissionFilter, submittedByFilter, search, submissionDateFrom, submissionDateTo])
  const awaitingApprovalRows = useMemo(() => {
    // Owner/HR dashboard card should reflect real submissions awaiting review,
    // not assignment records. Include legacy DHA rows and PDF rows in submitted states.
    const pdfRows = (dashboardPdfSubmissions ?? [])
      .filter((s) => s.status === 'SUBMITTED' || s.status === 'AWAITING_SIGNATURES')
      .map((s) => ({
        id: `pdf:${s.id}`,
        title: s.title || s.templateName || 'Untitled',
        submitter: s.submittedBy?.displayName || '—',
        submittedAt: s.submittedAt || s.createdAt || '',
        to: `/forms/${s.id}`,
      }))
    const dhaRows = (dailyHazardSubmissions ?? [])
      .filter((s) => !s.approved)
      .map((s) => ({
        id: `dha:${s.id}`,
        title: s.projectTitle || 'Daily Hazard Analysis',
        submitter: s.submittedBy || '—',
        submittedAt: s.submittedAt || '',
        to: `/safety/daily-hazard-analysis/${s.id}?from=completed-forms`,
      }))
    return [...pdfRows, ...dhaRows]
      .sort((a, b) => {
        const ta = new Date(a.submittedAt || 0).getTime()
        const tb = new Date(b.submittedAt || 0).getTime()
        return tb - ta
      })
  }, [dashboardPdfSubmissions, dailyHazardSubmissions])
  const outstandingRows = useMemo(() => {
    const assignmentRows = outstandingAssignments.map((a) => ({
      id: `assignment:${a.id}`,
      title: a.templateName,
      who: a.assignedTo,
      to: a.submissionId ? `/forms/${a.submissionId}` : null,
    }))
    const resubmissionRows = (dashboardPdfSubmissions ?? [])
      .filter((s) => s.status === 'RESUBMIT_REQUIRED')
      .map((s) => ({
        id: `resubmit:${s.id}`,
        title: s.title || s.templateName || 'Untitled',
        who: s.submittedBy?.displayName || '—',
        to: `/forms/${s.id}`,
      }))
    return [...assignmentRows, ...resubmissionRows]
  }, [outstandingAssignments, dashboardPdfSubmissions])
  const sortedSubmissionRows = useMemo(() => {
    const rows: CombinedSubmissionRow[] = [
      ...filteredPdfSubmissions.map((s) => ({
        kind: 'pdf' as const,
        id: `pdf:${s.id}`,
        title: s.title || s.templateName || 'Untitled',
        templateName: s.templateName ?? '—',
        jobLabel:
          s.jobTitle || s.jobSiteName
            ? `${s.jobTitle ?? ''}${s.jobTitle && s.jobSiteName ? ' · ' : ''}${s.jobSiteName ?? ''}`.trim()
            : '—',
        submittedBy: s.submittedBy?.displayName ?? '—',
        submittedAt: s.submittedAt,
        createdAt: s.createdAt,
        status: s.status,
        resubmissionReason: s.resubmissionReason,
        raw: s,
      })),
      ...filteredDailyHazardSubmissions.map((s) => ({
        kind: 'dha' as const,
        id: `dha:${s.id}`,
        title: s.projectTitle ?? 'Daily Hazard Analysis',
        templateName: 'Daily Hazard Analysis',
        jobLabel: [s.siteName, s.jobNumber].filter(Boolean).join(' · ') || '—',
        submittedBy: s.submittedBy ?? '—',
        submittedAt: s.submittedAt,
        createdAt: s.submittedAt ?? '',
        status: (s.approved ? 'APPROVED' : 'SUBMITTED') as 'SUBMITTED' | 'APPROVED',
        raw: s,
      })),
      ...filteredNearMissSubmissions.map((s) => ({
        kind: 'near-miss' as const,
        id: `near-miss:${s.id}`,
        title: s.siteName ? `Near miss — ${s.siteName}` : 'Near Miss Report',
        templateName: 'Near Miss Form',
        jobLabel: s.siteName || '—',
        submittedBy: s.reportedBy ?? '—',
        submittedAt: s.reportedAt,
        createdAt: s.reportedAt ?? '',
        status: s.status === 'closed' ? 'closed' : 'open',
        raw: s,
      })),
    ]

    const getValue = (s: CombinedSubmissionRow, key: SubmissionSortKey): string | number => {
      if (key === 'title') return s.title.trim().toLowerCase()
      if (key === 'template') return s.templateName.trim().toLowerCase()
      if (key === 'job') return s.jobLabel.trim().toLowerCase()
      if (key === 'submittedBy') return s.submittedBy.trim().toLowerCase()
      if (key === 'submittedAt') {
        const ts = new Date(s.submittedAt ?? s.createdAt ?? 0).getTime()
        return Number.isFinite(ts) ? ts : 0
      }
      return (s.status ?? '').trim().toLowerCase()
    }

    rows.sort((a, b) => {
      const av = getValue(a, submissionSort.key)
      const bv = getValue(b, submissionSort.key)
      let cmp = 0
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv
      } else {
        cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
      }
      return submissionSort.direction === 'asc' ? cmp : -cmp
    })
    return rows
  }, [filteredPdfSubmissions, filteredDailyHazardSubmissions, filteredNearMissSubmissions, submissionSort])
  const sortedPdfSubmissions = useMemo(() => {
    const getValue = (s: PdfSubmissionRecord, key: SubmissionSortKey): string | number => {
      if (key === 'title') return (s.title ?? s.templateName ?? '').trim().toLowerCase()
      if (key === 'template') return (s.templateName ?? '').trim().toLowerCase()
      if (key === 'job') return `${s.jobTitle ?? ''} ${s.jobSiteName ?? ''}`.trim().toLowerCase()
      if (key === 'submittedBy') return (s.submittedBy?.displayName ?? '').trim().toLowerCase()
      if (key === 'submittedAt') {
        const ts = new Date(s.submittedAt ?? s.createdAt ?? 0).getTime()
        return Number.isFinite(ts) ? ts : 0
      }
      return (s.status ?? '').trim().toLowerCase()
    }

    const sorted = [...filteredPdfSubmissions]
    sorted.sort((a, b) => {
      const av = getValue(a, submissionSort.key)
      const bv = getValue(b, submissionSort.key)
      let cmp = 0
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv
      } else {
        cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
      }
      return submissionSort.direction === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredPdfSubmissions, submissionSort])
  const exportRowsInCurrentResults = useMemo(
    () => sortedSubmissionRows.filter((row) => canExportSubmissionRow(row)),
    [sortedSubmissionRows]
  )
  const selectedExportCount = useMemo(
    () => selectedExportSubmissionIds.filter((id) => exportRowsInCurrentResults.some((s) => s.id === id)).length,
    [selectedExportSubmissionIds, exportRowsInCurrentResults]
  )
  const allExportRowsSelected =
    exportRowsInCurrentResults.length > 0 &&
    exportRowsInCurrentResults.every((row) => selectedExportSubmissionIds.includes(row.id))
  const draftRowsInCurrentResults = useMemo(
    () =>
      filteredPdfSubmissions.filter(
        (s) => s.status === 'DRAFT' && !isWashroomDraftForMyDraftsList(s.templateName)
      ),
    [filteredPdfSubmissions]
  )
  const selectedDraftCount = useMemo(
    () => selectedDraftIds.filter((id) => draftRowsInCurrentResults.some((s) => s.id === id)).length,
    [selectedDraftIds, draftRowsInCurrentResults]
  )
  const allDraftsSelected =
    draftRowsInCurrentResults.length > 0 && draftRowsInCurrentResults.every((s) => selectedDraftIds.includes(s.id))
  const submissionFilterToBackendStatus: Record<SubmissionFilter, string> = {
    all: '',
    draft: 'DRAFT',
    submitted: 'SUBMITTED',
    approved: 'APPROVED',
    rejected: 'REJECTED',
    archived: 'ARCHIVED',
    pending_site_signatures: 'AWAITING_SIGNATURES',
    resubmit_required: 'RESUBMIT_REQUIRED',
  }
  const filteredSubmissions = useMemo(() => {
    let list = baseSubmissions
    if (submissionFilter !== 'all') {
      const statusValue = submissionFilterToBackendStatus[submissionFilter]
      list = list.filter((f) => f.status === statusValue)
    }
    if (search.trim()) list = list.filter((f) => (f.templateName ?? '').toLowerCase().includes(search.trim().toLowerCase()))
    return list
  }, [baseSubmissions, submissionFilter, search])

  useEffect(() => {
    // Keep selection aligned with currently visible draft rows only.
    setSelectedDraftIds((prev) => prev.filter((id) => draftRowsInCurrentResults.some((s) => s.id === id)))
  }, [draftRowsInCurrentResults])
  useEffect(() => {
    // Keep export selection aligned with currently visible non-draft rows only.
    setSelectedExportSubmissionIds((prev) => prev.filter((id) => exportRowsInCurrentResults.some((row) => row.id === id)))
  }, [exportRowsInCurrentResults])

  const toggleDraftSelection = (submissionId: string, checked: boolean) => {
    setSelectedDraftIds((prev) => {
      if (checked) return prev.includes(submissionId) ? prev : [...prev, submissionId]
      return prev.filter((id) => id !== submissionId)
    })
  }

  const toggleSelectAllDrafts = (checked: boolean) => {
    if (!checked) {
      setSelectedDraftIds([])
      return
    }
    setSelectedDraftIds(draftRowsInCurrentResults.map((s) => s.id))
  }

  const toggleExportSelection = (submissionId: string, checked: boolean) => {
    setSelectedExportSubmissionIds((prev) => {
      if (checked) return prev.includes(submissionId) ? prev : [...prev, submissionId]
      return prev.filter((id) => id !== submissionId)
    })
  }

  const toggleSelectAllExportRows = (checked: boolean) => {
    if (!checked) {
      setSelectedExportSubmissionIds([])
      return
    }
    setSelectedExportSubmissionIds(exportRowsInCurrentResults.map((row) => row.id))
  }

  const exportSelectedSubmissionsAsOnePdf = async () => {
    if (selectedExportSubmissionIds.length === 0) return
    setExportingSelected(true)
    try {
      const blob = await exportMergedPdfSubmissions(selectedExportSubmissionIds)
      const dateStamp = new Date().toISOString().slice(0, 10)
      downloadBlob(blob, `completed-forms-${dateStamp}.pdf`)
    } catch (e: any) {
      alert(e?.message || 'Failed to export selected submissions as one PDF.')
    } finally {
      setExportingSelected(false)
    }
  }

  const toggleSubmissionSort = (key: SubmissionSortKey) => {
    setSubmissionSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, direction: 'asc' }
    })
  }

  const sortArrowFor = (key: SubmissionSortKey) => {
    if (submissionSort.key !== key) return '↕'
    return submissionSort.direction === 'asc' ? '↑' : '↓'
  }

  const deleteSelectedDrafts = async () => {
    if (selectedDraftIds.length === 0) return
    if (!window.confirm(`Delete ${selectedDraftIds.length} selected draft${selectedDraftIds.length === 1 ? '' : 's'}? This cannot be undone.`)) return
    setDeletingDrafts(true)
    try {
      await deleteDraftPdfSubmissions(selectedDraftIds)
      setSelectedDraftIds([])
      await loadPdfSubmissions()
    } catch {
      alert('Failed to delete selected drafts.')
    } finally {
      setDeletingDrafts(false)
    }
  }

  const visibleDocs = useMemo(
    () => documents.filter((d) => canUserViewDocument(d, user ?? null)),
    [documents, user]
  )
  const filteredDocs = useMemo(() => {
    let list = visibleDocs
    if (docTypeFilter !== 'all') list = list.filter((d) => d.type === docTypeFilter)
    if (docSiteFilter !== 'all') list = list.filter((d) => d.siteName === docSiteFilter)
    return list
  }, [visibleDocs, docTypeFilter, docSiteFilter])
  const docTypes = Array.from(new Set(visibleDocs.map((d) => d.type)))
  const docSites = Array.from(new Set(visibleDocs.map((d) => d.siteName).filter(Boolean))) as string[]

  const signingRequests = useMemo(() => {
    const isSigner = (r: { requiredSigners: { userId?: string; name?: string }[] }) =>
      r.requiredSigners.some((s) => s.userId === user?.id || s.name === user?.name)
    return isLabourer ? signingRequestsFromApi.filter(isSigner) : signingRequestsFromApi
  }, [user, isLabourer, signingRequestsFromApi])

  const siteMeetingFormsAwaitingMySignature = useMemo(() => {
    if (!user?.id) return []
    return formSubmissions.filter(
      (s) =>
        s.workflowType === 'site_meeting' &&
        s.status === 'pending_site_signatures' &&
        s.siteSignerIds?.includes(user.id) &&
        !s.siteSignatures?.some((sig) => sig.userId === user.id)
    )
  }, [formSubmissions, user?.id])

  const signableFormsAwaitingMySignature = useMemo(() => {
    if (!user?.id) return []
    return signableSubmissions.filter((s) => {
      if (s.workflowType !== 'site_meeting' || !s.siteSignerIds?.includes(user.id)) return false
      if (s.siteSignatures?.some((sig) => sig.userId === user.id)) return false
      const signerIds = s.siteSignerIds
      const lastIdx = signerIds.length - 1
      if (user.id === signerIds[lastIdx]) return (s.siteSignatures?.length ?? 0) >= signerIds.length - 1 || s.submittedById === user.id
      return true
    })
  }, [signableSubmissions, user?.id])

  const signingSearchLower = signingSearch.trim().toLowerCase()
  const filteredSiteMeetingSigning = useMemo(() => {
    if (!signingSearchLower) return siteMeetingFormsAwaitingMySignature
    return siteMeetingFormsAwaitingMySignature.filter((s) => s.templateName?.toLowerCase().includes(signingSearchLower))
  }, [siteMeetingFormsAwaitingMySignature, signingSearchLower])
  const filteredSignableFormsSigning = useMemo(() => {
    if (!signingSearchLower) return signableFormsAwaitingMySignature
    return signableFormsAwaitingMySignature.filter((s) => s.templateName?.toLowerCase().includes(signingSearchLower))
  }, [signableFormsAwaitingMySignature, signingSearchLower])
  const filteredSigningRequests = useMemo(() => {
    if (!signingSearchLower) return signingRequests
    return signingRequests.filter((r) => r.documentName?.toLowerCase().includes(signingSearchLower))
  }, [signingRequests, signingSearchLower])
  const filteredPendingPdfSignatureSubmissions = useMemo(() => {
    const mine = pendingSignatureSubmissions.filter((s) => s.needsMySignature)
    if (!signingSearchLower) return mine
    return mine.filter((s) => (s.title ?? s.templateName ?? '').toLowerCase().includes(signingSearchLower))
  }, [pendingSignatureSubmissions, signingSearchLower])

  const setSubmissionFilter = (f: SubmissionFilter) => {
    setSearchParams((p) => {
      const next: Record<string, string> = { ...Object.fromEntries(p), view: 'submissions' }
      next.status = f
      return next
    })
    setSubmittedByFilter('')
  }

  const formBoxes = useMemo((): LibraryFormCard[] => {
    const matchedTemplateIds = new Set<string>()
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://'

    const baseBoxes = FORM_BOXES.map((box) => {
      if (box.staticTo) {
        const candidates = pdfTemplates.filter((t) => {
          const name = (t.name ?? '').trim()
          if (!name || !box.templateNamePatterns?.length) return false
          return box.templateNamePatterns.some((pattern) => pattern.test(name))
        })

        const customMatch = candidates.find((t) => String(t.filePath ?? '').startsWith(CUSTOM_TEMPLATE_PREFIX))
        const match = customMatch ?? candidates[0]

        if (match) candidates.forEach((t) => matchedTemplateIds.add(t.id))

        return {
          ...box,
          resolvedTo: box.staticTo,
          templateId: match?.id,
          isConfigured: true,
          isUploadCard: false,
        }
      }

      const candidates = pdfTemplates.filter((t) => {
        const name = (t.name ?? '').trim()
        if (!name || !box.templateNamePatterns?.length) return false
        return box.templateNamePatterns.some((pattern) => pattern.test(name))
      })

      const customMatch = candidates.find((t) => String(t.filePath ?? '').startsWith(CUSTOM_TEMPLATE_PREFIX))
      const match = customMatch ?? candidates[0]

      // If a template matches one of our fixed hub tiles (e.g. Weekly Inspections),
      // we don't want to show it again in the "additional templates" section.
      // Mark *all* matching candidates as used, not just the one we selected.
      if (match) candidates.forEach((t) => matchedTemplateIds.add(t.id))

      const isDhaBox = /daily\s*hazard/i.test(box.label)
      return {
        ...box,
        resolvedTo: match
          ? `/forms/new/${match.id}${isDhaBox ? '?new=1' : ''}`
          : isOwnerOrHr
            ? '/library/upload'
            : undefined,
        templateId: match?.id,
        isConfigured: Boolean(match),
        isUploadCard: false,
      }
    })

    const additionalTemplateBoxes = pdfTemplates
      .filter((t) => !matchedTemplateIds.has(t.id))
      .map((t) => {
        const label = /\bform\b/i.test(t.name ?? '') ? (t.name ?? 'Custom Form') : `${t.name ?? 'Custom'} Form`
        const isNicheBakery = /niche/i.test(t.name ?? '') && /water\s*softener|air\s*seporators|air\s*separators|buffer\s*tanks|expansion\s*tanks|pumps|bakery/i.test(t.name ?? '')
        return {
          label,
          description: 'Start this custom form template.',
          icon: '📝',
          resolvedTo: `/forms/new/${t.id}`,
          templateId: t.id,
          isConfigured: true,
          isUploadCard: false,
          formFrequency: inferFormFrequencyForTemplateName(t.name ?? ''),
          tags: isNicheBakery ? (['niche_bakery'] as FormTag[]) : undefined,
        }
      })

    const uploadCard = isOwnerOrHr
      ? [{
        label: 'Add New Form',
        description: 'Create a new custom form template with native fields.',
        icon: '⬆️',
        resolvedTo: '/library/upload',
        templateId: undefined as string | undefined,
        isConfigured: true,
        isUploadCard: true,
        formFrequency: 'other' as FormFrequency,
      }]
      : []

    const subcontractorOfflineCard = isSupervisorOrAbove
      ? [{
        label: 'Subcontractor Form Uploads (offline)',
        description:
          'Store PDFs or images of forms you get from subcontractors (they are not on this platform). Title each file.',
        icon: '📥',
        resolvedTo: '/library/subcontractor-offline-uploads',
        seeUploadsTo: '/library/subcontractor-offline-uploads',
        templateId: undefined as string | undefined,
        isConfigured: true,
        isUploadCard: true,
        formFrequency: 'when_needed' as FormFrequency,
      }]
      : []

    return [...baseBoxes, ...additionalTemplateBoxes, ...uploadCard, ...subcontractorOfflineCard]
  }, [isOwnerOrHr, isSupervisorOrAbove, pdfTemplates])

  const filteredFormBoxes = useMemo(() => {
    let list = formBoxes
    if (formTagFilter !== 'all') {
      list = list.filter((b) => b.tags?.includes(formTagFilter))
    }
    if (formFrequencyFilter === 'all') return list
    return list.filter((b) => b.formFrequency === formFrequencyFilter)
  }, [formBoxes, formTagFilter, formFrequencyFilter])
  const completedFormBucketsForRole = useMemo(
    () =>
      COMPLETED_FORMS_BUCKETS.filter((bucket) => {
        if (!bucket.roles || !user?.role) return true
        return bucket.roles.includes(user.role as 'owner' | 'hr' | 'supervisor' | 'labourer')
      }),
    [user?.role]
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">
            {pageTitle}
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            {pageSubtitle}
          </p>
        </div>
        {view === 'documents' && isOwnerOrHr && (
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link to="/library/upload-document">
              <Button variant="secondary" size="sm" leftIcon={<UploadIcon />}>Upload Document</Button>
            </Link>
            <Button variant="secondary" size="sm" className="no-print" leftIcon={<IconDownload />} onClick={() => window.print()}>
              Save / Print as PDF
            </Button>
          </div>
        )}
        {view === 'documents' && !isOwnerOrHr && (
          <Button variant="secondary" size="sm" className="no-print shrink-0" leftIcon={<IconDownload />} onClick={() => window.print()}>
            Save / Print as PDF
          </Button>
        )}
      </div>

      {view !== 'templates' && showBackLink && (
        <div>
          <Link to={backLinkTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">
            ← {backLinkLabel}
          </Link>
        </div>
      )}

      {message && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          {message}
        </div>
      )}

      {/* Templates: hub grid (same layout as Health & Safety) + uploaded PDF templates list */}
      {view === 'templates' && (
        <>
          <div
            className="flex flex-wrap gap-2 items-center"
            role="group"
            aria-label="Filter forms by how often they are typically used"
          >
            {FORM_FREQUENCY_FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setFormFrequencyFilter(id)}
                aria-pressed={formFrequencyFilter === id}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  formFrequencyFilter === id
                    ? 'bg-brand-600 text-white border-brand-600 dark:bg-brand-500 dark:border-brand-500'
                    : 'bg-white dark:bg-neutral-800/90 text-neutral-700 dark:text-neutral-200 border-neutral-200 dark:border-neutral-600 hover:border-brand-400/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            className="flex flex-wrap gap-2 items-center"
            role="group"
            aria-label="Filter forms by tag"
          >
            {FORM_TAG_FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setFormTagFilter(id)
                  setSearchParams((p) => {
                    const next = new URLSearchParams(p)
                    if (id === 'all') next.delete('tag')
                    else next.set('tag', id)
                    return next
                  })
                }}
                aria-pressed={formTagFilter === id}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  formTagFilter === id
                    ? 'bg-brand-600 text-white border-brand-600 dark:bg-brand-500 dark:border-brand-500'
                    : 'bg-white dark:bg-neutral-800/90 text-neutral-700 dark:text-neutral-200 border-neutral-200 dark:border-neutral-600 hover:border-brand-400/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {filteredFormBoxes.length === 0 ? (
            <Card padding="lg">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">No forms in this category. Try another filter or choose All.</p>
            </Card>
          ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredFormBoxes.map((action) => (
              <Card key={`${action.label}-${action.templateId ?? action.resolvedTo ?? 'none'}`} hover padding="lg" className="h-full min-h-[200px] flex flex-col">
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-2xl mb-2 block" aria-hidden>{action.icon}</span>
                  <CardHeader className="p-0">{action.label}</CardHeader>
                  <CardDescription className="mt-1 flex-1">{action.description}</CardDescription>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {action.resolvedTo ? (
                      <Link to={action.resolvedTo}>
                        <Button variant="outline" size="sm" className="w-fit">
                          {action.isUploadCard ? 'Upload' : action.isConfigured ? 'Start' : 'Set up'}
                        </Button>
                      </Link>
                    ) : (
                      <Button variant="outline" size="sm" className="w-fit" disabled>
                        Not available
                      </Button>
                    )}
                    {action.isUploadCard && action.seeUploadsTo && (
                      <Link to={action.seeUploadsTo}>
                        <Button variant="outline" size="sm" className="w-fit">
                          See Uploads
                        </Button>
                      </Link>
                    )}
                    {isOwnerOrHr && action.templateId && (
                      <Link to={(pdfTemplates.find((t) => t.id === action.templateId)?.filePath ?? '').startsWith('custom-form://')
                        ? `/library/upload?templateId=${action.templateId}`
                        : `/library/template/${action.templateId}/edit`}>
                        <Button variant="outline" size="sm" className="w-fit">Edit Template</Button>
                      </Link>
                    )}
                    {isOwnerOrHr && action.templateId && (
                      <button
                        type="button"
                        title="Delete template"
                        className="shrink-0 min-w-[36px] min-h-[36px] px-3 flex items-center justify-center rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 hover:border-red-300 dark:hover:border-red-700 transition-colors text-sm font-medium"
                        onClick={async () => {
                          if (!action.templateId) return
                          const templateName = pdfTemplates.find((t) => t.id === action.templateId)?.name ?? action.label
                          if (!window.confirm(`Are you sure you want to delete "${templateName}"? This cannot be undone.`)) return
                          try {
                            await deletePdfTemplate(action.templateId)
                            setPdfTemplates((prev) => prev.filter((t) => t.id !== action.templateId))
                          } catch {
                            alert('Failed to delete template.')
                          }
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>

                </div>
              </Card>
            ))}
          </div>
          )}

          {/* Assigned forms for labourers */}
          {isLabourer && pendingAssignments.length > 0 && (
            <Card padding="md" className="border-l-4 border-amber-500">
              <h3 className="font-semibold text-neutral-900 dark:text-white mb-2">Assigned to You ({pendingAssignments.length})</h3>
              <ul className="space-y-2">
                {pendingAssignments.map((a) => (
                  <li key={a.id}>
                    <Link to={`/forms/new/${a.templateId}?assignmentId=${a.id}`}>
                      <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                        <div>
                          <span className="font-medium text-neutral-900 dark:text-white">{a.templateName}</span>
                          {a.dueDate && (
                            <span className={`ml-2 text-xs ${new Date(a.dueDate) < new Date() ? 'text-red-600' : 'text-neutral-500'}`}>
                              Due {new Date(a.dueDate).toLocaleDateString()}
                            </span>
                          )}
                          {a.note && <p className="text-xs text-neutral-500 mt-0.5">{a.note}</p>}
                        </div>
                        <Badge variant={a.status === 'resubmission_required' ? 'danger' : 'warning'}>
                          {a.status === 'resubmission_required' ? 'Resubmit' : 'Pending'}
                        </Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* Submissions */}
      {view === 'submissions' && (
        <>
          {/* Owner/HR: form assignment windows (impending, outstanding, awaiting approval) + assignee filter */}
          {isOwnerOrHr && (
            <div className="space-y-4 mb-6">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Assigned To</label>
                <select
                  value={assigneeFilter}
                  onChange={(e) => setAssigneeFilter(e.target.value)}
                  className="min-h-[40px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm min-w-[180px]"
                  aria-label="Filter by assignee"
                >
                  <option value="">All</option>
                  {assigneeOptions.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card padding="md" className="border-amber-200 dark:border-amber-800">
                  <CardHeader className="text-sm">Impending Submission</CardHeader>
                  <CardDescription>Due within 7 days, not yet submitted</CardDescription>
                  <ul className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                    {impendingAssignments.length === 0 ? <li className="text-sm text-neutral-500">None</li> : impendingAssignments.slice(0, 10).map((a) => (
                      <li key={a.id} className="text-sm flex justify-between gap-2">
                        <span className="truncate">{a.templateName}</span>
                        <span className="text-neutral-500 shrink-0">{a.assignedTo}{a.dueDate ? ` · ${a.dueDate}` : ''}</span>
                      </li>
                    ))}
                    {impendingAssignments.length > 10 && <li className="text-xs text-neutral-500">+{impendingAssignments.length - 10} more</li>}
                  </ul>
                </Card>
                <Card padding="md" className="border-slate-200 dark:border-slate-600">
                  <CardHeader className="text-sm">Outstanding</CardHeader>
                  <CardDescription>Pending, in progress, or resubmission required</CardDescription>
                  <ul className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                    {outstandingRows.length === 0 ? <li className="text-sm text-neutral-500">None</li> : outstandingRows.slice(0, 10).map((row) => (
                      <li key={row.id} className="text-sm flex justify-between gap-2">
                        {row.to ? (
                          <Link to={row.to} className="truncate text-brand-600 dark:text-brand-400 hover:underline">{row.title}</Link>
                        ) : (
                          <span className="truncate">{row.title}</span>
                        )}
                        <span className="text-neutral-500 shrink-0">{row.who}</span>
                      </li>
                    ))}
                    {outstandingRows.length > 10 && <li className="text-xs text-neutral-500">+{outstandingRows.length - 10} more</li>}
                  </ul>
                </Card>
                <Card padding="md" className="border-brand-200 dark:border-brand-800">
                  <CardHeader className="text-sm">Awaiting Your Approval</CardHeader>
                  <CardDescription>Submitted, needs review</CardDescription>
                  <ul className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                    {awaitingApprovalRows.length === 0 ? <li className="text-sm text-neutral-500">None</li> : awaitingApprovalRows.slice(0, 10).map((row) => (
                      <li key={row.id} className="text-sm flex justify-between gap-2">
                        <Link to={row.to} className="truncate text-brand-600 dark:text-brand-400 hover:underline">{row.title}</Link>
                        <span className="text-neutral-500 shrink-0">{row.submitter}</span>
                      </li>
                    ))}
                    {awaitingApprovalRows.length > 10 && <li className="text-xs text-neutral-500">+{awaitingApprovalRows.length - 10} more</li>}
                  </ul>
                </Card>
              </div>
            </div>
          )}

          {/* Supervisor: submissions awaiting review */}
          {isSupervisorOrAbove && reviewAssignments.length > 0 && (
            <Card padding="md" className="border-l-4 border-brand-500 mb-4">
              <h3 className="font-semibold text-neutral-900 dark:text-white mb-2">Submissions Awaiting Your Review ({reviewAssignments.length})</h3>
              <ul className="space-y-3">
                {reviewAssignments.map((a) => (
                  <li key={a.id} className="py-3 px-4 rounded-xl bg-neutral-50 dark:bg-neutral-700/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-neutral-900 dark:text-white">{a.templateName}</p>
                        <p className="text-sm text-neutral-500">Submitted by {a.assignedTo} · {new Date(a.updatedAt).toLocaleDateString()}</p>
                      </div>
                      {a.submissionId && (
                        <Link to={`/forms/${a.submissionId}`}>
                          <Button variant="outline" size="sm">View Submission</Button>
                        </Link>
                      )}
                    </div>
                    {reviewingId === a.id ? (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          placeholder="Optional review comment..."
                          rows={2}
                          className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleReview(a.id, 'reviewed')}>Approve</Button>
                          <Button size="sm" variant="danger" onClick={() => handleReview(a.id, 'resubmission_required')}>Request Resubmission</Button>
                          <Button size="sm" variant="secondary" onClick={() => { setReviewingId(null); setReviewComment('') }}>Cancel Review</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setReviewingId(a.id)}>Review Submission</Button>
                        <Button size="sm" onClick={() => handleForwardToHR(a.id)}>Forward to HR</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card padding="lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardHeader>Submissions</CardHeader>
                <CardDescription>All form submissions. Search by title or template; filter by status or submitter. Click a row to view.</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSubmissionsMinimized((prev) => !prev)}
                aria-expanded={!submissionsMinimized}
                aria-controls="submissions-panel-content"
                className="shrink-0"
              >
                {submissionsMinimized ? 'Expand' : 'Minimize'}
              </Button>
            </div>
            {!submissionsMinimized && (
              <div id="submissions-panel-content">
            {activeBucket && (
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="info">Bucket: {activeBucket.label}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchParams((p) => {
                      const next = new URLSearchParams(p)
                      next.delete('bucket')
                      next.set('view', 'submissions')
                      return next
                    })
                  }}
                >
                  Clear bucket
                </Button>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                type="search"
                placeholder="Search by title or template..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-[40px] flex-1 min-w-[200px] max-w-sm rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                aria-label="Search by title"
              />
              <select
                value={submissionFilter}
                onChange={(e) => setSubmissionFilter(e.target.value as SubmissionFilter)}
                className="min-h-[40px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm min-w-[140px]"
                aria-label="Filter by status"
              >
                {(['submitted', 'resubmit_required', 'all', 'draft', 'approved', 'rejected', 'archived', 'pending_site_signatures'] as SubmissionFilter[]).map((f) => (
                  <option key={f} value={f}>
                    {f === 'pending_site_signatures'
                      ? 'Pending site signatures'
                      : f === 'submitted'
                        ? 'Pending approval'
                        : f === 'resubmit_required'
                          ? 'Resubmission required'
                          : f.charAt(0).toUpperCase() + f.slice(1)}
                  </option>
                ))}
              </select>
              {isOwnerOrHr && (
                <select
                  value={submittedByFilter}
                  onChange={(e) => setSubmittedByFilter(e.target.value)}
                  className="min-h-[40px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm min-w-[160px]"
                  aria-label="Filter by submitter"
                >
                  <option value="">All submitters</option>
                  {submittersList.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              )}
              <input
                type="date"
                value={submissionDateFrom}
                onChange={(e) => setSubmissionDateFrom(e.target.value)}
                className="min-h-[40px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                aria-label="Filter submissions from date"
                title="From date"
              />
              <input
                type="date"
                value={submissionDateTo}
                onChange={(e) => setSubmissionDateTo(e.target.value)}
                className="min-h-[40px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                aria-label="Filter submissions to date"
                title="To date"
              />
              {(submissionDateFrom || submissionDateTo) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSubmissionDateFrom('')
                    setSubmissionDateTo('')
                  }}
                >
                  Clear dates
                </Button>
              )}
              {exportRowsInCurrentResults.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void exportSelectedSubmissionsAsOnePdf()}
                  disabled={selectedExportCount === 0 || exportingSelected}
                >
                  {exportingSelected
                    ? 'Exporting PDF...'
                    : selectedExportCount > 0
                      ? `Export Selected to 1 PDF (${selectedExportCount})`
                      : 'Export Selected to 1 PDF'}
                </Button>
              )}
              {draftRowsInCurrentResults.length > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void deleteSelectedDrafts()}
                  disabled={selectedDraftCount === 0 || deletingDrafts}
                >
                  {deletingDrafts
                    ? 'Deleting drafts...'
                    : selectedDraftCount > 0
                      ? `Delete Selected Drafts (${selectedDraftCount})`
                      : 'Delete Selected Drafts'}
                </Button>
              )}
            </div>
            {loadingSubmissions ? (
              <p className="mt-4 text-sm text-neutral-500">Loading…</p>
            ) : sortedSubmissionRows.length === 0 ? (
              <div className="mt-6">
                <EmptyState title="No submissions yet." description="Fill a form from the Templates tab to create one, or try changing the status filter or search." />
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-600">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-600 bg-neutral-50 dark:bg-neutral-800/80">
                      <th className="py-3 px-4 font-medium text-neutral-600 dark:text-neutral-400 w-10">
                        {draftRowsInCurrentResults.length > 0 ? (
                          <input
                            type="checkbox"
                            aria-label="Select all draft submissions"
                            checked={allDraftsSelected}
                            onChange={(e) => toggleSelectAllDrafts(e.target.checked)}
                            className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600"
                          />
                        ) : null}
                      </th>
                      <th className="py-3 px-4 font-medium text-neutral-600 dark:text-neutral-400">
                        <button type="button" onClick={() => toggleSubmissionSort('title')} className="inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-white">
                          <span>Title</span>
                          <span aria-hidden>{sortArrowFor('title')}</span>
                        </button>
                      </th>
                      <th className="py-3 px-4 font-medium text-neutral-600 dark:text-neutral-400">
                        <button type="button" onClick={() => toggleSubmissionSort('template')} className="inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-white">
                          <span>Template</span>
                          <span aria-hidden>{sortArrowFor('template')}</span>
                        </button>
                      </th>
                      <th className="py-3 px-4 font-medium text-neutral-600 dark:text-neutral-400">
                        <button type="button" onClick={() => toggleSubmissionSort('job')} className="inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-white">
                          <span>Job</span>
                          <span aria-hidden>{sortArrowFor('job')}</span>
                        </button>
                      </th>
                      <th className="py-3 px-4 font-medium text-neutral-600 dark:text-neutral-400">
                        <button type="button" onClick={() => toggleSubmissionSort('submittedBy')} className="inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-white">
                          <span>Submitted By</span>
                          <span aria-hidden>{sortArrowFor('submittedBy')}</span>
                        </button>
                      </th>
                      <th className="py-3 px-4 font-medium text-neutral-600 dark:text-neutral-400">
                        <button type="button" onClick={() => toggleSubmissionSort('submittedAt')} className="inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-white">
                          <span>Submitted At</span>
                          <span aria-hidden>{sortArrowFor('submittedAt')}</span>
                        </button>
                      </th>
                      <th className="py-3 px-4 font-medium text-neutral-600 dark:text-neutral-400">
                        <button type="button" onClick={() => toggleSubmissionSort('status')} className="inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-white">
                          <span>Status</span>
                          <span aria-hidden>{sortArrowFor('status')}</span>
                        </button>
                      </th>
                      <th className="py-3 px-4 font-medium text-neutral-600 dark:text-neutral-400 w-16">
                        {exportRowsInCurrentResults.length > 0 ? (
                          <input
                            type="checkbox"
                            aria-label="Select all completed submissions for export"
                            checked={allExportRowsSelected}
                            onChange={(e) => toggleSelectAllExportRows(e.target.checked)}
                            className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600"
                          />
                        ) : null}
                      </th>
                      <th className="py-3 px-4 font-medium text-neutral-600 dark:text-neutral-400 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSubmissionRows.map((s) => (
                      <tr key={s.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                        <td className="py-3 px-4">
                          {s.kind === 'pdf' && s.status === 'DRAFT' ? (
                            <input
                              type="checkbox"
                              aria-label={`Select draft ${s.title || s.templateName || s.raw.id}`}
                              checked={selectedDraftIds.includes(s.raw.id)}
                              onChange={(e) => toggleDraftSelection(s.raw.id, e.target.checked)}
                              className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600"
                            />
                          ) : null}
                        </td>
                        <td className="py-3 px-4">
                          {s.kind === 'pdf' && (s.status === 'DRAFT' || s.status === 'RESUBMIT_REQUIRED') ? (
                            <Link
                              to={`/forms/new/${s.raw.templateId}${s.raw.jobId ? `?jobId=${encodeURIComponent(s.raw.jobId)}&draftId=${encodeURIComponent(s.raw.id)}` : `?draftId=${encodeURIComponent(s.raw.id)}`}`}
                              className="font-medium text-neutral-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400"
                            >
                              {s.title}
                            </Link>
                          ) : (
                            s.kind === 'pdf' ? (
                              <Link to={`/forms/${s.raw.id}`} className="font-medium text-neutral-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400">
                                {s.title}
                              </Link>
                            ) : s.kind === 'near-miss' ? (
                              <Link to={`/safety/near-miss/${s.raw.id}?from=completed-forms`} className="font-medium text-neutral-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400">
                                {s.title}
                              </Link>
                            ) : (
                              <Link to={`/safety/daily-hazard-analysis/${s.raw.id}?from=completed-forms`} className="font-medium text-neutral-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400">
                                {s.title}
                              </Link>
                            )
                          )}
                        </td>
                        <td className="py-3 px-4 text-neutral-700 dark:text-neutral-300">{s.templateName}</td>
                        <td className="py-3 px-4 text-sm text-neutral-700 dark:text-neutral-300">
                          {s.jobLabel}
                        </td>
                        <td className="py-3 px-4 text-neutral-700 dark:text-neutral-300">{s.submittedBy}</td>
                        <td className="py-3 px-4 text-sm text-neutral-500">
                          {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : s.createdAt ? new Date(s.createdAt).toLocaleString() : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={
                              s.status === 'APPROVED' || s.status === 'closed'
                                ? 'success'
                                : s.status === 'SUBMITTED' || s.status === 'open' || s.status === 'under-review'
                                  ? 'info'
                                  : s.status === 'AWAITING_SIGNATURES'
                                    ? 'warning'
                                    : s.status === 'RESUBMIT_REQUIRED'
                                      ? 'danger'
                                      : 'default'
                            }
                          >
                            {s.kind === 'near-miss'
                              ? s.status === 'closed'
                                ? 'Closed'
                                : s.status === 'under-review'
                                  ? 'Under review'
                                  : 'Open'
                              : s.status === 'SUBMITTED'
                                ? 'Pending approval'
                                : s.status === 'AWAITING_SIGNATURES'
                                  ? 'Awaiting signatures'
                                  : s.status === 'RESUBMIT_REQUIRED'
                                    ? 'Resubmission required'
                                    : s.status}
                          </Badge>
                          {s.kind === 'pdf' && s.status === 'RESUBMIT_REQUIRED' && s.resubmissionReason ? (
                            <p className="mt-1 text-xs text-red-600 dark:text-red-400 max-w-[240px] whitespace-pre-wrap">
                              {s.resubmissionReason}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-3 px-4">
                          {canExportSubmissionRow(s) ? (
                            <input
                              type="checkbox"
                              aria-label={`Select ${s.title || s.templateName || s.id} for export`}
                              checked={selectedExportSubmissionIds.includes(s.id)}
                              onChange={(e) => toggleExportSelection(s.id, e.target.checked)}
                              className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600"
                            />
                          ) : null}
                        </td>
                        <td className="py-3 px-4">
                          {s.kind === 'pdf' && (s.status === 'DRAFT' || s.status === 'RESUBMIT_REQUIRED') ? (
                            <Link
                              to={`/forms/new/${s.raw.templateId}${s.raw.jobId ? `?jobId=${encodeURIComponent(s.raw.jobId)}&draftId=${encodeURIComponent(s.raw.id)}` : `?draftId=${encodeURIComponent(s.raw.id)}`}`}
                              className="text-brand-600 dark:text-brand-400 hover:underline text-sm font-medium"
                            >
                              {s.status === 'RESUBMIT_REQUIRED' ? 'Resubmit' : 'Edit'}
                            </Link>
                          ) : (
                            s.kind === 'pdf' ? (
                              <Link to={`/forms/${s.raw.id}`} className="text-brand-600 dark:text-brand-400 hover:underline text-sm font-medium">View</Link>
                            ) : s.kind === 'near-miss' ? (
                              <Link to={`/safety/near-miss/${s.raw.id}?from=completed-forms`} className="text-brand-600 dark:text-brand-400 hover:underline text-sm font-medium">View</Link>
                            ) : (
                              <Link to={`/safety/daily-hazard-analysis/${s.raw.id}?from=completed-forms`} className="text-brand-600 dark:text-brand-400 hover:underline text-sm font-medium">View</Link>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
              </div>
            )}
          </Card>
          {from === 'safety' && completedFormBucketsForRole.length > 0 && (
            <section className="space-y-3 mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Completed Form Buckets</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {completedFormBucketsForRole.map((bucket) => (
                  <Card key={bucket.label} hover padding="lg" className="h-full min-h-[180px] flex flex-col">
                    <Link to={bucket.to} className="flex flex-col flex-1 min-w-0">
                      <span className="text-2xl mb-2 block">{bucket.icon}</span>
                      <CardHeader className="p-0">{bucket.label}</CardHeader>
                      <CardDescription className="mt-1 flex-1">{bucket.description}</CardDescription>
                      <Button variant="outline" size="sm" className="mt-3 w-fit">Open</Button>
                    </Link>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Documents */}
      {view === 'documents' && (
        <>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Documents are uploaded PDFs with no fillable fields (view only). Same upload flow as templates; only difference is no fields to enter.</p>
          <Card padding="md" className="no-print">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Type</label>
                <select
                  value={docTypeFilter}
                  onChange={(e) => setDocTypeFilter(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  aria-label="Filter by type"
                >
                  <option value="all">All</option>
                  {docTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Site</label>
                <select
                  value={docSiteFilter}
                  onChange={(e) => setDocSiteFilter(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  aria-label="Filter by site"
                >
                  <option value="all">All</option>
                  {docSites.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </Card>
          <ul className="space-y-3 print:space-y-2">
            {filteredDocs.map((doc) => (
              <li key={doc.id}>
                <Card padding="md" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <Link to={`/documents/${doc.id}`} className="flex-1 min-w-0">
                    <p className="font-medium text-neutral-900 dark:text-white">{doc.name}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {doc.type}
                      {doc.siteName ? ` · ${doc.siteName}` : ''} · {doc.date}
                    </p>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link to={`/documents/${doc.id}`} className="text-sm text-brand-600 dark:text-brand-400 hover:underline">View</Link>
                    {isOwnerOrHr && (
                      <>
                        <input
                          id={`overwrite-${doc.id}`}
                          type="file"
                          accept=".pdf,application/pdf"
                          className="sr-only"
                          aria-label={`Replace file for ${doc.name}`}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            if (!window.confirm(`Replace "${doc.name}" with the new file? Frank will re-learn its content.`)) {
                              e.target.value = ''
                              return
                            }
                            handleOverwrite(doc.id, file)
                            e.target.value = ''
                          }}
                        />
                        <label
                          htmlFor={`overwrite-${doc.id}`}
                          className={`cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                            overwritingDocId === doc.id
                              ? 'border-neutral-300 dark:border-neutral-600 text-neutral-400 cursor-not-allowed'
                              : 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                          }`}
                          onClick={(e) => { if (overwritingDocId === doc.id) e.preventDefault() }}
                        >
                          {overwritingDocId === doc.id ? 'Replacing…' : 'Overwrite'}
                        </label>
                      </>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          {filteredDocs.length === 0 && (
            <Card padding="lg">
              <EmptyState title="No documents match your filters." description="Try changing type or site filter." />
            </Card>
          )}
        </>
      )}

      {/* Signing */}
      {view === 'signing' && (
        <>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">
            Documents and site meeting forms waiting for your signature, or signature requests you manage.
          </p>
          <div className="mb-4">
            <input
              type="search"
              placeholder="Search documents to sign by name..."
              value={signingSearch}
              onChange={(e) => setSigningSearch(e.target.value)}
              className="min-h-[40px] w-full max-w-sm rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              aria-label="Search documents to sign"
            />
          </div>
          {filteredSiteMeetingSigning.length > 0 && (
            <Card padding="md" className="border-l-4 border-amber-500">
              <h3 className="font-semibold text-neutral-900 dark:text-white mb-2">Site Meeting Forms — Your Sign-Off Needed</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">H&S rep has filled these; sign after the site meeting.</p>
              <ul className="space-y-2">
                {filteredSiteMeetingSigning.map((s) => (
                  <li key={s.id}>
                    <Link to={`/forms/${s.id}`}>
                      <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                        <span className="font-medium text-neutral-900 dark:text-white">{s.templateName}</span>
                        <span className="text-sm text-brand-600 dark:text-brand-400">Sign →</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {filteredSignableFormsSigning.length > 0 && (
            <Card padding="md" className="border-l-4 border-brand-500">
              <h3 className="font-semibold text-neutral-900 dark:text-white mb-2">Forms from Your Supervisor — Your Signature Needed</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">Your supervisor has filled and signed these; add your signature.</p>
              <ul className="space-y-2">
                {filteredSignableFormsSigning.map((s) => (
                  <li key={s.id}>
                    <Link to={`/daily-forms/sign/${s.id}`}>
                      <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/30 transition-colors">
                        <span className="font-medium text-neutral-900 dark:text-white">{s.templateName}</span>
                        <span className="text-sm text-brand-600 dark:text-brand-400">Sign →</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {filteredPendingPdfSignatureSubmissions.length > 0 && (
            <Card padding="md" className="border-l-4 border-sky-500">
              <h3 className="font-semibold text-neutral-900 dark:text-white mb-2">PDF submissions waiting for your signature</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">Your supervisor submitted these forms and needs your signature to finalize for HR.</p>
              <ul className="space-y-2">
                {filteredPendingPdfSignatureSubmissions.map((s) => (
                  <li key={s.id}>
                    <Link to={`/forms/${s.id}`}>
                      <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors">
                        <span className="font-medium text-neutral-900 dark:text-white">{s.title ?? s.templateName ?? 'Form submission'}</span>
                        <span className="text-sm text-brand-600 dark:text-brand-400">Sign →</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {filteredSigningRequests.length === 0 && filteredSiteMeetingSigning.length === 0 && filteredSignableFormsSigning.length === 0 && filteredPendingPdfSignatureSubmissions.length === 0 ? (
            <Card padding="lg" className="text-center text-neutral-500 dark:text-neutral-400">
              {signingRequests.length === 0 && siteMeetingFormsAwaitingMySignature.length === 0 && signableFormsAwaitingMySignature.length === 0 && pendingSignatureSubmissions.filter((s) => s.needsMySignature).length === 0
                ? (isLabourer ? 'No documents or site meeting forms waiting for your signature right now.' : 'No signature requests.')
                : 'No documents match your search.'}
            </Card>
          ) : filteredSigningRequests.length > 0 ? (
            <ul className="space-y-3">
              {filteredSigningRequests.map((r) => {
                const mySigner = r.requiredSigners.find((s) => s.userId === user?.id || s.name === user?.name)
                const isPending = mySigner?.status === 'pending'
                return (
                  <li key={r.id}>
                    <Link to={`/signing/${r.id}`}>
                      <Card hover padding="md" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <p className="font-medium text-neutral-900 dark:text-white">{r.documentName}</p>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400">Due {new Date(r.dueDate).toLocaleDateString()}</p>
                        </div>
                        <Badge variant={isPending ? 'warning' : 'success'}>
                          {isPending ? 'Your signature needed' : 'Signed'}
                        </Badge>
                      </Card>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </>
      )}

      {/* Assign Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-1">Assign &quot;{assignTemplate?.name}&quot;</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">Select labourers to assign this form to.</p>
            <div className="max-h-48 overflow-y-auto space-y-2 mb-4">
              {teamMembers.length === 0 ? (
                <p className="text-sm text-neutral-500">No team members found.</p>
              ) : teamMembers.map((m) => (
                <label key={m.id} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(m.id)}
                    onChange={() => setSelectedUserIds(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id])}
                    className="rounded"
                  />
                  <span className="text-sm font-medium text-neutral-900 dark:text-white">{m.name}</span>
                </label>
              ))}
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Due Date (Optional)</label>
              <input type="date" value={assignDueDate} onChange={(e) => setAssignDueDate(e.target.value)} className="w-full min-h-[44px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white" aria-label="Due date (optional)" />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Recurrence</label>
              <select value={assignRecurrence} onChange={(e) => setAssignRecurrence(e.target.value as 'once' | 'daily' | 'weekly' | 'monthly')} className="w-full min-h-[44px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white" aria-label="Recurrence">
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Note (optional)</label>
              <textarea value={assignNote} onChange={(e) => setAssignNote(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white" placeholder="e.g. Complete before site induction" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setAssignModalOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAssign} disabled={selectedUserIds.length === 0 || assigning}>
                {assigning ? 'Assigning…' : `Assign Form (${selectedUserIds.length})`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UploadIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  )
}
