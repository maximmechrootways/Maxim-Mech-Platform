/** Built-in hazard assessment PDFs (public/). Keys match backend template keys for message boards. */

export type HazardReviewDocumentDef = {
  key: string
  title: string
  shortLabel: string
  description: string
  /** Public path for built-in PDFs; null for HR-uploaded documents (load URL via API). */
  pdfPath: string | null
  /** When true, HR may edit label, replace PDF, or delete this entry. */
  isCustom?: boolean
  /** One of the six built-in templates (may use blob override PDF). */
  isStaticBuiltIn?: boolean
  /** Built-in template uses an HR-uploaded PDF instead of the file in /public. */
  hasStaticPdfOverride?: boolean
}

export const HAZARD_REVIEW_STATIC_DOCUMENTS: HazardReviewDocumentDef[] = [
  {
    key: 'office_engineer',
    title: 'Hazard Risk Assessment — Office Engineer',
    shortLabel: 'Office Engineer',
    description: 'Completed hazard risk assessment for office engineer roles.',
    pdfPath: '/documents/hazard-review/hazard-assessment-office-engineer.pdf',
  },
  {
    key: 'office_management',
    title: 'Hazard Risk Assessment — Office Administration',
    shortLabel: 'Office Administration',
    description: 'Completed hazard risk assessment for office administration roles.',
    pdfPath: '/documents/hazard-review/hazard-assessment-office-administration.pdf',
  },
  {
    key: 'general_labourer',
    title: 'Hazard Risk Assessment — General Labourer',
    shortLabel: 'General Labourer',
    description: 'Completed hazard risk assessment for general labourer roles.',
    pdfPath: '/documents/hazard-review/hazard-assessment-general-labourer.pdf',
  },
  {
    key: 'plumber',
    title: 'Hazard Risk Assessment — Plumber',
    shortLabel: 'Plumber',
    description: 'Completed hazard risk assessment for plumber roles.',
    pdfPath: '/documents/hazard-review/hazard-assessment-plumber.pdf',
  },
  {
    key: 'gas_fitter',
    title: 'Hazard Risk Assessment — Gas Fitter',
    shortLabel: 'Gas Fitter',
    description: 'Completed hazard risk assessment for gas fitter roles.',
    pdfPath: '/documents/hazard-review/hazard-assessment-gas-fitter.pdf',
  },
  {
    key: 'welder',
    title: 'Hazard Risk Assessment — Welder',
    shortLabel: 'Welder',
    description: 'Completed hazard risk assessment for welder roles.',
    pdfPath: '/documents/hazard-review/hazard-assessment-welder.pdf',
  },
]

/** @deprecated use HAZARD_REVIEW_STATIC_DOCUMENTS */
export const HAZARD_REVIEW_DOCUMENTS = HAZARD_REVIEW_STATIC_DOCUMENTS

export function getStaticHazardReviewDocument(key: string): HazardReviewDocumentDef | undefined {
  return HAZARD_REVIEW_STATIC_DOCUMENTS.find((d) => d.key === key)
}

export function mergeHazardReviewDocuments(
  custom: Array<{
    templateKey: string
    shortLabel: string
    title: string
    description: string
  }>
): HazardReviewDocumentDef[] {
  const fromCustom: HazardReviewDocumentDef[] = custom.map((c) => ({
    key: c.templateKey,
    title: c.title,
    shortLabel: c.shortLabel,
    description: c.description,
    pdfPath: null,
    isCustom: true,
  }))
  return [...HAZARD_REVIEW_STATIC_DOCUMENTS, ...fromCustom]
}

/** Merge API catalog (custom docs + hidden static + static PDF overrides) for hub and assessment pages. */
export function mergeHazardReviewCatalog(catalog: {
  customDocuments?: Array<{
    templateKey: string
    shortLabel: string
    title: string
    description: string
  }> | null
  staticHiddenTemplateKeys?: string[] | null
  staticOverrideTemplateKeys?: string[] | null
}): HazardReviewDocumentDef[] {
  const hidden = new Set(catalog.staticHiddenTemplateKeys ?? [])
  const override = new Set(catalog.staticOverrideTemplateKeys ?? [])
  const staticPart: HazardReviewDocumentDef[] = HAZARD_REVIEW_STATIC_DOCUMENTS.filter((d) => !hidden.has(d.key)).map(
    (d) => ({
      ...d,
      pdfPath: override.has(d.key) ? null : d.pdfPath,
      hasStaticPdfOverride: override.has(d.key),
      isStaticBuiltIn: true,
    })
  )
  const fromCustom: HazardReviewDocumentDef[] = (catalog.customDocuments ?? []).map((c) => ({
    key: c.templateKey,
    title: c.title,
    shortLabel: c.shortLabel,
    description: c.description,
    pdfPath: null,
    isCustom: true,
  }))
  return [...staticPart, ...fromCustom]
}

/**
 * Reformat compact 32-hex UUID for API calls (DB often stores hyphenated `uuid()` strings).
 * Built-in keys (e.g. office_engineer) pass through unchanged.
 */
export function hazardReviewCustomDocIdForApi(key: string): string {
  const t = key.trim().replace(/^\{|\}$/g, '').trim()
  if (/^[0-9a-f]{32}$/i.test(t)) {
    const h = t.toLowerCase()
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  }
  return t
}

/** Strip braces / whitespace for UUID comparison (copy/paste from some tools includes {}). */
function normalizeUuidCompareFragment(key: string): string | null {
  const t = key.trim().replace(/^\{|\}$/g, '').trim()
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
    return t.replace(/-/g, '').toLowerCase()
  }
  if (/^[0-9a-f]{32}$/i.test(t)) return t.toLowerCase()
  return null
}

/** Database id for custom docs (uuid); accept hyphenated, compact 32-hex, or braced UUID. */
export function looksLikeHazardCustomTemplateKey(key: string): boolean {
  return normalizeUuidCompareFragment(key) !== null
}

/** Find catalog entry matching template key (case-insensitive for UUID ids; hyphen vs compact hex). */
export function findHazardReviewDocInMerged(
  merged: HazardReviewDocumentDef[],
  templateKey: string
): HazardReviewDocumentDef | undefined {
  const t = templateKey.trim()
  if (!t) return undefined
  const lower = t.toLowerCase()
  const needle = normalizeUuidCompareFragment(t)
  if (needle) {
    const byHex = merged.find((d) => normalizeUuidCompareFragment(d.key) === needle)
    if (byHex) return byHex
  }
  return merged.find((d) => d.key === t || d.key.toLowerCase() === lower)
}
