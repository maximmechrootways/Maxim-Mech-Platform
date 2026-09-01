// A-2 & F: Unified compliance score calculation
// HR-defined mandatory requirements (mocked here, ideally fetched from settings)
export const MANDATORY_SUBCONTRACTOR_CERTS = ['WSIB Clearance', 'Liability Insurance', 'Health & Safety Policy']

export interface ComplianceResult {
  score: number // 0 to 100
  status: 'Compliant' | 'Attention needed' | 'Non-compliant'
  missing: string[]
  expiringSoon: string[]
}

export function calculateSubcontractorCompliance(
  subcontractor: any,
  companyCerts: { name: string; status: string; expiresAt?: string }[],
  personnelCerts: { name: string; status: string; expiresAt?: string }[],
  contracts: any[] = [],
  insurances: any[] = []
): ComplianceResult {
  const missing: string[] = []
  const expiringSoon: string[] = []
  let mandatoryCount = 7
  let validCount = 0

  // 1. Contract
  if (contracts.length > 0) {
    validCount++
  } else {
    missing.push('Signed Contract')
  }

  // 2. COI Insurance
  const coi = insurances.find(i => i.type === 'COI')
  if (coi) {
    validCount++
  } else {
    missing.push('Certificate of Liability (COI)')
  }

  // 3. WSIB Clearance (insurance type WSIB)
  const wsibClearanceOptional = !!subcontractor.wsibClearanceOptional
  const wsibIn = insurances.find(i => i.type === 'WSIB')
  if (wsibClearanceOptional) {
    mandatoryCount--
  } else if (wsibIn) {
    validCount++
  } else {
    missing.push('WSIB Clearance')
  }

  // 4. WSIB Injury Summary Report
  if (subcontractor.wsibInjuryReportOptional) {
    mandatoryCount--
  } else if (subcontractor.wsibInjuryReportPath) {
    validCount++
  } else {
    missing.push('WSIB Injury Summary Report')
  }

  // 5. HR Safety Agreement
  if (subcontractor.hrSafetyAgreementPath) {
    validCount++
  } else {
    missing.push('Sub-Contractor H&R Safety Agreement')
  }

  // 6. Health & Safety Manual
  if (subcontractor.usingMaximHSManual || subcontractor.hsPdfFilePath) {
    validCount++
  } else {
    missing.push('Health & Safety Manual')
  }

  // 7. FORM 1000
  if (subcontractor.form1000Optional) {
    mandatoryCount--
  } else if (subcontractor.form1000Path) {
    validCount++
  } else {
    missing.push('FORM 1000')
  }

  // Scan all certificates to add to expiringSoon / missing (if expired)
  const allCerts = [...companyCerts, ...personnelCerts]
  allCerts.forEach(c => {
    if (c.status === 'expired') {
      missing.push(`${c.name} (Expired)`)
    } else if (c.status === 'expiring-soon') {
      expiringSoon.push(c.name)
    }
  })

  // Check insurance expiry
  insurances.forEach(ins => {
    if (ins.type === 'WSIB' && wsibClearanceOptional) return
    if (ins.expiresAt) {
      const today = new Date().toISOString().slice(0, 10)
      const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      if (ins.expiresAt < today) {
        if (!missing.includes(`${ins.type} Insurance (Expired)`)) missing.push(`${ins.type} Insurance (Expired)`)
      } else if (ins.expiresAt <= in30) {
        if (!expiringSoon.includes(`${ins.type} Insurance`)) expiringSoon.push(`${ins.type} Insurance`)
      }
    }
  })

  const hasExpired = allCerts.some(c => c.status === 'expired') ||
    insurances.some(
      (ins) =>
        ins.expiresAt &&
        ins.expiresAt < new Date().toISOString().slice(0, 10) &&
        !(ins.type === 'WSIB' && wsibClearanceOptional),
    )

  let score = Math.round((validCount / mandatoryCount) * 100)
  if (hasExpired && score > 80) {
    score = 80
  }

  let status: ComplianceResult['status'] = 'Compliant'
  if (score < 100 || missing.length > 0 || hasExpired) {
    status = 'Non-compliant'
  } else if (expiringSoon.length > 0) {
    status = 'Attention needed'
  }

  return { score, status, missing, expiringSoon }
}

export function calculateEmployeeCompliance(
  employee: any,
  docs: { category: string; name: string; status?: string }[]
): ComplianceResult {
  // Placeholder for employee compliance if needed in the future
  return { score: 100, status: 'Compliant', missing: [], expiringSoon: [] }
}