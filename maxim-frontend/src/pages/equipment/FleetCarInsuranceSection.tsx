import { useEffect, useState } from 'react'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  fetchFleetCarInsurance,
  updateFleetCarInsurancePolicy,
  addFleetCarInsuranceVehicle,
  updateFleetCarInsuranceVehicle,
  deleteFleetCarInsuranceVehicle,
  type FleetCarInsurancePolicy,
  type FleetCarInsuranceVehicle,
} from '@/api/equipment'

const emptyVehicleDraft = {
  autoNo: '',
  modelYear: '',
  make: '',
  model: '',
  newCostIncludingEquipment: '',
  vin: '',
  location: '',
  ratingClass: '',
  rateGroupAb: '',
  rateGroupCompSp: '',
  rateGroupDcPd: '',
  rateGroupColAp: '',
  liabilityBodilyInjuryPrem: '',
  liabilityPropertyDamagePrem: '',
  basicAccidentBenefitsPrem: '',
  uninsuredAutomobilePrem: '',
}

function numOrNull(v: string) {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function FleetCarInsuranceSection() {
  const [policy, setPolicy] = useState<FleetCarInsurancePolicy | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingPolicy, setSavingPolicy] = useState(false)
  const [policyError, setPolicyError] = useState<string | null>(null)
  const [policyDraft, setPolicyDraft] = useState<Record<string, string>>({})
  const [vehicleDraft, setVehicleDraft] = useState(emptyVehicleDraft)

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchFleetCarInsurance()
      setPolicy(data)
      setPolicyDraft({
        insurerName: data.insurerName ?? '',
        policyNumber: data.policyNumber ?? '',
        transactionType: data.transactionType ?? '',
        effectiveDate: data.effectiveDate ?? '',
        periodStart: data.periodStart ?? '',
        periodEnd: data.periodEnd ?? '',
        numberOfAutomobiles: data.numberOfAutomobiles != null ? String(data.numberOfAutomobiles) : '',
        premium: data.premium != null ? String(data.premium) : '',
        paymentMethod: data.paymentMethod ?? '',
        insuredName: data.insuredName ?? '',
        insuredAddress: data.insuredAddress ?? '',
        brokerName: data.brokerName ?? '',
        brokerId: data.brokerId ?? '',
        brokerAddress: data.brokerAddress ?? '',
        brokerPhone: data.brokerPhone ?? '',
        remarks: data.remarks ?? '',
        liabilityLimit: data.liabilityLimit ?? '',
      })
    } catch {
      setPolicy(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const savePolicy = async () => {
    setSavingPolicy(true)
    setPolicyError(null)
    try {
      const updated = await updateFleetCarInsurancePolicy({
        insurerName: policyDraft.insurerName || null,
        policyNumber: policyDraft.policyNumber || null,
        transactionType: policyDraft.transactionType || null,
        effectiveDate: policyDraft.effectiveDate || null,
        periodStart: policyDraft.periodStart || null,
        periodEnd: policyDraft.periodEnd || null,
        numberOfAutomobiles: numOrNull(policyDraft.numberOfAutomobiles),
        premium: numOrNull(policyDraft.premium),
        paymentMethod: policyDraft.paymentMethod || null,
        insuredName: policyDraft.insuredName || null,
        insuredAddress: policyDraft.insuredAddress || null,
        brokerName: policyDraft.brokerName || null,
        brokerId: policyDraft.brokerId || null,
        brokerAddress: policyDraft.brokerAddress || null,
        brokerPhone: policyDraft.brokerPhone || null,
        remarks: policyDraft.remarks || null,
        liabilityLimit: policyDraft.liabilityLimit || null,
      })
      setPolicy(updated)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setPolicyError(e?.response?.data?.error ?? 'Could not save policy details')
    } finally {
      setSavingPolicy(false)
    }
  }

  const addVehicle = async () => {
    const autoNo = Number(vehicleDraft.autoNo)
    if (!Number.isFinite(autoNo) || autoNo < 1) return
    await addFleetCarInsuranceVehicle({
      autoNo,
      modelYear: numOrNull(vehicleDraft.modelYear),
      make: vehicleDraft.make || null,
      model: vehicleDraft.model || null,
      newCostIncludingEquipment: numOrNull(vehicleDraft.newCostIncludingEquipment),
      vin: vehicleDraft.vin || null,
      location: vehicleDraft.location || null,
      ratingClass: vehicleDraft.ratingClass || null,
      rateGroupAb: vehicleDraft.rateGroupAb || null,
      rateGroupCompSp: vehicleDraft.rateGroupCompSp || null,
      rateGroupDcPd: vehicleDraft.rateGroupDcPd || null,
      rateGroupColAp: vehicleDraft.rateGroupColAp || null,
      liabilityBodilyInjuryPrem: numOrNull(vehicleDraft.liabilityBodilyInjuryPrem),
      liabilityPropertyDamagePrem: numOrNull(vehicleDraft.liabilityPropertyDamagePrem),
      basicAccidentBenefitsPrem: numOrNull(vehicleDraft.basicAccidentBenefitsPrem),
      uninsuredAutomobilePrem: numOrNull(vehicleDraft.uninsuredAutomobilePrem),
    })
    setVehicleDraft(emptyVehicleDraft)
    await load()
  }

  if (loading) {
    return (
      <Card padding="lg">
        <CardHeader>Car insurance</CardHeader>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">Loading fleet insurance…</p>
      </Card>
    )
  }

  return (
    <Card padding="lg">
      <CardHeader>Car insurance</CardHeader>
      <CardDescription>
        Ontario automobile fleet certificate — policy details and scheduled vehicles (editable).
      </CardDescription>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Input label="Insurer" value={policyDraft.insurerName} onChange={(e) => setPolicyDraft((d) => ({ ...d, insurerName: e.target.value }))} />
        <Input label="Policy number" value={policyDraft.policyNumber} onChange={(e) => setPolicyDraft((d) => ({ ...d, policyNumber: e.target.value }))} />
        <Input label="Transaction type" value={policyDraft.transactionType} onChange={(e) => setPolicyDraft((d) => ({ ...d, transactionType: e.target.value }))} />
        <Input label="Effective date" type="date" value={policyDraft.effectiveDate} onChange={(e) => setPolicyDraft((d) => ({ ...d, effectiveDate: e.target.value }))} />
        <Input label="Period from" value={policyDraft.periodStart} onChange={(e) => setPolicyDraft((d) => ({ ...d, periodStart: e.target.value }))} placeholder="2026-05-17 12:01" />
        <Input label="Period to" value={policyDraft.periodEnd} onChange={(e) => setPolicyDraft((d) => ({ ...d, periodEnd: e.target.value }))} placeholder="2027-05-17 12:01" />
        <Input label="# of automobiles" value={policyDraft.numberOfAutomobiles} onChange={(e) => setPolicyDraft((d) => ({ ...d, numberOfAutomobiles: e.target.value }))} />
        <Input label="Premium ($)" value={policyDraft.premium} onChange={(e) => setPolicyDraft((d) => ({ ...d, premium: e.target.value }))} />
        <Input label="Payment method" value={policyDraft.paymentMethod} onChange={(e) => setPolicyDraft((d) => ({ ...d, paymentMethod: e.target.value }))} />
        <Input label="Liability limit" value={policyDraft.liabilityLimit} onChange={(e) => setPolicyDraft((d) => ({ ...d, liabilityLimit: e.target.value }))} />
        <div className="sm:col-span-2">
          <Input label="Insured name" value={policyDraft.insuredName} onChange={(e) => setPolicyDraft((d) => ({ ...d, insuredName: e.target.value }))} />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Input label="Insured address" value={policyDraft.insuredAddress} onChange={(e) => setPolicyDraft((d) => ({ ...d, insuredAddress: e.target.value }))} />
        </div>
        <Input label="Broker" value={policyDraft.brokerName} onChange={(e) => setPolicyDraft((d) => ({ ...d, brokerName: e.target.value }))} />
        <Input label="Broker ID" value={policyDraft.brokerId} onChange={(e) => setPolicyDraft((d) => ({ ...d, brokerId: e.target.value }))} />
        <Input label="Broker phone" value={policyDraft.brokerPhone} onChange={(e) => setPolicyDraft((d) => ({ ...d, brokerPhone: e.target.value }))} />
        <div className="sm:col-span-2 lg:col-span-3">
          <Input label="Broker address" value={policyDraft.brokerAddress} onChange={(e) => setPolicyDraft((d) => ({ ...d, brokerAddress: e.target.value }))} />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Remarks</label>
          <textarea
            value={policyDraft.remarks}
            onChange={(e) => setPolicyDraft((d) => ({ ...d, remarks: e.target.value }))}
            rows={2}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button type="button" onClick={savePolicy} disabled={savingPolicy}>
          {savingPolicy ? 'Saving…' : 'Save policy details'}
        </Button>
        {policyError && <span className="text-sm text-red-600 dark:text-red-400">{policyError}</span>}
      </div>

      <div className="mt-8 overflow-x-auto">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mb-2">Fleet schedule</h3>
        <table className="w-full min-w-[1400px] text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-600">
              <th className="py-2 pr-2">Auto #</th>
              <th className="py-2 pr-2">Year</th>
              <th className="py-2 pr-2">Make</th>
              <th className="py-2 pr-2">Model</th>
              <th className="py-2 pr-2">New cost</th>
              <th className="py-2 pr-2">VIN</th>
              <th className="py-2 pr-2">Loc</th>
              <th className="py-2 pr-2">Class</th>
              <th className="py-2 pr-2">AB</th>
              <th className="py-2 pr-2">Comp</th>
              <th className="py-2 pr-2">DC PD</th>
              <th className="py-2 pr-2">Col AP</th>
              <th className="py-2 pr-2">LI BI</th>
              <th className="py-2 pr-2">LI PD</th>
              <th className="py-2 pr-2">Acc ben</th>
              <th className="py-2 pr-2">Unins</th>
              <th className="py-2 pr-2" />
            </tr>
          </thead>
          <tbody>
            {(policy?.vehicles ?? []).map((row) => (
              <VehicleRow key={row.id} row={row} onChanged={load} />
            ))}
            <tr className="border-t border-slate-100 dark:border-slate-700 align-top">
              {(['autoNo', 'modelYear', 'make', 'model', 'newCostIncludingEquipment', 'vin', 'location', 'ratingClass', 'rateGroupAb', 'rateGroupCompSp', 'rateGroupDcPd', 'rateGroupColAp', 'liabilityBodilyInjuryPrem', 'liabilityPropertyDamagePrem', 'basicAccidentBenefitsPrem', 'uninsuredAutomobilePrem'] as const).map((key) => (
                <td key={key} className="py-2 pr-2">
                  <input
                    className="w-full min-w-[4rem] rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-1.5 py-1"
                    value={vehicleDraft[key]}
                    onChange={(e) => setVehicleDraft((d) => ({ ...d, [key]: e.target.value }))}
                  />
                </td>
              ))}
              <td className="py-2 pr-2">
                <Button type="button" size="sm" onClick={addVehicle}>
                  Add
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function VehicleRow({ row, onChanged }: { row: FleetCarInsuranceVehicle; onChanged: () => void }) {
  const [local, setLocal] = useState({
    autoNo: String(row.autoNo ?? ''),
    modelYear: row.modelYear != null ? String(row.modelYear) : '',
    make: row.make ?? '',
    model: row.model ?? '',
    newCostIncludingEquipment: row.newCostIncludingEquipment != null ? String(row.newCostIncludingEquipment) : '',
    vin: row.vin ?? '',
    location: row.location ?? '',
    ratingClass: row.ratingClass ?? '',
    rateGroupAb: row.rateGroupAb ?? '',
    rateGroupCompSp: row.rateGroupCompSp ?? '',
    rateGroupDcPd: row.rateGroupDcPd ?? '',
    rateGroupColAp: row.rateGroupColAp ?? '',
    liabilityBodilyInjuryPrem: row.liabilityBodilyInjuryPrem != null ? String(row.liabilityBodilyInjuryPrem) : '',
    liabilityPropertyDamagePrem: row.liabilityPropertyDamagePrem != null ? String(row.liabilityPropertyDamagePrem) : '',
    basicAccidentBenefitsPrem: row.basicAccidentBenefitsPrem != null ? String(row.basicAccidentBenefitsPrem) : '',
    uninsuredAutomobilePrem: row.uninsuredAutomobilePrem != null ? String(row.uninsuredAutomobilePrem) : '',
  })

  useEffect(() => {
    setLocal({
      autoNo: String(row.autoNo ?? ''),
      modelYear: row.modelYear != null ? String(row.modelYear) : '',
      make: row.make ?? '',
      model: row.model ?? '',
      newCostIncludingEquipment: row.newCostIncludingEquipment != null ? String(row.newCostIncludingEquipment) : '',
      vin: row.vin ?? '',
      location: row.location ?? '',
      ratingClass: row.ratingClass ?? '',
      rateGroupAb: row.rateGroupAb ?? '',
      rateGroupCompSp: row.rateGroupCompSp ?? '',
      rateGroupDcPd: row.rateGroupDcPd ?? '',
      rateGroupColAp: row.rateGroupColAp ?? '',
      liabilityBodilyInjuryPrem: row.liabilityBodilyInjuryPrem != null ? String(row.liabilityBodilyInjuryPrem) : '',
      liabilityPropertyDamagePrem: row.liabilityPropertyDamagePrem != null ? String(row.liabilityPropertyDamagePrem) : '',
      basicAccidentBenefitsPrem: row.basicAccidentBenefitsPrem != null ? String(row.basicAccidentBenefitsPrem) : '',
      uninsuredAutomobilePrem: row.uninsuredAutomobilePrem != null ? String(row.uninsuredAutomobilePrem) : '',
    })
  }, [row])

  const field = (key: keyof typeof local, className = '') => (
    <input
      className={`w-full min-w-[4rem] rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-900 px-1.5 py-1 ${className}`}
      value={local[key]}
      onChange={(e) => setLocal((x) => ({ ...x, [key]: e.target.value }))}
    />
  )

  const save = async () => {
    await updateFleetCarInsuranceVehicle(row.id, {
      autoNo: Number(local.autoNo),
      modelYear: numOrNull(local.modelYear),
      make: local.make || null,
      model: local.model || null,
      newCostIncludingEquipment: numOrNull(local.newCostIncludingEquipment),
      vin: local.vin || null,
      location: local.location || null,
      ratingClass: local.ratingClass || null,
      rateGroupAb: local.rateGroupAb || null,
      rateGroupCompSp: local.rateGroupCompSp || null,
      rateGroupDcPd: local.rateGroupDcPd || null,
      rateGroupColAp: local.rateGroupColAp || null,
      liabilityBodilyInjuryPrem: numOrNull(local.liabilityBodilyInjuryPrem),
      liabilityPropertyDamagePrem: numOrNull(local.liabilityPropertyDamagePrem),
      basicAccidentBenefitsPrem: numOrNull(local.basicAccidentBenefitsPrem),
      uninsuredAutomobilePrem: numOrNull(local.uninsuredAutomobilePrem),
    })
    onChanged()
  }

  const remove = async () => {
    if (!window.confirm('Remove this vehicle from the fleet schedule?')) return
    await deleteFleetCarInsuranceVehicle(row.id)
    onChanged()
  }

  return (
    <tr className="border-b border-slate-100 dark:border-slate-700/50 align-top">
      <td className="py-2 pr-2">{field('autoNo')}</td>
      <td className="py-2 pr-2">{field('modelYear')}</td>
      <td className="py-2 pr-2">{field('make')}</td>
      <td className="py-2 pr-2">{field('model', 'min-w-[10rem]')}</td>
      <td className="py-2 pr-2">{field('newCostIncludingEquipment')}</td>
      <td className="py-2 pr-2">{field('vin', 'min-w-[9rem] font-mono text-xs')}</td>
      <td className="py-2 pr-2">{field('location')}</td>
      <td className="py-2 pr-2">{field('ratingClass')}</td>
      <td className="py-2 pr-2">{field('rateGroupAb')}</td>
      <td className="py-2 pr-2">{field('rateGroupCompSp')}</td>
      <td className="py-2 pr-2">{field('rateGroupDcPd')}</td>
      <td className="py-2 pr-2">{field('rateGroupColAp')}</td>
      <td className="py-2 pr-2">{field('liabilityBodilyInjuryPrem')}</td>
      <td className="py-2 pr-2">{field('liabilityPropertyDamagePrem')}</td>
      <td className="py-2 pr-2">{field('basicAccidentBenefitsPrem')}</td>
      <td className="py-2 pr-2">{field('uninsuredAutomobilePrem')}</td>
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
