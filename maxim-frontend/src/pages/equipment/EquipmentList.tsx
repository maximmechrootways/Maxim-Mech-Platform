import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  fetchEquipmentList,
  createEquipment,
  type EquipmentListItem,
  type MaintenanceSchedule,
} from '@/api/equipment'
import { fetchSites, type SiteOption } from '@/api/jobs'
import { FleetCarInsuranceSection } from '@/pages/equipment/FleetCarInsuranceSection'

const SCHEDULE_LABELS: Record<MaintenanceSchedule, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  before_use: 'Before use',
}

const ALL_SCHEDULES: MaintenanceSchedule[] = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'annual',
  'before_use',
]

type SortKey =
  | 'name'
  | 'modelSerial'
  | 'tag'
  | 'manufacturer'
  | 'siteName'
  | 'maintenanceSchedule'
type SortDir = 'asc' | 'desc'

export function EquipmentList() {
  const { user } = useUser()
  const canAccess = user?.role === 'owner' || user?.role === 'hr' || user?.role === 'supervisor'

  const [items, setItems] = useState<EquipmentListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sites, setSites] = useState<SiteOption[]>([])
  const [sitesLoadError, setSitesLoadError] = useState(false)

  const [search, setSearch] = useState('')
  const [scheduleFilter, setScheduleFilter] = useState<MaintenanceSchedule | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const [showAdd, setShowAdd] = useState(false)
  const [formName, setFormName] = useState('')
  const [formSiteId, setFormSiteId] = useState('')
  const [formSchedule, setFormSchedule] = useState<MaintenanceSchedule>('monthly')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!canAccess) return
    setLoading(true)
    setSitesLoadError(false)
    fetchEquipmentList()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [canAccess])

  useEffect(() => {
    if (!canAccess) return
    fetchSites(true)
      .then((list) => {
        setSites(list)
        setSitesLoadError(false)
      })
      .catch(() => {
        setSites([])
        setSitesLoadError(true)
      })
  }, [canAccess])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    let list = items.filter((e) => {
      if (scheduleFilter !== 'all' && e.maintenanceSchedule !== scheduleFilter) return false
      if (!q) return true
      const modelSerial = `${e.modelNumber ?? ''} ${e.serialNumber ?? ''}`.toLowerCase()
      const site = (e.site?.name ?? '').toLowerCase()
      return (
        e.name.toLowerCase().includes(q) ||
        modelSerial.includes(q) ||
        (e.tag ?? '').toLowerCase().includes(q) ||
        (e.manufacturer ?? '').toLowerCase().includes(q) ||
        site.includes(q)
      )
    })
    list = [...list].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
          break
        case 'modelSerial': {
          const as = `${a.modelNumber ?? ''} ${a.serialNumber ?? ''}`.toLowerCase()
          const bs = `${b.modelNumber ?? ''} ${b.serialNumber ?? ''}`.toLowerCase()
          cmp = as.localeCompare(bs)
          break
        }
        case 'tag':
          cmp = (a.tag ?? '').localeCompare(b.tag ?? '', undefined, { sensitivity: 'base' })
          break
        case 'manufacturer':
          cmp = (a.manufacturer ?? '').localeCompare(b.manufacturer ?? '', undefined, { sensitivity: 'base' })
          break
        case 'siteName':
          cmp = (a.site?.name ?? '').localeCompare(b.site?.name ?? '', undefined, { sensitivity: 'base' })
          break
        case 'maintenanceSchedule':
          cmp = a.maintenanceSchedule.localeCompare(b.maintenanceSchedule)
          break
        default:
          cmp = 0
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [items, search, scheduleFilter, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="ml-1 text-neutral-400 dark:text-neutral-600">↕</span>
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) return
    setSaving(true)
    setFormError(null)
    try {
      await createEquipment({
        name: formName.trim(),
        siteId: formSiteId || null,
        maintenanceSchedule: formSchedule,
      })
      const list = await fetchEquipmentList()
      setItems(list)
      setShowAdd(false)
      setFormName('')
      setFormSiteId('')
      setFormSchedule('monthly')
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ??
        err?.response?.data?.message ??
        (typeof err?.message === 'string' ? err.message : null)
      setFormError(msg || 'Could not add equipment')
    } finally {
      setSaving(false)
    }
  }

  if (!canAccess) return null
  if (loading && items.length === 0) {
    return <div className="animate-fade-in text-neutral-500 dark:text-neutral-400">Loading equipment…</div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">
            Equipment log
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">
            Track heavy equipment on job sites, maintenance schedules, and inspection links.
          </p>
        </div>
        <Button onClick={() => setShowAdd((o) => !o)} leftIcon={<PlusIcon />}>
          Add equipment
        </Button>
      </div>

      {showAdd && (
        <Card padding="lg" className="animate-fade-in">
          <CardHeader>Add equipment</CardHeader>
          <CardDescription>Link each unit to a job site from Job Management and set its maintenance schedule.</CardDescription>
          <form onSubmit={handleAdd} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div className="sm:col-span-2">
              <Input label="Equipment Name" value={formName} onChange={(e) => setFormName(e.target.value)} required />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1" htmlFor="equipment-job-site">
                Job Site
              </label>
              <select
                id="equipment-job-site"
                value={formSiteId}
                onChange={(e) => setFormSiteId(e.target.value)}
                className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
              >
                <option value="">Select a job site (optional)</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.activeJobTitle ? ` — ${s.activeJobTitle}` : ''}
                  </option>
                ))}
              </select>
              {sitesLoadError && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  Could not load job sites. Refresh the page or check your connection.
                </p>
              )}
              {!sitesLoadError && sites.length === 0 && (
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  No job sites yet. Create sites under Job Management first, then assign equipment here.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1" htmlFor="equipment-maint-schedule">
                Maintenance
              </label>
              <select
                id="equipment-maint-schedule"
                value={formSchedule}
                onChange={(e) => setFormSchedule(e.target.value as MaintenanceSchedule)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
              >
                {ALL_SCHEDULES.map((s) => (
                  <option key={s} value={s}>
                    {SCHEDULE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit" disabled={saving || !formName.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            </div>
            {formError && (
              <div className="sm:col-span-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 text-sm text-red-600 dark:text-red-400">
                {formError}
              </div>
            )}
          </form>
        </Card>
      )}

      <Card padding="lg">
        <CardHeader>Equipment identification</CardHeader>
        <CardDescription>Sort columns, filter by maintenance schedule, or search.</CardDescription>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="w-full min-w-0 sm:flex-1 sm:max-w-md">
            <Input
              label="Search"
              placeholder="Name, model, serial, tag, manufacturer, job site…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-56 sm:shrink-0 sm:ml-auto">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1" htmlFor="equipment-filter-maintenance">
              Maintenance
            </label>
            <select
              id="equipment-filter-maintenance"
              value={scheduleFilter}
              onChange={(e) => setScheduleFilter(e.target.value as MaintenanceSchedule | 'all')}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
            >
              <option value="all">All schedules</option>
              {ALL_SCHEDULES.map((s) => (
                <option key={s} value={s}>
                  {SCHEDULE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[16%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[20%]" />
              <col className="w-[14rem]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-600">
                <th
                  className="py-2 pr-3 font-medium text-neutral-600 dark:text-neutral-400 cursor-pointer select-none"
                  onClick={() => handleSort('name')}
                >
                  Equipment Name
                  <SortIcon col="name" />
                </th>
                <th
                  className="py-2 pr-3 font-medium text-neutral-600 dark:text-neutral-400 cursor-pointer select-none"
                  onClick={() => handleSort('modelSerial')}
                >
                  Model / Serial #
                  <SortIcon col="modelSerial" />
                </th>
                <th
                  className="py-2 pr-3 font-medium text-neutral-600 dark:text-neutral-400 cursor-pointer select-none"
                  onClick={() => handleSort('tag')}
                >
                  Tag
                  <SortIcon col="tag" />
                </th>
                <th
                  className="py-2 pr-3 font-medium text-neutral-600 dark:text-neutral-400 cursor-pointer select-none"
                  onClick={() => handleSort('manufacturer')}
                >
                  Manufacturer
                  <SortIcon col="manufacturer" />
                </th>
                <th
                  className="py-2 pr-3 font-medium text-neutral-600 dark:text-neutral-400 cursor-pointer select-none"
                  onClick={() => handleSort('siteName')}
                >
                  Job Site / Location
                  <SortIcon col="siteName" />
                </th>
                <th
                  className="py-2 pl-2 pr-0 font-medium text-neutral-600 dark:text-neutral-400 cursor-pointer select-none text-right whitespace-nowrap"
                  onClick={() => handleSort('maintenanceSchedule')}
                >
                  <span className="inline-flex items-center justify-end gap-0.5">
                    Maintenance
                    <SortIcon col="maintenanceSchedule" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 dark:border-slate-700/50">
                  <td className="py-3 pr-3 align-top">
                    <Link
                      to={`/equipment/${row.id}`}
                      className="font-medium text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-3 text-sm text-neutral-700 dark:text-neutral-300 align-top break-words">
                    {[row.modelNumber, row.serialNumber].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="py-3 pr-3 text-sm align-top">{row.tag ?? '—'}</td>
                  <td className="py-3 pr-3 text-sm align-top break-words">{row.manufacturer ?? '—'}</td>
                  <td className="py-3 pr-3 text-sm align-top break-words">{row.site?.name ?? '—'}</td>
                  <td className="py-3 pl-2 pr-0 text-sm text-right align-top whitespace-nowrap">
                    {SCHEDULE_LABELS[row.maintenanceSchedule] ?? row.maintenanceSchedule}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-neutral-500 dark:text-neutral-400">
                    {search || scheduleFilter !== 'all' ? 'No equipment matches your filters.' : 'No equipment yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <FleetCarInsuranceSection />
    </div>
  )
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  )
}
