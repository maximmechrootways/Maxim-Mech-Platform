import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { useEmployees } from '@/contexts/EmployeesContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import SignatureModal from '@/components/pdf/SignatureModal'
import * as incidentsApi from '@/api/incidents'
import { fetchSites } from '@/api/jobs'

const INCIDENT_TYPE_OPTIONS = [
  'Injury',
  'Property Damage',
  'Equipment / Vehicle Incident',
  'Environmental Incident',
  'Safety Violation',
  'Other Incident',
] as const

type IncidentMedicalMeta = {
  injuryInvolved?: boolean
  injuryCategory?: string
  injuryDetails?: string
  takenToHospital?: boolean
  hospitalName?: string
  professionalTreatmentDetails?: string
}

export function IncidentReportNew() {
  const navigate = useNavigate()
  const { user } = useUser()
  const { employees } = useEmployees()

  // Section 1 — Preliminary Information
  const [incidentType, setIncidentType] = useState('')
  const [siteId, setSiteId] = useState('')
  const [siteName, setSiteName] = useState('')
  const [sites, setSites] = useState<{ id: string; name: string }[]>([])
  const [specificArea, setSpecificArea] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [employeesInvolved, setEmployeesInvolved] = useState<string[]>([])
  const [otherEmployees, setOtherEmployees] = useState('')
  const [injuryInvolved, setInjuryInvolved] = useState<boolean | null>(null)
  const [injuryCategory, setInjuryCategory] = useState('')
  const [injuryDetails, setInjuryDetails] = useState('')
  const [takenToHospital, setTakenToHospital] = useState<boolean | null>(null)
  const [hospitalName, setHospitalName] = useState('')
  const [professionalTreatmentDetails, setProfessionalTreatmentDetails] = useState('')

  // Section 2 — Corrective Measures
  const [actionsTaken, setActionsTaken] = useState('')
  const [correctiveActionsCompleted, setCorrectiveActionsCompleted] = useState<boolean | null>(null)

  // Section 3 — Supporting Documentation
  const [photos, setPhotos] = useState<File[]>([])
  const [documents, setDocuments] = useState<File[]>([])

  // Section 4 — Signatures (with name + timestamp like Daily Hazard)
  const [employeeSignature, setEmployeeSignature] = useState<string | null>(null)
  const [employeeSignatureMeta, setEmployeeSignatureMeta] = useState<{ name: string; timestamp: string } | null>(null)
  const [reportedBySignature, setReportedBySignature] = useState<string | null>(null)
  const [reportedBySignatureMeta, setReportedBySignatureMeta] = useState<{ name: string; timestamp: string } | null>(null)
  const [supervisorSignature, setSupervisorSignature] = useState<string | null>(null)
  const [supervisorSignatureMeta, setSupervisorSignatureMeta] = useState<{ name: string; timestamp: string } | null>(null)

  useEffect(() => {
    fetchSites().then((list) => setSites(list || [])).catch(() => setSites([]))
  }, [])

  const [signingField, setSigningField] = useState<'employee' | 'reportedBy' | 'supervisor' | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const todayStr = new Date().toISOString().slice(0, 10)

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPhotos([...photos, ...Array.from(e.target.files)])
    }
  }

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setDocuments([...documents, ...Array.from(e.target.files)])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!incidentType.trim()) return setError('Incident Type is required.')
    const chosenSiteName = siteId ? sites.find((s) => s.id === siteId)?.name ?? siteName : siteName
    if (injuryInvolved === null) return setError('Please select whether this incident involved an injury.')
    if (injuryInvolved && !injuryCategory.trim()) return setError('Please select the injury category.')
    if (injuryInvolved && takenToHospital === null) return setError('Please select whether the person was taken to a hospital.')
    if (injuryInvolved && takenToHospital && !hospitalName.trim()) return setError('Hospital name is required when the person was taken to hospital.')
    if (!chosenSiteName.trim()) return setError('Site is required.')
    if (!specificArea.trim()) return setError('Specific Area of Location is required.')
    if (!date) return setError('Date of Incident is required.')
    if (date > todayStr) return setError('Date cannot be in the future.')
    if (correctiveActionsCompleted === null) return setError('Please select if corrective actions are completed.')
    if (!reportedBySignature) return setError('Reported By Signature is mandatory.')
    if (!supervisorSignature) return setError('Supervisor Signature is mandatory.')

    setError(null)
    setSubmitting(true)

    // Store actual person names (not IDs) for display
    const involvedNames = employeesInvolved.map((userId) => {
      const e = employees.find((em: any) => em.id === userId)
      return e ? `${e.firstName} ${e.lastName}`.trim() || e.email : userId
    })
    if (otherEmployees.trim()) involvedNames.push(otherEmployees.trim())

    try {
      const incidentMedicalMeta: IncidentMedicalMeta = {
        injuryInvolved: injuryInvolved ?? undefined,
        injuryCategory: injuryInvolved ? injuryCategory.trim() || undefined : undefined,
        injuryDetails: injuryInvolved ? injuryDetails.trim() || undefined : undefined,
        takenToHospital: injuryInvolved ? (takenToHospital ?? undefined) : undefined,
        hospitalName: injuryInvolved && takenToHospital ? hospitalName.trim() || undefined : undefined,
        professionalTreatmentDetails:
          injuryInvolved && takenToHospital ? professionalTreatmentDetails.trim() || undefined : undefined,
      }

      const report = await incidentsApi.createIncident({
        title: `${incidentType} Incident`,
        incidentType,
        siteName: chosenSiteName,
        siteId: siteId || undefined,
        specificArea,
        date,
        description: description.trim() || undefined,
        employeesInvolved: involvedNames,
        actionsTaken,
        correctiveActionsCompleted,
        employeeSignature: employeeSignature || undefined,
        reportedBySignature,
        supervisorSignature,
        signatureMeta: {
          incidentMedical: incidentMedicalMeta,
          ...(employeeSignatureMeta && { employee: employeeSignatureMeta }),
          ...(reportedBySignatureMeta && { reportedBy: reportedBySignatureMeta }),
          ...(supervisorSignatureMeta && { supervisor: supervisorSignatureMeta }),
        },
        status: 'open',
      })
      navigate(`/safety/incidents/${report.id}`)
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message ?? 'Failed to create report'
      setError(typeof msg === 'string' ? msg : 'Failed to create report')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl pb-12">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/safety" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
        <span className="text-neutral-400">·</span>
        <Link to="/safety/incidents" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">Incident reports</Link>
      </div>
      <Breadcrumbs items={[{ label: 'Incident Reports', to: '/safety/incidents' }, { label: 'New Incident' }]} />
      <div>
        <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">New Incident Report</h1>
        <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">Please provide details of the incident below.</p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card padding="lg">
          <CardHeader>Section 1 — Preliminary Information</CardHeader>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Incident Type *</label>
              <select
                value={incidentType}
                onChange={(e) => setIncidentType(e.target.value)}
                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                required
                aria-label="Incident Type"
              >
                <option value="">Select incident type...</option>
                {INCIDENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Site *</label>
                {sites.length > 0 ? (
                  <select
                    value={siteId}
                    onChange={(e) => {
                      const id = e.target.value
                      setSiteId(id)
                      setSiteName(id ? sites.find((s) => s.id === id)?.name ?? '' : '')
                    }}
                    className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    required
                    aria-label="Site"
                  >
                    <option value="">Select site...</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <Input label="" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="e.g. North Site" required />
                )}
              </div>
              <Input
                label="Specific Area of Location"
                value={specificArea}
                onChange={(e) => setSpecificArea(e.target.value)}
                placeholder="e.g. 3rd floor stairwell, loading dock B"
                required
              />
            </div>
            <Input
              label="Date of Incident"
              type="date"
              max={todayStr}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Employee(s) Involved (Optional)</label>
              <div className="max-h-48 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 bg-neutral-50 dark:bg-neutral-900/50">
                {employees.length === 0 ? (
                  <p className="text-sm text-neutral-500 p-2">No employees found.</p>
                ) : (
                  employees.map(emp => (
                    <label key={emp.id} className="flex items-center gap-2 p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={employeesInvolved.includes(emp.id)}
                        onChange={(e) => {
                          if (e.target.checked) setEmployeesInvolved([...employeesInvolved, emp.id])
                          else setEmployeesInvolved(employeesInvolved.filter(id => id !== emp.id))
                        }}
                        className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">{emp.firstName} {emp.lastName}</span>
                    </label>
                  ))
                )}
              </div>
              <Input
                label="Other Individuals (Not in system)"
                value={otherEmployees}
                onChange={(e) => setOtherEmployees(e.target.value)}
                placeholder="Names separated by commas"
              />
            </div>

            <div className="space-y-3 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">Injury & Professional Medical Treatment</p>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Did this incident involve an injury? <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="injury-involved"
                      checked={injuryInvolved === true}
                      onChange={() => {
                        setInjuryInvolved(true)
                      }}
                    />
                    <span className="text-sm">Yes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="injury-involved"
                      checked={injuryInvolved === false}
                      onChange={() => {
                        setInjuryInvolved(false)
                        setInjuryCategory('')
                        setInjuryDetails('')
                        setTakenToHospital(null)
                        setHospitalName('')
                        setProfessionalTreatmentDetails('')
                      }}
                    />
                    <span className="text-sm">No</span>
                  </label>
                </div>
              </div>

              {injuryInvolved && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Injury category *</label>
                    <select
                      value={injuryCategory}
                      onChange={(e) => setInjuryCategory(e.target.value)}
                      className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                      aria-label="Injury category"
                    >
                      <option value="">Select injury category...</option>
                      <option value="Fracture / Broken Bone">Fracture / Broken Bone</option>
                      <option value="Sprain / Strain">Sprain / Strain</option>
                      <option value="Laceration / Cut">Laceration / Cut</option>
                      <option value="Burn">Burn</option>
                      <option value="Head Injury">Head Injury</option>
                      <option value="Other Injury">Other Injury</option>
                    </select>
                  </div>
                  <Textarea
                    label="Injury details (optional)"
                    value={injuryDetails}
                    onChange={(e) => setInjuryDetails(e.target.value)}
                    rows={3}
                    placeholder="e.g. Broken leg, right side; first aid provided on-site"
                  />
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Was the person taken to a hospital? <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="taken-hospital"
                          checked={takenToHospital === true}
                          onChange={() => setTakenToHospital(true)}
                        />
                        <span className="text-sm">Yes</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="taken-hospital"
                          checked={takenToHospital === false}
                          onChange={() => {
                            setTakenToHospital(false)
                            setHospitalName('')
                            setProfessionalTreatmentDetails('')
                          }}
                        />
                        <span className="text-sm">No</span>
                      </label>
                    </div>
                  </div>

                  {takenToHospital && (
                    <div className="space-y-3 rounded-lg bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 p-3">
                      <Input
                        label="Hospital name"
                        value={hospitalName}
                        onChange={(e) => setHospitalName(e.target.value)}
                        placeholder="e.g. Humber River Hospital"
                        required={takenToHospital === true}
                      />
                      <Textarea
                        label="Professional medical treatment details (optional)"
                        value={professionalTreatmentDetails}
                        onChange={(e) => setProfessionalTreatmentDetails(e.target.value)}
                        rows={3}
                        placeholder="Details on treatment provided by medical professionals"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </Card>

        <Card padding="lg">
          <CardHeader>Describe the Incident</CardHeader>
          <CardDescription>Provide a clear description of what happened before corrective measures.</CardDescription>
          <div className="mt-4">
            <Textarea
              label="Incident description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened? Include circumstances, location details, and people involved."
              rows={4}
            />
          </div>
        </Card>

        <Card padding="lg">
          <CardHeader>Section 2 — Corrective Measures</CardHeader>
          <div className="mt-4 space-y-4">
            <Textarea
              label="Describe Actions Taken"
              value={actionsTaken}
              onChange={(e) => setActionsTaken(e.target.value)}
              placeholder="Provide a description of any immediate actions taken post-incident (e.g. repair/replace, workplace changes, first aid treatment, etc.)"
              rows={4}
            />
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Have corrective actions been completed? <span className="text-red-500">*</span></label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="completed" checked={correctiveActionsCompleted === true} onChange={() => setCorrectiveActionsCompleted(true)} />
                  <span className="text-sm">Yes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="completed" checked={correctiveActionsCompleted === false} onChange={() => setCorrectiveActionsCompleted(false)} />
                  <span className="text-sm">No</span>
                </label>
              </div>
            </div>
          </div>
        </Card>

        <Card padding="lg">
          <CardHeader>Section 3 — Supporting Documentation</CardHeader>
          <div className="mt-4 space-y-6">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Take Photo</label>
              <input type="file" accept="image/jpeg,image/png" capture="environment" multiple onChange={handlePhotoUpload} className="block w-full text-sm text-neutral-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-brand-100 file:text-brand-800" aria-label="Take or upload photos" />
              {photos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {photos.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 px-3 py-1 rounded-full text-sm">
                      <span className="truncate max-w-[150px]">{p.name}</span>
                      <button type="button" onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Upload Documents or Photos</label>
              <input type="file" accept="application/pdf,image/jpeg,image/png" multiple onChange={handleDocumentUpload} className="block w-full text-sm text-neutral-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-neutral-200 file:text-neutral-800" aria-label="Upload documents or photos" />
              {documents.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {documents.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 px-3 py-1 rounded-full text-sm">
                      <span className="truncate max-w-[150px]">{d.name}</span>
                      <button type="button" onClick={() => setDocuments(documents.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card padding="lg">
          <CardHeader>Section 4 — Signatures</CardHeader>
          <CardDescription>Named and timestamped signatures (like Daily Hazard Analysis).</CardDescription>
          <div className="mt-4 space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-neutral-200 dark:border-neutral-700 pb-4">
              <div>
                <p className="font-medium text-neutral-900 dark:text-white">Employee Signature (Optional)</p>
                {employeeSignature ? (
                  <div className="mt-2">
                    <img src={employeeSignature} alt="Employee Signature" className="h-16 bg-white dark:bg-neutral-100 rounded border border-neutral-200" />
                    {employeeSignatureMeta && <p className="text-xs text-neutral-500 mt-1">{employeeSignatureMeta.name} · {new Date(employeeSignatureMeta.timestamp).toLocaleString()}</p>}
                  </div>
                ) : <p className="text-sm text-neutral-500">Not signed</p>}
              </div>
              <Button type="button" variant="outline" onClick={() => setSigningField('employee')}>
                {employeeSignature ? 'Re-sign' : 'Sign'}
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-neutral-200 dark:border-neutral-700 pb-4">
              <div>
                <p className="font-medium text-neutral-900 dark:text-white">Reported By Signature <span className="text-red-500">*</span></p>
                {reportedBySignature ? (
                  <div className="mt-2">
                    <img src={reportedBySignature} alt="Reported By Signature" className="h-16 bg-white dark:bg-neutral-100 rounded border border-neutral-200" />
                    {reportedBySignatureMeta && <p className="text-xs text-neutral-500 mt-1">{reportedBySignatureMeta.name} · {new Date(reportedBySignatureMeta.timestamp).toLocaleString()}</p>}
                  </div>
                ) : <p className="text-sm text-red-500">Signature required</p>}
              </div>
              <Button type="button" variant="outline" onClick={() => setSigningField('reportedBy')}>
                {reportedBySignature ? 'Re-sign' : 'Sign'}
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between pb-2">
              <div>
                <p className="font-medium text-neutral-900 dark:text-white">Supervisor Signature <span className="text-red-500">*</span></p>
                {supervisorSignature ? (
                  <div className="mt-2">
                    <img src={supervisorSignature} alt="Supervisor Signature" className="h-16 bg-white dark:bg-neutral-100 rounded border border-neutral-200" />
                    {supervisorSignatureMeta && <p className="text-xs text-neutral-500 mt-1">{supervisorSignatureMeta.name} · {new Date(supervisorSignatureMeta.timestamp).toLocaleString()}</p>}
                  </div>
                ) : <p className="text-sm text-red-500">Signature required</p>}
              </div>
              <Button type="button" variant="outline" onClick={() => setSigningField('supervisor')}>
                {supervisorSignature ? 'Re-sign' : 'Sign'}
              </Button>
            </div>
          </div>
        </Card>

        <div className="flex gap-3 justify-end">
          <Link to="/safety/incidents">
            <Button type="button" variant="ghost">Cancel</Button>
          </Link>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Report'}
          </Button>
        </div>
      </form>

      {signingField && (
        <SignatureModal
          fieldLabel={signingField === 'employee' ? 'Employee' : signingField === 'reportedBy' ? 'Reported By' : 'Supervisor'}
          onSave={(data) => {
            const meta = { name: user?.name ?? 'Unknown', timestamp: new Date().toISOString() }
            if (signingField === 'employee') { setEmployeeSignature(data); setEmployeeSignatureMeta(meta) }
            if (signingField === 'reportedBy') { setReportedBySignature(data); setReportedBySignatureMeta(meta) }
            if (signingField === 'supervisor') { setSupervisorSignature(data); setSupervisorSignatureMeta(meta) }
            setSigningField(null)
          }}
          onClose={() => setSigningField(null)}
        />
      )}
    </div>
  )
}