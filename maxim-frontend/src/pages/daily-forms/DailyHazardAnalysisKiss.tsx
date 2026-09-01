import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { useEmployees } from '@/contexts/EmployeesContext'
import { fetchJobs, fetchMyJobs } from '@/api/jobs'
import { createDailyHazardSubmission } from '@/api/dailyHazardAnalysis'
import { api } from '@/api'
import { KissFormShell } from '@/components/forms/kiss/KissFormShell'
import { KissSection } from '@/components/forms/kiss/KissSection'
import { KissField } from '@/components/forms/kiss/KissField'
import { KissValidationSummary } from '@/components/forms/kiss/KissValidationSummary'
import { Card, CardDescription, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import SignatureModal from '@/components/pdf/SignatureModal'

const QUICK_ACTIVITIES = ['ELECTRICAL WORK', 'PLUMBING WORK', 'EQUIPMENT/TOOL USE', 'WORKING AT HEIGHTS']
const QUICK_CONTROLS = ['HOUSEKEEPING', 'PPE', 'FALL PREVENTION PLAN', 'TRAINING CERTIFICATIONS']
const QUICK_PPE = ['HEAD PROTECTION', 'FOOT PROTECTION', 'EYE PROTECTION', 'HAND PROTECTION', 'HI-VIS PROTECTION']

export function DailyHazardAnalysisKiss() {
  const navigate = useNavigate()
  const { user } = useUser()
  const { employees } = useEmployees()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [project, setProject] = useState('')
  const [musterPoint, setMusterPoint] = useState('')
  const [supervisorId, setSupervisorId] = useState('')
  const [jobNumber, setJobNumber] = useState('')
  const [activities, setActivities] = useState<string[]>([])
  const [controls, setControls] = useState<string[]>([])
  const [ppe, setPpe] = useState<string[]>([])
  const [jobs, setJobs] = useState<{ id: string; title: string; siteName?: string }[]>([])
  const [supervisorOptions, setSupervisorOptions] = useState<Array<{ id: string; name: string }>>([])
  const [submitting, setSubmitting] = useState(false)
  const [missing, setMissing] = useState<string[]>([])

  const [signatures, setSignatures] = useState<{ id: string; name: string; timestamp: string; dataUrl: string }[]>([])
  const [signingWorker, setSigningWorker] = useState('')
  const [isSigning, setIsSigning] = useState(false)

  useEffect(() => {
    const load = user?.role === 'supervisor' ? fetchMyJobs() : fetchJobs()
    load.then((data) => setJobs(data as any)).catch(() => setJobs([]))
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
        // Fallback for older backends: derive supervisor list from employees context.
        setSupervisorOptions(
          employees
            .filter((e: any) => e.role === 'supervisor' || e.role === 'owner')
            .map((s: any) => ({
              id: String(s.id ?? ''),
              name: `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim(),
            }))
            .filter((s) => s.id && s.name)
        )
      })
  }, [employees])

  const supervisors = useMemo(
    () => employees.filter((e: any) => e.role === 'supervisor' || e.role === 'owner'),
    [employees]
  )

  const toggle = (list: string[], setList: (items: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  const resolveWorkerLabel = (workerId: string): string => {
    if (!workerId) return ''
    if (workerId === user?.id || workerId === 'self') return user?.name ?? 'Me'
    const emp = employees.find((e: any) => e.id === workerId)
    return emp ? `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim() : 'Worker'
  }

  const handleSaveSignature = (dataUrl: string) => {
    if (!signingWorker) return
    const name = resolveWorkerLabel(signingWorker)
    setSignatures((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: name || 'Worker',
        timestamp: new Date().toISOString(),
        dataUrl,
      },
    ])
    setIsSigning(false)
    setSigningWorker('')
  }

  const submit = async () => {
    const missingLabels: string[] = []
    if (!project) missingLabels.push('Project')
    if (!musterPoint.trim()) missingLabels.push('Muster Point')
    if (!supervisorId) missingLabels.push('Supervisor')
    if (!jobNumber.trim()) missingLabels.push('Job Number')
    if (signatures.length === 0) missingLabels.push('At least one worker signature')
    if (missingLabels.length > 0) {
      setMissing(missingLabels)
      return
    }
    setMissing([])
    setSubmitting(true)
    try {
      const job = jobs.find((j) => j.id === project)
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
        activities,
        hazards: [],
        controls,
        ppe,
        signatures,
      })
      navigate('/safety/daily-hazard-analysis')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      <Link to="/library" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
        ← Forms & Documents
      </Link>
      <KissFormShell
        title="Daily Hazard Analysis"
        description="Short version for fast daily completion. Collect drawn signatures from each worker below — same as the full form."
        currentStep={0}
        totalSteps={1}
        onSubmit={submit}
        submitDisabled={submitting}
      >
        <KissValidationSummary missingLabels={missing} />
        <KissSection title="Required Information">
          <KissField id="date" type="date" label="Date" required value={date} onChange={(v) => setDate(String(v))} />
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Project *</label>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="w-full min-h-[48px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
              aria-label="Select project"
            >
              <option value="">Select project...</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </div>
          <KissField id="muster" label="Muster Point" required value={musterPoint} onChange={(v) => setMusterPoint(String(v))} />
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Supervisor *</label>
            <select
              value={supervisorId}
              onChange={(e) => setSupervisorId(e.target.value)}
              className="w-full min-h-[48px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
              aria-label="Select supervisor"
            >
              <option value="">Select supervisor...</option>
              {supervisorOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <KissField id="jobNumber" label="Job Number" required value={jobNumber} onChange={(v) => setJobNumber(String(v))} />
        </KissSection>

        <KissSection title="Quick Selections" description="Choose what applies today.">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Activities</p>
          {QUICK_ACTIVITIES.map((item) => (
            <KissField
              key={item}
              id={`act-${item}`}
              type="checkbox"
              label={item}
              value={activities.includes(item)}
              onChange={() => toggle(activities, setActivities, item)}
            />
          ))}
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 pt-2">Controls</p>
          {QUICK_CONTROLS.map((item) => (
            <KissField
              key={item}
              id={`ctrl-${item}`}
              type="checkbox"
              label={item}
              value={controls.includes(item)}
              onChange={() => toggle(controls, setControls, item)}
            />
          ))}
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 pt-2">PPE</p>
          {QUICK_PPE.map((item) => (
            <KissField
              key={item}
              id={`ppe-${item}`}
              type="checkbox"
              label={item}
              value={ppe.includes(item)}
              onChange={() => toggle(ppe, setPpe, item)}
            />
          ))}
        </KissSection>

        <Card padding="lg" className="border-brand-500/50 bg-brand-50/20 dark:bg-brand-900/10">
          <CardHeader>Section 10 — Worker acknowledgement</CardHeader>
          <CardDescription className="italic mt-2 text-neutral-800 dark:text-neutral-200 border-l-4 border-brand-500 pl-3">
            I, the undersigned employee, hereby confirm the following: Thoroughly reviewed and understand the Daily Hazard Analysis / Am physically and mentally fit to perform my assigned duties / Have or will complete all permits and forms to ensure a safe work-day / Addressed and resolved all previous hazards
          </CardDescription>

          <div className="mt-6 space-y-4">
            <h3 className="font-medium text-neutral-900 dark:text-white">Signatures collected</h3>
            {signatures.length === 0 ? (
              <p className="text-sm text-neutral-500">No signatures collected yet.</p>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {signatures.map((sig) => (
                  <li
                    key={sig.id}
                    className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-800 flex items-center gap-4"
                  >
                    <img src={sig.dataUrl} alt="" className="h-12 border rounded bg-white object-contain min-w-[100px]" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-neutral-900 dark:text-white">{sig.name}</p>
                      <p className="text-xs text-neutral-500 mt-1">{new Date(sig.timestamp).toLocaleString()}</p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"
                      onClick={() => setSignatures((prev) => prev.filter((s) => s.id !== sig.id))}
                    >
                      Remove
                    </button>
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
                  className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                  aria-label="Select worker to sign"
                >
                  <option value="">Select yourself or a worker...</option>
                  <option value={user?.id ?? 'self'}>{user?.name} (Me)</option>
                  {employees
                    .filter((e: any) => e.id !== user?.id)
                    .map((e: any) => (
                      <option key={e.id} value={e.id}>
                        {e.firstName} {e.lastName}
                      </option>
                    ))}
                </select>
              </div>
              <Button type="button" onClick={() => setIsSigning(true)} disabled={!signingWorker}>
                Add signature
              </Button>
            </div>
          </div>
        </Card>
      </KissFormShell>

      {isSigning && (
        <SignatureModal
          fieldLabel={resolveWorkerLabel(signingWorker)}
          onSave={handleSaveSignature}
          onClose={() => setIsSigning(false)}
        />
      )}
    </div>
  )
}
