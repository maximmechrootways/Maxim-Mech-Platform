import ExcelJS from 'exceljs'
import type { Certificate } from '@/types'
import {
  formatLocalDate,
  PRIMARY_TRAINING_CERTIFICATE_TYPES,
} from '@/constants/trainingCertificates'

export type CertificateExportStatus = 'complete' | 'expiring-soon' | 'expired' | 'missing'
export type CertificateExportMode = 'primary' | 'secondary'

const EXPIRING_DAYS = 60

const FILL = {
  complete: 'FF92D050', // green
  'expiring-soon': 'FFFFEB9C', // yellow
  expired: 'FFFF6B6B', // red
} as const

const FONT = {
  complete: 'FF006100',
  'expiring-soon': 'FF9C5700',
  expired: 'FF9C0006',
} as const

const STATUS_LABEL: Record<Exclude<CertificateExportStatus, 'missing'>, string> = {
  complete: 'Complete',
  'expiring-soon': 'Expiring Soon',
  expired: 'Expired',
}

export interface CertificateExportEmployee {
  id?: string
  name: string
}

function normalizeKey(s: string) {
  return s.trim().toLowerCase()
}

export function getCertificateExportStatus(expirationDate?: string): Exclude<CertificateExportStatus, 'missing'> {
  if (!expirationDate?.trim()) return 'complete'
  const exp = new Date(expirationDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  exp.setHours(0, 0, 0, 0)
  const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= EXPIRING_DAYS) return 'expiring-soon'
  return 'complete'
}

function statusRank(status: CertificateExportStatus): number {
  switch (status) {
    case 'expired':
      return 0
    case 'expiring-soon':
      return 1
    case 'complete':
      return 2
    default:
      return 3
  }
}

/** Prefer the worst compliance status when an employee has multiple of the same certificate. */
export function pickPrimaryCertificate(certs: Certificate[]): Certificate | undefined {
  if (certs.length === 0) return undefined
  return [...certs].sort((a, b) => {
    const statusCmp =
      statusRank(getCertificateExportStatus(a.expirationDate)) -
      statusRank(getCertificateExportStatus(b.expirationDate))
    if (statusCmp !== 0) return statusCmp
    return (a.expirationDate ?? '').localeCompare(b.expirationDate ?? '')
  })[0]
}

export function buildCertificateTypeColumns(
  certificates: Certificate[],
  mode: CertificateExportMode = 'primary',
  primaryTypes: string[] = [...PRIMARY_TRAINING_CERTIFICATE_TYPES],
): string[] {
  const primaryKeys = new Set(primaryTypes.map(normalizeKey))
  if (mode === 'primary') {
    return primaryTypes.length > 0 ? [...primaryTypes] : [...PRIMARY_TRAINING_CERTIFICATE_TYPES]
  }

  const names = new Set<string>()
  for (const cert of certificates) {
    const trimmed = cert.name.trim()
    if (trimmed && !primaryKeys.has(normalizeKey(trimmed))) names.add(trimmed)
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

export function buildEmployeeCertificateMatrix(
  certificates: Certificate[],
  employees: CertificateExportEmployee[],
  certificateTypes: string[],
): Array<{
  name: string
  cells: CertificateExportStatus[]
}> {
  const byEmployee = new Map<string, Certificate[]>()

  const addCert = (key: string, cert: Certificate) => {
    const list = byEmployee.get(key) ?? []
    list.push(cert)
    byEmployee.set(key, list)
  }

  for (const cert of certificates) {
    if (cert.holderUserId) addCert(`id:${cert.holderUserId}`, cert)
    const holderKey = cert.holderName.trim().toLowerCase()
    if (holderKey) addCert(`name:${holderKey}`, cert)
  }

  const rows = employees
    .map((employee) => {
      const name = employee.name.trim()
      if (!name) return null
      const fromId = employee.id ? byEmployee.get(`id:${employee.id}`) ?? [] : []
      const fromName = byEmployee.get(`name:${name.toLowerCase()}`) ?? []
      const seen = new Set<string>()
      const employeeCerts = [...fromId, ...fromName].filter((c) => {
        if (seen.has(c.id)) return false
        seen.add(c.id)
        return true
      })

      const cells = certificateTypes.map((type) => {
        const matches = employeeCerts.filter(
          (c) => c.name.trim().toLowerCase() === type.toLowerCase(),
        )
        const primary = pickPrimaryCertificate(matches)
        if (!primary) return 'missing' as const
        return getCertificateExportStatus(primary.expirationDate)
      })

      return { name, cells }
    })
    .filter((row): row is NonNullable<typeof row> => row != null)

  return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

function applyStatusStyle(cell: ExcelJS.Cell, status: Exclude<CertificateExportStatus, 'missing'>) {
  cell.value = STATUS_LABEL[status]
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: FILL[status] },
  }
  cell.font = {
    bold: true,
    color: { argb: FONT[status] },
  }
}

export async function buildCertificatesWorkbook(options: {
  certificates: Certificate[]
  employees: CertificateExportEmployee[]
  mode?: CertificateExportMode
  primaryTypes?: string[]
  title?: string
  pulledAt?: Date
}): Promise<ExcelJS.Workbook> {
  const {
    certificates,
    employees,
    mode = 'primary',
    primaryTypes = [...PRIMARY_TRAINING_CERTIFICATE_TYPES],
    title = mode === 'primary' ? 'Primary Training Certificates' : 'All Training Certificates',
    pulledAt = new Date(),
  } = options
  const certificateTypes = buildCertificateTypeColumns(certificates, mode, primaryTypes)
  const matrix = buildEmployeeCertificateMatrix(certificates, employees, certificateTypes)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Maxim'
  const ws = wb.addWorksheet(mode === 'primary' ? 'Primary Training' : 'All Training')

  const colCount = Math.max(2, certificateTypes.length + 1)
  ws.mergeCells(1, 1, 1, colCount)
  const titleCell = ws.getCell(1, 1)
  titleCell.value = title
  titleCell.font = { bold: true, size: 14 }

  ws.getCell(2, 1).value = 'Date Form Pulled'
  ws.getCell(2, 2).value = formatLocalDate(pulledAt)
  ws.getCell(2, 1).font = { bold: true }

  const headerRowIndex = 4
  const headerRow = ws.getRow(headerRowIndex)
  headerRow.getCell(1).value = 'Name'
  if (certificateTypes.length === 0) {
    headerRow.getCell(2).value = '(No additional certificates)'
  } else {
    certificateTypes.forEach((type, i) => {
      headerRow.getCell(i + 2).value = type
    })
  }
  headerRow.font = { bold: true }
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  headerRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }

  matrix.forEach((row, rowOffset) => {
    const excelRow = ws.getRow(headerRowIndex + 1 + rowOffset)
    excelRow.getCell(1).value = row.name
    if (certificateTypes.length === 0) {
      excelRow.getCell(2).value = ''
      return
    }
    row.cells.forEach((status, colOffset) => {
      const cell = excelRow.getCell(colOffset + 2)
      if (status === 'missing') {
        cell.value = ''
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else {
        applyStatusStyle(cell, status)
      }
    })
  })

  ws.getColumn(1).width = 28
  const dataColCount = Math.max(1, certificateTypes.length)
  for (let i = 0; i < dataColCount; i++) {
    ws.getColumn(i + 2).width = 22
  }

  const lastRow = headerRowIndex + matrix.length
  const lastCol = Math.max(2, certificateTypes.length + 1)
  for (let r = headerRowIndex; r <= Math.max(headerRowIndex, lastRow); r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c)
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      }
    }
  }

  return wb
}

export async function downloadCertificatesExcel(options: {
  certificates: Certificate[]
  employees: CertificateExportEmployee[]
  mode?: CertificateExportMode
  primaryTypes?: string[]
  title?: string
  filename?: string
}): Promise<void> {
  const mode = options.mode ?? 'primary'
  const wb = await buildCertificatesWorkbook(options)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const dateStamp = formatLocalDate()
  a.download =
    options.filename ??
    (mode === 'primary'
      ? `primary-training-certificates_${dateStamp}.xlsx`
      : `all-training-certificates_${dateStamp}.xlsx`)
  a.click()
  URL.revokeObjectURL(url)
}
