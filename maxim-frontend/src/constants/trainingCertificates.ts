/** Primary training certificates used for exports and course-name dropdowns. */
export const PRIMARY_TRAINING_CERTIFICATE_TYPES = [
  'Worker Health and Safety Awareness in 4 Steps',
  'Supervisor Health and Safety Awareness in 5 Steps',
  'WHMIS',
  'First Aid',
  'Aerial Work Platform, On/Off Slabs',
  'Buttcon Safety Orientation',
  'Confined Space Entry/Monitor',
  'eRailSafe_VIA',
  'eRailSave_CN',
  'TSSA',
  'Personal Track Safety (PTS)',
] as const

export type PrimaryTrainingCertificateType = (typeof PRIMARY_TRAINING_CERTIFICATE_TYPES)[number]

export function isPrimaryTrainingCertificate(name: string): boolean {
  const normalized = name.trim().toLowerCase()
  return PRIMARY_TRAINING_CERTIFICATE_TYPES.some((t) => t.toLowerCase() === normalized)
}

export function formatLocalDate(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
