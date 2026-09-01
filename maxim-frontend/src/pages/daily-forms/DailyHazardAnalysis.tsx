import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { useEmployees } from '@/contexts/EmployeesContext'
import { api } from '@/api'
import { fetchJobs, fetchMyJobs } from '@/api/jobs'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import SignatureModal from '@/components/pdf/SignatureModal'
import { createDailyHazardSubmission } from '@/api/dailyHazardAnalysis'
import { fetchDhaPresets, createDhaPreset, deleteDhaPreset, type DhaPreset } from '@/api/dhaPresets'
import { getDhaTaskLibraryEntry } from '@/data/dhaTaskLibrary'
import {
  listDhaLocalDrafts,
  loadDhaLocalDraft,
  saveDhaLocalDraft,
  removeDhaLocalDraft,
  type DhaLocalDraftRecord,
} from '@/utils/dhaLocalDrafts'

const GENERAL_ACTIVITIES = [
  'CONCRETE FORMING & POURING', 'CONFINED SPACE', 'CRANE USE HOISTING AND RIGGING', 'DEMOLITION',
  'DRYWALL INSTALLATION/FINISHING', 'ELECTRICAL WORK', 'EQUIPMENT/TOOL USE', 'EXCAVATION & TRENCHING',
  'FLOORING INSTALLATION', 'HARDWARE INSTALLATION', 'HAZARDOUS ENERGY CONTROL (LOTO)', 'HOT-WORK',
  'HOUSEKEEPING', 'HVAC WORK', 'MANUAL MATERIAL STORAGE & HANDLING', 'PAINTING', 'PLUMBING WORK',
  'SPRINKLER WORK', 'TRUCK LOADING & UNLOADING', 'WORK PLATFORM USE (LADDER/SCAFFOLD)', 'WORKING AT HEIGHTS'
]

const SPECIFIC_HAZARDS = [
  'ADJACENT PUBLIC AREAS', 'COLD STRESS', 'DAMAGED EQUIPMENT', 'DESIGNATED SUBSTANCES', 'DUSTS MISTS FUMES',
  'FALLS', 'HAZARDOUS ENERGY', 'HAZARDOUS MATERIALS/CHEMICALS', 'HEAT STRESS',
  'LACK OF SUBCONTRACTOR PROCEDURES', 'LACK OF TRAINING', 'NOISE',
  'POOR LIGHTING', 'RESPIRATORY HAZARDS', 'SITE VISIBILITY (HILL BEND NIGHT WORK)', 'SLIPS TRIPS', 'UNDERGROUND UTILITIES'
]

const STANDARD_CONTROLS = [
  'ADEQUATE DRINKING WATER AVAILABLE', 'DUST CONTROL MEASURES', 'EMERGENCY RESPONSE PROCEDURES', 'EQUIPMENT/TOOL INSPECTIONS',
  'FALL PREVENTION PLAN', 'HAZARDOUS ENERGY CONTROL (LOTO)', 'HOUSEKEEPING', '(M)SDS AVAILABLE', 'MECHANICAL VENTILATION',
  'NATURAL VENTILATION', 'NOISE MONITORING', 'PERSONAL PROTECTIVE EQUIPMENT',
  'SAFE ACCESS/EGRESS TO WORK AREAS', 'SIGNAL PERSONS AVAILABLE', 'SUBCONTRACTOR PROCEDURES IN PLACE',
  'TEMPORARY LIGHTING', 'TRAFFIC MANAGEMENT PLAN', 'TRAINING CERTIFICATIONS', 'UTILITY LOCATES'
]

const EXTERNAL_HAZARDS = [
  'INCLEMENT WEATHER', 'HIGH WINDS', 'TRAFFIC', 'NEIGHBOURING CONSTRUCTION',
  'PUBLIC ACCESS', 'PUBLIC PROTECTION IN PLACE', 'OVERHEAD HAZARDS'
]

const PPE_ITEMS = [
  { name: 'HEAD PROTECTION', icon: '⛑️' },
  { name: 'FOOT PROTECTION', icon: '🥾' },
  { name: 'EYE PROTECTION', icon: '🥽' },
  { name: 'ARC FLASH', icon: '⚡' },
  { name: 'HEARING PROTECTION', icon: '🎧' },
  { name: 'FALL PROTECTION', icon: '🪢' },
  { name: 'HAND PROTECTION', icon: '🧤' },
  { name: 'SKIN PROTECTION', icon: '🧴' },
  { name: 'RESPIRATORY PROTECTION', icon: '😷' },
  { name: 'HI-VIS PROTECTION', icon: '🦺' },
]

const WEATHER_CONDITIONS = ['Rain', 'Snow', 'Wind', 'Lightning', 'Sun', 'Overcast']

const WORKPLACE_VIOLENCE_QUESTIONS = [
  'History of threats or Violence?',
  'Near historically high crime area?',
  'Concerns voice by JHSC or workers?',
  'Workers required to work alone, late evenings or early mornings?',
  'Workers in contact with public?',
]

type JhaRow = {
  job: string
  riskBeforeControls: string
  riskAfterControls: string
  isCustom?: boolean
  customHazards?: string
  customControls?: string
}

const EMPTY_JHA_ROW: JhaRow = { job: '', riskBeforeControls: '', riskAfterControls: '' }

function newLocalDraftId() {
  return `dha-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function applyDraftPayloadToForm(
  draft: Record<string, unknown>,
  setters: {
    setDate: (v: string) => void
    setProject: (v: string) => void
    setMusterPoint: (v: string) => void
    setSupervisorId: (v: string) => void
    setJobNumber: (v: string) => void
    setWeatherTemp: (v: string) => void
    setWeatherConditions: (v: string[]) => void
    setNearestHospital: (v: string) => void
    setEmergencyCoordinator: (v: string) => void
    setActivities: (v: string[]) => void
    setHazards: (v: string[]) => void
    setControls: (v: string[]) => void
    setExternalHazards: (v: string[]) => void
    setPpe: (v: string[]) => void
    setToolsReplaced: (v: string) => void
    setAdditionalComments: (v: string) => void
    setJhaRows: (v: JhaRow[]) => void
    setViolenceAnswers: (v: Record<number, string>) => void
    setViolenceActions: (v: string) => void
    setSignatures: (v: { id: string; name: string; timestamp: string; dataUrl: string }[]) => void
  }
) {
  if ('date' in draft) setters.setDate(String(draft.date ?? ''))
  if ('project' in draft) setters.setProject(String(draft.project ?? ''))
  if ('musterPoint' in draft) setters.setMusterPoint(String(draft.musterPoint ?? ''))
  if ('supervisorId' in draft) setters.setSupervisorId(String(draft.supervisorId ?? ''))
  if ('jobNumber' in draft) setters.setJobNumber(String(draft.jobNumber ?? ''))
  if ('weatherTemp' in draft) setters.setWeatherTemp(String(draft.weatherTemp ?? ''))
  if (Array.isArray(draft.weatherConditions)) setters.setWeatherConditions(draft.weatherConditions as string[])
  if ('nearestHospital' in draft) setters.setNearestHospital(String(draft.nearestHospital ?? ''))
  if ('emergencyCoordinator' in draft) setters.setEmergencyCoordinator(String(draft.emergencyCoordinator ?? ''))
  if (Array.isArray(draft.activities)) setters.setActivities(draft.activities as string[])
  if (Array.isArray(draft.hazards)) setters.setHazards(draft.hazards as string[])
  if (Array.isArray(draft.controls)) setters.setControls(draft.controls as string[])
  if (Array.isArray(draft.externalHazards)) setters.setExternalHazards(draft.externalHazards as string[])
  if (Array.isArray(draft.ppe)) setters.setPpe(draft.ppe as string[])
  if ('toolsReplaced' in draft) setters.setToolsReplaced(String(draft.toolsReplaced ?? ''))
  if ('additionalComments' in draft) setters.setAdditionalComments(String(draft.additionalComments ?? ''))
  if (Array.isArray(draft.jhaRows)) setters.setJhaRows(draft.jhaRows as JhaRow[])
  if (draft.violenceAnswers && typeof draft.violenceAnswers === 'object') {
    setters.setViolenceAnswers(draft.violenceAnswers as Record<number, string>)
  }
  if ('violenceActions' in draft) setters.setViolenceActions(String(draft.violenceActions ?? ''))
  if (Array.isArray(draft.signatures)) {
    setters.setSignatures(draft.signatures as { id: string; name: string; timestamp: string; dataUrl: string }[])
  }
}

function riskPillClass(risk: string) {
  const value = risk.trim().toLowerCase()
  if (value === 'critical') return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-200 dark:border-red-700'
  if (value === 'high') return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-700'
  if (value === 'medium') return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-700'
  if (value === 'low') return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-700'
  return 'bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-600'
}

function riskScore(risk: string) {
  const value = risk.trim().toLowerCase()
  if (value === 'low') return 1
  if (value === 'medium') return 2
  if (value === 'high') return 3
  if (value === 'critical') return 4
  return null
}

function riskLabelWithScore(risk: string) {
  const score = riskScore(risk)
  if (!risk) return '—'
  return score ? `${risk} (${score})` : risk
}

export function DailyHazardAnalysis() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const draftIdFromUrl = searchParams.get('draft')
  const { user } = useUser()
  const { employees } = useEmployees()

  // Section 1
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [project, setProject] = useState('')
  const [musterPoint, setMusterPoint] = useState('')
  const [supervisorId, setSupervisorId] = useState('')
  const [jobNumber, setJobNumber] = useState('')
  const [weatherTemp, setWeatherTemp] = useState('')
  const [weatherConditions, setWeatherConditions] = useState<string[]>([])
  const [nearestHospital, setNearestHospital] = useState('')
  const [emergencyCoordinator, setEmergencyCoordinator] = useState('')

  // Section 2-5
  const [activities, setActivities] = useState<string[]>([])
  const [hazards, setHazards] = useState<string[]>([])
  const [controls, setControls] = useState<string[]>([])
  const [externalHazards, setExternalHazards] = useState<string[]>([])
  const [ppe, setPpe] = useState<string[]>([])

  // Section 6
  const [toolsReplaced, setToolsReplaced] = useState('')
  const [additionalComments, setAdditionalComments] = useState('')

  // Section 7 — Job Hazard Assessment
  const [jhaRows, setJhaRows] = useState<JhaRow[]>([])

  // Section 8 — Workplace Violence
  const [violenceAnswers, setViolenceAnswers] = useState<Record<number, string>>({})
  const [violenceActions, setViolenceActions] = useState('')

  // Section 9 — Signatures
  const [signatures, setSignatures] = useState<{ id: string; name: string; timestamp: string; dataUrl: string }[]>([])
  const [signingWorker, setSigningWorker] = useState<string>('')
  const [isSigning, setIsSigning] = useState(false)
  const [supervisorOptions, setSupervisorOptions] = useState<Array<{ id: string; name: string }>>([])

  const [jobs, setJobs] = useState<{ id: string; title: string; siteName?: string }[]>([])
  const [jobsError, setJobsError] = useState<string | null>(null)

  // --- DHA Presets ---
  const [presets, setPresets] = useState<DhaPreset[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [showSavePresetModal, setShowSavePresetModal] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [savingPreset, setSavingPreset] = useState(false)

  useEffect(() => {
    let cancelled = false

    const role = user?.role
    const load = role === 'supervisor' ? fetchMyJobs() : fetchJobs()

    setJobsError(null)
    load
      .then((data) => {
        if (cancelled) return
        setJobs(data as any)
      })
      .catch((err) => {
        if (cancelled) return
        // Show something instead of silently failing and leaving the dropdown empty
        setJobsError(err?.response?.data?.message ?? err?.message ?? 'Failed to load jobs')
        setJobs([])
      })

    return () => {
      cancelled = true
    }
  }, [user?.role])

  useEffect(() => {
    api
      .get('/users/supervisors')
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : []
        setSupervisorOptions(
          list
            .map((u: any) => ({
              id: String(u.id ?? ''),
              name: String(u.name ?? '').trim(),
            }))
            .filter((u) => u.id && u.name)
        )
      })
      .catch(() => {
        setSupervisorOptions(
          employees
            .filter((e: any) => e.role === 'supervisor' || e.role === 'owner')
            .map((e: any) => ({
              id: String(e.id ?? ''),
              name: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim(),
            }))
            .filter((e) => e.id && e.name)
        )
      })
  }, [employees])

  const handleToggle = (list: string[], setList: (l: string[]) => void, item: string) => {
    if (list.includes(item)) setList(list.filter(x => x !== item))
    else setList([...list, item])
  }

  useEffect(() => {
    setJhaRows((prev) => {
      const customRows = prev.filter((row) => row.isCustom)
      if (activities.length === 0) return customRows
      const byJob = new Map(prev.filter((row) => !row.isCustom).map((row) => [row.job, row]))
      const autoRows = activities.map((job) => {
        const task = getDhaTaskLibraryEntry(job)
        const existing = byJob.get(job)
        if (existing) {
          return {
            ...existing,
            job,
            riskBeforeControls: task?.riskBeforeControls ?? existing.riskBeforeControls,
            riskAfterControls: task?.riskAfterControls ?? existing.riskAfterControls,
          }
        }
        return {
          ...EMPTY_JHA_ROW,
          job,
          riskBeforeControls: task?.riskBeforeControls ?? '',
          riskAfterControls: task?.riskAfterControls ?? '',
        }
      })
      return [...autoRows, ...customRows]
    })
  }, [activities])

  // Load presets on mount
  useEffect(() => {
    fetchDhaPresets().then(setPresets).catch(() => setPresets([]))
  }, [])

  const handleLoadPreset = (presetId: string) => {
    setSelectedPresetId(presetId)
    if (!presetId) return
    const preset = presets.find(p => p.id === presetId)
    if (!preset?.data) return
    const d = preset.data as any
    if (Array.isArray(d.activities)) setActivities(d.activities)
    if (Array.isArray(d.hazards)) setHazards(d.hazards)
    if (Array.isArray(d.controls)) setControls(d.controls)
    if (Array.isArray(d.externalHazards)) setExternalHazards(d.externalHazards)
    if (Array.isArray(d.ppe)) setPpe(d.ppe)
    if (d.toolsReplaced !== undefined) setToolsReplaced(d.toolsReplaced || '')
    if (d.additionalComments !== undefined) setAdditionalComments(d.additionalComments || '')
    if (Array.isArray(d.jhaRows)) {
      const rows = d.jhaRows.map((r: any) => {
        const task = getDhaTaskLibraryEntry(r.job || '')
        return {
          job: r.job || '',
          isCustom: Boolean(r.isCustom),
          customHazards: typeof r.customHazards === 'string' ? r.customHazards : '',
          customControls: typeof r.customControls === 'string' ? r.customControls : '',
          riskBeforeControls: task?.riskBeforeControls || r.riskBeforeControls || r.riskRatingRequired || '',
          riskAfterControls: task?.riskAfterControls || r.riskAfterControls || '',
        }
      })
      setJhaRows(rows)
    }
    if (d.violenceAnswers) setViolenceAnswers(d.violenceAnswers)
    if (d.violenceActions !== undefined) setViolenceActions(d.violenceActions || '')
  }

  const handleSavePreset = async () => {
    if (!presetName.trim()) return
    setSavingPreset(true)
    try {
      const data = {
        activities,
        hazards,
        controls,
        externalHazards,
        ppe,
        toolsReplaced: toolsReplaced.trim() || undefined,
        additionalComments: additionalComments.trim() || undefined,
        jhaRows: jhaRows.filter((r) => r.job || r.riskBeforeControls || r.riskAfterControls),
        violenceAnswers,
        violenceActions: violenceActions.trim() || undefined,
      }
      await createDhaPreset(presetName, data)
      const updated = await fetchDhaPresets()
      setPresets(updated)
      setShowSavePresetModal(false)
      setPresetName('')
      alert(`Preset "${presetName.trim()}" saved!`)
    } catch {
      alert('Failed to save preset.')
    } finally {
      setSavingPreset(false)
    }
  }

  const handleDeletePreset = async (id: string) => {
    const preset = presets.find(p => p.id === id)
    if (!window.confirm(`Delete preset "${preset?.name}"?`)) return
    try {
      await deleteDhaPreset(id)
      setPresets(prev => prev.filter(p => p.id !== id))
      if (selectedPresetId === id) setSelectedPresetId('')
    } catch {
      alert('Failed to delete preset.')
    }
  }

  const handleSaveSignature = (dataUrl: string) => {
    if (!signingWorker) return
    const workerName = employees.find((e: any) => e.id === signingWorker)?.firstName + ' ' + employees.find((e: any) => e.id === signingWorker)?.lastName || signingWorker
    setSignatures([...signatures, {
      id: Math.random().toString(),
      name: workerName === 'undefined undefined' ? user?.name ?? 'Self' : workerName,
      timestamp: new Date().toISOString(),
      dataUrl
    }])
    setIsSigning(false)
    setSigningWorker('')
  }

  const updateJhaRow = (idx: number, field: string, value: string) => {
    setJhaRows((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row
        if (row.isCustom) {
          return { ...row, [field]: value }
        }
        if (field === 'job') {
          const task = getDhaTaskLibraryEntry(value)
          return {
            ...row,
            job: value,
            riskBeforeControls: task?.riskBeforeControls ?? '',
            riskAfterControls: task?.riskAfterControls ?? '',
          }
        }
        return { ...row, [field]: value }
      })
    )
  }

  const addCustomJhaRow = () => {
    setJhaRows((prev) => [
      ...prev,
      {
        ...EMPTY_JHA_ROW,
        isCustom: true,
        customHazards: '',
        customControls: '',
      },
    ])
  }

  const removeCustomJhaRow = (idx: number) => {
    setJhaRows((prev) => prev.filter((_, i) => i !== idx))
  }

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [draftMessage, setDraftMessage] = useState<string | null>(null)
  const [activeDraftId, setActiveDraftId] = useState(() => draftIdFromUrl || newLocalDraftId())
  const [localDrafts, setLocalDrafts] = useState<DhaLocalDraftRecord[]>([])

  const draftSetters = useMemo(
    () => ({
      setDate,
      setProject,
      setMusterPoint,
      setSupervisorId,
      setJobNumber,
      setWeatherTemp,
      setWeatherConditions,
      setNearestHospital,
      setEmergencyCoordinator,
      setActivities,
      setHazards,
      setControls,
      setExternalHazards,
      setPpe,
      setToolsReplaced,
      setAdditionalComments,
      setJhaRows,
      setViolenceAnswers,
      setViolenceActions,
      setSignatures,
    }),
    []
  )

  const refreshLocalDraftList = () => {
    if (!user?.id) {
      setLocalDrafts([])
      return
    }
    setLocalDrafts(listDhaLocalDrafts(user.id))
  }

  useEffect(() => {
    refreshLocalDraftList()
  }, [user?.id])

  useEffect(() => {
    if (!user?.id || !draftIdFromUrl) return
    const record = loadDhaLocalDraft(user.id, draftIdFromUrl)
    if (!record) {
      setDraftMessage('Draft not found — starting a new form.')
      setActiveDraftId(newLocalDraftId())
      setSearchParams({}, { replace: true })
      return
    }
    setActiveDraftId(record.id)
    applyDraftPayloadToForm(record.payload, draftSetters)
    setDraftMessage(`Loaded draft: ${record.label}`)
  }, [user?.id, draftIdFromUrl, draftSetters, setSearchParams])

  const buildDraftPayload = () => ({
    date,
    project,
    musterPoint,
    supervisorId,
    jobNumber,
    weatherTemp,
    weatherConditions,
    nearestHospital,
    emergencyCoordinator,
    activities,
    hazards,
    controls,
    externalHazards,
    ppe,
    toolsReplaced,
    additionalComments,
    jhaRows,
    violenceAnswers,
    violenceActions,
    signatures,
  })

  const handleStartNewLocalDraft = () => {
    const id = newLocalDraftId()
    setActiveDraftId(id)
    setDate(new Date().toISOString().slice(0, 10))
    setProject('')
    setMusterPoint('')
    setSupervisorId('')
    setJobNumber('')
    setWeatherTemp('')
    setWeatherConditions([])
    setNearestHospital('')
    setEmergencyCoordinator('')
    setActivities([])
    setHazards([])
    setControls([])
    setExternalHazards([])
    setPpe([])
    setToolsReplaced('')
    setAdditionalComments('')
    setJhaRows([])
    setViolenceAnswers({})
    setViolenceActions('')
    setSignatures([])
    setDraftMessage('New blank Daily Hazard Analysis.')
    setSearchParams({ draft: id }, { replace: true })
  }

  const handleSaveDraft = () => {
    if (!user?.id) {
      setDraftMessage('Please wait until your session is fully loaded, then try again.')
      return
    }
    try {
      const record = saveDhaLocalDraft(user.id, activeDraftId, buildDraftPayload())
      refreshLocalDraftList()
      setSearchParams({ draft: record.id }, { replace: true })
      setDraftMessage('Draft saved.')
    } catch {
      setDraftMessage('Failed to save draft.')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!project || !musterPoint || !supervisorId || !jobNumber) {
      alert('Please fill out all required general information.')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const job = jobs.find(j => j.id === project)
      const supervisorName = supervisorOptions.find((s) => s.id === supervisorId)?.name
      await createDailyHazardSubmission({
        date,
        projectId: project,
        projectTitle: job?.title,
        siteName: job?.siteName,
        musterPoint,
        supervisorId,
        supervisorName: supervisorName || undefined,
        jobNumber,
        weatherTemp: weatherTemp.trim() || undefined,
        weatherConditions,
        nearestHospital: nearestHospital.trim() || undefined,
        emergencyCoordinator: emergencyCoordinator.trim() || undefined,
        activities,
        hazards: [...hazards, ...externalHazards],
        controls,
        ppe,
        jobHazardAssessment: jhaRows
          .filter((r) => r.job || r.riskBeforeControls || r.riskAfterControls || r.customHazards || r.customControls)
          .map((r) => {
            if (r.isCustom) {
              const customHazards = (r.customHazards || '')
                .split(/[\n,]/)
                .map((item) => item.trim())
                .filter(Boolean)
              const customControls = (r.customControls || '')
                .split(/[\n,]/)
                .map((item) => item.trim())
                .filter(Boolean)
              return {
                job: r.job,
                hazards: customHazards,
                controls: customControls,
                riskBeforeControls: r.riskBeforeControls || '',
                riskAfterControls: r.riskAfterControls || '',
                hazard: customHazards.join(', '),
                control: customControls.join(', '),
                riskRatingRequired: r.riskBeforeControls || '',
              }
            }
            const task = getDhaTaskLibraryEntry(r.job)
            return {
              job: r.job,
              hazards: task?.hazards ?? [],
              controls: task?.controls ?? [],
              riskBeforeControls: r.riskBeforeControls || '',
              riskAfterControls: r.riskAfterControls || '',
              // Keep legacy keys populated for backward compatibility.
              hazard: (task?.hazards ?? []).join(', '),
              control: (task?.controls ?? []).join(', '),
              riskRatingRequired: r.riskBeforeControls || '',
            }
          }),
        workplaceViolence: WORKPLACE_VIOLENCE_QUESTIONS.map((q, i) => ({ question: q, answer: violenceAnswers[i] || '' })),
        workplaceViolenceActions: violenceActions.trim() || undefined,
        toolsReplaced: toolsReplaced.trim() || undefined,
        additionalComments: additionalComments.trim() || undefined,
        signatures,
      })
      if (user?.id) removeDhaLocalDraft(user.id, activeDraftId)
      navigate('/safety/daily-hazard-analysis')
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message ?? err?.message ?? 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl pb-12">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/library" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Forms & Documents</Link>
      </div>
      <div className="flex items-center gap-4">
        <Link to="/library" className="touch-target p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </Link>
        <Breadcrumbs items={[{ label: 'Forms & Documents', to: '/library' }, { label: 'Daily Hazard Analysis' }]} />
      </div>
      <div>
        <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Daily Hazard Analysis</h1>
        {localDrafts.length > 0 && (
          <div className="mt-3 flex flex-wrap items-end gap-3 max-w-2xl">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Open saved draft</label>
              <select
                className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                value={activeDraftId}
                onChange={(e) => {
                  const id = e.target.value
                  if (!id || !user?.id) return
                  const record = loadDhaLocalDraft(user.id, id)
                  if (!record) return
                  setActiveDraftId(id)
                  applyDraftPayloadToForm(record.payload, draftSetters)
                  setDraftMessage(`Loaded draft: ${record.label}`)
                  setSearchParams({ draft: id }, { replace: true })
                }}
              >
                {localDrafts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label} ({new Date(d.updatedAt).toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={handleStartNewLocalDraft}>
              Start new DHA
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-600 dark:text-red-400"
              onClick={() => {
                if (!user?.id) return
                const record = loadDhaLocalDraft(user.id, activeDraftId)
                const label = record?.label ?? 'this draft'
                if (!window.confirm(`Delete draft "${label}"? This cannot be undone.`)) return
                removeDhaLocalDraft(user.id, activeDraftId)
                refreshLocalDraftList()
                handleStartNewLocalDraft()
              }}
            >
              Delete draft
            </Button>
          </div>
        )}
        {localDrafts.length === 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleStartNewLocalDraft}>
              Start new DHA
            </Button>
          </div>
        )}
        <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">Complete this form before work begins each day.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ─── Load Preset ─── */}
        <Card padding="md" className="border-brand-200 dark:border-brand-800 bg-brand-50/30 dark:bg-brand-900/10">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">📋 Load Preset</label>
              <select
                value={selectedPresetId}
                onChange={(e) => handleLoadPreset(e.target.value)}
                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                aria-label="Load preset"
              >
                <option value="">— Select a saved preset to auto-fill —</option>
                {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {selectedPresetId && (
              <Button type="button" variant="danger" size="sm" onClick={() => handleDeletePreset(selectedPresetId)}>
                Delete Preset
              </Button>
            )}
          </div>
          {presets.length === 0 && (
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">No presets saved yet. Fill out the form and click "Save as Preset" to create one.</p>
          )}
        </Card>

        {/* ─── Section 1 — General Information ─── */}
        <Card padding="lg">
          <CardHeader>Section 1 — General Information</CardHeader>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Project</label>
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                required
                aria-label="Project"
              >
                <option value="">Select project...</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.title} {j.siteName ? `(${j.siteName})` : ''}</option>)}
              </select>
              {jobsError && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {jobsError}
                </p>
              )}
            </div>
            <Input label="Muster Point" value={musterPoint} onChange={(e) => setMusterPoint(e.target.value)} required />
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Supervisor</label>
              <select
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                required
                aria-label="Supervisor"
              >
                <option value="">Select supervisor...</option>
                {supervisorOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <Input label="Job Number" value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} required />
            <Input label="Weather (°C)" type="number" value={weatherTemp} onChange={(e) => setWeatherTemp(e.target.value)} placeholder="e.g. 12" />
          </div>

          {/* Weather conditions checkboxes */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Weather Conditions</label>
            <div className="flex flex-wrap gap-3">
              {WEATHER_CONDITIONS.map(cond => (
                <label key={cond} className="flex items-center gap-2 py-2 px-3 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg cursor-pointer">
                  <input type="checkbox" className="shrink-0" checked={weatherConditions.includes(cond)} onChange={() => handleToggle(weatherConditions, setWeatherConditions, cond)} />
                  <span className="text-sm">{cond}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nearest Hospital" value={nearestHospital} onChange={(e) => setNearestHospital(e.target.value)} placeholder="Name or address" />
            <Input label="Emergency Response Coordinator" value={emergencyCoordinator} onChange={(e) => setEmergencyCoordinator(e.target.value)} placeholder="Name" />
          </div>
        </Card>

        {/* ─── Section 2 — General Activities ─── */}
        <Card padding="lg">
          <CardHeader>Section 2 — General Activities and Hazards</CardHeader>
          <CardDescription>Select all that apply</CardDescription>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {GENERAL_ACTIVITIES.map(act => (
              <label key={act} className="flex items-start gap-3 py-3 px-3 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg cursor-pointer min-h-[58px]">
                <input type="checkbox" className="mt-0.5 shrink-0" checked={activities.includes(act)} onChange={() => handleToggle(activities, setActivities, act)} />
                <span className="text-sm leading-snug">{act}</span>
              </label>
            ))}
          </div>
        </Card>

        {/* ─── Section 3 — Specific Hazards ─── */}
        <Card padding="lg">
          <CardHeader>Section 3 — Specific Hazards and Site Considerations</CardHeader>
          <CardDescription>Select all that apply</CardDescription>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {SPECIFIC_HAZARDS.map(haz => (
              <label key={haz} className="flex items-start gap-3 py-3 px-3 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg cursor-pointer min-h-[58px]">
                <input type="checkbox" className="mt-0.5 shrink-0" checked={hazards.includes(haz)} onChange={() => handleToggle(hazards, setHazards, haz)} />
                <span className="text-sm leading-snug">{haz}</span>
              </label>
            ))}
          </div>
        </Card>

        {/* ─── Section 4 — Standard Controls ─── */}
        <Card padding="lg">
          <CardHeader>Section 4 — Standard Site Controls</CardHeader>
          <CardDescription>Select all that apply</CardDescription>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {STANDARD_CONTROLS.map(ctrl => (
              <label key={ctrl} className="flex items-start gap-3 py-3 px-3 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg cursor-pointer min-h-[58px]">
                <input type="checkbox" className="mt-0.5 shrink-0" checked={controls.includes(ctrl)} onChange={() => handleToggle(controls, setControls, ctrl)} />
                <span className="text-sm leading-snug">{ctrl}</span>
              </label>
            ))}
          </div>
        </Card>

        {/* ─── Section 5 — External Hazards ─── */}
        <Card padding="lg">
          <CardHeader>Section 5 — External Hazards</CardHeader>
          <CardDescription>Select all that apply</CardDescription>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {EXTERNAL_HAZARDS.map(ext => (
              <label key={ext} className="flex items-start gap-3 py-3 px-3 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg cursor-pointer min-h-[58px]">
                <input type="checkbox" className="mt-0.5 shrink-0" checked={externalHazards.includes(ext)} onChange={() => handleToggle(externalHazards, setExternalHazards, ext)} />
                <span className="text-sm leading-snug">{ext}</span>
              </label>
            ))}
          </div>
        </Card>

        {/* ─── Section 6 — PPE ─── */}
        <Card padding="lg">
          <CardHeader>Section 6 — Personal Protective Equipment Required</CardHeader>
          <CardDescription>Select all that apply — Must be CSA Approved</CardDescription>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {PPE_ITEMS.map(item => (
              <label key={item.name} className="flex items-center gap-3 py-3 px-3 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg cursor-pointer">
                <input type="checkbox" className="shrink-0" checked={ppe.includes(item.name)} onChange={() => handleToggle(ppe, setPpe, item.name)} />
                <span className="shrink-0 w-6 h-6 flex items-center justify-center text-lg">{item.icon}</span>
                <span className="text-sm font-medium">{item.name}</span>
              </label>
            ))}
          </div>
        </Card>

        {/* ─── Section 7 — Tool Condition ─── */}
        <Card padding="lg">
          <CardHeader>Section 7 — Tool Condition</CardHeader>
          <div className="mt-4 space-y-4">
            <Textarea
              label="Are there any tools or equipment that need to be replaced or repaired? (Optional)"
              value={toolsReplaced}
              onChange={(e) => setToolsReplaced(e.target.value)}
              rows={2}
            />
            <Textarea
              label="Additional Comments or Concerns? (Optional)"
              value={additionalComments}
              onChange={(e) => setAdditionalComments(e.target.value)}
              rows={2}
            />
          </div>
        </Card>

        {/* ─── Section 8 — Job Hazard Assessment ─── */}
        <Card padding="lg">
          <CardHeader>Section 8 — Job Hazard Assessment</CardHeader>
          <CardDescription>Identify job-specific hazards and controls. If a risk rating is required, please fill out form 10-1.</CardDescription>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-neutral-100 dark:bg-neutral-800">
                  <th className="text-left px-3 py-2 font-semibold text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 w-[22%]">Job</th>
                  <th className="text-left px-3 py-2 font-semibold text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 w-[24%]">Hazards</th>
                  <th className="text-left px-3 py-2 font-semibold text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 w-[24%]">Control Measures</th>
                  <th className="text-left px-3 py-2 font-semibold text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 w-[15%]">Risk Rating Before Controls</th>
                  <th className="text-left px-3 py-2 font-semibold text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 w-[15%]">Risk Rating After Controls</th>
                </tr>
              </thead>
              <tbody>
                {jhaRows.map((row, idx) => {
                  const taskData = getDhaTaskLibraryEntry(row.job)
                  const hazardOptions = taskData?.hazards ?? []
                  const controlOptions = taskData?.controls ?? []
                  return (
                  <tr key={idx}>
                    <td className="border border-neutral-200 dark:border-neutral-700 p-1">
                      {row.isCustom ? (
                        <input
                          value={row.job}
                          onChange={(e) => updateJhaRow(idx, 'job', e.target.value)}
                          className="w-full px-2 py-1.5 bg-transparent text-neutral-900 dark:text-white text-sm focus:outline-none"
                          placeholder="Custom job/task..."
                          aria-label={`Section 8 custom job row ${idx + 1}`}
                        />
                      ) : (
                        <select
                          value={row.job}
                          onChange={(e) => updateJhaRow(idx, 'job', e.target.value)}
                          className="w-full px-2 py-1.5 bg-transparent text-neutral-900 dark:text-white text-sm focus:outline-none"
                          aria-label={`Section 8 job row ${idx + 1}`}
                        >
                          <option value="">Job...</option>
                          {activities.map((task) => (
                            <option key={task} value={task}>
                              {task}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="border border-neutral-200 dark:border-neutral-700 p-2 align-top">
                      {row.isCustom ? (
                        <textarea
                          value={row.customHazards || ''}
                          onChange={(e) => updateJhaRow(idx, 'customHazards', e.target.value)}
                          className="w-full min-h-[76px] px-2 py-1.5 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
                          placeholder="Add custom hazards (comma or new line separated)"
                          aria-label={`Section 8 custom hazards row ${idx + 1}`}
                        />
                      ) : (
                        row.job ? (
                          hazardOptions.length > 0 ? (
                            <ul className="space-y-1 text-xs text-neutral-800 dark:text-neutral-200">
                              {hazardOptions.map((hazard) => (
                                <li key={hazard}>• {hazard}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">No hazards mapped for this task.</p>
                          )
                        ) : (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">Select job first...</p>
                        )
                      )}
                    </td>
                    <td className="border border-neutral-200 dark:border-neutral-700 p-2 align-top">
                      {row.isCustom ? (
                        <textarea
                          value={row.customControls || ''}
                          onChange={(e) => updateJhaRow(idx, 'customControls', e.target.value)}
                          className="w-full min-h-[76px] px-2 py-1.5 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
                          placeholder="Add custom controls (comma or new line separated)"
                          aria-label={`Section 8 custom controls row ${idx + 1}`}
                        />
                      ) : (
                        row.job ? (
                          controlOptions.length > 0 ? (
                            <ul className="space-y-1 text-xs text-neutral-800 dark:text-neutral-200">
                              {controlOptions.map((control) => (
                                <li key={control}>• {control}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">No controls mapped for this task.</p>
                          )
                        ) : (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">Select job first...</p>
                        )
                      )}
                    </td>
                    <td className="border border-neutral-200 dark:border-neutral-700 p-2">
                      {row.isCustom ? (
                        <select
                          value={row.riskBeforeControls}
                          onChange={(e) => updateJhaRow(idx, 'riskBeforeControls', e.target.value)}
                          className="w-full px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
                          aria-label={`Section 8 custom risk before row ${idx + 1}`}
                        >
                          <option value="">Select...</option>
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="Critical">Critical</option>
                        </select>
                      ) : (
                        row.job ? (
                          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${riskPillClass(row.riskBeforeControls)}`}>
                            {riskLabelWithScore(row.riskBeforeControls)}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">—</span>
                        )
                      )}
                    </td>
                    <td className="border border-neutral-200 dark:border-neutral-700 p-2">
                      {row.isCustom ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={row.riskAfterControls}
                            onChange={(e) => updateJhaRow(idx, 'riskAfterControls', e.target.value)}
                            className="w-full px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
                            aria-label={`Section 8 custom risk after row ${idx + 1}`}
                          >
                            <option value="">Select...</option>
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                            <option value="Critical">Critical</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => removeCustomJhaRow(idx)}
                            className="shrink-0 rounded border border-red-200 dark:border-red-800 px-2 py-1 text-xs text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        row.job ? (
                          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${riskPillClass(row.riskAfterControls)}`}>
                            {riskLabelWithScore(row.riskAfterControls)}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">—</span>
                        )
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
            {activities.length === 0 && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                Select one or more activities in Section 2 to auto-populate Section 8 jobs.
              </p>
            )}
            <div className="mt-3">
              <Button type="button" variant="secondary" size="sm" onClick={addCustomJhaRow}>
                + Add custom job/hazard row
              </Button>
            </div>
          </div>
        </Card>

        {/* ─── Section 9 — Workplace Violence Assessment ─── */}
        <Card padding="lg">
          <CardHeader>Section 9 — Workplace Violence Assessment</CardHeader>
          <CardDescription>If answering Yes to any question, list corrective actions taken below.</CardDescription>
          <div className="mt-4 space-y-3">
            {WORKPLACE_VIOLENCE_QUESTIONS.map((q, idx) => (
              <div key={idx} className="flex items-center justify-between gap-4 py-3 px-3 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                <span className="text-sm text-neutral-800 dark:text-neutral-200 flex-1">{q}</span>
                <div className="flex items-center gap-4 shrink-0">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`violence-${idx}`}
                      value="Yes"
                      checked={violenceAnswers[idx] === 'Yes'}
                      onChange={() => setViolenceAnswers(prev => ({ ...prev, [idx]: 'Yes' }))}
                      className="accent-brand-600"
                    />
                    <span className="text-sm">Yes</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`violence-${idx}`}
                      value="No"
                      checked={violenceAnswers[idx] === 'No'}
                      onChange={() => setViolenceAnswers(prev => ({ ...prev, [idx]: 'No' }))}
                      className="accent-brand-600"
                    />
                    <span className="text-sm">No</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Textarea
              label="List Corrective Actions Taken (if applicable)"
              value={violenceActions}
              onChange={(e) => setViolenceActions(e.target.value)}
              rows={3}
            />
          </div>
        </Card>

        {/* ─── Section 10 — Worker Acknowledgement ─── */}
        <Card padding="lg" className="border-brand-500/50 bg-brand-50/20 dark:bg-brand-900/10">
          <CardHeader>Section 10 — Worker Acknowledgement</CardHeader>
          <CardDescription className="italic mt-2 text-neutral-800 dark:text-neutral-200 border-l-4 border-brand-500 pl-3">
            I, the undersigned employee, hereby confirm the following: Thoroughly reviewed and understand the Daily Hazard Analysis / Am physically and mentally fit to perform my assigned duties / Have or will complete all permits and forms to ensure a safe work-day / Addressed and resolved all previous hazards
          </CardDescription>

          <div className="mt-6 space-y-4">
            <h3 className="font-medium text-neutral-900 dark:text-white">Signatures Collected</h3>
            {signatures.length === 0 ? (
              <p className="text-sm text-neutral-500">No signatures collected yet.</p>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {signatures.map((sig, i) => (
                  <li key={i} className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-800 flex items-center gap-4">
                    <img src={sig.dataUrl} alt={`Signature of ${sig.name}`} className="h-12 border rounded bg-white" />
                    <div>
                      <p className="font-medium text-sm text-neutral-900 dark:text-white">{sig.name}</p>
                      <p className="text-xs text-neutral-500">{new Date(sig.timestamp).toLocaleString()}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Select worker to sign</label>
                <select
                  value={signingWorker}
                  onChange={(e) => setSigningWorker(e.target.value)}
                  className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  aria-label="Select worker to sign"
                >
                  <option value="">Select yourself or a worker...</option>
                  <option value={user?.id ?? 'self'}>{user?.name} (Me)</option>
                  {employees.filter((e: any) => e.id !== user?.id).map((e: any) => (
                    <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                  ))}
                </select>
              </div>
              <Button type="button" onClick={() => setIsSigning(true)} disabled={!signingWorker}>
                Add Signature
              </Button>
            </div>
          </div>
        </Card>

        <div className="flex flex-wrap justify-end gap-3 pt-4">
          {(submitError || draftMessage) && (
            <p className={`text-sm ${submitError ? 'text-red-600 dark:text-red-400' : 'text-neutral-600 dark:text-neutral-300'}`}>
              {submitError ?? draftMessage}
            </p>
          )}
          <Button type="button" variant="secondary" size="lg" onClick={handleSaveDraft} disabled={submitting}>
            Save as Draft
          </Button>
          <Button type="button" variant="secondary" size="lg" onClick={() => setShowSavePresetModal(true)}>Save as Preset</Button>
          <Button type="submit" size="lg" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Daily Hazard Analysis'}</Button>
        </div>
      </form>

      {isSigning && (
        <SignatureModal
          fieldLabel={signingWorker === user?.id ? user?.name : (employees.find((e: any) => e.id === signingWorker)?.firstName ?? 'Worker')}
          onSave={handleSaveSignature}
          onClose={() => setIsSigning(false)}
        />
      )}

      {/* ─── Save as Preset Modal ─── */}
      {showSavePresetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSavePresetModal(false)}>
          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">Save as Preset</h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Give this preset a name (e.g. "Trench Work", "HVAC Install"). It will save Sections 2–8 so you can auto-fill them on future forms.</p>
            <div className="mt-4">
              <Input
                label="Preset Name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g. Trench Work"
                autoFocus
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowSavePresetModal(false)}>Cancel</Button>
              <Button type="button" onClick={handleSavePreset} disabled={!presetName.trim() || savingPreset}>
                {savingPreset ? 'Saving…' : 'Save Preset'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}