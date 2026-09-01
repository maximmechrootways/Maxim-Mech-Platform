import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import * as usersApi from '@/api/users'
import type { UserRole } from '@/types'

const roleLabels: Record<string, string> = {
  owner: 'Owner',
  hr: 'HR',
  supervisor: 'Supervisor',
  labourer: 'Labourer',
  user: 'User',
}

export function AdminUsers() {
  const [users, setUsers] = useState<usersApi.AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('labourer')

  useEffect(() => {
    usersApi.fetchUsersAdmin().then(setUsers).catch(() => setUsers([])).finally(() => setLoading(false))
  }, [])

  const createUser = () => {
    setNewName('')
    setNewEmail('')
    setShowCreate(false)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">User Management</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">HR only — create users and assign roles. To activate or deactivate, use Employees.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/admin/templates" className="text-sm text-neutral-600 dark:text-neutral-400 hover:underline">Templates</Link>
          <Link to="/admin/signable-forms" className="text-sm text-neutral-600 dark:text-neutral-400 hover:underline">Custom forms to sign</Link>
          <Link to="/admin/notifications" className="text-sm text-neutral-600 dark:text-neutral-400 hover:underline">Notifications</Link>
          <Link to="/admin/audit-log" className="text-sm text-neutral-600 dark:text-neutral-400 hover:underline">Audit Log</Link>
          <Link to="/admin/permissions" className="text-sm text-neutral-600 dark:text-neutral-400 hover:underline">Permissions</Link>
          <Button onClick={() => setShowCreate(true)}>Create user</Button>
        </div>
      </div>

      {loading && <Card padding="lg"><p className="text-sm text-neutral-500">Loading users…</p></Card>}
      {showCreate && (
        <Card padding="lg">
          <CardHeader>Create User</CardHeader>
          <CardDescription>Assign role and send invite.</CardDescription>
          <div className="mt-4 space-y-4 max-w-md">
            <Input label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input label="Email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Role</label>
              <select aria-label="User role" value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)} className="w-full min-h-[44px] px-4 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white">
                <option value="owner">Owner</option>
                <option value="hr">HR</option>
                <option value="supervisor">Supervisor</option>
                <option value="labourer">Labourer</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button onClick={createUser}>Create</Button>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      <Card padding="none">
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
          {users.map((u) => (
            <li key={u.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="font-medium text-neutral-900 dark:text-white">{u.name}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{u.email}</p>
                {u.lastLogin && (
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">Last login: {new Date(u.lastLogin).toLocaleString()}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="info">{roleLabels[u.role] ?? u.role}</Badge>
                <Badge variant={u.isActive ? 'success' : 'default'}>{u.isActive ? 'Active' : 'Inactive'}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
