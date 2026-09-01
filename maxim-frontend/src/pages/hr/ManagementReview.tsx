import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { useEmployees } from '@/contexts/EmployeesContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { fetchLibraryDocuments, uploadLibraryDocument, getLibraryDocumentFileUrl } from '@/api/library'
import { fetchCertificates } from '@/api/certificates'
import { listDailyHazardSubmissions } from '@/api/dailyHazardAnalysis'
import { fetchQualityFindingsSummary } from '@/api/qualityFindings'
import { getExpiryBucket } from '@/utils/certificateExpiry'

type ReviewDoc = {
  id: string
  name: string
  type?: string
  uploadedAt?: string
  uploadedBy?: string
  category?: string
}

const REVIEW_CATEGORIES = [
  { key: 'meeting-minutes', label: 'Meeting Minutes', icon: '📝', color: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
  { key: 'audit-report', label: 'Audit Reports', icon: '📊', color: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' },
  { key: 'policy-update', label: 'Policy Updates', icon: '📜', color: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' },
  { key: 'corrective-action', label: 'Corrective Actions', icon: '🔧', color: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' },
  { key: 'kpi-report', label: 'KPI Reports', icon: '📈', color: 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800' },
  { key: 'other', label: 'Other', icon: '📂', color: 'bg-neutral-50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700' },
] as const

export function ManagementReview() {
  const { user } = useUser()
  const { employees } = useEmployees()
  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'

  // Documents
  const [documents, setDocuments] = useState<ReviewDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('meeting-minutes')
  const [filterCategory, setFilterCategory] = useState('all')
  const [docName, setDocName] = useState('')
  const [bulkStatus, setBulkStatus] = useState<Array<{ name: string; status: 'pending' | 'uploading' | 'done' | 'error'; error?: string }>>([])

  // KPI data
  const [kpiData, setKpiData] = useState({
    totalEmployees: 0,
    activeEmployees: 0,
    expiringCerts: 0,
    expiredCerts: 0,
    dhaSubmissions30d: 0,
    totalCerts: 0,
    formRedFlagsOpen: 0,
  })

  const loadDocuments = useCallback(async () => {
    try {
      const all = await fetchLibraryDocuments()
      const mgmt = (Array.isArray(all) ? all : []).filter(
        (d: any) => d.type?.startsWith('management-review')
      )
      setDocuments(
        mgmt.map((d: any) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          uploadedAt: d.createdAt || d.uploadedAt,
          uploadedBy: d.uploadedByName || d.uploadedBy,
          category: d.type?.split(':')[1] || 'other',
        }))
      )
    } catch {
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadKpis = useCallback(async () => {
    try {
      const [certs, dhaList, qualitySummary] = await Promise.all([
        fetchCertificates().catch(() => []),
        listDailyHazardSubmissions().catch(() => []),
        fetchQualityFindingsSummary().catch(() => null),
      ])

      const now = new Date()
      const certsArr = Array.isArray(certs) ? certs : []
      const expiring = certsArr.filter((c: any) => getExpiryBucket(c.expirationDate) === 'expiry-30').length
      const expired = certsArr.filter((c: any) => getExpiryBucket(c.expirationDate) === 'expired').length

      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
      const dhaRecent = (Array.isArray(dhaList) ? dhaList : []).filter(
        (d: any) => d.date >= thirtyDaysAgo
      ).length

      const nonTerminated = employees.filter((e: any) => e.status !== 'terminated')

      setKpiData({
        totalEmployees: nonTerminated.length,
        activeEmployees: nonTerminated.filter((e: any) => e.status === 'active').length,
        expiringCerts: expiring,
        expiredCerts: expired,
        dhaSubmissions30d: dhaRecent,
        totalCerts: certsArr.length,
        formRedFlagsOpen: qualitySummary?.openCount ?? 0,
      })
    } catch {
      // leave defaults
    }
  }, [employees])

  useEffect(() => {
    loadDocuments()
    loadKpis()
  }, [loadDocuments, loadKpis])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const fileList = Array.from(files)
    const namePrefix = docName.trim()
    setUploading(true)
    setUploadError(null)
    setBulkStatus(fileList.map((f) => ({ name: f.name, status: 'pending' as const })))
    let hasError = false
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      setBulkStatus((prev) => prev.map((s, idx) => idx === i ? { ...s, status: 'uploading' } : s))
      try {
        const fileName = fileList.length === 1
          ? (namePrefix || file.name.replace(/\.pdf$/i, ''))
          : (namePrefix ? `${namePrefix} - ${file.name.replace(/\.pdf$/i, '')}` : file.name.replace(/\.pdf$/i, ''))
        await uploadLibraryDocument(file, {
          name: fileName,
          type: `management-review:${selectedCategory}`,
        })
        setBulkStatus((prev) => prev.map((s, idx) => idx === i ? { ...s, status: 'done' } : s))
      } catch (err: any) {
        hasError = true
        const msg = err?.response?.data?.error ?? 'Upload failed'
        setBulkStatus((prev) => prev.map((s, idx) => idx === i ? { ...s, status: 'error', error: msg } : s))
      }
    }
    if (hasError) setUploadError('Some files failed to upload')
    setDocName('')
    await loadDocuments()
    setUploading(false)
    e.target.value = ''
  }

  const handleViewDoc = (id: string) => {
    const url = getLibraryDocumentFileUrl(id)
    window.open(url, '_blank')
  }

  if (!isOwnerOrHr) return null

  const filteredDocs =
    filterCategory === 'all'
      ? documents
      : documents.filter((d) => d.category === filterCategory)

  const sortedDocs = [...filteredDocs].sort(
    (a, b) => new Date(b.uploadedAt || '').getTime() - new Date(a.uploadedAt || '').getTime()
  )

  // Group recent activity by month
  const recentEvents = sortedDocs.slice(0, 5)

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">
            Management Review
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">
            Central hub for management review documents, KPIs, and organizational health metrics.
          </p>
        </div>
      </div>

      {/* ─── KPI Dashboard Cards ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Active Employees"
          value={kpiData.activeEmployees}
          total={kpiData.totalEmployees}
          color="text-emerald-600 dark:text-emerald-400"
          icon="👥"
          to="/employees"
        />
        <KpiCard
          label="Total Certificates"
          value={kpiData.totalCerts}
          color="text-brand-600 dark:text-brand-400"
          icon="📜"
          to="/certificates"
        />
        <KpiCard
          label="Expiring (30d)"
          value={kpiData.expiringCerts}
          color="text-amber-600 dark:text-amber-400"
          icon="⚠️"
          alert={kpiData.expiringCerts > 0}
          to="/certificates?status=expiry-30"
        />
        <KpiCard
          label="Expired Certs"
          value={kpiData.expiredCerts}
          color="text-red-600 dark:text-red-400"
          icon="🚨"
          alert={kpiData.expiredCerts > 0}
          to="/certificates?status=expired"
        />
        <KpiCard
          label="DHA (30 Days)"
          value={kpiData.dhaSubmissions30d}
          color="text-blue-600 dark:text-blue-400"
          icon="📋"
          to="/library?view=submissions&from=safety&bucket=daily-hazard"
        />
        <KpiCard
          label="Review Docs"
          value={documents.length}
          color="text-violet-600 dark:text-violet-400"
          icon="📁"
        />
      </div>

      {/* ─── Form Red Flags mini ─── */}
      <Link
        to="/hq/quality-findings"
        className={`block rounded-xl border bg-white dark:bg-neutral-900/60 px-5 py-4 shadow-sm transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/40 ${
          kpiData.formRedFlagsOpen > 0
            ? 'border-amber-300 dark:border-amber-700'
            : 'border-neutral-200 dark:border-neutral-700'
        }`}
      >
        <p
          className={`text-3xl font-bold tracking-tight ${
            kpiData.formRedFlagsOpen > 0
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-neutral-900 dark:text-white'
          }`}
        >
          {kpiData.formRedFlagsOpen}
        </p>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">Form Red Flags (open)</p>
      </Link>

      {/* ─── Quick Summary ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Compliance Health */}
        <Card padding="md" className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/30 dark:to-emerald-800/20 -translate-y-6 translate-x-6 opacity-60" />
          <h3 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Compliance Health</h3>
          <div className="mt-3 flex items-end gap-3">
            <span className={`text-4xl font-bold tracking-tight ${
              kpiData.expiredCerts === 0 && kpiData.expiringCerts === 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : kpiData.expiredCerts > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400'
            }`}>
              {kpiData.expiredCerts === 0 && kpiData.expiringCerts === 0
                ? '✓'
                : kpiData.expiredCerts > 0
                  ? '!'
                  : '~'}
            </span>
            <span className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">
              {kpiData.expiredCerts === 0 && kpiData.expiringCerts === 0
                ? 'All certificates current'
                : kpiData.expiredCerts > 0
                  ? `${kpiData.expiredCerts} expired certificate${kpiData.expiredCerts !== 1 ? 's' : ''} need attention`
                  : `${kpiData.expiringCerts} certificate${kpiData.expiringCerts !== 1 ? 's' : ''} expiring soon`}
            </span>
          </div>
        </Card>

        {/* Workforce Overview */}
        <Card padding="md" className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/20 -translate-y-6 translate-x-6 opacity-60" />
          <h3 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Workforce</h3>
          <div className="mt-3 flex items-end gap-3">
            <span className="text-4xl font-bold tracking-tight text-neutral-900 dark:text-white">{kpiData.activeEmployees}</span>
            <span className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">
              of {kpiData.totalEmployees} employees active
            </span>
          </div>
          {kpiData.totalEmployees > 0 && (
            <div className="mt-3 h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-700 ease-out"
                style={{ width: `${(kpiData.activeEmployees / kpiData.totalEmployees) * 100}%` }}
              />
            </div>
          )}
        </Card>

        {/* Safety Activity */}
        <Card padding="md" className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br from-violet-100 to-violet-200 dark:from-violet-900/30 dark:to-violet-800/20 -translate-y-6 translate-x-6 opacity-60" />
          <h3 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Safety Activity</h3>
          <div className="mt-3 flex items-end gap-3">
            <span className="text-4xl font-bold tracking-tight text-violet-600 dark:text-violet-400">{kpiData.dhaSubmissions30d}</span>
            <span className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">
              hazard analyses filed (30 days)
            </span>
          </div>
        </Card>
      </div>

      {/* ─── Document Categories ─── */}
      <Card padding="lg">
        <CardHeader>Document Categories</CardHeader>
        <CardDescription>Organize and access management review documents by type.</CardDescription>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {REVIEW_CATEGORIES.map((cat) => {
            const count = documents.filter((d) => d.category === cat.key).length
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setFilterCategory(filterCategory === cat.key ? 'all' : cat.key)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 hover:shadow-md cursor-pointer ${
                  filterCategory === cat.key
                    ? 'ring-2 ring-brand-500 shadow-md ' + cat.color
                    : cat.color + ' hover:scale-[1.02]'
                }`}
              >
                <span className="text-2xl">{cat.icon}</span>
                <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 text-center leading-tight">{cat.label}</span>
                <span className="text-lg font-bold text-neutral-900 dark:text-white">{count}</span>
              </button>
            )
          })}
        </div>
      </Card>

      {/* ─── Upload Section ─── */}
      <Card padding="lg" className="border-brand-200 dark:border-brand-800/50 bg-gradient-to-br from-brand-50/30 to-transparent dark:from-brand-950/10">
        <CardHeader>Upload Documents</CardHeader>
        <CardDescription>Upload one or more PDFs for management review — meeting minutes, audit reports, policy updates, and more.</CardDescription>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              label="Document Name (optional)"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="e.g. Q1 2026 Safety Audit"
            />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
              aria-label="Document category"
            >
              {REVIEW_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
              ))}
            </select>
          </div>
          <div className="shrink-0">
            <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              {uploading ? 'Uploading…' : 'Choose Documents'}
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                multiple
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          </div>
        </div>
        {/* Bulk upload per-file status */}
        {bulkStatus.length > 0 && (
          <div className="mt-3 space-y-1">
            {bulkStatus.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                {item.status === 'pending' && <span className="w-4 h-4 text-neutral-400">○</span>}
                {item.status === 'uploading' && <span className="w-4 h-4 text-brand-500 animate-spin">⟳</span>}
                {item.status === 'done' && <span className="w-4 h-4 text-emerald-500">✓</span>}
                {item.status === 'error' && <span className="w-4 h-4 text-red-500">✗</span>}
                <span className={`truncate max-w-xs ${item.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-neutral-700 dark:text-neutral-300'}`}>
                  {item.name}
                </span>
                {item.error && <span className="text-xs text-red-500">— {item.error}</span>}
              </div>
            ))}
          </div>
        )}
        {uploadError && bulkStatus.length === 0 && (
          <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-sm text-red-600 dark:text-red-400">
            {uploadError}
          </div>
        )}
      </Card>

      {/* ─── Recent Activity Timeline ─── */}
      {recentEvents.length > 0 && (
        <Card padding="lg">
          <CardHeader>Recent Activity</CardHeader>
          <div className="mt-4 relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-neutral-200 dark:bg-neutral-700" />
            <ul className="space-y-4 pl-10">
              {recentEvents.map((doc) => {
                const catInfo = REVIEW_CATEGORIES.find((c) => c.key === doc.category)
                return (
                  <li key={doc.id} className="relative">
                    <span className="absolute -left-[1.625rem] top-1 w-3 h-3 rounded-full bg-brand-500 ring-4 ring-white dark:ring-neutral-900" />
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{catInfo?.icon || '📂'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">{doc.name}</p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {catInfo?.label || 'Other'}
                          {doc.uploadedAt && <> · {new Date(doc.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>}
                          {doc.uploadedBy && <> · by {doc.uploadedBy}</>}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleViewDoc(doc.id)}>View</Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </Card>
      )}

      {/* ─── All Documents Table ─── */}
      <Card padding="lg">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardHeader>All Documents</CardHeader>
            <CardDescription>
              {filterCategory === 'all'
                ? `${sortedDocs.length} document${sortedDocs.length !== 1 ? 's' : ''} uploaded`
                : `Showing ${REVIEW_CATEGORIES.find((c) => c.key === filterCategory)?.label ?? filterCategory}`}
            </CardDescription>
          </div>
          {filterCategory !== 'all' && (
            <Button size="sm" variant="ghost" onClick={() => setFilterCategory('all')}>
              Show All
            </Button>
          )}
        </div>
        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <div className="py-12 text-center text-neutral-500 dark:text-neutral-400 animate-pulse">Loading documents…</div>
          ) : sortedDocs.length === 0 ? (
            <div className="py-12 text-center">
              <span className="text-4xl">📂</span>
              <p className="mt-3 text-neutral-500 dark:text-neutral-400 text-sm">
                {filterCategory !== 'all'
                  ? `No ${REVIEW_CATEGORIES.find((c) => c.key === filterCategory)?.label ?? ''} documents yet.`
                  : 'No management review documents uploaded yet. Use the upload section above to get started.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-600">
                  <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400 text-sm">Document</th>
                  <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400 text-sm">Category</th>
                  <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400 text-sm">Uploaded</th>
                  <th className="py-2 pr-4 font-medium text-neutral-600 dark:text-neutral-400 text-sm"></th>
                </tr>
              </thead>
              <tbody>
                {sortedDocs.map((doc) => {
                  const catInfo = REVIEW_CATEGORIES.find((c) => c.key === doc.category)
                  return (
                    <tr key={doc.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <span className="text-lg shrink-0">{catInfo?.icon || '📂'}</span>
                          <span className="font-medium text-neutral-900 dark:text-white truncate max-w-[18rem]">{doc.name}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border ${catInfo?.color || 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700'}`}>
                          {catInfo?.label || 'Other'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-sm text-neutral-600 dark:text-neutral-400">
                        {doc.uploadedAt
                          ? new Date(doc.uploadedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                        {doc.uploadedBy && (
                          <span className="block text-xs text-neutral-500 mt-0.5">by {doc.uploadedBy}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleViewDoc(doc.id)}
                          className="text-brand-600 dark:text-brand-400 hover:underline text-sm font-medium"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}

/* ─── KPI Card Component ─── */
function KpiCard({
  label,
  value,
  total,
  color,
  icon,
  alert,
  to,
}: {
  label: string
  value: number
  total?: number
  color: string
  icon: string
  alert?: boolean
  to?: string
}) {
  const body = (
    <Card padding="md" className={`flex flex-col items-center justify-center text-center relative overflow-hidden h-full ${alert ? 'ring-1 ring-red-300 dark:ring-red-700' : ''} ${to ? 'transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/40' : ''}`}>
      {alert && (
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
      )}
      <span className="text-xl mb-1">{icon}</span>
      <p className={`text-2xl font-bold tracking-tight ${color}`}>
        {value}
        {total != null && <span className="text-sm font-normal text-neutral-400">/{total}</span>}
      </p>
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mt-1 leading-tight">{label}</p>
    </Card>
  )
  if (to) {
    return (
      <Link to={to} className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        {body}
      </Link>
    )
  }
  return body
}
