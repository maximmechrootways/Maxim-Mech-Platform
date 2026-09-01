import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import * as auditLogApi from '@/api/auditLog'

const ENTITY_LABELS: Record<string, string> = {
  form: 'Form',
  injury: 'Injury report',
  document: 'Document',
  user: 'User',
  subcontractor: 'Subcontractor',
  capa: 'CAPA',
  certificate: 'Certificate',
  incident: 'Incident',
}

export function AuditLog() {
  const [filter, setFilter] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [result, setResult] = useState<{ items: any[]; total: number }>({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    auditLogApi.fetchAuditLog({
      entityType: filter === 'all' ? undefined : filter,
      limit: 200,
      offset: 0,
      sortOrder,
    }).then((r) => setResult(r)).catch(() => setResult({ items: [], total: 0 })).finally(() => setLoading(false))
  }, [filter, sortOrder])

  const entries = result.items

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Audit Log</h1>
        <p className="text-neutral-500 dark:text-neutral-400 mt-1">Who did what when across forms, injuries, documents, and more. Immutable — view and sort only.</p>
      </div>
      <Card padding="md">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === 'all' ? 'bg-brand-600 text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'}`}
          >
            All
          </button>
          {Object.keys(ENTITY_LABELS).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilter(type)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === type ? 'bg-brand-600 text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'}`}
            >
              {ENTITY_LABELS[type]}
            </button>
          ))}
          <span className="text-sm text-neutral-500 dark:text-neutral-400 ml-2">Sort:</span>
          <select
            aria-label="Sort by date"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
            className="min-h-[36px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
        {loading ? (
          <p className="py-4 text-sm text-neutral-500">Loading…</p>
        ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 py-2 px-3 rounded-lg border border-neutral-100 dark:border-neutral-700/50">
              <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                {new Date(e.at).toLocaleString()}
              </span>
              <span className="font-medium text-neutral-900 dark:text-white">{e.by}</span>
              <span className="text-neutral-600 dark:text-neutral-300">{e.action}</span>
              <Badge variant="default">{ENTITY_LABELS[e.entityType] ?? e.entityType}</Badge>
              <span className="text-neutral-600 dark:text-neutral-300">{e.entityLabel ?? e.entityId}</span>
              {e.linkTo && (
                <Link to={e.linkTo} className="text-sm text-brand-600 dark:text-brand-400 hover:underline ml-auto">
                  View
                </Link>
              )}
            </li>
          ))}
        </ul>
        )}
      </Card>
    </div>
  )
}
