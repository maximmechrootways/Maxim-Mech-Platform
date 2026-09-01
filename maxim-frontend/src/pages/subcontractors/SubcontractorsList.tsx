import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { useSubcontractors } from '@/contexts/SubcontractorsContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { fetchSubcontractorDetail } from '@/api/subcontractors'
import * as XLSX from 'xlsx'

const EXPIRING_DAYS = 30

type SortKey = 'companyName' | 'status' | 'officeContactName'
type SortDir = 'asc' | 'desc'

export function SubcontractorsList() {
  const { user } = useUser()
  const { subcontractors, listLoading, certifications, personnelCertifications, jobAssignments, addSubcontractor, jobsList: jobs, personnel } = useSubcontractors()
  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('companyName')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Add form state
  const [showAdd, setShowAdd] = useState(false)
  const [formCompany, setFormCompany] = useState('')
  const [formOfficeName, setFormOfficeName] = useState('')
  const [formOfficeEmail, setFormOfficeEmail] = useState('')
  const [formOfficePhone, setFormOfficePhone] = useState('')
  const [formSiteName, setFormSiteName] = useState('')
  const [formSiteEmail, setFormSiteEmail] = useState('')
  const [formSitePhone, setFormSitePhone] = useState('')
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [insuranceRows, setInsuranceRows] = useState<Array<{
    subcontractorId: string
    expirationDate?: string
  }>>([])

  // Filter + sort — must be above conditional returns (Rules of Hooks)
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let list = subcontractors.filter(
      (s: any) =>
        s.companyName.toLowerCase().includes(q) ||
        s.officeContactName.toLowerCase().includes(q) ||
        (s.officeContactEmail ?? '').toLowerCase().includes(q) ||
        (s.siteContactName ?? '').toLowerCase().includes(q)
    )
    list.sort((a: any, b: any) => {
      const aVal = (a[sortKey] ?? '').toLowerCase()
      const bVal = (b[sortKey] ?? '').toLowerCase()
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [subcontractors, search, sortKey, sortDir])

  const now = new Date()
  const in30 = new Date(now.getTime() + EXPIRING_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const today = now.toISOString().slice(0, 10)
  const certSummaryBySubcontractor = useMemo(() => {
    const summary = new Map<string, { total: number; expired: number; expiring: number; current: number }>()
    const touch = (subId: string) => {
      if (!summary.has(subId)) summary.set(subId, { total: 0, expired: 0, expiring: 0, current: 0 })
      return summary.get(subId)!
    }
    const subIdFor = (cert: { subcontractorId?: string; personnelId?: string }) => {
      if (cert.subcontractorId) return cert.subcontractorId
      if (cert.personnelId) {
        return personnel.find((p) => p.id === cert.personnelId)?.subcontractorId
      }
      return undefined
    }
    const allCerts = [...certifications, ...personnelCertifications]
    for (const cert of allCerts as any[]) {
      const subId = subIdFor(cert)
      if (!subId) continue
      const bucket = touch(subId)
      bucket.total += 1
      if (cert.status === 'expired') bucket.expired += 1
      else if (cert.status === 'expiring-soon') bucket.expiring += 1
      else bucket.current += 1
    }
    return summary
  }, [certifications, personnelCertifications, personnel])

  const certAlertsCount = useMemo(() => {
    let count = 0
    certSummaryBySubcontractor.forEach((row) => {
      if (row.expired > 0 || row.expiring > 0) count += row.expired + row.expiring
    })
    return count
  }, [certSummaryBySubcontractor])

  useEffect(() => {
    let cancelled = false
    const loadInsurances = async () => {
      if (subcontractors.length === 0) {
        setInsuranceRows([])
        return
      }
      const details = await Promise.all(
        subcontractors.map(async (s: any) => {
          try {
            const d = await fetchSubcontractorDetail(s.id)
            return { id: s.id, insurances: Array.isArray((d as any)?.insurances) ? (d as any).insurances : [] }
          } catch {
            return { id: s.id, insurances: [] }
          }
        })
      )
      const rows = details.flatMap((s) =>
        s.insurances
          .map((i: any) => ({
            subcontractorId: s.id,
            expirationDate: i?.expiresAt ? String(i.expiresAt).slice(0, 10) : undefined,
          }))
      )
      if (!cancelled) setInsuranceRows(rows)
    }
    loadInsurances()
    return () => { cancelled = true }
  }, [subcontractors])

  const insuranceSummary = useMemo(() => {
    const expiringOrExpired = insuranceRows.filter((i) => {
      const expires = i.expirationDate
      if (!expires) return false
      return expires < today || (expires >= today && expires <= in30)
    }).length

    return {
      totalPolicies: insuranceRows.length,
      expiringOrExpired,
      current: insuranceRows.length - expiringOrExpired,
    }
  }, [insuranceRows, today, in30])

  const insuranceSummaryBySubcontractor = useMemo(() => {
    const summary = new Map<string, { total: number; expired: number; expiring: number; current: number }>()
    const touch = (subId: string) => {
      if (!summary.has(subId)) summary.set(subId, { total: 0, expired: 0, expiring: 0, current: 0 })
      return summary.get(subId)!
    }
    for (const row of insuranceRows) {
      if (!row?.subcontractorId) continue
      const bucket = touch(row.subcontractorId)
      bucket.total += 1
      const expires = row.expirationDate
      if (!expires) {
        bucket.current += 1
      } else if (expires < today) {
        bucket.expired += 1
      } else if (expires <= in30) {
        bucket.expiring += 1
      } else {
        bucket.current += 1
      }
    }
    return summary
  }, [insuranceRows, today, in30])

  const complianceSummary = useMemo(() => {
    const scores = subcontractors
      .map((s: any) => Number(s?.compliance?.score))
      .filter((score: number) => Number.isFinite(score))
    if (scores.length === 0) {
      return { average: null as number | null, contributing: 0 }
    }
    const average = Math.round(scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length)
    return { average, contributing: scores.length }
  }, [subcontractors])

  if (!isOwnerOrHr && user?.role !== 'supervisor') return null
  if (listLoading && subcontractors.length === 0) return <div className="animate-fade-in text-neutral-500 dark:text-neutral-400">Loading subcontractors…</div>

  const total = subcontractors.length
  const active = subcontractors.filter((s: any) => s.status === 'active').length

  const getSiteNamesForSub = (subId: string) => {
    const assignedJobIds = jobAssignments.filter((a: any) => a.subcontractorId === subId).map((a: any) => a.jobId)
    const siteNames = Array.from(
      new Set(assignedJobIds.map((jid: any) => jobs.find((j: any) => j.id === jid)?.siteName).filter(Boolean) as string[])
    )
    return siteNames.length > 0 ? siteNames.join(', ') : '—'
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="ml-1 text-neutral-400 dark:text-neutral-600">↕</span>
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const handleExportExcel = () => {
    const rows = filtered.map((s: any) => ({
      Company: s.companyName ?? '',
      'Office Contact': s.officeContactName ?? '',
      'Office Email': s.officeContactEmail ?? '',
      'Office Phone': s.officeContactPhone ?? '',
      'Site Contact': s.siteContactName ?? '',
      'Site Email': s.siteContactEmail ?? '',
      'Site Phone': s.siteContactPhone ?? '',
      Status: s.status ?? '',
      'Job Site': getSiteNamesForSub(s.id),
      'Compliance Score': s.compliance?.score != null ? `${s.compliance.score}%` : '',
      'Compliance Status': s.compliance?.status ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Subcontractors')
    XLSX.writeFile(wb, `Subcontractors_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formCompany.trim() || !formOfficeName.trim() || !formOfficeEmail.trim()) return
    setFormSaving(true)
    setFormError(null)
    try {
      await addSubcontractor({
        companyName: formCompany.trim(),
        officeContactName: formOfficeName.trim(),
        officeContactEmail: formOfficeEmail.trim(),
        officeContactPhone: formOfficePhone.trim() || undefined,
        siteContactName: formSiteName.trim() || undefined,
        siteContactEmail: formSiteEmail.trim() || undefined,
        siteContactPhone: formSitePhone.trim() || undefined,
      })
      setShowAdd(false)
      setFormCompany('')
      setFormOfficeName('')
      setFormOfficeEmail('')
      setFormOfficePhone('')
      setFormSiteName('')
      setFormSiteEmail('')
      setFormSitePhone('')
    } catch (err: any) {
      setFormError(err?.response?.data?.error ?? 'Failed to add subcontractor')
    } finally {
      setFormSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">
            Subcontractors
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">
            Track subcontractor companies, contacts, certifications, and expiration dates.
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
          {isOwnerOrHr && (
            <Button onClick={() => setShowAdd(!showAdd)} leftIcon={<PlusIcon />}>
              Add subcontractor
            </Button>
          )}
        </div>
      </div>

      {/* Add subcontractor form */}
      {showAdd && (
        <Card padding="lg" className="animate-fade-in">
          <CardHeader>Add Subcontractor</CardHeader>
          <CardDescription>Enter company, required office contact, and optional site contact info.</CardDescription>
          <form onSubmit={handleAddSubmit} className="mt-4 space-y-6 max-w-2xl">
            <div className="grid grid-cols-1 gap-4">
              <Input label="Company name" value={formCompany} onChange={(e) => setFormCompany(e.target.value)} placeholder="e.g. ABC Plumbing Inc." required />
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-neutral-900 dark:text-white">Office Contact <span className="text-red-500">*</span></h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Contact name" value={formOfficeName} onChange={(e) => setFormOfficeName(e.target.value)} placeholder="e.g. John Smith" required />
                <Input label="Contact email" type="email" value={formOfficeEmail} onChange={(e) => setFormOfficeEmail(e.target.value)} placeholder="office@abcplumbing.com" required />
                <Input label="Contact phone" type="tel" value={formOfficePhone} onChange={(e) => setFormOfficePhone(e.target.value)} placeholder="(555) 123-4567" className="sm:col-span-2" />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <h4 className="font-semibold text-neutral-900 dark:text-white">Site Contact</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Contact name" value={formSiteName} onChange={(e) => setFormSiteName(e.target.value)} placeholder="e.g. Jane Doe" />
                <Input label="Contact email" type="email" value={formSiteEmail} onChange={(e) => setFormSiteEmail(e.target.value)} placeholder="jane.site@abcplumbing.com" />
                <Input label="Contact phone" type="tel" value={formSitePhone} onChange={(e) => setFormSitePhone(e.target.value)} placeholder="(555) 987-6543" className="sm:col-span-2" />
              </div>
            </div>

            <div className="flex items-end gap-2 pt-2">
              <Button type="submit" disabled={formSaving || !formCompany.trim() || !formOfficeName.trim() || !formOfficeEmail.trim()}>
                {formSaving ? 'Saving…' : 'Save'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
            {formError && (
              <div className="sm:col-span-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-sm text-red-600 dark:text-red-400">
                {formError}
              </div>
            )}
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Subcontractors */}
        <Card padding="md" className="flex flex-col justify-center">
          <p className="text-3xl font-bold text-neutral-900 dark:text-white tracking-tight">{total}</p>
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mt-1">Total Subcontractors</p>
        </Card>

        {/* Average Compliance Pulse */}
        <Card padding="md" className="flex items-center justify-between">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">Avg Compliance</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {complianceSummary.contributing} subcontractors
            </p>
          </div>
          <div className="relative w-16 h-16 shrink-0 ml-3">
            <svg viewBox="0 0 36 36" className="w-full h-full rotate-[-90deg]">
              <circle
                cx="18"
                cy="18"
                r="15.915"
                fill="transparent"
                stroke="currentColor"
                strokeWidth="5"
                className="text-slate-100 dark:text-slate-800"
              />
              <circle
                cx="18"
                cy="18"
                r="15.915"
                fill="transparent"
                stroke="currentColor"
                strokeWidth="5"
                strokeDasharray={`${
                  complianceSummary.average != null ? complianceSummary.average : 0
                } ${complianceSummary.average != null ? 100 - complianceSummary.average : 100}`}
                strokeDashoffset="0"
                className={
                  complianceSummary.average == null
                    ? 'text-slate-300 dark:text-slate-600'
                    : complianceSummary.average >= 80
                      ? 'text-emerald-500'
                      : complianceSummary.average >= 50
                        ? 'text-amber-500'
                        : 'text-red-500'
                }
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
              {complianceSummary.average != null ? `${complianceSummary.average}%` : '—'}
            </div>
          </div>
        </Card>

        {/* Active vs Inactive Donut Chart */}
        <Card padding="md" className="flex items-center justify-between">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-semibold text-neutral-900 dark:text-white mb-2">Status Breakdown</p>
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                <span className="font-medium text-neutral-900 dark:text-white">{active}</span>
                <span className="text-neutral-500 dark:text-neutral-400">Active</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0"></span>
                <span className="font-medium text-neutral-900 dark:text-white">{total - active}</span>
                <span className="text-neutral-500 dark:text-neutral-400">Inactive</span>
              </div>
            </div>
          </div>
          <div className="relative w-16 h-16 shrink-0 ml-4">
            <svg viewBox="0 0 36 36" className="w-full h-full rotate-[-90deg] drop-shadow-sm">
              {/* Background Circle (Inactive) */}
              <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="currentColor" strokeWidth="5" className="text-slate-100 dark:text-slate-800" />
              {/* Foreground Circle (Active) */}
              <circle
                cx="18" cy="18" r="15.915" fill="transparent"
                stroke="currentColor" strokeWidth="5"
                strokeDasharray={`${total > 0 ? (active / total) * 100 : 0} ${total > 0 ? 100 - (active / total) * 100 : 100}`}
                strokeDashoffset="0"
                className="text-emerald-500 transition-all duration-700 ease-out"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </Card>

        {/* Expiring Insurance */}
        <Link to="/certificates?section=subcontractor-insurance" className="block transition-opacity hover:opacity-90">
          <Card padding="md" className="flex items-center justify-between cursor-pointer h-full">
            <div className="flex flex-col justify-center">
              <p className="text-sm font-semibold text-neutral-900 dark:text-white mb-2">Expiring Insurance</p>
              <div className="flex flex-col gap-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
                  <span className="font-medium text-neutral-900 dark:text-white">{insuranceSummary.expiringOrExpired}</span>
                  <span className="text-neutral-500 dark:text-neutral-400">Expiring / Expired</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-700 dark:bg-emerald-500 shrink-0"></span>
                  <span className="font-medium text-neutral-900 dark:text-white">{insuranceSummary.current}</span>
                  <span className="text-neutral-500 dark:text-neutral-400">Current</span>
                </div>
              </div>
            </div>
            <div className="relative w-16 h-16 shrink-0 ml-4">
              <svg viewBox="0 0 36 36" className="w-full h-full rotate-[-90deg] drop-shadow-sm">
                <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="currentColor" strokeWidth="5" className="text-emerald-600 dark:text-emerald-500/80" />
                <circle
                  cx="18" cy="18" r="15.915" fill="transparent"
                  stroke="currentColor" strokeWidth="5"
                  strokeDasharray={`${insuranceSummary.totalPolicies > 0 ? (insuranceSummary.expiringOrExpired / insuranceSummary.totalPolicies) * 100 : 0} ${insuranceSummary.totalPolicies > 0 ? 100 - (insuranceSummary.expiringOrExpired / insuranceSummary.totalPolicies) * 100 : 100}`}
                  strokeDashoffset="0"
                  className="text-amber-500 transition-all duration-700 ease-out"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </Card>
        </Link>

        {/* Cert Alerts */}
        <Card padding="md" className="flex flex-col justify-center">
          <p className="text-3xl font-bold text-amber-500 dark:text-amber-400 tracking-tight">{certAlertsCount}</p>
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mt-1">Cert Alerts (expiring + expired)</p>
        </Card>
      </div>

      <Card padding="lg">
        <CardHeader>Who They Are</CardHeader>
        <CardDescription>Company, primary contact, status, job site location, and certification summary.</CardDescription>

        {/* Search */}
        <div className="mt-4 max-w-sm">
          <Input
            placeholder="Search by company, contact, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-600">
                <th
                  className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400 cursor-pointer select-none hover:text-neutral-900 dark:hover:text-white transition-colors"
                  onClick={() => handleSort('companyName')}
                >
                  Company<SortIcon col="companyName" />
                </th>
                <th
                  className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400 cursor-pointer select-none hover:text-neutral-900 dark:hover:text-white transition-colors"
                  onClick={() => handleSort('officeContactName')}
                >
                  Contact<SortIcon col="officeContactName" />
                </th>
                <th
                  className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400 cursor-pointer select-none hover:text-neutral-900 dark:hover:text-white transition-colors"
                  onClick={() => handleSort('status')}
                >
                  Status<SortIcon col="status" />
                </th>
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Job Site</th>
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Certifications</th>
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Insurance</th>
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400">Compliance</th>
                <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: any) => {
                const certSummary = certSummaryBySubcontractor.get(s.id) ?? { total: 0, expired: 0, expiring: 0, current: 0 }
                const insuranceCertSummary = insuranceSummaryBySubcontractor.get(s.id) ?? { total: 0, expired: 0, expiring: 0, current: 0 }
                return (
                  <tr key={s.id} className="border-b border-slate-100 dark:border-slate-700/50">
                    <td className="py-3 pr-4">
                      <span className="font-medium text-neutral-900 dark:text-white">{s.companyName}</span>
                    </td>
                    <td className="py-3 pr-4 text-neutral-700 dark:text-neutral-300">
                      <div className="font-medium">{s.officeContactName}</div>
                      {s.officeContactEmail && (
                        <div className="text-xs text-neutral-500 mt-0.5">{s.officeContactEmail}</div>
                      )}
                      {s.siteContactName && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-neutral-500">
                          <span className="font-medium text-neutral-600 dark:text-neutral-400">Site:</span> {s.siteContactName}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={s.status === 'active' ? 'success' : 'default'}>
                        {s.status}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-sm text-neutral-600 dark:text-neutral-400">
                      {getSiteNamesForSub(s.id)}
                    </td>
                    <td className="py-3 pr-4 text-sm text-neutral-600 dark:text-neutral-400">
                      {certSummary.total === 0 ? (
                        <span>—</span>
                      ) : certSummary.expired > 0 ? (
                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium" title={`${certSummary.expired} expired`}>
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <span>{certSummary.expired} expired</span>
                        </span>
                      ) : certSummary.expiring > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium" title={`${certSummary.expiring} expiring soon`}>
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.72-1.36 3.485 0l6.518 11.596c.75 1.334-.213 2.995-1.742 2.995H3.48c-1.53 0-2.492-1.66-1.743-2.995L8.257 3.1zM11 13a1 1 0 10-2 0 1 1 0 002 0zm-1-7a1 1 0 00-1 1v4a1 1 0 102 0V7a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <span>{certSummary.expiring} expiring</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium" title={`${certSummary.current} current`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Current</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-sm text-neutral-600 dark:text-neutral-400">
                      {insuranceCertSummary.total === 0 ? (
                        <span>—</span>
                      ) : insuranceCertSummary.expired > 0 ? (
                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium" title={`${insuranceCertSummary.expired} expired`}>
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <span>{insuranceCertSummary.expired} expired</span>
                        </span>
                      ) : insuranceCertSummary.expiring > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium" title={`${insuranceCertSummary.expiring} expiring soon`}>
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.72-1.36 3.485 0l6.518 11.596c.75 1.334-.213 2.995-1.742 2.995H3.48c-1.53 0-2.492-1.66-1.743-2.995L8.257 3.1zM11 13a1 1 0 10-2 0 1 1 0 002 0zm-1-7a1 1 0 00-1 1v4a1 1 0 102 0V7a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <span>{insuranceCertSummary.expiring} expiring</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium" title={`${insuranceCertSummary.current} current`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Current</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {s.compliance ? (
                        <div className="flex items-center gap-2" title={s.compliance.status}>
                          <span className={`inline-flex h-8 w-8 rounded-full items-center justify-center text-xs font-bold ${s.compliance.score === 100 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : s.compliance.score > 50 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                            {s.compliance.score}%
                          </span>
                          {s.compliance.status !== 'Compliant' && (
                            <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20" aria-label={s.compliance.status}>
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <Link
                        to={`/subcontractors/${s.id}`}
                        className="text-brand-600 dark:text-brand-400 hover:underline text-sm font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-neutral-500 dark:text-neutral-400">
                    {search ? 'No subcontractors match your search.' : 'No subcontractors yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function PlusIcon() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
}
