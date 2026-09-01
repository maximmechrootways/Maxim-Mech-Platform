import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { EmptyState } from '@/components/ui/EmptyState'
import { SafetyAlertCard } from '@/components/safety/SafetyAlertCard'
import { useSafetyAlerts } from '@/contexts/SafetyAlertsContext'
import { useUser } from '@/contexts/UserContext'
import { useEmployees } from '@/contexts/EmployeesContext'
import type { SafetyAlert } from '@/types'
import { filterActiveAlertsForUser } from '@/utils/safetyAlerts'

export function SafetyAlertsList() {
  const { user } = useUser()
  const { employees } = useEmployees()
  const { alerts, addAlert, updateAlert, removeAlert, markAlertRead, acknowledgeAlert } = useSafetyAlerts()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [siteNamesText, setSiteNamesText] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  const isHr = user?.role === 'owner' || user?.role === 'hr'
  const displayAlerts = isHr ? alerts : filterActiveAlertsForUser(alerts, user)

  const lookupName = (userId: string) => {
    const emp = employees.find((e) => e.id === userId)
    if (emp) return `${emp.firstName} ${emp.lastName}`.trim() || emp.email
    return userId
  }

  const openCreate = () => {
    setEditingId(null)
    setTitle('')
    setBody('')
    setSiteNamesText('')
    setExpiresAt('')
    setShowForm(true)
  }

  const openEdit = (a: SafetyAlert) => {
    setEditingId(a.id)
    setTitle(a.title)
    setBody(a.body)
    setSiteNamesText(a.siteNames?.join(', ') ?? '')
    setExpiresAt(a.expiresAt ? a.expiresAt.slice(0, 10) : '')
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
  }

  const save = async () => {
    const sites = siteNamesText.trim() ? siteNamesText.split(',').map((s) => s.trim()).filter(Boolean) : undefined
    setSaving(true)
    try {
      if (editingId) {
        await updateAlert(editingId, {
          title: title.trim(),
          body: body.trim(),
          siteNames: sites,
          expiresAt: expiresAt.trim() || undefined,
        })
      } else {
        await addAlert({
          title: title.trim(),
          body: body.trim(),
          siteNames: sites,
          publishedAt: new Date().toISOString(),
          expiresAt: expiresAt.trim() || undefined,
        })
      }
      closeForm()
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async (id: string) => {
    await removeAlert(id)
    setDeleteId(null)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Link to="/safety" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Health & Safety</Link>
      {isHr && (
        <Link to="/hr" className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline ml-4">← HR Dashboard</Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Safety Alerts & Bulletins</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            {isHr
              ? 'Post alerts for sites and roles. Expand each alert to see who has read and acknowledged.'
              : 'Important safety notices. Mark as read, then acknowledge to remove from your dashboard.'}
          </p>
        </div>
        {isHr && (
          <Button size="sm" onClick={openCreate}>Create Alert</Button>
        )}
      </div>

      {showForm && (
        <Card padding="lg">
          <CardHeader>{editingId ? 'Edit alert' : 'New alert'}</CardHeader>
          <CardDescription>Post a safety bulletin. Optionally limit by sites and set an expiry date.</CardDescription>
          <div className="mt-4 space-y-4 max-w-xl">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ice on north lot" required />
            <Textarea label="Message" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Alert text..." rows={4} />
            <Input label="Sites (comma-separated, optional)" value={siteNamesText} onChange={(e) => setSiteNamesText(e.target.value)} placeholder="e.g. North Site, West Site" />
            <Input label="Expires (optional)" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            <div className="flex gap-2">
              <Button onClick={save} disabled={!title.trim() || !body.trim() || saving}>{editingId ? 'Save changes' : 'Publish alert'}</Button>
              <Button variant="ghost" onClick={closeForm}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {displayAlerts.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            title="No safety alerts"
            description={isHr ? 'Create an alert to post to sites. Alerts can have an expiry date.' : 'No active alerts for you right now.'}
            action={isHr ? <Button size="sm" onClick={openCreate}>Create Alert</Button> : undefined}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {displayAlerts.map((a) => (
            <li key={a.id}>
              <SafetyAlertCard
                alert={a}
                userId={user?.id}
                isHr={isHr}
                onRead={markAlertRead}
                onAcknowledge={acknowledgeAlert}
                lookupName={lookupName}
              />
              {isHr && (
                <div className="flex justify-end gap-2 -mt-1 mb-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(a)} aria-label="Edit alert">Edit</Button>
                  <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:text-red-700 dark:text-red-400" onClick={() => setDeleteId(a.id)} aria-label="Delete alert">Delete</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" onClick={() => setDeleteId(null)}>
          <Card padding="lg" className="max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display font-bold text-xl text-neutral-900 dark:text-white">Delete This Alert?</h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">This cannot be undone.</p>
            <div className="mt-6 flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => confirmDelete(deleteId)}>Delete</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
