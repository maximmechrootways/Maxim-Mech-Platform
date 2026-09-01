import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { useUser } from '@/contexts/UserContext'
import { useDocuments } from '@/contexts/DocumentsContext'
import { useFormSubmissions } from '@/contexts/FormSubmissionsContext'
import { fetchIncidents } from '@/api/incidents'
import { canUserViewDocument } from '@/utils/documentAccess'
import type { UserRole } from '@/types'

type ResultType = 'document' | 'submission' | 'incident' | 'page'

const TYPE_FILTER_OPTIONS: { value: 'all' | ResultType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'page', label: 'Pages' },
  { value: 'document', label: 'Documents' },
  { value: 'submission', label: 'Submissions' },
  { value: 'incident', label: 'Incidents' },
]

/** App nav items for search — same as sidebar (filtered by role in component). */
const APP_PAGES: { to: string; label: string; roles?: UserRole[] }[] = [
  { to: '/search', label: 'Search' },
  { to: '/', label: 'Dashboard' },
  { to: '/hr/management-review', label: 'Management Review', roles: ['owner', 'hr'] },
  { to: '/hq/quality-findings', label: 'Form Red Flags', roles: ['owner', 'hr'] },
  { to: '/jobs', label: 'Job Management', roles: ['owner', 'hr'] },
  { to: '/health-safety-manual', label: 'Health and Safety Manual' },
  { to: '/safety/meeting-minutes', label: 'Meeting Minutes / Agendas' },
  { to: '/estimating/project-future-work', label: 'Estimating Project Future Work', roles: ['owner', 'hr', 'supervisor'] },
  { to: '/estimating/current-projects', label: 'Current Projects', roles: ['owner', 'hr', 'supervisor'] },
  { to: '/estimating/past-project-directory', label: 'Past Project Directory', roles: ['owner', 'hr', 'supervisor'] },
  { to: '/my-jobs', label: 'My Jobs', roles: ['supervisor'] },
  { to: '/daily-forms', label: 'Daily Forms', roles: ['supervisor', 'labourer'] },
  { to: '/library', label: 'Forms & Documents' },
  { to: '/safety', label: 'Health & Safety' },
  { to: '/injury-reports', label: 'Injury Reports', roles: ['owner', 'hr', 'supervisor'] },
  { to: '/certificates', label: 'Certificates', roles: ['owner', 'hr', 'supervisor'] },
  { to: '/subcontractors', label: 'Subcontractors', roles: ['owner', 'hr'] },
  { to: '/employees', label: 'Employees', roles: ['owner', 'hr'] },
  { to: '/incoming-invoices', label: 'Incoming Invoices', roles: ['owner', 'hr'] },
  { to: '/outgoing-invoices', label: 'Outgoing Invoices', roles: ['owner', 'hr'] },
  { to: '/admin', label: 'Users & Settings', roles: ['owner', 'hr'] },
  { to: '/admin/notifications', label: 'Notifications', roles: ['owner', 'hr'] },
  { to: '/admin/audit-log', label: 'Audit Log', roles: ['owner', 'hr'] },
  { to: '/admin/permissions', label: 'Permissions', roles: ['owner', 'hr'] },
  { to: '/admin/sessions', label: 'Session Management', roles: ['owner', 'hr'] },
  { to: '/admin/documents', label: 'Document Visibility', roles: ['owner', 'hr'] },
]

interface SearchResult {
  type: ResultType
  id: string
  title: string
  subtitle: string
  roleFilter?: UserRole[]
  /** For type 'page': direct link to app section */
  to?: string
}

export function GlobalSearch() {
  const { user } = useUser()
  const { documents } = useDocuments()
  const { submissions } = useFormSubmissions()
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | ResultType>('all')
  const [submitted, setSubmitted] = useState(false)
  const [incidents, setIncidents] = useState<{ id: string; title?: string; siteName?: string }[]>([])

  useEffect(() => {
    fetchIncidents().then((list) => setIncidents(Array.isArray(list) ? list : [])).catch(() => setIncidents([]))
  }, [])

  const results: SearchResult[] = []
  if (query.trim() && user) {
    const q = query.toLowerCase()
    if (typeFilter === 'all' || typeFilter === 'page') {
      APP_PAGES.filter((p) => !p.roles || p.roles.includes(user.role)).forEach((p) => {
        const labelLower = p.label.toLowerCase()
        const pathLower = p.to.toLowerCase().replace(/^\//, '').replace(/-/g, ' ')
        if (labelLower.includes(q) || pathLower.includes(q))
          results.push({ type: 'page', id: `page-${p.to}`, title: p.label, subtitle: 'App page', to: p.to })
      })
    }
    if (typeFilter === 'all' || typeFilter === 'document') {
      documents.forEach((d) => {
        if (!canUserViewDocument(d, user)) return
        if (d.name.toLowerCase().includes(q) || (d.siteName && d.siteName.toLowerCase().includes(q)))
          results.push({ type: 'document', id: d.id, title: d.name, subtitle: `${d.type} · ${d.date}`, roleFilter: d.roleRestricted })
      })
    }
    if (typeFilter === 'all' || typeFilter === 'submission') {
      submissions.forEach((f) => {
        if (f.templateName.toLowerCase().includes(q) || (f.siteName && f.siteName.toLowerCase().includes(q)))
          results.push({ type: 'submission', id: f.id, title: f.templateName, subtitle: `${f.status} · ${f.siteName || '—'}` })
      })
    }
    if (typeFilter === 'all' || typeFilter === 'incident') {
      incidents.forEach((i) => {
        const title = (i.title ?? '').toLowerCase()
        const siteName = (i.siteName ?? '').toLowerCase()
        if (title.includes(q) || siteName.includes(q))
          results.push({ type: 'incident', id: i.id, title: i.title ?? i.id, subtitle: i.siteName ?? '—' })
      })
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Search</h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">App pages, documents, submissions, and incidents. Results are filtered by your role.</p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <input
            type="search"
            placeholder="Search pages, documents, submissions, incidents..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full min-h-[48px] pl-4 pr-12 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500">
            <SearchIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTypeFilter(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${typeFilter === opt.value ? 'bg-brand-600 text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </form>

      {submitted && (
        <div className="space-y-2">
          {results.length === 0 ? (
            <Card padding="lg" className="text-center text-neutral-500 dark:text-neutral-400">No results for "{query}"</Card>
          ) : (
            results.map((r) => {
              const href = r.type === 'page' && r.to ? r.to : `/search/${r.type}/${r.id}`
              return (
                <Link key={`${r.type}-${r.id}`} to={href}>
                  <Card hover padding="md" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-white">{r.title}</p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">{r.subtitle} · {r.type}</p>
                    </div>
                  </Card>
                </Link>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
}
