import { useState, useEffect, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { useEmployees } from '@/contexts/EmployeesContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { fetchEmployeeDocuments } from '@/api/employeeDocuments'
import { fetchCertificates } from '@/api/certificates'
import * as XLSX from 'xlsx'

const ROLE_OPTIONS = ['all', 'owner', 'hr', 'supervisor', 'labourer'] as const
const STATUS_OPTIONS = ['all', 'active', 'on-leave', 'terminated'] as const

function employmentStatusLabel(status: string): string {
  const s = status.toLowerCase()
  if (s === 'active') return 'Active'
  if (s === 'on-leave') return 'On leave'
  if (s === 'terminated') return 'Terminated'
  return status
}

/** Terminated rows last; within each group sort by first name then last name (display order). */
function compareEmployeesForList(
  a: { firstName: string; lastName: string; status: string },
  b: { firstName: string; lastName: string; status: string }
): number {
  const aTerm = a.status === 'terminated' ? 1 : 0
  const bTerm = b.status === 'terminated' ? 1 : 0
  if (aTerm !== bTerm) return aTerm - bTerm
  const nameA = `${a.firstName} ${a.lastName}`.trim().toLocaleLowerCase()
  const nameB = `${b.firstName} ${b.lastName}`.trim().toLocaleLowerCase()
  return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
}

function parseDateAtLocalMidnight(input?: string | null) {
  if (!input) return null
  const [y, m, d] = String(input).slice(0, 10).split('-').map((v) => Number(v))
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export function EmployeesList() {
  const { user } = useUser()
  const { employees } = useEmployees()
  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'
  const [roleFilter, setRoleFilter] = useState<typeof ROLE_OPTIONS[number]>('all')
  const [statusFilter, setStatusFilter] = useState<typeof STATUS_OPTIONS[number]>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedData, setExpandedData] = useState<any>(null)
  const [expandedLoading, setExpandedLoading] = useState(false)

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    setExpandedLoading(true)
    try {
      const [docs, certs] = await Promise.all([fetchEmployeeDocuments(id), fetchCertificates()])
      const licenses = docs.filter((d) => d.category === 'license')
      const training = docs.filter((d) => d.category === 'training')
      const hiring = docs.filter((d) => d.category === 'hiring')
      const employeeCerts = certs.filter((c: { holderUserId?: string }) => c.holderUserId === id)
      const totalLicenses = licenses.length

      const complianceStatus = totalLicenses > 0 ? 'Licences on file' : 'No licences'

      const today = new Date()
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const trainingExpiryDates = training
        .map((t) => parseDateAtLocalMidnight(t.expiresAt))
        .filter((d): d is Date => Boolean(d))
      const hasExpiredTraining = trainingExpiryDates.some((d) => d < startOfToday)
      const hasExpiringTrainingSoon = trainingExpiryDates.some((d) => {
        const diffDays = Math.ceil((d.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24))
        return diffDays >= 0 && diffDays <= 7
      })
      const trainingStatus =
        training.length === 0
          ? { icon: '—', label: 'No training records', tone: 'text-neutral-500 dark:text-neutral-400' }
          : hasExpiredTraining
            ? { icon: '🚨', label: 'Expired training', tone: 'text-red-600 dark:text-red-400' }
            : hasExpiringTrainingSoon
              ? { icon: '⚠️', label: 'Expiring in <= 7 days', tone: 'text-amber-600 dark:text-amber-400' }
              : { icon: '✅', label: 'All good', tone: 'text-emerald-600 dark:text-emerald-400' }

      setExpandedData({
        licensesCount: totalLicenses,
        trainingCount: Math.max(training.length, employeeCerts.length),
        hiringCount: hiring.length,
        complianceStatus,
        lastTrainingDate: training.map(t => t.completedAt).sort().pop(),
        trainingStatus,
      })
    } catch {
      setExpandedData(null)
    } finally {
      setExpandedLoading(false)
    }
  }

  if (!isOwnerOrHr) return null

  const nonTerminated = employees.filter((e: any) => e.status !== 'terminated')

  const filtered = employees
    .filter((e) => {
      if (roleFilter !== 'all' && (e.role ?? '').toLowerCase() !== roleFilter) return false
      if (statusFilter !== 'all' && e.status !== statusFilter) return false
      return true
    })
    .sort(compareEmployeesForList)

  const active = nonTerminated.filter((e) => e?.status === 'active').length
  const onLeave = nonTerminated.filter((e) => e.status === 'on-leave').length

  const handleExportExcel = () => {
    const rows = filtered.map((e) => ({
      Name: `${e.firstName} ${e.lastName}`.trim(),
      Role: (e.role ?? '').charAt(0).toUpperCase() + (e.role ?? '').slice(1),
      Email: e.email ?? '',
      Phone: e.phone ?? '',
      'Job Title': e.jobTitle ?? '',
      'Hire Date': e.hireDate ?? '',
      Status: employmentStatusLabel(e.status),
      Department: e.department ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Employees')
    XLSX.writeFile(wb, `Employees_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">
            Employees
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">
            Licences, training and certificates, contact information, hiring information, hiring documents, and vacation/time off/sick.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Export to Excel
          </button>
          <Link to="/employees/new">
            <button
              type="button"
              className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              Add employee
            </button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card padding="md">
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">{nonTerminated.length}</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Total Employees</p>
        </Card>
        <Card padding="md">
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">{active}</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Active</p>
        </Card>
        <Card padding="md">
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">{onLeave}</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">On Leave</p>
        </Card>
      </div>

      <Card padding="lg">
        <CardHeader>Our Employees</CardHeader>
        <CardDescription>Contact, job title, hire date, and status. Click to manage licenses, training, documents, and time off.</CardDescription>
        <div className="mt-4 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <label htmlFor="employees-role-filter" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Role:</label>
            <select
              id="employees-role-filter"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as typeof ROLE_OPTIONS[number])}
              className="min-h-[40px] rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white px-3 py-2 text-sm min-w-[140px]"
              aria-label="Filter by role"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r === 'all' ? 'All' : r === 'hr' ? 'Hr' : r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="employees-status-filter" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Status:</label>
            <select
              id="employees-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof STATUS_OPTIONS[number])}
              className="min-h-[40px] rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white px-3 py-2 text-sm min-w-[140px]"
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All' : employmentStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-600">
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Name</th>
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Role</th>
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Contact</th>
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Job Title</th>
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Hire Date</th>
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Status</th>
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <Fragment key={e.id}>
                  <tr className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer" onClick={() => handleExpand(e.id)}>
                    <td className="py-3 pr-4">
                      <span className="font-medium text-neutral-900 dark:text-white">
                        {e.firstName} {e.lastName}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant="info">{(e.role ?? '—').charAt(0).toUpperCase() + (e.role ?? '').slice(1)}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-neutral-700 dark:text-neutral-300">
                      {e.email}
                      {e.phone && <span className="block text-xs text-neutral-500">{e.phone}</span>}
                    </td>
                    <td className="py-3 pr-4 text-sm text-neutral-600 dark:text-neutral-400">
                      {e.jobTitle ?? '—'}
                    </td>
                    <td className="py-3 pr-4 text-sm text-neutral-600 dark:text-neutral-400">
                      {e.hireDate}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge
                        variant={
                          e.status === 'active' ? 'success' : e.status === 'on-leave' ? 'warning' : 'default'
                        }
                      >
                        {employmentStatusLabel(e.status)}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <svg className={`w-5 h-5 inline-block text-neutral-400 transition-transform ${expandedId === e.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </td>
                  </tr>
                  {expandedId === e.id && (
                    <tr className="bg-neutral-50 dark:bg-neutral-800/50 border-b border-slate-200 dark:border-slate-700">
                      <td colSpan={7} className="px-4 py-4">
                        <div className="flex flex-col sm:flex-row gap-6 animate-fade-in">
                          <div className="flex-1 min-w-[200px]">
                            <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Compliance & Training</h4>
                            {expandedLoading ? <div className="text-sm text-neutral-500">Loading summary...</div> : expandedData ? (
                              <ul className="space-y-1.5 text-sm">
                                <li className="flex justify-between"><span className="text-neutral-600 dark:text-neutral-400">Licensing Status</span> <span className={expandedData.complianceStatus === 'Non-compliant' ? 'text-red-600 font-medium' : 'text-neutral-900 dark:text-white'}>{expandedData.complianceStatus}</span></li>
                                <li className="flex justify-between"><span className="text-neutral-600 dark:text-neutral-400">Active Licenses</span> <span className="text-neutral-900 dark:text-white">{expandedData.licensesCount}</span></li>
                                <li className="flex justify-between"><span className="text-neutral-600 dark:text-neutral-400">Training Records</span> <span className="text-neutral-900 dark:text-white">{expandedData.trainingCount}</span></li>
                                <li className="flex justify-between items-center gap-2">
                                  <span className="text-neutral-600 dark:text-neutral-400">Training Status</span>
                                  <span className={`font-medium ${expandedData.trainingStatus?.tone ?? 'text-neutral-900 dark:text-white'}`}>
                                    {expandedData.trainingStatus?.icon ?? ''} {expandedData.trainingStatus?.label ?? '—'}
                                  </span>
                                </li>
                                {expandedData.lastTrainingDate && <li className="flex justify-between"><span className="text-neutral-600 dark:text-neutral-400">Last Trained</span> <span className="text-neutral-900 dark:text-white">{expandedData.lastTrainingDate}</span></li>}
                              </ul>
                            ) : <div className="text-sm text-red-500">Failed to load</div>}
                          </div>
                          
                          <div className="flex-1 min-w-[200px]">
                            <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Hiring Info</h4>
                            {expandedLoading ? <div className="text-sm text-neutral-500">Loading summary...</div> : expandedData ? (
                              <ul className="space-y-1.5 text-sm">
                                <li className="flex justify-between"><span className="text-neutral-600 dark:text-neutral-400">Hiring Docs on File</span> <span className="text-neutral-900 dark:text-white">{expandedData.hiringCount}</span></li>
                                <li className="flex justify-between"><span className="text-neutral-600 dark:text-neutral-400">Department</span> <span className="text-neutral-900 dark:text-white">{e.department || '—'}</span></li>
                                {e.status === 'on-leave' && <li className="flex justify-between"><span className="text-neutral-600 dark:text-neutral-400">Leave Started</span> <span className="text-neutral-900 dark:text-white">{e.onLeaveStartedAt}</span></li>}
                              </ul>
                            ) : null}
                          </div>

                          <div className="flex items-center justify-end">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <Link to={`/employees/${e.id}?timeOffType=vacation#time-off`} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
                                Vacation
                              </Link>
                              <span className="text-neutral-300 dark:text-neutral-600">|</span>
                              <Link to={`/employees/${e.id}?timeOffType=time-off#time-off`} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
                                Time Off
                              </Link>
                              <span className="text-neutral-300 dark:text-neutral-600">|</span>
                              <Link to={`/employees/${e.id}?timeOffType=sick#time-off`} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
                                Sick
                              </Link>
                              <Link to={`/employees/${e.id}`}>
                                <Button size="sm">Manage Full Profile</Button>
                              </Link>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
            {employees.length === 0 ? 'No employees yet. Add an employee to get started.' : 'No employees match the selected filters.'}
          </p>
        )}
      </Card>
    </div>
  )
}
