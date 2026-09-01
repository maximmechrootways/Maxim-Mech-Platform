import { api } from '@/api'

export type MaintenanceSchedule =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'before_use'

export interface EquipmentListItem {
  id: string
  name: string
  modelNumber?: string | null
  serialNumber?: string | null
  tag?: string | null
  manufacturer?: string | null
  siteId?: string | null
  site?: { id: string; name: string } | null
  maintenanceSchedule: MaintenanceSchedule
  costAtPurchase?: number | null
  dateOfPurchase?: string | null
}

export interface EquipmentDetail extends EquipmentListItem {
  inspectionSubmissionIds: string[]
  maintenanceRecords: EquipmentMaintenanceRecord[]
  costEntries: EquipmentCostEntry[]
  insurancePolicies: EquipmentInsuranceRow[]
}

export interface EquipmentMaintenanceRecord {
  id: string
  equipmentId: string
  hoursAtLastMaintenance?: number | null
  mileage?: number | null
  descriptionOfWork?: string | null
  partsReplacedOrRepaired?: string | null
  technicianNameOrNumber?: string | null
  maintenanceCompany?: string | null
  dateMaintenanceRequired?: string | null
}

export interface EquipmentCostEntry {
  id: string
  equipmentId: string
  maintenancePerformed?: string | null
  labourCost?: number | null
  materialCost?: number | null
  warrantyCovered: boolean
  totalCost?: number | null
  invoiceFilePath?: string | null
  invoiceOriginalName?: string | null
  invoiceMimeType?: string | null
}

export interface EquipmentInsuranceRow {
  id: string
  equipmentId: string
  policyOrCertificate?: string | null
  expiryDate?: string | null
  policyFilePath?: string | null
  policyOriginalName?: string | null
  policyMimeType?: string | null
}

export async function fetchEquipmentList() {
  const { data } = await api.get<EquipmentListItem[]>('/equipment')
  return data
}

export async function fetchEquipmentDetail(id: string) {
  const { data } = await api.get<EquipmentDetail>(`/equipment/${id}`)
  return data
}

export async function createEquipment(payload: {
  name: string
  modelNumber?: string | null
  serialNumber?: string | null
  tag?: string | null
  manufacturer?: string | null
  siteId?: string | null
  maintenanceSchedule?: MaintenanceSchedule
  costAtPurchase?: number | null
  dateOfPurchase?: string | null
}) {
  const { data } = await api.post<EquipmentListItem>('/equipment', payload)
  return data
}

export async function updateEquipment(id: string, payload: Partial<{
  name: string
  modelNumber: string | null
  serialNumber: string | null
  tag: string | null
  manufacturer: string | null
  siteId: string | null
  maintenanceSchedule: MaintenanceSchedule
  costAtPurchase: number | null
  dateOfPurchase: string | null
  inspectionSubmissionIds: string[]
}>) {
  const { data } = await api.patch<EquipmentListItem>(`/equipment/${id}`, payload)
  return data
}

export async function deleteEquipment(id: string) {
  await api.delete(`/equipment/${id}`)
}

export async function addMaintenanceRecord(
  equipmentId: string,
  payload: Partial<{
    hoursAtLastMaintenance: number | null
    mileage: number | null
    descriptionOfWork: string | null
    partsReplacedOrRepaired: string | null
    technicianNameOrNumber: string | null
    maintenanceCompany: string | null
    dateMaintenanceRequired: string | null
  }>
) {
  const { data } = await api.post<EquipmentMaintenanceRecord>(`/equipment/${equipmentId}/maintenance-records`, payload)
  return data
}

export async function updateMaintenanceRecord(
  equipmentId: string,
  recordId: string,
  payload: Partial<{
    hoursAtLastMaintenance: number | null
    mileage: number | null
    descriptionOfWork: string | null
    partsReplacedOrRepaired: string | null
    technicianNameOrNumber: string | null
    maintenanceCompany: string | null
    dateMaintenanceRequired: string | null
  }>
) {
  const { data } = await api.patch<EquipmentMaintenanceRecord>(
    `/equipment/${equipmentId}/maintenance-records/${recordId}`,
    payload
  )
  return data
}

export async function deleteMaintenanceRecord(equipmentId: string, recordId: string) {
  await api.delete(`/equipment/${equipmentId}/maintenance-records/${recordId}`)
}

export async function addCostEntry(
  equipmentId: string,
  payload: Partial<{
    maintenancePerformed: string | null
    labourCost: number | null
    materialCost: number | null
    warrantyCovered: boolean
    totalCost: number | null
  }>
) {
  const { data } = await api.post<EquipmentCostEntry>(`/equipment/${equipmentId}/cost-entries`, payload)
  return data
}

export async function updateCostEntry(
  equipmentId: string,
  costId: string,
  payload: Partial<{
    maintenancePerformed: string | null
    labourCost: number | null
    materialCost: number | null
    warrantyCovered: boolean
    totalCost: number | null
  }>
) {
  const { data } = await api.patch<EquipmentCostEntry>(
    `/equipment/${equipmentId}/cost-entries/${costId}`,
    payload
  )
  return data
}

export async function uploadCostInvoice(equipmentId: string, costId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<EquipmentCostEntry>(
    `/equipment/${equipmentId}/cost-entries/${costId}/invoice`,
    form,
    { headers: { 'Content-Type': undefined } }
  )
  return data
}

export async function deleteCostEntry(equipmentId: string, costId: string) {
  await api.delete(`/equipment/${equipmentId}/cost-entries/${costId}`)
}

export async function addInsurance(
  equipmentId: string,
  payload: { policyOrCertificate?: string | null; expiryDate?: string | null }
) {
  const { data } = await api.post<EquipmentInsuranceRow>(`/equipment/${equipmentId}/insurance`, payload)
  return data
}

export async function updateInsurance(
  equipmentId: string,
  insuranceId: string,
  payload: Partial<{ policyOrCertificate: string | null; expiryDate: string | null }>
) {
  const { data } = await api.patch<EquipmentInsuranceRow>(
    `/equipment/${equipmentId}/insurance/${insuranceId}`,
    payload
  )
  return data
}

export async function uploadInsurancePolicy(equipmentId: string, insuranceId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<EquipmentInsuranceRow>(
    `/equipment/${equipmentId}/insurance/${insuranceId}/policy`,
    form,
    { headers: { 'Content-Type': undefined } }
  )
  return data
}

export async function deleteInsurance(equipmentId: string, insuranceId: string) {
  await api.delete(`/equipment/${equipmentId}/insurance/${insuranceId}`)
}

export async function linkInspectionSubmission(equipmentId: string, submissionId: string) {
  const { data } = await api.post<EquipmentDetail>(`/equipment/${equipmentId}/inspection-submissions`, {
    submissionId,
  })
  return data
}

export async function unlinkInspectionSubmission(equipmentId: string, submissionId: string) {
  const { data } = await api.delete<EquipmentDetail>(
    `/equipment/${equipmentId}/inspection-submissions/${submissionId}`
  )
  return data
}

export async function fetchEquipmentFileBlob(filePath: string): Promise<Blob> {
  const { data } = await api.get<Blob>(`/uploads/${encodeURIComponent(filePath)}`, { responseType: 'blob' })
  return data
}

export interface FleetCarInsuranceVehicle {
  id: string
  policyId: string
  autoNo: number
  modelYear?: number | null
  make?: string | null
  model?: string | null
  newCostIncludingEquipment?: number | null
  vin?: string | null
  location?: string | null
  ratingClass?: string | null
  rateGroupAb?: string | null
  rateGroupCompSp?: string | null
  rateGroupDcPd?: string | null
  rateGroupColAp?: string | null
  liabilityBodilyInjuryPrem?: number | null
  liabilityPropertyDamagePrem?: number | null
  basicAccidentBenefitsPrem?: number | null
  uninsuredAutomobilePrem?: number | null
  sortOrder: number
}

export interface FleetCarInsurancePolicy {
  id: string
  insurerName?: string | null
  policyNumber?: string | null
  transactionType?: string | null
  effectiveDate?: string | null
  periodStart?: string | null
  periodEnd?: string | null
  numberOfAutomobiles?: number | null
  premium?: number | null
  paymentMethod?: string | null
  insuredName?: string | null
  insuredAddress?: string | null
  brokerName?: string | null
  brokerId?: string | null
  brokerAddress?: string | null
  brokerPhone?: string | null
  remarks?: string | null
  liabilityLimit?: string | null
  vehicles: FleetCarInsuranceVehicle[]
}

export async function fetchFleetCarInsurance() {
  const { data } = await api.get<FleetCarInsurancePolicy>('/equipment/car-insurance')
  return data
}

export async function updateFleetCarInsurancePolicy(payload: Partial<Omit<FleetCarInsurancePolicy, 'id' | 'vehicles'>>) {
  const { data } = await api.patch<FleetCarInsurancePolicy>('/equipment/car-insurance', payload)
  return data
}

export async function addFleetCarInsuranceVehicle(payload: Partial<FleetCarInsuranceVehicle> & { autoNo: number }) {
  const { data } = await api.post<FleetCarInsuranceVehicle>('/equipment/car-insurance/vehicles', payload)
  return data
}

export async function updateFleetCarInsuranceVehicle(vehicleId: string, payload: Partial<FleetCarInsuranceVehicle>) {
  const { data } = await api.patch<FleetCarInsuranceVehicle>(`/equipment/car-insurance/vehicles/${vehicleId}`, payload)
  return data
}

export async function deleteFleetCarInsuranceVehicle(vehicleId: string) {
  await api.delete(`/equipment/car-insurance/vehicles/${vehicleId}`)
}
