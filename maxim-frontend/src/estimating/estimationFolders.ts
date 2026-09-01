/** URL segment → Prisma enum value for estimation folders. */
export const ESTIMATION_FOLDER_SLUGS = [
  { slug: 'tender-drawings', api: 'TENDER_DRAWINGS' as const, label: 'Tender Drawings' },
  { slug: 'tender-specs', api: 'TENDER_SPECS' as const, label: 'Tender Specs' },
  { slug: 'addendums', api: 'ADDENDUMS' as const, label: 'Addendums' },
  { slug: 'supplier-costs', api: 'SUPPLIER_COSTS' as const, label: 'Supplier Costs' },
  { slug: 'unit-pricing-matrix', api: 'UNIT_PRICING_MATRIX' as const, label: 'Unit Pricing Matrix' },
  { slug: 'final-cost', api: 'FINAL_COST' as const, label: 'Final Cost' },
] as const

export type EstimationFolderApi = (typeof ESTIMATION_FOLDER_SLUGS)[number]['api']

const SLUG_MAP = Object.fromEntries(ESTIMATION_FOLDER_SLUGS.map((f) => [f.slug, f])) as Record<
  string,
  (typeof ESTIMATION_FOLDER_SLUGS)[number]
>

export function folderFromSlug(slug: string | undefined) {
  if (!slug) return undefined
  return SLUG_MAP[slug]
}
