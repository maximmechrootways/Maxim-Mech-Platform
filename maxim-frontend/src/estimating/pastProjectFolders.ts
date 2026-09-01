/** URL segment → Prisma enum value for Past Project Directory folders. */
export const PAST_PROJECT_FOLDER_SLUGS = [
  {
    slug: 'as-built-tender-drawings',
    api: 'AS_BUILT_TENDER_DRAWINGS' as const,
    label: 'As-Built / Tender Drawings',
  },
  { slug: 'contract', api: 'CONTRACT' as const, label: 'Contract' },
  { slug: 'change-orders', api: 'CHANGE_ORDERS' as const, label: 'Change Orders' },
  { slug: 'specifications', api: 'SPECIFICATIONS' as const, label: 'Specifications' },
  { slug: 'correspondence-rfi', api: 'CORRESPONDENCE_RFI' as const, label: 'Correspondence RFI' },
  { slug: 'addendums', api: 'PAST_ADDENDUMS' as const, label: 'Addendums' },
] as const

export type PastProjectFolderApi = (typeof PAST_PROJECT_FOLDER_SLUGS)[number]['api']

const SLUG_MAP = Object.fromEntries(PAST_PROJECT_FOLDER_SLUGS.map((f) => [f.slug, f])) as Record<
  string,
  (typeof PAST_PROJECT_FOLDER_SLUGS)[number]
>

export function pastProjectFolderFromSlug(slug: string | undefined) {
  if (!slug) return undefined
  return SLUG_MAP[slug]
}
