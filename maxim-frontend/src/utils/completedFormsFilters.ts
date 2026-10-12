/** Persisted Completed Forms list filters (localStorage). */

export type CompletedFormsStatusFilter =
  | 'all'
  | 'draft'
  | 'pending_site_signatures'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'archived'
  | 'resubmit_required'

export type CompletedFormsSortKey =
  | 'title'
  | 'template'
  | 'job'
  | 'submittedBy'
  | 'submittedAt'
  | 'status'

export type CompletedFormsSortDirection = 'asc' | 'desc'

export type CompletedFormsFilters = {
  status?: CompletedFormsStatusFilter
  bucket?: string | null
  search?: string
  submittedById?: string
  dateFrom?: string
  dateTo?: string
  sortKey?: CompletedFormsSortKey
  sortDirection?: CompletedFormsSortDirection
}

export const COMPLETED_FORMS_FILTERS_KEY = 'maxim-completed-forms-filters'

const VALID_STATUSES = new Set<CompletedFormsStatusFilter>([
  'all',
  'draft',
  'pending_site_signatures',
  'submitted',
  'approved',
  'rejected',
  'archived',
  'resubmit_required',
])

const VALID_SORT_KEYS = new Set<CompletedFormsSortKey>([
  'title',
  'template',
  'job',
  'submittedBy',
  'submittedAt',
  'status',
])

export const DEFAULT_COMPLETED_FORMS_FILTERS: Required<
  Pick<CompletedFormsFilters, 'status' | 'search' | 'submittedById' | 'dateFrom' | 'dateTo'>
> & {
  bucket: null
  sortKey: CompletedFormsSortKey
  sortDirection: CompletedFormsSortDirection
} = {
  status: 'submitted',
  bucket: null,
  search: '',
  submittedById: '',
  dateFrom: '',
  dateTo: '',
  sortKey: 'submittedAt',
  sortDirection: 'desc',
}

export function loadCompletedFormsFilters(): CompletedFormsFilters | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(COMPLETED_FORMS_FILTERS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CompletedFormsFilters
    if (!parsed || typeof parsed !== 'object') return null

    const out: CompletedFormsFilters = {}
    if (typeof parsed.status === 'string' && VALID_STATUSES.has(parsed.status)) {
      out.status = parsed.status
    }
    if (parsed.bucket === null) {
      out.bucket = null
    } else if (typeof parsed.bucket === 'string' && parsed.bucket.trim()) {
      out.bucket = parsed.bucket.trim()
    }
    if (typeof parsed.search === 'string') out.search = parsed.search
    if (typeof parsed.submittedById === 'string') out.submittedById = parsed.submittedById
    if (typeof parsed.dateFrom === 'string') out.dateFrom = parsed.dateFrom
    if (typeof parsed.dateTo === 'string') out.dateTo = parsed.dateTo
    if (typeof parsed.sortKey === 'string' && VALID_SORT_KEYS.has(parsed.sortKey)) {
      out.sortKey = parsed.sortKey
    }
    if (parsed.sortDirection === 'asc' || parsed.sortDirection === 'desc') {
      out.sortDirection = parsed.sortDirection
    }
    return out
  } catch {
    return null
  }
}

export function saveCompletedFormsFilters(filters: CompletedFormsFilters): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(COMPLETED_FORMS_FILTERS_KEY, JSON.stringify(filters))
  } catch {
    // ignore quota / private mode
  }
}

export function clearCompletedFormsFilters(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(COMPLETED_FORMS_FILTERS_KEY)
  } catch {
    // ignore
  }
}
