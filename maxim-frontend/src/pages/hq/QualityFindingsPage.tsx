import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import {
  fetchQualityFindings,
  fetchQualityFindingsSummary,
  postAcknowledgeQualityFinding,
  postDedupeQualityFindings,
  postSyncQualityFindingsFromCompletedForms,
  type QualityFindingListRow,
} from '@/api/qualityFindings'

const PAGE = 40
const QF_SESSION_SYNC_KEY = 'maxim_qf_completed_sync_v1'
const QF_QUEUE_TAB_KEY = 'maxim_qf_queue_tab'

type QueueTab = 'open' | 'resolved' | 'all'

function readStoredQueueTab(): QueueTab {
  try {
    if (typeof window === 'undefined') return 'open'
    const v = window.sessionStorage.getItem(QF_QUEUE_TAB_KEY)
    if (v === 'open' || v === 'resolved' || v === 'all') return v
  } catch {
    /* private mode / blocked storage */
  }
  return 'open'
}

function formatSubmissionDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

function ruleLabel(code: string): string {
  if (code === 'checklist_substandard') return 'Substandard checklist'
  return code.replace(/_/g, ' ')
}

export function QualityFindingsPage() {
  const [queueTab, setQueueTab] = useState<QueueTab>(() => readStoredQueueTab())
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<QualityFindingListRow[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<{
    openCount: number
    resolvedCount: number
    byRule: Record<string, number>
  } | null>(null)
  const [initialHydrationDone, setInitialHydrationDone] = useState(false)
  const [pullNonce, setPullNonce] = useState(0)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formNameInput, setFormNameInput] = useState('')
  const [formName, setFormName] = useState('')
  const formNameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevFormNameRef = useRef<string | undefined>(undefined)
  const prevQueueTabRef = useRef<QueueTab | undefined>(undefined)

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(QF_QUEUE_TAB_KEY, queueTab)
      }
    } catch {
      /* ignore */
    }
  }, [queueTab])

  useEffect(() => {
    if (prevQueueTabRef.current === undefined) {
      prevQueueTabRef.current = queueTab
      return
    }
    if (prevQueueTabRef.current !== queueTab) {
      prevQueueTabRef.current = queueTab
      setOffset(0)
    }
  }, [queueTab])

  useEffect(() => {
    if (formNameDebounceRef.current) clearTimeout(formNameDebounceRef.current)
    formNameDebounceRef.current = setTimeout(() => {
      formNameDebounceRef.current = null
      setFormName(formNameInput.trim())
    }, 350)
    return () => {
      if (formNameDebounceRef.current) clearTimeout(formNameDebounceRef.current)
    }
  }, [formNameInput])

  useEffect(() => {
    if (prevFormNameRef.current === undefined) {
      prevFormNameRef.current = formName
      return
    }
    if (prevFormNameRef.current !== formName) {
      prevFormNameRef.current = formName
      setOffset(0)
    }
  }, [formName])

  useEffect(() => {
    document.title = 'Form Red Flags — Maxim'
    return () => {
      document.title = 'Maxim Mechanical Group'
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await postDedupeQualityFindings()
        if (!sessionStorage.getItem(QF_SESSION_SYNC_KEY)) {
          await postSyncQualityFindingsFromCompletedForms()
          sessionStorage.setItem(QF_SESSION_SYNC_KEY, '1')
        }
      } catch {
        // Still load whatever is already stored
      } finally {
        if (!cancelled) setInitialHydrationDone(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!initialHydrationDone) return
    fetchQualityFindingsSummary().then(setSummary).catch(() => setSummary(null))
  }, [initialHydrationDone, pullNonce])

  useEffect(() => {
    if (!initialHydrationDone) return
    setLoading(true)
    setError(null)
    fetchQualityFindings({
      queue: queueTab,
      limit: PAGE,
      offset,
      formName: formName || undefined,
    })
      .then((r) => {
        setRows(r.rows)
        setTotal(r.total)
      })
      .catch((e) => {
        setError(e?.response?.data?.error || 'Could not load Form Red Flags')
        setRows([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [initialHydrationDone, pullNonce, queueTab, offset, formName])

  const pullFromCompletedForms = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      await postDedupeQualityFindings()
      await postSyncQualityFindingsFromCompletedForms()
      setPullNonce((n) => n + 1)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err?.response?.data?.error || 'Could not pull from completed forms')
      setLoading(false)
    }
  }, [])

  const resolveFinding = useCallback(async (findingId: string) => {
    setError(null)
    setResolvingId(findingId)
    try {
      await postAcknowledgeQualityFinding(findingId)
      setQueueTab('resolved')
      setPullNonce((n) => n + 1)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err?.response?.data?.error || 'Could not resolve this flag')
    } finally {
      setResolvingId(null)
    }
  }, [])

  const byRuleEntries = summary ? Object.entries(summary.byRule).sort((a, b) => b[1] - a[1]) : []

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/25 dark:border-amber-400/20 bg-gradient-to-br from-amber-500/[0.07] via-white/80 to-sky-500/[0.06] dark:from-amber-500/10 dark:via-neutral-900/90 dark:to-sky-900/20 px-6 py-8 md:px-10 md:py-10 shadow-soft dark:shadow-dark-soft">
        <div
          className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-amber-400/15 blur-3xl dark:bg-amber-500/20"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-20 bottom-0 h-40 w-40 rounded-full bg-brand-500/10 blur-2xl dark:bg-brand-400/15"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700/90 dark:text-amber-400/90">
              Owner / HR
            </p>
            <h1 className="font-display text-4xl font-bold tracking-tight text-neutral-900 dark:text-white md:text-5xl">
              <span className="bg-gradient-to-r from-amber-600 via-orange-500 to-rose-600 bg-clip-text text-transparent dark:from-amber-300 dark:via-orange-300 dark:to-rose-400">
                Form Red Flags
              </span>
            </h1>
            <p className="text-base leading-relaxed text-neutral-600 dark:text-neutral-300">
              Checklist answers that missed the standard on submitted PDFs—substandard picks, washroom &quot;No&quot;
              rows, and similar signals—so you can open the form and follow up fast.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 rounded-xl border border-neutral-200/80 bg-white/60 px-4 py-3 text-sm text-neutral-600 backdrop-blur-sm dark:border-neutral-600/60 dark:bg-neutral-950/40 dark:text-neutral-300">
            <p>
              <span className="font-medium text-neutral-800 dark:text-neutral-100">Tip:</span>
              {' '}
              Use <strong className="text-neutral-900 dark:text-white">Open only</strong> for items that still need
              action; <strong className="text-neutral-900 dark:text-white">Resolved</strong> for flags you marked
              reviewed; <strong className="text-neutral-900 dark:text-white">All</strong> for the full list. Narrow the
              table with <strong className="text-neutral-900 dark:text-white">Filter by form name</strong> (title or
              template).
            </p>
            <button
              type="button"
              disabled={loading || !initialHydrationDone}
              onClick={() => void pullFromCompletedForms()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-amber-400/60 bg-amber-500/15 px-4 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/50"
            >
              Pull substandards from completed forms
            </button>
          </div>
        </div>
      </div>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            padding="md"
            className="relative overflow-hidden border-amber-200/80 shadow-soft dark:border-amber-500/30 dark:shadow-dark-soft"
          >
            <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-400 to-orange-500" aria-hidden />
            <div className="pl-3">
              <CardHeader className="text-base text-neutral-800 dark:text-neutral-100">Open flags</CardHeader>
              <CardDescription>Needs review (not resolved yet)</CardDescription>
              <p className="mt-4 text-5xl font-bold tabular-nums tracking-tight text-neutral-900 dark:text-white md:text-6xl">
                {summary.openCount}
              </p>
            </div>
          </Card>
          <Card
            padding="md"
            className="relative overflow-hidden border-emerald-200/80 shadow-soft dark:border-emerald-600/35 dark:shadow-dark-soft"
          >
            <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-500 to-teal-600" aria-hidden />
            <div className="pl-3">
              <CardHeader className="text-base text-neutral-800 dark:text-neutral-100">Resolved</CardHeader>
              <CardDescription>Flags you marked as reviewed</CardDescription>
              <p className="mt-4 text-5xl font-bold tabular-nums tracking-tight text-neutral-900 dark:text-white md:text-6xl">
                {summary.resolvedCount}
              </p>
            </div>
          </Card>
          <Card
            padding="md"
            className="relative overflow-hidden border-neutral-200/90 sm:col-span-2 lg:col-span-1 dark:border-neutral-600/60 shadow-soft dark:shadow-dark-soft"
          >
            <CardHeader className="text-base text-neutral-800 dark:text-neutral-100">By category</CardHeader>
            <CardDescription>Open items grouped by detection rule</CardDescription>
            <ul className="mt-4 flex flex-wrap gap-2">
              {byRuleEntries.length === 0 ? (
                <li className="text-sm text-neutral-500 dark:text-neutral-400">All clear — no open flags.</li>
              ) : (
                byRuleEntries.map(([code, n]) => (
                  <li key={code}>
                    <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/60 bg-amber-50/90 px-3 py-1.5 text-xs font-medium text-amber-950 shadow-sm dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
                      <span className="font-semibold">{ruleLabel(code)}</span>
                      <span className="tabular-nums text-amber-800 dark:text-amber-200">{n}</span>
                    </span>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>
      )}

      <Card padding="md" className="border-neutral-200/90 shadow-soft dark:border-neutral-700/70 dark:shadow-dark-soft">
        <div className="mb-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Flagged items</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Newest first · click a row to open the submission</p>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
            <label className="block min-w-0 flex-1 max-w-xl">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Filter by form name
              </span>
              <input
                type="search"
                value={formNameInput}
                onChange={(e) => setFormNameInput(e.target.value)}
                placeholder="Match submission title or template (e.g. Washroom, Fall arrest)…"
                autoComplete="off"
                className="w-full min-h-[44px] rounded-xl border border-neutral-300 bg-white px-4 text-sm text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500"
              />
            </label>
            <div className="shrink-0">
              <span className="mb-1.5 hidden text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 lg:block">
                Queue
              </span>
              <div className="flex flex-wrap justify-end gap-1 rounded-xl border border-neutral-200 bg-neutral-100/80 p-1 dark:border-neutral-600 dark:bg-neutral-800/80">
                <button
                  type="button"
                  onClick={() => {
                    setOffset(0)
                    setQueueTab('open')
                  }}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    queueTab === 'open'
                      ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                      : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                  }`}
                >
                  Open only
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOffset(0)
                    setQueueTab('resolved')
                  }}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    queueTab === 'resolved'
                      ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                      : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                  }`}
                >
                  Resolved
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOffset(0)
                    setQueueTab('all')
                  }}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    queueTab === 'all'
                      ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                      : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                  }`}
                >
                  All
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        )}
        {loading || !initialHydrationDone ? (
          <div className="flex items-center gap-3 py-12 text-neutral-500 dark:text-neutral-400">
            <span
              className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-brand-600 dark:border-neutral-600 dark:border-t-brand-400"
              aria-hidden
            />
            {!initialHydrationDone ? 'Scanning completed PDFs for checklist flags…' : 'Loading flags…'}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 py-14 text-center dark:border-neutral-600 dark:bg-neutral-800/30">
            <p className="text-neutral-600 dark:text-neutral-300">
              {queueTab === 'resolved'
                ? 'No resolved flags yet.'
                : queueTab === 'open'
                  ? 'No open flags match this filter.'
                  : 'No flags match this filter.'}
            </p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {queueTab === 'resolved' ? (
                <>
                  When you click <strong className="text-neutral-700 dark:text-neutral-300">Resolve</strong> on an
                  open flag, it moves here and leaves the Open only list.
                </>
              ) : (
                <>
                  Try clearing the form name filter, switching queue, using{' '}
                  <strong className="text-neutral-700 dark:text-neutral-300">Pull substandards from completed forms</strong>
                  , or submit a form with a substandard checklist answer.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200/90 dark:border-neutral-700/80">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50/90 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-400">
                    <th className="px-4 py-3">Form date</th>
                    <th className="px-4 py-3">Form</th>
                    <th className="px-4 py-3">Location on form</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Submission</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="group border-l-2 border-l-transparent bg-white/40 transition-colors hover:border-l-amber-500 hover:bg-amber-50/30 dark:bg-neutral-900/20 dark:hover:bg-amber-950/20 dark:hover:border-l-amber-400"
                    >
                      <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-neutral-600 dark:text-neutral-300">
                        {formatSubmissionDate(r.formSubmittedAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        {(() => {
                          const templateName = (r.submissionTemplateName || r.templateNameSnapshot || '').trim()
                          const submissionTitle = (r.submissionTitle || '').trim()
                          const headline = templateName || submissionTitle || '—'
                          const showSubmissionLine =
                            Boolean(templateName) &&
                            Boolean(submissionTitle) &&
                            submissionTitle.toLowerCase() !== templateName.toLowerCase()
                          return (
                            <>
                              <div className="font-semibold text-neutral-900 dark:text-white">{headline}</div>
                              {showSubmissionLine ? (
                                <div className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                                  Submission title: {submissionTitle}
                                </div>
                              ) : null}
                              <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                                {r.submittedByDisplay || '—'}
                                {r.linkedJobId ? (
                                  <span className="ml-1 font-mono text-[11px] opacity-80" title={r.linkedJobId}>
                                    · {r.linkedJobId}
                                  </span>
                                ) : null}
                              </div>
                            </>
                          )
                        })()}
                      </td>
                      <td className="max-w-[min(280px,28vw)] px-4 py-3.5">
                        <div className="truncate text-neutral-800 dark:text-neutral-200" title={r.fieldLabelSnapshot || ''}>
                          {r.fieldLabelSnapshot || r.fieldId || '—'}
                        </div>
                        {r.valueSnapshot ? (
                          <div
                            className="mt-1 inline-flex max-w-full truncate rounded-md bg-amber-100/90 px-2 py-0.5 text-xs font-medium text-amber-950 dark:bg-amber-950/50 dark:text-amber-100"
                            title={r.valueSnapshot}
                          >
                            {r.valueSnapshot}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200">
                          {ruleLabel(r.ruleCode)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col items-start gap-1.5">
                          <Badge variant={r.submissionStatus === 'APPROVED' ? 'default' : 'warning'}>
                            {r.submissionStatus ?? '—'}
                          </Badge>
                          {r.acknowledgedAt ? (
                            <span className="inline-flex rounded-md border border-emerald-300/70 bg-emerald-50/90 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-900 dark:border-emerald-600/50 dark:bg-emerald-950/50 dark:text-emerald-100">
                              Resolved
                            </span>
                          ) : (
                            <span className="inline-flex rounded-md border border-amber-300/70 bg-amber-50/90 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-950 dark:border-amber-600/50 dark:bg-amber-950/40 dark:text-amber-100">
                              Open flag
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {!r.acknowledgedAt ? (
                            <button
                              type="button"
                              disabled={resolvingId === r.id}
                              onClick={() => void resolveFinding(r.id)}
                              className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-emerald-600/50 bg-emerald-600/15 px-3 py-1.5 text-xs font-semibold text-emerald-900 transition-colors hover:bg-emerald-600/25 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50"
                            >
                              {resolvingId === r.id ? 'Resolving…' : 'Resolve'}
                            </button>
                          ) : null}
                          <Link
                            to={`/forms/${r.sourceId}`}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white opacity-90 transition-all hover:opacity-100 dark:bg-brand-500"
                          >
                            Open form
                            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {total > PAGE && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              Showing <span className="font-medium text-neutral-800 dark:text-neutral-200">{offset + 1}</span>
              –
              <span className="font-medium text-neutral-800 dark:text-neutral-200">{Math.min(offset + rows.length, total)}</span>
              {' '}
              of {total}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={offset + PAGE >= total}
                onClick={() => setOffset((o) => o + PAGE)}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
