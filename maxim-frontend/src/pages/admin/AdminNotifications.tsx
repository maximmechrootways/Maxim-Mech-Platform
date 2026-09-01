import { useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import type { NotificationPreferences, UserRole } from '@/types'
import { fetchUsersAdmin, fetchUserUiPreferences, updateUserUiPreferences, type AdminUser } from '@/api/users'
import { postTestFormsDigest } from '@/api/notifications'
import { useUser } from '@/contexts/UserContext'

type NotificationKey = keyof NotificationPreferences

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  hr: 'HR',
  supervisor: 'Supervisor',
  labourer: 'Labourer',
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationPreferences = {
  forms_pending: true,
  incidents: true,
  digest: false,
  digest_hr_owner_8am: false,
  signatures: true,
  incidents_site: true,
  signature_required: true,
  announcements: true,
}

const TOGGLE_OPTIONS: Array<{ key: NotificationKey; label: string; roles?: UserRole[] }> = [
  { key: 'forms_pending', label: 'Form submissions pending review' },
  { key: 'incidents', label: 'New incident reports' },
  { key: 'digest', label: 'Daily digest' },
  {
    key: 'digest_hr_owner_8am',
    label: '8AM weekday digest (HR/Owner): yesterday forms pending approval/submission',
    roles: ['hr', 'owner'],
  },
  { key: 'signatures', label: 'Signature reminders' },
  { key: 'incidents_site', label: 'Incidents at my sites' },
  { key: 'signature_required', label: 'Documents requiring signature' },
  { key: 'announcements', label: 'Safety announcements' },
]

export function AdminNotifications() {
  const { user: currentUser } = useUser()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingPrefs, setLoadingPrefs] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingDigest, setTestingDigest] = useState(false)
  const [settings, setSettings] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_SETTINGS)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const canSendTestDigest =
    currentUser && ((currentUser.actualRole ?? currentUser.role) === 'owner' || (currentUser.actualRole ?? currentUser.role) === 'hr')

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [users, selectedUserId]
  )

  useEffect(() => {
    setLoadingUsers(true)
    fetchUsersAdmin()
      .then((list) => {
        const activeUsers = (list ?? []).filter((u) => u.isActive)
        setUsers(activeUsers)
        setSelectedUserId((prev) => prev || activeUsers[0]?.id || '')
      })
      .catch(() => {
        setUsers([])
        setSelectedUserId('')
      })
      .finally(() => setLoadingUsers(false))
  }, [])

  useEffect(() => {
    if (!selectedUserId) {
      setSettings(DEFAULT_NOTIFICATION_SETTINGS)
      return
    }
    setLoadingPrefs(true)
    setStatusMessage(null)
    fetchUserUiPreferences(selectedUserId)
      .then((prefs) => {
        setSettings({
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...(prefs.notificationPreferences ?? {}),
        })
      })
      .catch(() => {
        setSettings(DEFAULT_NOTIFICATION_SETTINGS)
      })
      .finally(() => setLoadingPrefs(false))
  }, [selectedUserId])

  const toggle = (key: NotificationKey) => setSettings((s) => ({ ...s, [key]: !s[key] }))

  const sendTestDigest = async () => {
    if (!canSendTestDigest) return
    setTestingDigest(true)
    setStatusMessage(null)
    try {
      const result = await postTestFormsDigest()
      setStatusMessage(
        `Test digest queued (${result.itemCount} item(s); date bucket ${result.digestDateLabel}). Check your inbox in a few minutes.`
      )
    } catch (e: unknown) {
      if (isAxiosError(e)) {
        const d = e.response?.data as { error?: string; message?: string } | undefined
        const msg = d?.error ?? d?.message ?? e.message
        const code = e.response?.status
        setStatusMessage(code ? `${msg} (HTTP ${code})` : msg)
      } else {
        setStatusMessage(e instanceof Error ? e.message : 'Failed to send test digest.')
      }
    } finally {
      setTestingDigest(false)
    }
  }

  const saveSettings = async () => {
    if (!selectedUserId) return
    setSaving(true)
    setStatusMessage(null)
    try {
      await updateUserUiPreferences(selectedUserId, { notificationPreferences: settings })
      setStatusMessage('Settings saved.')
    } catch (e: any) {
      setStatusMessage(e?.response?.data?.error ?? 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-neutral-900 dark:text-white">Notification Settings</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">Per-user email toggles</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/users" className="text-sm text-neutral-600 dark:text-neutral-400 hover:underline">Users</Link>
          <Link to="/admin/templates" className="text-sm text-neutral-600 dark:text-neutral-400 hover:underline">Templates</Link>
          <Link to="/admin/signable-forms" className="text-sm text-neutral-600 dark:text-neutral-400 hover:underline">Custom forms to sign</Link>
        </div>
      </div>

      <Card padding="lg">
        <CardHeader>Email Notifications by User</CardHeader>
        <CardDescription>
          Select a user and configure their notification preferences. Saving applies both the checkboxes below and the account-level “email allowed” switch used by the mailer—if any category is checked, email delivery is enabled for that user.
        </CardDescription>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block min-w-[260px]">
            <span className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">User</span>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full min-h-[42px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
              disabled={loadingUsers || users.length === 0}
              aria-label="Select user for notification settings"
            >
              {users.length === 0 ? (
                <option value="">No users found</option>
              ) : (
                users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({ROLE_LABELS[(u.role as UserRole) ?? 'labourer'] ?? u.role})
                  </option>
                ))
              )}
            </select>
          </label>
          {selectedUser && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 pb-1">
              Editing: <span className="font-medium text-neutral-700 dark:text-neutral-200">{selectedUser.name}</span>
            </p>
          )}
        </div>

        <div className="mt-6">
          {loadingPrefs ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading user preferences…</p>
          ) : (
            <ul className="space-y-2">
              {TOGGLE_OPTIONS.map((t) => (
                <li key={t.key}>
                  <Checkbox
                    label={t.label}
                    checked={settings[t.key]}
                    onChange={() => toggle(t.key)}
                    disabled={
                      !selectedUserId
                      || (Array.isArray(t.roles) && !t.roles.includes((selectedUser?.role as UserRole) ?? 'labourer'))
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {statusMessage && (
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">{statusMessage}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-3 items-center">
          <Button onClick={saveSettings} disabled={!selectedUserId || loadingPrefs || saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </Button>
          {canSendTestDigest && (
            <Button variant="outline" onClick={sendTestDigest} disabled={testingDigest}>
              {testingDigest ? 'Sending test…' : 'Send test digest to my email'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
