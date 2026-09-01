import { Link } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useUser } from '@/contexts/UserContext'
import { usePinnedSafety } from '@/contexts/PinnedSafetyContext'
import type { UserRole } from '@/types'

type HubAction = { to: string; label: string; description: string; icon: string; roles?: UserRole[] }

const COMPLETED_FORM_ACTIONS: HubAction[] = [
  { to: '/library?view=submissions&from=safety', label: 'All Form Submissions', description: 'View all submitted forms, including newly added templates.', icon: '📂', roles: ['owner', 'hr', 'supervisor', 'labourer'] },
  { to: '/library?view=submissions&from=safety&bucket=daily-hazard', label: 'Daily Hazard Assessments', description: 'View submitted daily hazard assessment forms.', icon: '📋', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=tool-box-talks', label: 'Tool Box Talks', description: 'View submitted toolbox talk forms.', icon: '🧰', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=weekly-inspections', label: 'Weekly Inspections', description: 'View weekly inspection submissions and results.', icon: '🗓️', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=equipment-inspections', label: 'Equipment Inspections', description: 'View equipment inspection submissions and files.', icon: '🛠️', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=fall-arrest', label: 'Fall Arrest', description: 'View fall arrest inspection submissions.', icon: '🦺', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=power-elevating', label: 'Power Elevating / Work Platforms', description: 'View power elevating work platform submissions.', icon: '🛗', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=washroom-inspections', label: 'Washroom Inspections', description: 'View washroom inspection submissions.', icon: '🚻', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=hot-work', label: 'Hot Works Permits', description: 'View hot work permit submissions.', icon: '🔥', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=incident-reports', label: 'Incident Reports', description: 'View and review incident submissions.', icon: '⚠️', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=hazard-reports', label: 'Hazard Reports', description: 'View and review hazard reports.', icon: '🚧', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=near-miss', label: 'Near Miss', description: 'View near miss form submissions.', icon: '📝', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=pressure-testing', label: 'Pressure Testing Checklist', description: 'View pressure testing checklist submissions.', icon: '🧪', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=active-pipeline-hydrocarbons', label: 'Active Pipeline Connections — Hydrocarbons', description: 'View active pipeline hydrocarbon connection submissions.', icon: '🛢️', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=drain-vent-test', label: 'Drain and Vent Test Form', description: 'View drain and vent test form submissions.', icon: '💨', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=notice-of-transmittal', label: 'Notice Of Transmittal', description: 'View notice of transmittal submissions.', icon: '📨', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=work-log', label: 'Work Log', description: 'View work log submissions.', icon: '🧾', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=underground-piping-inspection', label: 'Underground Piping Inspection', description: 'View underground piping inspection submissions.', icon: '🛠️', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=confined-spaces', label: 'Confined Spaces', description: 'View confined space form submissions.', icon: '🧱', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=investigation', label: 'Investigation Kit', description: 'View investigation kit submissions.', icon: '🔍', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=lockout-tagout', label: 'Lock-Out Tag-Out', description: 'View lock-out tag-out submissions.', icon: '🔒', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=compliance-evaluation', label: 'Compliance Evaluation', description: 'View compliance evaluation submissions.', icon: '✅', roles: ['owner', 'hr'] },
  { to: '/library?view=submissions&from=safety&bucket=other', label: 'Other Forms', description: 'View other completed forms.', icon: '📄', roles: ['owner', 'hr'] },
]

const DOCUMENT_ACTIONS: HubAction[] = [
  { to: '/health-safety-manual', label: 'Health & Safety Manual', description: 'View uploaded health and safety manuals.', icon: '📘', roles: ['owner', 'hr', 'supervisor', 'labourer'] },
  { to: '/certificates', label: 'Training & Certificates', description: 'View training records and certifications.', icon: '🎓', roles: ['owner', 'hr', 'supervisor'] },
  { to: '/safety/sds', label: 'SDS', description: 'View and upload safety data sheets.', icon: '🧪', roles: ['owner', 'hr', 'supervisor', 'labourer'] },
  { to: '/safety/analytics', label: 'Safety Analytics', description: 'View trends and analytics dashboards.', icon: '📊', roles: ['owner', 'hr'] },
  { to: '/sites', label: 'Job Sites', description: 'View site-level safety and job data.', icon: '📍', roles: ['owner', 'hr', 'supervisor'] },
  { to: '/safety/regulations', label: 'Regulatory Reference', description: 'View safety and regulatory reference information.', icon: '📖', roles: ['owner', 'hr'] },
  { to: '/safety/corrective-actions', label: 'Corrective Action Plans', description: 'View CAPA records and progress.', icon: '🛠️', roles: ['owner', 'hr'] },
  { to: '/safety/alerts', label: 'Safety Alerts', description: 'View active safety alerts and bulletins.', icon: '📢', roles: ['owner', 'hr', 'supervisor', 'labourer'] },
  { to: '/safety/meeting-minutes', label: 'Meeting Minutes / Agendas', description: 'View uploaded meeting records.', icon: '🗒️', roles: ['owner', 'hr', 'supervisor', 'labourer'] },
]

export function SafetyHub() {
  const { user } = useUser()
  const { isPinned, togglePinned } = usePinnedSafety()
  const isHrView = user?.role === 'owner' || user?.role === 'hr'
  const bulletinRole: UserRole | null = isHrView ? 'labourer' : (user?.role ?? null)
  const visibleCompletedForms = COMPLETED_FORM_ACTIONS.filter((a) => !a.roles || (bulletinRole && a.roles.includes(bulletinRole)))
  const visibleDocuments = DOCUMENT_ACTIONS.filter((a) => !a.roles || (bulletinRole && a.roles.includes(bulletinRole)))
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
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">This page is for viewing completed submissions and safety documents.</p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Completed Forms</h2>
        {renderActionGrid(visibleCompletedForms)}
      </section>

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
                <CardDescription className="mt-1 flex-1">Publish latest manuals, SDS, meeting minutes, and safety files.</CardDescription>
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
