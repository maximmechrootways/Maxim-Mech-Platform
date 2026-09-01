import { useState, useEffect, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useUser } from '@/contexts/UserContext'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  fetchEquipmentDetail,
  updateEquipment,
  deleteEquipment,
  addMaintenanceRecord,
  updateMaintenanceRecord,
  deleteMaintenanceRecord,
  addCostEntry,
  updateCostEntry,
  uploadCostInvoice,
  deleteCostEntry,
  addInsurance,
  updateInsurance,
  uploadInsurancePolicy,
  deleteInsurance,
  linkInspectionSubmission,
  unlinkInspectionSubmission,
  fetchEquipmentFileBlob,
  type EquipmentDetail as EquipmentDetailType,
  type MaintenanceSchedule,
} from '@/api/equipment'
import { fetchSites } from '@/api/jobs'

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

export function EquipmentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useUser()
  const canAccess = user?.role === 'owner' || user?.role === 'hr' || user?.role === 'supervisor'

  const [data, setData] = useState<EquipmentDetailType | null>(null)
  const [sites, setSites] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editName, setEditName] = useState('')
  const [editModel, setEditModel] = useState('')
  const [editSerial, setEditSerial] = useState('')
  const [editTag, setEditTag] = useState('')
  const [editManufacturer, setEditManufacturer] = useState('')
  const [editSiteId, setEditSiteId] = useState('')
  const [editSchedule, setEditSchedule] = useState<MaintenanceSchedule>('monthly')
  const [editCost, setEditCost] = useState('')
  const [editPurchaseDate, setEditPurchaseDate] = useState('')
  const [savingHeader, setSavingHeader] = useState(false)

  const [newSubmissionId, setNewSubmissionId] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      // Load equipment first — don't fail the page if sites fetch errors/times out.
      const d = await fetchEquipmentDetail(id)
      setData(d)
      setEditName(d.name)
      setEditModel(d.modelNumber ?? '')
      setEditSerial(d.serialNumber ?? '')
      setEditTag(d.tag ?? '')
      setEditManufacturer(d.manufacturer ?? '')
      setEditSiteId(d.siteId ?? '')
      setEditSchedule(d.maintenanceSchedule)
      setEditCost(d.costAtPurchase != null ? String(d.costAtPurchase) : '')
      setEditPurchaseDate(
        d.dateOfPurchase ? d.dateOfPurchase.slice(0, 10) : ''
      )
      try {
        const siteList = await fetchSites(true)
        setSites(siteList)
      } catch {
        setSites([])
      }
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Could not load equipment')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (!canAccess || !id) return
    load()
  }, [canAccess, id, load])

  const saveHeader = async () => {
    if (!id || !data) return
    setSavingHeader(true)
    try {
      const cost = editCost.trim() === '' ? null : Number(editCost)
      await updateEquipment(id, {
        name: editName.trim(),
        modelNumber: editModel.trim() || null,
        serialNumber: editSerial.trim() || null,
        tag: editTag.trim() || null,
        manufacturer: editManufacturer.trim() || null,
        siteId: editSiteId || null,
        maintenanceSchedule: editSchedule,
        costAtPurchase: cost != null && !Number.isNaN(cost) ? cost : null,
        dateOfPurchase: editPurchaseDate.trim() || null,
      })
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Save failed')
    } finally {
      setSavingHeader(false)
    }
  }

  const handleDeleteEquipment = async () => {
    if (!id || !data) return
    if (!window.confirm(`Delete “${data.name}” and all related records?`)) return
    try {
      await deleteEquipment(id)
      navigate('/equipment')
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Delete failed')
    }
  }

  const quickView = async (filePath: string) => {
    const blob = await fetchEquipmentFileBlob(filePath)
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    setTimeout(() => URL.revokeObjectURL(url), 120_000)
  }

  const linkSubmission = async () => {
    if (!id || !newSubmissionId.trim()) return
    try {
      const d = await linkInspectionSubmission(id, newSubmissionId.trim())
      setData(d)
      setNewSubmissionId('')
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Could not link submission')
    }
  }

  const unlinkSub = async (submissionId: string) => {
    if (!id) return
    try {
      const d = await unlinkInspectionSubmission(id, submissionId)
      setData(d)
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Could not remove link')
    }
  }

  if (!canAccess) return null
  if (loading && !data) {
    return <div className="text-neutral-500 dark:text-neutral-400">Loading…</div>
  }
  if (!data || !id) {
    return (
      <div className="space-y-4">
        <p className="text-red-600 dark:text-red-400">{error ?? 'Not found'}</p>
        <Link to="/equipment" className="text-brand-600 dark:text-brand-400 hover:underline">
          ← Back to equipment log
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/equipment" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
            ← Equipment log
          </Link>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight mt-2">
            {data.name}
          </h1>
        </div>
        <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={handleDeleteEquipment}>
          Delete equipment
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 text-sm text-amber-900 dark:text-amber-100">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding="lg">
          <CardHeader>Equipment details</CardHeader>
          <CardDescription>Identification, job site, purchase, and maintenance schedule.</CardDescription>
          <div className="mt-4 space-y-3">
            <Input label="Equipment Name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Model / Serial #" value={editModel} onChange={(e) => setEditModel(e.target.value)} />
              <Input label="Serial #" value={editSerial} onChange={(e) => setEditSerial(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Tag" value={editTag} onChange={(e) => setEditTag(e.target.value)} />
              <Input label="Manufacturer" value={editManufacturer} onChange={(e) => setEditManufacturer(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Job site</label>
              <select
                value={editSiteId}
                onChange={(e) => setEditSiteId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Maintenance schedule</label>
              <select
                value={editSchedule}
                onChange={(e) => setEditSchedule(e.target.value as MaintenanceSchedule)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
              >
                {ALL_SCHEDULES.map((s) => (
                  <option key={s} value={s}>
                    {SCHEDULE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Cost at purchase"
                type="number"
                step="0.01"
                value={editCost}
                onChange={(e) => setEditCost(e.target.value)}
              />
              <Input label="Date of purchase" type="date" value={editPurchaseDate} onChange={(e) => setEditPurchaseDate(e.target.value)} />
            </div>
            <Button onClick={saveHeader} disabled={savingHeader}>
              {savingHeader ? 'Saving…' : 'Save details'}
            </Button>
          </div>
        </Card>

        <Card padding="lg">
          <CardHeader>Equipment inspections</CardHeader>
          <CardDescription>
            Link completed form submissions (equipment inspections). Browse{' '}
            <Link to="/library?view=submissions&from=safety" className="text-brand-600 dark:text-brand-400 hover:underline">
              completed forms
            </Link>
            , then paste the submission ID here.
          </CardDescription>
          <div className="mt-4 flex flex-wrap gap-2">
            <Input
              className="flex-1 min-w-[200px]"
              placeholder="Form submission ID (UUID)"
              value={newSubmissionId}
              onChange={(e) => setNewSubmissionId(e.target.value)}
            />
            <Button type="button" onClick={linkSubmission} disabled={!newSubmissionId.trim()}>
              Link
            </Button>
          </div>
          <ul className="mt-4 space-y-2">
            {(data.inspectionSubmissionIds ?? []).length === 0 && (
              <li className="text-sm text-neutral-500">No inspection submissions linked yet.</li>
            )}
            {(data.inspectionSubmissionIds ?? []).map((sid) => (
              <li key={sid} className="flex flex-wrap items-center gap-2 text-sm">
                <Link to={`/forms/${sid}`} className="text-brand-600 dark:text-brand-400 hover:underline font-mono break-all">
                  {sid}
                </Link>
                <Button type="button" variant="ghost" size="sm" onClick={() => unlinkSub(sid)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card padding="lg">
        <CardHeader>Maintenance details</CardHeader>
        <CardDescription>Hours, mileage, work description, technician, company, and next / performed date.</CardDescription>
        <MaintenanceSection equipmentId={id} records={data.maintenanceRecords} onChanged={load} />
      </Card>

      <Card padding="lg">
        <CardHeader>Cost tracking</CardHeader>
        <CardDescription>Labour cost, material cost, warranty coverage, total cost, and invoice attachment (PDF/PNG) with quick view.</CardDescription>
        <CostSection equipmentId={id} entries={data.costEntries} onChanged={load} onQuickView={quickView} />
      </Card>

      <Card padding="lg">
        <CardHeader>Insurance documentation</CardHeader>
        <CardDescription>Policy or certificate, expiry, and policy PDF or image with quick view.</CardDescription>
        <InsuranceSection equipmentId={id} rows={data.insurancePolicies} onChanged={load} onQuickView={quickView} />
      </Card>
    </div>
  )
}

function MaintenanceSection({
  equipmentId,
  records,
  onChanged,
}: {
  equipmentId: string
  records: EquipmentDetailType['maintenanceRecords']
  onChanged: () => void
}) {
  const empty = {
    hoursAtLastMaintenance: '',
    mileage: '',
    descriptionOfWork: '',
    partsReplacedOrRepaired: '',
    technicianNameOrNumber: '',
    maintenanceCompany: '',
    dateMaintenanceRequired: '',
  }
  const [draft, setDraft] = useState(empty)
  const [saving, setSaving] = useState(false)

  const add = async () => {
    setSaving(true)
    try {
      await addMaintenanceRecord(equipmentId, {
        hoursAtLastMaintenance: draft.hoursAtLastMaintenance === '' ? null : Number(draft.hoursAtLastMaintenance),
        mileage: draft.mileage === '' ? null : Number(draft.mileage),
        descriptionOfWork: draft.descriptionOfWork || null,
        partsReplacedOrRepaired: draft.partsReplacedOrRepaired || null,
        technicianNameOrNumber: draft.technicianNameOrNumber || null,
        maintenanceCompany: draft.maintenanceCompany || null,
        dateMaintenanceRequired: draft.dateMaintenanceRequired || null,
      })
      setDraft(empty)
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 space-y-4 overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[960px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-600">
            <th className="py-2 pr-2">Hours at last maint.</th>
            <th className="py-2 pr-2">Mileage</th>
            <th className="py-2 pr-2">Description / work</th>
            <th className="py-2 pr-2">Parts replaced / repaired</th>
            <th className="py-2 pr-2">Technician / #</th>
            <th className="py-2 pr-2">Maintenance company</th>
            <th className="py-2 pr-2">Date maintenance</th>
            <th className="py-2 pr-2" />
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <MaintenanceRow key={r.id} equipmentId={equipmentId} r={r} onChanged={onChanged} />
          ))}
          <tr className="border-t border-slate-100 dark:border-slate-700 align-top">
            <td className="py-2 pr-2">
              <input
                className="w-24 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
                type="number"
                value={draft.hoursAtLastMaintenance}
                onChange={(e) => setDraft((d) => ({ ...d, hoursAtLastMaintenance: e.target.value }))}
              />
            </td>
            <td className="py-2 pr-2">
              <input
                className="w-24 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
                type="number"
                value={draft.mileage}
                onChange={(e) => setDraft((d) => ({ ...d, mileage: e.target.value }))}
              />
            </td>
            <td className="py-2 pr-2">
              <textarea
                className="w-full min-w-[140px] rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                rows={2}
                value={draft.descriptionOfWork}
                onChange={(e) => setDraft((d) => ({ ...d, descriptionOfWork: e.target.value }))}
              />
            </td>
            <td className="py-2 pr-2">
              <textarea
                className="w-full min-w-[120px] rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                rows={2}
                value={draft.partsReplacedOrRepaired}
                onChange={(e) => setDraft((d) => ({ ...d, partsReplacedOrRepaired: e.target.value }))}
              />
            </td>
            <td className="py-2 pr-2">
              <input
                className="w-full min-w-[100px] rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
                value={draft.technicianNameOrNumber}
                onChange={(e) => setDraft((d) => ({ ...d, technicianNameOrNumber: e.target.value }))}
              />
            </td>
            <td className="py-2 pr-2">
              <input
                className="w-full min-w-[100px] rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
                value={draft.maintenanceCompany}
                onChange={(e) => setDraft((d) => ({ ...d, maintenanceCompany: e.target.value }))}
              />
            </td>
            <td className="py-2 pr-2">
              <input
                type="date"
                className="rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
                value={draft.dateMaintenanceRequired}
                onChange={(e) => setDraft((d) => ({ ...d, dateMaintenanceRequired: e.target.value }))}
              />
            </td>
            <td className="py-2 pr-2">
              <Button type="button" size="sm" onClick={add} disabled={saving}>
                Add
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function MaintenanceRow({
  equipmentId,
  r,
  onChanged,
}: {
  equipmentId: string
  r: EquipmentDetailType['maintenanceRecords'][0]
  onChanged: () => void
}) {
  const [local, setLocal] = useState({
    hoursAtLastMaintenance: r.hoursAtLastMaintenance != null ? String(r.hoursAtLastMaintenance) : '',
    mileage: r.mileage != null ? String(r.mileage) : '',
    descriptionOfWork: r.descriptionOfWork ?? '',
    partsReplacedOrRepaired: r.partsReplacedOrRepaired ?? '',
    technicianNameOrNumber: r.technicianNameOrNumber ?? '',
    maintenanceCompany: r.maintenanceCompany ?? '',
    dateMaintenanceRequired: r.dateMaintenanceRequired ? r.dateMaintenanceRequired.slice(0, 10) : '',
  })
  useEffect(() => {
    setLocal({
      hoursAtLastMaintenance: r.hoursAtLastMaintenance != null ? String(r.hoursAtLastMaintenance) : '',
      mileage: r.mileage != null ? String(r.mileage) : '',
      descriptionOfWork: r.descriptionOfWork ?? '',
      partsReplacedOrRepaired: r.partsReplacedOrRepaired ?? '',
      technicianNameOrNumber: r.technicianNameOrNumber ?? '',
      maintenanceCompany: r.maintenanceCompany ?? '',
      dateMaintenanceRequired: r.dateMaintenanceRequired ? r.dateMaintenanceRequired.slice(0, 10) : '',
    })
  }, [r])

  const save = async () => {
    await updateMaintenanceRecord(equipmentId, r.id, {
      hoursAtLastMaintenance: local.hoursAtLastMaintenance === '' ? null : Number(local.hoursAtLastMaintenance),
      mileage: local.mileage === '' ? null : Number(local.mileage),
      descriptionOfWork: local.descriptionOfWork || null,
      partsReplacedOrRepaired: local.partsReplacedOrRepaired || null,
      technicianNameOrNumber: local.technicianNameOrNumber || null,
      maintenanceCompany: local.maintenanceCompany || null,
      dateMaintenanceRequired: local.dateMaintenanceRequired || null,
    })
    onChanged()
  }

  const remove = async () => {
    if (!window.confirm('Delete this maintenance row?')) return
    await deleteMaintenanceRecord(equipmentId, r.id)
    onChanged()
  }

  return (
    <tr className="border-b border-slate-100 dark:border-slate-700/50 align-top">
      <td className="py-2 pr-2">
        <input
          className="w-24 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
          type="number"
          value={local.hoursAtLastMaintenance}
          onChange={(e) => setLocal((x) => ({ ...x, hoursAtLastMaintenance: e.target.value }))}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          className="w-24 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
          type="number"
          value={local.mileage}
          onChange={(e) => setLocal((x) => ({ ...x, mileage: e.target.value }))}
        />
      </td>
      <td className="py-2 pr-2">
        <textarea
          className="w-full rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
          rows={2}
          value={local.descriptionOfWork}
          onChange={(e) => setLocal((x) => ({ ...x, descriptionOfWork: e.target.value }))}
        />
      </td>
      <td className="py-2 pr-2">
        <textarea
          className="w-full rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
          rows={2}
          value={local.partsReplacedOrRepaired}
          onChange={(e) => setLocal((x) => ({ ...x, partsReplacedOrRepaired: e.target.value }))}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          className="w-full rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
          value={local.technicianNameOrNumber}
          onChange={(e) => setLocal((x) => ({ ...x, technicianNameOrNumber: e.target.value }))}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          className="w-full rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
          value={local.maintenanceCompany}
          onChange={(e) => setLocal((x) => ({ ...x, maintenanceCompany: e.target.value }))}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="date"
          className="rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
          value={local.dateMaintenanceRequired}
          onChange={(e) => setLocal((x) => ({ ...x, dateMaintenanceRequired: e.target.value }))}
        />
      </td>
      <td className="py-2 pr-2 whitespace-nowrap">
        <Button type="button" size="sm" variant="secondary" onClick={save}>
          Save
        </Button>{' '}
        <Button type="button" size="sm" variant="ghost" onClick={remove}>
          Delete
        </Button>
      </td>
    </tr>
  )
}

function CostSection({
  equipmentId,
  entries,
  onChanged,
  onQuickView,
}: {
  equipmentId: string
  entries: EquipmentDetailType['costEntries']
  onChanged: () => void
  onQuickView: (path: string) => void
}) {
  const [draft, setDraft] = useState({
    maintenancePerformed: '',
    labourCost: '',
    materialCost: '',
    warrantyCovered: false,
    totalCost: '',
  })

  const add = async () => {
    await addCostEntry(equipmentId, {
      maintenancePerformed: draft.maintenancePerformed || null,
      labourCost: draft.labourCost === '' ? null : Number(draft.labourCost),
      materialCost: draft.materialCost === '' ? null : Number(draft.materialCost),
      warrantyCovered: draft.warrantyCovered,
      totalCost: draft.totalCost === '' ? null : Number(draft.totalCost),
    })
    setDraft({
      maintenancePerformed: '',
      labourCost: '',
      materialCost: '',
      warrantyCovered: false,
      totalCost: '',
    })
    onChanged()
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-600">
            <th className="py-2 pr-2">Maintenance performed</th>
            <th className="py-2 pr-2">Labour Cost</th>
            <th className="py-2 pr-2">Material Cost</th>
            <th className="py-2 pr-2">Warranty Coverage</th>
            <th className="py-2 pr-2">Total Cost</th>
            <th className="py-2 pr-2">Invoice</th>
            <th className="py-2 pr-2" />
          </tr>
        </thead>
        <tbody>
          {entries.map((c) => (
            <CostRow key={c.id} equipmentId={equipmentId} c={c} onChanged={onChanged} onQuickView={onQuickView} />
          ))}
          <tr className="border-t border-slate-100 dark:border-slate-700 align-top">
            <td className="py-2 pr-2">
              <input
                className="w-full rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
                value={draft.maintenancePerformed}
                onChange={(e) => setDraft((d) => ({ ...d, maintenancePerformed: e.target.value }))}
              />
            </td>
            <td className="py-2 pr-2">
              <input
                type="number"
                className="w-28 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
                value={draft.labourCost}
                onChange={(e) => setDraft((d) => ({ ...d, labourCost: e.target.value }))}
              />
            </td>
            <td className="py-2 pr-2">
              <input
                type="number"
                className="w-28 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
                value={draft.materialCost}
                onChange={(e) => setDraft((d) => ({ ...d, materialCost: e.target.value }))}
              />
            </td>
            <td className="py-2 pr-2">
              <input
                type="checkbox"
                checked={draft.warrantyCovered}
                onChange={(e) => setDraft((d) => ({ ...d, warrantyCovered: e.target.checked }))}
              />
            </td>
            <td className="py-2 pr-2">
              <input
                type="number"
                className="w-28 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
                value={draft.totalCost}
                onChange={(e) => setDraft((d) => ({ ...d, totalCost: e.target.value }))}
              />
            </td>
            <td className="py-2 pr-2 text-neutral-400">—</td>
            <td className="py-2 pr-2">
              <Button type="button" size="sm" onClick={add}>
                Add
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function CostRow({
  equipmentId,
  c,
  onChanged,
  onQuickView,
}: {
  equipmentId: string
  c: EquipmentDetailType['costEntries'][0]
  onChanged: () => void
  onQuickView: (path: string) => void
}) {
  const [local, setLocal] = useState({
    maintenancePerformed: c.maintenancePerformed ?? '',
    labourCost: c.labourCost != null ? String(c.labourCost) : '',
    materialCost: c.materialCost != null ? String(c.materialCost) : '',
    warrantyCovered: c.warrantyCovered,
    totalCost: c.totalCost != null ? String(c.totalCost) : '',
  })
  useEffect(() => {
    setLocal({
      maintenancePerformed: c.maintenancePerformed ?? '',
      labourCost: c.labourCost != null ? String(c.labourCost) : '',
      materialCost: c.materialCost != null ? String(c.materialCost) : '',
      warrantyCovered: c.warrantyCovered,
      totalCost: c.totalCost != null ? String(c.totalCost) : '',
    })
  }, [c])

  const save = async () => {
    await updateCostEntry(equipmentId, c.id, {
      maintenancePerformed: local.maintenancePerformed || null,
      labourCost: local.labourCost === '' ? null : Number(local.labourCost),
      materialCost: local.materialCost === '' ? null : Number(local.materialCost),
      warrantyCovered: local.warrantyCovered,
      totalCost: local.totalCost === '' ? null : Number(local.totalCost),
    })
    onChanged()
  }

  const onFile = async (file: File | null) => {
    if (!file) return
    await uploadCostInvoice(equipmentId, c.id, file)
    onChanged()
  }

  const remove = async () => {
    if (!window.confirm('Delete this cost row?')) return
    await deleteCostEntry(equipmentId, c.id)
    onChanged()
  }

  return (
    <tr className="border-b border-slate-100 dark:border-slate-700/50 align-top">
      <td className="py-2 pr-2">
        <input
          className="w-full rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
          value={local.maintenancePerformed}
          onChange={(e) => setLocal((x) => ({ ...x, maintenancePerformed: e.target.value }))}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          className="w-28 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
          value={local.labourCost}
          onChange={(e) => setLocal((x) => ({ ...x, labourCost: e.target.value }))}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          className="w-28 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
          value={local.materialCost}
          onChange={(e) => setLocal((x) => ({ ...x, materialCost: e.target.value }))}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="checkbox"
          checked={local.warrantyCovered}
          onChange={(e) => setLocal((x) => ({ ...x, warrantyCovered: e.target.checked }))}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          className="w-28 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
          value={local.totalCost}
          onChange={(e) => setLocal((x) => ({ ...x, totalCost: e.target.value }))}
        />
      </td>
      <td className="py-2 pr-2">
        <div className="flex flex-col gap-1">
          {c.invoiceFilePath && (
            <Button type="button" size="sm" variant="outline" onClick={() => onQuickView(c.invoiceFilePath!)}>
              Quick view
            </Button>
          )}
          <label className="text-xs text-brand-600 dark:text-brand-400 cursor-pointer">
            <input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            {c.invoiceFilePath ? 'Replace' : 'Upload'}
          </label>
          {c.invoiceOriginalName && <span className="text-xs text-neutral-500 truncate max-w-[120px]">{c.invoiceOriginalName}</span>}
        </div>
      </td>
      <td className="py-2 pr-2 whitespace-nowrap">
        <Button type="button" size="sm" variant="secondary" onClick={save}>
          Save
        </Button>{' '}
        <Button type="button" size="sm" variant="ghost" onClick={remove}>
          Delete
        </Button>
      </td>
    </tr>
  )
}

function InsuranceSection({
  equipmentId,
  rows,
  onChanged,
  onQuickView,
}: {
  equipmentId: string
  rows: EquipmentDetailType['insurancePolicies']
  onChanged: () => void
  onQuickView: (path: string) => void
}) {
  const [draft, setDraft] = useState({ policyOrCertificate: '', expiryDate: '' })

  const add = async () => {
    await addInsurance(equipmentId, {
      policyOrCertificate: draft.policyOrCertificate || null,
      expiryDate: draft.expiryDate || null,
    })
    setDraft({ policyOrCertificate: '', expiryDate: '' })
    onChanged()
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-600">
            <th className="py-2 pr-2">Policy / certificate</th>
            <th className="py-2 pr-2">Expiry</th>
            <th className="py-2 pr-2">Policy file</th>
            <th className="py-2 pr-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <InsuranceRow key={row.id} equipmentId={equipmentId} row={row} onChanged={onChanged} onQuickView={onQuickView} />
          ))}
          <tr className="border-t border-slate-100 dark:border-slate-700 align-top">
            <td className="py-2 pr-2">
              <input
                className="w-full rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
                value={draft.policyOrCertificate}
                onChange={(e) => setDraft((d) => ({ ...d, policyOrCertificate: e.target.value }))}
              />
            </td>
            <td className="py-2 pr-2">
              <input
                type="date"
                className="rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
                value={draft.expiryDate}
                onChange={(e) => setDraft((d) => ({ ...d, expiryDate: e.target.value }))}
              />
            </td>
            <td className="py-2 pr-2 text-neutral-400">—</td>
            <td className="py-2 pr-2">
              <Button type="button" size="sm" onClick={add}>
                Add
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function InsuranceRow({
  equipmentId,
  row,
  onChanged,
  onQuickView,
}: {
  equipmentId: string
  row: EquipmentDetailType['insurancePolicies'][0]
  onChanged: () => void
  onQuickView: (path: string) => void
}) {
  const [local, setLocal] = useState({
    policyOrCertificate: row.policyOrCertificate ?? '',
    expiryDate: row.expiryDate ?? '',
  })
  useEffect(() => {
    setLocal({
      policyOrCertificate: row.policyOrCertificate ?? '',
      expiryDate: row.expiryDate ?? '',
    })
  }, [row])

  const save = async () => {
    await updateInsurance(equipmentId, row.id, {
      policyOrCertificate: local.policyOrCertificate || null,
      expiryDate: local.expiryDate || null,
    })
    onChanged()
  }

  const onFile = async (file: File | null) => {
    if (!file) return
    await uploadInsurancePolicy(equipmentId, row.id, file)
    onChanged()
  }

  const remove = async () => {
    if (!window.confirm('Delete this insurance row?')) return
    await deleteInsurance(equipmentId, row.id)
    onChanged()
  }

  return (
    <tr className="border-b border-slate-100 dark:border-slate-700/50 align-top">
      <td className="py-2 pr-2">
        <input
          className="w-full rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
          value={local.policyOrCertificate}
          onChange={(e) => setLocal((x) => ({ ...x, policyOrCertificate: e.target.value }))}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="date"
          className="rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-2 py-1"
          value={local.expiryDate}
          onChange={(e) => setLocal((x) => ({ ...x, expiryDate: e.target.value }))}
        />
      </td>
      <td className="py-2 pr-2">
        <div className="flex flex-col gap-1">
          {row.policyFilePath && (
            <Button type="button" size="sm" variant="outline" onClick={() => onQuickView(row.policyFilePath!)}>
              Quick view
            </Button>
          )}
          <label className="text-xs text-brand-600 dark:text-brand-400 cursor-pointer">
            <input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            {row.policyFilePath ? 'Replace' : 'Upload'}
          </label>
          {row.policyOriginalName && <span className="text-xs text-neutral-500 truncate max-w-[120px]">{row.policyOriginalName}</span>}
        </div>
      </td>
      <td className="py-2 pr-2 whitespace-nowrap">
        <Button type="button" size="sm" variant="secondary" onClick={save}>
          Save
        </Button>{' '}
        <Button type="button" size="sm" variant="ghost" onClick={remove}>
          Delete
        </Button>
      </td>
    </tr>
  )
}
