import { Link } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useUser } from '@/contexts/UserContext'
import { usePinnedSafety } from '@/contexts/PinnedSafetyContext'
import type { UserRole } from '@/types'

type HubAction = { to: string; label: string; description: string; icon: string; roles?: UserRole[] }

/** Shared bulletin tiles — same for labourer, supervisor, HR, and owner. */
const ALL_ROLES: UserRole[] = ['owner', 'hr', 'supervisor', 'labourer']

const DOCUMENT_ACTIONS: HubAction[] = [
  { to: '/health-safety-manual', label: 'Health & Safety Manual', description: 'View uploaded health and safety manuals.', icon: '📘', roles: ALL_ROLES },
  { to: '/safety/sds', label: 'SDS', description: 'View and upload safety data sheets.', icon: '🧪', roles: ALL_ROLES },
  { to: '/sites', label: 'Job Sites', description: 'View site-level safety and job data.', icon: '📍', roles: ALL_ROLES },
  { to: '/safety/posters', label: 'Safety Posters', description: 'View posted safety posters and visual reminders.', icon: '🪧', roles: ALL_ROLES },
  { to: '/safety/alerts', label: 'Safety Alerts', description: 'View active safety alerts and bulletins.', icon: '📢', roles: ALL_ROLES },
  { to: '/safety/meeting-minutes', label: 'Meeting Minutes / Agendas', description: 'View uploaded meeting records.', icon: '🗒️', roles: ALL_ROLES },
]

export function SafetyHub() {
  const { user } = useUser()
  const { isPinned, togglePinned } = usePinnedSafety()
  const isHrView = user?.role === 'owner' || user?.role === 'hr'
  const visibleDocuments = DOCUMENT_ACTIONS.filter(
    (a) => !a.roles || (user?.role && a.roles.includes(user.role)),
  )
  const canPin = user?.role === 'owner' || user?.role === 'hr'
  const renderActionGrid = (actions: HubAction[]) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {actions.map((action) => {
        const to = action.to
        return (
          <Card key={action.label} hover padding="lg" className="h-full min-h-[200px] flex flex-col relative">
            {canPin && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); togglePinned(to, action.label) }}
                className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                aria-label={isPinned(to) ? 'Unpin from sidebar' : 'Pin to sidebar'}
                title={isPinned(to) ? 'Unpin from sidebar' : 'Pin to sidebar'}
              >
                {isPinned(to) ? (
                  <svg className="w-5 h-5 text-brand-600 dark:text-brand-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                )}
              </button>
            )}
            <Link to={to} className="flex flex-col flex-1 min-w-0">
              <span className="text-2xl mb-2 block">{action.icon}</span>
              <CardHeader className="p-0 pr-8">{action.label}</CardHeader>
              <CardDescription className="mt-1 flex-1">{action.description}</CardDescription>
              <Button variant="outline" size="sm" className="mt-3 w-fit">Open</Button>
            </Link>
          </Card>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-xl text-neutral-900 dark:text-white tracking-tight">Health & Safety</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">Bulletin board for safety documents, sites, alerts, and posters.</p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Health & Safety Documents</h2>
        {renderActionGrid(visibleDocuments)}
      </section>

      {isHrView ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">HR Management</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card hover padding="lg" className="h-full min-h-[180px] flex flex-col">
              <Link to="/library/upload-document" className="flex flex-col flex-1">
                <span className="text-2xl mb-2 block">🗂️</span>
                <CardHeader className="p-0">Upload / Update Documents</CardHeader>
                <CardDescription className="mt-1 flex-1">Publish latest manuals, SDS, meeting minutes, posters, and safety files.</CardDescription>
                <Button variant="outline" size="sm" className="mt-3 w-fit">Manage docs</Button>
              </Link>
            </Card>
            <Card hover padding="lg" className="h-full min-h-[180px] flex flex-col">
              <Link to="/safety/alerts" className="flex flex-col flex-1">
                <span className="text-2xl mb-2 block">📢</span>
                <CardHeader className="p-0">Edit Bulletin Board Alerts</CardHeader>
                <CardDescription className="mt-1 flex-1">Create, edit, and retire alerts that everyone sees on the bulletin board.</CardDescription>
                <Button variant="outline" size="sm" className="mt-3 w-fit">Manage alerts</Button>
              </Link>
            </Card>
          </div>
        </section>
      ) : null}

      <Card padding="md" className="bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>Compliance:</strong> Every form and report has an audit trail. Draft, submitted, approved, rejected, and archived states are clearly indicated. HR has final authority for approval and archival.
        </p>
      </Card>
    </div>
  )
}
