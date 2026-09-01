import { useState, useEffect } from 'react'
import { Link, useLocation, useParams, useNavigate } from 'react-router-dom'
import { useEmployees } from '@/contexts/EmployeesContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import * as incidentsApi from '@/api/incidents'

type IncidentItem = {
  id: string
  title: string
  siteId?: string
  siteName?: string
  date?: string
  status?: string
  severity?: string
  incidentType?: string
  description?: string
  reportedBy?: string
  reportedAt?: string
  specificArea?: string
  employeesInvolved?: string[]
  actionsTaken?: string
  correctiveActionsCompleted?: boolean
  photos?: string[]
  documents?: string[]
  employeeSignature?: string
  reportedBySignature?: string
  supervisorSignature?: string
  signatureMeta?: {
    employee?: { name: string; timestamp: string }
    reportedBy?: { name: string; timestamp: string }
    supervisor?: { name: string; timestamp: string }
    incidentMedical?: {
      injuryInvolved?: boolean
      injuryCategory?: string
      injuryDetails?: string
      takenToHospital?: boolean
      hospitalName?: string
      professionalTreatmentDetails?: string
    }
  }
}

export function IncidentDetail() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { employees } = useEmployees()
  const [item, setItem] = useState<IncidentItem | null>(null)
  const idToName = Object.fromEntries(employees.map((e: any) => [e.id, `${e.firstName} ${e.lastName}`.trim() || e.email]))
  const resolveEmployeeDisplay = (value: string) => idToName[value] || value
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editForm, setEditForm] = useState({
    title: '',
    siteName: '',
    date: '',
    specificArea: '',
    employeesInvolved: [] as string[],
    actionsTaken: '',
    correctiveActionsCompleted: false,
    description: '',
    status: 'open' as string,
  })
  const fromCompletedForms = new URLSearchParams(location.search).get('from') === 'completed-forms'
  const healthSafetyTo = fromCompletedForms ? '/library?view=submissions&from=safety' : '/safety'
  const incidentsTo = fromCompletedForms ? '/safety/incidents?from=completed-forms' : '/safety/incidents'

  const load = () => {
    if (!id) return
    incidentsApi.fetchIncident(id).then((data: IncidentItem) => {
      setItem(data)
      const raw = Array.isArray(data.employeesInvolved) ? data.employeesInvolved : []
      const asNames = raw.map((v: string) => {
        const emp = employees.find((e: any) => e.id === v)
        return emp ? `${emp.firstName} ${emp.lastName}`.trim() || emp.email : v
      })
      setEditForm({
        title: data.title ?? '',
        siteName: data.siteName ?? '',
        date: data.date ?? '',
        specificArea: data.specificArea ?? '',
        employeesInvolved: asNames,
        actionsTaken: data.actionsTaken ?? '',
        correctiveActionsCompleted: data.correctiveActionsCompleted ?? false,
        description: data.description ?? '',
        status: data.status ?? 'open',
      })
    }).catch(() => setItem(null)).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [id])

  useEffect(() => {
    if (!item || editing) return
    const raw = Array.isArray(item.employeesInvolved) ? item.employeesInvolved : []
    const asNames = raw.map((v: string) => {
      const emp = employees.find((e: any) => e.id === v)
      return emp ? `${emp.firstName} ${emp.lastName}`.trim() || emp.email : v
    })
    setEditForm((prev) => (prev.employeesInvolved.join(',') !== asNames.join(',') ? { ...prev, employeesInvolved: asNames } : prev))
  }, [item?.id, employees, editing])

  const handleSave = async () => {
    if (!id || !item) return
    setSaving(true)
    try {
      await incidentsApi.updateIncident(id, {
        title: editForm.title.trim(),
        siteName: editForm.siteName.trim() || undefined,
        date: editForm.date || undefined,
        specificArea: editForm.specificArea.trim() || undefined,
        employeesInvolved: editForm.employeesInvolved,
        actionsTaken: editForm.actionsTaken.trim() || undefined,
        correctiveActionsCompleted: editForm.correctiveActionsCompleted,
        description: editForm.description.trim() || undefined,
        status: editForm.status,
      })
      setItem((prev) => prev && { ...prev, ...editForm })
      setEditing(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !window.confirm('Delete this incident report?')) return
    setDeleting(true)
    try {
      await incidentsApi.deleteIncident(id)
      navigate(incidentsTo)
    } finally {
      setDeleting(false)
    }
  }

  if (loading || !item) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={healthSafetyTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
          <span className="text-neutral-400">·</span>
          <Link to={incidentsTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">Incident reports</Link>
        </div>
        <Card padding="lg">{loading ? <p className="text-sm text-neutral-500">Loading…</p> : <p className="text-sm text-neutral-500">Incident not found.</p>}</Card>
      </div>
    )
  }

  const photos = Array.isArray(item.photos) ? item.photos : []
  const documents = Array.isArray(item.documents) ? item.documents : []
  const employeesInvolved = Array.isArray(item.employeesInvolved) ? item.employeesInvolved : []
  const incidentMedical = item.signatureMeta?.incidentMedical

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link to={healthSafetyTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
        <span className="text-neutral-400">·</span>
        <Link to={incidentsTo} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">Incident reports</Link>
      </div>
      <div className="no-print flex flex-wrap items-start justify-between gap-4">
        <div>
          {editing ? (
            <div className="space-y-4 max-w-2xl">
              <Input label="Incident type (title)" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} />
              <Input label="Site name" value={editForm.siteName} onChange={(e) => setEditForm((f) => ({ ...f, siteName: e.target.value }))} />
              <Input label="Date of incident" type="date" value={editForm.date} onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))} />
              <Input label="Specific area of location" value={editForm.specificArea} onChange={(e) => setEditForm((f) => ({ ...f, specificArea: e.target.value }))} />
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Employees involved (one per line)</label>
                <textarea
                  className="w-full min-h-[80px] px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  value={editForm.employeesInvolved.join('\n')}
                  onChange={(e) => setEditForm((f) => ({ ...f, employeesInvolved: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) }))}
                  placeholder="One name per line"
                />
              </div>
              <Textarea label="Actions taken" value={editForm.actionsTaken} onChange={(e) => setEditForm((f) => ({ ...f, actionsTaken: e.target.value }))} rows={3} />
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="corrective-done"
                  checked={editForm.correctiveActionsCompleted}
                  onChange={(e) => setEditForm((f) => ({ ...f, correctiveActionsCompleted: e.target.checked }))}
                  className="rounded border-neutral-300"
                />
                <label htmlFor="corrective-done" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Corrective actions completed</label>
              </div>
              <Textarea label="Description" value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} rows={3} />
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full min-h-[44px] px-4 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  aria-label="Incident status"
                >
                  <option value="open">Open</option>
                  <option value="under-review">Under review</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">{item.title}</h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">{item.siteName || '—'} · {item.date}</p>
            </>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => window.print()}>Export to PDF</Button>
            <Badge variant={item.status === 'closed' ? 'success' : item.status === 'open' ? 'warning' : 'default'}>{item.status}</Badge>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            <Button size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button>
          </div>
        )}
      </div>

      {!editing && (
        <div className="space-y-6">
          <Card padding="lg">
            <CardHeader>Preliminary Information</CardHeader>
            <ul className="mt-3 space-y-2 text-sm">
              <li><span className="font-medium text-neutral-600 dark:text-neutral-400">Incident type</span> <span className="text-neutral-900 dark:text-white">{item.title}</span></li>
              <li><span className="font-medium text-neutral-600 dark:text-neutral-400">Site</span> <span className="text-neutral-900 dark:text-white">{item.siteName || '—'}</span></li>
              <li><span className="font-medium text-neutral-600 dark:text-neutral-400">Date</span> <span className="text-neutral-900 dark:text-white">{item.date || '—'}</span></li>
              <li><span className="font-medium text-neutral-600 dark:text-neutral-400">Specific area of location</span> <span className="text-neutral-900 dark:text-white">{item.specificArea || '—'}</span></li>
              <li><span className="font-medium text-neutral-600 dark:text-neutral-400">Employees involved</span> <span className="text-neutral-900 dark:text-white">{employeesInvolved.length ? employeesInvolved.map(resolveEmployeeDisplay).join(', ') : '—'}</span></li>
              <li><span className="font-medium text-neutral-600 dark:text-neutral-400">Reported by</span> <span className="text-neutral-900 dark:text-white">{item.reportedBy || '—'}</span></li>
            </ul>
          </Card>

          <Card padding="lg">
            <CardHeader>Corrective Measures</CardHeader>
            <div className="mt-3 space-y-2 text-sm">
              <p><span className="font-medium text-neutral-600 dark:text-neutral-400">Actions taken</span></p>
              <p className="text-neutral-900 dark:text-white whitespace-pre-wrap">{item.actionsTaken || '—'}</p>
              <p><span className="font-medium text-neutral-600 dark:text-neutral-400">Corrective actions completed</span> <span className="text-neutral-900 dark:text-white">{item.correctiveActionsCompleted ? 'Yes' : 'No'}</span></p>
            </div>
          </Card>

          <Card padding="lg">
            <CardHeader>Injury & Professional Medical Treatment</CardHeader>
            <div className="mt-3 space-y-2 text-sm">
              <p>
                <span className="font-medium text-neutral-600 dark:text-neutral-400">Injury involved</span>{' '}
                <span className="text-neutral-900 dark:text-white">
                  {incidentMedical?.injuryInvolved === true ? 'Yes' : incidentMedical?.injuryInvolved === false ? 'No' : '—'}
                </span>
              </p>
              {incidentMedical?.injuryInvolved && (
                <>
                  <p>
                    <span className="font-medium text-neutral-600 dark:text-neutral-400">Injury category</span>{' '}
                    <span className="text-neutral-900 dark:text-white">{incidentMedical.injuryCategory || '—'}</span>
                  </p>
                  <p>
                    <span className="font-medium text-neutral-600 dark:text-neutral-400">Injury details</span>{' '}
                    <span className="text-neutral-900 dark:text-white">{incidentMedical.injuryDetails || '—'}</span>
                  </p>
                  <p>
                    <span className="font-medium text-neutral-600 dark:text-neutral-400">Taken to hospital</span>{' '}
                    <span className="text-neutral-900 dark:text-white">
                      {incidentMedical.takenToHospital === true ? 'Yes' : incidentMedical.takenToHospital === false ? 'No' : '—'}
                    </span>
                  </p>
                  {incidentMedical.takenToHospital && (
                    <>
                      <p>
                        <span className="font-medium text-neutral-600 dark:text-neutral-400">Hospital name</span>{' '}
                        <span className="text-neutral-900 dark:text-white">{incidentMedical.hospitalName || '—'}</span>
                      </p>
                      <p>
                        <span className="font-medium text-neutral-600 dark:text-neutral-400">Professional treatment details</span>{' '}
                        <span className="text-neutral-900 dark:text-white">{incidentMedical.professionalTreatmentDetails || '—'}</span>
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          </Card>

          {item.description && (
            <Card padding="lg">
              <CardHeader>Description</CardHeader>
              <p className="mt-2 text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{item.description}</p>
            </Card>
          )}

          {(photos.length > 0 || documents.length > 0) && (
            <Card padding="lg">
              <CardHeader>Supporting Documentation</CardHeader>
              <CardDescription>Photos and documents attached to this report.</CardDescription>
              <div className="mt-4 space-y-4">
                {photos.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">Photos</p>
                    <div className="flex flex-wrap gap-3">
                      {photos.map((url, idx) => (
                        <div key={idx}>
                          {url.startsWith('data:image') ? (
                            <img src={url} alt={`Photo ${idx + 1}`} className="max-h-40 rounded-lg border border-neutral-200 dark:border-neutral-700 object-contain" />
                          ) : (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">View photo {idx + 1}</a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {documents.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">Documents</p>
                    <ul className="space-y-1">
                      {documents.map((url, idx) => (
                        <li key={idx}>
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">Document {idx + 1}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card padding="lg">
            <CardHeader>Signatures</CardHeader>
            <CardDescription>Named and timestamped signatures.</CardDescription>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {item.employeeSignature && (
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase mb-1">Employee (optional)</p>
                  <img src={item.employeeSignature} alt="Employee signature" className="max-h-16 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 object-contain" />
                  {item.signatureMeta?.employee && (
                    <p className="text-xs text-neutral-500 mt-1">{item.signatureMeta.employee.name} · {new Date(item.signatureMeta.employee.timestamp).toLocaleString()}</p>
                  )}
                </div>
              )}
              {item.reportedBySignature && (
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase mb-1">Reported by</p>
                  <img src={item.reportedBySignature} alt="Reported by signature" className="max-h-16 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 object-contain" />
                  {item.signatureMeta?.reportedBy && (
                    <p className="text-xs text-neutral-500 mt-1">{item.signatureMeta.reportedBy.name} · {new Date(item.signatureMeta.reportedBy.timestamp).toLocaleString()}</p>
                  )}
                </div>
              )}
              {item.supervisorSignature && (
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase mb-1">Supervisor</p>
                  <img src={item.supervisorSignature} alt="Supervisor signature" className="max-h-16 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 object-contain" />
                  {item.signatureMeta?.supervisor && (
                    <p className="text-xs text-neutral-500 mt-1">{item.signatureMeta.supervisor.name} · {new Date(item.signatureMeta.supervisor.timestamp).toLocaleString()}</p>
                  )}
                </div>
              )}
              {!item.employeeSignature && !item.reportedBySignature && !item.supervisorSignature && (
                <p className="text-sm text-neutral-500">No signatures on file.</p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
