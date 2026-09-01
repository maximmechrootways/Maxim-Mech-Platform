import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { useUser } from '@/contexts/UserContext'
import { useSignableTemplates } from '@/contexts/SignableTemplatesContext'
import { useSignableSubmissions } from '@/contexts/SignableSubmissionsContext'
import { fetchDailyFormsMyTeam, assignDailyForm, passAlongFormAssignment } from '@/api/library'

type FormPeriod = 'daily' | 'monthly' | 'yearly'

const CAN_ASSIGN_ROLES = ['supervisor', 'owner', 'hr'] as const

export function DailyForms() {
  const { user } = useUser()
  const { templates } = useSignableTemplates()
  const { submissions: signableSubmissions, dailyForms, refetchDailyForms } = useSignableSubmissions()
  const [activeTab, setActiveTab] = useState<FormPeriod>('daily')
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showPassAlongModal, setShowPassAlongModal] = useState(false)
  const [passingAssignmentId, setPassingAssignmentId] = useState<string | null>(null)
  const [passingNote, setPassingNote] = useState('')
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([])
  const [assignTemplateId, setAssignTemplateId] = useState('')
  const [assignUserIds, setAssignUserIds] = useState<string[]>([])
  const [assignDueDate, setAssignDueDate] = useState(new Date().toISOString().slice(0, 10))
  const [assignSchedule, setAssignSchedule] = useState<FormPeriod>('daily')
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  const canAssign = user?.role && CAN_ASSIGN_ROLES.includes(user.role as any)

  useEffect(() => {
    if (canAssign && (showAssignModal || showPassAlongModal)) {
      fetchDailyFormsMyTeam().then(setTeamMembers).catch(() => setTeamMembers([]))
    }
  }, [canAssign, showAssignModal, showPassAlongModal])

  const activeTemplates = templates.filter((t) => t.active !== false)
  const toggleAssignUser = (id: string) => {
    setAssignUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  const handleAssignSubmit = async () => {
    if (!assignTemplateId || assignUserIds.length === 0) {
      setAssignError('Select a form and at least one team member.')
      return
    }
    setAssignError(null)
    setAssigning(true)
    try {
      await assignDailyForm({
        signableFormTemplateId: assignTemplateId,
        assignedToUserIds: assignUserIds,
        dueDate: assignDueDate,
        schedule: assignSchedule,
      })
      await refetchDailyForms()
      setShowAssignModal(false)
      setAssignTemplateId('')
      setAssignUserIds([])
      setAssignDueDate(new Date().toISOString().slice(0, 10))
      setAssignSchedule('daily')
    } catch (e: any) {
      setAssignError(e?.response?.data?.message || e?.message || 'Failed to assign form.')
    } finally {
      setAssigning(false)
    }
  }
  const handlePassAlongSubmit = async () => {
    if (!passingAssignmentId || assignUserIds.length !== 1) {
      setAssignError('Select exactly one team member to pass this to.')
      return
    }
    setAssignError(null)
    setAssigning(true)
    try {
      await passAlongFormAssignment({
        assignmentId: passingAssignmentId,
        toUserId: assignUserIds[0],
        note: passingNote,
        dueDate: assignDueDate,
      })
      await refetchDailyForms()
      setShowPassAlongModal(false)
      setPassingAssignmentId(null)
      setAssignUserIds([])
      setPassingNote('')
      setAssignDueDate(new Date().toISOString().slice(0, 10))
    } catch (e: any) {
      setAssignError(e?.response?.data?.message || e?.message || 'Failed to pass form along.')
    } finally {
      setAssigning(false)
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const formsAwaitingMySignature = user?.id
    ? signableSubmissions.filter((s) => {
      if (s.workflowType !== 'site_meeting' || !s.siteSignerIds?.includes(user.id)) return false
      if (s.siteSignatures?.some((sig) => sig.userId === user.id)) return false
      const signerIds = s.siteSignerIds
      const lastIdx = signerIds.length - 1
      if (user.id === signerIds[lastIdx]) {
        return (s.siteSignatures?.length ?? 0) >= signerIds.length - 1 || s.submittedById === user.id
      }
      return true
    })
    : []

  // Filter forms by period based on template schedule
  const getFormsByPeriod = (period: FormPeriod) => {
    const allForms = dailyForms.filter((f) => {
      if (f.assignedToUserId) return f.assignedToUserId === user?.id
      return f.assignedToRole === user?.role
    })

    return allForms.filter((f) => {
      const template = templates.find((t) => t.id === f.signableFormId)
      const schedule = f.schedule ?? template?.schedule
      if (period === 'daily') return schedule === 'daily' || !schedule
      if (period === 'monthly') return schedule === 'monthly'
      if (period === 'yearly') return schedule === 'yearly'
      return false
    })
  }

  const myForms = getFormsByPeriod(activeTab)
  const pending = myForms.filter((f) => f.status === 'pending' || f.status === 'filled')
  const completed = myForms.filter((f) => f.status === 'signed')

  const getFillUrl = (dailyForm: (typeof myForms)[0]) => {
    const template = templates.find((t) => t.id === dailyForm.signableFormId)
    const hasPlacedFields = (template?.placedFields?.length ?? 0) > 0
    if (hasPlacedFields) return `/daily-forms/fill/${dailyForm.id}`
    return dailyForm.status === 'pending' ? `/forms/new?daily=${dailyForm.id}` : `/signing?daily=${dailyForm.id}`
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Daily Forms</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">Fill out and sign each form by the due date</p>
        </div>
        {canAssign && (
          <Button onClick={() => setShowAssignModal(true)}>Assign form</Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('daily')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === 'daily' ? 'bg-brand-600 text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600'
            }`}
        >
          Daily Forms
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('monthly')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === 'monthly' ? 'bg-brand-600 text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600'
            }`}
        >
          Monthly forms
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('yearly')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === 'yearly' ? 'bg-brand-600 text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600'
            }`}
        >
          Yearly forms
        </button>
      </div>

      {formsAwaitingMySignature.length > 0 && (
        <Card padding="lg" className="border-l-4 border-brand-500">
          <CardHeader>Waiting for Your Signature</CardHeader>
          <CardDescription>Your supervisor has sent these forms for you to sign.</CardDescription>
          <ul className="mt-4 space-y-3">
            {formsAwaitingMySignature.map((s) => (
              <li key={s.id}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-brand-50/30 dark:bg-brand-900/10">
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white">{s.templateName}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">From {s.submittedBy}</p>
                  </div>
                  <Link to={`/daily-forms/sign/${s.id}`}>
                    <Button size="sm">Sign</Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pending.length > 0 && (
        <Card padding="lg">
          <CardHeader>Due Today</CardHeader>
          <CardDescription>Complete and sign these forms</CardDescription>
          <ul className="mt-4 space-y-3">
            {pending.map((f) => (
              <li key={f.id}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/50">
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white">{f.templateName}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">Due {new Date(f.dueDate).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={f.status === 'signed' ? 'success' : f.status === 'filled' ? 'warning' : 'default'}>
                      {f.status === 'filled' ? 'Ready to sign' : f.status}
                    </Badge>
                    <Link to={getFillUrl(f)}>
                      <Button size="sm">{f.status === 'pending' ? 'Fill & sign' : 'Sign'}</Button>
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {completed.length > 0 && (
        <Card padding="lg">
          <CardHeader>Completed Today</CardHeader>
          <CardDescription>Forms you’ve already filled and signed</CardDescription>
          <ul className="mt-4 space-y-2">
            {completed.map((f) => (
              <li key={f.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50">
                <span className="font-medium text-neutral-900 dark:text-white">{f.templateName}</span>
                <div className="flex items-center gap-3">
                  <Badge variant="success">Signed</Badge>
                  {canAssign && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPassingAssignmentId(f.id)
                        setShowPassAlongModal(true)
                      }}
                    >
                      Pass along
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {myForms.length === 0 && (
        <Card padding="lg" className="text-center text-neutral-500 dark:text-neutral-400">
          No daily forms assigned for today. Check back tomorrow or contact HR if you expect a form.
        </Card>
      )}

      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" role="dialog" aria-modal="true" onClick={() => setShowAssignModal(false)}>
          <Card padding="lg" className="max-w-md w-full shadow-xl animate-fade-in max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display font-bold text-xl text-neutral-900 dark:text-white">Assign Form to Team</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Choose a template and team members; the form will appear in their Daily/Monthly/Yearly forms.</p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Form Template *</label>
                <select
                  value={assignTemplateId}
                  onChange={(e) => setAssignTemplateId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  aria-label="Form template"
                >
                  <option value="">Select a form</option>
                  {activeTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Assign To *</label>
                <div className="border border-neutral-300 dark:border-neutral-600 rounded-xl p-3 bg-neutral-50 dark:bg-neutral-800/50 max-h-40 overflow-y-auto space-y-2">
                  {teamMembers.length === 0 ? (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading team…</p>
                  ) : (
                    teamMembers.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={assignUserIds.includes(m.id)} onChange={() => toggleAssignUser(m.id)} className="rounded border-neutral-400" />
                        <span className="text-neutral-900 dark:text-white">{m.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <Input label="Due date" type="date" value={assignDueDate} onChange={(e) => setAssignDueDate(e.target.value)} />
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Duration</label>
                <select
                  value={assignSchedule}
                  onChange={(e) => setAssignSchedule(e.target.value as FormPeriod)}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  aria-label="Duration"
                >
                  <option value="daily">Daily</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              {assignError && <p className="text-sm text-red-600 dark:text-red-400">{assignError}</p>}
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowAssignModal(false)} disabled={assigning}>Cancel</Button>
              <Button onClick={handleAssignSubmit} disabled={assigning}>{assigning ? 'Assigning…' : 'Assign'}</Button>
            </div>
          </Card>
        </div>
      )}
      {showPassAlongModal && passingAssignmentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" role="dialog" aria-modal="true" onClick={() => setShowPassAlongModal(false)}>
          <Card padding="lg" className="max-w-md w-full shadow-xl animate-fade-in max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display font-bold text-xl text-neutral-900 dark:text-white">Pass Form Along</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Pass this filled form to someone else to sign. They will see the fields you filled.</p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Pass To *</label>
                <div className="border border-neutral-300 dark:border-neutral-600 rounded-xl p-3 bg-neutral-50 dark:bg-neutral-800/50 max-h-40 overflow-y-auto space-y-2">
                  {teamMembers.length === 0 ? (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading team…</p>
                  ) : (
                    teamMembers.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={assignUserIds.includes(m.id)}
                          onChange={() => setAssignUserIds([m.id])} // single select for pass along
                          className="rounded border-neutral-400"
                        />
                        <span className="text-neutral-900 dark:text-white">{m.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Note (optional)</label>
                <Input value={passingNote} onChange={(e) => setPassingNote(e.target.value)} placeholder="E.g. Please review and sign." />
              </div>
              <Input label="Due date" type="date" value={assignDueDate} onChange={(e) => setAssignDueDate(e.target.value)} />
              {assignError && <p className="text-sm text-red-600 dark:text-red-400">{assignError}</p>}
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowPassAlongModal(false)} disabled={assigning}>Cancel</Button>
              <Button onClick={handlePassAlongSubmit} disabled={assigning || assignUserIds.length !== 1}>{assigning ? 'Passing…' : 'Pass along'}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
