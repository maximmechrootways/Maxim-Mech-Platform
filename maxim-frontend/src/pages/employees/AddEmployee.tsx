import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { useEmployees } from '@/contexts/EmployeesContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function AddEmployee() {
  const { user } = useUser()
  const { addEmployee } = useEmployees()
  const navigate = useNavigate()
  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    jobTitle: '',
    department: '',
    hireDate: new Date().toISOString().slice(0, 10),
    status: 'active' as 'active' | 'on-leave' | 'terminated',
  })

  const [saving, setSaving] = useState(false)

  if (!isOwnerOrHr) return null


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.hireDate) return
    setSaving(true)
    try {
      const emp = await addEmployee({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        jobTitle: form.jobTitle.trim() || undefined,
        department: form.department.trim() || undefined,
        hireDate: form.hireDate,
        status: form.status,
      })
      navigate(`/employees/${emp.id}`)
    } catch {
      // error already shown by context
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-4">
        <Link
          to="/employees"
          className="touch-target p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">
            Add employee
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">
            Add a new employee. You can add licenses, training, documents, and time off from their profile.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card padding="lg">
          <CardHeader>Basic Information</CardHeader>
          <CardDescription>Contact and hiring information.</CardDescription>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="First name"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                required
              />
              <Input
                label="Last name"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                required
              />
            </div>
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
            <Input
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <Input
              label="Job Title"
              value={form.jobTitle}
              onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
            />
            <Input
              label="Department"
              value={form.department}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
            />
            <Input
              label="Hire Date"
              type="date"
              value={form.hireDate}
              onChange={(e) => setForm((f) => ({ ...f, hireDate: e.target.value }))}
              required
            />
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'active' | 'on-leave' | 'terminated' }))}
                className="min-h-[44px] px-4 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white w-full"
              >
                <option value="active">Active</option>
                <option value="on-leave">On leave</option>
                <option value="terminated">Terminated</option>
              </select>
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            <Button type="submit" disabled={saving || !form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.hireDate}>
              {saving ? 'Creating…' : 'Add employee'}
            </Button>
            <Link to="/employees">
              <Button type="button" variant="ghost">Cancel</Button>
            </Link>
          </div>
        </Card>
      </form>
    </div>
  )
}
